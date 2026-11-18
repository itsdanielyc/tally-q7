import { describe, expect, it } from "vitest";
import { memoryLedgerStore } from "../../domain/ledger";
import { nativeLedgerApi } from "../../electron/ledger-api";
import { mockLedgerApi } from "../../src/api";
import { transactionDraft } from "../fixtures/ledger";

describe.each([mockLedgerApi(), nativeLedgerApi(memoryLedgerStore())])("$kind contract", (api) => {
  it("labels its implementation and returns the same public transaction fields", async () => {
    expect(["native", "mock"]).toContain(api.kind);
    expect(await api.read()).toEqual({ currency: "USD", categories: [], transactions: [] });
    const recorded = await api.commit({ type: "saveTransaction", transaction: transactionDraft({ payee: " Corner Market " }) });
    const category = recorded.categories[0];
    expect(category.name).toBe("Food");
    const entry = recorded.transactions[0];
    expect(entry).toEqual({ id: expect.any(String), date: "2026-11-18", payee: "Corner Market", amountMinor: -1425, categoryId: category.id, note: "Weekly groceries" });
    expect(await api.read()).toEqual(recorded);
    await expect(api.commit({ type: "deleteTransaction", id: "missing" })).rejects.toThrow(/no longer exists/);
    expect((await api.commit({ type: "deleteTransaction", id: entry.id })).transactions).toEqual([]);
  });
});
