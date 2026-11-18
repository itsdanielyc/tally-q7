import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { withTally } from "./tally";

test("reopens an edited transaction from the same on-disk ledger", async ({}, testInfo) => {
  const profile = testInfo.outputPath("profile");
  await withTally(profile, async (page) => {
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
    expect(await page.evaluate(() => window.electronBridge?.kind)).toBe("native");
    await page.getByRole("button", { name: "Add transaction" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Date").fill("2026-11-18");
    await dialog.getByLabel("Payee").fill("Corner Market");
    await dialog.getByLabel(/^Amount/).fill("-14.25");
    await dialog.getByLabel("Category").fill("Food");
    await dialog.getByLabel("Note").fill("Weekly groceries");
    await dialog.getByRole("button", { name: "Save transaction" }).click();
    await page.getByRole("row").filter({ hasText: "Corner Market" }).getByRole("button", { name: /^Edit/ }).click();
    await dialog.getByLabel(/^Amount/).fill("-13.25");
    await dialog.getByRole("button", { name: "Save transaction" }).click();
    await expect(page.getByRole("row").filter({ hasText: "Corner Market" })).toContainText("-13.25");
  });
  const ledgerFile = join(profile, "ledger.json");
  const before = await readFile(ledgerFile, "utf8");
  await withTally(profile, async (page) => {
    const row = page.getByRole("row").filter({ hasText: "Corner Market" });
    await expect(row).toContainText("-13.25");
    await expect(row).toContainText("Food");
    await expect(row).toContainText("Weekly groceries");
    const view = await page.evaluate(() => window.electronBridge!.read());
    expect(view.transactions[0]).toMatchObject({ amountMinor: -1325, date: "2026-11-18" });
  });
  expect(await readFile(ledgerFile, "utf8")).toBe(before);
});
