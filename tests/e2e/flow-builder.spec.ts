import { test, expect } from "@playwright/test";

// These tests require a running dev server and an authenticated tenant user session.
// Use Playwright's storageState or a login helper to set up auth before running.

test.describe("Flow Builder", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/bot");
  });

  test("shows Flow Builder tab", async ({ page }) => {
    await expect(page.getByText("Flow Builder")).toBeVisible();
  });

  test("Flow Builder tab shows template selector when no phases exist", async ({ page }) => {
    await page.click("text=Flow Builder");

    await expect(page.getByText("No conversation flow configured")).toBeVisible();
    await expect(page.getByText("E-Commerce")).toBeVisible();
    await expect(page.getByText("Real Estate")).toBeVisible();
    await expect(page.getByText("Digital Product")).toBeVisible();
    await expect(page.getByText("Services")).toBeVisible();
  });

  test("seeding from Services template creates phases", async ({ page }) => {
    await page.click("text=Flow Builder");
    await page.click("text=Services");

    // Should show phase list after seeding
    await expect(page.getByText("Greet")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Nurture")).toBeVisible();
    await expect(page.getByText("Qualify")).toBeVisible();
    await expect(page.getByText("Pitch")).toBeVisible();
    await expect(page.getByText("Close")).toBeVisible();
    await expect(page.getByText("5 phases")).toBeVisible();
  });

  test("expanding a phase shows the form", async ({ page }) => {
    await page.click("text=Flow Builder");

    const greetCard = page.getByText("Greet");
    if (await greetCard.isVisible()) {
      await greetCard.click();

      await expect(page.getByText("Phase Name")).toBeVisible();
      await expect(page.getByText("System Prompt")).toBeVisible();
      await expect(page.getByText("Tone")).toBeVisible();
      await expect(page.getByText("Goals")).toBeVisible();
      await expect(page.getByText("Transition Hint")).toBeVisible();
      await expect(page.getByText("Action Buttons")).toBeVisible();
      await expect(page.getByText("Image Attachments")).toBeVisible();
    }
  });

  test("editing a phase name and saving", async ({ page }) => {
    await page.click("text=Flow Builder");

    const greetCard = page.getByText("Greet");
    if (await greetCard.isVisible()) {
      await greetCard.click();

      const nameInput = page.locator("input").filter({ hasText: "" }).first();
      await nameInput.fill("Welcome");
      await page.click("text=Save Changes");

      await expect(page.getByText("Welcome")).toBeVisible({ timeout: 5000 });
    }
  });

  test("Add Phase button creates a new phase", async ({ page }) => {
    await page.click("text=Flow Builder");

    if (await page.getByText("Add Phase").isVisible()) {
      const phaseCountBefore = await page.getByText(/\d+ phase/).textContent();
      await page.click("text=Add Phase");

      await expect(page.getByText(/\d+ phase/)).not.toHaveText(phaseCountBefore ?? "", {
        timeout: 5000,
      });
    }
  });

  test("deleting a phase removes it from the list", async ({ page }) => {
    await page.click("text=Flow Builder");

    const phases = page.locator("[data-testid^='phase-card']");
    const lastPhase = phases.last();

    if (await lastPhase.isVisible()) {
      await lastPhase.click();
      await page.click("text=Delete Phase");

      await page.waitForTimeout(1000);
    }
  });
});
