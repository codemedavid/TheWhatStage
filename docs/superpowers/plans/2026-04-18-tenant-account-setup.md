# Tenant Account Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken signup → onboarding → tenant dashboard flow (401 bug) and harden with transaction safety, reserved slugs, tenant limits, and proper auth guards.

**Architecture:** Extract slug utilities and auth helpers as pure functions. Replace two-step tenant creation with a single Postgres RPC for atomicity. Add server-side auth guard on onboarding. Signup detects auto-confirm vs email-confirm and branches accordingly.

**Tech Stack:** Next.js 16 App Router, Supabase (auth + Postgres), Zod, Vitest, Playwright

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/utils/slug.ts` | Create | Pure functions: `generateSlug()`, `validateSlug()`, `isReservedSlug()` |
| `src/lib/auth/helpers.ts` | Create | Pure function: `needsEmailConfirmation()` |
| `supabase/config.toml` | Create | Local Supabase config (auto-confirm off) |
| `supabase/migrations/0002_create_tenant_function.sql` | Create | Atomic `create_tenant_with_owner` Postgres function |
| `src/app/api/onboarding/create-tenant/route.ts` | Modify | Use RPC, add tenant limit check |
| `src/app/(marketing)/signup/page.tsx` | Modify | Handle auto-confirm vs email-confirm branching |
| `src/app/(marketing)/onboarding/layout.tsx` | Create | Server-side auth guard |
| `src/app/(marketing)/onboarding/page.tsx` | Modify | Use slug utils, fix redirect URL |
| `.env.local.example` | Modify | Add `NEXT_PUBLIC_APP_DOMAIN` |
| `tests/unit/slug.test.ts` | Create | Unit tests for slug utilities |
| `tests/unit/auth-helpers.test.ts` | Create | Unit tests for auth helpers |
| `tests/integration/create-tenant.test.ts` | Create | Integration tests for create-tenant API |
| `tests/e2e/signup-onboarding.spec.ts` | Create | E2E flow test |

---

### Task 1: Slug Utilities

**Files:**
- Create: `src/lib/utils/slug.ts`
- Test: `tests/unit/slug.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/slug.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { generateSlug, validateSlug, isReservedSlug } from "@/lib/utils/slug";

describe("generateSlug", () => {
  it("converts a business name to a slug", () => {
    expect(generateSlug("Acme Corp")).toBe("acme-corp");
  });

  it("strips special characters", () => {
    expect(generateSlug("John's Pizza!")).toBe("johns-pizza");
  });

  it("trims leading and trailing hyphens", () => {
    expect(generateSlug("-hello-")).toBe("hello");
  });

  it("collapses multiple hyphens", () => {
    expect(generateSlug("a    b   c")).toBe("a-b-c");
  });

  it("handles unicode by stripping non-ascii", () => {
    expect(generateSlug("café soleil")).toBe("caf-soleil");
  });

  it("returns empty string for empty input", () => {
    expect(generateSlug("")).toBe("");
  });

  it("handles single character names", () => {
    expect(generateSlug("A")).toBe("a");
  });
});

describe("validateSlug", () => {
  it("returns null for a valid slug", () => {
    expect(validateSlug("acme-corp")).toBeNull();
    expect(validateSlug("abc")).toBeNull();
    expect(validateSlug("my-business-123")).toBeNull();
  });

  it("returns error for empty slug", () => {
    expect(validateSlug("")).toBe("Slug is required");
  });

  it("returns error for slug shorter than 3 characters", () => {
    expect(validateSlug("ab")).toBe("Slug must be 3–63 lowercase letters, numbers, or hyphens");
  });

  it("returns error for slug with uppercase letters", () => {
    expect(validateSlug("Acme")).toBe("Slug must be 3–63 lowercase letters, numbers, or hyphens");
  });

  it("returns error for slug starting with a hyphen", () => {
    expect(validateSlug("-abc")).toBe("Slug must be 3–63 lowercase letters, numbers, or hyphens");
  });

  it("returns error for slug ending with a hyphen", () => {
    expect(validateSlug("abc-")).toBe("Slug must be 3–63 lowercase letters, numbers, or hyphens");
  });

  it("returns error for reserved slugs", () => {
    expect(validateSlug("www")).toBe("This subdomain is reserved");
    expect(validateSlug("app")).toBe("This subdomain is reserved");
    expect(validateSlug("api")).toBe("This subdomain is reserved");
  });
});

describe("isReservedSlug", () => {
  it("returns true for reserved slugs", () => {
    expect(isReservedSlug("www")).toBe(true);
    expect(isReservedSlug("app")).toBe(true);
    expect(isReservedSlug("api")).toBe(true);
  });

  it("returns false for non-reserved slugs", () => {
    expect(isReservedSlug("acme")).toBe(false);
    expect(isReservedSlug("my-shop")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/slug.test.ts`
Expected: FAIL — module `@/lib/utils/slug` not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/utils/slug.ts`:

```typescript
const RESERVED_SLUGS = new Set(["www", "app", "api"]);

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

export function validateSlug(slug: string): string | null {
  if (!slug) return "Slug is required";
  if (isReservedSlug(slug)) return "This subdomain is reserved";
  if (!/^[a-z0-9][a-z0-9\-]{1,61}[a-z0-9]$/.test(slug))
    return "Slug must be 3–63 lowercase letters, numbers, or hyphens";
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/slug.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/slug.ts tests/unit/slug.test.ts
git commit -m "feat: add slug utility functions with tests"
```

---

### Task 2: Auth Helpers

**Files:**
- Create: `src/lib/auth/helpers.ts`
- Test: `tests/unit/auth-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/auth-helpers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { needsEmailConfirmation } from "@/lib/auth/helpers";

describe("needsEmailConfirmation", () => {
  it("returns false when session exists (auto-confirm)", () => {
    const result = {
      data: {
        user: {
          id: "123",
          email: "test@example.com",
          identities: [{ id: "1" }],
          email_confirmed_at: "2026-04-18T00:00:00Z",
        },
        session: { access_token: "abc", refresh_token: "def" },
      },
      error: null,
    };
    expect(needsEmailConfirmation(result)).toBe(false);
  });

  it("returns true when user has no identities (email confirm pending)", () => {
    const result = {
      data: {
        user: {
          id: "123",
          email: "test@example.com",
          identities: [],
          email_confirmed_at: null,
        },
        session: null,
      },
      error: null,
    };
    expect(needsEmailConfirmation(result)).toBe(true);
  });

  it("returns true when session is null but user exists", () => {
    const result = {
      data: {
        user: {
          id: "123",
          email: "test@example.com",
          identities: [{ id: "1" }],
          email_confirmed_at: null,
        },
        session: null,
      },
      error: null,
    };
    expect(needsEmailConfirmation(result)).toBe(true);
  });

  it("returns false when there is an error (let caller handle)", () => {
    const result = {
      data: { user: null, session: null },
      error: { message: "Something went wrong" },
    };
    expect(needsEmailConfirmation(result)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/auth-helpers.test.ts`
Expected: FAIL — module `@/lib/auth/helpers` not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/auth/helpers.ts`:

```typescript
interface SignUpUser {
  id: string;
  email?: string;
  identities?: { id: string }[];
  email_confirmed_at?: string | null;
}

interface SignUpResult {
  data: {
    user: SignUpUser | null;
    session: unknown | null;
  };
  error: { message: string } | null;
}

/**
 * Determines if the signup response indicates email confirmation is needed.
 * Returns true when Supabase requires email verification before the session is active.
 * Returns false on error (let the caller handle errors separately).
 */
export function needsEmailConfirmation(result: SignUpResult): boolean {
  if (result.error || !result.data.user) return false;

  const user = result.data.user;

  // No identities means user already exists or email not confirmed
  if (!user.identities || user.identities.length === 0) return true;

  // Session is null means email confirmation is required
  if (!result.data.session) return true;

  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/auth-helpers.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/helpers.ts tests/unit/auth-helpers.test.ts
git commit -m "feat: add auth helper for email confirmation detection"
```

---

### Task 3: Supabase Config & Migration

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/0002_create_tenant_function.sql`

- [ ] **Step 1: Create Supabase local config**

Create `supabase/config.toml`:

```toml
[project]
id = "whatstage-local"

[api]
port = 54321

[auth]
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://*.lvh.me:3000/**"]
enable_signup = true
enable_confirmations = false

[auth.email]
enable_confirmations = false

[studio]
port = 54323
```

- [ ] **Step 2: Create the atomic tenant creation function**

Create `supabase/migrations/0002_create_tenant_function.sql`:

```sql
-- =============================================================
-- Atomic tenant creation with owner membership
-- =============================================================

create or replace function create_tenant_with_owner(
  p_name        text,
  p_slug        text,
  p_business_type business_type,
  p_bot_goal    bot_goal,
  p_user_id     uuid
)
returns table(id uuid, slug text)
language plpgsql
security definer
as $$
declare
  v_tenant_id uuid;
  v_reserved  text[] := array['www', 'app', 'api'];
begin
  -- Check reserved slugs
  if p_slug = any(v_reserved) then
    raise exception 'Slug "%" is reserved', p_slug
      using errcode = 'P0001';
  end if;

  -- Insert tenant
  insert into tenants (name, slug, business_type, bot_goal)
  values (p_name, p_slug, p_business_type, p_bot_goal)
  returning tenants.id into v_tenant_id;

  -- Insert owner membership
  insert into tenant_members (tenant_id, user_id, role)
  values (v_tenant_id, p_user_id, 'owner');

  -- Return the created tenant
  return query select v_tenant_id as id, p_slug as slug;
end;
$$;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/config.toml supabase/migrations/0002_create_tenant_function.sql
git commit -m "feat: add Supabase local config and atomic tenant creation function"
```

---

### Task 4: Refactor Create-Tenant API Route

**Files:**
- Modify: `src/app/api/onboarding/create-tenant/route.ts`
- Test: `tests/integration/create-tenant.test.ts`

- [ ] **Step 1: Write the integration tests**

Create `tests/integration/create-tenant.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase server client
const mockGetUser = vi.fn();
const mockRpc = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    rpc: mockRpc,
    from: mockFrom,
  })),
}));

import { POST } from "@/app/api/onboarding/create-tenant/route";

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/onboarding/create-tenant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  name: "Acme Corp",
  slug: "acme-corp",
  businessType: "ecommerce",
  botGoal: "qualify_leads",
};

describe("POST /api/onboarding/create-tenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid input", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    const response = await POST(makeRequest({ name: "", slug: "!!", businessType: "invalid", botGoal: "invalid" }));
    expect(response.status).toBe(400);
  });

  it("returns 403 for reserved slugs", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    const response = await POST(makeRequest({ ...validBody, slug: "www" }));
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain("reserved");
  });

  it("returns 409 when user already owns a tenant", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { tenant_id: "existing-tenant" }, error: null }),
          }),
        }),
      }),
    });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.error).toContain("already");
  });

  it("returns 201 on successful tenant creation", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    });
    mockRpc.mockResolvedValue({
      data: { id: "tenant-1", slug: "acme-corp" },
      error: null,
    });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.tenantId).toBe("tenant-1");
    expect(data.slug).toBe("acme-corp");
  });

  it("returns 500 when RPC fails", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "unique constraint", code: "23505" },
    });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/integration/create-tenant.test.ts`
Expected: FAIL — current implementation doesn't match expected behavior (no reserved slug check, no tenant limit)

- [ ] **Step 3: Rewrite the API route**

Replace `src/app/api/onboarding/create-tenant/route.ts` with:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";
import { isReservedSlug } from "@/lib/utils/slug";

const schema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9][a-z0-9\-]{1,61}[a-z0-9]$/),
  businessType: z.enum(["ecommerce", "real_estate", "digital_product", "services"]),
  botGoal: z.enum(["qualify_leads", "sell", "understand_intent", "collect_lead_info"]),
});

export async function POST(request: Request) {
  // 1. Authenticate
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Validate input
  const body = await request.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, slug, businessType, botGoal } = parsed.data;

  // 3. Check reserved slugs
  if (isReservedSlug(slug)) {
    return NextResponse.json(
      { error: "This subdomain is reserved" },
      { status: 403 }
    );
  }

  const service = createServiceClient();

  // 4. Check tenant limit (1 tenant per user)
  const { data: existingMembership } = await service
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (existingMembership) {
    return NextResponse.json(
      { error: "You already own a workspace" },
      { status: 409 }
    );
  }

  // 5. Create tenant + owner atomically via RPC
  const { data, error } = await service.rpc("create_tenant_with_owner", {
    p_name: name,
    p_slug: slug,
    p_business_type: businessType,
    p_bot_goal: botGoal,
    p_user_id: user.id,
  });

  if (error) {
    console.error("Tenant creation error:", error);

    // Duplicate slug
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This subdomain is already taken. Please choose another." },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: "Failed to create workspace" }, { status: 500 });
  }

  return NextResponse.json({ tenantId: data.id, slug: data.slug }, { status: 201 });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/integration/create-tenant.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/onboarding/create-tenant/route.ts tests/integration/create-tenant.test.ts
git commit -m "feat: harden create-tenant API with RPC, tenant limit, reserved slugs"
```

---

### Task 5: Signup Page — Auto-Confirm vs Email-Confirm

**Files:**
- Modify: `src/app/(marketing)/signup/page.tsx`

- [ ] **Step 1: Rewrite the signup page**

Replace `src/app/(marketing)/signup/page.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { needsEmailConfirmation } from "@/lib/auth/helpers";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const result = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }

    if (needsEmailConfirmation(result)) {
      setCheckEmail(true);
      setLoading(false);
      return;
    }

    // Auto-confirm enabled — session is active, go to onboarding
    router.push("/onboarding");
  }

  if (checkEmail) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold mb-4">Check your email</h1>
          <p className="text-gray-600 mb-6">
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
          </p>
          <Link href="/login" className="text-indigo-600 hover:underline">
            Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-6">Create your account</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link href="/login" className="text-indigo-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(marketing)/signup/page.tsx
git commit -m "feat: signup handles auto-confirm and email-confirm flows"
```

---

### Task 6: Onboarding Auth Guard & Page Refactor

**Files:**
- Create: `src/app/(marketing)/onboarding/layout.tsx`
- Modify: `src/app/(marketing)/onboarding/page.tsx`
- Modify: `.env.local.example`

- [ ] **Step 1: Add NEXT_PUBLIC_APP_DOMAIN to env example**

Add to `.env.local.example` after the Supabase section:

```
# App domain (for redirect after onboarding)
NEXT_PUBLIC_APP_DOMAIN=lvh.me:3000
```

- [ ] **Step 2: Create the auth guard layout**

Create `src/app/(marketing)/onboarding/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <>{children}</>;
}
```

- [ ] **Step 3: Refactor the onboarding page**

Replace `src/app/(marketing)/onboarding/page.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { generateSlug, validateSlug, isReservedSlug } from "@/lib/utils/slug";

const BUSINESS_TYPES = [
  { value: "ecommerce", label: "E-Commerce", icon: "🛒" },
  { value: "real_estate", label: "Real Estate", icon: "🏠" },
  { value: "digital_product", label: "Digital Product", icon: "💾" },
  { value: "services", label: "Services", icon: "🤝" },
] as const;

const BOT_GOALS = [
  { value: "qualify_leads", label: "Qualify Leads" },
  { value: "sell", label: "Sell Products / Services" },
  { value: "understand_intent", label: "Understand Intent" },
  { value: "collect_lead_info", label: "Collect Lead Info" },
] as const;

function buildTenantUrl(slug: string): string {
  const domain = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "lvh.me:3000";
  const protocol = domain.includes("localhost") || domain.includes("lvh.me") ? "http" : "https";
  return `${protocol}://${slug}.${domain}/app/leads`;
}

export default function OnboardingPage() {
  const [step, setStep] = useState<"business" | "goal" | "slug">("business");
  const [businessType, setBusinessType] = useState<string>("");
  const [botGoal, setBotGoal] = useState<string>("");
  const [tenantName, setTenantName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(value: string) {
    setTenantName(value);
    const generated = generateSlug(value);
    setSlug(generated);
    setSlugError(null);
  }

  function handleSlugChange(value: string) {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSlug(cleaned);
    setSlugError(null);
  }

  async function handleCreate() {
    const err = validateSlug(slug);
    if (err) {
      setSlugError(err);
      return;
    }

    setError(null);
    setLoading(true);

    const response = await fetch("/api/onboarding/create-tenant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: tenantName, slug, businessType, botGoal }),
    });

    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Something went wrong");
      setLoading(false);
      return;
    }

    window.location.href = buildTenantUrl(data.slug);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">Set up your workspace</h1>
          <p className="text-gray-500 mt-1">Just a few questions to get you started</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {step === "business" && (
          <div>
            <h2 className="text-lg font-semibold mb-4">What type of business do you run?</h2>
            <div className="grid grid-cols-2 gap-3">
              {BUSINESS_TYPES.map((bt) => (
                <button
                  key={bt.value}
                  onClick={() => { setBusinessType(bt.value); setStep("goal"); }}
                  className="flex flex-col items-center p-4 border-2 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
                >
                  <span className="text-3xl mb-2">{bt.icon}</span>
                  <span className="font-medium text-gray-800">{bt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "goal" && (
          <div>
            <h2 className="text-lg font-semibold mb-4">What&apos;s your main bot goal?</h2>
            <div className="space-y-3">
              {BOT_GOALS.map((goal) => (
                <button
                  key={goal.value}
                  onClick={() => { setBotGoal(goal.value); setStep("slug"); }}
                  className="w-full text-left p-4 border-2 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors font-medium"
                >
                  {goal.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "slug" && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Name your workspace</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Business name
                </label>
                <input
                  type="text"
                  value={tenantName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Acme Corp"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subdomain
                </label>
                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500">
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    className="flex-1 px-3 py-2 focus:outline-none"
                  />
                  <span className="px-3 py-2 bg-gray-50 text-gray-500 text-sm border-l border-gray-300">
                    .whatstage.app
                  </span>
                </div>
                {slugError && <p className="mt-1 text-sm text-red-600">{slugError}</p>}
              </div>
              <button
                onClick={handleCreate}
                disabled={loading || !tenantName || !slug}
                className="w-full py-2 px-4 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Creating workspace..." : "Create Workspace"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add .env.local.example src/app/(marketing)/onboarding/layout.tsx src/app/(marketing)/onboarding/page.tsx
git commit -m "feat: add onboarding auth guard, slug utils, explicit redirect URL"
```

---

### Task 7: Update tests/setup.ts

**Files:**
- Modify: `tests/setup.ts`

- [ ] **Step 1: Add NEXT_PUBLIC_APP_DOMAIN to test env**

Add this line to `tests/setup.ts`:

```typescript
process.env.NEXT_PUBLIC_APP_DOMAIN = "lvh.me:3000";
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All existing and new tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/setup.ts
git commit -m "chore: add NEXT_PUBLIC_APP_DOMAIN to test env setup"
```

---

### Task 8: E2E Test — Signup to Dashboard

**Files:**
- Create: `tests/e2e/signup-onboarding.spec.ts`

- [ ] **Step 1: Write the E2E test**

Create `tests/e2e/signup-onboarding.spec.ts`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/signup-onboarding.spec.ts
git commit -m "test: add E2E test for signup to dashboard flow"
```

---

### Task 9: Obsidian Knowledge Graph

**Files:**
- Create Obsidian feature/flow notes using the `obsidian-cli` or `feature-doc` skill

- [ ] **Step 1: Create Obsidian feature note for Tenant Account Setup**

Use the `feature-doc` skill to generate:
- Feature note: "Tenant Account Setup"
- Entity notes: `slug.ts`, `auth/helpers.ts`, `create_tenant_with_owner` function
- Flow note: Signup → Email Confirm/Auto-Confirm → Onboarding → Tenant Creation → Dashboard Redirect

- [ ] **Step 2: Commit Obsidian notes**

```bash
git add whatstage_obsidian/
git commit -m "docs: add Obsidian knowledge graph notes for tenant account setup"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Run all unit and integration tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Run type checking**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run linting**

Run: `npm run lint`
Expected: No lint errors

- [ ] **Step 4: Start local Supabase and run E2E test**

Run:
```bash
supabase start
npx playwright test tests/e2e/signup-onboarding.spec.ts
```
Expected: E2E test PASSES

- [ ] **Step 5: Manual smoke test**

1. Open `http://localhost:3000/signup`
2. Create account with test email
3. Verify redirect to `/onboarding`
4. Fill in business type, bot goal, workspace name
5. Verify slug auto-generates from business name
6. Click "Create Workspace"
7. Verify redirect to `http://{slug}.lvh.me:3000/app/leads`
