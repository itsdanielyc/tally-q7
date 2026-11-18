import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { assertGeometry, captureGeometry } from "./geometry";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("backend-badge")).toHaveText("mock");
  await expect(page.getByRole("button", { name: "Add transaction" })).toBeEnabled();
});

test("tier 1: accessibility structure is identical everywhere", async ({ page }) => {
  await expect(page.locator("main")).toMatchAriaSnapshot({ name: "home.aria.yml" });
});

test("tier 2: layout geometry stays within tolerance everywhere", async ({ page }, testInfo) => {
  const baseline = join(testInfo.project.testDir, "__snapshots__", "home.spec.ts", "home.geometry.json");
  assertGeometry(baseline, await captureGeometry(page));
});

test("tier 3: pixels match the per-OS baseline", async ({ page }, testInfo) => {
  const name = `home-${testInfo.project.name}-${process.platform}.png`;
  const baseline = join(testInfo.project.testDir, "__snapshots__", "home.spec.ts", name);
  test.skip(!process.env.CI && !existsSync(baseline), "the snapshots workflow supplies the per-OS PNG");
  await expect(page).toHaveScreenshot(name, { fullPage: true });
});
