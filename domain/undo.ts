import type { Category, MonthlyBudget, PayeeRule, Transaction } from "../contracts/ledger";
import type { LedgerDocument } from "./ledger";
import { LedgerError } from "./validation";

export type UndoRecord =
  | { readonly action: "deleteTransaction"; readonly index: number; readonly transaction: Transaction }
  | { readonly action: "deleteCategory" | "mergeCategories"; readonly index: number; readonly category: Category; readonly affectedTransactionIds: readonly string[]; readonly rules: readonly PayeeRule[]; readonly budgets: readonly MonthlyBudget[] }
  | { readonly action: "deleteRule"; readonly index: number; readonly rule: PayeeRule }
  | { readonly action: "importCsv"; readonly transactionIds: readonly string[]; readonly categoryIds: readonly string[]; readonly currency: string };

function restoreAt<T>(list: readonly T[], index: number, entry: T): T[] {
  const restored = list.slice();
  restored.splice(index, 0, entry);
  return restored;
}

/** Reverses a single persisted change without keeping a second copy of the ledger. */
export function undoChange(document: LedgerDocument): LedgerDocument {
  const record = document.undo;
  if (!record) throw new LedgerError("There is nothing to undo.");
  const restored = { ...document, undo: null };
  switch (record.action) {
    case "deleteTransaction": return { ...restored, transactions: restoreAt(document.transactions, record.index, record.transaction) };
    case "deleteRule": return { ...restored, rules: restoreAt(document.rules, record.index, record.rule) };
    case "deleteCategory": case "mergeCategories": {
      const affected = new Set(record.affectedTransactionIds);
      return {
        ...restored,
        categories: restoreAt(document.categories, record.index, record.category),
        transactions: document.transactions.map((entry) => affected.has(entry.id) ? { ...entry, categoryId: record.category.id } : entry),
        rules: record.rules, budgets: record.budgets,
      };
    }
    case "importCsv": {
      const transactions = new Set(record.transactionIds);
      const categories = new Set(record.categoryIds);
      return {
        ...restored, currency: record.currency,
        transactions: document.transactions.filter(({ id }) => !transactions.has(id)),
        categories: document.categories.filter(({ id }) => !categories.has(id)),
      };
    }
  }
}
