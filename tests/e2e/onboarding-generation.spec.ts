import { test, expect } from "@playwright/test";

test.describe("Automated Onboarding", () => {
  test("new user completes onboarding wizard through generation", async ({ page }) => {
    await page.goto("/onboarding");

    // Step 1: Profile
    await page.fill('input[name="firstName"]', "Test");
    await page.fill('input[name="lastName"]', "User");
    await page.fill('input[name="businessName"]', "Test Business");
    await page.waitForTimeout(500);
    await page.click('button:has-text("Continue")');

    // Step 2: Industry
    await page.click('[data-value="ecommerce"]');
    await page.click('button:has-text("Continue")');

    // Step 3: Goal
    await page.click('[data-value="sell"]');
    await page.click('button:has-text("Continue")');

    // Step 4: Business Info
    await page.fill("#businessDescription", "We sell premium test products for testing purposes only");
    await page.selectOption("#mainAction", "purchase");
    await page.fill("#qualificationCriteria", "Budget and timeline requirements");
    await page.click('button:has-text("Continue")');

    // Step 5: Website URL — verify renders then skip
    await expect(page.locator("h2")).toContainText("Got a website");
    await page.click('button:has-text("Skip")');

    // Step 6: Generation — verify loading screen appears
    await expect(page.locator("h2")).toContainText("Setting up your bot");
  });
});
