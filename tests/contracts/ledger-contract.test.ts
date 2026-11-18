import { describe, expect, it } from "vitest";
import type { LedgerApi } from "../../contracts/ledger";
import type { CsvDestination } from "../../domain/find";
import { memoryLedgerStore } from "../../domain/ledger";
import { nativeLedgerApi } from "../../electron/ledger-api";
import { mockLedgerApi } from "../../src/api";
import { transactionDraft } from "../fixtures/ledger";

const factories: readonly [LedgerApi["kind"], (pick: LedgerApi["pickCsv"], save: CsvDestination) => LedgerApi][] = [
  ["mock", mockLedgerApi], ["native", (pick, save) => nativeLedgerApi(memoryLedgerStore(), pick, save)],
];

describe.each(factories)("%s contract", (kind, create) => {
  it("labels its implementation and returns the same public transaction fields", async () => {
    let exported = "";
    const api = create(async () => null, async (_name, text) => { exported = text; return true; });
    expect(api.kind).toBe(kind);
    expect(await api.read()).toEqual({ currency: "USD", categories: [], transactions: [], rules: [], budgets: [], undoAction: null });
    const recorded = await api.commit({ type: "saveTransaction", transaction: transactionDraft({ payee: " Corner Market " }) });
    const category = recorded.categories[0];
    expect(category.name).toBe("Food");
    const entry = recorded.transactions[0];
    expect(entry).toEqual({ id: expect.any(String), date: "2026-11-18", payee: "Corner Market", amountMinor: -1425, categoryId: category.id, note: "Weekly groceries" });
    expect(await api.read()).toEqual(recorded);
    expect(await api.pickCsv()).toBeNull();
    expect(await api.exportCsv({ query: "market" })).toBe(1);
    expect(exported).toContain("Corner Market,-14.25,Food,Weekly groceries,USD");
    await expect(api.commit({ type: "deleteTransaction", id: "missing" })).rejects.toThrow(/no longer exists/);
    expect((await api.commit({ type: "deleteTransaction", id: entry.id })).transactions).toEqual([]);
  });
});
