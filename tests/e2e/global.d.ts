import type { RendererBridge } from "../../electron/bridge";

declare global {
  interface Window {
    electronBridge?: RendererBridge;
  }
}
