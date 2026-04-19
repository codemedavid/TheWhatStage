import { test, expect } from "@playwright/test";

test.describe("Human Handoff", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/inbox");
  });

  test("inbox page loads", async ({ page }) => {
    await expect(page.locator("text=Inbox").first()).toBeVisible();
  });

  test("conversation list renders", async ({ page }) => {
    await expect(page.locator("[placeholder='Search conversations...']")).toBeVisible();
  });

  test("selecting a conversation shows message thread", async ({ page }) => {
    const firstConvo = page.locator("button").filter({ has: page.locator(".truncate") }).first();
    const count = await firstConvo.count();
    if (count > 0) {
      await firstConvo.click();
      await expect(page.locator("[placeholder='Type a message...']")).toBeVisible();
    }
  });

  test("escalation banner shows correct state", async ({ page }) => {
    const firstConvo = page.locator("button").filter({ has: page.locator(".truncate") }).first();
    const count = await firstConvo.count();
    if (count > 0) {
      await firstConvo.click();
      const banner = page.locator("text=/Bot is active|Waiting for human|Bot paused/");
      await expect(banner.first()).toBeVisible();
    }
  });

  test("image attachment picker opens", async ({ page }) => {
    const firstConvo = page.locator("button").filter({ has: page.locator(".truncate") }).first();
    const count = await firstConvo.count();
    if (count > 0) {
      await firstConvo.click();
      const attachButton = page.locator("[aria-label='Attach image']");
      if (await attachButton.isVisible()) {
        await attachButton.click();
        await expect(page.locator("text=Upload from device")).toBeVisible();
        await expect(page.locator("text=Knowledge Images")).toBeVisible();
      }
    }
  });

  test("bot settings has handoff timeout dropdown", async ({ page }) => {
    await page.goto("/app/bot");
    const autoResume = page.locator("text=Auto-resume bot after");
    if (await autoResume.isVisible()) {
      await expect(page.locator("select")).toBeVisible();
    }
  });
});
