export const CSV_DELIMITERS = [",", ";", "\t", "|"] as const;
export const DATE_ORDERS = ["MDY", "DMY", "YMD"] as const;
export const TALLY_CSV_COLUMNS = { date: 0, payee: 1, amount: 2, category: 3, note: 4, currency: 5 } as const;
export const TALLY_CSV_HEADERS = ["Date", "Payee", "Amount", "Category", "Note", "Tally currency"] as const;
export const DEFAULT_EXPORT_NAME = "tally-transactions.csv";

export type CsvDelimiter = typeof CSV_DELIMITERS[number];
export type DateOrder = typeof DATE_ORDERS[number];

export interface CsvFile {
  readonly name: string;
  readonly text: string;
}

export type AmountMapping =
  | { readonly kind: "signed"; readonly column: number }
  | { readonly kind: "split"; readonly debit: number; readonly credit: number };

export interface CsvImportRequest {
  readonly text: string;
  readonly delimiter: CsvDelimiter;
  readonly headerLine: number;
  readonly dateOrder: DateOrder;
  readonly mapping: { readonly date: number; readonly payee: number; readonly amount: AmountMapping };
}
