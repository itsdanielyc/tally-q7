import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { BANK_CSV } from "../fixtures/csv";
import { withTally } from "./tally";

test("picks a real CSV file, imports accepted rows and skips a reimport", async ({}, testInfo) => {
  await mkdir(testInfo.outputDir, { recursive: true });
  const importPath = testInfo.outputPath("bank.csv");
  await writeFile(importPath, BANK_CSV);
  await withTally(testInfo.outputPath("profile"), async (page) => {
    await page.getByRole("button", { name: "Import CSV" }).click();
    const dialog = page.getByRole("dialog", { name: "Import CSV" });
    await dialog.getByLabel("Date order").selectOption("DMY");
    await expect(dialog.getByText(/Line 4/)).toBeVisible();
    await dialog.getByRole("button", { name: "Confirm import" }).click();
    await expect(page.getByRole("row").filter({ hasText: "Market; downtown" })).toContainText("-12.34");
    await page.getByRole("button", { name: "Import CSV" }).click();
    await dialog.getByLabel("Date order").selectOption("DMY");
    await expect(dialog.getByRole("button", { name: "Confirm import" })).toBeDisabled();
  }, { importPath });
});
