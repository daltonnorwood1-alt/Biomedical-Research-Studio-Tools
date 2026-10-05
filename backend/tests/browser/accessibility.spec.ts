import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("home view has no automatically detectable accessibility violations", async ({ page }) => {
  await page.goto("http://127.0.0.1:4317");
  await expect(page.getByRole("heading", { name: "Biomedical Research Studio" })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
