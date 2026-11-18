import { expect, test } from "@playwright/test";

test("changes month and sets a budget against the category's spending", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add transaction" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Date").fill("2026-11-18");
  await dialog.getByLabel("Payee").fill("Market");
  await dialog.getByLabel(/^Amount/).fill("-14.25");
  await dialog.getByLabel("Category").fill("Food");
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Summary" }).click();
  const month = page.getByLabel("Month", { exact: true });
  await month.fill("2026-11");
  const row = page.getByRole("row").filter({ hasText: "Food" });
  await expect(row).toContainText("14.25");
  await row.getByRole("button", { name: "Set budget for Food" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Monthly budget").fill("10");
  await dialog.getByRole("button", { name: "Save budget" }).click();
  await expect(row).toContainText("4.25 over");
  await page.screenshot({ path: testInfo.outputPath("summary.png") });
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(month).toHaveValue("2026-12");
  await expect(row).not.toContainText("14.25");
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(row).toContainText("4.25 over");
});
