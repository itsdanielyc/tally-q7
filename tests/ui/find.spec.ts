import { expect, test } from "@playwright/test";

test("filters the visible ledger and undoes a transaction deletion once", async ({ page }, testInfo) => {
  await page.goto("/");
  for (const [payee, note, amount] of [["Market", "Weekly", "-14.25"], ["Payroll", "Monthly", "200"]]) {
    await page.getByRole("button", { name: "Add transaction" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Date").fill("2026-11-18");
    await dialog.getByLabel("Payee").fill(payee);
    await dialog.getByLabel("Note").fill(note);
    await dialog.getByLabel(/^Amount/).fill(amount);
    await dialog.getByRole("button", { name: "Save transaction" }).click();
  }
  await page.getByRole("textbox", { name: "Search payee or note" }).fill("weekly");
  await page.getByText("More filters", { exact: true }).click();
  await page.getByLabel("Minimum amount").fill("-15");
  await page.getByLabel("To date").fill("2026-11-18");
  const row = page.getByRole("row").filter({ hasText: "Market" });
  await expect(row).toHaveCount(1);
  await expect(page.getByRole("row").filter({ hasText: "Payroll" })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("filters.png") });
  await row.getByRole("button", { name: "Delete Market" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete transaction" }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(row).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeHidden();
});
