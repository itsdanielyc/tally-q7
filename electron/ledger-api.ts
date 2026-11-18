import type { LedgerApi } from "../contracts/ledger";
import { exportThrough, type CsvDestination } from "../domain/find";
import { createLedgerService, type LedgerStore } from "../domain/ledger";

/** Binds the native operations to the process's exclusive ledger store. */
export function nativeLedgerApi(store: LedgerStore, pickCsv: LedgerApi["pickCsv"], saveCsv: CsvDestination): LedgerApi {
  const service = createLedgerService(store);
  return { kind: "native", ...service, pickCsv, exportCsv: exportThrough(service.read, saveCsv) };
}
