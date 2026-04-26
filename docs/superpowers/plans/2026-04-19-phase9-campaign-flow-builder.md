# Phase 9: Campaign Flow Builder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-tenant `bot_flow_phases` system with a campaign-based flow builder that supports multiple campaigns, A/B experiments, permanent lead assignment, per-phase success metrics, drop-off detection with follow-up messages, and conversion tracking.

**Architecture:** A `campaigns` table becomes the new top-level container for conversation flows. Each campaign has its own `campaign_phases` (replacing `bot_flow_phases`). Leads are permanently assigned to a campaign on first message — either via weighted random draw from a running `experiment`, or to the tenant's primary campaign. The conversation engine loads phases from the assigned campaign. A background cron job detects silent leads and sends follow-up messages. Conversions are tracked via a `campaign_conversions` table, triggered when a `lead_event` matches the campaign's goal.

**Tech Stack:** TypeScript, Next.js App Router, Supabase (Postgres + RLS), Zod (API validation), Vitest (unit tests), React (client components), existing UI components (`Button`, `Card`, `Badge`, `EmptyState`), existing design tokens (`--ws-*` CSS variables), Lucide React icons, Vercel Cron

**Spec:** `docs/superpowers/specs/2026-04-19-campaign-flow-builder-design.md`

---

## File Structure

```
supabase/migrations/
├── 0010_campaigns.sql                          # New tables + alter conversation_phases
└── 0011_migrate_bot_flow_phases.sql            # Data migration: bot_flow_phases → campaign_phases

src/types/
└── database.ts                                 # Modify: add all new table types

src/lib/ai/
├── campaign-assignment.ts                      # Create: lead → campaign assignment logic
├── conversion-detector.ts                      # Create: detect + record conversions
├── phase-machine.ts                            # Modify: use campaign_phases, add exit tracking
└── conversation-engine.ts                      # Modify: add campaign assignment step

src/app/api/campaigns/
├── route.ts                                    # Create: GET list + POST create
├── [id]/route.ts                               # Create: GET + PATCH + DELETE
├── [id]/phases/route.ts                        # Create: GET list + POST create
├── [id]/phases/[phaseId]/route.ts              # Create: PATCH + DELETE
├── [id]/phases/reorder/route.ts                # Create: POST reorder
└── [id]/metrics/route.ts                       # Create: GET phase funnel + conversion stats

src/app/api/experiments/
├── route.ts                                    # Create: GET list + POST create
├── [id]/route.ts                               # Create: GET + PATCH + DELETE
└── [id]/promote/route.ts                       # Create: POST promote winner

src/app/api/cron/
└── drop-off-scanner/route.ts                   # Create: Vercel Cron endpoint

src/hooks/
├── useCampaigns.ts                             # Create: campaign list hook
├── useCampaignPhases.ts                        # Create: phase CRUD hook (per campaign)
├── useCampaignMetrics.ts                       # Create: metrics hook
└── useExperiments.ts                           # Create: experiment CRUD hook

src/components/dashboard/
├── DashboardNav.tsx                            # Modify: add Campaigns nav item
└── campaigns/
    ├── CampaignCard.tsx                        # Create: campaign list card
    ├── CampaignForm.tsx                        # Create: campaign settings form
    ├── CampaignFlowPanel.tsx                   # Create: flow tab (reuses PhaseList/PhaseCard)
    ├── PhaseMetricsFunnel.tsx                  # Create: per-phase funnel visualization
    ├── ExperimentCard.tsx                      # Create: experiment list card
    └── ExperimentDetail.tsx                    # Create: experiment comparison view

src/app/(tenant)/app/
├── bot/BotClient.tsx                           # Modify: remove "Flow Builder" tab
└── campaigns/
    ├── page.tsx                                # Create: campaign list (server)
    ├── CampaignsClient.tsx                     # Create: campaign list (client)
    ├── new/page.tsx                            # Create: new campaign page
    ├── [id]/page.tsx                           # Create: campaign editor (server)
    ├── [id]/CampaignEditorClient.tsx           # Create: campaign editor (client, 3 tabs)
    ├── experiments/page.tsx                    # Create: experiments list (server)
    ├── experiments/ExperimentsClient.tsx        # Create: experiments list (client)
    ├── experiments/new/page.tsx                # Create: new experiment page
    ├── experiments/new/NewExperimentClient.tsx  # Create: new experiment form (client)
    ├── experiments/[id]/page.tsx               # Create: experiment detail (server)
    └── experiments/[id]/ExperimentDetailClient.tsx # Create: experiment detail (client)

tests/unit/
├── campaign-assignment.test.ts                 # Create
├── conversion-detector.test.ts                 # Create
├── campaigns-api.test.ts                       # Create
├── campaigns-detail-api.test.ts                # Create
├── campaigns-phases-api.test.ts                # Create
├── campaigns-phases-reorder-api.test.ts        # Create
├── campaigns-metrics-api.test.ts               # Create
├── experiments-api.test.ts                     # Create
├── experiments-promote-api.test.ts             # Create
└── drop-off-scanner.test.ts                    # Create

tests/e2e/
└── campaigns.spec.ts                           # Create
```

---

## Task 1: Database Migration — New Tables

**Files:**
- Create: `supabase/migrations/0010_campaigns.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/0010_campaigns.sql`:

```sql
-- =============================================================
-- Phase 9: Campaign Flow Builder
-- New tables for campaigns, experiments, and conversion tracking
-- =============================================================

-- CAMPAIGNS
create table campaigns (
  id                       uuid primary key default uuid_generate_v4(),
  tenant_id                uuid not null references tenants(id) on delete cascade,
  name                     text not null,
  description              text,
  goal                     text not null check (goal in ('form_submit', 'appointment_booked', 'purchase', 'stage_reached')),
  goal_config              jsonb not null default '{}',
  is_primary               boolean not null default false,
  status                   text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  follow_up_delay_minutes  integer not null default 120,
  follow_up_message        text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index on campaigns (tenant_id);
create unique index campaigns_one_primary_per_tenant on campaigns (tenant_id) where is_primary = true;

-- CAMPAIGN PHASES (replaces bot_flow_phases)
create table campaign_phases (
  id                    uuid primary key default uuid_generate_v4(),
  campaign_id           uuid not null references campaigns(id) on delete cascade,
  tenant_id             uuid not null references tenants(id) on delete cascade,
  name                  text not null,
  order_index           integer not null default 0,
  max_messages          integer not null default 3,
  system_prompt         text not null,
  tone                  text default 'friendly and helpful',
  goals                 text,
  transition_hint       text,
  action_button_ids     uuid[] not null default '{}',
  image_attachment_ids  uuid[] not null default '{}',
  created_at            timestamptz not null default now()
);

create index on campaign_phases (campaign_id);
create index on campaign_phases (tenant_id);

-- LEAD CAMPAIGN ASSIGNMENTS (permanent, one per lead)
create table lead_campaign_assignments (
  id           uuid primary key default uuid_generate_v4(),
  lead_id      uuid not null references leads(id) on delete cascade,
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  assigned_at  timestamptz not null default now(),
  unique (lead_id)
);

create index on lead_campaign_assignments (campaign_id);

-- EXPERIMENTS
create table experiments (
  id                  uuid primary key default uuid_generate_v4(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  name                text not null,
  status              text not null default 'draft' check (status in ('draft', 'running', 'paused', 'completed')),
  min_sample_size     integer not null default 50,
  started_at          timestamptz,
  ended_at            timestamptz,
  winner_campaign_id  uuid references campaigns(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index on experiments (tenant_id);

-- EXPERIMENT ↔ CAMPAIGN join (with weight)
create table experiment_campaigns (
  experiment_id  uuid not null references experiments(id) on delete cascade,
  campaign_id    uuid not null references campaigns(id) on delete cascade,
  weight         integer not null default 50 check (weight > 0 and weight <= 100),
  primary key (experiment_id, campaign_id)
);

-- CAMPAIGN CONVERSIONS
create table campaign_conversions (
  id            uuid primary key default uuid_generate_v4(),
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  lead_id       uuid not null references leads(id) on delete cascade,
  converted_at  timestamptz not null default now(),
  metadata      jsonb not null default '{}'
);

create index on campaign_conversions (campaign_id);
create index on campaign_conversions (lead_id);

-- ALTER conversation_phases: add exit tracking + follow-up sentinel
alter table conversation_phases
  add column exited_at          timestamptz,
  add column exit_reason        text check (exit_reason in ('advanced', 'dropped', 'converted', 'human_handoff')),
  add column follow_ups_sent_at timestamptz;

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

alter table campaigns enable row level security;
create policy "campaigns_all" on campaigns for all
  using (tenant_id = current_tenant_id());

alter table campaign_phases enable row level security;
create policy "campaign_phases_all" on campaign_phases for all
  using (tenant_id = current_tenant_id());

alter table lead_campaign_assignments enable row level security;
create policy "lead_campaign_assignments_all" on lead_campaign_assignments for all
  using (lead_id in (select id from leads where tenant_id = current_tenant_id()));

alter table experiments enable row level security;
create policy "experiments_all" on experiments for all
  using (tenant_id = current_tenant_id());

alter table experiment_campaigns enable row level security;
create policy "experiment_campaigns_all" on experiment_campaigns for all
  using (experiment_id in (select id from experiments where tenant_id = current_tenant_id()));

alter table campaign_conversions enable row level security;
create policy "campaign_conversions_all" on campaign_conversions for all
  using (campaign_id in (select id from campaigns where tenant_id = current_tenant_id()));
```

- [ ] **Step 2: Apply migration**

Run: `npx supabase db push` (or apply via Supabase dashboard)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0010_campaigns.sql
git commit -m "feat: add campaign tables migration (Phase 9)"
```

---

## Task 2: Database Migration — Data Migration from bot_flow_phases

**Files:**
- Create: `supabase/migrations/0011_migrate_bot_flow_phases.sql`

- [ ] **Step 1: Create the data migration file**

Create `supabase/migrations/0011_migrate_bot_flow_phases.sql`:

```sql
-- =============================================================
-- Migrate bot_flow_phases → campaign_phases
-- Creates a "Default Campaign" per tenant, copies phases,
-- re-points conversation_phases FKs, renames old table.
-- =============================================================

do $$
declare
  t record;
  new_campaign_id uuid;
  phase record;
  new_phase_id uuid;
begin
  -- For each tenant that has bot_flow_phases rows: create a campaign + copy phases
  for t in select distinct bfp.tenant_id, tn.bot_goal
           from bot_flow_phases bfp
           join tenants tn on tn.id = bfp.tenant_id
  loop
    insert into campaigns (tenant_id, name, description, goal, is_primary, status)
    values (
      t.tenant_id,
      'Default Campaign',
      'Migrated from flow builder',
      case t.bot_goal
        when 'sell' then 'purchase'
        when 'qualify_leads' then 'form_submit'
        when 'understand_intent' then 'form_submit'
        when 'collect_lead_info' then 'form_submit'
      end,
      true,
      'active'
    )
    returning id into new_campaign_id;

    for phase in
      select * from bot_flow_phases
      where tenant_id = t.tenant_id
      order by order_index
    loop
      insert into campaign_phases (
        campaign_id, tenant_id, name, order_index, max_messages,
        system_prompt, tone, goals, transition_hint,
        action_button_ids, image_attachment_ids, created_at
      ) values (
        new_campaign_id, phase.tenant_id, phase.name, phase.order_index,
        phase.max_messages, phase.system_prompt, phase.tone, phase.goals,
        phase.transition_hint,
        coalesce(phase.action_button_ids, '{}'),
        coalesce(phase.image_attachment_ids, '{}'),
        phase.created_at
      )
      returning id into new_phase_id;

      -- Re-point conversation_phases to the new campaign_phases row
      update conversation_phases
        set phase_id = new_phase_id
        where phase_id = phase.id;
    end loop;
  end loop;

  -- Create empty primary campaign for tenants with no existing phases
  insert into campaigns (tenant_id, name, goal, is_primary, status)
  select id, 'Default Campaign', 'form_submit', true, 'active'
  from tenants
  where id not in (select tenant_id from campaigns);
end $$;

-- Drop old FK constraint on conversation_phases → bot_flow_phases
alter table conversation_phases
  drop constraint conversation_phases_phase_id_fkey;

-- Add new FK constraint → campaign_phases
alter table conversation_phases
  add constraint conversation_phases_phase_id_fkey
  foreign key (phase_id) references campaign_phases(id) on delete cascade;

-- Rename old table (keep as backup, drop in a future migration)
alter table bot_flow_phases rename to _deprecated_bot_flow_phases;
```

- [ ] **Step 2: Apply migration**

Run: `npx supabase db push`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0011_migrate_bot_flow_phases.sql
git commit -m "feat: migrate bot_flow_phases data to campaign_phases"
```

---

## Task 3: TypeScript Database Types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add new table types to `database.ts`**

Find the `Database` interface in `src/types/database.ts` and add the following table entries inside `public.Tables`:

```typescript
campaigns: TableRow<{
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  goal: "form_submit" | "appointment_booked" | "purchase" | "stage_reached";
  goal_config: Record<string, unknown>;
  is_primary: boolean;
  status: "draft" | "active" | "paused" | "archived";
  follow_up_delay_minutes: number;
  follow_up_message: string | null;
  created_at: string;
  updated_at: string;
}>;
campaign_phases: TableRow<{
  id: string;
  campaign_id: string;
  tenant_id: string;
  name: string;
  order_index: number;
  max_messages: number;
  system_prompt: string;
  tone: string | null;
  goals: string | null;
  transition_hint: string | null;
  action_button_ids: string[];
  image_attachment_ids: string[];
  created_at: string;
}>;
lead_campaign_assignments: TableRow<{
  id: string;
  lead_id: string;
  campaign_id: string;
  assigned_at: string;
}>;
experiments: TableRow<{
  id: string;
  tenant_id: string;
  name: string;
  status: "draft" | "running" | "paused" | "completed";
  min_sample_size: number;
  started_at: string | null;
  ended_at: string | null;
  winner_campaign_id: string | null;
  created_at: string;
}>;
experiment_campaigns: TableRow<{
  experiment_id: string;
  campaign_id: string;
  weight: number;
}>;
campaign_conversions: TableRow<{
  id: string;
  campaign_id: string;
  lead_id: string;
  converted_at: string;
  metadata: Record<string, unknown>;
}>;
```

- [ ] **Step 2: Update the `conversation_phases` type**

Find the existing `conversation_phases` entry and add the new columns:

```typescript
conversation_phases: TableRow<{
  id: string;
  conversation_id: string;
  phase_id: string;
  entered_at: string;
  message_count: number;
  exited_at: string | null;
  exit_reason: "advanced" | "dropped" | "converted" | "human_handoff" | null;
  follow_ups_sent_at: string | null;
}>;
```

- [ ] **Step 3: Run type check**

Run: `npm run typecheck`
Expected: Pass (no existing code references the new types yet)

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add campaign and experiment types to database.ts"
```

---

## Task 4: Campaign Assignment Module

**Files:**
- Create: `src/lib/ai/campaign-assignment.ts`
- Create: `tests/unit/campaign-assignment.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/campaign-assignment.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

function mockTable(selectResult: unknown, insertResult?: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(selectResult);
  if (insertResult !== undefined) {
    chain.insert = vi.fn().mockResolvedValue(insertResult);
  }
  return chain;
}

describe("getOrAssignCampaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns existing assignment when lead is already assigned", async () => {
    const assignmentChain = mockTable({ data: { campaign_id: "camp-1" }, error: null });
    mockFrom.mockReturnValue(assignmentChain);

    const { getOrAssignCampaign } = await import("@/lib/ai/campaign-assignment");
    const result = await getOrAssignCampaign("lead-1", "tenant-1");

    expect(result).toBe("camp-1");
    expect(mockFrom).toHaveBeenCalledWith("lead_campaign_assignments");
  });

  it("assigns to primary campaign when no experiment is running", async () => {
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "lead_campaign_assignments" && callCount === 0) {
        callCount++;
        return mockTable({ data: null, error: { code: "PGRST116" } });
      }
      if (table === "experiments") {
        return mockTable({ data: null, error: { code: "PGRST116" } });
      }
      if (table === "campaigns") {
        return mockTable({ data: { id: "primary-camp" }, error: null });
      }
      if (table === "lead_campaign_assignments") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return mockTable({ data: null, error: null });
    });

    const { getOrAssignCampaign } = await import("@/lib/ai/campaign-assignment");
    const result = await getOrAssignCampaign("lead-1", "tenant-1");

    expect(result).toBe("primary-camp");
  });

  it("assigns via weighted random when experiment is running", async () => {
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "lead_campaign_assignments" && callCount === 0) {
        callCount++;
        return mockTable({ data: null, error: { code: "PGRST116" } });
      }
      if (table === "experiments") {
        return mockTable({
          data: {
            id: "exp-1",
            experiment_campaigns: [
              { campaign_id: "camp-a", weight: 100 },
              { campaign_id: "camp-b", weight: 0 },
            ],
          },
          error: null,
        });
      }
      if (table === "lead_campaign_assignments") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return mockTable({ data: null, error: null });
    });

    // With weight 100 vs 0, camp-a should always be picked.
    // But our schema enforces weight > 0, so in real usage this wouldn't happen.
    // This test verifies the weighted selection path runs.
    const { getOrAssignCampaign } = await import("@/lib/ai/campaign-assignment");
    const result = await getOrAssignCampaign("lead-1", "tenant-1");

    expect(result).toBe("camp-a");
  });
});

describe("weightedRandomCampaign", () => {
  it("returns the only campaign when there is one variant", async () => {
    const { weightedRandomCampaign } = await import("@/lib/ai/campaign-assignment");
    const result = weightedRandomCampaign([{ campaign_id: "only", weight: 50 }]);
    expect(result).toBe("only");
  });

  it("always returns a valid campaign_id", async () => {
    const { weightedRandomCampaign } = await import("@/lib/ai/campaign-assignment");
    const variants = [
      { campaign_id: "a", weight: 30 },
      { campaign_id: "b", weight: 70 },
    ];
    for (let i = 0; i < 20; i++) {
      const result = weightedRandomCampaign(variants);
      expect(["a", "b"]).toContain(result);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/campaign-assignment.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/ai/campaign-assignment.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/service";

export function weightedRandomCampaign(
  variants: { campaign_id: string; weight: number }[]
): string {
  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
  let random = Math.random() * totalWeight;

  for (const variant of variants) {
    random -= variant.weight;
    if (random <= 0) return variant.campaign_id;
  }

  return variants[variants.length - 1].campaign_id;
}

export async function getOrAssignCampaign(
  leadId: string,
  tenantId: string
): Promise<string> {
  const supabase = createServiceClient();

  // Check for existing assignment
  const { data: existing } = await supabase
    .from("lead_campaign_assignments")
    .select("campaign_id")
    .eq("lead_id", leadId)
    .single();

  if (existing) return existing.campaign_id;

  // Check for running experiment
  const { data: experiment } = await supabase
    .from("experiments")
    .select("id, experiment_campaigns(campaign_id, weight)")
    .eq("tenant_id", tenantId)
    .eq("status", "running")
    .limit(1)
    .single();

  let campaignId: string;

  if (experiment?.experiment_campaigns?.length > 0) {
    campaignId = weightedRandomCampaign(experiment.experiment_campaigns);
  } else {
    // Assign to primary campaign
    const { data: primary } = await supabase
      .from("campaigns")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("is_primary", true)
      .single();

    if (!primary) {
      throw new Error("No primary campaign configured for tenant");
    }

    campaignId = primary.id;
  }

  // Insert permanent assignment
  await supabase.from("lead_campaign_assignments").insert({
    lead_id: leadId,
    campaign_id: campaignId,
  });

  return campaignId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/campaign-assignment.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/campaign-assignment.ts tests/unit/campaign-assignment.test.ts
git commit -m "feat: add campaign assignment module with weighted random draw"
```

---

## Task 5: Campaigns CRUD API

**Files:**
- Create: `src/app/api/campaigns/route.ts`
- Create: `src/app/api/campaigns/[id]/route.ts`
- Create: `tests/unit/campaigns-api.test.ts`
- Create: `tests/unit/campaigns-detail-api.test.ts`

- [ ] **Step 1: Write failing tests for GET/POST /api/campaigns**

Create `tests/unit/campaigns-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mockGetUser } })
  ),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

describe("GET /api/campaigns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });
    const { GET } = await import("@/app/api/campaigns/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns campaigns list for tenant", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const campaigns = [
      { id: "c1", name: "Main", is_primary: true, status: "active", goal: "form_submit" },
    ];

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: campaigns, error: null }),
        }),
      }),
    });

    const { GET } = await import("@/app/api/campaigns/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.campaigns).toHaveLength(1);
    expect(body.campaigns[0].name).toBe("Main");
  });
});

describe("POST /api/campaigns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("creates a campaign with valid data", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const newCampaign = { id: "c-new", name: "Test Campaign", goal: "purchase", status: "draft" };

    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: newCampaign, error: null }),
        }),
      }),
    });

    const { POST } = await import("@/app/api/campaigns/route");
    const req = new Request("http://localhost/api/campaigns", {
      method: "POST",
      body: JSON.stringify({ name: "Test Campaign", goal: "purchase" }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.campaign.name).toBe("Test Campaign");
  });

  it("returns 400 for invalid goal", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const { POST } = await import("@/app/api/campaigns/route");
    const req = new Request("http://localhost/api/campaigns", {
      method: "POST",
      body: JSON.stringify({ name: "Test", goal: "invalid_goal" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/campaigns-api.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement GET/POST /api/campaigns**

Create `src/app/api/campaigns/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  goal: z.enum(["form_submit", "appointment_booked", "purchase", "stage_reached"]),
  goal_config: z.record(z.unknown()).optional(),
  follow_up_delay_minutes: z.number().int().min(15).max(1440).optional(),
  follow_up_message: z.string().max(500).optional(),
});

async function authenticate() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
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
  const { data: campaigns, error } = await service
    .from("campaigns")
    .select("*")
    .eq("tenant_id", auth.tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }

  return NextResponse.json({ campaigns: campaigns ?? [] });
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
  const { data: campaign, error } = await service
    .from("campaigns")
    .insert({
      tenant_id: auth.tenantId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      goal: parsed.data.goal,
      goal_config: parsed.data.goal_config ?? {},
      follow_up_delay_minutes: parsed.data.follow_up_delay_minutes ?? 120,
      follow_up_message: parsed.data.follow_up_message ?? null,
    })
    .select("*")
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }

  return NextResponse.json({ campaign }, { status: 201 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/campaigns-api.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing tests for GET/PATCH/DELETE /api/campaigns/[id]**

Create `tests/unit/campaigns-detail-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mockGetUser } })
  ),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

const params = Promise.resolve({ id: "camp-1" });

describe("GET /api/campaigns/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });
    const { GET } = await import("@/app/api/campaigns/[id]/route");
    const req = new Request("http://localhost/api/campaigns/camp-1");
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns campaign details", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const campaign = { id: "camp-1", name: "Main", tenant_id: "t1" };
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: campaign, error: null }),
          }),
        }),
      }),
    });

    const { GET } = await import("@/app/api/campaigns/[id]/route");
    const req = new Request("http://localhost/api/campaigns/camp-1");
    const res = await GET(req, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.campaign.name).toBe("Main");
  });
});

describe("PATCH /api/campaigns/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("updates campaign fields", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const updated = { id: "camp-1", name: "Updated Name", status: "active" };
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: updated, error: null }),
            }),
          }),
        }),
      }),
    });

    const { PATCH } = await import("@/app/api/campaigns/[id]/route");
    const req = new Request("http://localhost/api/campaigns/camp-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated Name", status: "active" }),
    });
    const res = await PATCH(req, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.campaign.name).toBe("Updated Name");
  });
});

describe("DELETE /api/campaigns/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("deletes a campaign", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    });

    const { DELETE } = await import("@/app/api/campaigns/[id]/route");
    const req = new Request("http://localhost/api/campaigns/camp-1", { method: "DELETE" });
    const res = await DELETE(req, { params });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- tests/unit/campaigns-detail-api.test.ts`
Expected: FAIL — module not found

- [ ] **Step 7: Implement GET/PATCH/DELETE /api/campaigns/[id]**

Create `src/app/api/campaigns/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  goal: z.enum(["form_submit", "appointment_booked", "purchase", "stage_reached"]).optional(),
  goal_config: z.record(z.unknown()).optional(),
  is_primary: z.boolean().optional(),
  status: z.enum(["draft", "active", "paused", "archived"]).optional(),
  follow_up_delay_minutes: z.number().int().min(15).max(1440).optional(),
  follow_up_message: z.string().max(500).nullable().optional(),
});

async function authenticate() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Unauthorized", status: 401 };
  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) return { error: "No tenant associated", status: 403 };
  return { tenantId };
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const service = createServiceClient();
  const { data: campaign, error } = await service
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", auth.tenantId)
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json({ campaign });
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

  // If setting as primary, unset the current primary first
  if (parsed.data.is_primary === true) {
    await service
      .from("campaigns")
      .update({ is_primary: false })
      .eq("tenant_id", auth.tenantId)
      .eq("is_primary", true);
  }

  const { data: campaign, error } = await service
    .from("campaigns")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", auth.tenantId)
    .select("*")
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Failed to update campaign" }, { status: 500 });
  }

  return NextResponse.json({ campaign });
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const service = createServiceClient();

  const { error } = await service
    .from("campaigns")
    .delete()
    .eq("id", id)
    .eq("tenant_id", auth.tenantId);

  if (error) {
    return NextResponse.json({ error: "Failed to delete campaign" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- tests/unit/campaigns-api.test.ts tests/unit/campaigns-detail-api.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/app/api/campaigns/ tests/unit/campaigns-api.test.ts tests/unit/campaigns-detail-api.test.ts
git commit -m "feat: add campaigns CRUD API with tests"
```

---

## Task 6: Campaign Phases API

**Files:**
- Create: `src/app/api/campaigns/[id]/phases/route.ts`
- Create: `src/app/api/campaigns/[id]/phases/[phaseId]/route.ts`
- Create: `src/app/api/campaigns/[id]/phases/reorder/route.ts`
- Create: `tests/unit/campaigns-phases-api.test.ts`
- Create: `tests/unit/campaigns-phases-reorder-api.test.ts`

- [ ] **Step 1: Write failing test for phases GET/POST**

Create `tests/unit/campaigns-phases-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mockGetUser } })
  ),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

const params = Promise.resolve({ id: "camp-1" });

describe("GET /api/campaigns/[id]/phases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns phases for a campaign", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const phases = [
      { id: "p1", name: "Greet", order_index: 0, campaign_id: "camp-1" },
    ];

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: phases, error: null }),
          }),
        }),
      }),
    });

    const { GET } = await import("@/app/api/campaigns/[id]/phases/route");
    const req = new Request("http://localhost/api/campaigns/camp-1/phases");
    const res = await GET(req, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.phases).toHaveLength(1);
  });
});

describe("POST /api/campaigns/[id]/phases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("creates a phase for the campaign", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const newPhase = { id: "p-new", name: "New Phase", campaign_id: "camp-1" };
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: newPhase, error: null }),
        }),
      }),
    });

    const { POST } = await import("@/app/api/campaigns/[id]/phases/route");
    const req = new Request("http://localhost/api/campaigns/camp-1/phases", {
      method: "POST",
      body: JSON.stringify({
        name: "New Phase",
        order_index: 0,
        system_prompt: "Hello",
      }),
    });
    const res = await POST(req, { params });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.phase.name).toBe("New Phase");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/campaigns-phases-api.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement phases GET/POST**

Create `src/app/api/campaigns/[id]/phases/route.ts`:

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
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Unauthorized", status: 401 };
  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) return { error: "No tenant associated", status: 403 };
  return { tenantId };
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: campaignId } = await context.params;
  const service = createServiceClient();
  const { data: phases, error } = await service
    .from("campaign_phases")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("tenant_id", auth.tenantId)
    .order("order_index", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch phases" }, { status: 500 });
  }

  return NextResponse.json({ phases: phases ?? [] });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: campaignId } = await context.params;
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
    .from("campaign_phases")
    .insert({
      campaign_id: campaignId,
      tenant_id: auth.tenantId,
      name: parsed.data.name,
      order_index: parsed.data.order_index,
      max_messages: parsed.data.max_messages,
      system_prompt: parsed.data.system_prompt,
      tone: parsed.data.tone ?? "friendly and helpful",
      goals: parsed.data.goals ?? null,
      transition_hint: parsed.data.transition_hint ?? null,
      action_button_ids: parsed.data.action_button_ids ?? [],
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

- [ ] **Step 4: Implement phases PATCH/DELETE**

Create `src/app/api/campaigns/[id]/phases/[phaseId]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  max_messages: z.number().int().min(1).max(50).optional(),
  system_prompt: z.string().min(1).max(5000).optional(),
  tone: z.string().max(200).optional(),
  goals: z.string().max(2000).nullable().optional(),
  transition_hint: z.string().max(1000).nullable().optional(),
  action_button_ids: z.array(z.string().uuid()).optional(),
  image_attachment_ids: z.array(z.string().uuid()).optional(),
});

async function authenticate() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Unauthorized", status: 401 };
  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) return { error: "No tenant associated", status: 403 };
  return { tenantId };
}

type RouteContext = { params: Promise<{ id: string; phaseId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { phaseId } = await context.params;
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
    .from("campaign_phases")
    .update(parsed.data)
    .eq("id", phaseId)
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

  const { phaseId } = await context.params;
  const service = createServiceClient();

  const { error } = await service
    .from("campaign_phases")
    .delete()
    .eq("id", phaseId)
    .eq("tenant_id", auth.tenantId);

  if (error) {
    return NextResponse.json({ error: "Failed to delete phase" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 5: Implement phases reorder**

Create `src/app/api/campaigns/[id]/phases/reorder/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const reorderSchema = z.array(
  z.object({
    id: z.string().uuid(),
    order_index: z.number().int().min(0),
  })
);

async function authenticate() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Unauthorized", status: 401 };
  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) return { error: "No tenant associated", status: 403 };
  return { tenantId };
}

export async function POST(request: Request) {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
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

  for (const item of parsed.data) {
    await service
      .from("campaign_phases")
      .update({ order_index: item.order_index })
      .eq("id", item.id)
      .eq("tenant_id", auth.tenantId);
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 6: Run all phase tests**

Run: `npm test -- tests/unit/campaigns-phases-api.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/api/campaigns/\[id\]/phases/ tests/unit/campaigns-phases-api.test.ts
git commit -m "feat: add campaign phases CRUD and reorder API"
```

---

## Task 7: Experiments API

**Files:**
- Create: `src/app/api/experiments/route.ts`
- Create: `src/app/api/experiments/[id]/route.ts`
- Create: `src/app/api/experiments/[id]/promote/route.ts`
- Create: `tests/unit/experiments-api.test.ts`
- Create: `tests/unit/experiments-promote-api.test.ts`

- [ ] **Step 1: Write failing tests for experiments**

Create `tests/unit/experiments-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mockGetUser } })
  ),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

describe("GET /api/experiments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });
    const { GET } = await import("@/app/api/experiments/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns experiments list", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [{ id: "exp-1", name: "Test", status: "running" }],
            error: null,
          }),
        }),
      }),
    });

    const { GET } = await import("@/app/api/experiments/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.experiments).toHaveLength(1);
  });
});

describe("POST /api/experiments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("creates an experiment with campaign variants", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const experiment = { id: "exp-new", name: "A/B Test", status: "draft" };
    let callIndex = 0;
    mockFrom.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) {
        // experiments insert
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: experiment, error: null }),
            }),
          }),
        };
      }
      // experiment_campaigns insert
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    const { POST } = await import("@/app/api/experiments/route");
    const req = new Request("http://localhost/api/experiments", {
      method: "POST",
      body: JSON.stringify({
        name: "A/B Test",
        campaigns: [
          { campaign_id: "c1", weight: 50 },
          { campaign_id: "c2", weight: 50 },
        ],
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.experiment.name).toBe("A/B Test");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/experiments-api.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement experiments GET/POST**

Create `src/app/api/experiments/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  min_sample_size: z.number().int().min(10).max(10000).optional(),
  campaigns: z
    .array(
      z.object({
        campaign_id: z.string().uuid(),
        weight: z.number().int().min(1).max(100),
      })
    )
    .min(2)
    .max(4),
});

async function authenticate() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
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
  const { data: experiments, error } = await service
    .from("experiments")
    .select("*, experiment_campaigns(campaign_id, weight, campaigns(id, name, status))")
    .eq("tenant_id", auth.tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch experiments" }, { status: 500 });
  }

  return NextResponse.json({ experiments: experiments ?? [] });
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

  const { data: experiment, error: expError } = await service
    .from("experiments")
    .insert({
      tenant_id: auth.tenantId,
      name: parsed.data.name,
      min_sample_size: parsed.data.min_sample_size ?? 50,
    })
    .select("*")
    .single();

  if (expError || !experiment) {
    return NextResponse.json({ error: "Failed to create experiment" }, { status: 500 });
  }

  const { error: joinError } = await service
    .from("experiment_campaigns")
    .insert(
      parsed.data.campaigns.map((c) => ({
        experiment_id: experiment.id,
        campaign_id: c.campaign_id,
        weight: c.weight,
      }))
    );

  if (joinError) {
    return NextResponse.json({ error: "Failed to add experiment campaigns" }, { status: 500 });
  }

  return NextResponse.json({ experiment }, { status: 201 });
}
```

- [ ] **Step 4: Implement experiments [id] GET/PATCH/DELETE**

Create `src/app/api/experiments/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(["draft", "running", "paused", "completed"]).optional(),
  min_sample_size: z.number().int().min(10).max(10000).optional(),
});

async function authenticate() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Unauthorized", status: 401 };
  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) return { error: "No tenant associated", status: 403 };
  return { tenantId };
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const service = createServiceClient();
  const { data: experiment, error } = await service
    .from("experiments")
    .select("*, experiment_campaigns(campaign_id, weight, campaigns(id, name, status))")
    .eq("id", id)
    .eq("tenant_id", auth.tenantId)
    .single();

  if (error || !experiment) {
    return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
  }

  return NextResponse.json({ experiment });
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

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "running") {
    updateData.started_at = new Date().toISOString();
  } else if (parsed.data.status === "completed") {
    updateData.ended_at = new Date().toISOString();
  }

  const { data: experiment, error } = await service
    .from("experiments")
    .update(updateData)
    .eq("id", id)
    .eq("tenant_id", auth.tenantId)
    .select("*")
    .single();

  if (error || !experiment) {
    return NextResponse.json({ error: "Failed to update experiment" }, { status: 500 });
  }

  return NextResponse.json({ experiment });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const service = createServiceClient();

  const { error } = await service
    .from("experiments")
    .delete()
    .eq("id", id)
    .eq("tenant_id", auth.tenantId);

  if (error) {
    return NextResponse.json({ error: "Failed to delete experiment" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 5: Write promote endpoint test**

Create `tests/unit/experiments-promote-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mockGetUser } })
  ),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

const params = Promise.resolve({ id: "exp-1" });

describe("POST /api/experiments/[id]/promote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 400 when no winner_campaign_id provided", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const { POST } = await import("@/app/api/experiments/[id]/promote/route");
    const req = new Request("http://localhost/api/experiments/exp-1/promote", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 6: Implement promote endpoint**

Create `src/app/api/experiments/[id]/promote/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const promoteSchema = z.object({
  winner_campaign_id: z.string().uuid(),
});

async function authenticate() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Unauthorized", status: 401 };
  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) return { error: "No tenant associated", status: 403 };
  return { tenantId };
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const body = await request.json();
  const parsed = promoteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  // Mark experiment completed with winner
  const { error: expError } = await service
    .from("experiments")
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
      winner_campaign_id: parsed.data.winner_campaign_id,
    })
    .eq("id", id)
    .eq("tenant_id", auth.tenantId);

  if (expError) {
    return NextResponse.json({ error: "Failed to update experiment" }, { status: 500 });
  }

  // Unset current primary
  await service
    .from("campaigns")
    .update({ is_primary: false })
    .eq("tenant_id", auth.tenantId)
    .eq("is_primary", true);

  // Set winner as new primary
  const { error: campError } = await service
    .from("campaigns")
    .update({ is_primary: true, status: "active" })
    .eq("id", parsed.data.winner_campaign_id)
    .eq("tenant_id", auth.tenantId);

  if (campError) {
    return NextResponse.json({ error: "Failed to promote campaign" }, { status: 500 });
  }

  return NextResponse.json({ success: true, promoted: parsed.data.winner_campaign_id });
}
```

- [ ] **Step 7: Run all experiment tests**

Run: `npm test -- tests/unit/experiments-api.test.ts tests/unit/experiments-promote-api.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/app/api/experiments/ tests/unit/experiments-api.test.ts tests/unit/experiments-promote-api.test.ts
git commit -m "feat: add experiments CRUD and promote-winner API"
```

---

## Task 8: Engine Wiring — Phase Machine + Conversation Engine

**Files:**
- Modify: `src/lib/ai/phase-machine.ts`
- Modify: `src/lib/ai/conversation-engine.ts`

- [ ] **Step 1: Update phase-machine.ts to use campaign_phases**

In `src/lib/ai/phase-machine.ts`, make the following changes:

1. Rename `BotFlowPhaseRow` to `CampaignPhaseRow`
2. Update `ConversationPhaseWithJoin` to reference `campaign_phases`
3. Change `getCurrentPhase` signature to accept `campaignId` instead of `tenantId`
4. Change `advancePhase` signature to accept `campaignId` instead of `tenantId`
5. Add `exitPhase` function
6. All queries change from `bot_flow_phases` → `campaign_phases`, and filter by `campaign_id` instead of `tenant_id`

Replace the full content of `src/lib/ai/phase-machine.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/service";

export interface CurrentPhase {
  conversationPhaseId: string;
  phaseId: string;
  name: string;
  orderIndex: number;
  maxMessages: number;
  systemPrompt: string;
  tone: string;
  goals: string | null;
  transitionHint: string | null;
  actionButtonIds: string[] | null;
  messageCount: number;
}

interface CampaignPhaseRow {
  id: string;
  name: string;
  order_index: number;
  max_messages: number;
  system_prompt: string;
  tone: string;
  goals: string | null;
  transition_hint: string | null;
  action_button_ids: string[] | null;
}

interface ConversationPhaseWithJoin {
  id: string;
  phase_id: string;
  message_count: number;
  campaign_phases: CampaignPhaseRow;
}

function mapToCurrentPhase(
  conversationPhaseId: string,
  messageCount: number,
  phase: CampaignPhaseRow
): CurrentPhase {
  return {
    conversationPhaseId,
    phaseId: phase.id,
    name: phase.name,
    orderIndex: phase.order_index,
    maxMessages: phase.max_messages,
    systemPrompt: phase.system_prompt,
    tone: phase.tone,
    goals: phase.goals,
    transitionHint: phase.transition_hint,
    actionButtonIds: phase.action_button_ids,
    messageCount,
  };
}

export async function getCurrentPhase(
  conversationId: string,
  campaignId: string
): Promise<CurrentPhase> {
  const supabase = createServiceClient();

  // Try to find the most recent conversation_phase
  const { data: existingRaw, error } = await supabase
    .from("conversation_phases")
    .select("id, phase_id, message_count, campaign_phases(*)")
    .eq("conversation_id", conversationId)
    .is("exited_at", null)
    .order("entered_at", { ascending: false })
    .limit(1)
    .single();

  const existing = existingRaw as ConversationPhaseWithJoin | null;

  if (!error && existing) {
    return mapToCurrentPhase(
      existing.id,
      existing.message_count,
      existing.campaign_phases
    );
  }

  // No existing phase — initialize with first phase (order_index = 0)
  const { data: firstPhaseRaw } = await supabase
    .from("campaign_phases")
    .select("id, name, order_index, max_messages, system_prompt, tone, goals, transition_hint, action_button_ids")
    .eq("campaign_id", campaignId)
    .order("order_index", { ascending: true })
    .limit(1)
    .single();

  const firstPhase = firstPhaseRaw as CampaignPhaseRow | null;

  if (!firstPhase) {
    throw new Error("No campaign phases configured");
  }

  const { data: insertedRaw } = await supabase
    .from("conversation_phases")
    .insert({ conversation_id: conversationId, phase_id: firstPhase.id, message_count: 0 })
    .select("id, phase_id, message_count")
    .single();

  const inserted = insertedRaw as { id: string; phase_id: string; message_count: number } | null;

  if (!inserted) {
    throw new Error("Failed to insert initial conversation phase");
  }

  return mapToCurrentPhase(inserted.id, inserted.message_count, firstPhase);
}

export async function advancePhase(
  conversationId: string,
  campaignId: string
): Promise<CurrentPhase> {
  const supabase = createServiceClient();

  const current = await getCurrentPhase(conversationId, campaignId);

  // Close the current phase
  await supabase
    .from("conversation_phases")
    .update({
      exited_at: new Date().toISOString(),
      exit_reason: "advanced",
    })
    .eq("id", current.conversationPhaseId);

  // Find the next phase by order_index
  const { data: nextPhaseRaw } = await supabase
    .from("campaign_phases")
    .select("id, name, order_index, max_messages, system_prompt, tone, goals, transition_hint, action_button_ids")
    .eq("campaign_id", campaignId)
    .gt("order_index", current.orderIndex)
    .order("order_index", { ascending: true })
    .limit(1)
    .single();

  const nextPhase = nextPhaseRaw as CampaignPhaseRow | null;

  // Already on the last phase — reopen the current phase (undo exit)
  if (!nextPhase) {
    await supabase
      .from("conversation_phases")
      .update({ exited_at: null, exit_reason: null })
      .eq("id", current.conversationPhaseId);
    return current;
  }

  // Insert a new conversation_phases row for the next phase
  const { data: insertedNextRaw } = await supabase
    .from("conversation_phases")
    .insert({ conversation_id: conversationId, phase_id: nextPhase.id, message_count: 0 })
    .select("id, phase_id, message_count")
    .single();

  const insertedNext = insertedNextRaw as { id: string; phase_id: string; message_count: number } | null;

  if (!insertedNext) {
    throw new Error("Failed to insert next conversation phase");
  }

  return mapToCurrentPhase(insertedNext.id, insertedNext.message_count, nextPhase);
}

export async function exitPhase(
  conversationPhaseId: string,
  reason: "converted" | "dropped" | "human_handoff"
): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("conversation_phases")
    .update({
      exited_at: new Date().toISOString(),
      exit_reason: reason,
    })
    .eq("id", conversationPhaseId);
}

export async function incrementMessageCount(
  conversationPhaseId: string
): Promise<void> {
  const supabase = createServiceClient();
  const { data: current } = await supabase
    .from("conversation_phases")
    .select("message_count")
    .eq("id", conversationPhaseId)
    .single();

  if (current) {
    await supabase
      .from("conversation_phases")
      .update({ message_count: current.message_count + 1 })
      .eq("id", conversationPhaseId);
  }
}
```

- [ ] **Step 2: Update conversation-engine.ts**

In `src/lib/ai/conversation-engine.ts`, make these changes:

1. Add `leadId` to `EngineInput`:
```typescript
export interface EngineInput {
  tenantId: string;
  leadId: string;          // ← add this
  businessName: string;
  conversationId: string;
  leadMessage: string;
  leadMessageId?: string;
}
```

2. Import `getOrAssignCampaign`:
```typescript
import { getOrAssignCampaign } from "@/lib/ai/campaign-assignment";
```

3. After the human handoff gate check and before Step 1 (`getCurrentPhase`), add campaign assignment:
```typescript
  // Step 0: Get or assign campaign for this lead
  const campaignId = await getOrAssignCampaign(leadId, tenantId);
```

4. Update the `getCurrentPhase` call from:
```typescript
  const currentPhase = await getCurrentPhase(conversationId, tenantId);
```
to:
```typescript
  const currentPhase = await getCurrentPhase(conversationId, campaignId);
```

5. Find the `advancePhase` call (it's inside the decision handling logic) and change from:
```typescript
  await advancePhase(conversationId, tenantId);
```
to:
```typescript
  await advancePhase(conversationId, campaignId);
```

6. Update the FB webhook route (`src/app/api/fb/webhook/route.ts`) to pass `leadId` in the `EngineInput` when calling `handleMessage`. Find the existing `handleMessage` call and add `leadId: lead.id` to the input object.

- [ ] **Step 3: Run existing tests to verify nothing is broken**

Run: `npm test -- tests/unit/`
Expected: Some tests related to phase-machine and conversation-engine may need mock updates. Fix the test mocks to use `campaign_phases` instead of `bot_flow_phases` and pass `campaignId` instead of `tenantId` to `getCurrentPhase`/`advancePhase`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/phase-machine.ts src/lib/ai/conversation-engine.ts src/app/api/fb/webhook/route.ts
git commit -m "feat: wire conversation engine to use campaign phases"
```

---

## Task 9: Conversion Detection

**Files:**
- Create: `src/lib/ai/conversion-detector.ts`
- Create: `tests/unit/conversion-detector.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/conversion-detector.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

describe("detectConversion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("records conversion when event type matches campaign goal", async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });
    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "lead_campaign_assignments") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { campaign_id: "camp-1" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "campaigns") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "camp-1", goal: "form_submit", goal_config: {} },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "campaign_conversions") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
              }),
            }),
          }),
          insert: insertFn,
        };
      }
      if (table === "conversation_phases") {
        return { update: updateFn };
      }
      return {};
    });

    const { detectConversion } = await import("@/lib/ai/conversion-detector");
    const result = await detectConversion("lead-1", "form_submit", {});

    expect(result).toBe(true);
    expect(insertFn).toHaveBeenCalled();
  });

  it("returns false when event type does not match campaign goal", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "lead_campaign_assignments") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { campaign_id: "camp-1" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "campaigns") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "camp-1", goal: "purchase", goal_config: {} },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const { detectConversion } = await import("@/lib/ai/conversion-detector");
    const result = await detectConversion("lead-1", "form_submit", {});

    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/conversion-detector.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/ai/conversion-detector.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/service";

const GOAL_EVENT_MAP: Record<string, string> = {
  form_submit: "form_submit",
  appointment_booked: "appointment_booked",
  purchase: "purchase",
  stage_reached: "stage_changed",
};

export async function detectConversion(
  leadId: string,
  eventType: string,
  eventPayload: Record<string, unknown>
): Promise<boolean> {
  const supabase = createServiceClient();

  // Get lead's campaign assignment
  const { data: assignment } = await supabase
    .from("lead_campaign_assignments")
    .select("campaign_id")
    .eq("lead_id", leadId)
    .single();

  if (!assignment) return false;

  // Get campaign goal
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, goal, goal_config")
    .eq("id", assignment.campaign_id)
    .single();

  if (!campaign) return false;

  // Check if event matches campaign goal
  const expectedEvent = GOAL_EVENT_MAP[campaign.goal];
  if (eventType !== expectedEvent) return false;

  // For stage_reached, check that the target stage matches
  if (campaign.goal === "stage_reached") {
    const targetStageId = (campaign.goal_config as Record<string, unknown>)?.stage_id;
    if (targetStageId && eventPayload?.stage_id !== targetStageId) return false;
  }

  // Check if already converted (idempotent)
  const { data: existing } = await supabase
    .from("campaign_conversions")
    .select("id")
    .eq("campaign_id", campaign.id)
    .eq("lead_id", leadId)
    .single();

  if (existing) return false;

  // Record conversion
  await supabase.from("campaign_conversions").insert({
    campaign_id: campaign.id,
    lead_id: leadId,
    metadata: eventPayload,
  });

  // Mark open conversation phase as converted
  await supabase
    .from("conversation_phases")
    .update({
      exited_at: new Date().toISOString(),
      exit_reason: "converted",
    })
    .eq("phase_id", leadId) // We need to join through conversations...
    .is("exited_at", null);

  return true;
}
```

> **Note for implementer:** The last query (marking conversation phase as converted) needs to find the open phase for this lead's conversation. The correct approach is:
> 1. Query `conversations` for this `lead_id` to get `conversation_id`
> 2. Then update `conversation_phases` where `conversation_id` matches and `exited_at IS NULL`
>
> Update the implementation to:
> ```typescript
>   // Find lead's active conversation
>   const { data: conv } = await supabase
>     .from("conversations")
>     .select("id")
>     .eq("lead_id", leadId)
>     .limit(1)
>     .single();
>
>   if (conv) {
>     await supabase
>       .from("conversation_phases")
>       .update({ exited_at: new Date().toISOString(), exit_reason: "converted" })
>       .eq("conversation_id", conv.id)
>       .is("exited_at", null);
>   }
> ```

- [ ] **Step 4: Hook conversion detection into the webhook**

In `src/app/api/fb/webhook/route.ts`, after each `lead_events` insert for actionable events (`form_submit`, `appointment_booked`, `purchase`, `stage_changed`), call:

```typescript
import { detectConversion } from "@/lib/ai/conversion-detector";

// After the lead_event insert:
await detectConversion(lead.id, eventType, eventPayload);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/unit/conversion-detector.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/conversion-detector.ts tests/unit/conversion-detector.test.ts src/app/api/fb/webhook/route.ts
git commit -m "feat: add conversion detection and tracking"
```

---

## Task 10: Campaign Metrics API

**Files:**
- Create: `src/app/api/campaigns/[id]/metrics/route.ts`
- Create: `tests/unit/campaigns-metrics-api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/campaigns-metrics-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mockGetUser } })
  ),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

const params = Promise.resolve({ id: "camp-1" });

describe("GET /api/campaigns/[id]/metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });
    const { GET } = await import("@/app/api/campaigns/[id]/metrics/route");
    const req = new Request("http://localhost/api/campaigns/camp-1/metrics");
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/campaigns-metrics-api.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement metrics endpoint**

Create `src/app/api/campaigns/[id]/metrics/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

async function authenticate() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Unauthorized", status: 401 };
  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) return { error: "No tenant associated", status: 403 };
  return { tenantId };
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: campaignId } = await context.params;
  const service = createServiceClient();

  // Get all phases for this campaign
  const { data: phases } = await service
    .from("campaign_phases")
    .select("id, name, order_index")
    .eq("campaign_id", campaignId)
    .eq("tenant_id", auth.tenantId)
    .order("order_index", { ascending: true });

  if (!phases) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Get per-phase metrics from conversation_phases
  const phaseMetrics = await Promise.all(
    phases.map(async (phase) => {
      const { data: cpRows } = await service
        .from("conversation_phases")
        .select("id, message_count, entered_at, exited_at, exit_reason")
        .eq("phase_id", phase.id);

      const rows = cpRows ?? [];
      const entered = rows.length;
      const advanced = rows.filter(
        (r) => r.exit_reason === "advanced" || r.exit_reason === "converted"
      ).length;
      const dropped = rows.filter((r) => r.exit_reason === "dropped").length;
      const exitedRows = rows.filter((r) => r.exited_at);
      const avgMessages =
        entered > 0
          ? rows.reduce((sum, r) => sum + r.message_count, 0) / entered
          : 0;
      const avgTimeMs =
        exitedRows.length > 0
          ? exitedRows.reduce(
              (sum, r) =>
                sum +
                (new Date(r.exited_at!).getTime() -
                  new Date(r.entered_at).getTime()),
              0
            ) / exitedRows.length
          : 0;

      return {
        phase_id: phase.id,
        name: phase.name,
        order_index: phase.order_index,
        entered,
        advanced,
        dropped,
        in_progress: entered - advanced - dropped,
        success_rate: entered > 0 ? advanced / entered : 0,
        avg_messages: Math.round(avgMessages * 10) / 10,
        avg_time_minutes: Math.round(avgTimeMs / 60000),
      };
    })
  );

  // Campaign-level metrics
  const { data: totalLeadsData } = await service
    .from("lead_campaign_assignments")
    .select("id", { count: "exact" })
    .eq("campaign_id", campaignId);

  const { data: conversionsData } = await service
    .from("campaign_conversions")
    .select("id", { count: "exact" })
    .eq("campaign_id", campaignId);

  const totalLeads = totalLeadsData?.length ?? 0;
  const totalConversions = conversionsData?.length ?? 0;

  // Find highest drop-off phase
  const highestDropOff = phaseMetrics.reduce(
    (max, p) => {
      const dropRate = p.entered > 0 ? p.dropped / p.entered : 0;
      return dropRate > max.rate ? { name: p.name, rate: dropRate } : max;
    },
    { name: "", rate: 0 }
  );

  return NextResponse.json({
    summary: {
      total_leads: totalLeads,
      total_conversions: totalConversions,
      conversion_rate: totalLeads > 0 ? totalConversions / totalLeads : 0,
      highest_drop_off: highestDropOff.name || null,
      highest_drop_off_rate: highestDropOff.rate,
    },
    phases: phaseMetrics,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/campaigns-metrics-api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/campaigns/\[id\]/metrics/ tests/unit/campaigns-metrics-api.test.ts
git commit -m "feat: add campaign metrics API with phase funnel stats"
```

---

## Task 11: Nav Update + Campaign List Page

**Files:**
- Modify: `src/components/dashboard/DashboardNav.tsx`
- Create: `src/components/dashboard/campaigns/CampaignCard.tsx`
- Create: `src/hooks/useCampaigns.ts`
- Create: `src/app/(tenant)/app/campaigns/page.tsx`
- Create: `src/app/(tenant)/app/campaigns/CampaignsClient.tsx`

- [ ] **Step 1: Add Campaigns nav item**

In `src/components/dashboard/DashboardNav.tsx`, add `Target` icon import and the Campaigns nav item:

```typescript
import {
  Home,
  MessageSquare,
  Users,
  Bot,
  Link2,
  Zap,
  Settings,
  Menu,
  X,
  Target,     // ← add
} from "lucide-react";
```

Add Campaigns to the NAV_ITEMS array, after Bot:

```typescript
const NAV_ITEMS: NavItem[] = [
  { href: "/app", label: "Home", icon: Home, exact: true },
  { href: "/app/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/app/leads", label: "Leads", icon: Users },
  { href: "/app/bot", label: "Bot", icon: Bot },
  { href: "/app/campaigns", label: "Campaigns", icon: Target },  // ← add
  { href: "/app/actions", label: "Actions", icon: Link2 },
  { href: "/app/workflows", label: "Workflows", icon: Zap },
];
```

- [ ] **Step 2: Create useCampaigns hook**

Create `src/hooks/useCampaigns.ts`:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";

export interface Campaign {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  goal: string;
  goal_config: Record<string, unknown>;
  is_primary: boolean;
  status: string;
  follow_up_delay_minutes: number;
  follow_up_message: string | null;
  created_at: string;
  updated_at: string;
}

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch("/api/campaigns");
      if (!res.ok) {
        setError("Failed to fetch campaigns");
        return;
      }
      const data = await res.json();
      setCampaigns(data.campaigns);
      setError(null);
    } catch {
      setError("Failed to fetch campaigns");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const createCampaign = useCallback(
    async (input: { name: string; goal: string; description?: string }) => {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to create campaign");
      const data = await res.json();
      await fetchCampaigns();
      return data.campaign;
    },
    [fetchCampaigns]
  );

  const deleteCampaign = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete campaign");
      await fetchCampaigns();
    },
    [fetchCampaigns]
  );

  return { campaigns, loading, error, createCampaign, deleteCampaign, refetch: fetchCampaigns };
}
```

- [ ] **Step 3: Create CampaignCard component**

Create `src/components/dashboard/campaigns/CampaignCard.tsx`:

```typescript
"use client";

import Link from "next/link";
import { Target, ChevronRight } from "lucide-react";
import Badge from "@/components/ui/Badge";

interface CampaignCardProps {
  id: string;
  name: string;
  goal: string;
  status: string;
  isPrimary: boolean;
  phaseCount?: number;
  conversionRate?: number;
  leadCount?: number;
}

const GOAL_LABELS: Record<string, string> = {
  form_submit: "Form Submitted",
  appointment_booked: "Appointment Booked",
  purchase: "Purchase",
  stage_reached: "Stage Reached",
};

const STATUS_COLORS: Record<string, "default" | "success" | "warning" | "danger"> = {
  draft: "default",
  active: "success",
  paused: "warning",
  archived: "danger",
};

export default function CampaignCard({
  id,
  name,
  goal,
  status,
  isPrimary,
  conversionRate,
  leadCount,
}: CampaignCardProps) {
  return (
    <Link href={`/app/campaigns/${id}`}>
      <div
        className={`rounded-lg border p-4 transition-colors hover:border-[var(--ws-accent)] ${
          isPrimary
            ? "border-2 border-[var(--ws-accent)] bg-[var(--ws-accent-subtle)]"
            : "border-[var(--ws-border)]"
        }`}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--ws-accent-subtle)]">
              <Target className="h-4 w-4 text-[var(--ws-accent)]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[var(--ws-text-primary)]">{name}</h3>
                {isPrimary && <Badge variant="default">PRIMARY</Badge>}
                <Badge variant={STATUS_COLORS[status] ?? "default"}>
                  {status.toUpperCase()}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-[var(--ws-text-muted)]">
                Goal: {GOAL_LABELS[goal] ?? goal}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {conversionRate !== undefined && (
              <div className="text-right">
                <div className="text-lg font-bold text-[var(--ws-success)]">
                  {Math.round(conversionRate * 100)}%
                </div>
                <div className="text-[10px] text-[var(--ws-text-muted)]">conversion</div>
              </div>
            )}
            {leadCount !== undefined && (
              <div className="text-right">
                <div className="text-lg font-bold text-[var(--ws-text-primary)]">{leadCount}</div>
                <div className="text-[10px] text-[var(--ws-text-muted)]">leads</div>
              </div>
            )}
            <ChevronRight className="h-4 w-4 text-[var(--ws-text-muted)]" />
          </div>
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: Create CampaignsClient page component**

Create `src/app/(tenant)/app/campaigns/CampaignsClient.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Plus, FlaskConical } from "lucide-react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import CampaignCard from "@/components/dashboard/campaigns/CampaignCard";
import { useCampaigns } from "@/hooks/useCampaigns";

export default function CampaignsClient() {
  const { campaigns, loading, error } = useCampaigns();

  if (loading) {
    return (
      <div className="p-6 pt-14 md:pt-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-[var(--ws-border)]" />
          <div className="h-24 rounded-lg bg-[var(--ws-border)]" />
          <div className="h-24 rounded-lg bg-[var(--ws-border)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 pt-14 md:pt-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--ws-text-primary)]">Campaigns</h1>
          <p className="mt-1 text-sm text-[var(--ws-text-muted)]">
            Manage your conversation campaigns and A/B tests
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/app/campaigns/experiments">
            <Button variant="secondary">
              <FlaskConical className="h-4 w-4" />
              Experiments
            </Button>
          </Link>
          <Link href="/app/campaigns/new">
            <Button variant="primary">
              <Plus className="h-4 w-4" />
              New Campaign
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      {campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Create your first campaign to start building conversation flows"
          action={
            <Link href="/app/campaigns/new">
              <Button variant="primary">
                <Plus className="h-4 w-4" />
                Create Campaign
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {campaigns.map((camp) => (
            <CampaignCard
              key={camp.id}
              id={camp.id}
              name={camp.name}
              goal={camp.goal}
              status={camp.status}
              isPrimary={camp.is_primary}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create server page**

Create `src/app/(tenant)/app/campaigns/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { requireTenantContext } from "@/lib/queries/tenant";
import CampaignsClient from "./CampaignsClient";

export default async function CampaignsPage() {
  try {
    await requireTenantContext();
  } catch {
    redirect("/login");
  }

  return <CampaignsClient />;
}
```

- [ ] **Step 6: Remove Flow Builder tab from BotClient**

In `src/app/(tenant)/app/bot/BotClient.tsx`:
- Remove the `{ id: "flow", label: "Flow Builder", icon: GitBranch }` entry from the `TABS` array
- Remove the `FlowPanel` import and its usage in the tab content rendering
- Remove the `GitBranch` import if no longer used

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/DashboardNav.tsx src/hooks/useCampaigns.ts \
  src/components/dashboard/campaigns/CampaignCard.tsx \
  src/app/\(tenant\)/app/campaigns/page.tsx \
  src/app/\(tenant\)/app/campaigns/CampaignsClient.tsx \
  src/app/\(tenant\)/app/bot/BotClient.tsx
git commit -m "feat: add campaigns nav, list page, and remove flow builder tab"
```

---

## Task 12: Campaign Editor — Flow + Settings Tabs

**Files:**
- Create: `src/hooks/useCampaignPhases.ts`
- Create: `src/components/dashboard/campaigns/CampaignFlowPanel.tsx`
- Create: `src/components/dashboard/campaigns/CampaignForm.tsx`
- Create: `src/app/(tenant)/app/campaigns/new/page.tsx`
- Create: `src/app/(tenant)/app/campaigns/[id]/page.tsx`
- Create: `src/app/(tenant)/app/campaigns/[id]/CampaignEditorClient.tsx`

- [ ] **Step 1: Create useCampaignPhases hook**

Create `src/hooks/useCampaignPhases.ts`:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";

export interface CampaignPhase {
  id: string;
  campaign_id: string;
  tenant_id: string;
  name: string;
  order_index: number;
  max_messages: number;
  system_prompt: string;
  tone: string | null;
  goals: string | null;
  transition_hint: string | null;
  action_button_ids: string[];
  image_attachment_ids: string[];
  created_at: string;
}

type CreateInput = {
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

type UpdateInput = Partial<Omit<CreateInput, "order_index">>;
type ReorderItem = { id: string; order_index: number };

export function useCampaignPhases(campaignId: string) {
  const [phases, setPhases] = useState<CampaignPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/campaigns/${campaignId}/phases`;

  const fetchPhases = useCallback(async () => {
    try {
      const res = await fetch(base);
      if (!res.ok) { setError("Failed to fetch phases"); return; }
      const data = await res.json();
      setPhases(data.phases);
      setError(null);
    } catch {
      setError("Failed to fetch phases");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => { fetchPhases(); }, [fetchPhases]);

  const createPhase = useCallback(async (input: CreateInput) => {
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error("Failed to create phase");
    await fetchPhases();
  }, [base, fetchPhases]);

  const updatePhase = useCallback(async (phaseId: string, input: UpdateInput) => {
    const res = await fetch(`${base}/${phaseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error("Failed to update phase");
    await fetchPhases();
  }, [base, fetchPhases]);

  const deletePhase = useCallback(async (phaseId: string) => {
    const res = await fetch(`${base}/${phaseId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete phase");
    await fetchPhases();
  }, [base, fetchPhases]);

  const reorderPhases = useCallback(async (items: ReorderItem[]) => {
    const res = await fetch(`${base}/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(items),
    });
    if (!res.ok) throw new Error("Failed to reorder");
    await fetchPhases();
  }, [base, fetchPhases]);

  return { phases, loading, error, createPhase, updatePhase, deletePhase, reorderPhases };
}
```

- [ ] **Step 2: Create CampaignFlowPanel**

Create `src/components/dashboard/campaigns/CampaignFlowPanel.tsx`:

```typescript
"use client";

import { useCampaignPhases } from "@/hooks/useCampaignPhases";
import PhaseList from "@/components/dashboard/flow/PhaseList";

export default function CampaignFlowPanel({ campaignId }: { campaignId: string }) {
  const {
    phases,
    loading,
    error,
    createPhase,
    updatePhase,
    deletePhase,
    reorderPhases,
  } = useCampaignPhases(campaignId);

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
    return <div className="animate-pulse h-40 rounded-lg bg-[var(--ws-border)]" />;
  }

  if (error) {
    return <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>;
  }

  return (
    <PhaseList
      phases={phases}
      onCreatePhase={handleCreatePhase}
      onUpdatePhase={updatePhase}
      onDeletePhase={deletePhase}
      onReorderPhases={reorderPhases}
    />
  );
}
```

> **Note for implementer:** Check if the existing `PhaseList` component accepts these props directly. If it reads from `useFlowPhases` internally, you'll need to refactor it to accept phases + callbacks as props (lifting state up). The existing `FlowPanel` was the one that used the hook — `PhaseList` likely already accepts props. Verify by reading `src/components/dashboard/flow/PhaseList.tsx`.

- [ ] **Step 3: Create CampaignForm (settings tab)**

Create `src/components/dashboard/campaigns/CampaignForm.tsx`:

```typescript
"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import type { Campaign } from "@/hooks/useCampaigns";

interface CampaignFormProps {
  campaign: Campaign;
  onSave: (updates: Partial<Campaign>) => Promise<void>;
}

const GOAL_OPTIONS = [
  { value: "form_submit", label: "Form Submitted" },
  { value: "appointment_booked", label: "Appointment Booked" },
  { value: "purchase", label: "Purchase Made" },
  { value: "stage_reached", label: "Pipeline Stage Reached" },
];

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
];

export default function CampaignForm({ campaign, onSave }: CampaignFormProps) {
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description ?? "");
  const [goal, setGoal] = useState(campaign.goal);
  const [status, setStatus] = useState(campaign.status);
  const [followUpDelay, setFollowUpDelay] = useState(campaign.follow_up_delay_minutes);
  const [followUpMessage, setFollowUpMessage] = useState(campaign.follow_up_message ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        name,
        description: description || null,
        goal: goal as Campaign["goal"],
        status: status as Campaign["status"],
        follow_up_delay_minutes: followUpDelay,
        follow_up_message: followUpMessage || null,
      });
    } finally {
      setSaving(false);
    }
  };

  const labelClass = "block text-sm font-medium text-[var(--ws-text-primary)] mb-1";
  const inputClass =
    "w-full rounded-lg border border-[var(--ws-border)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] focus:border-[var(--ws-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--ws-accent)]";

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <label className={labelClass}>Campaign Name</label>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div>
        <label className={labelClass}>Description</label>
        <textarea
          className={inputClass}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div>
        <label className={labelClass}>Conversion Goal</label>
        <select className={inputClass} value={goal} onChange={(e) => setGoal(e.target.value)}>
          {GOAL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Status</label>
        <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Follow-up Delay (minutes)</label>
        <input
          type="number"
          className={inputClass}
          value={followUpDelay}
          min={15}
          max={1440}
          onChange={(e) => setFollowUpDelay(Number(e.target.value))}
        />
        <p className="mt-1 text-xs text-[var(--ws-text-muted)]">
          Time to wait before sending a follow-up to a silent lead
        </p>
      </div>

      <div>
        <label className={labelClass}>Follow-up Message</label>
        <textarea
          className={inputClass}
          rows={3}
          value={followUpMessage}
          onChange={(e) => setFollowUpMessage(e.target.value)}
          placeholder="Hey! Just checking in — did you have any other questions?"
        />
      </div>

      {campaign.is_primary && (
        <div className="rounded-lg bg-[var(--ws-accent-subtle)] p-3">
          <Badge variant="default">PRIMARY CAMPAIGN</Badge>
          <p className="mt-1 text-xs text-[var(--ws-text-muted)]">
            All new leads are assigned to this campaign by default
          </p>
        </div>
      )}

      <Button variant="primary" onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Create CampaignEditorClient (tabbed editor)**

Create `src/app/(tenant)/app/campaigns/[id]/CampaignEditorClient.tsx`:

```typescript
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { GitBranch, Settings, BarChart3, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { clsx } from "clsx";
import CampaignFlowPanel from "@/components/dashboard/campaigns/CampaignFlowPanel";
import CampaignForm from "@/components/dashboard/campaigns/CampaignForm";
import type { Campaign } from "@/hooks/useCampaigns";

type Tab = "flow" | "settings" | "metrics";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "flow", label: "Flow", icon: GitBranch },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "metrics", label: "Metrics", icon: BarChart3 },
];

export default function CampaignEditorClient({
  campaign: initialCampaign,
}: {
  campaign: Campaign;
}) {
  const [tab, setTab] = useState<Tab>("flow");
  const [campaign, setCampaign] = useState(initialCampaign);
  const router = useRouter();

  const handleSave = useCallback(
    async (updates: Partial<Campaign>) => {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to save");
      const data = await res.json();
      setCampaign(data.campaign);
    },
    [campaign.id]
  );

  return (
    <div className="p-6 pt-14 md:pt-6">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/app/campaigns" className="text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-semibold text-[var(--ws-text-primary)]">{campaign.name}</h1>
      </div>

      <div className="mb-6 flex gap-0 border-b border-[var(--ws-border)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === t.id
                ? "border-b-2 border-[var(--ws-accent)] text-[var(--ws-accent)]"
                : "text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]"
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "flow" && <CampaignFlowPanel campaignId={campaign.id} />}
      {tab === "settings" && <CampaignForm campaign={campaign} onSave={handleSave} />}
      {tab === "metrics" && (
        <div className="text-sm text-[var(--ws-text-muted)]">
          Metrics will be added in the metrics task.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create editor server page**

Create `src/app/(tenant)/app/campaigns/[id]/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { requireTenantContext } from "@/lib/queries/tenant";
import { createServiceClient } from "@/lib/supabase/service";
import CampaignEditorClient from "./CampaignEditorClient";

export default async function CampaignEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    redirect("/login");
  }

  const { id } = await params;
  const supabase = createServiceClient();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .single();

  if (!campaign) {
    redirect("/app/campaigns");
  }

  return <CampaignEditorClient campaign={campaign} />;
}
```

- [ ] **Step 6: Create new campaign page**

Create `src/app/(tenant)/app/campaigns/new/page.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import Button from "@/components/ui/Button";

const GOAL_OPTIONS = [
  { value: "form_submit", label: "Form Submitted", description: "Track when leads submit a form" },
  { value: "appointment_booked", label: "Appointment Booked", description: "Track when leads book an appointment" },
  { value: "purchase", label: "Purchase Made", description: "Track when leads make a purchase" },
  { value: "stage_reached", label: "Stage Reached", description: "Track when leads reach a pipeline stage" },
];

export default function NewCampaignPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("form_submit");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, goal }),
      });
      if (!res.ok) { setError("Failed to create campaign"); return; }
      const data = await res.json();
      router.push(`/app/campaigns/${data.campaign.id}`);
    } catch {
      setError("Failed to create campaign");
    } finally {
      setCreating(false);
    }
  };

  const labelClass = "block text-sm font-medium text-[var(--ws-text-primary)] mb-1";
  const inputClass =
    "w-full rounded-lg border border-[var(--ws-border)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] focus:border-[var(--ws-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--ws-accent)]";

  return (
    <div className="p-6 pt-14 md:pt-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/app/campaigns" className="text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-semibold text-[var(--ws-text-primary)]">New Campaign</h1>
      </div>

      <div className="max-w-lg space-y-5">
        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

        <div>
          <label className={labelClass}>Campaign Name</label>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Booking Funnel" />
        </div>

        <div>
          <label className={labelClass}>Conversion Goal</label>
          <div className="space-y-2 mt-2">
            {GOAL_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  goal === opt.value ? "border-[var(--ws-accent)] bg-[var(--ws-accent-subtle)]" : "border-[var(--ws-border)]"
                }`}
              >
                <input
                  type="radio"
                  name="goal"
                  value={opt.value}
                  checked={goal === opt.value}
                  onChange={() => setGoal(opt.value)}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium text-[var(--ws-text-primary)]">{opt.label}</div>
                  <div className="text-xs text-[var(--ws-text-muted)]">{opt.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <Button variant="primary" onClick={handleCreate} disabled={creating}>
          {creating ? "Creating..." : "Create Campaign"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useCampaignPhases.ts \
  src/components/dashboard/campaigns/CampaignFlowPanel.tsx \
  src/components/dashboard/campaigns/CampaignForm.tsx \
  src/app/\(tenant\)/app/campaigns/new/ \
  src/app/\(tenant\)/app/campaigns/\[id\]/
git commit -m "feat: add campaign editor with flow and settings tabs"
```

---

## Task 13: Experiments UI

**Files:**
- Create: `src/hooks/useExperiments.ts`
- Create: `src/components/dashboard/campaigns/ExperimentCard.tsx`
- Create: `src/components/dashboard/campaigns/ExperimentDetail.tsx`
- Create: `src/app/(tenant)/app/campaigns/experiments/page.tsx`
- Create: `src/app/(tenant)/app/campaigns/experiments/ExperimentsClient.tsx`
- Create: `src/app/(tenant)/app/campaigns/experiments/new/page.tsx`
- Create: `src/app/(tenant)/app/campaigns/experiments/new/NewExperimentClient.tsx`
- Create: `src/app/(tenant)/app/campaigns/experiments/[id]/page.tsx`
- Create: `src/app/(tenant)/app/campaigns/experiments/[id]/ExperimentDetailClient.tsx`

- [ ] **Step 1: Create useExperiments hook**

Create `src/hooks/useExperiments.ts`:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";

export interface Experiment {
  id: string;
  tenant_id: string;
  name: string;
  status: string;
  min_sample_size: number;
  started_at: string | null;
  ended_at: string | null;
  winner_campaign_id: string | null;
  created_at: string;
  experiment_campaigns?: {
    campaign_id: string;
    weight: number;
    campaigns?: { id: string; name: string; status: string };
  }[];
}

export function useExperiments() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExperiments = useCallback(async () => {
    try {
      const res = await fetch("/api/experiments");
      if (!res.ok) { setError("Failed to fetch experiments"); return; }
      const data = await res.json();
      setExperiments(data.experiments);
      setError(null);
    } catch {
      setError("Failed to fetch experiments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchExperiments(); }, [fetchExperiments]);

  const createExperiment = useCallback(
    async (input: {
      name: string;
      campaigns: { campaign_id: string; weight: number }[];
      min_sample_size?: number;
    }) => {
      const res = await fetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to create experiment");
      const data = await res.json();
      await fetchExperiments();
      return data.experiment;
    },
    [fetchExperiments]
  );

  const updateExperiment = useCallback(
    async (id: string, updates: Partial<Experiment>) => {
      const res = await fetch(`/api/experiments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update experiment");
      await fetchExperiments();
    },
    [fetchExperiments]
  );

  const promoteWinner = useCallback(
    async (experimentId: string, winnerCampaignId: string) => {
      const res = await fetch(`/api/experiments/${experimentId}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winner_campaign_id: winnerCampaignId }),
      });
      if (!res.ok) throw new Error("Failed to promote winner");
      await fetchExperiments();
    },
    [fetchExperiments]
  );

  return { experiments, loading, error, createExperiment, updateExperiment, promoteWinner, refetch: fetchExperiments };
}
```

- [ ] **Step 2: Create experiments list page**

Create `src/app/(tenant)/app/campaigns/experiments/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { requireTenantContext } from "@/lib/queries/tenant";
import ExperimentsClient from "./ExperimentsClient";

export default async function ExperimentsPage() {
  try { await requireTenantContext(); } catch { redirect("/login"); }
  return <ExperimentsClient />;
}
```

Create `src/app/(tenant)/app/campaigns/experiments/ExperimentsClient.tsx`:

```typescript
"use client";

import { Plus, ArrowLeft } from "lucide-react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { useExperiments } from "@/hooks/useExperiments";

const STATUS_COLORS: Record<string, "default" | "success" | "warning" | "danger"> = {
  draft: "default",
  running: "success",
  paused: "warning",
  completed: "default",
};

export default function ExperimentsClient() {
  const { experiments, loading } = useExperiments();

  if (loading) {
    return (
      <div className="p-6 pt-14 md:pt-6 animate-pulse space-y-4">
        <div className="h-8 w-48 rounded bg-[var(--ws-border)]" />
        <div className="h-24 rounded-lg bg-[var(--ws-border)]" />
      </div>
    );
  }

  return (
    <div className="p-6 pt-14 md:pt-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/app/campaigns" className="text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-semibold text-[var(--ws-text-primary)]">Experiments</h1>
        </div>
        <Link href="/app/campaigns/experiments/new">
          <Button variant="primary">
            <Plus className="h-4 w-4" />
            New Experiment
          </Button>
        </Link>
      </div>

      {experiments.length === 0 ? (
        <EmptyState
          title="No experiments yet"
          description="A/B test your campaigns to find what converts best"
          action={
            <Link href="/app/campaigns/experiments/new">
              <Button variant="primary"><Plus className="h-4 w-4" /> Create Experiment</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {experiments.map((exp) => (
            <Link key={exp.id} href={`/app/campaigns/experiments/${exp.id}`}>
              <div className="rounded-lg border border-[var(--ws-border)] p-4 transition-colors hover:border-[var(--ws-accent)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-[var(--ws-text-primary)]">{exp.name}</h3>
                    <Badge variant={STATUS_COLORS[exp.status] ?? "default"}>
                      {exp.status.toUpperCase()}
                    </Badge>
                  </div>
                  <span className="text-xs text-[var(--ws-text-muted)]">
                    {exp.experiment_campaigns?.length ?? 0} variants
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create new experiment page**

Create `src/app/(tenant)/app/campaigns/experiments/new/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { requireTenantContext } from "@/lib/queries/tenant";
import NewExperimentClient from "./NewExperimentClient";

export default async function NewExperimentPage() {
  try { await requireTenantContext(); } catch { redirect("/login"); }
  return <NewExperimentClient />;
}
```

Create `src/app/(tenant)/app/campaigns/experiments/new/NewExperimentClient.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, X } from "lucide-react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { useCampaigns, type Campaign } from "@/hooks/useCampaigns";

interface Variant {
  campaign_id: string;
  weight: number;
}

export default function NewExperimentClient() {
  const router = useRouter();
  const { campaigns, loading: loadingCampaigns } = useCampaigns();
  const [name, setName] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableCampaigns = campaigns.filter(
    (c) => !variants.some((v) => v.campaign_id === c.id)
  );

  const addVariant = (campaignId: string) => {
    setVariants([...variants, { campaign_id: campaignId, weight: 50 }]);
  };

  const removeVariant = (index: number) => {
    setVariants(variants.filter((_, i) => i !== index));
  };

  const updateWeight = (index: number, weight: number) => {
    setVariants(variants.map((v, i) => (i === index ? { ...v, weight } : v)));
  };

  const handleCreate = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    if (variants.length < 2) { setError("At least 2 campaign variants required"); return; }

    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, campaigns: variants }),
      });
      if (!res.ok) { setError("Failed to create experiment"); return; }
      const data = await res.json();
      router.push(`/app/campaigns/experiments/${data.experiment.id}`);
    } catch {
      setError("Failed to create experiment");
    } finally {
      setCreating(false);
    }
  };

  const getCampaignName = (id: string) => campaigns.find((c) => c.id === id)?.name ?? id;

  const labelClass = "block text-sm font-medium text-[var(--ws-text-primary)] mb-1";
  const inputClass =
    "w-full rounded-lg border border-[var(--ws-border)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] focus:border-[var(--ws-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--ws-accent)]";

  return (
    <div className="p-6 pt-14 md:pt-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/app/campaigns/experiments" className="text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-semibold text-[var(--ws-text-primary)]">New Experiment</h1>
      </div>

      <div className="max-w-lg space-y-5">
        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

        <div>
          <label className={labelClass}>Experiment Name</label>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. July Booking Test" />
        </div>

        <div>
          <label className={labelClass}>Campaign Variants</label>
          <div className="space-y-2 mt-2">
            {variants.map((v, i) => (
              <div key={v.campaign_id} className="flex items-center gap-3 rounded-lg border border-[var(--ws-border)] p-3">
                <span className="flex-1 text-sm font-medium text-[var(--ws-text-primary)]">{getCampaignName(v.campaign_id)}</span>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-[var(--ws-text-muted)]">Weight:</label>
                  <input
                    type="number"
                    className="w-16 rounded border border-[var(--ws-border)] px-2 py-1 text-sm"
                    value={v.weight}
                    min={1}
                    max={100}
                    onChange={(e) => updateWeight(i, Number(e.target.value))}
                  />
                </div>
                <button onClick={() => removeVariant(i)} className="text-[var(--ws-text-muted)] hover:text-red-500">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}

            {availableCampaigns.length > 0 && variants.length < 4 && (
              <select
                className={inputClass}
                value=""
                onChange={(e) => { if (e.target.value) addVariant(e.target.value); }}
              >
                <option value="">+ Add campaign variant...</option>
                {availableCampaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <Button variant="primary" onClick={handleCreate} disabled={creating || variants.length < 2}>
          {creating ? "Creating..." : "Create Experiment"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create experiment detail page**

Create `src/app/(tenant)/app/campaigns/experiments/[id]/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { requireTenantContext } from "@/lib/queries/tenant";
import ExperimentDetailClient from "./ExperimentDetailClient";

export default async function ExperimentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try { await requireTenantContext(); } catch { redirect("/login"); }
  const { id } = await params;
  return <ExperimentDetailClient experimentId={id} />;
}
```

Create `src/app/(tenant)/app/campaigns/experiments/[id]/ExperimentDetailClient.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Trophy, Pause, Play } from "lucide-react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

interface ExperimentData {
  id: string;
  name: string;
  status: string;
  min_sample_size: number;
  started_at: string | null;
  ended_at: string | null;
  winner_campaign_id: string | null;
  experiment_campaigns: {
    campaign_id: string;
    weight: number;
    campaigns: { id: string; name: string; status: string };
  }[];
}

interface CampaignMetrics {
  campaign_id: string;
  leads: number;
  conversions: number;
  conversion_rate: number;
}

export default function ExperimentDetailClient({ experimentId }: { experimentId: string }) {
  const [experiment, setExperiment] = useState<ExperimentData | null>(null);
  const [metrics, setMetrics] = useState<CampaignMetrics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/experiments/${experimentId}`);
      if (res.ok) {
        const data = await res.json();
        setExperiment(data.experiment);

        // Load metrics for each campaign variant
        const metricsPromises = data.experiment.experiment_campaigns.map(
          async (ec: { campaign_id: string }) => {
            const mRes = await fetch(`/api/campaigns/${ec.campaign_id}/metrics`);
            if (mRes.ok) {
              const mData = await mRes.json();
              return {
                campaign_id: ec.campaign_id,
                leads: mData.summary.total_leads,
                conversions: mData.summary.total_conversions,
                conversion_rate: mData.summary.conversion_rate,
              };
            }
            return { campaign_id: ec.campaign_id, leads: 0, conversions: 0, conversion_rate: 0 };
          }
        );
        setMetrics(await Promise.all(metricsPromises));
      }
      setLoading(false);
    }
    load();
  }, [experimentId]);

  const handleStatusChange = async (newStatus: string) => {
    await fetch(`/api/experiments/${experimentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    // Reload
    const res = await fetch(`/api/experiments/${experimentId}`);
    if (res.ok) setExperiment((await res.json()).experiment);
  };

  const handlePromote = async (campaignId: string) => {
    await fetch(`/api/experiments/${experimentId}/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ winner_campaign_id: campaignId }),
    });
    const res = await fetch(`/api/experiments/${experimentId}`);
    if (res.ok) setExperiment((await res.json()).experiment);
  };

  if (loading || !experiment) {
    return <div className="p-6 pt-14 md:pt-6 animate-pulse"><div className="h-40 rounded-lg bg-[var(--ws-border)]" /></div>;
  }

  const bestVariant = metrics.reduce(
    (best, m) => (m.conversion_rate > best.conversion_rate ? m : best),
    metrics[0]
  );

  const allMeetSample = metrics.every((m) => m.leads >= experiment.min_sample_size);
  const bestIsSignificant =
    bestVariant &&
    metrics.every(
      (m) => m === bestVariant || bestVariant.conversion_rate > m.conversion_rate * 1.1
    );

  return (
    <div className="p-6 pt-14 md:pt-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/app/campaigns/experiments" className="text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-xl font-semibold text-[var(--ws-text-primary)]">{experiment.name}</h1>
          <Badge variant={experiment.status === "running" ? "success" : "default"}>
            {experiment.status.toUpperCase()}
          </Badge>
        </div>
        <div className="flex gap-2">
          {experiment.status === "draft" && (
            <Button variant="primary" onClick={() => handleStatusChange("running")}>
              <Play className="h-4 w-4" /> Start
            </Button>
          )}
          {experiment.status === "running" && (
            <>
              <Button variant="secondary" onClick={() => handleStatusChange("paused")}>
                <Pause className="h-4 w-4" /> Pause
              </Button>
              {bestVariant && (
                <Button variant="primary" onClick={() => handlePromote(bestVariant.campaign_id)}>
                  <Trophy className="h-4 w-4" /> Promote Winner
                </Button>
              )}
            </>
          )}
          {experiment.status === "paused" && (
            <Button variant="primary" onClick={() => handleStatusChange("running")}>
              <Play className="h-4 w-4" /> Resume
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-6">
        {experiment.experiment_campaigns.map((ec) => {
          const m = metrics.find((x) => x.campaign_id === ec.campaign_id);
          const isBest = bestVariant?.campaign_id === ec.campaign_id;
          return (
            <div
              key={ec.campaign_id}
              className={`rounded-lg border p-4 ${
                isBest ? "border-[var(--ws-success)] bg-green-50/50" : "border-[var(--ws-border)]"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-[var(--ws-text-primary)]">
                  {ec.campaigns?.name ?? ec.campaign_id}
                </h3>
                <span className="text-xs text-[var(--ws-text-muted)] bg-[var(--ws-border)] px-2 py-0.5 rounded">
                  {ec.weight}%
                </span>
              </div>
              <div className="text-2xl font-bold text-[var(--ws-text-primary)]">
                {m ? `${Math.round(m.conversion_rate * 100)}%` : "—"}
                <span className="text-sm font-normal text-[var(--ws-text-muted)] ml-1">conv.</span>
              </div>
              <div className="text-xs text-[var(--ws-text-muted)] mt-1">
                {m?.leads ?? 0} leads assigned · {m?.conversions ?? 0} conversions
              </div>
            </div>
          );
        })}
      </div>

      {allMeetSample && bestIsSignificant && experiment.status === "running" && (
        <div className="mt-4 rounded-lg border border-[var(--ws-success)] bg-green-50 p-4">
          <p className="text-sm text-[var(--ws-text-primary)]">
            <strong>Suggestion:</strong>{" "}
            {experiment.experiment_campaigns.find((ec) => ec.campaign_id === bestVariant?.campaign_id)?.campaigns?.name}{" "}
            is converting {Math.round(bestVariant!.conversion_rate * 100)}% — significantly better than other variants.
            All variants have reached the minimum sample size ({experiment.min_sample_size}).
            Consider promoting the winner.
          </p>
        </div>
      )}

      {!allMeetSample && experiment.status === "running" && (
        <div className="mt-4 rounded-lg border border-[var(--ws-border)] bg-[var(--ws-accent-subtle)] p-4">
          <p className="text-sm text-[var(--ws-text-muted)]">
            Waiting for all variants to reach minimum sample size ({experiment.min_sample_size} leads each).
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useExperiments.ts \
  src/app/\(tenant\)/app/campaigns/experiments/
git commit -m "feat: add experiments UI — list, create, detail, and promote winner"
```

---

## Task 14: Metrics Tab — Phase Funnel Component

**Files:**
- Create: `src/hooks/useCampaignMetrics.ts`
- Create: `src/components/dashboard/campaigns/PhaseMetricsFunnel.tsx`
- Modify: `src/app/(tenant)/app/campaigns/[id]/CampaignEditorClient.tsx`

- [ ] **Step 1: Create useCampaignMetrics hook**

Create `src/hooks/useCampaignMetrics.ts`:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";

export interface PhaseMetric {
  phase_id: string;
  name: string;
  order_index: number;
  entered: number;
  advanced: number;
  dropped: number;
  in_progress: number;
  success_rate: number;
  avg_messages: number;
  avg_time_minutes: number;
}

export interface CampaignSummary {
  total_leads: number;
  total_conversions: number;
  conversion_rate: number;
  highest_drop_off: string | null;
  highest_drop_off_rate: number;
}

export function useCampaignMetrics(campaignId: string) {
  const [summary, setSummary] = useState<CampaignSummary | null>(null);
  const [phases, setPhases] = useState<PhaseMetric[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/metrics`);
      if (!res.ok) return;
      const data = await res.json();
      setSummary(data.summary);
      setPhases(data.phases);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  return { summary, phases, loading, refetch: fetchMetrics };
}
```

- [ ] **Step 2: Create PhaseMetricsFunnel component**

Create `src/components/dashboard/campaigns/PhaseMetricsFunnel.tsx`:

```typescript
"use client";

import { useCampaignMetrics } from "@/hooks/useCampaignMetrics";

export default function PhaseMetricsFunnel({ campaignId }: { campaignId: string }) {
  const { summary, phases, loading } = useCampaignMetrics(campaignId);

  if (loading) {
    return <div className="animate-pulse space-y-3">
      {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-[var(--ws-border)]" />)}
    </div>;
  }

  if (!summary) return null;

  const maxDropOff = Math.max(...phases.map((p) => (p.entered > 0 ? p.dropped / p.entered : 0)));

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="rounded-lg bg-[var(--ws-page)] p-3 text-center">
          <div className="text-xl font-bold text-[var(--ws-text-primary)]">{summary.total_leads}</div>
          <div className="text-[11px] text-[var(--ws-text-muted)]">Total leads</div>
        </div>
        <div className="rounded-lg bg-[var(--ws-page)] p-3 text-center">
          <div className="text-xl font-bold text-[var(--ws-success)]">{Math.round(summary.conversion_rate * 100)}%</div>
          <div className="text-[11px] text-[var(--ws-text-muted)]">Conversion rate</div>
        </div>
        <div className="rounded-lg bg-[var(--ws-page)] p-3 text-center">
          <div className="text-xl font-bold text-[var(--ws-text-primary)]">{summary.total_conversions}</div>
          <div className="text-[11px] text-[var(--ws-text-muted)]">Conversions</div>
        </div>
        <div className="rounded-lg bg-[var(--ws-page)] p-3 text-center">
          <div className="text-xl font-bold text-amber-500">{summary.highest_drop_off ?? "—"}</div>
          <div className="text-[11px] text-[var(--ws-text-muted)]">Highest drop-off</div>
        </div>
      </div>

      {/* Phase funnel */}
      <h3 className="text-sm font-semibold text-[var(--ws-text-primary)] mb-3">Phase-by-Phase Funnel</h3>
      <div className="space-y-3">
        {phases.map((phase) => {
          const dropRate = phase.entered > 0 ? phase.dropped / phase.entered : 0;
          const isHighestDrop = dropRate === maxDropOff && dropRate > 0;

          return (
            <div key={phase.phase_id}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ws-accent)] text-[10px] font-bold text-white">
                    {phase.order_index + 1}
                  </span>
                  <span className="text-sm font-medium text-[var(--ws-text-primary)]">{phase.name}</span>
                  {isHighestDrop && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-600">
                      highest drop-off
                    </span>
                  )}
                </div>
                <div className="flex gap-4 text-xs text-[var(--ws-text-muted)]">
                  <span>{phase.entered} entered</span>
                  <span className="text-[var(--ws-success)]">{Math.round(phase.success_rate * 100)}% advanced</span>
                  <span className="text-red-500">{Math.round(dropRate * 100)}% dropped</span>
                  <span>avg {phase.avg_messages} msgs · {phase.avg_time_minutes}min</span>
                </div>
              </div>
              <div className="h-2 rounded-full bg-[var(--ws-border)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--ws-accent)] to-purple-400"
                  style={{ width: `${Math.round(phase.success_rate * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire metrics tab into CampaignEditorClient**

In `src/app/(tenant)/app/campaigns/[id]/CampaignEditorClient.tsx`, replace the metrics tab placeholder:

```typescript
// Add import at top:
import PhaseMetricsFunnel from "@/components/dashboard/campaigns/PhaseMetricsFunnel";

// Replace the metrics tab content from:
{tab === "metrics" && (
  <div className="text-sm text-[var(--ws-text-muted)]">
    Metrics will be added in the metrics task.
  </div>
)}

// To:
{tab === "metrics" && <PhaseMetricsFunnel campaignId={campaign.id} />}
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCampaignMetrics.ts \
  src/components/dashboard/campaigns/PhaseMetricsFunnel.tsx \
  src/app/\(tenant\)/app/campaigns/\[id\]/CampaignEditorClient.tsx
git commit -m "feat: add campaign metrics tab with phase funnel visualization"
```

---

## Task 15: Drop-off Scanner Cron

**Files:**
- Create: `src/app/api/cron/drop-off-scanner/route.ts`
- Create: `tests/unit/drop-off-scanner.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/drop-off-scanner.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

// Mock the FB send API
vi.mock("@/lib/fb/send", () => ({
  sendTextMessage: vi.fn().mockResolvedValue(undefined),
}));

describe("POST /api/cron/drop-off-scanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("rejects requests without cron secret", async () => {
    const { POST } = await import("@/app/api/cron/drop-off-scanner/route");
    const req = new Request("http://localhost/api/cron/drop-off-scanner", {
      method: "POST",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/drop-off-scanner.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the scanner**

Create `src/app/api/cron/drop-off-scanner/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  // Verify Vercel Cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Find conversation_phases that are open and past the follow-up delay
  // Step 1: Send follow-ups to leads who haven't been followed up yet
  const { data: needsFollowUp } = await supabase
    .from("conversation_phases")
    .select(`
      id,
      conversation_id,
      entered_at,
      follow_ups_sent_at,
      conversations!inner(
        id,
        lead_id,
        tenant_id,
        last_message_at,
        leads!inner(psid),
        tenants!inner(fb_page_token)
      )
    `)
    .is("exited_at", null)
    .is("follow_ups_sent_at", null);

  if (needsFollowUp) {
    for (const row of needsFollowUp) {
      const conv = row.conversations as unknown as {
        lead_id: string;
        tenant_id: string;
        last_message_at: string;
        leads: { psid: string };
        tenants: { fb_page_token: string };
      };

      // Get the campaign's follow-up config
      const { data: assignment } = await supabase
        .from("lead_campaign_assignments")
        .select("campaign_id, campaigns(follow_up_delay_minutes, follow_up_message)")
        .eq("lead_id", conv.lead_id)
        .single();

      if (!assignment?.campaigns) continue;

      const campaign = assignment.campaigns as unknown as {
        follow_up_delay_minutes: number;
        follow_up_message: string | null;
      };

      if (!campaign.follow_up_message) continue;

      const delayMs = campaign.follow_up_delay_minutes * 60 * 1000;
      const lastMessageTime = new Date(conv.last_message_at).getTime();
      const now = Date.now();

      if (now - lastMessageTime < delayMs) continue;

      // Send follow-up via FB
      try {
        const fbResponse = await fetch(
          `https://graph.facebook.com/v18.0/me/messages?access_token=${conv.tenants.fb_page_token}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipient: { id: conv.leads.psid },
              message: { text: campaign.follow_up_message },
            }),
          }
        );

        if (fbResponse.ok) {
          await supabase
            .from("conversation_phases")
            .update({ follow_ups_sent_at: new Date().toISOString() })
            .eq("id", row.id);
        }
      } catch {
        // Log but don't fail the whole cron
      }
    }
  }

  // Step 2: Mark as dropped if follow-up was sent and still no reply
  const { data: needsDrop } = await supabase
    .from("conversation_phases")
    .select(`
      id,
      follow_ups_sent_at,
      conversations!inner(
        lead_id,
        last_message_at
      )
    `)
    .is("exited_at", null)
    .not("follow_ups_sent_at", "is", null);

  if (needsDrop) {
    for (const row of needsDrop) {
      const conv = row.conversations as unknown as {
        lead_id: string;
        last_message_at: string;
      };

      const { data: assignment } = await supabase
        .from("lead_campaign_assignments")
        .select("campaigns(follow_up_delay_minutes)")
        .eq("lead_id", conv.lead_id)
        .single();

      if (!assignment?.campaigns) continue;

      const campaign = assignment.campaigns as unknown as { follow_up_delay_minutes: number };
      const delayMs = campaign.follow_up_delay_minutes * 60 * 1000;
      const followUpTime = new Date(row.follow_ups_sent_at!).getTime();
      const lastMessage = new Date(conv.last_message_at).getTime();

      // If still no reply after follow-up + delay, mark as dropped
      if (lastMessage < followUpTime && Date.now() - followUpTime > delayMs) {
        await supabase
          .from("conversation_phases")
          .update({
            exited_at: new Date().toISOString(),
            exit_reason: "dropped",
          })
          .eq("id", row.id);
      }
    }
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Add cron config**

Check if `vercel.json` exists. If so, add the cron entry. If not, create it:

```json
{
  "crons": [
    {
      "path": "/api/cron/drop-off-scanner",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

Add `CRON_SECRET` to `.env.local.example`:

```
CRON_SECRET=your-cron-secret-here
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/unit/drop-off-scanner.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/drop-off-scanner/ tests/unit/drop-off-scanner.test.ts vercel.json .env.local.example
git commit -m "feat: add drop-off scanner cron for follow-up messages"
```

---

## Task 16: Update CLAUDE.md and Obsidian

**Files:**
- Modify: `CLAUDE.md`
- Modify: `AI_PLAN.md`

- [ ] **Step 1: Update AI_PLAN.md with Phase 9**

Add the following after Phase 8 in `AI_PLAN.md`:

```markdown
---

## Phase 9: Campaign Flow Builder

- [ ] Create migration: campaigns, campaign_phases, lead_campaign_assignments, experiments, experiment_campaigns, campaign_conversions tables
- [ ] Create migration: data migration from bot_flow_phases → campaign_phases
- [ ] Update TypeScript database types
- [ ] Build `src/lib/ai/campaign-assignment.ts` — lead campaign assignment with weighted random
- [ ] Build `src/lib/ai/conversion-detector.ts` — conversion detection from lead events
- [ ] Build campaign CRUD API (`/api/campaigns/`)
- [ ] Build campaign phases API (`/api/campaigns/[id]/phases/`)
- [ ] Build experiments API (`/api/experiments/`)
- [ ] Build campaign metrics API (`/api/campaigns/[id]/metrics/`)
- [ ] Wire conversation engine to use campaign_phases + assignment
- [ ] Update phase machine to track exit_reason on phase transitions
- [ ] Add Campaigns nav item, campaign list page
- [ ] Build campaign editor (Flow / Settings / Metrics tabs)
- [ ] Build experiments UI (list, create, detail, promote winner)
- [ ] Build phase funnel metrics component
- [ ] Build drop-off scanner cron (`/api/cron/drop-off-scanner`)
- [ ] Remove Flow Builder tab from Bot page
- [ ] Unit tests: campaign assignment, conversion detector, all API routes
- [ ] E2E tests: create campaign → lead assigned → converts → metrics update
```

- [ ] **Step 2: Update CLAUDE.md**

In the **Core Concept: Messenger Funnel** section, add mention of campaigns:

```markdown
5. **Campaigns** — conversation flows are organized into campaigns, each with a conversion goal. Tenants can run A/B experiments across campaigns to find what converts best.
```

In the **Key Subsystems** section, add:

```markdown
- **Campaign System** — multi-campaign management with A/B experiments, per-phase success metrics, drop-off detection, and conversion tracking
```

- [ ] **Step 3: Update Obsidian knowledge graph (if feature-doc skill applies)**

Run the `feature-doc` skill to generate an Obsidian note for the campaign system.

- [ ] **Step 4: Commit**

```bash
git add AI_PLAN.md CLAUDE.md
git commit -m "docs: add Phase 9 campaign flow builder to AI plan and CLAUDE.md"
```

---

## Task 17: E2E Tests

**Files:**
- Create: `tests/e2e/campaigns.spec.ts`

- [ ] **Step 1: Write E2E test**

Create `tests/e2e/campaigns.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test.describe("Campaign Flow Builder", () => {
  test.beforeEach(async ({ page }) => {
    // Login flow — adjust to your test setup
    await page.goto("/login");
    // ... authenticate ...
  });

  test("can navigate to campaigns page", async ({ page }) => {
    await page.goto("/app/campaigns");
    await expect(page.getByRole("heading", { name: "Campaigns" })).toBeVisible();
  });

  test("can create a new campaign", async ({ page }) => {
    await page.goto("/app/campaigns/new");
    await page.fill('input[placeholder*="Main Booking"]', "Test Campaign");
    await page.click('text=Appointment Booked');
    await page.click('text=Create Campaign');
    await expect(page).toHaveURL(/\/app\/campaigns\/[a-f0-9-]+/);
  });

  test("can view campaign editor tabs", async ({ page }) => {
    await page.goto("/app/campaigns");
    await page.click("text=Default Campaign");
    await expect(page.getByRole("button", { name: "Flow" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Metrics" })).toBeVisible();
  });

  test("can navigate to experiments", async ({ page }) => {
    await page.goto("/app/campaigns/experiments");
    await expect(page.getByRole("heading", { name: "Experiments" })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run E2E tests**

Run: `npx playwright test tests/e2e/campaigns.spec.ts`
Expected: Tests pass (some may need auth setup adjustments)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/campaigns.spec.ts
git commit -m "test: add E2E tests for campaign flow builder"
```
