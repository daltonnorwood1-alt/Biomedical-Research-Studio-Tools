import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const surfaces = ["onboarding", "dashboard", "review", "approval", "forms", "evidence"] as const;

for (const surface of surfaces) {
  test(`${surface} plugin surface has no automatically detectable accessibility violations`, async ({ page }) => {
    await page.goto(`/ui/${surface}.html`);
    await expect(page.locator("main, .app-shell, .review-shell").first()).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test("onboarding uses selectable choices and preserves required free text", async ({ page }) => {
  await page.goto("/ui/onboarding.html");
  await page.getByLabel("New manuscript").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("Project title")).toBeVisible();
  await page.getByLabel("Project title").fill("Synthetic cardiovascular study");
  await page.getByLabel("Observational cohort").check();
  await page.getByLabel("Article type").selectOption({ label: "Original research" });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Privacy and control")).toBeVisible();
});

test("approval decisions require a named approver and rationale", async ({ page }) => {
  await page.goto("/ui/approval.html");
  await page.getByRole("button", { name: "Approve source set" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Approver name")).toBeVisible();
  await expect(dialog.getByLabel("Rationale")).toBeVisible();
});

test("tool suggestions render as clickable recommended next steps", async ({ page }) => {
  await page.addInitScript(() => {
    (globalThis as any).openai = {
      toolOutput: {
        structuredContent: {
          data: { project: { id: "project-fixture", title: "Synthetic study" }, sources: [], findings: [], approvals: [], pending_approvals: [], release: { releasable: false, missing_gates: ["A"] } },
          next_actions: [{ id: "continue", label: "Review Gate A", description: "Review scope.", kind: "tool", tool: "brs_prepare_approval", arguments: { project_id: "project-fixture", gate: "A" }, recommended: true }]
        }
      },
      callTool: async () => ({ structuredContent: { data: {} } })
    };
  });
  await page.goto("/ui/dashboard.html");
  await expect(page.getByRole("heading", { name: "Recommended next step" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review Gate A" })).toBeVisible();
});
