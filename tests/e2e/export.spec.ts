import { expect, test } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { transactionDraft } from "../fixtures/ledger";
import { withTally } from "./tally";

test("exports the filtered ledger to a real file, reimports it and undoes the import", async ({}, testInfo) => {
  await mkdir(testInfo.outputDir, { recursive: true });
  const exportPath = testInfo.outputPath("export.csv");
  await withTally(testInfo.outputPath("source-profile"), async (page) => {
    for (const transaction of [transactionDraft({ payee: 'Market, "North"' }), transactionDraft({ payee: "Excluded" })]) {
      await page.evaluate((input) => window.electronBridge!.commit({ type: "saveTransaction", transaction: input }), transaction);
    }
    await page.reload();
    await page.getByRole("textbox", { name: "Search payee or note" }).fill("north");
    await page.getByRole("button", { name: "Export CSV" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Exported 1 transaction." })).toBeVisible();
  }, { exportPath });
  const contents = await readFile(exportPath, "utf8");
  expect(contents).toContain('"Market, ""North"""');
  expect(contents).not.toContain("Excluded");

  await withTally(testInfo.outputPath("target-profile"), async (page) => {
    await page.getByRole("button", { name: "Import CSV" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Confirm import" }).click();
    const row = page.getByRole("row").filter({ hasText: 'Market, "North"' });
    await expect(row).toContainText("Weekly groceries");
    await expect(row).toContainText("Food");
    await expect(row).toContainText("-14.25");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(row).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeHidden();
  }, { importPath: exportPath });
});
