# AI Builder + Campaign Funnel Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current "campaign phases with min-message gates" model with a "campaign as ordered 1–3 funnels" model, and rebuild the AI Builder around it. After this lands, a tenant can use the AI Builder to create a 1–3 funnel campaign tied to existing action pages, with template-driven chat rules per funnel, persisted to the new `campaign_funnels` table.

**Architecture:**
- New `campaign_funnels` table replaces reads from `campaign_phases`.
- Page-type templates produce default chat rules per funnel.
- AI Builder is a hybrid wizard+chat: kickoff chat → funnel-structure wizard → per-funnel template review → save.
- Conversation engine (spec 3) is **not** rebuilt here; the existing engine continues to read `campaign_phases` until spec 3 lands. Campaigns created by the new builder coexist with old ones; the new builder writes funnels but no phases, so old engine simply won't find phases for new campaigns. That is acceptable for v1 — the user understands the conversation engine swap is a follow-up.

**Tech Stack:** Next.js (App Router), Supabase (Postgres + RLS), Zod, React, TypeScript, Vitest.

**Specs covered:**
- `docs/superpowers/specs/2026-04-26-ai-campaign-builder-funnel-redesign.md`
- `docs/superpowers/specs/2026-04-26-campaign-funnel-data-model.md`

**Out of scope:** conversation engine rewrite (spec 3), action page editor changes, lead progression between funnels, dropping `campaign_phases` table.

---

## Task 1: `campaign_funnels` migration

**Files:**
- Create: `supabase/migrations/0021_campaign_funnels.sql`
- Test: `tests/unit/campaign-funnels-migration.test.ts`

- [ ] **Step 1: Write the migration test**

```ts
// tests/unit/campaign-funnels-migration.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("0021_campaign_funnels migration", () => {
  const sql = readFileSync(
    path.join(process.cwd(), "supabase/migrations/0021_campaign_funnels.sql"),
    "utf-8"
  );

  it("creates campaign_funnels table", () => {
    expect(sql).toMatch(/create table campaign_funnels/i);
  });
  it("references action_pages with on delete restrict", () => {
    expect(sql).toMatch(/references action_pages\(id\) on delete restrict/i);
  });
  it("declares unique (campaign_id, position)", () => {
    expect(sql).toMatch(/unique \(campaign_id, position\)/i);
  });
  it("enables RLS with tenant scoping", () => {
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/current_tenant_id\(\)/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/campaign-funnels-migration.test.ts`
Expected: FAIL — migration file does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0021_campaign_funnels.sql
create table campaign_funnels (
  id               uuid primary key default uuid_generate_v4(),
  campaign_id      uuid not null references campaigns(id) on delete cascade,
  tenant_id        uuid not null references tenants(id) on delete cascade,
  position         integer not null,
  action_page_id   uuid not null references action_pages(id) on delete restrict,
  page_description text,
  chat_rules       text[] not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (campaign_id, position)
);

create index on campaign_funnels (campaign_id);
create index on campaign_funnels (tenant_id);

alter table campaign_funnels enable row level security;
create policy "campaign_funnels_all" on campaign_funnels for all
  using (tenant_id = current_tenant_id());
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/campaign-funnels-migration.test.ts`
Expected: PASS.

- [ ] **Step 5: Apply migration locally and regenerate types**

Run: `npx supabase migration up && npm run db:types`
(If `db:types` script is absent, regenerate via the Supabase MCP tool or `supabase gen types typescript --local > src/types/database.ts`.)
Expected: `src/types/database.ts` now includes a `campaign_funnels` row type.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0021_campaign_funnels.sql tests/unit/campaign-funnels-migration.test.ts src/types/database.ts
git commit -m "feat(db): add campaign_funnels table"
```

---

## Task 2: Domain type + funnel repository

**Files:**
- Create: `src/types/campaign-funnel.ts`
- Create: `src/lib/db/campaign-funnels.ts`
- Test: `tests/unit/campaign-funnels-repo.test.ts`

- [ ] **Step 1: Write the repository test**

```ts
// tests/unit/campaign-funnels-repo.test.ts
import { describe, it, expect, vi } from "vitest";
import { listFunnelsForCampaign, saveFunnelsForCampaign } from "@/lib/db/campaign-funnels";

function fakeService(rows: any[] = []) {
  const order = vi.fn().mockReturnThis();
  const eq = vi.fn().mockReturnThis();
  const select = vi.fn().mockReturnThis();
  const from = vi.fn().mockReturnThis();
  const insert = vi.fn().mockResolvedValue({ data: rows, error: null });
  const del = vi.fn().mockResolvedValue({ error: null });
  return {
    from: vi.fn(() => ({ select, eq, order, insert, delete: del })),
    _last: { select, eq, order, insert, delete: del },
  } as any;
}

describe("listFunnelsForCampaign", () => {
  it("orders results by position ascending", async () => {
    const svc = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [
            { id: "a", position: 0, campaign_id: "c", tenant_id: "t", action_page_id: "p", page_description: null, chat_rules: ["r"], created_at: "now", updated_at: "now" },
          ],
          error: null,
        }),
      })),
    } as any;
    const result = await listFunnelsForCampaign(svc, "c");
    expect(result[0].position).toBe(0);
  });
});

describe("saveFunnelsForCampaign", () => {
  it("rejects more than 3 funnels", async () => {
    const svc = {} as any;
    await expect(
      saveFunnelsForCampaign(svc, "t", "c", [
        { actionPageId: "p1", chatRules: ["r"], pageDescription: null },
        { actionPageId: "p2", chatRules: ["r"], pageDescription: null },
        { actionPageId: "p3", chatRules: ["r"], pageDescription: null },
        { actionPageId: "p4", chatRules: ["r"], pageDescription: null },
      ])
    ).rejects.toThrow(/at most 3 funnels/i);
  });

  it("rejects empty funnel list", async () => {
    const svc = {} as any;
    await expect(saveFunnelsForCampaign(svc, "t", "c", [])).rejects.toThrow(/at least 1 funnel/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/campaign-funnels-repo.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the domain type**

```ts
// src/types/campaign-funnel.ts
export interface CampaignFunnel {
  id: string;
  campaignId: string;
  tenantId: string;
  position: number;
  actionPageId: string;
  pageDescription: string | null;
  chatRules: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CampaignFunnelInput {
  actionPageId: string;
  pageDescription: string | null;
  chatRules: string[];
}
```

- [ ] **Step 4: Write the repository**

```ts
// src/lib/db/campaign-funnels.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { CampaignFunnel, CampaignFunnelInput } from "@/types/campaign-funnel";

type ServiceClient = SupabaseClient<Database>;

function toDomain(row: any): CampaignFunnel {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    tenantId: row.tenant_id,
    position: row.position,
    actionPageId: row.action_page_id,
    pageDescription: row.page_description,
    chatRules: row.chat_rules ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listFunnelsForCampaign(
  service: ServiceClient,
  campaignId: string
): Promise<CampaignFunnel[]> {
  const { data, error } = await service
    .from("campaign_funnels")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("position", { ascending: true });

  if (error) throw new Error(`Failed to load funnels: ${error.message}`);
  return (data ?? []).map(toDomain);
}

export async function saveFunnelsForCampaign(
  service: ServiceClient,
  tenantId: string,
  campaignId: string,
  funnels: CampaignFunnelInput[]
): Promise<CampaignFunnel[]> {
  if (funnels.length < 1) throw new Error("Campaign needs at least 1 funnel");
  if (funnels.length > 3) throw new Error("Campaign can have at most 3 funnels");

  const { error: deleteError } = await service
    .from("campaign_funnels")
    .delete()
    .eq("campaign_id", campaignId);
  if (deleteError) throw new Error(`Failed to clear funnels: ${deleteError.message}`);

  const rows = funnels.map((f, i) => ({
    campaign_id: campaignId,
    tenant_id: tenantId,
    position: i,
    action_page_id: f.actionPageId,
    page_description: f.pageDescription,
    chat_rules: f.chatRules,
  }));

  const { data, error } = await service.from("campaign_funnels").insert(rows).select("*");
  if (error) throw new Error(`Failed to save funnels: ${error.message}`);
  return (data ?? []).map(toDomain);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/campaign-funnels-repo.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/campaign-funnel.ts src/lib/db/campaign-funnels.ts tests/unit/campaign-funnels-repo.test.ts
git commit -m "feat(db): campaign funnels repository with validation"
```

---

## Task 3: Page-type chat rule templates

**Files:**
- Create: `src/lib/ai/funnel-templates.ts`
- Test: `tests/unit/funnel-templates.test.ts`

- [ ] **Step 1: Write the template test**

```ts
// tests/unit/funnel-templates.test.ts
import { describe, it, expect } from "vitest";
import { defaultRulesForPageType, ACTION_PAGE_TYPES } from "@/lib/ai/funnel-templates";

describe("defaultRulesForPageType", () => {
  it.each(ACTION_PAGE_TYPES)("returns at least one rule for %s", (type) => {
    const rules = defaultRulesForPageType(type);
    expect(rules.length).toBeGreaterThan(0);
    rules.forEach((r) => expect(r).toMatch(/\S/));
  });

  it("sales rules push the page within a few turns", () => {
    const rules = defaultRulesForPageType("sales").join(" ").toLowerCase();
    expect(rules).toMatch(/send|open|click|page/);
  });

  it("form rules emphasize value and education", () => {
    const rules = defaultRulesForPageType("form").join(" ").toLowerCase();
    expect(rules).toMatch(/value|benefit|why/);
  });

  it("throws on unknown page type", () => {
    // @ts-expect-error — testing runtime guard
    expect(() => defaultRulesForPageType("nope")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/funnel-templates.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement templates**

```ts
// src/lib/ai/funnel-templates.ts
export const ACTION_PAGE_TYPES = [
  "sales",
  "form",
  "qualification",
  "calendar",
  "product_catalog",
  "checkout",
] as const;

export type ActionPageType = (typeof ACTION_PAGE_TYPES)[number];

const TEMPLATES: Record<ActionPageType, string[]> = {
  sales: [
    "Lightly reinforce the lead's interest — one sentence acknowledging their goal.",
    "Mention the most relevant benefit, not features.",
    "Pre-handle one common objection if it surfaces (price, time, fit).",
    "Send the sales page within 2-3 turns. Don't keep selling in chat once interest is shown.",
    "After sending, stop pitching. Offer to answer one specific question only.",
  ],
  form: [
    "Lead with the value the lead gets for filling the form (lead magnet, free guide, etc.).",
    "Explain why the form is short and what happens after they submit.",
    "Educate before asking — share one concrete insight related to their problem.",
    "Use social proof if available (specific numbers or names beat generic claims).",
    "Send the form once they show any signal of interest. Don't drag the chat past 5 turns.",
  ],
  qualification: [
    "Briefly acknowledge what brought them to the chat in one line.",
    "Tell them you'll ask 1-2 quick questions to make sure it's a fit before continuing.",
    "Send the qualification page after the lead's first answer; let the page collect the rest.",
    "Frame qualifying as helping them, not gating them.",
  ],
  calendar: [
    "Confirm the meeting is the right next step in one sentence.",
    "Say what the meeting will deliver — concrete outcome, not a vague chat.",
    "Offer to answer one logistical question (length, format), then send the booking page.",
    "If the lead asks for more info, send the page anyway and offer to follow up after they pick a time.",
  ],
  product_catalog: [
    "Ask which product or category they're interested in if not already obvious.",
    "Reflect their answer back in one line so they feel heard.",
    "Send the catalog filtered to their interest. Don't list products in chat.",
    "Offer to compare two products only if they're stuck choosing.",
  ],
  checkout: [
    "Treat as a closing step — assume the decision is mostly made.",
    "Address one objection if raised (security, timing, refund).",
    "Send the checkout page promptly. Don't re-pitch the offer.",
  ],
};

export function defaultRulesForPageType(type: ActionPageType): string[] {
  if (!TEMPLATES[type]) {
    throw new Error(`Unknown action page type: ${type}`);
  }
  return [...TEMPLATES[type]];
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/funnel-templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/funnel-templates.ts tests/unit/funnel-templates.test.ts
git commit -m "feat(ai): page-type chat rule templates"
```

---

## Task 4: Goal derivation helper

**Files:**
- Create: `src/lib/ai/funnel-goal.ts`
- Test: `tests/unit/funnel-goal.test.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/unit/funnel-goal.test.ts
import { describe, it, expect } from "vitest";
import { deriveCampaignGoal } from "@/lib/ai/funnel-goal";

describe("deriveCampaignGoal", () => {
  it.each([
    ["sales", "purchase"],
    ["checkout", "purchase"],
    ["product_catalog", "purchase"],
    ["form", "form_submit"],
    ["qualification", "form_submit"],
    ["calendar", "appointment_booked"],
  ] as const)("maps %s last funnel to %s", (lastType, goal) => {
    expect(deriveCampaignGoal(lastType)).toBe(goal);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/funnel-goal.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/ai/funnel-goal.ts
import type { ActionPageType } from "@/lib/ai/funnel-templates";

export type CampaignGoal = "form_submit" | "appointment_booked" | "purchase" | "stage_reached";

export function deriveCampaignGoal(lastFunnelPageType: ActionPageType): CampaignGoal {
  switch (lastFunnelPageType) {
    case "sales":
    case "checkout":
    case "product_catalog":
      return "purchase";
    case "form":
    case "qualification":
      return "form_submit";
    case "calendar":
      return "appointment_booked";
  }
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest run tests/unit/funnel-goal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/funnel-goal.ts tests/unit/funnel-goal.test.ts
git commit -m "feat(ai): derive campaign goal from last funnel page type"
```

---

## Task 5: Funnel structure proposer (LLM)

**Purpose:** The kickoff chat answer + the tenant's available action pages → an AI-proposed ordered list of action page IDs (1–3) the tenant can edit.

**Files:**
- Create: `src/lib/ai/funnel-builder.ts`
- Test: `tests/unit/funnel-builder.test.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/unit/funnel-builder.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/llm-client", () => ({
  generateResponse: vi.fn(),
}));
import { generateResponse } from "@/lib/ai/llm-client";
import { proposeFunnelStructure } from "@/lib/ai/funnel-builder";

const pages = [
  { id: "p-sales", type: "sales", title: "Coaching Sales" },
  { id: "p-qual", type: "qualification", title: "Coaching Qualification" },
  { id: "p-call", type: "calendar", title: "Discovery Call" },
];

beforeEach(() => vi.mocked(generateResponse).mockReset());

describe("proposeFunnelStructure", () => {
  it("returns ordered action page IDs", async () => {
    vi.mocked(generateResponse).mockResolvedValue({
      content: JSON.stringify({
        action: "propose",
        funnels: [{ action_page_id: "p-qual" }, { action_page_id: "p-call" }],
        top_level_rules: ["Be concise."],
      }),
    } as any);

    const result = await proposeFunnelStructure({
      kickoff: "Sell coaching to people who qualify",
      availablePages: pages,
    });

    expect(result.action).toBe("propose");
    if (result.action === "propose") {
      expect(result.funnels.map((f) => f.actionPageId)).toEqual(["p-qual", "p-call"]);
      expect(result.topLevelRules).toContain("Be concise.");
    }
  });

  it("can ask a clarifying question", async () => {
    vi.mocked(generateResponse).mockResolvedValue({
      content: JSON.stringify({ action: "question", question: "What's the offer?" }),
    } as any);
    const result = await proposeFunnelStructure({ kickoff: "uhh", availablePages: pages });
    expect(result.action).toBe("question");
  });

  it("rejects proposals referencing unknown page IDs", async () => {
    vi.mocked(generateResponse).mockResolvedValue({
      content: JSON.stringify({
        action: "propose",
        funnels: [{ action_page_id: "p-nope" }],
        top_level_rules: [],
      }),
    } as any);
    await expect(
      proposeFunnelStructure({ kickoff: "x", availablePages: pages })
    ).rejects.toThrow(/unknown action page/i);
  });

  it("rejects proposals with more than 3 funnels", async () => {
    vi.mocked(generateResponse).mockResolvedValue({
      content: JSON.stringify({
        action: "propose",
        funnels: [
          { action_page_id: "p-sales" },
          { action_page_id: "p-qual" },
          { action_page_id: "p-call" },
          { action_page_id: "p-sales" },
        ],
        top_level_rules: [],
      }),
    } as any);
    await expect(
      proposeFunnelStructure({ kickoff: "x", availablePages: pages })
    ).rejects.toThrow(/at most 3/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/funnel-builder.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the proposer**

```ts
// src/lib/ai/funnel-builder.ts
import { z } from "zod";
import { generateResponse } from "@/lib/ai/llm-client";
import type { ActionPageType } from "@/lib/ai/funnel-templates";

export interface AvailablePage {
  id: string;
  type: ActionPageType;
  title: string;
}

export type FunnelProposal =
  | { action: "question"; question: string }
  | {
      action: "propose";
      funnels: Array<{ actionPageId: string }>;
      topLevelRules: string[];
    };

const responseSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("question"), question: z.string().min(1).max(500) }),
  z.object({
    action: z.literal("propose"),
    funnels: z
      .array(z.object({ action_page_id: z.string().uuid().or(z.string().min(1)) }))
      .min(1)
      .max(3),
    top_level_rules: z.array(z.string().min(1).max(300)).max(8).default([]),
  }),
]);

function systemPrompt(pages: AvailablePage[]): string {
  const pageList = pages
    .map((p) => `- ${p.id} :: type=${p.type} :: title="${p.title}"`)
    .join("\n");
  return [
    "You design 1-3 step DM funnels for a Messenger sales bot.",
    "Given a tenant's intent and a list of their existing action pages, propose an ordered funnel of 1-3 pages (the LAST funnel is the conversion step).",
    "If the intent is too vague, ask ONE clarifying question first. Never ask more than one before proposing.",
    "Use ONLY action_page_ids that appear in the list below. Do not invent IDs.",
    "",
    "Available action pages:",
    pageList,
    "",
    'Respond with strict JSON. One of:',
    '{ "action": "question", "question": "..." }',
    '{ "action": "propose", "funnels": [{"action_page_id":"..."}, ...], "top_level_rules": ["..."] }',
  ].join("\n");
}

export async function proposeFunnelStructure(input: {
  kickoff: string;
  availablePages: AvailablePage[];
}): Promise<FunnelProposal> {
  if (input.availablePages.length === 0) {
    throw new Error("No action pages available. Build one first.");
  }

  const response = await generateResponse(systemPrompt(input.availablePages), input.kickoff, {
    responseFormat: "json_object",
    temperature: 0.4,
    maxTokens: 800,
  });

  const parsed = responseSchema.parse(JSON.parse(response.content));

  if (parsed.action === "question") {
    return { action: "question", question: parsed.question };
  }

  if (parsed.funnels.length > 3) {
    throw new Error("Proposal contains at most 3 funnels");
  }
  const knownIds = new Set(input.availablePages.map((p) => p.id));
  for (const f of parsed.funnels) {
    if (!knownIds.has(f.action_page_id)) {
      throw new Error(`Unknown action page id: ${f.action_page_id}`);
    }
  }

  return {
    action: "propose",
    funnels: parsed.funnels.map((f) => ({ actionPageId: f.action_page_id })),
    topLevelRules: parsed.top_level_rules,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/funnel-builder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/funnel-builder.ts tests/unit/funnel-builder.test.ts
git commit -m "feat(ai): funnel structure proposer"
```

---

## Task 6: Builder API — propose endpoint

**Replaces:** `src/app/api/campaigns/ai-builder/plan/route.ts` (kept for now; new route lives alongside).

**Files:**
- Create: `src/app/api/campaigns/ai-builder/propose/route.ts`
- Test: `tests/unit/ai-builder-propose-api.test.ts`

- [ ] **Step 1: Write the API test**

```ts
// tests/unit/ai-builder-propose-api.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/ai/funnel-builder", () => ({
  proposeFunnelStructure: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({
  requireTenantSession: vi.fn().mockResolvedValue({ tenantId: "t1" }),
}));
vi.mock("@/lib/db/service-client", () => ({
  getServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [{ id: "p-sales", type: "sales", title: "Sales", published: true }],
        error: null,
      }),
    })),
  })),
}));

import { POST } from "@/app/api/campaigns/ai-builder/propose/route";
import { proposeFunnelStructure } from "@/lib/ai/funnel-builder";

describe("POST /api/campaigns/ai-builder/propose", () => {
  it("returns the proposal", async () => {
    vi.mocked(proposeFunnelStructure).mockResolvedValue({
      action: "propose",
      funnels: [{ actionPageId: "p-sales" }],
      topLevelRules: [],
    });

    const req = new Request("http://x/api/campaigns/ai-builder/propose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kickoff: "sell my course" }),
    });
    const res = await POST(req as any);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.action).toBe("propose");
    expect(body.funnels).toHaveLength(1);
  });

  it("400s when kickoff is empty", async () => {
    const req = new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kickoff: "" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ai-builder-propose-api.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/campaigns/ai-builder/propose/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/session";
import { getServiceClient } from "@/lib/db/service-client";
import { proposeFunnelStructure, type AvailablePage } from "@/lib/ai/funnel-builder";

const bodySchema = z.object({ kickoff: z.string().min(1).max(2000) });

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const session = await requireTenantSession();
  const service = getServiceClient();

  const { data, error } = await service
    .from("action_pages")
    .select("id, type, title, published")
    .eq("tenant_id", session.tenantId)
    .eq("published", true)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const pages: AvailablePage[] = (data ?? []).map((p) => ({
    id: p.id,
    type: p.type as AvailablePage["type"],
    title: p.title,
  }));

  if (pages.length === 0) {
    return NextResponse.json(
      { error: "No published action pages — build one first." },
      { status: 409 }
    );
  }

  try {
    const result = await proposeFunnelStructure({ kickoff: parsed.kickoff, availablePages: pages });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/ai-builder-propose-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/campaigns/ai-builder/propose/route.ts tests/unit/ai-builder-propose-api.test.ts
git commit -m "feat(api): AI builder propose endpoint"
```

---

## Task 7: Builder API — save endpoint

**Files:**
- Create: `src/app/api/campaigns/ai-builder/save/route.ts`
- Test: `tests/unit/ai-builder-save-api.test.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/unit/ai-builder-save-api.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireTenantSession: vi.fn().mockResolvedValue({ tenantId: "t1" }),
}));
const insertCampaign = vi.fn().mockResolvedValue({
  data: { id: "camp-1" },
  error: null,
});
const lookupPages = vi.fn().mockResolvedValue({
  data: [
    { id: "p-sales", type: "sales", tenant_id: "t1" },
  ],
  error: null,
});
vi.mock("@/lib/db/service-client", () => ({
  getServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "campaigns") {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: insertCampaign,
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue(lookupPages.mock.results[0]?.value ?? lookupPages()),
      };
    }),
  })),
}));
vi.mock("@/lib/db/campaign-funnels", () => ({
  saveFunnelsForCampaign: vi.fn().mockResolvedValue([]),
}));

import { POST } from "@/app/api/campaigns/ai-builder/save/route";
import { saveFunnelsForCampaign } from "@/lib/db/campaign-funnels";

describe("POST /api/campaigns/ai-builder/save", () => {
  it("creates campaign + funnels with derived goal", async () => {
    const req = new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Coaching",
        description: "Sell coaching",
        topLevelRules: ["Friendly tone"],
        funnels: [
          { actionPageId: "p-sales", pageDescription: null, chatRules: ["Push to page"] },
        ],
      }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(saveFunnelsForCampaign).toHaveBeenCalled();
  });

  it("400s with > 3 funnels", async () => {
    const req = new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "x",
        description: "x",
        topLevelRules: [],
        funnels: Array(4).fill({ actionPageId: "p-sales", pageDescription: null, chatRules: ["r"] }),
      }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ai-builder-save-api.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/campaigns/ai-builder/save/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/session";
import { getServiceClient } from "@/lib/db/service-client";
import { saveFunnelsForCampaign } from "@/lib/db/campaign-funnels";
import { deriveCampaignGoal } from "@/lib/ai/funnel-goal";
import { ACTION_PAGE_TYPES, type ActionPageType } from "@/lib/ai/funnel-templates";

const funnelSchema = z.object({
  actionPageId: z.string().min(1),
  pageDescription: z.string().max(2000).nullable(),
  chatRules: z.array(z.string().min(1).max(500)).min(1).max(20),
});

const bodySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  topLevelRules: z.array(z.string().min(1).max(300)).max(10).default([]),
  funnels: z.array(funnelSchema).min(1).max(3),
});

export async function POST(req: Request) {
  let body;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const session = await requireTenantSession();
  const service = getServiceClient();

  const pageIds = body.funnels.map((f) => f.actionPageId);
  const { data: pages, error: pagesError } = await service
    .from("action_pages")
    .select("id, type, tenant_id")
    .in("id", pageIds)
    .eq("tenant_id", session.tenantId);

  if (pagesError) return NextResponse.json({ error: pagesError.message }, { status: 500 });
  if ((pages ?? []).length !== pageIds.length) {
    return NextResponse.json({ error: "One or more action pages not found" }, { status: 400 });
  }

  const lastPage = pages!.find((p) => p.id === body.funnels.at(-1)!.actionPageId);
  if (!lastPage) {
    return NextResponse.json({ error: "Last funnel page missing" }, { status: 400 });
  }
  if (!ACTION_PAGE_TYPES.includes(lastPage.type as ActionPageType)) {
    return NextResponse.json({ error: `Unsupported page type: ${lastPage.type}` }, { status: 400 });
  }

  const goal = deriveCampaignGoal(lastPage.type as ActionPageType);

  const { data: campaign, error: campaignError } = await service
    .from("campaigns")
    .insert({
      tenant_id: session.tenantId,
      name: body.name,
      description: body.description,
      goal,
      campaign_rules: body.topLevelRules,
      status: "draft",
    })
    .select("id")
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: campaignError?.message ?? "Failed to create campaign" }, { status: 500 });
  }

  try {
    await saveFunnelsForCampaign(service, session.tenantId, campaign.id, body.funnels);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save funnels";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ campaignId: campaign.id });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/ai-builder-save-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/campaigns/ai-builder/save/route.ts tests/unit/ai-builder-save-api.test.ts
git commit -m "feat(api): AI builder save endpoint creates campaign + funnels"
```

---

## Task 8: Frontend — empty state guard

**Files:**
- Modify: `src/app/(tenant)/app/campaigns/ai-builder/page.tsx`
- Test: `tests/unit/ai-builder-empty-state.test.tsx`

- [ ] **Step 1: Inspect current page**

Run: `cat "src/app/(tenant)/app/campaigns/ai-builder/page.tsx"` to confirm it's a server component that loads tenant context. Note where it renders `<AiCampaignBuilderClient />`.

- [ ] **Step 2: Write the empty-state test**

```tsx
// tests/unit/ai-builder-empty-state.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AiBuilderEmptyState } from "@/components/dashboard/campaigns/AiBuilderEmptyState";

describe("AiBuilderEmptyState", () => {
  it("shows a CTA to build an action page", () => {
    render(<AiBuilderEmptyState />);
    expect(screen.getByText(/build your first action page/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /action pages/i })).toHaveAttribute(
      "href",
      "/app/action-pages"
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/ai-builder-empty-state.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Implement the empty-state component**

```tsx
// src/components/dashboard/campaigns/AiBuilderEmptyState.tsx
import Link from "next/link";

export function AiBuilderEmptyState() {
  return (
    <div className="rounded-lg border p-8 text-center">
      <h2 className="text-lg font-semibold">Build your first action page</h2>
      <p className="text-sm text-muted-foreground mt-2">
        Funnels need a destination. Create at least one published action page, then come back.
      </p>
      <Link
        href="/app/action-pages"
        className="mt-4 inline-block rounded bg-primary px-4 py-2 text-primary-foreground"
      >
        Go to action pages
      </Link>
    </div>
  );
}
```

- [ ] **Step 5: Wire it into the page**

Modify `src/app/(tenant)/app/campaigns/ai-builder/page.tsx` to load published action pages alongside tenant context, and render `<AiBuilderEmptyState />` when the count is 0.

```tsx
// add near the top of page.tsx (server component)
const { data: pages } = await service
  .from("action_pages")
  .select("id")
  .eq("tenant_id", session.tenantId)
  .eq("published", true);

if (!pages || pages.length === 0) {
  return <AiBuilderEmptyState />;
}
```

(Adapt the surrounding code to match the existing file's structure; keep the existing client render path for the non-empty case.)

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/unit/ai-builder-empty-state.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/campaigns/AiBuilderEmptyState.tsx "src/app/(tenant)/app/campaigns/ai-builder/page.tsx" tests/unit/ai-builder-empty-state.test.tsx
git commit -m "feat(ui): AI builder empty state when tenant has no action pages"
```

---

## Task 9: Frontend — funnel builder client (rewrite)

This task replaces the existing `AiCampaignBuilderClient.tsx` with a new component that drives the four UX steps: kickoff chat → structure wizard → per-funnel review → review & save.

**Files:**
- Create: `src/components/dashboard/campaigns/FunnelBuilderClient.tsx`
- Create: `src/components/dashboard/campaigns/FunnelStructureWizard.tsx`
- Create: `src/components/dashboard/campaigns/FunnelRulesPanel.tsx`
- Create: `src/components/dashboard/campaigns/FunnelReviewPanel.tsx`
- Modify: `src/app/(tenant)/app/campaigns/ai-builder/page.tsx` (render `<FunnelBuilderClient>` instead of `<AiCampaignBuilderClient>`)
- Test: `tests/unit/funnel-builder-client.test.tsx`

- [ ] **Step 1: Write the integration test for the client**

```tsx
// tests/unit/funnel-builder-client.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FunnelBuilderClient } from "@/components/dashboard/campaigns/FunnelBuilderClient";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

const pages = [
  { id: "p-sales", type: "sales", title: "Sales Page" },
  { id: "p-qual", type: "qualification", title: "Qualification" },
];

describe("FunnelBuilderClient", () => {
  it("kickoff -> proposal -> review -> save", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          action: "propose",
          funnels: [{ actionPageId: "p-qual" }, { actionPageId: "p-sales" }],
          topLevelRules: ["Be friendly"],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ campaignId: "c-1" }) });

    render(<FunnelBuilderClient availablePages={pages} />);

    fireEvent.change(screen.getByPlaceholderText(/what are you trying to do/i), {
      target: { value: "Sell coaching to qualified leads" },
    });
    fireEvent.click(screen.getByRole("button", { name: /propose funnel/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /next: chat rules/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /next: chat rules/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /next: review/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /next: review/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /save campaign/i })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /save campaign/i }));
    await waitFor(() => expect(screen.getByText(/campaign saved/i)).toBeInTheDocument());
  });

  it("renders a question if the proposer asks one", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ action: "question", question: "What's the offer?" }),
    });

    render(<FunnelBuilderClient availablePages={pages} />);
    fireEvent.change(screen.getByPlaceholderText(/what are you trying to do/i), {
      target: { value: "uhh" },
    });
    fireEvent.click(screen.getByRole("button", { name: /propose funnel/i }));

    await waitFor(() =>
      expect(screen.getByText(/what's the offer\?/i)).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/funnel-builder-client.test.tsx`
Expected: FAIL — components don't exist yet.

- [ ] **Step 3: Implement `FunnelStructureWizard`**

Component contract:
- **Props:** `availablePages: AvailablePage[]`, `funnels: Array<{ actionPageId: string }>`, `onChange(funnels)`.
- Renders an ordered list of slots (max 3). Each slot has a `<select>` of `availablePages`. Add/remove/reorder buttons. Validates that no slot is empty.

```tsx
// src/components/dashboard/campaigns/FunnelStructureWizard.tsx
"use client";
import type { AvailablePage } from "@/lib/ai/funnel-builder";

interface Props {
  availablePages: AvailablePage[];
  funnels: Array<{ actionPageId: string }>;
  onChange: (funnels: Array<{ actionPageId: string }>) => void;
}

export function FunnelStructureWizard({ availablePages, funnels, onChange }: Props) {
  const update = (i: number, actionPageId: string) => {
    const next = [...funnels];
    next[i] = { actionPageId };
    onChange(next);
  };
  const add = () =>
    funnels.length < 3 && onChange([...funnels, { actionPageId: availablePages[0].id }]);
  const remove = (i: number) =>
    funnels.length > 1 && onChange(funnels.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= funnels.length) return;
    const next = [...funnels];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <ol className="space-y-2">
      {funnels.map((f, i) => (
        <li key={i} className="flex items-center gap-2">
          <span className="font-mono">{i + 1}.</span>
          <select
            className="rounded border p-1"
            value={f.actionPageId}
            onChange={(e) => update(i, e.target.value)}
          >
            {availablePages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.type})
              </option>
            ))}
          </select>
          <button onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
          <button onClick={() => move(i, 1)} disabled={i === funnels.length - 1}>↓</button>
          <button onClick={() => remove(i)} disabled={funnels.length <= 1}>Remove</button>
        </li>
      ))}
      {funnels.length < 3 && (
        <li>
          <button onClick={add}>+ Add funnel step</button>
        </li>
      )}
    </ol>
  );
}
```

- [ ] **Step 4: Implement `FunnelRulesPanel`**

Component contract:
- **Props:** `pageType: ActionPageType`, `pageTitle: string`, `description: string | null`, `rules: string[]`, `onChange({ description, rules })`.
- On mount (or when `pageType` changes), if `rules` is empty, seed with `defaultRulesForPageType(pageType)`.
- Renders a `<textarea>` for description and an editable list of rules (add / edit / remove).

```tsx
// src/components/dashboard/campaigns/FunnelRulesPanel.tsx
"use client";
import { useEffect } from "react";
import { defaultRulesForPageType, type ActionPageType } from "@/lib/ai/funnel-templates";

interface Props {
  pageType: ActionPageType;
  pageTitle: string;
  description: string | null;
  rules: string[];
  onChange: (next: { description: string | null; rules: string[] }) => void;
}

export function FunnelRulesPanel({ pageType, pageTitle, description, rules, onChange }: Props) {
  useEffect(() => {
    if (rules.length === 0) {
      onChange({ description, rules: defaultRulesForPageType(pageType) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageType]);

  return (
    <div className="space-y-3 rounded border p-3">
      <h3 className="font-semibold">{pageTitle} <span className="text-xs">({pageType})</span></h3>
      <label className="block text-sm">
        Page description (optional)
        <textarea
          className="mt-1 w-full rounded border p-1"
          value={description ?? ""}
          onChange={(e) => onChange({ description: e.target.value, rules })}
          placeholder="e.g. Sales page for our $497 coaching program"
        />
      </label>
      <div>
        <p className="text-sm font-medium">Chat rules for this funnel</p>
        <ul className="space-y-1 mt-1">
          {rules.map((r, i) => (
            <li key={i} className="flex gap-2">
              <input
                className="flex-1 rounded border p-1 text-sm"
                value={r}
                onChange={(e) => {
                  const next = [...rules];
                  next[i] = e.target.value;
                  onChange({ description, rules: next });
                }}
              />
              <button onClick={() => onChange({ description, rules: rules.filter((_, j) => j !== i) })}>×</button>
            </li>
          ))}
        </ul>
        <button
          className="mt-2 text-sm"
          onClick={() => onChange({ description, rules: [...rules, ""] })}
        >
          + Add rule
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement `FunnelReviewPanel`**

Component contract:
- **Props:** `name`, `description`, `topLevelRules`, `funnels` (full data), `availablePages`, `onChange*`, `onSave`.
- Renders editable name/description/top-level rules and a read-only summary of each funnel (page title + first rule). "Save campaign" calls `onSave`.

```tsx
// src/components/dashboard/campaigns/FunnelReviewPanel.tsx
"use client";
import type { AvailablePage } from "@/lib/ai/funnel-builder";

interface FunnelDraft {
  actionPageId: string;
  pageDescription: string | null;
  chatRules: string[];
}

interface Props {
  name: string;
  description: string;
  topLevelRules: string[];
  funnels: FunnelDraft[];
  availablePages: AvailablePage[];
  saving: boolean;
  onName: (s: string) => void;
  onDescription: (s: string) => void;
  onTopLevelRules: (rs: string[]) => void;
  onSave: () => void;
}

export function FunnelReviewPanel(props: Props) {
  return (
    <section className="space-y-3 rounded border p-3">
      <input
        className="w-full rounded border p-1"
        value={props.name}
        onChange={(e) => props.onName(e.target.value)}
        placeholder="Campaign name"
      />
      <textarea
        className="w-full rounded border p-1"
        value={props.description}
        onChange={(e) => props.onDescription(e.target.value)}
        placeholder="Campaign description"
      />
      <div>
        <p className="text-sm font-medium">Top-level rules</p>
        {props.topLevelRules.map((r, i) => (
          <input
            key={i}
            className="mt-1 w-full rounded border p-1 text-sm"
            value={r}
            onChange={(e) => {
              const next = [...props.topLevelRules];
              next[i] = e.target.value;
              props.onTopLevelRules(next);
            }}
          />
        ))}
        <button
          className="mt-1 text-sm"
          onClick={() => props.onTopLevelRules([...props.topLevelRules, ""])}
        >
          + Add rule
        </button>
      </div>
      <ol className="text-sm space-y-1">
        {props.funnels.map((f, i) => {
          const page = props.availablePages.find((p) => p.id === f.actionPageId);
          return (
            <li key={i}>
              {i + 1}. {page?.title ?? "(missing)"} — {f.chatRules[0] ?? "(no rules)"}
            </li>
          );
        })}
      </ol>
      <button
        className="rounded bg-primary px-4 py-2 text-primary-foreground"
        onClick={props.onSave}
        disabled={props.saving}
      >
        {props.saving ? "Saving..." : "Save campaign"}
      </button>
    </section>
  );
}
```

- [ ] **Step 6: Implement `FunnelBuilderClient`**

```tsx
// src/components/dashboard/campaigns/FunnelBuilderClient.tsx
"use client";
import { useState } from "react";
import type { AvailablePage } from "@/lib/ai/funnel-builder";
import type { ActionPageType } from "@/lib/ai/funnel-templates";
import { FunnelStructureWizard } from "./FunnelStructureWizard";
import { FunnelRulesPanel } from "./FunnelRulesPanel";
import { FunnelReviewPanel } from "./FunnelReviewPanel";

interface FunnelDraft {
  actionPageId: string;
  pageDescription: string | null;
  chatRules: string[];
}

type Step = "kickoff" | "structure" | "rules" | "review" | "saved";

export function FunnelBuilderClient({ availablePages }: { availablePages: AvailablePage[] }) {
  const [step, setStep] = useState<Step>("kickoff");
  const [kickoff, setKickoff] = useState("");
  const [question, setQuestion] = useState<string | null>(null);
  const [funnels, setFunnels] = useState<FunnelDraft[]>([]);
  const [topLevelRules, setTopLevelRules] = useState<string[]>([]);
  const [name, setName] = useState("New campaign");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const propose = async () => {
    setError(null);
    const res = await fetch("/api/campaigns/ai-builder/propose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kickoff }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Proposal failed");
      return;
    }
    const data = await res.json();
    if (data.action === "question") {
      setQuestion(data.question);
      return;
    }
    setQuestion(null);
    setTopLevelRules(data.topLevelRules ?? []);
    setFunnels(
      data.funnels.map((f: { actionPageId: string }) => ({
        actionPageId: f.actionPageId,
        pageDescription: null,
        chatRules: [],
      }))
    );
    setStep("structure");
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/campaigns/ai-builder/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, description, topLevelRules, funnels }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Save failed");
      return;
    }
    setStep("saved");
  };

  return (
    <div className="space-y-4">
      {step === "kickoff" && (
        <div className="space-y-2">
          <textarea
            className="w-full rounded border p-2"
            value={kickoff}
            onChange={(e) => setKickoff(e.target.value)}
            placeholder="What are you trying to do with this campaign?"
          />
          <button
            className="rounded bg-primary px-4 py-2 text-primary-foreground"
            onClick={propose}
            disabled={!kickoff.trim()}
          >
            Propose funnel
          </button>
          {question && <p className="text-sm">{question}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {step === "structure" && (
        <div className="space-y-3">
          <FunnelStructureWizard
            availablePages={availablePages}
            funnels={funnels.map((f) => ({ actionPageId: f.actionPageId }))}
            onChange={(next) =>
              setFunnels(
                next.map((n, i) => funnels[i] ?? {
                  actionPageId: n.actionPageId,
                  pageDescription: null,
                  chatRules: [],
                })
              )
            }
          />
          <button onClick={() => setStep("rules")}>Next: chat rules</button>
        </div>
      )}

      {step === "rules" && (
        <div className="space-y-3">
          {funnels.map((f, i) => {
            const page = availablePages.find((p) => p.id === f.actionPageId)!;
            return (
              <FunnelRulesPanel
                key={i}
                pageType={page.type as ActionPageType}
                pageTitle={page.title}
                description={f.pageDescription}
                rules={f.chatRules}
                onChange={({ description, rules }) => {
                  const next = [...funnels];
                  next[i] = { ...next[i], pageDescription: description, chatRules: rules };
                  setFunnels(next);
                }}
              />
            );
          })}
          <button onClick={() => setStep("review")}>Next: review</button>
        </div>
      )}

      {step === "review" && (
        <FunnelReviewPanel
          name={name}
          description={description}
          topLevelRules={topLevelRules}
          funnels={funnels}
          availablePages={availablePages}
          saving={saving}
          onName={setName}
          onDescription={setDescription}
          onTopLevelRules={setTopLevelRules}
          onSave={save}
        />
      )}

      {step === "saved" && <p>Campaign saved.</p>}
    </div>
  );
}
```

- [ ] **Step 7: Wire it into the page**

Modify `src/app/(tenant)/app/campaigns/ai-builder/page.tsx`:
- After loading the published `action_pages`, pass them as `availablePages={pages}` to `<FunnelBuilderClient />` instead of the legacy `<AiCampaignBuilderClient />`.
- Map DB rows to `AvailablePage`: `{ id, type, title }`.
- Keep `<AiBuilderEmptyState />` for the zero-pages branch from Task 8.

- [ ] **Step 8: Run all tests**

Run: `npx vitest run tests/unit/funnel-builder-client.test.tsx tests/unit/ai-builder-empty-state.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/dashboard/campaigns/FunnelBuilderClient.tsx src/components/dashboard/campaigns/FunnelStructureWizard.tsx src/components/dashboard/campaigns/FunnelRulesPanel.tsx src/components/dashboard/campaigns/FunnelReviewPanel.tsx "src/app/(tenant)/app/campaigns/ai-builder/page.tsx" tests/unit/funnel-builder-client.test.tsx
git commit -m "feat(ui): funnel builder client (kickoff/structure/rules/review)"
```

---

## Task 10: Remove legacy AI builder routes and client

After Task 9, the legacy plan/phases/phase-edit routes and `AiCampaignBuilderClient.tsx` are no longer referenced.

**Files:**
- Delete: `src/app/api/campaigns/ai-builder/plan/route.ts`
- Delete: `src/app/api/campaigns/ai-builder/phases/route.ts`
- Delete: `src/app/api/campaigns/ai-builder/phase-edit/route.ts`
- Delete: `src/components/dashboard/campaigns/AiCampaignBuilderClient.tsx`
- Delete: `src/components/dashboard/campaigns/AiBuilderChat.tsx` (if only referenced by the legacy client)
- Delete: `src/components/dashboard/campaigns/AiBuilderPreview.tsx` (same)
- Delete: `src/lib/ai/campaign-builder.ts`
- Delete: `src/lib/ai/campaign-builder-store.ts`
- Delete: `tests/unit/ai-campaign-builder-client.test.tsx`
- Delete: `tests/unit/campaign-builder.test.ts`
- Delete: `tests/unit/campaign-builder-store.test.ts`
- Delete: `tests/unit/campaign-builder-v2-api.test.ts`

- [ ] **Step 1: Confirm no remaining references**

Run: `grep -r "AiCampaignBuilderClient\|campaign-builder-store\|ai-builder/plan\|ai-builder/phases\|ai-builder/phase-edit" src tests || echo "clean"`
Expected: only matches inside files about to be deleted.

- [ ] **Step 2: Delete the files**

```bash
git rm \
  "src/app/api/campaigns/ai-builder/plan/route.ts" \
  "src/app/api/campaigns/ai-builder/phases/route.ts" \
  "src/app/api/campaigns/ai-builder/phase-edit/route.ts" \
  "src/components/dashboard/campaigns/AiCampaignBuilderClient.tsx" \
  "src/components/dashboard/campaigns/AiBuilderChat.tsx" \
  "src/components/dashboard/campaigns/AiBuilderPreview.tsx" \
  "src/lib/ai/campaign-builder.ts" \
  "src/lib/ai/campaign-builder-store.ts" \
  "tests/unit/ai-campaign-builder-client.test.tsx" \
  "tests/unit/campaign-builder.test.ts" \
  "tests/unit/campaign-builder-store.test.ts" \
  "tests/unit/campaign-builder-v2-api.test.ts"
```

If a file in this list does not exist, drop it from the command. If a file is still referenced (typecheck / test), do NOT delete it — open the references and migrate or remove them first.

- [ ] **Step 3: Typecheck and run unit tests**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove legacy AI campaign builder code"
```

---

## Task 11: E2E — create a 3-funnel campaign

**Files:**
- Create: `tests/e2e/ai-builder-funnels.spec.ts`

- [ ] **Step 1: Inspect existing e2e setup**

Run: `ls tests/e2e/ && cat playwright.config.ts | head -30`. Note the auth/seed pattern existing tests use (e.g., `tests/e2e/...`). Reuse it.

- [ ] **Step 2: Write the e2e test**

```ts
// tests/e2e/ai-builder-funnels.spec.ts
import { test, expect } from "@playwright/test";

test("creates a 3-funnel campaign end to end", async ({ page }) => {
  // Assumes the e2e seed has at least 3 published action pages of types
  // form, qualification, sales (adapt seed if not).
  await page.goto("/app/campaigns/ai-builder");

  await page
    .getByPlaceholder(/what are you trying to do/i)
    .fill("Capture leads, qualify them, then close on coaching.");
  await page.getByRole("button", { name: /propose funnel/i }).click();

  // Wait for the structure wizard
  await expect(page.getByText(/Add funnel step|Next: chat rules/i)).toBeVisible();
  await page.getByRole("button", { name: /next: chat rules/i }).click();

  // Funnel rules panels render with seeded default rules
  await expect(page.getByText(/Chat rules for this funnel/).first()).toBeVisible();
  await page.getByRole("button", { name: /next: review/i }).click();

  await page.getByRole("button", { name: /save campaign/i }).click();
  await expect(page.getByText(/campaign saved/i)).toBeVisible();
});
```

- [ ] **Step 3: Run the e2e test**

Run: `npx playwright test tests/e2e/ai-builder-funnels.spec.ts`
Expected: PASS. If the seed lacks the right action pages, adjust the seed (under `supabase/seed.sql` or your test fixtures) before re-running.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/ai-builder-funnels.spec.ts
git commit -m "test(e2e): create 3-funnel campaign via AI builder"
```

---

## Task 12: Final verification

- [ ] **Step 1: Full check**

Run: `npm run lint && npm run typecheck && npx vitest run && npx playwright test`
Expected: PASS.

- [ ] **Step 2: Manual smoke**

Run: `npm run dev`. Navigate to `/app/campaigns/ai-builder`. Walk the four steps end-to-end against a seeded tenant. Verify the campaign and funnels appear in the database (`select * from campaign_funnels`). Confirm the goal on the campaign matches the last funnel's page type.

- [ ] **Step 3: Commit any fixes from manual smoke**

```bash
git add -A
git commit -m "fix: smoke-test follow-ups"
```

---

## Notes for Spec 3 (Conversation Engine)

When the engine rewrite lands, it must:

1. Read `campaign_funnels` (not `campaign_phases`) for any campaign created by the new builder.
2. Use `chat_rules` + `top_level_rules` (`campaigns.campaign_rules`) as the system prompt content.
3. Detect interest within a funnel and send the funnel's action page once the rule conditions are met.
4. Track per-lead funnel position and advance on action completion (or explicit chat signal — fast-forward).
5. Stop messaging the lead after they complete the last funnel's action.

These are explicitly NOT in scope for this plan.
