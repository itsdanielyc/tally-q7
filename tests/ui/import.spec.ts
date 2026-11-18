import { expect, test } from "@playwright/test";
import { BANK_CSV } from "../fixtures/csv";

test("maps a bank CSV, previews errors, and skips a repeated import", async ({ page }) => {
  await page.goto("/");
  async function pickBankFile() {
    const fileChooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Import CSV" }).click();
    await (await fileChooser).setFiles({ name: "bank.csv", mimeType: "text/csv", buffer: Buffer.from(BANK_CSV) });
    const dialog = page.getByRole("dialog", { name: "Import CSV" });
    await dialog.getByLabel("Date order").selectOption("DMY");
    return dialog;
  }
  const dialog = await pickBankFile();
  await expect(dialog.getByText("Market; downtown")).toBeVisible();
  await expect(dialog.getByText(/Line 4/)).toBeVisible();
  await expect(dialog.getByText("1 duplicate skipped.")).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Market; downtown" })).toContainText("-12.34");
  const again = await pickBankFile();
  await expect(again.getByText("3 duplicates skipped.")).toBeVisible();
  await expect(again.getByRole("button", { name: "Confirm import" })).toBeDisabled();
});
