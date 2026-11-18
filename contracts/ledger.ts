import type { CsvFile, CsvImportRequest } from "./csv";

export interface Category {
  readonly id: string;
  readonly name: string;
}

export interface PayeeRule {
  readonly id: string;
  readonly contains: string;
  readonly categoryId: string;
}

export interface MonthlyBudget {
  readonly categoryId: string;
  readonly month: string;
  readonly amountMinor: number;
}

export interface Transaction {
  readonly id: string;
  readonly date: string;
  readonly payee: string;
  readonly amountMinor: number;
  readonly categoryId: string | null;
  readonly note: string;
}

export interface TransactionDraft {
  readonly date: string;
  readonly payee: string;
  readonly amountMinor: number;
  readonly category: string;
  readonly note: string;
}

export interface LedgerView {
  readonly currency: string;
  readonly categories: readonly Category[];
  readonly transactions: readonly Transaction[];
  readonly rules: readonly PayeeRule[];
  readonly budgets: readonly MonthlyBudget[];
  readonly undoAction: UndoAction | null;
}

export type UndoAction = "deleteTransaction" | "deleteCategory" | "mergeCategories" | "deleteRule" | "importCsv";

export interface TransactionFilters {
  readonly query?: string;
  readonly categoryId?: string | null;
  readonly from?: string;
  readonly to?: string;
  readonly minMinor?: number;
  readonly maxMinor?: number;
}

export type CategoryCommand =
  | { readonly type: "saveCategory"; readonly id?: string; readonly name: string }
  | { readonly type: "deleteCategory"; readonly id: string }
  | { readonly type: "mergeCategories"; readonly id: string; readonly targetId: string }
  | { readonly type: "addRule"; readonly contains: string; readonly categoryId: string }
  | { readonly type: "deleteRule"; readonly id: string }
  | { readonly type: "applyRules" };

export type LedgerCommand =
  | { readonly type: "saveTransaction"; readonly id?: string; readonly transaction: TransactionDraft }
  | { readonly type: "deleteTransaction"; readonly id: string }
  | { readonly type: "setCurrency"; readonly currency: string }
  | { readonly type: "importCsv"; readonly csv: CsvImportRequest }
  | { readonly type: "setBudget"; readonly categoryId: string; readonly month: string; readonly amountMinor: number | null }
  | { readonly type: "undo" }
  | CategoryCommand;

export interface LedgerOperations {
  read(): Promise<LedgerView>;
  commit(command: LedgerCommand): Promise<LedgerView>;
}

export interface LedgerApi extends LedgerOperations {
  readonly kind: "native" | "mock";
  pickCsv(): Promise<CsvFile | null>;
  exportCsv(filters: TransactionFilters): Promise<number | null>;
}
