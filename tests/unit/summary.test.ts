import { expect, it } from "vitest";
import { createLedgerService, memoryLedgerStore } from "../../domain/ledger";
import { monthSummary, moveMonth } from "../../domain/summary";
import { transactionDraft } from "../fixtures/ledger";

it("groups exact integer totals at month boundaries, including uncategorised entries", async () => {
  const ledger = createLedgerService(memoryLedgerStore());
  const max = Number.MAX_SAFE_INTEGER;
  for (const transaction of [
    transactionDraft({ date: "2026-11-01", amountMinor: max, category: "" }),
    transactionDraft({ date: "2026-11-30", amountMinor: max, category: "" }),
    transactionDraft({ date: "2026-11-15", amountMinor: -1 }),
    transactionDraft({ date: "2026-12-01", amountMinor: -500 }),
  ]) await ledger.commit({ type: "saveTransaction", transaction });
  const summary = monthSummary(await ledger.read(), "2026-11");
  expect(summary).toMatchObject({ income: 18_014_398_509_481_982n, spending: 1n, balance: 18_014_398_509_481_981n });
  expect(summary.categories).toMatchObject([{ name: "Food", income: 0n, spending: 1n }, { name: "Uncategorised", income: 18_014_398_509_481_982n, spending: 0n }]);
  expect(moveMonth("2026-12", 1)).toBe("2027-01");
  expect(moveMonth("2026-01", -1)).toBe("2025-12");
  expect(moveMonth("0001-01", -1)).toBe("0001-01");
});

it("keeps independent monthly budgets and moves only non-conflicting budgets on a merge", async () => {
  const ledger = createLedgerService(memoryLedgerStore());
  const created = await ledger.commit({ type: "saveTransaction", transaction: transactionDraft({ amountMinor: -1_425 }) });
  const { id: source } = created.categories[0];
  const target = (await ledger.commit({ type: "saveCategory", name: "Other" })).categories[1].id;
  for (const [categoryId, month, amountMinor] of [[source, "2026-11", 1_000], [target, "2026-11", 2_000], [source, "2026-12", 4_000]] as const) {
    await ledger.commit({ type: "setBudget", categoryId, month, amountMinor });
  }
  await expect(ledger.commit({ type: "setBudget", categoryId: source, month: "2026-11", amountMinor: -1 })).rejects.toThrow(/negative/);
  expect(monthSummary(await ledger.read(), "2026-11").categories[0]).toMatchObject({ budget: 1000, remaining: -425n });
  const merged = await ledger.commit({ type: "mergeCategories", id: source, targetId: target });
  expect(monthSummary(merged, "2026-11").categories[0]).toMatchObject({ budget: 2000, remaining: 575n });
  expect(monthSummary(merged, "2026-12").categories[0]).toMatchObject({ budget: 4000, remaining: 4000n });
  expect((await ledger.commit({ type: "deleteCategory", id: target })).budgets).toEqual([]);
});
