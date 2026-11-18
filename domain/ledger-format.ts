import type { Category, Transaction } from "../contracts/ledger";
import { requireDate } from "./calendar";
import { categoryKey } from "./categories";
import { compareDatesNewestFirst, SCHEMA_VERSION, type LedgerDocument } from "./ledger";
import { requireCurrency } from "./money";
import { requireMonth } from "./summary";
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
        const category = requireRecord(value, "Category");
        addCategory(requireText(category.id, "a category ID"), requireText(category.name, "a category name"));
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
    const ruleIds = new Set<string>();
    const rules = requireList(document.rules ?? [], "Rules").map((value) => {
      const rule = requireRecord(value, "Rule");
      const id = requireText(rule.id, "a rule ID");
      const categoryId = requireText(rule.categoryId, "a category ID");
      if (!categoryIds.has(categoryId) || ruleIds.has(id)) throw new LedgerError("Invalid rule reference.");
      ruleIds.add(id);
      return { id, categoryId, contains: requireText(rule.contains, "payee text") };
    });
    const budgetKeys = new Set<string>();
    const budgets = requireList(document.budgets ?? [], "Budgets").map((value) => {
      const budget = requireRecord(value, "Budget");
      const categoryId = requireText(budget.categoryId, "a category ID");
      const month = requireMonth(budget.month);
      const amountMinor = requireMinorUnits(budget.amountMinor);
      const key = JSON.stringify([categoryId, month]);
      if (!categoryIds.has(categoryId) || amountMinor < 0 || budgetKeys.has(key)) throw new LedgerError("Invalid category budget.");
      budgetKeys.add(key);
      return { categoryId, month, amountMinor };
    });
    return { schemaVersion: SCHEMA_VERSION, currency, categories: [...categoriesByName.values()], transactions, rules, budgets };
  } catch (error) {
    const reason = error instanceof LedgerError ? error.message : "Invalid JSON.";
    throw new LedgerError(`The ledger could not be opened. ${reason}`);
  }
}
