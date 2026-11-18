import { DEFAULT_EXPORT_NAME, TALLY_CSV_HEADERS } from "../contracts/csv";
import type { LedgerApi, LedgerOperations, LedgerView, Transaction, TransactionFilters } from "../contracts/ledger";
import { requireDate } from "./calendar";
import { formatAmount } from "./money";
import { LedgerError, requireMinorUnits, requireRecord, requireText } from "./validation";

function optionalDate(value: string | undefined): string | undefined {
  return value === undefined ? undefined : requireDate(value);
}

function optionalAmount(value: number | undefined): number | undefined {
  return value === undefined ? undefined : requireMinorUnits(value);
}

// Time O(n) plus case folding and substring searches of matching text; space O(n) for the result.
/** Applies the same inclusive predicates to the ledger table and exported rows. */
export function filterTransactions(ledger: LedgerView, filters: TransactionFilters): readonly Transaction[] {
  requireRecord(filters, "Filters");
  const query = requireText(filters.query ?? "", "Search", true).trim().toLocaleLowerCase("en");
  const { categoryId } = filters;
  if (categoryId !== undefined && categoryId !== null) requireText(categoryId, "a category ID");
  const from = optionalDate(filters.from);
  const to = optionalDate(filters.to);
  const min = optionalAmount(filters.minMinor);
  const max = optionalAmount(filters.maxMinor);
  if (from && to && from > to) throw new LedgerError("The from date must come before or equal the to date.");
  if (min !== undefined && max !== undefined && min > max) throw new LedgerError("The minimum amount must be at most the maximum amount.");
  if (!query && categoryId === undefined && !from && !to && min === undefined && max === undefined) return ledger.transactions;

  return ledger.transactions.filter((entry) => {
    if (categoryId !== undefined && entry.categoryId !== categoryId) return false;
    if (from && entry.date < from || to && entry.date > to) return false;
    if (min !== undefined && entry.amountMinor < min || max !== undefined && entry.amountMinor > max) return false;
    return !query || entry.payee.toLocaleLowerCase("en").includes(query) || entry.note.toLocaleLowerCase("en").includes(query);
  });
}

function quoteCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function createCsvExport(ledger: LedgerView, filters: TransactionFilters): { text: string; count: number } {
  const transactions = filterTransactions(ledger, filters);
  const categories = new Map(ledger.categories.map(({ id, name }) => [id, name]));
  const records = [TALLY_CSV_HEADERS.join(",")];
  for (const entry of transactions) {
    records.push([
      entry.date, entry.payee, formatAmount(entry.amountMinor, ledger.currency),
      categories.get(entry.categoryId ?? "") ?? "", entry.note, ledger.currency,
    ].map(quoteCsv).join(","));
  }
  return { text: `\uFEFF${records.join("\r\n")}\r\n`, count: transactions.length };
}

export type CsvDestination = (name: string, text: string) => Promise<boolean>;

/** Adapts an export to the platform's save operation and reports cancellation separately. */
export function exportThrough(read: LedgerOperations["read"], save: CsvDestination): LedgerApi["exportCsv"] {
  return async (filters) => {
    const { text, count } = createCsvExport(await read(), filters);
    return await save(DEFAULT_EXPORT_NAME, text) ? count : null;
  };
}
