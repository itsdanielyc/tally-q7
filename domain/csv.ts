import { CSV_DELIMITERS, type CsvDelimiter } from "../contracts/csv";
import { LedgerError } from "./validation";

export const MAX_CSV_BYTES = 16 * 1024 * 1024;
const HEADER_SAMPLE_RECORDS = 40;
const CONSISTENCY_SAMPLE_RECORDS = 8;
const MINIMUM_COLUMNS = 3;
const HEADER_ALIASES = {
  date: ["date", "transactiondate", "bookingdate", "bookedon", "posteddate", "valuedate", "postingdate", "transdate"],
  payee: ["payee", "merchant", "description", "name", "details", "transactiondescription", "counterparty", "memo"],
  amount: ["amount", "transactionamount", "signedamount", "value"],
  debit: ["debit", "withdrawal", "withdrawals", "moneyout", "paidout", "debitamount", "outflow"],
  credit: ["credit", "deposit", "deposits", "moneyin", "paidin", "creditamount", "inflow"],
} as const;

export interface CsvRecord {
  readonly line: number;
  readonly fields: readonly string[];
  readonly error?: string;
}

export interface DetectedCsv {
  readonly delimiter: CsvDelimiter;
  readonly headerLine: number;
  readonly columns: readonly string[];
}

export function decodeCsv(bytes: Uint8Array): string {
  if (bytes.length > MAX_CSV_BYTES) throw new LedgerError("Choose a CSV file of 16 MB or less.");
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return new TextDecoder("windows-1252").decode(bytes); }
}

// Time O(n), space O(n) including the returned fields, where n is the input read.
/** Scans logical records while retaining each record's physical starting line. */
export function parseCsv(text: string, delimiter: CsvDelimiter, limit = Infinity): CsvRecord[] {
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let error: string | undefined;
  let quoted = false;
  let closedQuote = false;
  let line = 1;
  let startLine = 1;

  function finishRecord(): void {
    fields.push(field);
    if (error || fields.length > 1 || field.trim() !== "") records.push({ line: startLine, fields, error });
    fields = [];
    field = "";
    error = undefined;
    closedQuote = false;
  }

  for (let cursor = text.charCodeAt(0) === 0xfeff ? 1 : 0; cursor < text.length; cursor++) {
    const char = text[cursor];
    const next = text[cursor + 1];
    const newline = char === "\n" || char === "\r";
    const crlf = char === "\r" && next === "\n";

    if (quoted) {
      if (char === '"' && next === '"') { field += '"'; cursor++; }
      else if (char === '"') { quoted = false; closedQuote = true; }
      else {
        field += crlf ? "\r\n" : char;
        if (newline) line++;
        if (crlf) cursor++;
      }
      continue;
    }
    if (newline) {
      finishRecord();
      if (records.length === limit) return records;
      startLine = ++line;
      if (crlf) cursor++;
    } else if (char === delimiter) {
      fields.push(field);
      field = "";
      closedQuote = false;
    } else if (char === '"' && !closedQuote && field === "") {
      quoted = true;
    } else if (char === '"' || (closedQuote && char.trim() !== "")) {
      error ??= "Unexpected character after or inside a quoted field.";
    } else if (!closedQuote) {
      field += char;
    }
  }
  if (quoted) error = "A quoted field has no closing quote.";
  finishRecord();
  return records;
}

export function suggestColumns(columns: readonly string[]) {
  const keys = columns.map((column) => column.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const index = (aliases: readonly string[]) => keys.findIndex((key) => aliases.includes(key));
  return {
    date: index(HEADER_ALIASES.date), payee: index(HEADER_ALIASES.payee), amount: index(HEADER_ALIASES.amount),
    debit: index(HEADER_ALIASES.debit), credit: index(HEADER_ALIASES.credit),
  };
}

// Time O(n) in the bounded header sample per supported separator, space O(n) for sampled records.
export function detectCsv(text: string, selectedDelimiter?: CsvDelimiter): DetectedCsv {
  if (text.length > MAX_CSV_BYTES) throw new LedgerError("Choose a CSV file of 16 MB or less.");
  const delimiters = selectedDelimiter ? [selectedDelimiter] : CSV_DELIMITERS;
  let best: { detected: DetectedCsv; score: number } | undefined;
  for (const delimiter of delimiters) {
    const records = parseCsv(text, delimiter, HEADER_SAMPLE_RECORDS);
    for (const [index, record] of records.entries()) {
      if (record.error || record.fields.length < MINIMUM_COLUMNS) continue;
      const columns = record.fields.map((value) => value.trim());
      if (columns.filter((value) => /\p{L}/u.test(value)).length < 2) continue;
      const aliases = Object.values(suggestColumns(columns)).filter((column) => column >= 0).length;
      const consistent = records.slice(index + 1, index + 1 + CONSISTENCY_SAMPLE_RECORDS)
        .filter((row) => !row.error && row.fields.length === columns.length).length;
      const score = aliases * HEADER_SAMPLE_RECORDS + consistent * 2 - index;
      if (!best || score > best.score) best = { detected: { delimiter, headerLine: record.line, columns }, score };
    }
  }
  if (!best) throw new LedgerError("Tally could not find a CSV header with at least three columns.");
  return best.detected;
}
