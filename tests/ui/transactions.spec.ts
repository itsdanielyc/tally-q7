import { expect, test } from "@playwright/test";

test("records, edits and deletes a transaction through the mock", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("backend-badge")).toHaveText("mock");
  await page.getByRole("button", { name: "Add transaction" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Date").fill("2026-11-18");
  await dialog.getByLabel("Payee").fill("Corner Market");
  await dialog.getByLabel(/^Amount/).fill("-14.25");
  await dialog.getByLabel("Category").fill("Food");
  await dialog.getByLabel("Note").fill("Weekly groceries");
  await dialog.getByRole("button", { name: "Save transaction" }).click();

  let row = page.getByRole("row").filter({ hasText: "Corner Market" });
  await expect(row).toContainText("-14.25");
  await expect(row).toContainText("Food");
  await row.getByRole("button", { name: /^Edit/ }).click();
  await expect(dialog.getByLabel("Note")).toHaveValue("Weekly groceries");
  await dialog.getByLabel("Payee").fill("Corner Shop");
  await dialog.getByRole("button", { name: "Save transaction" }).click();

  row = page.getByRole("row").filter({ hasText: "Corner Shop" });
  await row.getByRole("button", { name: /^Delete/ }).click();
  await dialog.getByRole("button", { name: "Delete transaction" }).click();
  await expect(row).toHaveCount(0);
  await expect(page.getByText("No transactions yet.")).toBeVisible();
});
