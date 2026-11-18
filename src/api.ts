import type { LedgerApi } from "../contracts/ledger";
import type { CsvFile } from "../contracts/csv";
import { decodeCsv } from "../domain/csv";
import { exportThrough, type CsvDestination } from "../domain/find";
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
        resolve({ name: file.name, text: decodeCsv(new Uint8Array(await file.arrayBuffer())) });
      } catch (error) { reject(error); }
    }, { once: true });
    input.addEventListener("cancel", () => { input.remove(); resolve(null); }, { once: true });
    document.body.append(input);
    input.click();
  });
}

async function downloadCsv(name: string, text: string): Promise<boolean> {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.download = name;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}

/** A fresh, visibly labelled browser adapter with no access to a real ledger. */
export function mockLedgerApi(pickCsv = pickBrowserCsv, saveCsv: CsvDestination = downloadCsv): LedgerApi {
  const service = createLedgerService(memoryLedgerStore());
  return { kind: "mock", ...service, pickCsv, exportCsv: exportThrough(service.read, saveCsv) };
}

export const api: LedgerApi = (typeof window === "undefined" ? undefined : window.electronBridge) ?? mockLedgerApi();
