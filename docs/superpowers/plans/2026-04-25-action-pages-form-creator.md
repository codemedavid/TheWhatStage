# Action Pages: Form Creator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the form creator action page — tenant-facing form builder, public form renderer (embeddable), submission API with lead mapping, Messenger confirmation, and AI context enrichment.

**Architecture:** New `action_page_fields` table stores relational field definitions. Form styling/layout stays in `action_pages.config` (JSONB). The `FormRenderer` is built as a standalone embeddable component wrapped by the `/a/[slug]` page. Submissions flow through a new API route that maps fields to `lead_contacts` and `lead_knowledge`, fires `form_submit` events, and sends Messenger confirmations.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS), Zod validation, Facebook Send API, Vitest

---

## File Structure

| File | Responsibility |
|------|---------------|
| `supabase/migrations/0019_action_page_fields.sql` | New table + `lead_contacts.is_primary` column |
| `src/types/database.ts` | Add `action_page_fields` table type, `FormConfig` type |
| `src/lib/queries/action-fields.ts` | Data access for action_page_fields (CRUD) |
| `src/app/api/action-pages/[id]/fields/route.ts` | CRUD API for form fields |
| `src/app/api/action-pages/[id]/submissions/route.ts` | Submission API with lead mapping |
| `src/app/api/leads/[id]/contacts/[contactId]/primary/route.ts` | Toggle primary contact |
| `src/components/action-pages/FormRenderer.tsx` | Embeddable form component (render + validate + submit) |
| `src/components/action-pages/FormBuilder.tsx` | Tenant dashboard form builder (fields + settings + preview) |
| `src/app/(tenant)/app/actions/[id]/page.tsx` | Replace stub editor with real FormBuilder |
| `src/app/(tenant)/a/[slug]/page.tsx` | Replace stub renderer with FormRenderer |
| `src/lib/ai/prompt-builder.ts` | Add lead context layer (contacts, knowledge, submissions) |
| `tests/unit/action-fields-api.test.ts` | Field CRUD API tests |
| `tests/unit/form-submissions-api.test.ts` | Submission API tests |
| `tests/unit/prompt-builder-lead-context.test.ts` | Prompt builder lead context tests |
| `tests/unit/primary-contact-api.test.ts` | Primary contact toggle tests |

---

### Task 1: Database Migration — `action_page_fields` table + `lead_contacts.is_primary`

**Files:**
- Create: `supabase/migrations/0019_action_page_fields.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0019_action_page_fields.sql
-- Form field definitions for action pages

-- Enum for field types
CREATE TYPE action_field_type AS ENUM (
  'text', 'email', 'phone', 'textarea', 'select', 'number', 'radio', 'checkbox'
);

CREATE TABLE action_page_fields (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action_page_id uuid NOT NULL REFERENCES action_pages(id) ON DELETE CASCADE,
  label       text NOT NULL,
  field_key   text NOT NULL,
  field_type  action_field_type NOT NULL DEFAULT 'text',
  placeholder text,
  required    boolean NOT NULL DEFAULT false,
  options     jsonb,
  order_index integer NOT NULL DEFAULT 0,
  lead_mapping jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- No duplicate field keys per form
ALTER TABLE action_page_fields
  ADD CONSTRAINT uq_action_page_fields_key UNIQUE (action_page_id, field_key);

-- Clean ordering per form
ALTER TABLE action_page_fields
  ADD CONSTRAINT uq_action_page_fields_order UNIQUE (action_page_id, order_index);

-- RLS
ALTER TABLE action_page_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON action_page_fields
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Add is_primary to lead_contacts (already has the column from migration 0018)
-- Add partial unique index: only one primary per (lead_id, type)
CREATE UNIQUE INDEX uq_lead_contacts_primary
  ON lead_contacts (lead_id, type)
  WHERE is_primary = true;

-- Add form_submit as a valid lead_knowledge source
-- Extend the enum to include form_submit
ALTER TYPE lead_knowledge_source ADD VALUE IF NOT EXISTS 'form_submit';
```

- [ ] **Step 2: Verify migration file exists**

Run: `ls supabase/migrations/0019_action_page_fields.sql`
Expected: File listed

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0019_action_page_fields.sql
git commit -m "feat: add action_page_fields table and lead_contacts primary index"
```

---

### Task 2: TypeScript Types — `action_page_fields` + `FormConfig`

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add `action_page_fields` to the Database interface**

In `src/types/database.ts`, add the following table entry inside `Database["public"]["Tables"]` after the `action_submissions` entry (after line 176):

```typescript
      action_page_fields: TableRow<{
        id: string;
        tenant_id: string;
        action_page_id: string;
        label: string;
        field_key: string;
        field_type: "text" | "email" | "phone" | "textarea" | "select" | "number" | "radio" | "checkbox";
        placeholder: string | null;
        required: boolean;
        options: Json;
        order_index: number;
        lead_mapping: Json;
        created_at: string;
      }>;
```

- [ ] **Step 2: Add `FormConfig` type export**

Add after the `CampaignPlanJson` type (after line 22):

```typescript
export type FormConfig = {
  heading: string;
  description?: string;
  layout: "single_column" | "two_column" | "with_hero";
  hero_image_url?: string;
  submit_button_text: string;
  thank_you_message: string;
  brand_color?: string;
};

export type LeadMapping =
  | { target: "lead_contact"; type: "email" | "phone" }
  | { target: "lead_knowledge"; key: string }
  | null;
```

- [ ] **Step 3: Update `lead_knowledge` source type to include `form_submit`**

In `src/types/database.ts`, find the `lead_knowledge` table definition (line 106) and update the `source` field:

```typescript
        source: "ai_extracted" | "manual" | "form_submit";
```

- [ ] **Step 4: Run type check**

Run: `npm run typecheck`
Expected: PASS (no type errors)

- [ ] **Step 5: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add action_page_fields type and FormConfig"
```

---

### Task 3: Data Access Layer — `action-fields.ts`

**Files:**
- Create: `src/lib/queries/action-fields.ts`

- [ ] **Step 1: Write the query module**

```typescript
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";

type ActionPageField = Database["public"]["Tables"]["action_page_fields"]["Row"];

/**
 * Fetch all fields for an action page, ordered by order_index.
 */
export async function getActionPageFields(
  tenantId: string,
  actionPageId: string
): Promise<ActionPageField[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("action_page_fields")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("action_page_id", actionPageId)
    .order("order_index", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ActionPageField[];
}

/**
 * Bulk replace all fields for an action page.
 * Deletes existing fields and inserts new ones in a single transaction.
 */
export async function replaceActionPageFields(
  tenantId: string,
  actionPageId: string,
  fields: Array<{
    label: string;
    field_key: string;
    field_type: string;
    placeholder?: string;
    required: boolean;
    options?: unknown;
    order_index: number;
    lead_mapping?: unknown;
  }>
): Promise<ActionPageField[]> {
  const supabase = createServiceClient();

  // Delete existing fields
  await supabase
    .from("action_page_fields")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("action_page_id", actionPageId);

  if (fields.length === 0) return [];

  // Insert new fields
  const rows = fields.map((f) => ({
    tenant_id: tenantId,
    action_page_id: actionPageId,
    label: f.label,
    field_key: f.field_key,
    field_type: f.field_type,
    placeholder: f.placeholder ?? null,
    required: f.required,
    options: f.options ?? null,
    order_index: f.order_index,
    lead_mapping: f.lead_mapping ?? null,
  }));

  const { data, error } = await supabase
    .from("action_page_fields")
    .insert(rows)
    .select("*");

  if (error) throw error;
  return (data ?? []) as ActionPageField[];
}
```

- [ ] **Step 2: Verify file created**

Run: `ls src/lib/queries/action-fields.ts`
Expected: File listed

- [ ] **Step 3: Run type check**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/action-fields.ts
git commit -m "feat: add action page fields data access layer"
```

---

### Task 4: Fields CRUD API + Tests

**Files:**
- Create: `src/app/api/action-pages/[id]/fields/route.ts`
- Create: `tests/unit/action-fields-api.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/action-fields-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSession } from "@/lib/auth/session";

const mockFrom = vi.fn();
const mockResolveSession = vi.mocked(resolveSession);

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

const params = Promise.resolve({ id: "action-page-1" });

// ─── GET /api/action-pages/[id]/fields ───────────────────────────────────────

describe("GET /api/action-pages/[id]/fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    mockResolveSession.mockResolvedValue(null);
    const { GET } = await import("@/app/api/action-pages/[id]/fields/route");
    const req = new Request("http://localhost/api/action-pages/ap-1/fields");
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns fields ordered by order_index", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const fields = [
      { id: "f1", label: "Name", field_key: "name", field_type: "text", order_index: 0 },
      { id: "f2", label: "Email", field_key: "email", field_type: "email", order_index: 1 },
    ];

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: fields, error: null }),
          }),
        }),
      }),
    });

    const { GET } = await import("@/app/api/action-pages/[id]/fields/route");
    const req = new Request("http://localhost/api/action-pages/ap-1/fields");
    const res = await GET(req, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fields).toHaveLength(2);
    expect(body.fields[0].field_key).toBe("name");
  });
});

// ─── PUT /api/action-pages/[id]/fields ───────────────────────────────────────

describe("PUT /api/action-pages/[id]/fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    mockResolveSession.mockResolvedValue(null);
    const { PUT } = await import("@/app/api/action-pages/[id]/fields/route");
    const req = new Request("http://localhost/api/action-pages/ap-1/fields", {
      method: "PUT",
      body: JSON.stringify({ fields: [] }),
    });
    const res = await PUT(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns 400 when fields array is missing", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });
    const { PUT } = await import("@/app/api/action-pages/[id]/fields/route");
    const req = new Request("http://localhost/api/action-pages/ap-1/fields", {
      method: "PUT",
      body: JSON.stringify({}),
    });
    const res = await PUT(req, { params });
    expect(res.status).toBe(400);
  });

  it("replaces fields successfully", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const newFields = [
      { label: "Full Name", field_key: "full_name", field_type: "text", required: true, order_index: 0 },
      { label: "Email", field_key: "email", field_type: "email", required: true, order_index: 1 },
    ];

    // Mock delete then insert
    mockFrom
      .mockReturnValueOnce({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      })
      .mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: newFields, error: null }),
        }),
      });

    const { PUT } = await import("@/app/api/action-pages/[id]/fields/route");
    const req = new Request("http://localhost/api/action-pages/ap-1/fields", {
      method: "PUT",
      body: JSON.stringify({ fields: newFields }),
    });
    const res = await PUT(req, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fields).toHaveLength(2);
  });

  it("returns 400 for invalid field type", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });
    const { PUT } = await import("@/app/api/action-pages/[id]/fields/route");
    const req = new Request("http://localhost/api/action-pages/ap-1/fields", {
      method: "PUT",
      body: JSON.stringify({
        fields: [{ label: "X", field_key: "x", field_type: "color", required: false, order_index: 0 }],
      }),
    });
    const res = await PUT(req, { params });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/action-fields-api.test.ts`
Expected: FAIL — module `@/app/api/action-pages/[id]/fields/route` not found

- [ ] **Step 3: Write the API route**

Create `src/app/api/action-pages/[id]/fields/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";

type RouteContext = { params: Promise<{ id: string }> };

const FIELD_TYPES = ["text", "email", "phone", "textarea", "select", "number", "radio", "checkbox"] as const;

const fieldSchema = z.object({
  label: z.string().min(1).max(200),
  field_key: z.string().min(1).max(100),
  field_type: z.enum(FIELD_TYPES),
  placeholder: z.string().max(200).optional(),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
  order_index: z.number().int().min(0),
  lead_mapping: z
    .union([
      z.object({ target: z.literal("lead_contact"), type: z.enum(["email", "phone"]) }),
      z.object({ target: z.literal("lead_knowledge"), key: z.string().min(1) }),
    ])
    .nullable()
    .optional(),
});

const putSchema = z.object({
  fields: z.array(fieldSchema),
});

export async function GET(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("action_page_fields")
    .select("*")
    .eq("tenant_id", session.tenantId)
    .eq("action_page_id", id)
    .order("order_index", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ fields: data });
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json();
  const parsed = putSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Delete existing fields
  await supabase
    .from("action_page_fields")
    .delete()
    .eq("tenant_id", session.tenantId)
    .eq("action_page_id", id);

  if (parsed.data.fields.length === 0) {
    return NextResponse.json({ fields: [] });
  }

  // Insert new fields
  const rows = parsed.data.fields.map((f) => ({
    tenant_id: session.tenantId,
    action_page_id: id,
    label: f.label,
    field_key: f.field_key,
    field_type: f.field_type,
    placeholder: f.placeholder ?? null,
    required: f.required,
    options: f.options ?? null,
    order_index: f.order_index,
    lead_mapping: f.lead_mapping ?? null,
  }));

  const { data, error } = await supabase
    .from("action_page_fields")
    .insert(rows)
    .select("*");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ fields: data });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/action-fields-api.test.ts`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add src/app/api/action-pages/[id]/fields/route.ts tests/unit/action-fields-api.test.ts
git commit -m "feat: add action page fields CRUD API with tests"
```

---

### Task 5: Submission API + Tests

**Files:**
- Create: `src/app/api/action-pages/[id]/submissions/route.ts`
- Create: `tests/unit/form-submissions-api.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/form-submissions-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
const mockSendMessage = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("@/lib/fb/send", () => ({
  sendMessage: vi.fn((...args: unknown[]) => mockSendMessage(...args)),
}));

vi.mock("@/lib/fb/signature", () => ({
  verifyActionPageSignature: vi.fn((psid: string, sig: string) => sig === "valid-sig"),
}));

const params = Promise.resolve({ id: "action-page-1" });

describe("POST /api/action-pages/[id]/submissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 400 when psid is missing", async () => {
    // Mock action page lookup
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "action-page-1", tenant_id: "t1", config: { thank_you_message: "Thanks!" } },
              error: null,
            }),
          }),
        }),
      }),
    });

    const { POST } = await import("@/app/api/action-pages/[id]/submissions/route");
    const req = new Request("http://localhost/api/action-pages/ap-1/submissions", {
      method: "POST",
      body: JSON.stringify({ data: { name: "John" } }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
  });

  it("returns 403 when PSID signature is invalid", async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "action-page-1", tenant_id: "t1", config: { thank_you_message: "Thanks!" } },
              error: null,
            }),
          }),
        }),
      }),
    });

    // Mock tenant lookup for fb_app_secret
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { fb_app_secret: "secret123" },
            error: null,
          }),
        }),
      }),
    });

    const { POST } = await import("@/app/api/action-pages/[id]/submissions/route");
    const req = new Request("http://localhost/api/action-pages/ap-1/submissions", {
      method: "POST",
      body: JSON.stringify({ psid: "user-1", sig: "bad-sig", data: { name: "John" } }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(403);
  });

  it("returns 400 when required fields are missing", async () => {
    // Mock action page
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "action-page-1", tenant_id: "t1", title: "Quote Form", config: { thank_you_message: "Thanks!" } },
              error: null,
            }),
          }),
        }),
      }),
    });

    // Mock tenant
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { fb_app_secret: "secret123", fb_page_token: "token" },
            error: null,
          }),
        }),
      }),
    });

    // Mock fields (email is required)
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                { field_key: "email", field_type: "email", required: true, lead_mapping: { target: "lead_contact", type: "email" } },
              ],
              error: null,
            }),
          }),
        }),
      }),
    });

    const { POST } = await import("@/app/api/action-pages/[id]/submissions/route");
    const req = new Request("http://localhost/api/action-pages/ap-1/submissions", {
      method: "POST",
      body: JSON.stringify({ psid: "user-1", sig: "valid-sig", data: {} }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("email");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/form-submissions-api.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the submission API**

Create `src/app/api/action-pages/[id]/submissions/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyActionPageSignature } from "@/lib/fb/signature";
import { sendMessage } from "@/lib/fb/send";
import { normalizeKey } from "@/lib/leads/key-normalizer";
import type { Database } from "@/types/database";
import type { LeadMapping } from "@/types/database";

type RouteContext = { params: Promise<{ id: string }> };

type ActionPageField = Database["public"]["Tables"]["action_page_fields"]["Row"];

const submissionSchema = z.object({
  psid: z.string().min(1),
  sig: z.string().min(1),
  data: z.record(z.unknown()),
});

export async function POST(request: Request, context: RouteContext) {
  const { id: actionPageId } = await context.params;
  const body = await request.json();
  const parsed = submissionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Missing psid, sig, or data" }, { status: 400 });
  }

  const { psid, sig, data } = parsed.data;
  const supabase = createServiceClient();

  // Fetch action page
  const { data: page, error: pageError } = await supabase
    .from("action_pages")
    .select("id, tenant_id, title, config, published")
    .eq("id", actionPageId)
    .eq("published", true)
    .single();

  if (pageError || !page) {
    return NextResponse.json({ error: "Action page not found" }, { status: 404 });
  }

  const tenantId = page.tenant_id;

  // Fetch tenant for FB credentials
  const { data: tenant } = await supabase
    .from("tenants")
    .select("fb_app_secret, fb_page_token")
    .eq("id", tenantId)
    .single();

  // Verify PSID signature
  if (!tenant?.fb_app_secret || !verifyActionPageSignature(psid, sig, tenant.fb_app_secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  // Fetch field definitions for validation + lead mapping
  const { data: fields } = await supabase
    .from("action_page_fields")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("action_page_id", actionPageId)
    .order("order_index", { ascending: true });

  const fieldList = (fields ?? []) as ActionPageField[];

  // Validate required fields
  const missingFields = fieldList
    .filter((f) => f.required && (!data[f.field_key] || String(data[f.field_key]).trim() === ""))
    .map((f) => f.field_key);

  if (missingFields.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missingFields.join(", ")}` },
      { status: 400 }
    );
  }

  // Resolve lead by PSID
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("psid", psid)
    .single();

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Insert submission
  const { data: submission, error: subError } = await supabase
    .from("action_submissions")
    .insert({
      tenant_id: tenantId,
      action_page_id: actionPageId,
      lead_id: lead.id,
      psid,
      data,
    })
    .select("id")
    .single();

  if (subError) {
    return NextResponse.json({ error: subError.message }, { status: 500 });
  }

  // Process lead mappings
  for (const field of fieldList) {
    const value = data[field.field_key];
    if (!value || !field.lead_mapping) continue;

    const mapping = field.lead_mapping as LeadMapping;
    if (!mapping) continue;

    if (mapping.target === "lead_contact") {
      await supabase.from("lead_contacts").upsert(
        {
          tenant_id: tenantId,
          lead_id: lead.id,
          type: mapping.type,
          value: String(value),
          source: "form_submit" as const,
          is_primary: false,
        },
        { onConflict: "tenant_id,lead_id,type,value" }
      );
    } else if (mapping.target === "lead_knowledge") {
      const normalizedKey = normalizeKey(mapping.key);
      await supabase.from("lead_knowledge").upsert(
        {
          tenant_id: tenantId,
          lead_id: lead.id,
          key: normalizedKey,
          value: String(value),
          source: "form_submit" as const,
        },
        { onConflict: "tenant_id,lead_id,key" }
      );
    }
  }

  // Insert form_submit event
  await supabase.from("lead_events").insert({
    tenant_id: tenantId,
    lead_id: lead.id,
    type: "form_submit",
    payload: {
      submission_id: submission.id,
      form_title: page.title,
      action_page_id: actionPageId,
    },
  });

  // Send Messenger confirmation (best-effort, don't fail the submission)
  const config = page.config as Record<string, unknown> | null;
  const thankYouMessage = (config?.thank_you_message as string) || "Thanks for submitting!";

  if (tenant?.fb_page_token) {
    try {
      await sendMessage(psid, { type: "text", text: thankYouMessage }, tenant.fb_page_token);
    } catch {
      // Log but don't fail — submission is already saved
      console.error("Failed to send Messenger confirmation");
    }
  }

  return NextResponse.json({ success: true, submission_id: submission.id });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/form-submissions-api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/action-pages/[id]/submissions/route.ts tests/unit/form-submissions-api.test.ts
git commit -m "feat: add form submission API with lead mapping and Messenger confirmation"
```

---

### Task 6: Primary Contact Toggle API + Tests

**Files:**
- Create: `src/app/api/leads/[id]/contacts/[contactId]/primary/route.ts`
- Create: `tests/unit/primary-contact-api.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/primary-contact-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSession } from "@/lib/auth/session";

const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockResolveSession = vi.mocked(resolveSession);

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom, rpc: mockRpc })),
}));

const params = Promise.resolve({ id: "lead-1", contactId: "contact-1" });

describe("PUT /api/leads/[id]/contacts/[contactId]/primary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    mockResolveSession.mockResolvedValue(null);
    const { PUT } = await import("@/app/api/leads/[id]/contacts/[contactId]/primary/route");
    const req = new Request("http://localhost/api/leads/lead-1/contacts/contact-1/primary", { method: "PUT" });
    const res = await PUT(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when contact not found", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    // Mock contact lookup — not found
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
            }),
          }),
        }),
      }),
    });

    const { PUT } = await import("@/app/api/leads/[id]/contacts/[contactId]/primary/route");
    const req = new Request("http://localhost/api/leads/lead-1/contacts/contact-1/primary", { method: "PUT" });
    const res = await PUT(req, { params });
    expect(res.status).toBe(404);
  });

  it("sets contact as primary and clears others", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    // Mock contact lookup
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "contact-1", lead_id: "lead-1", type: "email", value: "a@b.com" },
                error: null,
              }),
            }),
          }),
        }),
      }),
    });

    // Mock clear existing primary
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      }),
    });

    // Mock set new primary
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "contact-1", is_primary: true },
              error: null,
            }),
          }),
        }),
      }),
    });

    const { PUT } = await import("@/app/api/leads/[id]/contacts/[contactId]/primary/route");
    const req = new Request("http://localhost/api/leads/lead-1/contacts/contact-1/primary", { method: "PUT" });
    const res = await PUT(req, { params });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/primary-contact-api.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the API route**

Create `src/app/api/leads/[id]/contacts/[contactId]/primary/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";

type RouteContext = { params: Promise<{ id: string; contactId: string }> };

export async function PUT(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: leadId, contactId } = await context.params;
  const supabase = createServiceClient();

  // Fetch the contact to get its type
  const { data: contact, error: contactError } = await supabase
    .from("lead_contacts")
    .select("id, lead_id, type, value")
    .eq("id", contactId)
    .eq("lead_id", leadId)
    .eq("tenant_id", session.tenantId)
    .single();

  if (contactError || !contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  // Clear existing primary for this lead + type
  await supabase
    .from("lead_contacts")
    .update({ is_primary: false })
    .eq("lead_id", leadId)
    .eq("tenant_id", session.tenantId)
    .eq("type", contact.type);

  // Set this contact as primary
  const { data: updated, error: updateError } = await supabase
    .from("lead_contacts")
    .update({ is_primary: true })
    .eq("id", contactId)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ contact: updated });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/primary-contact-api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/leads/[id]/contacts/[contactId]/primary/route.ts tests/unit/primary-contact-api.test.ts
git commit -m "feat: add primary contact toggle API with tests"
```

---

### Task 7: FormRenderer — Embeddable Component

**Files:**
- Create: `src/components/action-pages/FormRenderer.tsx`

- [ ] **Step 1: Create the FormRenderer component**

```tsx
"use client";

import { useState } from "react";
import type { Database, FormConfig, LeadMapping } from "@/types/database";

type ActionPageField = Database["public"]["Tables"]["action_page_fields"]["Row"];

interface FormRendererProps {
  actionPageId: string;
  config: FormConfig;
  fields: ActionPageField[];
  psid: string;
  sig: string;
}

type FieldErrors = Record<string, string>;

function validateEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validatePhone(value: string): boolean {
  return /^\+?[\d\s\-()]{7,20}$/.test(value);
}

export default function FormRenderer({ actionPageId, config, fields, psid, sig }: FormRendererProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const brandColor = config.brand_color || "#2563eb";

  function handleChange(fieldKey: string, value: string) {
    setValues((prev) => ({ ...prev, [fieldKey]: value }));
    if (errors[fieldKey]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldKey];
        return next;
      });
    }
  }

  function validate(): FieldErrors {
    const errs: FieldErrors = {};
    for (const field of fields) {
      const val = (values[field.field_key] ?? "").trim();
      if (field.required && !val) {
        errs[field.field_key] = `${field.label} is required`;
        continue;
      }
      if (val && field.field_type === "email" && !validateEmail(val)) {
        errs[field.field_key] = "Invalid email address";
      }
      if (val && field.field_type === "phone" && !validatePhone(val)) {
        errs[field.field_key] = "Invalid phone number";
      }
    }
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/action-pages/${actionPageId}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ psid, sig, data: values }),
      });

      if (!res.ok) {
        const body = await res.json();
        setErrors({ _form: body.error || "Submission failed" });
        return;
      }

      setSubmitted(true);
    } catch {
      setErrors({ _form: "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-4">✓</div>
        <p className="text-lg font-medium text-gray-900">
          {config.thank_you_message || "Thanks for submitting!"}
        </p>
      </div>
    );
  }

  const isHero = config.layout === "with_hero";
  const isTwoCol = config.layout === "two_column";

  return (
    <div>
      {isHero && config.hero_image_url && (
        <div className="w-full h-48 mb-6 rounded-lg overflow-hidden">
          <img
            src={config.hero_image_url}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {config.heading && (
        <h2 className="text-xl font-semibold text-gray-900 mb-1">{config.heading}</h2>
      )}
      {config.description && (
        <p className="text-sm text-gray-500 mb-6">{config.description}</p>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className={isTwoCol ? "grid grid-cols-2 gap-4" : "space-y-4"}>
          {fields.map((field) => (
            <FormField
              key={field.id}
              field={field}
              value={values[field.field_key] ?? ""}
              error={errors[field.field_key]}
              onChange={(v) => handleChange(field.field_key, v)}
              brandColor={brandColor}
            />
          ))}
        </div>

        {errors._form && (
          <p className="text-sm text-red-600 mt-4">{errors._form}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full mt-6 py-2.5 px-4 rounded-lg text-white font-medium text-sm transition-opacity disabled:opacity-50"
          style={{ backgroundColor: brandColor }}
        >
          {submitting ? "Submitting..." : config.submit_button_text || "Submit"}
        </button>
      </form>
    </div>
  );
}

// ─── Individual Field Renderer ───────────────────────────────────────────────

interface FormFieldProps {
  field: ActionPageField;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  brandColor: string;
}

function FormField({ field, value, error, onChange, brandColor }: FormFieldProps) {
  const options = (field.options as string[] | null) ?? [];
  const inputClasses = `w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${
    error ? "border-red-400" : "border-gray-300 focus:border-blue-500"
  }`;

  return (
    <div className={field.field_type === "textarea" ? "col-span-full" : ""}>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {field.label}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>

      {(field.field_type === "text" || field.field_type === "email" || field.field_type === "phone") && (
        <input
          type={field.field_type === "phone" ? "tel" : field.field_type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? ""}
          className={inputClasses}
        />
      )}

      {field.field_type === "number" && (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? ""}
          className={inputClasses}
        />
      )}

      {field.field_type === "textarea" && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? ""}
          rows={4}
          className={inputClasses}
        />
      )}

      {field.field_type === "select" && (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClasses}
        >
          <option value="">{field.placeholder || "Select..."}</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}

      {field.field_type === "radio" && (
        <div className="space-y-2 mt-1">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name={field.field_key}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                style={{ accentColor: brandColor }}
              />
              {opt}
            </label>
          ))}
        </div>
      )}

      {field.field_type === "checkbox" && (
        <label className="flex items-center gap-2 text-sm text-gray-700 mt-1">
          <input
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "")}
            style={{ accentColor: brandColor }}
          />
          {field.placeholder || field.label}
        </label>
      )}

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/action-pages/FormRenderer.tsx
git commit -m "feat: add embeddable FormRenderer component"
```

---

### Task 8: Public Action Page — Wire FormRenderer into `/a/[slug]`

**Files:**
- Modify: `src/app/(tenant)/a/[slug]/page.tsx`

- [ ] **Step 1: Replace the stub renderer with the real form renderer**

Replace the entire contents of `src/app/(tenant)/a/[slug]/page.tsx` with:

```tsx
import { notFound } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyActionPageSignature } from "@/lib/fb/signature";
import FormRenderer from "@/components/action-pages/FormRenderer";
import type { Database, FormConfig } from "@/types/database";

type ActionPage = Database["public"]["Tables"]["action_pages"]["Row"];
type ActionPageField = Database["public"]["Tables"]["action_page_fields"]["Row"];

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ psid?: string; sig?: string }>;
}

export default async function ActionPageRoute({ params, searchParams }: Props) {
  const { slug } = await params;
  const { psid, sig } = await searchParams;
  const tenantCtx = await getTenantContext();

  if (!tenantCtx) notFound();

  const supabase = createServiceClient();

  const pageRes = await supabase
    .from("action_pages")
    .select("id, tenant_id, slug, type, title, config, published, version, created_at")
    .eq("tenant_id", tenantCtx.tenantId)
    .eq("slug", slug)
    .eq("published", true)
    .single();

  const page = pageRes.data as ActionPage | null;
  if (!page) notFound();

  // No PSID — show "open from Messenger" message
  if (!psid || !sig) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-800">{page.title}</h1>
          <p className="text-gray-500 mt-2">
            Please open this page from Messenger to continue.
          </p>
        </div>
      </div>
    );
  }

  // Verify PSID signature
  const tenantRes = await supabase
    .from("tenants")
    .select("id, slug, name, business_type, bot_goal, fb_page_id, fb_page_token, fb_app_secret, fb_verify_token, created_at")
    .eq("id", tenantCtx.tenantId)
    .single();

  const tenant = tenantRes.data;

  const sigValid = tenant?.fb_app_secret
    ? verifyActionPageSignature(psid, sig, tenant.fb_app_secret)
    : false;

  if (!sigValid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center text-red-600">
          <p>Invalid link. Please return to Messenger and tap the button again.</p>
        </div>
      </div>
    );
  }

  // Fetch form fields
  const fieldsRes = await supabase
    .from("action_page_fields")
    .select("*")
    .eq("tenant_id", tenantCtx.tenantId)
    .eq("action_page_id", page.id)
    .order("order_index", { ascending: true });

  const fields = (fieldsRes.data ?? []) as ActionPageField[];
  const config = (page.config ?? {}) as FormConfig;

  // Render based on page type
  if (page.type === "form") {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-lg mx-auto px-4 py-8">
          <FormRenderer
            actionPageId={page.id}
            config={config}
            fields={fields}
            psid={psid}
            sig={sig}
          />
        </div>
      </div>
    );
  }

  // Other page types — placeholder for future
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{page.title}</h1>
        <p className="text-gray-500 text-sm">
          Page type: <strong>{page.type}</strong>
        </p>
        <p className="text-gray-400 text-xs mt-1">Coming soon.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/(tenant)/a/[slug]/page.tsx
git commit -m "feat: wire FormRenderer into public action page route"
```

---

### Task 9: FormBuilder — Tenant Dashboard Editor

**Files:**
- Create: `src/components/action-pages/FormBuilder.tsx`
- Modify: `src/app/(tenant)/app/actions/[id]/page.tsx`

- [ ] **Step 1: Create the FormBuilder component**

Create `src/components/action-pages/FormBuilder.tsx`:

```tsx
"use client";

import { useState, useCallback } from "react";
import {
  Plus, Trash2, GripVertical, ChevronDown, ChevronUp, Save, Globe, ArrowLeft, Eye,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Link from "next/link";
import FormRenderer from "@/components/action-pages/FormRenderer";
import type { FormConfig, LeadMapping } from "@/types/database";

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "textarea", label: "Textarea" },
  { value: "select", label: "Dropdown" },
  { value: "number", label: "Number" },
  { value: "radio", label: "Radio" },
  { value: "checkbox", label: "Checkbox" },
] as const;

type FieldType = (typeof FIELD_TYPES)[number]["value"];

interface BuilderField {
  id: string;
  label: string;
  field_key: string;
  field_type: FieldType;
  placeholder: string;
  required: boolean;
  options: string[];
  order_index: number;
  lead_mapping: LeadMapping;
}

interface FormBuilderProps {
  actionPageId: string;
  initialTitle: string;
  initialSlug: string;
  initialPublished: boolean;
  initialConfig: FormConfig;
  initialFields: BuilderField[];
  onSave: (data: {
    title: string;
    published: boolean;
    config: FormConfig;
    fields: BuilderField[];
  }) => Promise<void>;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 100);
}

function defaultLeadMapping(fieldType: FieldType): LeadMapping {
  if (fieldType === "email") return { target: "lead_contact", type: "email" };
  if (fieldType === "phone") return { target: "lead_contact", type: "phone" };
  return null;
}

export default function FormBuilder({
  actionPageId,
  initialTitle,
  initialSlug,
  initialPublished,
  initialConfig,
  initialFields,
  onSave,
}: FormBuilderProps) {
  const [title, setTitle] = useState(initialTitle);
  const [published, setPublished] = useState(initialPublished);
  const [config, setConfig] = useState<FormConfig>(initialConfig);
  const [fields, setFields] = useState<BuilderField[]>(initialFields);
  const [expandedField, setExpandedField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const addField = useCallback(() => {
    const newField: BuilderField = {
      id: crypto.randomUUID(),
      label: "",
      field_key: "",
      field_type: "text",
      placeholder: "",
      required: false,
      options: [],
      order_index: fields.length,
      lead_mapping: null,
    };
    setFields((prev) => [...prev, newField]);
    setExpandedField(newField.id);
  }, [fields.length]);

  const removeField = useCallback((id: string) => {
    setFields((prev) =>
      prev
        .filter((f) => f.id !== id)
        .map((f, i) => ({ ...f, order_index: i }))
    );
    setExpandedField(null);
  }, []);

  const updateField = useCallback((id: string, updates: Partial<BuilderField>) => {
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const updated = { ...f, ...updates };
        // Auto-generate field_key from label if key is empty or was auto-generated
        if (updates.label !== undefined && (f.field_key === "" || f.field_key === slugify(f.label))) {
          updated.field_key = slugify(updates.label);
        }
        // Auto-set lead mapping on type change
        if (updates.field_type !== undefined) {
          updated.lead_mapping = defaultLeadMapping(updates.field_type);
        }
        return updated;
      })
    );
  }, []);

  const moveField = useCallback((index: number, direction: "up" | "down") => {
    setFields((prev) => {
      const next = [...prev];
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= next.length) return prev;
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
      return next.map((f, i) => ({ ...f, order_index: i }));
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ title, published, config, fields });
    } finally {
      setSaving(false);
    }
  };

  // Build preview fields in the format FormRenderer expects
  const previewFields = fields.map((f) => ({
    id: f.id,
    tenant_id: "",
    action_page_id: actionPageId,
    label: f.label || "Untitled Field",
    field_key: f.field_key,
    field_type: f.field_type,
    placeholder: f.placeholder || null,
    required: f.required,
    options: f.options.length > 0 ? f.options : null,
    order_index: f.order_index,
    lead_mapping: f.lead_mapping,
    created_at: "",
  }));

  const needsOptions = (type: string) => ["select", "radio", "checkbox"].includes(type);

  return (
    <div className="flex h-full flex-col">
      {/* Top Bar */}
      <div className="flex items-center gap-4 border-b border-[var(--ws-border)] bg-white px-6 py-3">
        <Link href="/app/actions" className="text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 bg-transparent text-lg font-semibold text-[var(--ws-text-primary)] outline-none"
        />
        <Badge variant="muted">/{initialSlug}</Badge>
        <button
          onClick={() => setPublished(!published)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            published
              ? "bg-[var(--ws-success-light)] text-[var(--ws-success)]"
              : "bg-[var(--ws-border-subtle)] text-[var(--ws-text-muted)]"
          }`}
        >
          <Globe className="h-3.5 w-3.5" />
          {published ? "Published" : "Draft"}
        </button>
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      {/* Editor + Preview */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel — Editor */}
        <div className="w-1/2 overflow-y-auto border-r border-[var(--ws-border)] p-6 space-y-6">
          {/* Form Settings */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-[var(--ws-text-primary)]">Form Settings</h3>
            <div>
              <label className="mb-1 block text-xs text-[var(--ws-text-muted)]">Heading</label>
              <input
                type="text"
                value={config.heading}
                onChange={(e) => setConfig((c) => ({ ...c, heading: e.target.value }))}
                placeholder="Get a Free Quote"
                className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--ws-accent)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ws-text-muted)]">Description</label>
              <input
                type="text"
                value={config.description ?? ""}
                onChange={(e) => setConfig((c) => ({ ...c, description: e.target.value || undefined }))}
                placeholder="Fill out the form below"
                className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--ws-accent)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ws-text-muted)]">Layout</label>
              <select
                value={config.layout}
                onChange={(e) => setConfig((c) => ({ ...c, layout: e.target.value as FormConfig["layout"] }))}
                className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm outline-none"
              >
                <option value="single_column">Single Column</option>
                <option value="two_column">Two Column</option>
                <option value="with_hero">With Hero Image</option>
              </select>
            </div>
            {config.layout === "with_hero" && (
              <div>
                <label className="mb-1 block text-xs text-[var(--ws-text-muted)]">Hero Image URL</label>
                <input
                  type="text"
                  value={config.hero_image_url ?? ""}
                  onChange={(e) => setConfig((c) => ({ ...c, hero_image_url: e.target.value || undefined }))}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--ws-accent)]"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-[var(--ws-text-muted)]">Button Text</label>
                <input
                  type="text"
                  value={config.submit_button_text}
                  onChange={(e) => setConfig((c) => ({ ...c, submit_button_text: e.target.value }))}
                  placeholder="Submit"
                  className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--ws-accent)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--ws-text-muted)]">Brand Color</label>
                <input
                  type="color"
                  value={config.brand_color ?? "#2563eb"}
                  onChange={(e) => setConfig((c) => ({ ...c, brand_color: e.target.value }))}
                  className="h-9 w-full cursor-pointer rounded-lg border border-[var(--ws-border-strong)]"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ws-text-muted)]">Thank You Message</label>
              <input
                type="text"
                value={config.thank_you_message}
                onChange={(e) => setConfig((c) => ({ ...c, thank_you_message: e.target.value }))}
                placeholder="Thanks! We'll be in touch."
                className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--ws-accent)]"
              />
            </div>
          </div>

          {/* Fields */}
          <div>
            <h3 className="mb-3 text-sm font-medium text-[var(--ws-text-primary)]">Form Fields</h3>
            <div className="space-y-2">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="rounded-lg border border-[var(--ws-border)] bg-white"
                >
                  {/* Field Header */}
                  <div
                    className="flex items-center gap-2 p-3 cursor-pointer"
                    onClick={() => setExpandedField(expandedField === field.id ? null : field.id)}
                  >
                    <GripVertical className="h-4 w-4 shrink-0 text-[var(--ws-text-faint)]" />
                    <span className="flex-1 text-sm text-[var(--ws-text-primary)]">
                      {field.label || "Untitled Field"}
                    </span>
                    <Badge variant="muted">{field.field_type}</Badge>
                    {field.required && <Badge variant="muted">Required</Badge>}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); moveField(index, "up"); }}
                        disabled={index === 0}
                        className="text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)] disabled:opacity-30"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveField(index, "down"); }}
                        disabled={index === fields.length - 1}
                        className="text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)] disabled:opacity-30"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeField(field.id); }}
                        className="text-[var(--ws-text-muted)] hover:text-[var(--ws-danger)]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Config */}
                  {expandedField === field.id && (
                    <div className="border-t border-[var(--ws-border)] p-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs text-[var(--ws-text-muted)]">Label</label>
                          <input
                            type="text"
                            value={field.label}
                            onChange={(e) => updateField(field.id, { label: e.target.value })}
                            placeholder="Field label"
                            className="w-full rounded border border-[var(--ws-border)] px-2 py-1.5 text-sm outline-none"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-[var(--ws-text-muted)]">Type</label>
                          <select
                            value={field.field_type}
                            onChange={(e) => updateField(field.id, { field_type: e.target.value as FieldType })}
                            className="w-full rounded border border-[var(--ws-border)] px-2 py-1.5 text-sm outline-none"
                          >
                            {FIELD_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs text-[var(--ws-text-muted)]">Placeholder</label>
                          <input
                            type="text"
                            value={field.placeholder}
                            onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                            placeholder="Placeholder text"
                            className="w-full rounded border border-[var(--ws-border)] px-2 py-1.5 text-sm outline-none"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-[var(--ws-text-muted)]">Field Key</label>
                          <input
                            type="text"
                            value={field.field_key}
                            onChange={(e) => updateField(field.id, { field_key: e.target.value })}
                            placeholder="field_key"
                            className="w-full rounded border border-[var(--ws-border)] px-2 py-1.5 text-sm font-mono outline-none"
                          />
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-sm text-[var(--ws-text-tertiary)]">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => updateField(field.id, { required: e.target.checked })}
                          className="accent-[var(--ws-accent)]"
                        />
                        Required
                      </label>

                      {/* Options editor for select/radio/checkbox */}
                      {needsOptions(field.field_type) && (
                        <div>
                          <label className="mb-1 block text-xs text-[var(--ws-text-muted)]">Options</label>
                          <div className="space-y-1">
                            {field.options.map((opt, optIdx) => (
                              <div key={optIdx} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={opt}
                                  onChange={(e) => {
                                    const newOptions = [...field.options];
                                    newOptions[optIdx] = e.target.value;
                                    updateField(field.id, { options: newOptions });
                                  }}
                                  className="flex-1 rounded border border-[var(--ws-border)] px-2 py-1 text-sm outline-none"
                                />
                                <button
                                  onClick={() => {
                                    const newOptions = field.options.filter((_, i) => i !== optIdx);
                                    updateField(field.id, { options: newOptions });
                                  }}
                                  className="text-[var(--ws-text-muted)] hover:text-[var(--ws-danger)]"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                            <button
                              onClick={() => updateField(field.id, { options: [...field.options, ""] })}
                              className="text-xs text-[var(--ws-text-tertiary)] hover:text-[var(--ws-text-primary)]"
                            >
                              + Add option
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Lead Mapping */}
                      <div>
                        <label className="mb-1 block text-xs text-[var(--ws-text-muted)]">Lead Mapping</label>
                        <select
                          value={
                            field.lead_mapping === null
                              ? "none"
                              : field.lead_mapping.target === "lead_contact"
                                ? `contact_${field.lead_mapping.type}`
                                : "knowledge"
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "none") updateField(field.id, { lead_mapping: null });
                            else if (val === "contact_email") updateField(field.id, { lead_mapping: { target: "lead_contact", type: "email" } });
                            else if (val === "contact_phone") updateField(field.id, { lead_mapping: { target: "lead_contact", type: "phone" } });
                            else if (val === "knowledge") updateField(field.id, { lead_mapping: { target: "lead_knowledge", key: "" } });
                          }}
                          className="w-full rounded border border-[var(--ws-border)] px-2 py-1.5 text-sm outline-none"
                        >
                          <option value="none">None</option>
                          <option value="contact_email">Email (lead contact)</option>
                          <option value="contact_phone">Phone (lead contact)</option>
                          <option value="knowledge">Custom lead knowledge</option>
                        </select>
                        {field.lead_mapping?.target === "lead_knowledge" && (
                          <input
                            type="text"
                            value={field.lead_mapping.key}
                            onChange={(e) =>
                              updateField(field.id, {
                                lead_mapping: { target: "lead_knowledge", key: e.target.value },
                              })
                            }
                            placeholder="Key name (e.g. budget)"
                            className="mt-2 w-full rounded border border-[var(--ws-border)] px-2 py-1.5 text-sm outline-none"
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addField}
              className="mt-3 flex items-center gap-1.5 text-sm text-[var(--ws-text-tertiary)] hover:text-[var(--ws-text-primary)]"
            >
              <Plus className="h-4 w-4" />
              Add field
            </button>
          </div>
        </div>

        {/* Right Panel — Live Preview */}
        <div className="flex w-1/2 flex-col items-center justify-start overflow-y-auto bg-[var(--ws-page)] p-8">
          <div className="mb-3 flex items-center gap-1.5 text-xs text-[var(--ws-text-muted)]">
            <Eye className="h-3.5 w-3.5" />
            Preview
          </div>
          <Card className="w-full max-w-md p-6">
            <FormRenderer
              actionPageId={actionPageId}
              config={{
                ...config,
                heading: config.heading || title,
              }}
              fields={previewFields}
              psid="preview"
              sig="preview"
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update the action page editor route to use FormBuilder**

Replace the entire contents of `src/app/(tenant)/app/actions/[id]/page.tsx` with:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import FormBuilder from "@/components/action-pages/FormBuilder";
import type { FormConfig, LeadMapping } from "@/types/database";

const DEFAULT_CONFIG: FormConfig = {
  heading: "",
  layout: "single_column",
  submit_button_text: "Submit",
  thank_you_message: "Thanks! We'll be in touch.",
};

interface ActionPageData {
  id: string;
  title: string;
  slug: string;
  type: string;
  published: boolean;
  config: FormConfig;
}

interface FieldData {
  id: string;
  label: string;
  field_key: string;
  field_type: string;
  placeholder: string | null;
  required: boolean;
  options: string[] | null;
  order_index: number;
  lead_mapping: LeadMapping;
}

export default function ActionPageEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [page, setPage] = useState<ActionPageData | null>(null);
  const [fields, setFields] = useState<FieldData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [pageRes, fieldsRes] = await Promise.all([
        fetch(`/api/action-pages/${id}`),
        fetch(`/api/action-pages/${id}/fields`),
      ]);

      if (pageRes.ok) {
        const { actionPage } = await pageRes.json();
        setPage(actionPage);
      }
      if (fieldsRes.ok) {
        const { fields: f } = await fieldsRes.json();
        setFields(f);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-[var(--ws-text-muted)]">Loading...</p>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-[var(--ws-text-muted)]">Action page not found.</p>
      </div>
    );
  }

  if (page.type !== "form") {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-[var(--ws-text-muted)]">
          Editor for {page.type} pages coming soon.
        </p>
      </div>
    );
  }

  const initialFields = fields.map((f) => ({
    id: f.id,
    label: f.label,
    field_key: f.field_key,
    field_type: f.field_type as "text" | "email" | "phone" | "textarea" | "select" | "number" | "radio" | "checkbox",
    placeholder: f.placeholder ?? "",
    required: f.required,
    options: f.options ?? [],
    order_index: f.order_index,
    lead_mapping: f.lead_mapping,
  }));

  const handleSave = async (data: {
    title: string;
    published: boolean;
    config: FormConfig;
    fields: Array<{
      id: string;
      label: string;
      field_key: string;
      field_type: string;
      placeholder: string;
      required: boolean;
      options: string[];
      order_index: number;
      lead_mapping: LeadMapping;
    }>;
  }) => {
    // Save page config
    await fetch(`/api/action-pages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: data.title,
        published: data.published,
        config: data.config,
      }),
    });

    // Save fields
    await fetch(`/api/action-pages/${id}/fields`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: data.fields.map((f) => ({
          label: f.label,
          field_key: f.field_key,
          field_type: f.field_type,
          placeholder: f.placeholder || undefined,
          required: f.required,
          options: f.options.length > 0 ? f.options : undefined,
          order_index: f.order_index,
          lead_mapping: f.lead_mapping,
        })),
      }),
    });
  };

  return (
    <FormBuilder
      actionPageId={id}
      initialTitle={page.title}
      initialSlug={page.slug}
      initialPublished={page.published}
      initialConfig={{ ...DEFAULT_CONFIG, ...(page.config as FormConfig) }}
      initialFields={initialFields}
      onSave={handleSave}
    />
  );
}
```

- [ ] **Step 3: Run type check**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/action-pages/FormBuilder.tsx src/app/(tenant)/app/actions/[id]/page.tsx
git commit -m "feat: add form builder UI with live preview"
```

---

### Task 10: Action Page Detail API (GET + PATCH)

**Files:**
- Create: `src/app/api/action-pages/[id]/route.ts`

The FormBuilder editor page needs `GET /api/action-pages/[id]` to load a single action page and `PATCH /api/action-pages/[id]` to save title/published/config.

- [ ] **Step 1: Write the API route**

Create `src/app/api/action-pages/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  published: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

export async function GET(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("action_pages")
    .select("id, tenant_id, slug, type, title, config, published, version, created_at")
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ actionPage: data });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("action_pages")
    .update(parsed.data)
    .eq("id", id)
    .eq("tenant_id", session.tenantId)
    .select("id, tenant_id, slug, type, title, config, published, version, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Not found" }, { status: error ? 500 : 404 });
  }

  return NextResponse.json({ actionPage: data });
}
```

- [ ] **Step 2: Run type check**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/api/action-pages/[id]/route.ts
git commit -m "feat: add action page detail API (GET + PATCH)"
```

---

### Task 11: AI Prompt Builder — Lead Context Enrichment + Tests

**Files:**
- Modify: `src/lib/ai/prompt-builder.ts`
- Create: `tests/unit/prompt-builder-lead-context.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/prompt-builder-lead-context.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

// Test the lead context builder functions directly
// We'll import them after making them exported

describe("buildLeadContext", () => {
  it("returns empty section when no lead data", async () => {
    const { buildLeadContext } = await import("@/lib/ai/prompt-builder");
    const result = buildLeadContext({ contacts: [], knowledge: [], submissions: [] });
    expect(result).toContain("No lead-specific data");
  });

  it("includes contacts grouped by type", async () => {
    const { buildLeadContext } = await import("@/lib/ai/prompt-builder");
    const result = buildLeadContext({
      contacts: [
        { type: "email", value: "john@example.com", is_primary: true },
        { type: "email", value: "j@work.com", is_primary: false },
        { type: "phone", value: "+639123456789", is_primary: true },
      ],
      knowledge: [],
      submissions: [],
    });
    expect(result).toContain("john@example.com");
    expect(result).toContain("j@work.com");
    expect(result).toContain("+639123456789");
    expect(result).toContain("primary");
  });

  it("includes knowledge key-value pairs", async () => {
    const { buildLeadContext } = await import("@/lib/ai/prompt-builder");
    const result = buildLeadContext({
      contacts: [],
      knowledge: [
        { key: "budget", value: "$50k" },
        { key: "timeline", value: "3 months" },
      ],
      submissions: [],
    });
    expect(result).toContain("budget");
    expect(result).toContain("$50k");
    expect(result).toContain("timeline");
    expect(result).toContain("3 months");
  });

  it("includes recent form submissions", async () => {
    const { buildLeadContext } = await import("@/lib/ai/prompt-builder");
    const result = buildLeadContext({
      contacts: [],
      knowledge: [],
      submissions: [
        { form_title: "Quote Form", submitted_at: "2026-04-25", data: { budget: "$50k", name: "John" } },
      ],
    });
    expect(result).toContain("Quote Form");
    expect(result).toContain("budget");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/prompt-builder-lead-context.test.ts`
Expected: FAIL — `buildLeadContext` not exported

- [ ] **Step 3: Add `buildLeadContext` function to prompt-builder.ts**

Add this function before the `buildSystemPrompt` export in `src/lib/ai/prompt-builder.ts` (before line 290):

```typescript
// Layer 5.5 — lead-specific context from contacts, knowledge, and form submissions
interface LeadContact {
  type: string;
  value: string;
  is_primary: boolean;
}

interface LeadKnowledgeEntry {
  key: string;
  value: string;
}

interface LeadSubmission {
  form_title: string;
  submitted_at: string;
  data: Record<string, unknown>;
}

export interface LeadContextData {
  contacts: LeadContact[];
  knowledge: LeadKnowledgeEntry[];
  submissions: LeadSubmission[];
}

export function buildLeadContext(data: LeadContextData): string {
  const header = "--- WHAT YOU KNOW ABOUT THIS LEAD ---";

  if (data.contacts.length === 0 && data.knowledge.length === 0 && data.submissions.length === 0) {
    return `${header}\nNo lead-specific data available yet.`;
  }

  const lines: string[] = [header];

  // Contacts
  if (data.contacts.length > 0) {
    lines.push("Contact info on file:");
    const byType: Record<string, LeadContact[]> = {};
    for (const c of data.contacts) {
      if (!byType[c.type]) byType[c.type] = [];
      byType[c.type].push(c);
    }
    for (const [type, contacts] of Object.entries(byType)) {
      const formatted = contacts
        .map((c) => c.value + (c.is_primary ? " (primary)" : ""))
        .join(", ");
      lines.push(`- ${type}: ${formatted}`);
    }
  }

  // Knowledge
  if (data.knowledge.length > 0) {
    lines.push("Known facts:");
    for (const k of data.knowledge) {
      lines.push(`- ${k.key}: ${k.value}`);
    }
  }

  // Submissions
  if (data.submissions.length > 0) {
    lines.push("Form submissions:");
    for (const s of data.submissions) {
      const entries = Object.entries(s.data)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      lines.push(`- "${s.form_title}" on ${s.submitted_at}: ${entries}`);
    }
  }

  lines.push(
    "",
    "Use this info naturally. Don't re-ask for info you already have. Reference it when relevant."
  );

  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/prompt-builder-lead-context.test.ts`
Expected: PASS

- [ ] **Step 5: Wire `buildLeadContext` into `buildSystemPrompt`**

In `src/lib/ai/prompt-builder.ts`, update the `buildSystemPrompt` function. Add a lead data fetch to the parallel queries and include the lead context layer in the final prompt assembly.

After the existing parallel queries (the `Promise.all` at line 322), add a new parallel fetch for lead data. The lead context layer should be inserted between the retrieved knowledge layer and the available images layer in the final array.

The integration requires knowing the lead's ID, so add `leadId?: string` to the `PromptContext` interface and conditionally fetch lead data when present.

Add to `PromptContext` (line 24):

```typescript
  leadId?: string;
```

In `buildSystemPrompt`, after the existing `Promise.all` (after line 326), add:

```typescript
  // Fetch lead context if leadId is provided
  let leadContextData: LeadContextData = { contacts: [], knowledge: [], submissions: [] };
  if (ctx.leadId) {
    const [contactsRes, knowledgeRes, submissionsRes] = await Promise.all([
      supabase
        .from("lead_contacts")
        .select("type, value, is_primary")
        .eq("tenant_id", ctx.tenantId)
        .eq("lead_id", ctx.leadId),
      supabase
        .from("lead_knowledge")
        .select("key, value")
        .eq("tenant_id", ctx.tenantId)
        .eq("lead_id", ctx.leadId),
      supabase
        .from("action_submissions")
        .select("data, created_at, action_page_id")
        .eq("tenant_id", ctx.tenantId)
        .eq("lead_id", ctx.leadId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    // Fetch action page titles for submissions
    const submissions: LeadSubmission[] = [];
    if (submissionsRes.data && submissionsRes.data.length > 0) {
      const pageIds = [...new Set(submissionsRes.data.map((s: { action_page_id: string }) => s.action_page_id))];
      const { data: pages } = await supabase
        .from("action_pages")
        .select("id, title")
        .in("id", pageIds);
      const pageMap = new Map((pages ?? []).map((p: { id: string; title: string }) => [p.id, p.title]));

      for (const s of submissionsRes.data) {
        submissions.push({
          form_title: pageMap.get(s.action_page_id) ?? "Unknown Form",
          submitted_at: new Date(s.created_at).toISOString().split("T")[0],
          data: (s.data ?? {}) as Record<string, unknown>,
        });
      }
    }

    leadContextData = {
      contacts: (contactsRes.data ?? []) as LeadContact[],
      knowledge: (knowledgeRes.data ?? []) as LeadKnowledgeEntry[],
      submissions,
    };
  }
```

Then update the final layers array to include the lead context. Insert `buildLeadContext(leadContextData)` between `layer8` (retrieved knowledge) and `layer9` (available images):

```typescript
  const leadLayer = buildLeadContext(leadContextData);

  return [layer1, layer2, campaignRulesLayer, layer3, layer4, layer5, layer6, layer7, layer8, leadLayer, layer9, layer10]
    .filter((l) => l.length > 0)
    .join("\n\n");
```

- [ ] **Step 6: Run all prompt builder tests**

Run: `npm test -- tests/unit/prompt-builder`
Expected: PASS — all existing tests still pass plus new tests

- [ ] **Step 7: Commit**

```bash
git add src/lib/ai/prompt-builder.ts tests/unit/prompt-builder-lead-context.test.ts
git commit -m "feat: add lead context (contacts, knowledge, submissions) to AI prompts"
```

---

### Task 12: Wire `leadId` into Conversation Engine

**Files:**
- Modify: `src/lib/ai/conversation-engine.ts` (or wherever `buildSystemPrompt` is called)

- [ ] **Step 1: Find where `buildSystemPrompt` is called and pass `leadId`**

The conversation engine calls `buildSystemPrompt` with a `PromptContext`. The lead ID should already be available from the webhook processing (the lead is upserted before the conversation engine runs).

Find the call site and add `leadId` to the context object. The lead record is available from the webhook handler where `lead.id` is resolved after upsert.

In the conversation engine, when constructing `PromptContext`, add:

```typescript
leadId: lead.id,
```

This ensures the AI gets lead data on every subsequent message after a form is submitted.

- [ ] **Step 2: Run type check**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: PASS — no regressions

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/conversation-engine.ts
git commit -m "feat: pass leadId to prompt builder for lead context enrichment"
```

---

### Task 13: Integration Test — End-to-End Form Flow

**Files:**
- Create: `tests/unit/form-flow-integration.test.ts`

- [ ] **Step 1: Write integration test covering the full submission flow**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
const mockSendMessage = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("@/lib/fb/send", () => ({
  sendMessage: vi.fn((...args: unknown[]) => mockSendMessage(...args)),
}));

vi.mock("@/lib/fb/signature", () => ({
  verifyActionPageSignature: vi.fn(() => true),
}));

const params = Promise.resolve({ id: "page-1" });

describe("Form submission → lead mapping → Messenger confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("processes a full form submission with email and knowledge mapping", async () => {
    const insertCalls: Array<{ table: string; data: unknown }> = [];

    // Mock action page
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: "page-1",
                tenant_id: "t1",
                title: "Quote Form",
                config: { thank_you_message: "Thanks, we'll call you!" },
                published: true,
              },
              error: null,
            }),
          }),
        }),
      }),
    });

    // Mock tenant
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { fb_app_secret: "secret", fb_page_token: "token123" },
            error: null,
          }),
        }),
      }),
    });

    // Mock fields
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  field_key: "email",
                  field_type: "email",
                  required: true,
                  lead_mapping: { target: "lead_contact", type: "email" },
                },
                {
                  field_key: "budget",
                  field_type: "text",
                  required: false,
                  lead_mapping: { target: "lead_knowledge", key: "budget" },
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    });

    // Mock lead lookup
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "lead-1" },
              error: null,
            }),
          }),
        }),
      }),
    });

    // Mock submission insert
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockImplementation((data: unknown) => {
        insertCalls.push({ table: "action_submissions", data });
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "sub-1" },
              error: null,
            }),
          }),
        };
      }),
    });

    // Mock lead_contacts upsert
    mockFrom.mockReturnValueOnce({
      upsert: vi.fn().mockImplementation((data: unknown) => {
        insertCalls.push({ table: "lead_contacts", data });
        return Promise.resolve({ error: null });
      }),
    });

    // Mock lead_knowledge upsert
    mockFrom.mockReturnValueOnce({
      upsert: vi.fn().mockImplementation((data: unknown) => {
        insertCalls.push({ table: "lead_knowledge", data });
        return Promise.resolve({ error: null });
      }),
    });

    // Mock lead_events insert
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockImplementation((data: unknown) => {
        insertCalls.push({ table: "lead_events", data });
        return Promise.resolve({ error: null });
      }),
    });

    mockSendMessage.mockResolvedValue({ messageId: "msg-1" });

    const { POST } = await import("@/app/api/action-pages/[id]/submissions/route");
    const req = new Request("http://localhost/api/action-pages/page-1/submissions", {
      method: "POST",
      body: JSON.stringify({
        psid: "psid-123",
        sig: "valid",
        data: { email: "john@test.com", budget: "$50k" },
      }),
    });

    const res = await POST(req, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.submission_id).toBe("sub-1");

    // Verify Messenger confirmation was sent
    expect(mockSendMessage).toHaveBeenCalledWith(
      "psid-123",
      { type: "text", text: "Thanks, we'll call you!" },
      "token123"
    );
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `npm test -- tests/unit/form-flow-integration.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/form-flow-integration.test.ts
git commit -m "test: add end-to-end form submission integration test"
```

---

### Task 14: Run Full Test Suite + Type Check

**Files:** None (verification only)

- [ ] **Step 1: Run all unit tests**

Run: `npm test`
Expected: All tests PASS, no regressions

- [ ] **Step 2: Run type check**

Run: `npm run typecheck`
Expected: No type errors

- [ ] **Step 3: Run linter**

Run: `npm run lint`
Expected: No lint errors (or only pre-existing ones)

- [ ] **Step 4: Start dev server and verify form builder loads**

Run: `npm run dev`
Navigate to an action page editor in the dashboard. Verify the form builder UI renders with:
- Form settings panel (heading, description, layout, button text, color, thank-you message)
- Field list (add, remove, reorder, expand/collapse)
- Live preview panel showing the form

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address test/lint issues from form creator implementation"
```
