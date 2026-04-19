import { test, expect, type Page } from "@playwright/test";

/**
 * Full end-to-end test for Phase 7: Conversation Flow Builder.
 *
 * Strategy: Create user+tenant via API, login via Supabase client in page context,
 * then test all Flow Builder functionality.
 */

const TEST_EMAIL = `flow-e2e-${Date.now()}@example.com`;
const TEST_PASSWORD = "TestPassword123!";
const BUSINESS_NAME = `flowtest${Date.now()}`;
// Slug must be lowercase, 3-63 chars, alphanumeric with hyphens
const TENANT_SLUG = `flow-e2e-${Date.now()}`.slice(0, 30);

async function waitForSettled(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://aeummxsqtcuhgxrmfkow.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFldW1teHNxdGN1aGd4cm1ma293Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MzQzMjksImV4cCI6MjA5MjAxMDMyOX0.bWV9w8GAqE_6vUXIwlCNk-zkN6LoJaekh8yaZ2Gahck";

/**
 * Helper: login by calling Supabase auth REST API directly,
 * then setting the session cookies in the browser context.
 */
async function login(page: Page) {
  // Get session tokens from Supabase auth API
  const tokenRes = await page.request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });

  expect(tokenRes.ok()).toBe(true);
  const session = await tokenRes.json();

  // Set Supabase auth cookies on .lvh.me domain
  // Supabase SSR stores tokens in cookies with specific names
  const projectRef = SUPABASE_URL.replace("https://", "").split(".")[0];
  const cookieBase = `sb-${projectRef}-auth-token`;

  // The Supabase SSR client stores the session as chunked cookies
  const cookieValue = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + session.expires_in,
    expires_in: session.expires_in,
    token_type: "bearer",
    type: "access",
  });

  // Set chunked cookies (Supabase SSR splits by 3500 char chunks)
  const chunks = [];
  for (let i = 0; i < cookieValue.length; i += 3500) {
    chunks.push(cookieValue.slice(i, i + 3500));
  }

  const cookies = chunks.map((chunk, i) => ({
    name: chunks.length === 1 ? cookieBase : `${cookieBase}.${i}`,
    value: chunk,
    domain: ".lvh.me",
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
  }));

  await page.context().addCookies(cookies);

  // Navigate to login page — middleware will detect session and redirect
  await page.goto("http://lvh.me:3000/login");
  // The page should auto-redirect since we have a valid session
  // If not, the login page's client-side check will fire
  await page.waitForTimeout(2000);
}

async function loginAndNavigate(page: Page, slug: string, path: string) {
  // Try navigating directly — if already logged in, cookies carry over
  await page.goto(`http://${slug}.lvh.me:3000${path}`);
  await waitForSettled(page);

  const url = page.url();
  if (url.includes("/login") || (!url.includes("/app/") && !url.includes("/onboarding"))) {
    await login(page);
    await page.goto(`http://${slug}.lvh.me:3000${path}`);
    await waitForSettled(page);
  }
}

test.describe.serial("Flow Builder — Full E2E", () => {
  let tenantSlug: string;

  test("1. Setup: Create user and tenant via API", async ({ request }) => {
    // 1. Create user
    const signupRes = await request.post("http://lvh.me:3000/api/auth/signup", {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(signupRes.ok()).toBe(true);
    console.log(`✓ User created: ${TEST_EMAIL}`);

    // 2. Create tenant via the onboarding API
    // First we need to login to get a session. Use the tenant creation API directly.
    const createTenantRes = await request.post("http://lvh.me:3000/api/onboarding/create-tenant", {
      data: {
        name: BUSINESS_NAME,
        slug: TENANT_SLUG,
        business_type: "services",
        bot_goal: "qualify_leads",
      },
    });

    // If this requires auth, we'll need to login first
    if (createTenantRes.status() === 401) {
      console.log("Create tenant requires auth — will create via UI login");
      tenantSlug = "";
    } else {
      expect(createTenantRes.ok()).toBe(true);
      tenantSlug = TENANT_SLUG;
      console.log(`✓ Tenant created: ${tenantSlug}`);
    }
  });

  test("2. Login and create tenant via API", async ({ page }) => {
    await login(page);

    // Create tenant via API using the authenticated session cookies
    const createRes = await page.request.post("http://lvh.me:3000/api/onboarding/create-tenant", {
      data: {
        name: BUSINESS_NAME,
        slug: TENANT_SLUG,
        businessType: "services",
        botGoal: "qualify_leads",
        firstName: "Test",
        lastName: "User",
        botTone: "friendly",
        botRules: [],
        customInstruction: "",
        actionTypes: [],
      },
    });

    if (createRes.status() === 409) {
      // Tenant slug already exists — extract it or use known slug
      console.log("Tenant already exists, proceeding...");
      tenantSlug = TENANT_SLUG;
    } else {
      expect(createRes.ok()).toBe(true);
      tenantSlug = TENANT_SLUG;
    }

    // Verify we can access the tenant dashboard
    await page.goto(`http://${tenantSlug}.lvh.me:3000/app/bot`);
    await waitForSettled(page);

    // Should show the bot page (not a 404)
    await expect(page.getByRole("heading", { name: "Bot" })).toBeVisible({ timeout: 10000 });

    console.log(`✓ Tenant created and accessible: ${tenantSlug}`);
  });

  test("3. Bot page shows Flow Builder tab", async ({ page }) => {
    await loginAndNavigate(page, tenantSlug, "/app/bot");

    // Verify all tabs including Flow Builder
    await expect(page.getByText("Knowledge Base")).toBeVisible();
    await expect(page.getByText("Flow Builder")).toBeVisible();
    await expect(page.getByText("Rules & Persona")).toBeVisible();
    await expect(page.getByText("Test Chat")).toBeVisible();
    await expect(page.getByText("Review")).toBeVisible();

    console.log("✓ All 5 tabs visible including Flow Builder");
  });

  test("4. Flow Builder shows TemplateSelector for new tenant", async ({ page }) => {
    await loginAndNavigate(page, tenantSlug, "/app/bot");

    await page.getByText("Flow Builder").click();
    await waitForSettled(page);

    // Should show template selector (no phases exist yet)
    await expect(page.getByText("No conversation flow configured")).toBeVisible({ timeout: 10000 });

    // All 4 templates visible
    await expect(page.getByText("E-Commerce")).toBeVisible();
    await expect(page.getByText("Real Estate")).toBeVisible();
    await expect(page.getByText("Digital Product")).toBeVisible();
    await expect(page.getByText("Services")).toBeVisible();

    console.log("✓ TemplateSelector shown with 4 templates");
  });

  test("5. Seed Services template creates 5 phases", async ({ page }) => {
    await loginAndNavigate(page, tenantSlug, "/app/bot");

    await page.getByText("Flow Builder").click();
    await waitForSettled(page);

    // Click Services template button
    await page.getByText("Services").first().click();

    // Wait for seeding — phases should appear
    await expect(page.getByText("5 phases")).toBeVisible({ timeout: 15000 });

    // Verify all 5 phases
    await expect(page.getByText("Greet")).toBeVisible();
    await expect(page.getByText("Nurture")).toBeVisible();
    await expect(page.getByText("Qualify")).toBeVisible();
    await expect(page.getByText("Pitch")).toBeVisible();
    await expect(page.getByText("Close")).toBeVisible();

    // Add Phase button present
    await expect(page.getByRole("button", { name: "Add Phase" })).toBeVisible();

    console.log("✓ 5 Services phases seeded");
  });

  test("6. Expand phase card reveals form with all fields", async ({ page }) => {
    await loginAndNavigate(page, tenantSlug, "/app/bot");
    await page.getByText("Flow Builder").click();
    await expect(page.getByText("5 phases")).toBeVisible({ timeout: 10000 });

    // Click Greet phase to expand
    await page.getByText("Greet").click();

    // All form labels visible (use label locator to avoid matching textarea content)
    await expect(page.getByText("Phase Name")).toBeVisible();
    await expect(page.getByText("Max Messages")).toBeVisible();
    await expect(page.getByText("System Prompt")).toBeVisible();
    await expect(page.locator("label").filter({ hasText: "Tone" })).toBeVisible();
    await expect(page.locator("label").filter({ hasText: "Goals" })).toBeVisible();
    await expect(page.getByText("Transition Hint")).toBeVisible();
    await expect(page.getByText("Action Buttons")).toBeVisible();
    await expect(page.getByText("Image Attachments")).toBeVisible();

    // Save and Delete buttons present
    await expect(page.getByRole("button", { name: "Save Changes", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete Phase", exact: true })).toBeVisible();

    console.log("✓ Phase form renders with all fields");
  });

  test("7. Edit phase name via API and verify in UI", async ({ page }) => {
    await loginAndNavigate(page, tenantSlug, "/app/bot");
    await page.getByText("Flow Builder").click();
    await expect(page.getByText("5 phases")).toBeVisible({ timeout: 10000 });

    // Get the first phase ID via API
    const phasesData = await page.evaluate(async () => {
      const res = await fetch("/api/bot/phases");
      return res.json();
    });
    const firstPhaseId = phasesData.phases[0].id;

    // Update name via API (tests API correctness)
    const updateResult = await page.evaluate(async ({ id }) => {
      const res = await fetch(`/api/bot/phases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Welcome" }),
      });
      return { status: res.status, body: await res.json() };
    }, { id: firstPhaseId });

    expect(updateResult.status).toBe(200);
    expect(updateResult.body.phase.name).toBe("Welcome");

    // Reload and verify UI shows the new name
    await page.reload();
    await waitForSettled(page);
    await page.getByText("Flow Builder").click();
    await expect(page.getByText("5 phases")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Welcome")).toBeVisible({ timeout: 5000 });

    console.log("✓ Phase renamed to 'Welcome' and persisted");
  });

  test("8. Add and delete phase via API", async ({ page }) => {
    await loginAndNavigate(page, tenantSlug, "/app/bot");

    // Get current phase count
    const before = await page.evaluate(async () => {
      const res = await fetch("/api/bot/phases");
      return res.json();
    });
    const countBefore = before.phases.length;

    // Create a new phase via API
    const createRes = await page.evaluate(async (idx) => {
      const res = await fetch("/api/bot/phases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Phase",
          order_index: idx,
          max_messages: 3,
          system_prompt: "Test prompt",
        }),
      });
      return { status: res.status, body: await res.json() };
    }, countBefore);

    expect(createRes.status).toBe(201);
    const newPhaseId = createRes.body.phase.id;

    // Verify count increased
    const afterAdd = await page.evaluate(async () => {
      const res = await fetch("/api/bot/phases");
      return res.json();
    });
    expect(afterAdd.phases.length).toBe(countBefore + 1);

    // Delete the phase we just created
    const deleteRes = await page.evaluate(async (id) => {
      const res = await fetch(`/api/bot/phases/${id}`, { method: "DELETE" });
      return res.status;
    }, newPhaseId);
    expect(deleteRes).toBe(204);

    // Verify count back to original
    const afterDelete = await page.evaluate(async () => {
      const res = await fetch("/api/bot/phases");
      return res.json();
    });
    expect(afterDelete.phases.length).toBe(countBefore);

    // Verify in UI
    await page.getByText("Flow Builder").click();
    await expect(page.getByText(`${countBefore} phases`)).toBeVisible({ timeout: 10000 });

    console.log(`✓ Phase added and deleted, count stable at ${countBefore}`);
  });

  test("10. API: GET /api/bot/phases returns correct data", async ({ page }) => {
    await loginAndNavigate(page, tenantSlug, "/app/bot");

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/bot/phases");
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(200);
    expect(Array.isArray(result.body.phases)).toBe(true);
    expect(result.body.phases.length).toBe(5);

    // Verify ordering
    for (let i = 1; i < result.body.phases.length; i++) {
      expect(result.body.phases[i].order_index).toBeGreaterThanOrEqual(
        result.body.phases[i - 1].order_index
      );
    }

    // Verify fields exist
    const phase = result.body.phases[0];
    expect(phase).toHaveProperty("id");
    expect(phase).toHaveProperty("name");
    expect(phase).toHaveProperty("system_prompt");
    expect(phase).toHaveProperty("tone");
    expect(phase).toHaveProperty("image_attachment_ids");

    console.log("✓ GET /api/bot/phases returns valid data");
  });

  test("11. API: PATCH updates phase correctly", async ({ page }) => {
    await loginAndNavigate(page, tenantSlug, "/app/bot");

    // Get a phase ID
    const phasesData = await page.evaluate(async () => {
      const res = await fetch("/api/bot/phases");
      return res.json();
    });

    const phaseId = phasesData.phases[1].id; // Second phase (Nurture)

    // Update tone
    const updateResult = await page.evaluate(async (id) => {
      const res = await fetch(`/api/bot/phases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone: "warm and empathetic" }),
      });
      return { status: res.status, body: await res.json() };
    }, phaseId);

    expect(updateResult.status).toBe(200);
    expect(updateResult.body.phase.tone).toBe("warm and empathetic");

    console.log("✓ PATCH updates phase correctly");
  });

  test("12. API: Reorder swaps phases", async ({ page }) => {
    await loginAndNavigate(page, tenantSlug, "/app/bot");

    const before = await page.evaluate(async () => {
      const res = await fetch("/api/bot/phases");
      return res.json();
    });

    const phases = before.phases;

    // Swap first two
    const order = phases.map((p: any, i: number) => ({ id: p.id, order_index: i }));
    [order[0].order_index, order[1].order_index] = [order[1].order_index, order[0].order_index];

    const reorderResult = await page.evaluate(async (payload) => {
      const res = await fetch("/api/bot/phases/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: payload }),
      });
      return { status: res.status, body: await res.json() };
    }, order);

    expect(reorderResult.status).toBe(200);

    // Verify swap
    const after = await page.evaluate(async () => {
      const res = await fetch("/api/bot/phases");
      return res.json();
    });

    expect(after.phases[0].id).toBe(phases[1].id);
    expect(after.phases[1].id).toBe(phases[0].id);

    // Swap back
    await page.evaluate(async (payload) => {
      [payload[0].order_index, payload[1].order_index] = [payload[1].order_index, payload[0].order_index];
      await fetch("/api/bot/phases/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: payload }),
      });
    }, order);

    console.log("✓ Reorder swaps phases correctly");
  });

  test("13. API: Unauthenticated returns 401", async ({ page }) => {
    // Clear cookies
    await page.goto("http://lvh.me:3000");
    await page.context().clearCookies();

    const endpoints = ["/api/bot/phases", "/api/bot/action-pages", "/api/knowledge/images/list"];

    for (const ep of endpoints) {
      const status = await page.evaluate(async (url) => {
        const res = await fetch(url);
        return res.status;
      }, ep);
      expect(status).toBe(401);
    }

    console.log("✓ All API routes return 401 unauthenticated");
  });

  test("14. API: Validation returns 400 for bad input", async ({ page }) => {
    await loginAndNavigate(page, tenantSlug, "/app/bot");

    // Empty name
    const r1 = await page.evaluate(async () => {
      const res = await fetch("/api/bot/phases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "", order_index: 0, system_prompt: "" }),
      });
      return res.status;
    });
    expect(r1).toBe(400);

    // Invalid business type for seed
    const r2 = await page.evaluate(async () => {
      const res = await fetch("/api/bot/phases/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_type: "invalid" }),
      });
      return res.status;
    });
    expect(r2).toBe(400);

    // Empty reorder array
    const r3 = await page.evaluate(async () => {
      const res = await fetch("/api/bot/phases/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: [] }),
      });
      return res.status;
    });
    expect(r3).toBe(400);

    console.log("✓ Validation returns 400 for bad input");
  });
});
