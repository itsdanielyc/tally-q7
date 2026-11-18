export interface Category {
  readonly id: string;
  readonly name: string;
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
}

export type LedgerCommand =
  | { readonly type: "saveTransaction"; readonly id?: string; readonly transaction: TransactionDraft }
  | { readonly type: "deleteTransaction"; readonly id: string }
  | { readonly type: "setCurrency"; readonly currency: string };

export interface LedgerOperations {
  read(): Promise<LedgerView>;
  commit(command: LedgerCommand): Promise<LedgerView>;
}

export interface LedgerApi extends LedgerOperations {
  readonly kind: "native" | "mock";
}
