import { expect, it } from "vitest";
import { detectCsv } from "../../domain/csv";
import { createCsvExport, filterTransactions } from "../../domain/find";
import { createLedgerService, memoryLedgerStore } from "../../domain/ledger";
import { transactionDraft } from "../fixtures/ledger";

it("combines case-insensitive payee and note queries with inclusive category, date and amount bounds", async () => {
  const ledger = createLedgerService(memoryLedgerStore());
  for (const transaction of [
    transactionDraft({ payee: "Market", note: "Receipt", amountMinor: -1250 }),
    transactionDraft({ payee: "Bakery", note: "MARKET purchase", amountMinor: -1260 }),
    transactionDraft({ payee: "Cafe", note: "Lunch", amountMinor: -1250 }),
    transactionDraft({ payee: "Market travel", category: "Travel", amountMinor: -1250 }),
    transactionDraft({ payee: "Market earlier", date: "2026-11-17", amountMinor: -1250 }),
    transactionDraft({ payee: "Market expensive", amountMinor: -1261 }),
  ]) await ledger.commit({ type: "saveTransaction", transaction });
  const view = await ledger.read();
  expect(filterTransactions(view, { query: " market ", categoryId: view.categories[0].id, from: "2026-11-18", to: "2026-11-18", minMinor: -1260, maxMinor: -1250 })
    .map(({ payee }) => payee)).toEqual(["Bakery", "Market"]);
  expect(() => filterTransactions(view, { minMinor: 2, maxMinor: 1 })).toThrow(/minimum/);
});

it("round-trips filtered CSV with repeated entries, category, notes, and non-default currency", async () => {
  const source = createLedgerService(memoryLedgerStore());
  await source.commit({ type: "setCurrency", currency: "KWD" });
  const payee = 'Market, "North"';
  await source.commit({ type: "saveTransaction", transaction: transactionDraft({ payee, amountMinor: -2345, note: "line one\r\nline two" }) });
  await source.commit({ type: "saveTransaction", transaction: transactionDraft({ payee, amountMinor: -2345, note: "separate receipt", category: "Other" }) });
  await source.commit({ type: "saveTransaction", transaction: transactionDraft({ payee: "Exclude" }) });
  const exported = createCsvExport(await source.read(), { query: "market" });
  expect(exported.count).toBe(2);
  expect(exported.text).not.toContain("Exclude");
  const detected = detectCsv(exported.text);
  const csv = { text: exported.text, delimiter: detected.delimiter, headerLine: detected.headerLine, dateOrder: "MDY", mapping: { date: 0, payee: 1, amount: { kind: "signed", column: 2 } } } as const;
  const target = createLedgerService(memoryLedgerStore());
  const restored = await target.commit({ type: "importCsv", csv });
  expect(restored.currency).toBe("KWD");
  const comparable = (view: typeof restored) => filterTransactions(view, { query: "market" }).map(({ id: _id, categoryId, ...entry }) => ({ ...entry, category: view.categories.find(({ id }) => id === categoryId)?.name }));
  expect(comparable(restored)).toEqual(comparable(await source.read()));
  expect(await target.commit({ type: "importCsv", csv })).toEqual(restored);
  expect((await target.commit({ type: "undo" })).currency).toBe("USD");
  expect((await target.read()).transactions).toEqual([]);
});

it("undoes a deletion once and clears undo after a later successful mutation", async () => {
  const ledger = createLedgerService(memoryLedgerStore());
  const before = await ledger.commit({ type: "saveTransaction", transaction: transactionDraft() });
  const id = before.transactions[0].id;
  const deleted = await ledger.commit({ type: "deleteTransaction", id });
  expect(deleted.undoAction).toBe("deleteTransaction");
  await expect(ledger.commit({ type: "deleteTransaction", id: "missing" })).rejects.toThrow();
  expect(await ledger.commit({ type: "undo" })).toEqual(before);
  await expect(ledger.commit({ type: "undo" })).rejects.toThrow(/nothing to undo/i);
  await ledger.commit({ type: "deleteTransaction", id });
  await ledger.commit({ type: "saveCategory", name: "Other" });
  expect((await ledger.read()).undoAction).toBeNull();
});
