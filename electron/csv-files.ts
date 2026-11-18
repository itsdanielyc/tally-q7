import { dialog, type BrowserWindow } from "electron";
import { open } from "node:fs/promises";
import { basename } from "node:path";
import type { CsvFile } from "../contracts/csv";
import { decodeCsv, MAX_CSV_BYTES } from "../domain/csv";
import { LedgerError } from "../domain/validation";

/** Reads a file chosen by the user, with a fixed-path seam for the built test app. */
export async function pickCsvFile(window: BrowserWindow, testPath?: string): Promise<CsvFile | null> {
  try {
    const path = testPath ?? (await dialog.showOpenDialog(window, {
      title: "Import bank CSV", properties: ["openFile"], filters: [{ name: "CSV files", extensions: ["csv", "tsv", "txt"] }],
    })).filePaths[0];
    if (!path) return null;
    const file = await open(path, "r");
    try {
      const metadata = await file.stat();
      if (!metadata.isFile()) throw new LedgerError("Choose a regular CSV file.");
      if (metadata.size > MAX_CSV_BYTES) throw new LedgerError("Choose a CSV file of 16 MB or less.");
      return { name: basename(path), text: decodeCsv(await file.readFile()) };
    } finally { await file.close(); }
  } catch (error) {
    if (error instanceof LedgerError) throw error;
    throw new LedgerError("Tally could not read the selected CSV file.");
  }
}
