import type { Category, LedgerCommand, LedgerOperations, LedgerView, Transaction } from "../contracts/ledger";
import { requireDate } from "./calendar";
import { categoryKey, changeCategories } from "./categories";
import { previewImport } from "./import-ledger";
import { DEFAULT_CURRENCY, requireCurrency } from "./money";
import { LedgerError, requireMinorUnits, requireRecord, requireText } from "./validation";

export const SCHEMA_VERSION = 1;

export interface LedgerDocument extends LedgerView {
  readonly schemaVersion: typeof SCHEMA_VERSION;
}

export interface LedgerStore {
  load(): Promise<LedgerDocument>;
  save(document: LedgerDocument): Promise<void>;
}

export function emptyLedger(): LedgerDocument {
  return { schemaVersion: SCHEMA_VERSION, currency: DEFAULT_CURRENCY, categories: [], transactions: [], rules: [] };
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

  const existingCategory = categoryName ? document.categories.find((category) => categoryKey(category.name) === categoryKey(categoryName)) : undefined;
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
  transactions.splice(index, 1);
  return { ...document, transactions };
}

function applyChange(document: LedgerDocument, command: LedgerCommand): LedgerDocument {
  requireRecord(command, "Ledger command");
  switch (command.type) {
    case "saveTransaction": return saveTransaction(document, command.id, command.transaction);
    case "deleteTransaction": return deleteTransaction(document, command.id);
    case "importCsv": {
      const preview = previewImport(document, command.csv);
      if (preview.rows.length === 0) return document;
      const imported: Transaction[] = preview.rows.map(({ transaction, categoryId }) => ({
        id: crypto.randomUUID(), date: transaction.date, payee: transaction.payee, amountMinor: transaction.amountMinor, categoryId, note: transaction.note,
      }));
      const transactions = imported.concat(document.transactions).sort(compareDatesNewestFirst);
      return { ...document, transactions };
    }
    case "setCurrency": {
      const currency = requireCurrency(command.currency);
      if (currency === document.currency) return document;
      if (document.transactions.length > 0) throw new LedgerError("Currency can only change when the ledger is empty.");
      return { ...document, currency };
    }
    case "saveCategory": case "deleteCategory": case "mergeCategories":
    case "addRule": case "deleteRule": case "applyRules": return changeCategories(document, command);
    default: throw new LedgerError("Unknown ledger command.");
  }
}

function viewOf({ currency, categories, transactions, rules }: LedgerDocument): LedgerView {
  return { currency, categories, transactions, rules };
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
      if (updated !== loaded) await store.save(updated);
      document = updated;
      return viewOf(updated);
    }),
  };
}
