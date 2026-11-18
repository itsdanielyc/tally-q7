import type { LedgerApi } from "../contracts/ledger";
import type { CsvFile } from "../contracts/csv";
import { decodeCsv, MAX_CSV_BYTES } from "../domain/csv";
import { createLedgerService, memoryLedgerStore } from "../domain/ledger";
import type { RendererBridge } from "../electron/bridge";

declare global {
  interface Window {
    electronBridge?: RendererBridge;
  }
}

function pickBrowserCsv(): Promise<CsvFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.tsv,.txt";
    input.hidden = true;
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) { resolve(null); return; }
      try {
        if (file.size > MAX_CSV_BYTES) throw new Error("Choose a CSV file of 16 MB or less.");
        resolve({ name: file.name, text: decodeCsv(new Uint8Array(await file.arrayBuffer())) });
      } catch (error) { reject(error); }
    }, { once: true });
    input.addEventListener("cancel", () => { input.remove(); resolve(null); }, { once: true });
    document.body.append(input);
    input.click();
  });
}

/** A fresh, visibly labelled browser adapter with no access to a real ledger. */
export function mockLedgerApi(): LedgerApi {
  return { kind: "mock", ...createLedgerService(memoryLedgerStore()), pickCsv: pickBrowserCsv };
}

export const api: LedgerApi = (typeof window === "undefined" ? undefined : window.electronBridge) ?? mockLedgerApi();
