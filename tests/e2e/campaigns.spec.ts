import { test, expect } from "@playwright/test";

test.describe("Campaign Flow Builder", () => {
  test.beforeEach(async ({ page }) => {
    // Login flow — adjust to your test setup
    await page.goto("/login");
    // ... authenticate ...
  });

  test("can navigate to campaigns page", async ({ page }) => {
    await page.goto("/app/campaigns");
    await expect(page.getByRole("heading", { name: "Campaigns" })).toBeVisible();
  });

  test("can create a new campaign", async ({ page }) => {
    await page.goto("/app/campaigns/new");
    await page.fill('input[placeholder*="Main Booking"]', "Test Campaign");
    await page.click('text=Appointment Booked');
    await page.click('text=Create Campaign');
    await expect(page).toHaveURL(/\/app\/campaigns\/[a-f0-9-]+/);
  });

  test("can view campaign editor tabs", async ({ page }) => {
    await page.goto("/app/campaigns");
    await page.click("text=Default Campaign");
    await expect(page.getByRole("button", { name: "Flow" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Metrics" })).toBeVisible();
  });

  test("can navigate to experiments", async ({ page }) => {
    await page.goto("/app/campaigns/experiments");
    await expect(page.getByRole("heading", { name: "Experiments" })).toBeVisible();
  });
});
