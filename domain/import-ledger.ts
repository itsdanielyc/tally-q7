import { CSV_DELIMITERS, DATE_ORDERS, type AmountMapping, type CsvImportRequest, type DateOrder } from "../contracts/csv";
import type { LedgerView, TransactionDraft } from "../contracts/ledger";
import { requireDate } from "./calendar";
import { ruleMatcher } from "./categories";
import { MAX_CSV_BYTES, parseCsv } from "./csv";
import { minorDigits, parseAmount } from "./money";
import { LedgerError, requireRecord, requireText } from "./validation";

const SEPARATED_DATE = /^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/;
const DIGITS = /^\d+$/;
const GROUPS = /^\d{1,3}(?:[.,]\d{3})+$/;
const CENTURY_PIVOT = 70;

export interface ImportPreview {
  readonly rows: readonly { readonly line: number; readonly transaction: TransactionDraft; readonly categoryId: string | null }[];
  readonly errors: readonly { readonly line: number; readonly reason: string }[];
  readonly duplicates: number;
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
export function previewImport(ledger: LedgerView, request: CsvImportRequest): ImportPreview {
  requireRecord(request, "CSV import");
  const text = requireText(request.text, "CSV data");
  if (text.length > MAX_CSV_BYTES) throw new LedgerError("Choose a CSV file of 16 MB or less.");
  if (!CSV_DELIMITERS.includes(request.delimiter) || !DATE_ORDERS.includes(request.dateOrder)) throw new LedgerError("Choose a separator and date order.");
  const mapping = request.mapping;
  requireRecord(mapping, "Column mapping");
  requireRecord(mapping.amount, "Amount mapping");
  const records = parseCsv(text, request.delimiter);
  const headerIndex = records.findIndex((row) => row.line === request.headerLine && !row.error);
  if (headerIndex < 0) throw new LedgerError("Choose a valid header row.");
  const width = records[headerIndex].fields.length;
  const columns = [mapping.date, mapping.payee];
  if (mapping.amount.kind === "signed") columns.push(mapping.amount.column);
  else if (mapping.amount.kind === "split") columns.push(mapping.amount.debit, mapping.amount.credit);
  else throw new LedgerError("Choose an amount layout.");
  if (columns.some((column) => !Number.isInteger(column) || column < 0 || column >= width)) throw new LedgerError("Map date, payee and amount columns.");
  if (new Set(columns).size !== columns.length) throw new LedgerError("Choose distinct columns for each field.");

  const seen = new Set(ledger.transactions.map(transactionKey));
  const matchCategory = ruleMatcher(ledger.rules);
  const rows: { line: number; transaction: TransactionDraft; categoryId: string | null }[] = [];
  const errors: { line: number; reason: string }[] = [];
  let duplicates = 0;
  for (let index = headerIndex + 1; index < records.length; index++) {
    const { line, fields, error } = records[index];
    try {
      if (error) throw new LedgerError(error);
      if (fields.length !== width) throw new LedgerError(`Expected ${width} columns but found ${fields.length}.`);
      const transaction = {
        date: bankDate(fields[mapping.date], request.dateOrder),
        payee: requireText(fields[mapping.payee], "a payee").trim(),
        amountMinor: mappedAmount(fields, mapping.amount, ledger.currency),
        category: "", note: "",
      };
      const key = transactionKey(transaction);
      if (seen.has(key)) { duplicates++; continue; }
      seen.add(key);
      rows.push({ line, transaction, categoryId: matchCategory(transaction.payee) });
    } catch (error) {
      if (!(error instanceof LedgerError)) throw error;
      errors.push({ line, reason: error.message });
    }
  }
  return { rows, errors, duplicates };
}
