import type { LedgerApi } from "../contracts/ledger";
import { createLedgerService, type LedgerStore } from "../domain/ledger";

/** Binds the native operations to the process's exclusive ledger store. */
export function nativeLedgerApi(store: LedgerStore, pickCsv: LedgerApi["pickCsv"]): LedgerApi {
  return { kind: "native", ...createLedgerService(store), pickCsv };
}
