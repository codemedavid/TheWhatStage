import { test, expect } from "@playwright/test";

// These tests require a running dev server and an authenticated tenant user session.
// Use Playwright's storageState or a login helper to set up auth before running.

test.describe("Knowledge editing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/bot");
    await page.waitForSelector("text=Knowledge Base");
  });

  test("adds, edits, and deletes a FAQ", async ({ page }) => {
    await page.click("text=FAQ");

    // --- Add ---
    await page.click("text=Add FAQ");
    const q = `Refund policy ${Date.now()}`;
    await page.getByPlaceholder("Enter the question...").fill(q);
    await page.getByPlaceholder("Enter the answer...").fill("30 days");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(`text=${q}`)).toBeVisible({ timeout: 10_000 });

    // --- Edit ---
    // Locate the list-row Card for this FAQ (not the add-form card) and click its Edit button.
    // The row is rendered as a Card with an aria-label="Edit" button (Pencil icon).
    const row = page.locator("div", { hasText: q }).first();
    await row.getByRole("button", { name: "Edit" }).click();

    // The edit form replaces the row in-place. The answer textarea has no placeholder,
    // so we scope to the edit Card (which no longer shows the pencil/trash buttons).
    // The answer is loaded asynchronously via fetch — wait for the value to appear.
    const editCard = page.locator("div", { hasText: q }).first();
    // There are two textareas inside the edit Card: question input (type="text") and answer textarea.
    // The answer textarea is the only <textarea> rendered in the inline edit form.
    const answerArea = editCard.locator("textarea").first();
    await expect(answerArea).toHaveValue("30 days", { timeout: 5_000 });
    await answerArea.fill("60 days");
    await page.getByRole("button", { name: "Save" }).click();

    // After save the edit card collapses back to the list row — question title still visible.
    await expect(page.locator(`text=${q}`)).toBeVisible({ timeout: 5_000 });

    // --- Delete ---
    // Accept the window.confirm dialog that FaqEditor triggers on delete.
    page.once("dialog", (d) => d.accept());
    const listRow = page.locator("div", { hasText: q }).first();
    await listRow.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator(`text=${q}`)).toHaveCount(0);
  });

  test("unified editor adds, updates, and deletes sections", async ({ page }) => {
    await page.click("text=Editor");

    // The textarea is present in both the empty-state path and the populated path.
    const ta = page.getByTestId("unified-editor-textarea");
    await expect(ta).toBeVisible({ timeout: 10_000 });

    const stamp = Date.now();
    const titleA = `Hours ${stamp}`;
    const titleB = `Contact ${stamp}`;

    // --- Initial create: two new sections ---
    await ta.fill(`## ${titleA}\nMon-Fri 9-5\n\n## ${titleB}\nhello@example.com`);
    await page.getByRole("button", { name: /save & re-embed/i }).click();
    // Body: { created: 2 } → success message "2 added"
    await expect(page.locator("text=2 added")).toBeVisible({ timeout: 30_000 });

    // --- Update one section, leave the other unchanged ---
    await ta.fill(`## ${titleA}\nMon-Sat 9-5\n\n## ${titleB}\nhello@example.com`);
    await page.getByRole("button", { name: /save & re-embed/i }).click();
    // Body: { updated: 1, unchanged: 1 } → success message contains "re-embedded" and "unchanged"
    await expect(page.locator("text=re-embedded")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("text=unchanged")).toBeVisible();

    // --- Delete one section ---
    await ta.fill(`## ${titleA}\nMon-Sat 9-5`);
    await page.getByRole("button", { name: /save & re-embed/i }).click();
    // Body: { unchanged: 1, deleted: 1 } → success message contains "removed"
    await expect(page.locator("text=removed")).toBeVisible({ timeout: 30_000 });
  });
});
