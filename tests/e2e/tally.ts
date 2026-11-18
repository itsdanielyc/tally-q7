import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";

/** Launches the built application with a disposable, explicitly named data directory. */
export async function withTally(
  profile: string,
  exercise: (page: Page, app: ElectronApplication) => Promise<void>,
  files: { importPath?: string } = {},
): Promise<void> {
  const app = await electron.launch({
    args: ["."], cwd: process.cwd(),
    env: { ...process.env, TALLY_TEST_PROFILE: profile, TALLY_TEST_IMPORT_FILE: files.importPath ?? "" },
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    await exercise(window, app);
  } finally {
    await app.close();
  }
}
