import type { LedgerApi } from "../contracts/ledger";

export const channels = {
  read: "ledger:read",
  commit: "ledger:commit",
  pickCsv: "ledger:pick-csv",
  exportCsv: "ledger:export-csv",
  platformInfo: "tally:platform-info",
} as const;

export interface PlatformInfo {
  readonly os: string;
  readonly arch: string;
  readonly electron: string;
  readonly packaged: boolean;
}

export interface RendererBridge extends LedgerApi {
  readonly kind: "native";
  platformInfo(): Promise<PlatformInfo>;
}

export type Reply<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };
