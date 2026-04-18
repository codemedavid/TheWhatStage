import { test, expect } from "@playwright/test";

test.describe("Marketing site", () => {
  test("home page loads and shows CTA", async ({ page }) => {
    await page.goto("http://whatstage.lvh.me:3000/");
    await expect(page.getByRole("heading", { name: "WhatStage" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Get Started Free" })).toBeVisible();
  });

  test("signup page renders form", async ({ page }) => {
    await page.goto("http://whatstage.lvh.me:3000/signup");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign Up" })).toBeVisible();
  });

  test("login page renders form", async ({ page }) => {
    await page.goto("http://whatstage.lvh.me:3000/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  });
});
