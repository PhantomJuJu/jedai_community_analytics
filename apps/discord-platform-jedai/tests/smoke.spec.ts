import { expect, test } from "@playwright/test";

test("loads JEDAI Discord platform shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "JEDAI Discord platform" })).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByRole("tab", { name: "ダッシュボード" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "告知ジェネレータ" })).toBeVisible();
});
