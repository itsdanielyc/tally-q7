import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_CURRENCY } from "../../domain/money";
import { transactionDraft } from "../fixtures/ledger";
import { withTally } from "./tally";

test("loads the sandboxed native window with the shared ledger contract", async ({}, testInfo) => {
  await withTally(testInfo.outputPath("profile"), async (page, app) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await expect(page).toHaveTitle("Tally");
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add transaction" })).toBeEnabled();
    await expect(page.getByTestId("backend-badge")).toBeHidden();
    const context = await page.evaluate(() => ({
      kind: window.electronBridge?.kind,
      require: typeof (window as unknown as { require?: unknown }).require,
      process: typeof (window as unknown as { process?: unknown }).process,
    }));
    expect(context).toEqual({ kind: "native", require: "undefined", process: "undefined" });
    const ledger = await page.evaluate(() => window.electronBridge!.read());
    expect(ledger.currency).toBe(DEFAULT_CURRENCY);
    expect(ledger.transactions).toEqual([]);

    const main = await app.evaluate(({ app: electronApp }) => ({ os: process.platform, arch: process.arch, packaged: electronApp.isPackaged }));
    expect(main).toEqual({ os: process.platform, arch: process.arch, packaged: false });
    expect(await page.evaluate(() => window.electronBridge!.platformInfo())).toMatchObject(main);

    await page.evaluate((transaction) => window.electronBridge!.commit({ type: "saveTransaction", transaction }), transactionDraft());
    await page.reload();
    await expect(page.getByRole("row").filter({ hasText: "Corner Market" })).toContainText("Weekly groceries");
    const directory = join(process.cwd(), "artifacts", "e2e");
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: join(directory, `${main.os}-${main.arch}.png`) });
    expect(consoleErrors).toEqual([]);
  });
});
