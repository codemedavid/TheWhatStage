import { test, expect } from "@playwright/test";

// This test requires local Supabase running with auto-confirm enabled
// Run: supabase start (in the project root)

test.describe("Signup → Onboarding → Dashboard", () => {
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = "TestPassword123!";

  test("full signup to tenant creation flow", async ({ page }) => {
    // 1. Go to signup
    await page.goto("http://localhost:3000/signup");
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();

    // 2. Fill in signup form
    await page.getByLabel("Email").fill(testEmail);
    await page.getByLabel("Password").fill(testPassword);
    await page.getByRole("button", { name: "Sign Up" }).click();

    // 3. Should redirect to onboarding (auto-confirm enabled locally)
    await page.waitForURL("**/onboarding");
    await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();

    // 4. Select business type
    await page.getByText("E-Commerce").click();

    // 5. Select bot goal
    await page.getByText("Qualify Leads").click();

    // 6. Enter business name — slug auto-generates
    await page.getByPlaceholder("Acme Corp").fill("Test Business");
    const slugInput = page.locator('input[value="test-business"]');
    await expect(slugInput).toBeVisible();

    // 7. Create workspace
    await page.getByRole("button", { name: "Create Workspace" }).click();

    // 8. Should redirect to tenant subdomain dashboard
    await page.waitForURL("**/app/leads", { timeout: 10000 });
  });

  test("onboarding redirects to login when not authenticated", async ({ page }) => {
    // Clear cookies to ensure no session
    await page.context().clearCookies();
    await page.goto("http://localhost:3000/onboarding");
    await page.waitForURL("**/login");
  });
});
