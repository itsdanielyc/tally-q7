import type { Category, CategoryCommand, MonthlyBudget, PayeeRule } from "../contracts/ledger";
import type { LedgerDocument } from "./ledger";
import { LedgerError, requireText } from "./validation";

export function categoryKey(name: string): string {
  return name.trim().toLocaleLowerCase("en");
}

/** Normalises rules once; a match keeps the priority implied by creation order. */
export function ruleMatcher(rules: readonly PayeeRule[]): (payee: string) => string | null {
  if (rules.length === 0) return () => null;
  const patterns = rules.map(({ contains, categoryId }) => ({ pattern: contains.toLocaleLowerCase("en"), categoryId }));
  return (payee) => {
    const name = payee.toLocaleLowerCase("en");
    return patterns.find(({ pattern }) => name.includes(pattern))?.categoryId ?? null;
  };
}

function findCategory(document: LedgerDocument, id: string): Category {
  const category = document.categories.find((item) => item.id === id);
  if (!category) throw new LedgerError("That category no longer exists.");
  return category;
}

function saveCategory(document: LedgerDocument, nameInput: string, id?: string): LedgerDocument {
  const name = requireText(nameInput, "a category name").trim();
  const existing = id === undefined ? undefined : findCategory(document, id);
  if (existing?.name === name) return document;
  const key = categoryKey(name);
  if (document.categories.some((category) => category.id !== id && categoryKey(category.name) === key)) {
    throw new LedgerError("A category with that name already exists.");
  }
  const categories = existing
    ? document.categories.map((category) => category.id === id ? { id: category.id, name } : category)
    : [...document.categories, { id: crypto.randomUUID(), name }];
  return { ...document, categories };
}

// Time and space O(t + r + c), for transactions, rules and categories respectively.
function removeCategory(document: LedgerDocument, id: string, targetId?: string): LedgerDocument {
  findCategory(document, id);
  if (targetId !== undefined) {
    if (targetId === id) throw new LedgerError("Choose a different category to merge into.");
    findCategory(document, targetId);
  }
  const transactions = document.transactions.map((transaction) => transaction.categoryId === id
    ? { ...transaction, categoryId: targetId ?? null } : transaction);
  const rules = targetId === undefined
    ? document.rules.filter((rule) => rule.categoryId !== id)
    : document.rules.map((rule) => rule.categoryId === id ? { ...rule, categoryId: targetId } : rule);
  const budgets: MonthlyBudget[] = [];
  const targetMonths = new Set(document.budgets.filter((budget) => budget.categoryId === targetId).map(({ month }) => month));
  for (const budget of document.budgets) {
    if (budget.categoryId !== id) budgets.push(budget);
    else if (targetId !== undefined && !targetMonths.has(budget.month)) budgets.push({ ...budget, categoryId: targetId });
  }
  return { ...document, categories: document.categories.filter((category) => category.id !== id), transactions, rules, budgets };
}

// Time O(n * r * s) for n entries, r rules and the substring search cost s; space O(n + r).
function applyRules(document: LedgerDocument): LedgerDocument {
  if (document.rules.length === 0) return document;
  const match = ruleMatcher(document.rules);
  let changed = false;
  const transactions = document.transactions.map((transaction) => {
    if (transaction.categoryId !== null) return transaction;
    const categoryId = match(transaction.payee);
    if (!categoryId) return transaction;
    changed = true;
    return { ...transaction, categoryId };
  });
  return changed ? { ...document, transactions } : document;
}

export function changeCategories(document: LedgerDocument, command: CategoryCommand): LedgerDocument {
  switch (command.type) {
    case "saveCategory": return saveCategory(document, command.name, command.id);
    case "deleteCategory": return removeCategory(document, command.id);
    case "mergeCategories": return removeCategory(document, command.id, requireText(command.targetId, "a destination category"));
    case "addRule": {
      const contains = requireText(command.contains, "payee text").trim();
      const category = findCategory(document, command.categoryId);
      return { ...document, rules: [...document.rules, { id: crypto.randomUUID(), contains, categoryId: category.id }] };
    }
    case "deleteRule": {
      const rules = document.rules.filter(({ id }) => id !== command.id);
      if (rules.length === document.rules.length) throw new LedgerError("That rule no longer exists.");
      return { ...document, rules };
    }
    case "applyRules": return applyRules(document);
  }
}
