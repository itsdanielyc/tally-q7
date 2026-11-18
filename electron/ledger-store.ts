import { readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { decodeLedger } from "../domain/ledger-format";
import { emptyLedger, type LedgerStore } from "../domain/ledger";
import { errorCode, writeAtomicFile } from "./atomic-file";

const LEDGER_FILENAME = "ledger.json";
const STAGING_FILENAME = ".ledger.pending";

/** Opens a store whose sole owner serialises writers to the staging file. */
export function openLedgerStore(directory: string, replaceFile = rename): LedgerStore {
  const ledgerFile = join(directory, LEDGER_FILENAME);
  const stagingFile = join(directory, STAGING_FILENAME);
  return {
    async load() {
      try {
        return decodeLedger(await readFile(ledgerFile, "utf8"));
      } catch (error) {
        if (errorCode(error) === "ENOENT") return emptyLedger();
        throw error;
      }
    },
    save: (document) => writeAtomicFile(ledgerFile, stagingFile, JSON.stringify(document) + "\n", replaceFile),
  };
}
