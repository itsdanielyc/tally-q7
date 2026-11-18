import type { LedgerApi } from "../contracts/ledger";
import { createLedgerService, memoryLedgerStore } from "../domain/ledger";
import type { RendererBridge } from "../electron/bridge";

declare global {
  interface Window {
    electronBridge?: RendererBridge;
  }
}

/** A fresh, visibly labelled browser adapter with no access to a real ledger. */
export function mockLedgerApi(): LedgerApi {
  return { kind: "mock", ...createLedgerService(memoryLedgerStore()) };
}

export const api: LedgerApi = (typeof window === "undefined" ? undefined : window.electronBridge) ?? mockLedgerApi();
