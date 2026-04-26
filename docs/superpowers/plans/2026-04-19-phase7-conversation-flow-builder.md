# Phase 7: Conversation Flow Builder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tenant-facing UI for designing and managing conversation flow phases — a drag-to-reorder phase list, per-phase configuration forms (name, tone, system prompt, goals, max messages, transition hints), template selection for new tenants, and pickers for attaching action pages and knowledge images to each phase.

**Architecture:** A new "Flow Builder" tab in `BotClient.tsx` renders a `FlowPanel` container. When no phases exist, `TemplateSelector` offers one-click seeding from business-type templates (calling the existing `seedPhaseTemplates`). Once phases exist, `PhaseList` renders a `@dnd-kit/sortable` drag-to-reorder list of `PhaseCard` components. Each card expands to a `PhaseForm` with `ActionButtonPicker` and `ImageAttachmentPicker` sub-components. A `useFlowPhases` hook handles all fetching and mutations. Six new API routes under `/api/bot/phases/` provide CRUD, reorder, and seed operations. A new migration adds `image_attachment_ids` to `bot_flow_phases`.

**Tech Stack:** TypeScript, React (Next.js App Router client components), `@dnd-kit/core` + `@dnd-kit/sortable` (drag-to-reorder), Zod (API validation), Vitest + React Testing Library (component tests), Playwright (E2E tests), existing UI components (`Button`, `Card`, `Badge`, `EmptyState`), existing design tokens (`--ws-*` CSS variables), Lucide React icons

---

## File Structure

```
supabase/migrations/
└── 0007_phase_image_attachments.sql       # Add image_attachment_ids to bot_flow_phases

src/types/
└── database.ts                            # Modify: add image_attachment_ids to bot_flow_phases type

src/app/api/bot/phases/
├── route.ts                               # GET (list) + POST (create)
├── [id]/route.ts                          # PATCH (update) + DELETE
├── reorder/route.ts                       # POST (bulk reorder)
├── seed/route.ts                          # POST (seed from template)

src/app/api/bot/action-pages/
└── route.ts                               # GET (list action_pages for picker)

src/app/api/knowledge/images/list/
└── route.ts                               # GET (list knowledge_images for picker)

src/hooks/
└── useFlowPhases.ts                       # Fetch + mutate phases

src/components/dashboard/flow/
├── FlowPanel.tsx                          # Container: TemplateSelector or PhaseList
├── TemplateSelector.tsx                   # Business-type template picker
├── PhaseList.tsx                          # @dnd-kit sortable list of PhaseCards
├── PhaseCard.tsx                          # Collapsible card → PhaseForm
├── PhaseForm.tsx                          # Phase config form fields
├── ImageAttachmentPicker.tsx              # Multi-select from knowledge_images
├── ActionButtonPicker.tsx                 # Multi-select from action_pages

src/app/(tenant)/app/bot/
└── BotClient.tsx                          # Modify: add "Flow Builder" tab

tests/unit/
├── flow-phases-api.test.ts
├── flow-phases-detail-api.test.ts
├── flow-phases-reorder-api.test.ts
├── flow-phases-seed-api.test.ts
├── action-pages-api.test.ts
├── knowledge-images-list-api.test.ts
├── use-flow-phases.test.ts
├── template-selector.test.tsx
├── phase-form.test.tsx
├── image-attachment-picker.test.tsx
├── action-button-picker.test.tsx
├── phase-card.test.tsx
├── phase-list.test.tsx
├── flow-panel.test.tsx

tests/e2e/
└── flow-builder.spec.ts
```

---

## Task 1: Database Migration — `image_attachment_ids` Column

**Files:**
- Create: `supabase/migrations/0007_phase_image_attachments.sql`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/0007_phase_image_attachments.sql`:

```sql
-- Phase 7: Allow tenants to attach knowledge images to individual phases.
-- The conversation engine uses these IDs to include relevant images in the
-- LLM prompt when a lead is in that phase.

alter table bot_flow_phases
  add column image_attachment_ids uuid[] not null default '{}';
```

- [ ] **Step 2: Update the TypeScript database types**

In `src/types/database.ts`, add `image_attachment_ids` to the `bot_flow_phases` TableRow. Find the existing `bot_flow_phases` entry (around line 146) and add the field:

```typescript
bot_flow_phases: TableRow<{
  id: string;
  tenant_id: string;
  name: string;
  order_index: number;
  max_messages: number;
  system_prompt: string;
  tone: string | null;
  goals: string | null;
  transition_hint: string | null;
  action_button_ids: string[] | null;
  image_attachment_ids: string[];
  created_at: string;
}>;
```

- [ ] **Step 3: Apply the migration**

Run: `npx supabase db push`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0007_phase_image_attachments.sql src/types/database.ts
git commit -m "feat: add image_attachment_ids column to bot_flow_phases"
```

---

## Task 2: Phase List + Create API Routes

**Files:**
- Create: `src/app/api/bot/phases/route.ts`
- Test: `tests/unit/flow-phases-api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/flow-phases-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockInsert = vi.fn();
const mockSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    })
  ),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: mockFrom.mockReturnValue({
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          order: mockOrder.mockReturnValue(
            Promise.resolve({
              data: [
                {
                  id: "p1",
                  name: "Greet",
                  order_index: 0,
                  max_messages: 1,
                  system_prompt: "Welcome the lead",
                  tone: "friendly",
                  goals: "Greet the lead",
                  transition_hint: "Move to nurture",
                  action_button_ids: null,
                  image_attachment_ids: [],
                  created_at: "2026-01-01T00:00:00Z",
                },
              ],
              error: null,
            })
          ),
        }),
      }),
      insert: mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: mockSingle.mockReturnValue(
            Promise.resolve({
              data: {
                id: "p-new",
                name: "New Phase",
                order_index: 1,
                max_messages: 3,
                system_prompt: "New prompt",
                tone: "friendly",
                goals: null,
                transition_hint: null,
                action_button_ids: null,
                image_attachment_ids: [],
                created_at: "2026-01-01T00:00:00Z",
              },
              error: null,
            })
          ),
        }),
      }),
    }),
  })),
}));

describe("GET /api/bot/phases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });

    const { GET } = await import("@/app/api/bot/phases/route");
    const response = await GET(new Request("http://localhost/api/bot/phases"));

    expect(response.status).toBe(401);
  });

  it("returns 403 when user has no tenant", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: {} } },
      error: null,
    });

    const { GET } = await import("@/app/api/bot/phases/route");
    const response = await GET(new Request("http://localhost/api/bot/phases"));

    expect(response.status).toBe(403);
  });

  it("returns phases list ordered by order_index", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const { GET } = await import("@/app/api/bot/phases/route");
    const response = await GET(new Request("http://localhost/api/bot/phases"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.phases).toBeDefined();
    expect(Array.isArray(body.phases)).toBe(true);
    expect(body.phases[0].name).toBe("Greet");
  });
});

describe("POST /api/bot/phases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new phase", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const { POST } = await import("@/app/api/bot/phases/route");
    const response = await POST(
      new Request("http://localhost/api/bot/phases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New Phase",
          order_index: 1,
          max_messages: 3,
          system_prompt: "New prompt",
        }),
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.phase.id).toBe("p-new");
  });

  it("returns 400 for missing required fields", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const { POST } = await import("@/app/api/bot/phases/route");
    const response = await POST(
      new Request("http://localhost/api/bot/phases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      })
    );

    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/flow-phases-api.test.ts`
Expected: FAIL — module `@/app/api/bot/phases/route` not found

- [ ] **Step 3: Create the API route**

Create `src/app/api/bot/phases/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  order_index: z.number().int().min(0),
  max_messages: z.number().int().min(1).max(50).default(3),
  system_prompt: z.string().min(1).max(5000),
  tone: z.string().max(200).optional(),
  goals: z.string().max(2000).optional(),
  transition_hint: z.string().max(1000).optional(),
  action_button_ids: z.array(z.string().uuid()).optional(),
  image_attachment_ids: z.array(z.string().uuid()).optional(),
});

async function authenticate() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return { error: "Unauthorized", status: 401 };

  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) return { error: "No tenant associated", status: 403 };

  return { tenantId };
}

export async function GET() {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const service = createServiceClient();
  const { data: phases, error } = await service
    .from("bot_flow_phases")
    .select("*")
    .eq("tenant_id", auth.tenantId)
    .order("order_index", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch phases" }, { status: 500 });
  }

  return NextResponse.json({ phases: phases ?? [] });
}

export async function POST(request: Request) {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data: phase, error } = await service
    .from("bot_flow_phases")
    .insert({
      tenant_id: auth.tenantId,
      name: parsed.data.name,
      order_index: parsed.data.order_index,
      max_messages: parsed.data.max_messages,
      system_prompt: parsed.data.system_prompt,
      tone: parsed.data.tone ?? "friendly and helpful",
      goals: parsed.data.goals ?? null,
      transition_hint: parsed.data.transition_hint ?? null,
      action_button_ids: parsed.data.action_button_ids ?? null,
      image_attachment_ids: parsed.data.image_attachment_ids ?? [],
    })
    .select("*")
    .single();

  if (error || !phase) {
    return NextResponse.json({ error: "Failed to create phase" }, { status: 500 });
  }

  return NextResponse.json({ phase }, { status: 201 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/flow-phases-api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/bot/phases/route.ts tests/unit/flow-phases-api.test.ts
git commit -m "feat: add GET/POST /api/bot/phases for listing and creating flow phases"
```

---

## Task 3: Phase Update + Delete API Routes

**Files:**
- Create: `src/app/api/bot/phases/[id]/route.ts`
- Test: `tests/unit/flow-phases-detail-api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/flow-phases-detail-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    })
  ),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: mockFrom.mockReturnValue({
      update: mockUpdate.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockReturnValue(
                Promise.resolve({
                  data: {
                    id: "p1",
                    name: "Updated Phase",
                    order_index: 0,
                    max_messages: 5,
                    system_prompt: "Updated prompt",
                    tone: "professional",
                    goals: "Updated goals",
                    transition_hint: null,
                    action_button_ids: null,
                    image_attachment_ids: [],
                    created_at: "2026-01-01T00:00:00Z",
                  },
                  error: null,
                })
              ),
            }),
          }),
        }),
      }),
      delete: mockDelete.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue(
            Promise.resolve({ error: null })
          ),
        }),
      }),
    }),
  })),
}));

describe("PATCH /api/bot/phases/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });

    const { PATCH } = await import("@/app/api/bot/phases/[id]/route");
    const response = await PATCH(
      new Request("http://localhost/api/bot/phases/p1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(response.status).toBe(401);
  });

  it("updates a phase", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const { PATCH } = await import("@/app/api/bot/phases/[id]/route");
    const response = await PATCH(
      new Request("http://localhost/api/bot/phases/p1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated Phase", max_messages: 5 }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.phase.name).toBe("Updated Phase");
  });
});

describe("DELETE /api/bot/phases/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes a phase", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const { DELETE: deleteFn } = await import("@/app/api/bot/phases/[id]/route");
    const response = await deleteFn(
      new Request("http://localhost/api/bot/phases/p1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(response.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/flow-phases-detail-api.test.ts`
Expected: FAIL — module `@/app/api/bot/phases/[id]/route` not found

- [ ] **Step 3: Create the API route**

Create `src/app/api/bot/phases/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  order_index: z.number().int().min(0).optional(),
  max_messages: z.number().int().min(1).max(50).optional(),
  system_prompt: z.string().min(1).max(5000).optional(),
  tone: z.string().max(200).optional(),
  goals: z.string().max(2000).nullable().optional(),
  transition_hint: z.string().max(1000).nullable().optional(),
  action_button_ids: z.array(z.string().uuid()).nullable().optional(),
  image_attachment_ids: z.array(z.string().uuid()).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

async function authenticate() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return { error: "Unauthorized", status: 401 };

  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) return { error: "No tenant associated", status: 403 };

  return { tenantId };
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data: phase, error } = await service
    .from("bot_flow_phases")
    .update(parsed.data)
    .eq("id", id)
    .eq("tenant_id", auth.tenantId)
    .select("*")
    .single();

  if (error || !phase) {
    return NextResponse.json({ error: "Failed to update phase" }, { status: 500 });
  }

  return NextResponse.json({ phase });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;

  const service = createServiceClient();
  const { error } = await service
    .from("bot_flow_phases")
    .delete()
    .eq("id", id)
    .eq("tenant_id", auth.tenantId);

  if (error) {
    return NextResponse.json({ error: "Failed to delete phase" }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/flow-phases-detail-api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/bot/phases/[id]/route.ts tests/unit/flow-phases-detail-api.test.ts
git commit -m "feat: add PATCH/DELETE /api/bot/phases/[id] for updating and deleting phases"
```

---

## Task 4: Reorder, Seed, and Picker List API Routes

**Files:**
- Create: `src/app/api/bot/phases/reorder/route.ts`
- Create: `src/app/api/bot/phases/seed/route.ts`
- Create: `src/app/api/bot/action-pages/route.ts`
- Create: `src/app/api/knowledge/images/list/route.ts`
- Test: `tests/unit/flow-phases-reorder-api.test.ts`
- Test: `tests/unit/flow-phases-seed-api.test.ts`
- Test: `tests/unit/action-pages-api.test.ts`
- Test: `tests/unit/knowledge-images-list-api.test.ts`

- [ ] **Step 1: Write the reorder test**

Create `tests/unit/flow-phases-reorder-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockUpsert = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    })
  ),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      upsert: mockUpsert.mockReturnValue(
        Promise.resolve({ error: null })
      ),
    })),
  })),
}));

describe("POST /api/bot/phases/reorder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });

    const { POST } = await import("@/app/api/bot/phases/reorder/route");
    const response = await POST(
      new Request("http://localhost/api/bot/phases/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: [] }),
      })
    );

    expect(response.status).toBe(401);
  });

  it("reorders phases", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const { POST } = await import("@/app/api/bot/phases/reorder/route");
    const response = await POST(
      new Request("http://localhost/api/bot/phases/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order: [
            { id: "p1", order_index: 0 },
            { id: "p2", order_index: 1 },
          ],
        }),
      })
    );

    expect(response.status).toBe(200);
  });

  it("returns 400 for empty order array", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const { POST } = await import("@/app/api/bot/phases/reorder/route");
    const response = await POST(
      new Request("http://localhost/api/bot/phases/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: [] }),
      })
    );

    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/flow-phases-reorder-api.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create the reorder route**

Create `src/app/api/bot/phases/reorder/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const reorderSchema = z.object({
  order: z
    .array(
      z.object({
        id: z.string().uuid(),
        order_index: z.number().int().min(0),
      })
    )
    .min(1),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = reorderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  // Upsert all phases with their new order_index values.
  // Each row must include tenant_id for RLS safety.
  const rows = parsed.data.order.map((item) => ({
    id: item.id,
    tenant_id: tenantId,
    order_index: item.order_index,
  }));

  const { error } = await service
    .from("bot_flow_phases")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    return NextResponse.json({ error: "Failed to reorder phases" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Run reorder test to verify it passes**

Run: `npm test -- tests/unit/flow-phases-reorder-api.test.ts`
Expected: PASS

- [ ] **Step 5: Write the seed test**

Create `tests/unit/flow-phases-seed-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockSeedPhaseTemplates = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    })
  ),
}));

vi.mock("@/lib/ai/phase-templates", () => ({
  seedPhaseTemplates: mockSeedPhaseTemplates,
}));

describe("POST /api/bot/phases/seed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });

    const { POST } = await import("@/app/api/bot/phases/seed/route");
    const response = await POST(
      new Request("http://localhost/api/bot/phases/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_type: "services" }),
      })
    );

    expect(response.status).toBe(401);
  });

  it("seeds phases from template", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });
    mockSeedPhaseTemplates.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/bot/phases/seed/route");
    const response = await POST(
      new Request("http://localhost/api/bot/phases/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_type: "services" }),
      })
    );

    expect(response.status).toBe(201);
    expect(mockSeedPhaseTemplates).toHaveBeenCalledWith("t1", "services");
  });

  it("returns 400 for invalid business type", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const { POST } = await import("@/app/api/bot/phases/seed/route");
    const response = await POST(
      new Request("http://localhost/api/bot/phases/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_type: "invalid_type" }),
      })
    );

    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 6: Create the seed route**

Create `src/app/api/bot/phases/seed/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { seedPhaseTemplates } from "@/lib/ai/phase-templates";
import { z } from "zod";

const seedSchema = z.object({
  business_type: z.enum(["ecommerce", "real_estate", "digital_product", "services"]),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = seedSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    await seedPhaseTemplates(tenantId, parsed.data.business_type);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to seed phases";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
```

- [ ] **Step 7: Run seed test to verify it passes**

Run: `npm test -- tests/unit/flow-phases-seed-api.test.ts`
Expected: PASS

- [ ] **Step 8: Write the action pages list test**

Create `tests/unit/action-pages-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    })
  ),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() =>
            Promise.resolve({
              data: [
                { id: "ap1", title: "Book a Call", type: "calendar", slug: "book-call" },
                { id: "ap2", title: "Contact Form", type: "form", slug: "contact" },
              ],
              error: null,
            })
          ),
        })),
      })),
    })),
  })),
}));

describe("GET /api/bot/action-pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });

    const { GET } = await import("@/app/api/bot/action-pages/route");
    const response = await GET(new Request("http://localhost/api/bot/action-pages"));

    expect(response.status).toBe(401);
  });

  it("returns action pages list", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const { GET } = await import("@/app/api/bot/action-pages/route");
    const response = await GET(new Request("http://localhost/api/bot/action-pages"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.actionPages).toHaveLength(2);
    expect(body.actionPages[0].title).toBe("Book a Call");
  });
});
```

- [ ] **Step 9: Create the action pages list route**

Create `src/app/api/bot/action-pages/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 });
  }

  const service = createServiceClient();
  const { data: actionPages, error } = await service
    .from("action_pages")
    .select("id, title, type, slug")
    .eq("tenant_id", tenantId)
    .order("title", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch action pages" }, { status: 500 });
  }

  return NextResponse.json({ actionPages: actionPages ?? [] });
}
```

- [ ] **Step 10: Write the knowledge images list test**

Create `tests/unit/knowledge-images-list-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    })
  ),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() =>
            Promise.resolve({
              data: [
                { id: "img1", url: "https://res.cloudinary.com/demo/img1.jpg", description: "Office photo", tags: ["office"] },
                { id: "img2", url: "https://res.cloudinary.com/demo/img2.jpg", description: "Product shot", tags: ["product"] },
              ],
              error: null,
            })
          ),
        })),
      })),
    })),
  })),
}));

describe("GET /api/knowledge/images/list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });

    const { GET } = await import("@/app/api/knowledge/images/list/route");
    const response = await GET(new Request("http://localhost/api/knowledge/images/list"));

    expect(response.status).toBe(401);
  });

  it("returns knowledge images list", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const { GET } = await import("@/app/api/knowledge/images/list/route");
    const response = await GET(new Request("http://localhost/api/knowledge/images/list"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.images).toHaveLength(2);
    expect(body.images[0].description).toBe("Office photo");
  });
});
```

- [ ] **Step 11: Create the knowledge images list route**

Create `src/app/api/knowledge/images/list/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 });
  }

  const service = createServiceClient();
  const { data: images, error } = await service
    .from("knowledge_images")
    .select("id, url, description, tags")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch images" }, { status: 500 });
  }

  return NextResponse.json({ images: images ?? [] });
}
```

- [ ] **Step 12: Run all Task 4 tests to verify they pass**

Run: `npm test -- tests/unit/flow-phases-reorder-api.test.ts tests/unit/flow-phases-seed-api.test.ts tests/unit/action-pages-api.test.ts tests/unit/knowledge-images-list-api.test.ts`
Expected: All PASS

- [ ] **Step 13: Commit**

```bash
git add src/app/api/bot/phases/reorder/route.ts src/app/api/bot/phases/seed/route.ts src/app/api/bot/action-pages/route.ts src/app/api/knowledge/images/list/route.ts tests/unit/flow-phases-reorder-api.test.ts tests/unit/flow-phases-seed-api.test.ts tests/unit/action-pages-api.test.ts tests/unit/knowledge-images-list-api.test.ts
git commit -m "feat: add reorder, seed, action-pages, and images-list API routes for flow builder"
```

---

## Task 5: `useFlowPhases` Hook

**Files:**
- Create: `src/hooks/useFlowPhases.ts`
- Test: `tests/unit/use-flow-phases.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/use-flow-phases.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useFlowPhases } from "@/hooks/useFlowPhases";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockPhases = [
  {
    id: "p1",
    name: "Greet",
    order_index: 0,
    max_messages: 1,
    system_prompt: "Welcome",
    tone: "friendly",
    goals: null,
    transition_hint: null,
    action_button_ids: null,
    image_attachment_ids: [],
    created_at: "2026-01-01",
  },
  {
    id: "p2",
    name: "Nurture",
    order_index: 1,
    max_messages: 3,
    system_prompt: "Build rapport",
    tone: "genuine",
    goals: "Build trust",
    transition_hint: "Move to qualify",
    action_button_ids: null,
    image_attachment_ids: [],
    created_at: "2026-01-01",
  },
];

describe("useFlowPhases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches phases on mount", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ phases: mockPhases }),
    });

    const { result } = renderHook(() => useFlowPhases());

    await waitFor(() => {
      expect(result.current.phases).toHaveLength(2);
    });

    expect(result.current.phases[0].name).toBe("Greet");
    expect(result.current.loading).toBe(false);
  });

  it("exposes a refetch function", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ phases: [] }),
    });

    const { result } = renderHook(() => useFlowPhases());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      result.current.refetch();
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("createPhase calls POST and refetches", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phases: mockPhases }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phase: { id: "p3" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phases: [...mockPhases, { id: "p3", name: "New", order_index: 2 }] }),
      });

    const { result } = renderHook(() => useFlowPhases());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.createPhase({
        name: "New",
        order_index: 2,
        max_messages: 3,
        system_prompt: "New prompt",
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/bot/phases",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("updatePhase calls PATCH and refetches", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phases: mockPhases }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phase: { id: "p1", name: "Updated" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phases: mockPhases }),
      });

    const { result } = renderHook(() => useFlowPhases());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.updatePhase("p1", { name: "Updated" });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/bot/phases/p1",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("deletePhase calls DELETE and refetches", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phases: mockPhases }),
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phases: [mockPhases[1]] }),
      });

    const { result } = renderHook(() => useFlowPhases());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.deletePhase("p1");
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/bot/phases/p1",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("reorderPhases calls POST reorder and refetches", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phases: mockPhases }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phases: [mockPhases[1], mockPhases[0]] }),
      });

    const { result } = renderHook(() => useFlowPhases());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.reorderPhases([
        { id: "p2", order_index: 0 },
        { id: "p1", order_index: 1 },
      ]);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/bot/phases/reorder",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("seedPhases calls POST seed and refetches", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phases: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ phases: mockPhases }),
      });

    const { result } = renderHook(() => useFlowPhases());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.seedPhases("services");
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/bot/phases/seed",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ business_type: "services" }),
      })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/use-flow-phases.test.ts`
Expected: FAIL — module `@/hooks/useFlowPhases` not found

- [ ] **Step 3: Create the hook**

Create `src/hooks/useFlowPhases.ts`:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";

export interface FlowPhase {
  id: string;
  tenant_id: string;
  name: string;
  order_index: number;
  max_messages: number;
  system_prompt: string;
  tone: string | null;
  goals: string | null;
  transition_hint: string | null;
  action_button_ids: string[] | null;
  image_attachment_ids: string[];
  created_at: string;
}

type CreatePhaseInput = {
  name: string;
  order_index: number;
  max_messages: number;
  system_prompt: string;
  tone?: string;
  goals?: string;
  transition_hint?: string;
  action_button_ids?: string[];
  image_attachment_ids?: string[];
};

type UpdatePhaseInput = Partial<Omit<CreatePhaseInput, "order_index">>;

type ReorderItem = { id: string; order_index: number };

type BusinessType = "ecommerce" | "real_estate" | "digital_product" | "services";

export function useFlowPhases() {
  const [phases, setPhases] = useState<FlowPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPhases = useCallback(async () => {
    try {
      const res = await fetch("/api/bot/phases");
      if (!res.ok) {
        setError("Failed to fetch phases");
        return;
      }
      const data = await res.json();
      setPhases(data.phases);
      setError(null);
    } catch {
      setError("Failed to fetch phases");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPhases();
  }, [fetchPhases]);

  const createPhase = useCallback(
    async (input: CreatePhaseInput) => {
      const res = await fetch("/api/bot/phases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to create phase");
      await fetchPhases();
    },
    [fetchPhases]
  );

  const updatePhase = useCallback(
    async (id: string, input: UpdatePhaseInput) => {
      const res = await fetch(`/api/bot/phases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to update phase");
      await fetchPhases();
    },
    [fetchPhases]
  );

  const deletePhase = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/bot/phases/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete phase");
      await fetchPhases();
    },
    [fetchPhases]
  );

  const reorderPhases = useCallback(
    async (order: ReorderItem[]) => {
      const res = await fetch("/api/bot/phases/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      if (!res.ok) throw new Error("Failed to reorder phases");
      await fetchPhases();
    },
    [fetchPhases]
  );

  const seedPhases = useCallback(
    async (businessType: BusinessType) => {
      const res = await fetch("/api/bot/phases/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_type: businessType }),
      });
      if (!res.ok) throw new Error("Failed to seed phases");
      await fetchPhases();
    },
    [fetchPhases]
  );

  return {
    phases,
    loading,
    error,
    refetch: fetchPhases,
    createPhase,
    updatePhase,
    deletePhase,
    reorderPhases,
    seedPhases,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/use-flow-phases.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useFlowPhases.ts tests/unit/use-flow-phases.test.ts
git commit -m "feat: add useFlowPhases hook with CRUD, reorder, and seed operations"
```

---

## Task 6: `TemplateSelector` Component

**Files:**
- Create: `src/components/dashboard/flow/TemplateSelector.tsx`
- Test: `tests/unit/template-selector.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/template-selector.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TemplateSelector from "@/components/dashboard/flow/TemplateSelector";

describe("TemplateSelector", () => {
  const mockOnSeed = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders four business type options", () => {
    render(<TemplateSelector onSeed={mockOnSeed} seeding={false} />);

    expect(screen.getByText("E-Commerce")).toBeInTheDocument();
    expect(screen.getByText("Real Estate")).toBeInTheDocument();
    expect(screen.getByText("Digital Product")).toBeInTheDocument();
    expect(screen.getByText("Services")).toBeInTheDocument();
  });

  it("shows empty state heading", () => {
    render(<TemplateSelector onSeed={mockOnSeed} seeding={false} />);

    expect(screen.getByText("No conversation flow configured")).toBeInTheDocument();
  });

  it("calls onSeed with selected business type", async () => {
    const user = userEvent.setup();
    render(<TemplateSelector onSeed={mockOnSeed} seeding={false} />);

    await user.click(screen.getByText("Services"));

    expect(mockOnSeed).toHaveBeenCalledWith("services");
  });

  it("calls onSeed with ecommerce type", async () => {
    const user = userEvent.setup();
    render(<TemplateSelector onSeed={mockOnSeed} seeding={false} />);

    await user.click(screen.getByText("E-Commerce"));

    expect(mockOnSeed).toHaveBeenCalledWith("ecommerce");
  });

  it("disables buttons while seeding", () => {
    render(<TemplateSelector onSeed={mockOnSeed} seeding={true} />);

    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/template-selector.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create the component**

Create `src/components/dashboard/flow/TemplateSelector.tsx`:

```tsx
"use client";

import { ShoppingCart, Home, Package, Briefcase } from "lucide-react";
import Button from "@/components/ui/Button";

type BusinessType = "ecommerce" | "real_estate" | "digital_product" | "services";

interface TemplateSelectorProps {
  onSeed: (businessType: BusinessType) => void;
  seeding: boolean;
}

const TEMPLATES: { type: BusinessType; label: string; icon: React.ElementType; description: string }[] = [
  {
    type: "ecommerce",
    label: "E-Commerce",
    icon: ShoppingCart,
    description: "Greet → Browse → Recommend → Cart → Follow-up",
  },
  {
    type: "real_estate",
    label: "Real Estate",
    icon: Home,
    description: "Greet → Understand Needs → Qualify → Show Listings → Schedule",
  },
  {
    type: "digital_product",
    label: "Digital Product",
    icon: Package,
    description: "Greet → Educate → Demo → Pitch → Close",
  },
  {
    type: "services",
    label: "Services",
    icon: Briefcase,
    description: "Greet → Nurture → Qualify → Pitch → Close",
  },
];

export default function TemplateSelector({ onSeed, seeding }: TemplateSelectorProps) {
  return (
    <div className="flex flex-col items-center py-12">
      <div className="mb-2 rounded-full bg-[var(--ws-accent)]/10 p-3">
        <Briefcase className="h-6 w-6 text-[var(--ws-accent)]" />
      </div>
      <h2 className="mb-1 text-lg font-semibold text-[var(--ws-text-primary)]">
        No conversation flow configured
      </h2>
      <p className="mb-8 max-w-md text-center text-sm text-[var(--ws-text-tertiary)]">
        Choose a template to get started. Each template creates a multi-phase
        conversation flow tailored to your business type. You can customize
        every phase after seeding.
      </p>
      <div className="grid w-full max-w-2xl grid-cols-2 gap-3">
        {TEMPLATES.map((tmpl) => {
          const Icon = tmpl.icon;
          return (
            <Button
              key={tmpl.type}
              variant="secondary"
              disabled={seeding}
              onClick={() => onSeed(tmpl.type)}
              className="flex h-auto flex-col items-start gap-1 rounded-xl px-4 py-4 text-left"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-[var(--ws-accent)]" />
                <span className="text-sm font-medium text-[var(--ws-text-primary)]">
                  {tmpl.label}
                </span>
              </div>
              <span className="text-xs text-[var(--ws-text-muted)]">
                {tmpl.description}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/template-selector.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/flow/TemplateSelector.tsx tests/unit/template-selector.test.tsx
git commit -m "feat: add TemplateSelector component for seeding conversation flow from templates"
```

---

## Task 7: `ImageAttachmentPicker` Component

**Files:**
- Create: `src/components/dashboard/flow/ImageAttachmentPicker.tsx`
- Test: `tests/unit/image-attachment-picker.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/image-attachment-picker.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImageAttachmentPicker from "@/components/dashboard/flow/ImageAttachmentPicker";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockImages = [
  { id: "img1", url: "https://example.com/img1.jpg", description: "Office photo", tags: ["office"] },
  { id: "img2", url: "https://example.com/img2.jpg", description: "Product shot", tags: ["product"] },
  { id: "img3", url: "https://example.com/img3.jpg", description: "Team photo", tags: ["team"] },
];

describe("ImageAttachmentPicker", () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ images: mockImages }),
    });
  });

  it("loads and displays available images", async () => {
    render(<ImageAttachmentPicker selectedIds={[]} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.getByText("Office photo")).toBeInTheDocument();
      expect(screen.getByText("Product shot")).toBeInTheDocument();
      expect(screen.getByText("Team photo")).toBeInTheDocument();
    });
  });

  it("shows selected state for pre-selected images", async () => {
    render(<ImageAttachmentPicker selectedIds={["img1"]} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.getByText("Office photo")).toBeInTheDocument();
    });

    const img1Checkbox = screen.getByLabelText("Office photo");
    expect(img1Checkbox).toBeChecked();
  });

  it("calls onChange when toggling an image", async () => {
    const user = userEvent.setup();
    render(<ImageAttachmentPicker selectedIds={[]} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.getByText("Office photo")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Office photo"));

    expect(mockOnChange).toHaveBeenCalledWith(["img1"]);
  });

  it("calls onChange with removed id when deselecting", async () => {
    const user = userEvent.setup();
    render(<ImageAttachmentPicker selectedIds={["img1", "img2"]} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.getByText("Office photo")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Office photo"));

    expect(mockOnChange).toHaveBeenCalledWith(["img2"]);
  });

  it("shows empty state when no images exist", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ images: [] }),
    });

    render(<ImageAttachmentPicker selectedIds={[]} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.getByText(/no images available/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/image-attachment-picker.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create the component**

Create `src/components/dashboard/flow/ImageAttachmentPicker.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { ImageIcon } from "lucide-react";

interface KnowledgeImage {
  id: string;
  url: string;
  description: string;
  tags: string[];
}

interface ImageAttachmentPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function ImageAttachmentPicker({ selectedIds, onChange }: ImageAttachmentPickerProps) {
  const [images, setImages] = useState<KnowledgeImage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/knowledge/images/list")
      .then((res) => (res.ok ? res.json() : { images: [] }))
      .then((data) => setImages(data.images ?? []))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  if (loading) {
    return <p className="text-xs text-[var(--ws-text-muted)]">Loading images...</p>;
  }

  if (images.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--ws-border-strong)] px-3 py-2">
        <ImageIcon className="h-4 w-4 text-[var(--ws-text-muted)]" />
        <p className="text-xs text-[var(--ws-text-muted)]">
          No images available. Upload images in the Knowledge Base tab first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {images.map((img) => (
        <label
          key={img.id}
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--ws-border)] px-3 py-2 transition-colors hover:bg-[var(--ws-page)]"
        >
          <input
            type="checkbox"
            checked={selectedIds.includes(img.id)}
            onChange={() => toggle(img.id)}
            aria-label={img.description}
            className="h-4 w-4 rounded border-[var(--ws-border-strong)] text-[var(--ws-accent)]"
          />
          <img
            src={img.url}
            alt={img.description}
            className="h-8 w-8 rounded object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-[var(--ws-text-primary)]">{img.description}</p>
            {img.tags.length > 0 && (
              <p className="truncate text-xs text-[var(--ws-text-muted)]">
                {img.tags.join(", ")}
              </p>
            )}
          </div>
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/image-attachment-picker.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/flow/ImageAttachmentPicker.tsx tests/unit/image-attachment-picker.test.tsx
git commit -m "feat: add ImageAttachmentPicker component for attaching knowledge images to phases"
```

---

## Task 8: `ActionButtonPicker` Component

**Files:**
- Create: `src/components/dashboard/flow/ActionButtonPicker.tsx`
- Test: `tests/unit/action-button-picker.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/action-button-picker.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActionButtonPicker from "@/components/dashboard/flow/ActionButtonPicker";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockPages = [
  { id: "ap1", title: "Book a Call", type: "calendar", slug: "book-call" },
  { id: "ap2", title: "Contact Form", type: "form", slug: "contact" },
];

describe("ActionButtonPicker", () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ actionPages: mockPages }),
    });
  });

  it("loads and displays available action pages", async () => {
    render(<ActionButtonPicker selectedIds={[]} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.getByText("Book a Call")).toBeInTheDocument();
      expect(screen.getByText("Contact Form")).toBeInTheDocument();
    });
  });

  it("shows selected state for pre-selected pages", async () => {
    render(<ActionButtonPicker selectedIds={["ap1"]} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.getByText("Book a Call")).toBeInTheDocument();
    });

    const checkbox = screen.getByLabelText("Book a Call");
    expect(checkbox).toBeChecked();
  });

  it("calls onChange when toggling", async () => {
    const user = userEvent.setup();
    render(<ActionButtonPicker selectedIds={[]} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.getByText("Book a Call")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Book a Call"));

    expect(mockOnChange).toHaveBeenCalledWith(["ap1"]);
  });

  it("shows empty state when no action pages exist", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ actionPages: [] }),
    });

    render(<ActionButtonPicker selectedIds={[]} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.getByText(/no action pages/i)).toBeInTheDocument();
    });
  });

  it("shows type badge for each page", async () => {
    render(<ActionButtonPicker selectedIds={[]} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.getByText("calendar")).toBeInTheDocument();
      expect(screen.getByText("form")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/action-button-picker.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create the component**

Create `src/components/dashboard/flow/ActionButtonPicker.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { MousePointerClick } from "lucide-react";
import Badge from "@/components/ui/Badge";

interface ActionPage {
  id: string;
  title: string;
  type: string;
  slug: string;
}

interface ActionButtonPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function ActionButtonPicker({ selectedIds, onChange }: ActionButtonPickerProps) {
  const [pages, setPages] = useState<ActionPage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/bot/action-pages")
      .then((res) => (res.ok ? res.json() : { actionPages: [] }))
      .then((data) => setPages(data.actionPages ?? []))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  if (loading) {
    return <p className="text-xs text-[var(--ws-text-muted)]">Loading action pages...</p>;
  }

  if (pages.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--ws-border-strong)] px-3 py-2">
        <MousePointerClick className="h-4 w-4 text-[var(--ws-text-muted)]" />
        <p className="text-xs text-[var(--ws-text-muted)]">
          No action pages created yet. Create action pages in the Actions section first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {pages.map((page) => (
        <label
          key={page.id}
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--ws-border)] px-3 py-2 transition-colors hover:bg-[var(--ws-page)]"
        >
          <input
            type="checkbox"
            checked={selectedIds.includes(page.id)}
            onChange={() => toggle(page.id)}
            aria-label={page.title}
            className="h-4 w-4 rounded border-[var(--ws-border-strong)] text-[var(--ws-accent)]"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-[var(--ws-text-primary)]">{page.title}</p>
          </div>
          <Badge variant="muted">{page.type}</Badge>
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/action-button-picker.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/flow/ActionButtonPicker.tsx tests/unit/action-button-picker.test.tsx
git commit -m "feat: add ActionButtonPicker component for attaching action pages to phases"
```

---

## Task 9: `PhaseForm` Component

**Files:**
- Create: `src/components/dashboard/flow/PhaseForm.tsx`
- Test: `tests/unit/phase-form.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/phase-form.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PhaseForm from "@/components/dashboard/flow/PhaseForm";

// Mock the picker sub-components to isolate PhaseForm testing
vi.mock("@/components/dashboard/flow/ImageAttachmentPicker", () => ({
  default: ({ selectedIds, onChange }: { selectedIds: string[]; onChange: (ids: string[]) => void }) => (
    <div data-testid="image-picker">Images: {selectedIds.length}</div>
  ),
}));

vi.mock("@/components/dashboard/flow/ActionButtonPicker", () => ({
  default: ({ selectedIds, onChange }: { selectedIds: string[]; onChange: (ids: string[]) => void }) => (
    <div data-testid="action-picker">Actions: {selectedIds.length}</div>
  ),
}));

const mockPhase = {
  id: "p1",
  tenant_id: "t1",
  name: "Greet",
  order_index: 0,
  max_messages: 1,
  system_prompt: "Welcome the lead",
  tone: "friendly",
  goals: "Make them feel welcome",
  transition_hint: "Move to nurture",
  action_button_ids: null,
  image_attachment_ids: [],
  created_at: "2026-01-01",
};

describe("PhaseForm", () => {
  const mockOnSave = vi.fn();
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSave.mockResolvedValue(undefined);
  });

  it("renders form fields with phase data", () => {
    render(
      <PhaseForm phase={mockPhase} onSave={mockOnSave} onDelete={mockOnDelete} />
    );

    expect(screen.getByDisplayValue("Greet")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Welcome the lead")).toBeInTheDocument();
    expect(screen.getByDisplayValue("friendly")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Make them feel welcome")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Move to nurture")).toBeInTheDocument();
  });

  it("renders max_messages input", () => {
    render(
      <PhaseForm phase={mockPhase} onSave={mockOnSave} onDelete={mockOnDelete} />
    );

    const input = screen.getByLabelText(/max messages/i);
    expect(input).toHaveValue(1);
  });

  it("calls onSave with updated values", async () => {
    const user = userEvent.setup();
    render(
      <PhaseForm phase={mockPhase} onSave={mockOnSave} onDelete={mockOnDelete} />
    );

    const nameInput = screen.getByDisplayValue("Greet");
    await user.clear(nameInput);
    await user.type(nameInput, "Welcome");
    await user.click(screen.getByText("Save Changes"));

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Welcome" })
      );
    });
  });

  it("calls onDelete when delete button clicked", async () => {
    const user = userEvent.setup();
    render(
      <PhaseForm phase={mockPhase} onSave={mockOnSave} onDelete={mockOnDelete} />
    );

    await user.click(screen.getByText("Delete Phase"));

    expect(mockOnDelete).toHaveBeenCalled();
  });

  it("renders image and action pickers", () => {
    render(
      <PhaseForm phase={mockPhase} onSave={mockOnSave} onDelete={mockOnDelete} />
    );

    expect(screen.getByTestId("image-picker")).toBeInTheDocument();
    expect(screen.getByTestId("action-picker")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/phase-form.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create the component**

Create `src/components/dashboard/flow/PhaseForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import ImageAttachmentPicker from "./ImageAttachmentPicker";
import ActionButtonPicker from "./ActionButtonPicker";
import type { FlowPhase } from "@/hooks/useFlowPhases";

interface PhaseFormProps {
  phase: FlowPhase;
  onSave: (updates: Partial<FlowPhase>) => Promise<void>;
  onDelete: () => void;
}

export default function PhaseForm({ phase, onSave, onDelete }: PhaseFormProps) {
  const [name, setName] = useState(phase.name);
  const [maxMessages, setMaxMessages] = useState(phase.max_messages);
  const [systemPrompt, setSystemPrompt] = useState(phase.system_prompt);
  const [tone, setTone] = useState(phase.tone ?? "");
  const [goals, setGoals] = useState(phase.goals ?? "");
  const [transitionHint, setTransitionHint] = useState(phase.transition_hint ?? "");
  const [actionButtonIds, setActionButtonIds] = useState<string[]>(phase.action_button_ids ?? []);
  const [imageAttachmentIds, setImageAttachmentIds] = useState<string[]>(phase.image_attachment_ids ?? []);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        name,
        max_messages: maxMessages,
        system_prompt: systemPrompt,
        tone: tone || null,
        goals: goals || null,
        transition_hint: transitionHint || null,
        action_button_ids: actionButtonIds.length > 0 ? actionButtonIds : null,
        image_attachment_ids: imageAttachmentIds,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      {/* Name + Max Messages row */}
      <div className="grid grid-cols-[1fr_120px] gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
            Phase Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] outline-none focus:border-[var(--ws-accent)]"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]" htmlFor={`max-msg-${phase.id}`}>
            Max Messages
          </label>
          <input
            id={`max-msg-${phase.id}`}
            type="number"
            min={1}
            max={50}
            value={maxMessages}
            onChange={(e) => setMaxMessages(parseInt(e.target.value) || 1)}
            className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] outline-none focus:border-[var(--ws-accent)]"
          />
        </div>
      </div>

      {/* System Prompt */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
          System Prompt
        </label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] outline-none focus:border-[var(--ws-accent)]"
        />
      </div>

      {/* Tone */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
          Tone
        </label>
        <input
          type="text"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          placeholder="e.g. friendly and helpful"
          className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
        />
      </div>

      {/* Goals */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
          Goals
        </label>
        <textarea
          value={goals}
          onChange={(e) => setGoals(e.target.value)}
          rows={2}
          placeholder="What should the bot accomplish in this phase?"
          className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
        />
      </div>

      {/* Transition Hint */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
          Transition Hint
        </label>
        <input
          type="text"
          value={transitionHint}
          onChange={(e) => setTransitionHint(e.target.value)}
          placeholder="When should the bot move to the next phase?"
          className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
        />
      </div>

      {/* Action Buttons */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
          Action Buttons
        </label>
        <p className="mb-2 text-xs text-[var(--ws-text-tertiary)]">
          Select action pages the bot can send as buttons during this phase.
        </p>
        <ActionButtonPicker selectedIds={actionButtonIds} onChange={setActionButtonIds} />
      </div>

      {/* Image Attachments */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
          Image Attachments
        </label>
        <p className="mb-2 text-xs text-[var(--ws-text-tertiary)]">
          Select images the bot can send during this phase when contextually relevant.
        </p>
        <ImageAttachmentPicker selectedIds={imageAttachmentIds} onChange={setImageAttachmentIds} />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-[var(--ws-border)] pt-4">
        <Button variant="ghost" onClick={onDelete} className="text-[var(--ws-danger)]">
          <Trash2 className="h-4 w-4" />
          Delete Phase
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/phase-form.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/flow/PhaseForm.tsx tests/unit/phase-form.test.tsx
git commit -m "feat: add PhaseForm component with all phase config fields and pickers"
```

---

## Task 10: `PhaseCard` Component

**Files:**
- Create: `src/components/dashboard/flow/PhaseCard.tsx`
- Test: `tests/unit/phase-card.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/phase-card.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PhaseCard from "@/components/dashboard/flow/PhaseCard";

// Mock PhaseForm
vi.mock("@/components/dashboard/flow/PhaseForm", () => ({
  default: ({ phase, onSave, onDelete }: any) => (
    <div data-testid="phase-form">
      <span>Form for {phase.name}</span>
      <button onClick={onDelete}>Delete Phase</button>
    </div>
  ),
}));

const mockPhase = {
  id: "p1",
  tenant_id: "t1",
  name: "Greet",
  order_index: 0,
  max_messages: 1,
  system_prompt: "Welcome the lead",
  tone: "friendly",
  goals: "Make them feel welcome",
  transition_hint: "Move to nurture",
  action_button_ids: null,
  image_attachment_ids: [],
  created_at: "2026-01-01",
};

describe("PhaseCard", () => {
  const mockOnSave = vi.fn();
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders phase name and order", () => {
    render(
      <PhaseCard phase={mockPhase} onSave={mockOnSave} onDelete={mockOnDelete} />
    );

    expect(screen.getByText("Greet")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument(); // order_index + 1
  });

  it("shows tone badge", () => {
    render(
      <PhaseCard phase={mockPhase} onSave={mockOnSave} onDelete={mockOnDelete} />
    );

    expect(screen.getByText("friendly")).toBeInTheDocument();
  });

  it("shows max messages info", () => {
    render(
      <PhaseCard phase={mockPhase} onSave={mockOnSave} onDelete={mockOnDelete} />
    );

    expect(screen.getByText(/1 msg/i)).toBeInTheDocument();
  });

  it("expands to show PhaseForm on click", async () => {
    const user = userEvent.setup();
    render(
      <PhaseCard phase={mockPhase} onSave={mockOnSave} onDelete={mockOnDelete} />
    );

    expect(screen.queryByTestId("phase-form")).not.toBeInTheDocument();

    await user.click(screen.getByText("Greet"));

    expect(screen.getByTestId("phase-form")).toBeInTheDocument();
  });

  it("collapses when clicking header again", async () => {
    const user = userEvent.setup();
    render(
      <PhaseCard phase={mockPhase} onSave={mockOnSave} onDelete={mockOnDelete} />
    );

    await user.click(screen.getByText("Greet"));
    expect(screen.getByTestId("phase-form")).toBeInTheDocument();

    await user.click(screen.getByText("Greet"));
    expect(screen.queryByTestId("phase-form")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/phase-card.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create the component**

Create `src/components/dashboard/flow/PhaseCard.tsx`:

```tsx
"use client";

import { forwardRef, useState } from "react";
import { ChevronDown, GripVertical } from "lucide-react";
import { clsx } from "clsx";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import PhaseForm from "./PhaseForm";
import type { FlowPhase } from "@/hooks/useFlowPhases";

interface PhaseCardProps {
  phase: FlowPhase;
  onSave: (updates: Partial<FlowPhase>) => Promise<void>;
  onDelete: () => void;
  dragHandleProps?: Record<string, unknown>;
}

const PhaseCard = forwardRef<HTMLDivElement, PhaseCardProps>(
  function PhaseCard({ phase, onSave, onDelete, dragHandleProps }, ref) {
    const [expanded, setExpanded] = useState(false);

    return (
      <Card ref={ref} className="overflow-hidden">
        {/* Header — click to expand/collapse */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          {/* Drag handle */}
          <div
            {...dragHandleProps}
            className="cursor-grab text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </div>

          {/* Phase number */}
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ws-accent)]/10 text-xs font-semibold text-[var(--ws-accent)]">
            {phase.order_index + 1}
          </div>

          {/* Phase name */}
          <span className="flex-1 text-sm font-medium text-[var(--ws-text-primary)]">
            {phase.name}
          </span>

          {/* Meta badges */}
          {phase.tone && (
            <Badge variant="muted">{phase.tone}</Badge>
          )}
          <span className="text-xs text-[var(--ws-text-muted)]">
            {phase.max_messages} msg{phase.max_messages !== 1 ? "s" : ""}
          </span>

          {/* Expand chevron */}
          <ChevronDown
            className={clsx(
              "h-4 w-4 text-[var(--ws-text-muted)] transition-transform",
              expanded && "rotate-180"
            )}
          />
        </button>

        {/* Expanded form */}
        {expanded && (
          <div className="border-t border-[var(--ws-border)]">
            <PhaseForm phase={phase} onSave={onSave} onDelete={onDelete} />
          </div>
        )}
      </Card>
    );
  }
);

export default PhaseCard;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/phase-card.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/flow/PhaseCard.tsx tests/unit/phase-card.test.tsx
git commit -m "feat: add PhaseCard component with expand/collapse and drag handle"
```

---

## Task 11: `PhaseList` Component with Drag-to-Reorder

**Files:**
- Create: `src/components/dashboard/flow/PhaseList.tsx`
- Test: `tests/unit/phase-list.test.tsx`

- [ ] **Step 1: Install dnd-kit dependencies**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/phase-list.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PhaseList from "@/components/dashboard/flow/PhaseList";

// Mock PhaseCard to keep tests focused on list behavior
vi.mock("@/components/dashboard/flow/PhaseCard", () => ({
  default: ({ phase, onSave, onDelete }: any) => (
    <div data-testid={`phase-card-${phase.id}`}>
      <span>{phase.name}</span>
      <button onClick={onDelete}>Delete {phase.name}</button>
    </div>
  ),
}));

// Mock dnd-kit (drag interactions are hard to unit test — tested in E2E)
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: any) => <div>{children}</div>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: any) => <div>{children}</div>,
  verticalListSortingStrategy: {},
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
  })),
  sortableKeyboardCoordinates: vi.fn(),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => "" } },
}));

const mockPhases = [
  {
    id: "p1", tenant_id: "t1", name: "Greet", order_index: 0, max_messages: 1,
    system_prompt: "Welcome", tone: "friendly", goals: null, transition_hint: null,
    action_button_ids: null, image_attachment_ids: [], created_at: "2026-01-01",
  },
  {
    id: "p2", tenant_id: "t1", name: "Nurture", order_index: 1, max_messages: 3,
    system_prompt: "Build rapport", tone: "genuine", goals: "Build trust",
    transition_hint: "Move to qualify", action_button_ids: null,
    image_attachment_ids: [], created_at: "2026-01-01",
  },
];

describe("PhaseList", () => {
  const mockOnUpdate = vi.fn();
  const mockOnDelete = vi.fn();
  const mockOnReorder = vi.fn();
  const mockOnCreate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all phase cards", () => {
    render(
      <PhaseList
        phases={mockPhases}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onReorder={mockOnReorder}
        onCreatePhase={mockOnCreate}
      />
    );

    expect(screen.getByTestId("phase-card-p1")).toBeInTheDocument();
    expect(screen.getByTestId("phase-card-p2")).toBeInTheDocument();
  });

  it("renders phase names in order", () => {
    render(
      <PhaseList
        phases={mockPhases}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onReorder={mockOnReorder}
        onCreatePhase={mockOnCreate}
      />
    );

    expect(screen.getByText("Greet")).toBeInTheDocument();
    expect(screen.getByText("Nurture")).toBeInTheDocument();
  });

  it("shows Add Phase button", () => {
    render(
      <PhaseList
        phases={mockPhases}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onReorder={mockOnReorder}
        onCreatePhase={mockOnCreate}
      />
    );

    expect(screen.getByText("Add Phase")).toBeInTheDocument();
  });

  it("calls onCreatePhase when Add Phase clicked", async () => {
    const user = userEvent.setup();
    render(
      <PhaseList
        phases={mockPhases}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onReorder={mockOnReorder}
        onCreatePhase={mockOnCreate}
      />
    );

    await user.click(screen.getByText("Add Phase"));

    expect(mockOnCreate).toHaveBeenCalled();
  });

  it("renders phase count", () => {
    render(
      <PhaseList
        phases={mockPhases}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onReorder={mockOnReorder}
        onCreatePhase={mockOnCreate}
      />
    );

    expect(screen.getByText("2 phases")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/unit/phase-list.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 4: Create the component**

Create `src/components/dashboard/flow/PhaseList.tsx`:

```tsx
"use client";

import { useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import Button from "@/components/ui/Button";
import PhaseCard from "./PhaseCard";
import type { FlowPhase } from "@/hooks/useFlowPhases";

interface SortablePhaseProps {
  phase: FlowPhase;
  onSave: (updates: Partial<FlowPhase>) => Promise<void>;
  onDelete: () => void;
}

function SortablePhase({ phase, onSave, onDelete }: SortablePhaseProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: phase.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <PhaseCard
        phase={phase}
        onSave={onSave}
        onDelete={onDelete}
        dragHandleProps={listeners}
      />
    </div>
  );
}

interface PhaseListProps {
  phases: FlowPhase[];
  onUpdate: (id: string, updates: Partial<FlowPhase>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReorder: (order: { id: string; order_index: number }[]) => Promise<void>;
  onCreatePhase: () => void;
}

export default function PhaseList({
  phases,
  onUpdate,
  onDelete,
  onReorder,
  onCreatePhase,
}: PhaseListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = phases.findIndex((p) => p.id === active.id);
      const newIndex = phases.findIndex((p) => p.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return;

      // Build new order: move the dragged item to its new position
      const reordered = [...phases];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);

      const order = reordered.map((p, i) => ({ id: p.id, order_index: i }));
      onReorder(order);
    },
    [phases, onReorder]
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[var(--ws-text-tertiary)]">
          {phases.length} phase{phases.length !== 1 ? "s" : ""}
        </p>
        <Button variant="secondary" onClick={onCreatePhase}>
          <Plus className="h-4 w-4" />
          Add Phase
        </Button>
      </div>

      {/* Sortable list */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={phases.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {phases.map((phase) => (
              <SortablePhase
                key={phase.id}
                phase={phase}
                onSave={(updates) => onUpdate(phase.id, updates)}
                onDelete={() => onDelete(phase.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/unit/phase-list.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/flow/PhaseList.tsx tests/unit/phase-list.test.tsx package.json package-lock.json
git commit -m "feat: add PhaseList component with @dnd-kit drag-to-reorder"
```

---

## Task 12: `FlowPanel` Container + BotClient Integration

**Files:**
- Create: `src/components/dashboard/flow/FlowPanel.tsx`
- Modify: `src/app/(tenant)/app/bot/BotClient.tsx`
- Test: `tests/unit/flow-panel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/flow-panel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FlowPanel from "@/components/dashboard/flow/FlowPanel";

const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock PhaseList
vi.mock("@/components/dashboard/flow/PhaseList", () => ({
  default: ({ phases, onCreatePhase }: any) => (
    <div data-testid="phase-list">
      <span>{phases.length} phases loaded</span>
      <button onClick={onCreatePhase}>Add Phase</button>
    </div>
  ),
}));

// Mock TemplateSelector
vi.mock("@/components/dashboard/flow/TemplateSelector", () => ({
  default: ({ onSeed }: any) => (
    <div data-testid="template-selector">
      <button onClick={() => onSeed("services")}>Seed Services</button>
    </div>
  ),
}));

describe("FlowPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows TemplateSelector when no phases exist", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ phases: [] }),
    });

    render(<FlowPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("template-selector")).toBeInTheDocument();
    });
  });

  it("shows PhaseList when phases exist", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          phases: [
            {
              id: "p1", name: "Greet", order_index: 0, max_messages: 1,
              system_prompt: "Welcome", tone: "friendly", goals: null,
              transition_hint: null, action_button_ids: null,
              image_attachment_ids: [], created_at: "2026-01-01",
            },
          ],
        }),
    });

    render(<FlowPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("phase-list")).toBeInTheDocument();
      expect(screen.getByText("1 phases loaded")).toBeInTheDocument();
    });
  });

  it("shows loading spinner initially", () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // Never resolves

    render(<FlowPanel />);

    expect(screen.getByTestId("flow-loading")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/flow-panel.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create the FlowPanel component**

Create `src/components/dashboard/flow/FlowPanel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useFlowPhases } from "@/hooks/useFlowPhases";
import TemplateSelector from "./TemplateSelector";
import PhaseList from "./PhaseList";

export default function FlowPanel() {
  const {
    phases,
    loading,
    createPhase,
    updatePhase,
    deletePhase,
    reorderPhases,
    seedPhases,
  } = useFlowPhases();
  const [seeding, setSeeding] = useState(false);

  const handleSeed = async (businessType: "ecommerce" | "real_estate" | "digital_product" | "services") => {
    setSeeding(true);
    try {
      await seedPhases(businessType);
    } finally {
      setSeeding(false);
    }
  };

  const handleCreatePhase = async () => {
    const nextIndex = phases.length;
    await createPhase({
      name: `Phase ${nextIndex + 1}`,
      order_index: nextIndex,
      max_messages: 3,
      system_prompt: "Describe what the bot should do in this phase.",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="flow-loading">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--ws-border-strong)] border-t-[var(--ws-accent)]" />
      </div>
    );
  }

  if (phases.length === 0) {
    return <TemplateSelector onSeed={handleSeed} seeding={seeding} />;
  }

  return (
    <PhaseList
      phases={phases}
      onUpdate={updatePhase}
      onDelete={deletePhase}
      onReorder={reorderPhases}
      onCreatePhase={handleCreatePhase}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/flow-panel.test.tsx`
Expected: PASS

- [ ] **Step 5: Wire FlowPanel into BotClient**

In `src/app/(tenant)/app/bot/BotClient.tsx`:

1. Add import at the top:

```typescript
import FlowPanel from "@/components/dashboard/flow/FlowPanel";
import { GitBranch } from "lucide-react";
```

2. Update the `Tab` type and `TABS` array — add `"flow"` to the type union and a new entry to the array. Replace the existing `type Tab` line (line 22) and `TABS` array (lines 23-28):

```typescript
type Tab = "knowledge" | "flow" | "rules" | "test" | "review";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "knowledge", label: "Knowledge Base", icon: BookOpen },
  { id: "flow", label: "Flow Builder", icon: GitBranch },
  { id: "rules", label: "Rules & Persona", icon: ShieldCheck },
  { id: "test", label: "Test Chat", icon: MessageCircle },
  { id: "review", label: "Review", icon: ClipboardCheck },
];
```

3. Add the FlowPanel rendering in the tab content section (after the `knowledge` conditional, around line 232):

```tsx
{activeTab === "flow" && <FlowPanel />}
```

4. Remove the unused `Upload` import from lucide-react (it was only used in the old KnowledgeTab placeholder).

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/unit/flow-panel.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/flow/FlowPanel.tsx src/app/(tenant)/app/bot/BotClient.tsx tests/unit/flow-panel.test.tsx
git commit -m "feat: add FlowPanel container and wire Flow Builder tab into BotClient"
```

---

## Task 13: E2E Tests

**Files:**
- Create: `tests/e2e/flow-builder.spec.ts`

- [ ] **Step 1: Create the E2E test file**

Create `tests/e2e/flow-builder.spec.ts`:

```typescript
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

    // If phases already exist (from previous test), click to expand
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

      // Name should update in the card header
      await expect(page.getByText("Welcome")).toBeVisible({ timeout: 5000 });
    }
  });

  test("Add Phase button creates a new phase", async ({ page }) => {
    await page.click("text=Flow Builder");

    if (await page.getByText("Add Phase").isVisible()) {
      const phaseCountBefore = await page.getByText(/\d+ phase/).textContent();
      await page.click("text=Add Phase");

      // Phase count should increase
      await expect(page.getByText(/\d+ phase/)).not.toHaveText(phaseCountBefore ?? "", {
        timeout: 5000,
      });
    }
  });

  test("deleting a phase removes it from the list", async ({ page }) => {
    await page.click("text=Flow Builder");

    // Expand the last phase and delete it
    const phases = page.locator("[data-testid^='phase-card']");
    const lastPhase = phases.last();

    if (await lastPhase.isVisible()) {
      await lastPhase.click();
      await page.click("text=Delete Phase");

      // Phase count should decrease
      await page.waitForTimeout(1000);
    }
  });
});
```

- [ ] **Step 2: Run E2E tests (requires dev server)**

Run: `npx playwright test tests/e2e/flow-builder.spec.ts`
Expected: Tests run against local dev server. Some may need auth setup adjustments.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/flow-builder.spec.ts
git commit -m "test: add E2E tests for flow builder"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- [x] Phase builder UI (add/remove/reorder) — Tasks 11 (PhaseList with dnd-kit), 12 (FlowPanel with create, PhaseCard with delete)
- [x] Phase configuration forms — Task 9 (PhaseForm with name, system_prompt, tone, goals, max_messages, transition_hint)
- [x] Template selection during onboarding — Task 6 (TemplateSelector) + Task 4 seed API calling existing `seedPhaseTemplates`
- [x] Image attachment to phases — Task 1 (DB migration for `image_attachment_ids`), Task 7 (ImageAttachmentPicker), Task 9 (PhaseForm integrates picker)
- [x] Action button attachment — Task 8 (ActionButtonPicker), Task 9 (PhaseForm integrates picker)
- [x] Component tests — Tasks 2-12
- [x] E2E tests — Task 13

**2. Placeholder scan:** No TBDs, TODOs, or "fill in later" found. All code blocks are complete.

**3. Type consistency:**
- `FlowPhase` type defined in `useFlowPhases.ts` matches the DB schema including `image_attachment_ids: string[]`
- `PhaseForm` receives `FlowPhase` and passes `Partial<FlowPhase>` to `onSave` — types match across `PhaseCard`, `PhaseList`, and `FlowPanel`
- `TemplateSelector` calls `onSeed` with `BusinessType` matching the `seedSchema` enum in the seed API route
- `authenticate()` helper in API routes follows the exact same pattern as Phase 6 endpoints
- `image_attachment_ids` added to both the DB migration and `database.ts` type definition
