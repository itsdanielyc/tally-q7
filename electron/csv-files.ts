import { dialog, type BrowserWindow } from "electron";
import { open } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import type { CsvFile } from "../contracts/csv";
import { decodeCsv } from "../domain/csv";
import { LedgerError } from "../domain/validation";
import { writeAtomicFile } from "./atomic-file";

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
      return { name: basename(path), text: decodeCsv(await file.readFile()) };
    } finally { await file.close(); }
  } catch (error) {
    if (error instanceof LedgerError) throw error;
    throw new LedgerError("Tally could not read the selected CSV file.");
  }
}

export async function saveCsvFile(window: BrowserWindow, name: string, text: string, testPath?: string): Promise<boolean> {
  const selected = testPath ?? (await dialog.showSaveDialog(window, {
    title: "Export transactions", defaultPath: name, filters: [{ name: "CSV file", extensions: ["csv"] }],
  })).filePath;
  if (!selected) return false;
  const destination = extname(selected).toLowerCase() === ".csv" ? selected : `${selected}.csv`;
  const staged = join(dirname(destination), `.tally-export-${crypto.randomUUID()}.tmp`);
  try {
    await writeAtomicFile(destination, staged, text);
    return true;
  } catch {
    throw new LedgerError("Tally could not write the selected CSV file.");
  }
}
