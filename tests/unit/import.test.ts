import { expect, it } from "vitest";
import { detectCsv, parseCsv } from "../../domain/csv";
import { previewImport } from "../../domain/import-ledger";
import { emptyLedger } from "../../domain/ledger";
import { BANK_CSV } from "../fixtures/csv";

it("detects a preamble, delimiter and multiline quoted records", () => {
  expect(detectCsv(BANK_CSV)).toMatchObject({ delimiter: ";", headerLine: 2, columns: ["Date", "Description", "Debit", "Credit"] });
  expect(parseCsv(BANK_CSV, ";").find(({ line }) => line === 5)?.fields).toEqual(["19/11/2026", "Payroll\r\nweekly", "", "1.234,56"]);
  expect(parseCsv('A,B,C\n"unfinished,B,C', ",")[1]).toMatchObject({ line: 2, error: expect.stringMatching(/quote/) });
});

it("normalises debit and credit columns, reports invalid lines and counts duplicates", () => {
  const preview = previewImport(emptyLedger(), {
    text: BANK_CSV, delimiter: ";", headerLine: 2, dateOrder: "DMY",
    mapping: { date: 0, payee: 1, amount: { kind: "split", debit: 2, credit: 3 } },
  });
  expect(preview.rows.map(({ line, transaction }) => [line, transaction.date, transaction.payee, transaction.amountMinor])).toEqual([
    [3, "2026-11-18", "Market; downtown", -1234], [5, "2026-11-19", "Payroll\r\nweekly", 123456],
  ]);
  expect(preview.errors).toEqual([{ line: 4, reason: expect.stringMatching(/date/) }]);
  expect(preview.duplicates).toBe(1);
});

it("uses a selected date order for signed amounts and rejects overlapping columns", () => {
  const request = { text: 'Date,Payee,Amount\n04/05/26,"Shop ""North""",(12.30)\n', delimiter: ",", headerLine: 1, dateOrder: "MDY", mapping: { date: 0, payee: 1, amount: { kind: "signed", column: 2 } } } as const;
  expect(previewImport(emptyLedger(), request).rows[0].transaction).toMatchObject({ date: "2026-04-05", payee: 'Shop "North"', amountMinor: -1230 });
  expect(previewImport(emptyLedger(), { ...request, dateOrder: "DMY" }).rows[0].transaction.date).toBe("2026-05-04");
  expect(() => previewImport(emptyLedger(), { ...request, mapping: { ...request.mapping, payee: 0 } })).toThrow(/distinct/);
});
