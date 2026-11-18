import { describe, expect, it } from "vitest";
import { createLedgerService, memoryLedgerStore } from "../../domain/ledger";
import { formatAmount, parseAmount } from "../../domain/money";
import { transactionDraft } from "../fixtures/ledger";

describe("transaction amounts", () => {
  it("uses the selected currency's minor units exactly", () => {
    expect(parseAmount("-0.01", "USD")).toBe(-1);
    expect(parseAmount("12.345", "KWD")).toBe(12345);
    expect(formatAmount(Number.MAX_SAFE_INTEGER, "USD")).toBe("90071992547409.91");
    expect(() => parseAmount("0.01", "JPY")).toThrow(/whole/);
    expect(() => parseAmount("90071992547409.92", "USD")).toThrow(/too large/);
  });
});

describe("recording transactions", () => {
  it("rejects invalid calendar dates and fractional minor units", async () => {
    const ledger = createLedgerService(memoryLedgerStore());
    await expect(ledger.commit({ type: "saveTransaction", transaction: transactionDraft({ date: "2025-02-29" }) })).rejects.toThrow(/date/);
    await expect(ledger.commit({ type: "saveTransaction", transaction: transactionDraft({ amountMinor: 1.5 }) })).rejects.toThrow(/minor units/);
    expect((await ledger.read()).transactions).toEqual([]);
  });

  it("keeps newest dates first across concurrent writes and edits", async () => {
    const ledger = createLedgerService(memoryLedgerStore());
    await Promise.all([
      ledger.commit({ type: "saveTransaction", transaction: transactionDraft({ date: "2026-11-18", payee: "Later" }) }),
      ledger.commit({ type: "saveTransaction", transaction: transactionDraft({ date: "2026-11-01", payee: "Earlier" }) }),
    ]);
    const { transactions } = await ledger.read();
    expect(transactions.map(({ payee }) => payee)).toEqual(["Later", "Earlier"]);
    const edited = await ledger.commit({ type: "saveTransaction", id: transactions[1].id, transaction: transactionDraft({ date: "2026-11-19", payee: "Moved" }) });
    expect(edited.transactions.map(({ payee }) => payee)).toEqual(["Moved", "Later"]);
  });

  it("keeps existing minor units tied to their original currency", async () => {
    const ledger = createLedgerService(memoryLedgerStore());
    expect((await ledger.commit({ type: "setCurrency", currency: "JPY" })).currency).toBe("JPY");
    await ledger.commit({ type: "saveTransaction", transaction: transactionDraft() });
    await expect(ledger.commit({ type: "setCurrency", currency: "USD" })).rejects.toThrow(/empty/);
    expect((await ledger.read()).currency).toBe("JPY");
  });
});
