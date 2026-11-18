import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { LedgerCommand } from "../contracts/ledger";
import { LedgerError } from "../domain/validation";
import { channels, type PlatformInfo, type Reply } from "./bridge";
import { pickCsvFile } from "./csv-files";
import { nativeLedgerApi } from "./ledger-api";
import { openLedgerStore } from "./ledger-store";

const WINDOW_SIZE = { width: 1024, height: 700, minWidth: 660, minHeight: 480 };
let primaryWindow: BrowserWindow | null = null;

app.commandLine.appendSwitch("disable-background-networking");

const testProfile = app.isPackaged ? undefined : process.env.TALLY_TEST_PROFILE;
if (testProfile) {
  mkdirSync(testProfile, { recursive: true });
  app.setPath("userData", testProfile);
  app.setPath("sessionData", testProfile);
  app.setPath("crashDumps", testProfile);
}

function platformInfo(): PlatformInfo {
  return { os: process.platform, arch: process.arch, electron: process.versions.electron, packaged: app.isPackaged };
}

async function respond<T>(event: IpcMainInvokeEvent, handler: () => T | Promise<T>): Promise<Reply<T>> {
  if (!primaryWindow || event.senderFrame !== primaryWindow.webContents.mainFrame) {
    return { ok: false, message: "This window cannot access the ledger." };
  }
  try {
    return { ok: true, value: await handler() };
  } catch (error) {
    if (error instanceof LedgerError) return { ok: false, message: error.message };
    console.error("Ledger operation failed.", error);
    return { ok: false, message: "Tally could not access the ledger file. Check its location and permissions." };
  }
}

function createWindow(): void {
  const window = new BrowserWindow({
    ...WINDOW_SIZE,
    title: "Tally",
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  primaryWindow = window;
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => { primaryWindow = null; });
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  const devUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;
  if (devUrl) void window.loadURL(devUrl);
  else void window.loadFile(join(import.meta.dirname, "../renderer/index.html"));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!primaryWindow) return;
    if (primaryWindow.isMinimized()) primaryWindow.restore();
    primaryWindow.focus();
  });
  void app.whenReady().then(() => {
    const ledger = nativeLedgerApi(openLedgerStore(app.getPath("userData")), () => {
      if (!primaryWindow) throw new LedgerError("The Tally window is closed.");
      return pickCsvFile(primaryWindow, testProfile ? process.env.TALLY_TEST_IMPORT_FILE || undefined : undefined);
    });
    ipcMain.handle(channels.read, (event) => respond(event, ledger.read));
    ipcMain.handle(channels.commit, (event, command: LedgerCommand) => respond(event, () => ledger.commit(command)));
    ipcMain.handle(channels.pickCsv, (event) => respond(event, ledger.pickCsv));
    ipcMain.handle(channels.platformInfo, (event) => respond(event, platformInfo));
    createWindow();
    app.on("activate", () => { if (!primaryWindow) createWindow(); });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
