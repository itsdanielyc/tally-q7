import type { Category, MonthlyBudget, PayeeRule, Transaction } from "../contracts/ledger";
import { requireDate } from "./calendar";
import { categoryKey } from "./categories";
import { compareDatesNewestFirst, SCHEMA_VERSION, type LedgerDocument } from "./ledger";
import { requireCurrency } from "./money";
import { requireMonth } from "./summary";
import type { UndoRecord } from "./undo";
import { LedgerError, requireMinorUnits, requireRecord, requireText } from "./validation";

function requireList(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new LedgerError(`${label} must be a list.`);
  return value;
}

function readTransaction(value: unknown, categoryId: string | null, legacy = false): Transaction {
  const transaction = requireRecord(value, "Transaction");
  return {
    id: requireText(transaction.id, "a transaction ID"),
    date: requireDate(transaction.date),
    payee: requireText(transaction.payee, "a payee"),
    amountMinor: requireMinorUnits(legacy ? transaction.amount : transaction.amountMinor),
    categoryId,
    note: requireText(legacy ? transaction.note ?? "" : transaction.note, "Note", true),
  };
}

function readCategory(value: unknown): Category {
  const category = requireRecord(value, "Category");
  return { id: requireText(category.id, "a category ID"), name: requireText(category.name, "a category name") };
}

function readRule(value: unknown, categoryIds: ReadonlySet<string>): PayeeRule {
  const rule = requireRecord(value, "Rule");
  const categoryId = requireText(rule.categoryId, "a category ID");
  if (!categoryIds.has(categoryId)) throw new LedgerError("Invalid rule reference.");
  return { id: requireText(rule.id, "a rule ID"), categoryId, contains: requireText(rule.contains, "payee text") };
}

function readRules(value: unknown, categoryIds: ReadonlySet<string>): PayeeRule[] {
  const ids = new Set<string>();
  return requireList(value, "Rules").map((record) => {
    const rule = readRule(record, categoryIds);
    if (ids.has(rule.id)) throw new LedgerError("Duplicate rule ID.");
    ids.add(rule.id);
    return rule;
  });
}

function readBudgets(value: unknown, categoryIds: ReadonlySet<string>): MonthlyBudget[] {
  const keys = new Set<string>();
  return requireList(value, "Budgets").map((record) => {
    const budget = requireRecord(record, "Budget");
    const categoryId = requireText(budget.categoryId, "a category ID");
    const month = requireMonth(budget.month);
    const amountMinor = requireMinorUnits(budget.amountMinor);
    const key = JSON.stringify([categoryId, month]);
    if (!categoryIds.has(categoryId) || amountMinor < 0 || keys.has(key)) throw new LedgerError("Invalid category budget.");
    keys.add(key);
    return { categoryId, month, amountMinor };
  });
}

function readUndoIndex(value: unknown, length: number): number {
  const index = requireMinorUnits(value);
  if (index < 0 || index > length) throw new LedgerError("Invalid undo position.");
  return index;
}

function readUndoIds(value: unknown, present: ReadonlySet<string>): string[] {
  const visited = new Set<string>();
  return requireList(value, "Undo IDs").map((record) => {
    const id = requireText(record, "an undo ID");
    if (!present.has(id) || visited.has(id)) throw new LedgerError("Invalid undo reference.");
    visited.add(id);
    return id;
  });
}

function readUndo(value: unknown, document: Omit<LedgerDocument, "undo">, transactionIds: ReadonlySet<string>, categoryIds: ReadonlySet<string>): UndoRecord | null {
  if (value === null || value === undefined) return null;
  const undo = requireRecord(value, "Undo record");
  switch (undo.action) {
    case "deleteTransaction": {
      const entry = requireRecord(undo.transaction, "Deleted transaction");
      const categoryId = entry.categoryId === null ? null : requireText(entry.categoryId, "a category ID");
      const transaction = readTransaction(entry, categoryId);
      if (transactionIds.has(transaction.id) || (categoryId !== null && !categoryIds.has(categoryId))) throw new LedgerError("Invalid deleted transaction.");
      return { action: undo.action, index: readUndoIndex(undo.index, document.transactions.length), transaction };
    }
    case "deleteRule": {
      const rule = readRule(undo.rule, categoryIds);
      if (document.rules.some(({ id }) => id === rule.id)) throw new LedgerError("Invalid deleted rule.");
      return { action: undo.action, index: readUndoIndex(undo.index, document.rules.length), rule };
    }
    case "deleteCategory": case "mergeCategories": {
      const category = readCategory(undo.category);
      if (categoryIds.has(category.id) || document.categories.some(({ name }) => categoryKey(name) === categoryKey(category.name))) {
        throw new LedgerError("Invalid removed category.");
      }
      const restoredIds = new Set(categoryIds).add(category.id);
      return {
        action: undo.action, category, index: readUndoIndex(undo.index, document.categories.length),
        affectedTransactionIds: readUndoIds(undo.affectedTransactionIds, transactionIds),
        rules: readRules(undo.rules, restoredIds), budgets: readBudgets(undo.budgets, restoredIds),
      };
    }
    case "importCsv": {
      const removedTransactions = readUndoIds(undo.transactionIds, transactionIds);
      const removedCategories = readUndoIds(undo.categoryIds, categoryIds);
      const currency = requireCurrency(undo.currency);
      const removedTransactionIds = new Set(removedTransactions);
      const removedCategoryIds = new Set(removedCategories);
      if (document.transactions.some(({ id, categoryId }) => !removedTransactionIds.has(id) && categoryId !== null && removedCategoryIds.has(categoryId)) ||
          document.rules.some(({ categoryId }) => removedCategoryIds.has(categoryId)) || document.budgets.some(({ categoryId }) => removedCategoryIds.has(categoryId))) {
        throw new LedgerError("Undo would remove a category still in use.");
      }
      return { action: undo.action, transactionIds: removedTransactions, categoryIds: removedCategories, currency };
    }
    default: throw new LedgerError("Unsupported undo record.");
  }
}

// Time O(n log n), space O(n); ordered files make the stable sort nearly linear.
/** Opens the current schema and its unnormalised predecessor without rewriting either. */
export function decodeLedger(contents: string): LedgerDocument {
  try {
    const document = requireRecord(JSON.parse(contents), "Ledger");
    const legacy = document.schemaVersion === 0;
    if (!legacy && document.schemaVersion !== SCHEMA_VERSION) throw new LedgerError("Unsupported ledger version.");
    const currency = requireCurrency(document.currency);
    const categoriesByName = new Map<string, Category>();
    const categoryIds = new Set<string>();

    function addCategory(id: string, name: string): Category {
      const key = categoryKey(name);
      if (categoryIds.has(id) || categoriesByName.has(key)) throw new LedgerError("Duplicate category.");
      const category = { id, name };
      categoryIds.add(id);
      categoriesByName.set(key, category);
      return category;
    }

    if (!legacy) {
      for (const value of requireList(document.categories, "Categories")) {
        const category = readCategory(value);
        addCategory(category.id, category.name);
      }
    }

    const transactionIds = new Set<string>();
    const transactions = requireList(document.transactions, "Transactions").map((value) => {
      const record = requireRecord(value, "Transaction");
      let categoryId: string | null = null;
      if (legacy) {
        const name = requireText(record.category ?? "", "Category", true).trim();
        if (name) categoryId = (categoriesByName.get(categoryKey(name)) ?? addCategory(`legacy-category-${categoriesByName.size + 1}`, name)).id;
      } else if (record.categoryId !== null) {
        categoryId = requireText(record.categoryId, "a category ID");
        if (!categoryIds.has(categoryId)) throw new LedgerError("Missing transaction category.");
      }
      const transaction = readTransaction(record, categoryId, legacy);
      if (transactionIds.has(transaction.id)) throw new LedgerError("Duplicate transaction ID.");
      transactionIds.add(transaction.id);
      return transaction;
    });
    transactions.sort(compareDatesNewestFirst);
    const loaded = {
      schemaVersion: SCHEMA_VERSION, currency, categories: [...categoriesByName.values()], transactions,
      rules: readRules(document.rules ?? [], categoryIds), budgets: readBudgets(document.budgets ?? [], categoryIds),
    } as const;
    return { ...loaded, undo: readUndo(document.undo, loaded, transactionIds, categoryIds) };
  } catch (error) {
    const reason = error instanceof LedgerError ? error.message : "Invalid JSON.";
    throw new LedgerError(`The ledger could not be opened. ${reason}`);
  }
}
