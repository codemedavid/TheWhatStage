import { test, expect } from "@playwright/test";

// These tests require a running dev server and an authenticated tenant user session.
// Use Playwright's storageState or a login helper to set up auth before running.

test.describe("Knowledge Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to bot page (knowledge tab is default)
    await page.goto("/app/bot");
    await page.waitForSelector("text=Knowledge Base");
  });

  test("shows knowledge sub-tabs", async ({ page }) => {
    await expect(page.getByText("Documents")).toBeVisible();
    await expect(page.getByText("FAQ")).toBeVisible();
    await expect(page.getByText("Editor")).toBeVisible();
    await expect(page.getByText("Products")).toBeVisible();
  });

  test("Documents tab shows empty state initially", async ({ page }) => {
    await expect(page.getByText("No documents uploaded")).toBeVisible();
  });

  test("Documents tab shows drag and drop zone", async ({ page }) => {
    await expect(page.getByText(/drag.*drop/i)).toBeVisible();
  });

  test("FAQ tab shows empty state and add form", async ({ page }) => {
    await page.click("text=FAQ");
    await expect(page.getByText("No FAQs added")).toBeVisible();

    await page.click("text=Add FAQ");
    await expect(page.getByPlaceholder(/question/i)).toBeVisible();
    await expect(page.getByPlaceholder(/answer/i)).toBeVisible();
  });

  test("FAQ tab validates empty fields", async ({ page }) => {
    await page.click("text=FAQ");
    await page.click("text=Add FAQ");
    await page.click("text=Save");

    await expect(page.getByText(/question is required/i)).toBeVisible();
  });

  test("Editor tab shows empty state and editor form", async ({ page }) => {
    await page.click("text=Editor");
    await expect(page.getByText("No documents created")).toBeVisible();

    await page.click("text=New Document");
    await expect(page.getByPlaceholder(/document title/i)).toBeVisible();
  });

  test("Products tab shows auto-sync explanation", async ({ page }) => {
    await page.click("text=Products");
    await expect(page.getByText(/automatically synced/i)).toBeVisible();
  });

  test("upload PDF and see it appear in list", async ({ page }) => {
    // Create a fake PDF file for upload
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.click("text=Browse Files");
    const fileChooser = await fileChooserPromise;

    // This test needs a real file — use a test fixture
    // For CI, create a minimal PDF buffer or use a fixture file
    await fileChooser.setFiles({
      name: "test-doc.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 test content"),
    });

    // Should show the doc in list after upload
    await expect(page.getByText("test-doc")).toBeVisible({ timeout: 10000 });
  });

  test("add FAQ and see it appear in list", async ({ page }) => {
    await page.click("text=FAQ");
    await page.click("text=Add FAQ");

    await page.fill('[placeholder*="question"]', "What are your hours?");
    await page.fill('[placeholder*="answer"]', "We are open 9-5 Monday to Friday.");
    await page.click("text=Save");

    await expect(page.getByText("What are your hours?")).toBeVisible({ timeout: 5000 });
  });
});
