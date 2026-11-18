import { contextBridge, ipcRenderer } from "electron";
import type { LedgerView } from "../contracts/ledger";
import { channels, type PlatformInfo, type RendererBridge, type Reply } from "./bridge";

async function invoke<T>(channel: typeof channels[keyof typeof channels], ...args: unknown[]): Promise<T> {
  const result: Reply<T> = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

const bridge: RendererBridge = {
  kind: "native",
  read: () => invoke<LedgerView>(channels.read),
  commit: (command) => invoke<LedgerView>(channels.commit, command),
  platformInfo: () => invoke<PlatformInfo>(channels.platformInfo),
};

contextBridge.exposeInMainWorld("electronBridge", bridge);
