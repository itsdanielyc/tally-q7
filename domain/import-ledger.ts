import { CSV_DELIMITERS, DATE_ORDERS, TALLY_CSV_COLUMNS, TALLY_CSV_HEADERS, type AmountMapping, type CsvImportRequest, type DateOrder } from "../contracts/csv";
import type { LedgerView, TransactionDraft } from "../contracts/ledger";
import { requireDate } from "./calendar";
import { categoryKey, ruleMatcher } from "./categories";
import { parseCsv, type CsvRecord } from "./csv";
import { CURRENCIES, minorDigits, parseAmount, requireCurrency } from "./money";
import { LedgerError, requireRecord, requireText } from "./validation";

const SEPARATED_DATE = /^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/;
const DIGITS = /^\d+$/;
const GROUPS = /^\d{1,3}(?:[.,]\d{3})+$/;
const CENTURY_PIVOT = 70;

export interface ImportPreview {
  readonly currency: string;
  readonly rows: readonly { readonly line: number; readonly transaction: TransactionDraft; readonly categoryId: string | null }[];
  readonly errors: readonly { readonly line: number; readonly reason: string }[];
  readonly duplicates: number;
}

type ImportLedger = Pick<LedgerView, "currency" | "categories" | "transactions" | "rules" | "budgets">;

function isTallyExport(header: readonly string[], request: CsvImportRequest): boolean {
  const { date, payee, amount } = request.mapping;
  return request.delimiter === "," && header.length === TALLY_CSV_HEADERS.length &&
    header.every((value, index) => value === TALLY_CSV_HEADERS[index]) &&
    date === TALLY_CSV_COLUMNS.date && payee === TALLY_CSV_COLUMNS.payee &&
    amount.kind === "signed" && amount.column === TALLY_CSV_COLUMNS.amount;
}

function importCurrency(ledger: ImportLedger, records: readonly CsvRecord[], headerIndex: number): string {
  if (ledger.transactions.length > 0 || ledger.budgets.length > 0) return ledger.currency;
  for (let index = headerIndex + 1; index < records.length; index++) {
    const { fields, error } = records[index];
    const currency = fields[TALLY_CSV_COLUMNS.currency];
    if (!error && fields.length === TALLY_CSV_HEADERS.length && CURRENCIES.includes(currency)) return currency;
  }
  return ledger.currency;
}

function bankDate(value: string, order: DateOrder): string {
  const match = SEPARATED_DATE.exec(value.trim());
  if (!match) throw new LedgerError("Enter a valid date.");
  const [, first, second, third] = match;
  const sequence = first.length === 4 ? "YMD" : order;
  const parts = [first, second, third];
  const yearText = parts[sequence.indexOf("Y")];
  const shortYear = Number(yearText);
  const year = yearText.length === 2 ? String(shortYear + (shortYear < CENTURY_PIVOT ? 2_000 : 1_900)) : yearText;
  return requireDate(`${year}-${parts[sequence.indexOf("M")].padStart(2, "0")}-${parts[sequence.indexOf("D")].padStart(2, "0")}`);
}

function bankAmount(value: string, currency: string): number {
  let cleaned = value.trim().replace(/[\p{Sc}\s']/gu, "").replace("−", "-");
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) cleaned = `-${cleaned.slice(1, -1)}`;
  const negative = cleaned.startsWith("-");
  const magnitude = cleaned.replace(/^[+-]/, "");
  if (DIGITS.test(magnitude)) return parseAmount(cleaned, currency);

  const lastDot = magnitude.lastIndexOf(".");
  const lastComma = magnitude.lastIndexOf(",");
  const lastSeparator = Math.max(lastDot, lastComma);
  if (lastSeparator < 0) throw new LedgerError("Enter a valid amount.");
  const separator = magnitude[lastSeparator];
  const integer = magnitude.slice(0, lastSeparator);
  const fraction = magnitude.slice(lastSeparator + 1);
  const suffixLength = fraction.length;
  const digits = minorDigits(currency);
  let decimal: string;
  if (lastDot >= 0 && lastComma >= 0) {
    if (!GROUPS.test(integer) || integer.includes(separator)) throw new LedgerError("Invalid grouping in amount.");
    decimal = `${integer.replace(/[.,]/g, "")}.${fraction}`;
  } else if (GROUPS.test(magnitude) && (integer.includes(separator) || suffixLength > digits)) {
    decimal = magnitude.replace(/[.,]/g, "");
  } else {
    decimal = `${integer || "0"}.${fraction}`;
  }
  return parseAmount(`${negative ? "-" : ""}${decimal}`, currency);
}

function mappedAmount(fields: readonly string[], mapping: AmountMapping, currency: string): number {
  if (mapping.kind === "signed") return bankAmount(fields[mapping.column], currency);
  const debitText = fields[mapping.debit].trim();
  const creditText = fields[mapping.credit].trim();
  if (!debitText && !creditText) throw new LedgerError("Debit and credit are both empty.");
  const debit = debitText ? Math.abs(bankAmount(debitText, currency)) : 0;
  const credit = creditText ? Math.abs(bankAmount(creditText, currency)) : 0;
  if (debit && credit) throw new LedgerError("Both debit and credit are nonzero.");
  return credit - debit;
}

function transactionKey({ date, payee, amountMinor }: Pick<TransactionDraft, "date" | "payee" | "amountMinor">): string {
  return JSON.stringify([date, amountMinor, payee]);
}

// Time O(c + n + k), space O(c + n + k), for CSV characters c, current entries n and parsed rows k.
/** Uses the same mapping and duplicate screen for the preview and the commit. */
export function previewImport(ledger: ImportLedger, request: CsvImportRequest): ImportPreview {
  requireRecord(request, "CSV import");
  const text = requireText(request.text, "CSV data");
  if (!CSV_DELIMITERS.includes(request.delimiter) || !DATE_ORDERS.includes(request.dateOrder)) throw new LedgerError("Choose a separator and date order.");
  const mapping = request.mapping;
  requireRecord(mapping, "Column mapping");
  requireRecord(mapping.amount, "Amount mapping");
  const records = parseCsv(text, request.delimiter);
  const headerIndex = records.findIndex((row) => row.line === request.headerLine && !row.error);
  if (headerIndex < 0) throw new LedgerError("Choose a valid header row.");
  const header = records[headerIndex].fields;
  const width = header.length;
  const columns = [mapping.date, mapping.payee];
  if (mapping.amount.kind === "signed") columns.push(mapping.amount.column);
  else if (mapping.amount.kind === "split") columns.push(mapping.amount.debit, mapping.amount.credit);
  else throw new LedgerError("Choose an amount layout.");
  if (columns.some((column) => !Number.isInteger(column) || column < 0 || column >= width)) throw new LedgerError("Map date, payee and amount columns.");
  if (new Set(columns).size !== columns.length) throw new LedgerError("Choose distinct columns for each field.");

  const tallyExport = isTallyExport(header, request);
  const currency = tallyExport ? importCurrency(ledger, records, headerIndex) : ledger.currency;
  const seen = new Set(ledger.transactions.map(transactionKey));
  const matchCategory = ruleMatcher(ledger.rules);
  const categoryIds = new Map(ledger.categories.map(({ name, id }) => [categoryKey(name), id]));
  const rows: { line: number; transaction: TransactionDraft; categoryId: string | null }[] = [];
  const errors: { line: number; reason: string }[] = [];
  let duplicates = 0;
  for (let index = headerIndex + 1; index < records.length; index++) {
    const { line, fields, error } = records[index];
    try {
      if (error) throw new LedgerError(error);
      if (fields.length !== width) throw new LedgerError(`Expected ${width} columns but found ${fields.length}.`);
      if (tallyExport && requireCurrency(fields[TALLY_CSV_COLUMNS.currency]) !== currency) {
        throw new LedgerError(`The row currency must be ${currency}.`);
      }
      const payee = requireText(fields[mapping.payee], "a payee");
      const transaction = {
        date: bankDate(fields[mapping.date], request.dateOrder),
        payee: tallyExport ? payee : payee.trim(),
        amountMinor: tallyExport ? parseAmount(fields[TALLY_CSV_COLUMNS.amount], currency) : mappedAmount(fields, mapping.amount, currency),
        category: tallyExport ? fields[TALLY_CSV_COLUMNS.category] : "",
        note: tallyExport ? fields[TALLY_CSV_COLUMNS.note] : "",
      };
      const key = transactionKey(transaction);
      if (seen.has(key)) { duplicates++; continue; }
      // Our own export can contain intentional repetitions, which must survive a fresh import.
      if (!tallyExport) seen.add(key);
      const categoryId = tallyExport ? categoryIds.get(categoryKey(transaction.category)) ?? null : matchCategory(transaction.payee);
      rows.push({ line, transaction, categoryId });
    } catch (error) {
      if (!(error instanceof LedgerError)) throw error;
      errors.push({ line, reason: error.message });
    }
  }
  return { currency, rows, errors, duplicates };
}
