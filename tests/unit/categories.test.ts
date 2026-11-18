import { expect, it } from "vitest";
import { createLedgerService, memoryLedgerStore } from "../../domain/ledger";
import { transactionDraft } from "../fixtures/ledger";

it("renames, merges and deletes categories without losing the transactions", async () => {
  const ledger = createLedgerService(memoryLedgerStore());
  const initial = await ledger.commit({ type: "saveTransaction", transaction: transactionDraft() });
  const source = initial.categories[0].id;
  const renamed = await ledger.commit({ type: "saveCategory", id: source, name: "Groceries" });
  expect(renamed.categories).toEqual([{ id: source, name: "Groceries" }]);
  expect(renamed.transactions[0].categoryId).toBe(source);
  await expect(ledger.commit({ type: "saveCategory", name: " groceries " })).rejects.toThrow(/already exists/);
  const created = await ledger.commit({ type: "saveCategory", name: "Essentials" });
  const target = created.categories[1].id;
  await ledger.commit({ type: "addRule", contains: "market", categoryId: source });
  const merged = await ledger.commit({ type: "mergeCategories", id: source, targetId: target });
  expect(merged.transactions[0].categoryId).toBe(target);
  expect(merged.rules[0].categoryId).toBe(target);
  const removed = await ledger.commit({ type: "deleteCategory", id: target });
  expect(removed.transactions[0]).toMatchObject({ categoryId: null, payee: "Corner Market" });
  expect(removed.categories).toEqual([]);
  expect(removed.rules).toEqual([]);
});

it("applies the earliest matching rule to imports and uncategorised entries only", async () => {
  const ledger = createLedgerService(memoryLedgerStore());
  await ledger.commit({ type: "saveCategory", name: "Food" });
  const { categories: [food, other] } = await ledger.commit({ type: "saveCategory", name: "Other" });
  await ledger.commit({ type: "addRule", contains: " MARKET ", categoryId: food.id });
  await ledger.commit({ type: "addRule", contains: "market", categoryId: other.id });
  await ledger.commit({ type: "saveTransaction", transaction: transactionDraft({ payee: "Manual market", category: "Other" }) });
  await ledger.commit({ type: "saveTransaction", transaction: transactionDraft({ payee: "Unsorted MARKET", category: "" }) });
  const imported = await ledger.commit({ type: "importCsv", csv: {
    text: "Date,Payee,Amount\n2026-11-18,Market import,-5.00",
    delimiter: ",", headerLine: 1, dateOrder: "YMD", mapping: { date: 0, payee: 1, amount: { kind: "signed", column: 2 } },
  } });
  expect(imported.transactions.find(({ payee }) => payee === "Market import")?.categoryId).toBe(food.id);
  const applied = await ledger.commit({ type: "applyRules" });
  expect(Object.fromEntries(applied.transactions.map(({ payee, categoryId }) => [payee, categoryId]))).toEqual({
    "Manual market": other.id, "Unsorted MARKET": food.id, "Market import": food.id,
  });
  const removed = await ledger.commit({ type: "deleteRule", id: applied.rules[0].id });
  expect(removed.rules).toHaveLength(1);
});
