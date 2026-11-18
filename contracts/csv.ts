export const CSV_DELIMITERS = [",", ";", "\t", "|"] as const;
export const DATE_ORDERS = ["MDY", "DMY", "YMD"] as const;

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
