import type { Category, LedgerCommand, LedgerOperations, LedgerView, Transaction } from "../contracts/ledger";
import type { CsvImportRequest } from "../contracts/csv";
import { requireDate } from "./calendar";
import { categoryKey, changeCategories } from "./categories";
import { previewImport } from "./import-ledger";
import { DEFAULT_CURRENCY, requireCurrency } from "./money";
import { setBudget } from "./summary";
import { undoChange, type UndoRecord } from "./undo";
import { LedgerError, requireMinorUnits, requireRecord, requireText } from "./validation";

export const SCHEMA_VERSION = 1;

export interface LedgerDocument extends Omit<LedgerView, "undoAction"> {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly undo: UndoRecord | null;
}

export interface LedgerStore {
  load(): Promise<LedgerDocument>;
  save(document: LedgerDocument): Promise<void>;
}

export function emptyLedger(): LedgerDocument {
  return { schemaVersion: SCHEMA_VERSION, currency: DEFAULT_CURRENCY, categories: [], transactions: [], rules: [], budgets: [], undo: null };
}

export function memoryLedgerStore(): LedgerStore {
  let document = emptyLedger();
  return {
    async load() { return document; },
    async save(updated) { document = updated; },
  };
}

export function compareDatesNewestFirst(left: Transaction, right: Transaction): number {
  if (left.date === right.date) return 0;
  return left.date > right.date ? -1 : 1;
}

// Time O(n), space O(n) for the replacement transaction list.
function saveTransaction(document: LedgerDocument, id: unknown, input: unknown): LedgerDocument {
  const draft = requireRecord(input, "Transaction");
  const date = requireDate(draft.date);
  const payee = requireText(draft.payee, "a payee").trim();
  const amountMinor = requireMinorUnits(draft.amountMinor);
  const categoryName = requireText(draft.category, "Category", true).trim();
  const note = requireText(draft.note, "Note", true);
  const previousIndex = id === undefined ? -1 : document.transactions.findIndex((transaction) => transaction.id === id);
  if (id !== undefined && previousIndex < 0) throw new LedgerError("That transaction no longer exists.");

  const key = categoryKey(categoryName);
  const existingCategory = key ? document.categories.find((category) => categoryKey(category.name) === key) : undefined;
  const category: Category | undefined = existingCategory ?? (categoryName ? { id: crypto.randomUUID(), name: categoryName } : undefined);
  const previous = document.transactions[previousIndex];
  const transaction: Transaction = { id: previous?.id ?? crypto.randomUUID(), date, payee, amountMinor, categoryId: category?.id ?? null, note };
  const transactions = document.transactions.slice();
  if (previous?.date === date) {
    transactions[previousIndex] = transaction;
  } else {
    if (previous) transactions.splice(previousIndex, 1);
    const insertionIndex = transactions.findIndex((existing) => existing.date <= date);
    transactions.splice(insertionIndex < 0 ? transactions.length : insertionIndex, 0, transaction);
  }
  const categories = category && !existingCategory ? [...document.categories, category] : document.categories;
  return { ...document, transactions, categories };
}

function deleteTransaction(document: LedgerDocument, id: string): LedgerDocument {
  const index = document.transactions.findIndex((transaction) => transaction.id === id);
  if (index < 0) throw new LedgerError("That transaction no longer exists.");
  const transactions = document.transactions.slice();
  const [transaction] = transactions.splice(index, 1);
  return { ...document, transactions, undo: { action: "deleteTransaction", index, transaction } };
}

/** Builds a single candidate document for the whole batch. */
function importTransactions(document: LedgerDocument, csv: CsvImportRequest): LedgerDocument {
  const preview = previewImport(document, csv);
  if (preview.rows.length === 0) return document;
  const newCategories: Category[] = [];
  const categoriesByName = new Map(document.categories.map((category) => [categoryKey(category.name), category.id]));
  const imported: Transaction[] = preview.rows.map(({ transaction, categoryId }) => {
    let resolvedId = categoryId;
    if (!resolvedId && transaction.category) {
      const key = categoryKey(transaction.category);
      resolvedId = categoriesByName.get(key) ?? crypto.randomUUID();
      if (!categoriesByName.has(key)) {
        categoriesByName.set(key, resolvedId);
        newCategories.push({ id: resolvedId, name: transaction.category });
      }
    }
    return { id: crypto.randomUUID(), date: transaction.date, payee: transaction.payee, amountMinor: transaction.amountMinor, categoryId: resolvedId, note: transaction.note };
  });
  return {
    ...document, currency: preview.currency,
    categories: newCategories.length ? document.categories.concat(newCategories) : document.categories,
    transactions: imported.concat(document.transactions).sort(compareDatesNewestFirst),
    undo: { action: "importCsv", transactionIds: imported.map(({ id }) => id), categoryIds: newCategories.map(({ id }) => id), currency: document.currency },
  };
}

function applyChange(document: LedgerDocument, command: LedgerCommand): LedgerDocument {
  requireRecord(command, "Ledger command");
  switch (command.type) {
    case "saveTransaction": return saveTransaction(document, command.id, command.transaction);
    case "deleteTransaction": return deleteTransaction(document, command.id);
    case "importCsv": return importTransactions(document, command.csv);
    case "setCurrency": {
      const currency = requireCurrency(command.currency);
      if (currency === document.currency) return document;
      if (document.transactions.length > 0 || document.budgets.length > 0) throw new LedgerError("Currency can only change when the ledger is empty.");
      return { ...document, currency };
    }
    case "setBudget": return setBudget(document, command);
    case "undo": return undoChange(document);
    case "saveCategory": case "deleteCategory": case "mergeCategories":
    case "addRule": case "deleteRule": case "applyRules": return changeCategories(document, command);
    default: throw new LedgerError("Unknown ledger command.");
  }
}

function viewOf({ currency, categories, transactions, rules, budgets, undo }: LedgerDocument): LedgerView {
  return { currency, categories, transactions, rules, budgets, undoAction: undo?.action ?? null };
}

/** Serialises loads and saves, publishing a new view only after its write succeeds. */
export function createLedgerService(store: LedgerStore): LedgerOperations {
  let document: LedgerDocument | undefined;
  let pending: Promise<void> = Promise.resolve();

  function enqueue<T>(operation: (loaded: LedgerDocument) => Promise<T> | T): Promise<T> {
    const result = pending.then(async () => operation(document ??= await store.load()));
    pending = result.then(() => undefined, () => undefined);
    return result;
  }

  return {
    read: () => enqueue(viewOf),
    commit: (command) => enqueue(async (loaded) => {
      const updated = applyChange(loaded, command);
      if (updated === loaded) return viewOf(loaded);
      const persisted = updated.undo && updated.undo === loaded.undo ? { ...updated, undo: null } : updated;
      await store.save(persisted);
      document = persisted;
      return viewOf(persisted);
    }),
  };
}
