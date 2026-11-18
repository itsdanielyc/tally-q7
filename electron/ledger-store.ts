import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { decodeLedger } from "../domain/ledger-format";
import { emptyLedger, type LedgerStore } from "../domain/ledger";

const LEDGER_FILENAME = "ledger.json";
const STAGING_FILENAME = ".ledger.pending";
const PRIVATE_FILE_MODE = 0o600;
const UNSUPPORTED_DIRECTORY_SYNC = new Set(["EINVAL", "ENOTSUP", "EOPNOTSUPP"]);

function errorCode(error: unknown): string | undefined {
  return error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
}

/** Flushes the directory entry where Node supports opening directories for sync. */
async function syncDirectory(directory: string): Promise<void> {
  if (process.platform === "win32") return;
  try {
    const handle = await open(directory, "r");
    try { await handle.sync(); } finally { await handle.close(); }
  } catch (error) {
    // The rename is already visible. Reporting a failed save here would leave the in-memory ledger stale.
    if (!UNSUPPORTED_DIRECTORY_SYNC.has(errorCode(error) ?? "")) console.warn("Could not sync the ledger directory.", error);
  }
}

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
    async save(document) {
      await mkdir(directory, { recursive: true });
      await rm(stagingFile, { force: true });
      try {
        const staging = await open(stagingFile, "wx", PRIVATE_FILE_MODE);
        try {
          await staging.writeFile(JSON.stringify(document) + "\n", "utf8");
          await staging.sync();
        } finally {
          await staging.close();
        }
        await replaceFile(stagingFile, ledgerFile);
      } catch (error) {
        await rm(stagingFile, { force: true }).catch(() => undefined);
        throw error;
      }
      await syncDirectory(directory);
    },
  };
}
