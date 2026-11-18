import type { TransactionDraft } from "../../contracts/ledger";

export function transactionDraft(overrides: Partial<TransactionDraft> = {}): TransactionDraft {
  return {
    date: "2026-11-18",
    payee: "Corner Market",
    amountMinor: -1425,
    category: "Food",
    note: "Weekly groceries",
    ...overrides,
  };
}
