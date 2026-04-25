# Lead Management System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the existing lead system with multi-value contacts, AI-extracted key knowledge, stage history with duration tracking, and agent notes + AI summaries.

**Architecture:** Hybrid approach — `lead_contacts` table for phones/emails with type discriminator, plus dedicated `lead_knowledge`, `lead_stage_history`, and `lead_notes` tables. AI extraction hooks into the conversation engine post-processing. `moveLeadToStage()` becomes the single entry point for all stage transitions.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS), Zod validation, HuggingFace LLM (via existing llm-client), React (client components for profile panel)

**Spec:** `docs/superpowers/specs/2026-04-25-lead-management-design.md`

---

## File Structure

### New Files
- `supabase/migrations/0018_lead_management.sql` — Migration for new columns + 4 new tables + RLS
- `src/lib/leads/move-stage.ts` — `moveLeadToStage()` function (single entry point for stage changes)
- `src/lib/leads/knowledge-extractor.ts` — AI knowledge extraction from lead messages
- `src/lib/leads/key-normalizer.ts` — Canonical key mapping for knowledge entries
- `src/lib/leads/summary-generator.ts` — AI conversation summary generation
- `src/app/api/leads/[id]/route.ts` — GET (full profile) + PATCH (update lead)
- `src/app/api/leads/[id]/contacts/route.ts` — GET + POST contacts
- `src/app/api/leads/[id]/contacts/[contactId]/route.ts` — DELETE contact
- `src/app/api/leads/[id]/knowledge/route.ts` — GET + POST knowledge
- `src/app/api/leads/[id]/knowledge/[knowledgeId]/route.ts` — DELETE knowledge
- `src/app/api/leads/[id]/stage-history/route.ts` — GET stage history
- `src/app/api/leads/[id]/notes/route.ts` — GET + POST notes
- `src/components/dashboard/leads/ContactSection.tsx` — Contact info UI section
- `src/components/dashboard/leads/KnowledgeSection.tsx` — Key knowledge cards UI
- `src/components/dashboard/leads/StageHistoryTimeline.tsx` — Stage history vertical timeline
- `src/components/dashboard/leads/NotesSection.tsx` — Notes + AI summaries UI
- `tests/unit/move-stage.test.ts` — Tests for moveLeadToStage
- `tests/unit/knowledge-extractor.test.ts` — Tests for AI knowledge extraction
- `tests/unit/key-normalizer.test.ts` — Tests for key normalization
- `tests/unit/summary-generator.test.ts` — Tests for AI summary generation
- `tests/unit/lead-api.test.ts` — Tests for lead API routes
- `tests/unit/lead-contacts-api.test.ts` — Tests for contacts API routes
- `tests/unit/lead-knowledge-api.test.ts` — Tests for knowledge API routes
- `tests/unit/lead-notes-api.test.ts` — Tests for notes API routes
- `tests/unit/lead-stage-history-api.test.ts` — Tests for stage history API route

### Modified Files
- `src/types/database.ts` — Add new table types, enums, new columns on leads
- `src/lib/ai/conversation-engine.ts` — Hook in knowledge extraction + summary trigger
- `src/components/dashboard/LeadProfilePanel.tsx` — Enhanced layout with new sections
- `src/app/(tenant)/app/leads/LeadsClient.tsx` — Pass campaign filter, fetch profile via API
- `src/app/(tenant)/app/leads/page.tsx` — Pass campaign data to client

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/0018_lead_management.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0018_lead_management.sql`:

```sql
-- Add new columns to leads
ALTER TABLE leads ADD COLUMN first_name text;
ALTER TABLE leads ADD COLUMN last_name text;
ALTER TABLE leads ADD COLUMN campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL;

CREATE INDEX idx_leads_campaign_id ON leads(campaign_id);

-- Enum types for new tables
CREATE TYPE lead_contact_type AS ENUM ('phone', 'email');
CREATE TYPE lead_contact_source AS ENUM ('ai_extracted', 'manual', 'form_submit');
CREATE TYPE lead_knowledge_source AS ENUM ('ai_extracted', 'manual');
CREATE TYPE stage_actor_type AS ENUM ('ai', 'agent', 'automation');
CREATE TYPE lead_note_type AS ENUM ('agent_note', 'ai_summary');

-- lead_contacts table
CREATE TABLE lead_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type lead_contact_type NOT NULL,
  value text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  source lead_contact_source NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, lead_id, type, value)
);

CREATE INDEX idx_lead_contacts_lead ON lead_contacts(lead_id);
CREATE INDEX idx_lead_contacts_value ON lead_contacts(value);

ALTER TABLE lead_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON lead_contacts
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- lead_knowledge table
CREATE TABLE lead_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text NOT NULL,
  source lead_knowledge_source NOT NULL DEFAULT 'manual',
  extracted_from uuid REFERENCES messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, lead_id, key)
);

CREATE INDEX idx_lead_knowledge_lead ON lead_knowledge(lead_id);

ALTER TABLE lead_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON lead_knowledge
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- lead_stage_history table
CREATE TABLE lead_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_stage_id uuid REFERENCES stages(id) ON DELETE SET NULL,
  to_stage_id uuid NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  reason text NOT NULL,
  actor_type stage_actor_type NOT NULL,
  actor_id uuid,
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_stage_history_lead ON lead_stage_history(lead_id);
CREATE INDEX idx_lead_stage_history_created ON lead_stage_history(lead_id, created_at DESC);

ALTER TABLE lead_stage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON lead_stage_history
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- lead_notes table
CREATE TABLE lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type lead_note_type NOT NULL,
  content text NOT NULL,
  author_id uuid,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_notes_lead ON lead_notes(lead_id);

ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON lead_notes
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push` (or `npx supabase migration up` depending on local setup)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0018_lead_management.sql
git commit -m "feat: add lead management tables migration (contacts, knowledge, stage history, notes)"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `src/types/database.ts:65-76` (leads table) and add new table types

- [ ] **Step 1: Add new columns to the leads type**

In `src/types/database.ts`, update the `leads` TableRow (around line 65) to add the three new columns:

```typescript
      leads: TableRow<{
        id: string;
        tenant_id: string;
        psid: string;
        fb_name: string | null;
        fb_profile_pic: string | null;
        stage_id: string | null;
        page_id: string | null;
        first_name: string | null;
        last_name: string | null;
        campaign_id: string | null;
        tags: string[];
        created_at: string;
        last_active_at: string;
      }>;
```

- [ ] **Step 2: Add new table types after the `lead_events` type (after line 91)**

Add these four new table definitions inside the `Tables` object, after the `lead_events` entry:

```typescript
      lead_contacts: TableRow<{
        id: string;
        tenant_id: string;
        lead_id: string;
        type: "phone" | "email";
        value: string;
        is_primary: boolean;
        source: "ai_extracted" | "manual" | "form_submit";
        created_at: string;
      }>;
      lead_knowledge: TableRow<{
        id: string;
        tenant_id: string;
        lead_id: string;
        key: string;
        value: string;
        source: "ai_extracted" | "manual";
        extracted_from: string | null;
        created_at: string;
        updated_at: string;
      }>;
      lead_stage_history: TableRow<{
        id: string;
        tenant_id: string;
        lead_id: string;
        from_stage_id: string | null;
        to_stage_id: string;
        reason: string;
        actor_type: "ai" | "agent" | "automation";
        actor_id: string | null;
        duration_seconds: number | null;
        created_at: string;
      }>;
      lead_notes: TableRow<{
        id: string;
        tenant_id: string;
        lead_id: string;
        type: "agent_note" | "ai_summary";
        content: string;
        author_id: string | null;
        conversation_id: string | null;
        created_at: string;
      }>;
```

- [ ] **Step 3: Run type check**

Run: `npm run typecheck`
Expected: PASS (new types are additive, nothing references them yet)

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add lead management types (contacts, knowledge, stage history, notes)"
```

---

## Task 3: Key Normalizer Utility

**Files:**
- Create: `src/lib/leads/key-normalizer.ts`
- Test: `tests/unit/key-normalizer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/key-normalizer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { normalizeKey } from "@/lib/leads/key-normalizer";

describe("normalizeKey", () => {
  it("maps 'Business Type' to 'business'", () => {
    expect(normalizeKey("Business Type")).toBe("business");
  });

  it("maps 'company' to 'business'", () => {
    expect(normalizeKey("company")).toBe("business");
  });

  it("maps 'Company Name' to 'business'", () => {
    expect(normalizeKey("Company Name")).toBe("business");
  });

  it("maps 'phone number' to 'phone'", () => {
    expect(normalizeKey("phone number")).toBe("phone");
  });

  it("maps 'email address' to 'email'", () => {
    expect(normalizeKey("email address")).toBe("email");
  });

  it("maps 'Budget Range' to 'budget'", () => {
    expect(normalizeKey("Budget Range")).toBe("budget");
  });

  it("maps 'city' to 'location'", () => {
    expect(normalizeKey("city")).toBe("location");
  });

  it("maps 'first name' to 'first_name'", () => {
    expect(normalizeKey("first name")).toBe("first_name");
  });

  it("maps 'last name' to 'last_name'", () => {
    expect(normalizeKey("last name")).toBe("last_name");
  });

  it("passes through unknown keys in lowercase", () => {
    expect(normalizeKey("Favorite Color")).toBe("favorite color");
  });

  it("trims and lowercases input", () => {
    expect(normalizeKey("  BUDGET  ")).toBe("budget");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/key-normalizer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/leads/key-normalizer.ts`:

```typescript
/**
 * Maps common key variations to canonical keys for lead knowledge entries.
 * Unknown keys are returned lowercase and trimmed.
 */

const ALIASES: Record<string, string> = {
  // business
  "business": "business",
  "business type": "business",
  "business name": "business",
  "company": "business",
  "company name": "business",
  "industry": "business",
  // budget
  "budget": "budget",
  "budget range": "budget",
  "price range": "budget",
  "spending": "budget",
  // location
  "location": "location",
  "city": "location",
  "address": "location",
  "area": "location",
  "region": "location",
  // contact
  "phone": "phone",
  "phone number": "phone",
  "mobile": "phone",
  "contact number": "phone",
  "email": "email",
  "email address": "email",
  "e-mail": "email",
  // name
  "first name": "first_name",
  "first_name": "first_name",
  "given name": "first_name",
  "last name": "last_name",
  "last_name": "last_name",
  "surname": "last_name",
  "family name": "last_name",
  "name": "name",
  "full name": "name",
  // intent
  "intent": "intent",
  "goal": "intent",
  "looking for": "intent",
  "interested in": "intent",
};

export function normalizeKey(raw: string): string {
  const cleaned = raw.trim().toLowerCase();
  return ALIASES[cleaned] ?? cleaned;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/key-normalizer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/leads/key-normalizer.ts tests/unit/key-normalizer.test.ts
git commit -m "feat: add key normalizer for lead knowledge entries"
```

---

## Task 4: moveLeadToStage Function

**Files:**
- Create: `src/lib/leads/move-stage.ts`
- Test: `tests/unit/move-stage.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/move-stage.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the service client
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockSingle = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: mockFrom,
  }),
}));

// Chain builder helper
function chainBuilder(finalResult: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(finalResult);
  chain.maybeSingle = vi.fn().mockResolvedValue(finalResult);
  return chain;
}

import { moveLeadToStage } from "@/lib/leads/move-stage";

describe("moveLeadToStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts stage history and updates lead stage_id", async () => {
    // First call: lead_stage_history select (previous entry) — no previous
    const historySelect = chainBuilder({ data: null, error: null });
    // Second call: lead_stage_history insert
    const historyInsert = chainBuilder({ data: { id: "hist-1" }, error: null });
    // Third call: leads update
    const leadsUpdate = chainBuilder({ data: { id: "lead-1" }, error: null });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === "lead_stage_history" && callCount === 1) return historySelect;
      if (table === "lead_stage_history" && callCount === 2) return historyInsert;
      if (table === "leads") return leadsUpdate;
      return chainBuilder({ data: null, error: null });
    });

    await moveLeadToStage({
      tenantId: "tenant-1",
      leadId: "lead-1",
      fromStageId: null,
      toStageId: "stage-2",
      reason: "Lead qualified via form submission",
      actorType: "ai",
      actorId: null,
    });

    // Verify lead_stage_history was queried for previous entry
    expect(mockFrom).toHaveBeenCalledWith("lead_stage_history");
    // Verify leads table was updated
    expect(mockFrom).toHaveBeenCalledWith("leads");
  });

  it("computes duration_seconds from previous history entry", async () => {
    const pastDate = new Date(Date.now() - 3600 * 1000).toISOString(); // 1 hour ago
    const historySelect = chainBuilder({
      data: { created_at: pastDate },
      error: null,
    });
    const historyInsert = chainBuilder({ data: { id: "hist-2" }, error: null });
    const leadsUpdate = chainBuilder({ data: { id: "lead-1" }, error: null });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === "lead_stage_history" && callCount === 1) return historySelect;
      if (table === "lead_stage_history" && callCount === 2) return historyInsert;
      if (table === "leads") return leadsUpdate;
      return chainBuilder({ data: null, error: null });
    });

    await moveLeadToStage({
      tenantId: "tenant-1",
      leadId: "lead-1",
      fromStageId: "stage-1",
      toStageId: "stage-2",
      reason: "Agent moved manually",
      actorType: "agent",
      actorId: "user-1",
    });

    // The insert call should include duration_seconds ≈ 3600
    const insertCall = historyInsert.insert as ReturnType<typeof vi.fn>;
    expect(insertCall).toHaveBeenCalled();
    const insertedData = insertCall.mock.calls[0][0];
    expect(insertedData.duration_seconds).toBeGreaterThanOrEqual(3590);
    expect(insertedData.duration_seconds).toBeLessThanOrEqual(3610);
    expect(insertedData.reason).toBe("Agent moved manually");
    expect(insertedData.actor_type).toBe("agent");
    expect(insertedData.actor_id).toBe("user-1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/move-stage.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/leads/move-stage.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/service";

export interface MoveStageParams {
  tenantId: string;
  leadId: string;
  fromStageId: string | null;
  toStageId: string;
  reason: string;
  actorType: "ai" | "agent" | "automation";
  actorId: string | null;
}

export async function moveLeadToStage(params: MoveStageParams): Promise<void> {
  const { tenantId, leadId, fromStageId, toStageId, reason, actorType, actorId } = params;
  const supabase = createServiceClient();

  // Look up the previous stage history entry to compute duration
  let durationSeconds: number | null = null;

  const { data: previousEntry } = await supabase
    .from("lead_stage_history")
    .select("created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previousEntry?.created_at) {
    const previousTime = new Date(previousEntry.created_at).getTime();
    durationSeconds = Math.round((Date.now() - previousTime) / 1000);
  }

  // Insert new stage history entry
  await supabase.from("lead_stage_history").insert({
    tenant_id: tenantId,
    lead_id: leadId,
    from_stage_id: fromStageId,
    to_stage_id: toStageId,
    reason,
    actor_type: actorType,
    actor_id: actorId,
    duration_seconds: durationSeconds,
  });

  // Update the lead's current stage
  await supabase
    .from("leads")
    .update({ stage_id: toStageId })
    .eq("id", leadId)
    .eq("tenant_id", tenantId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/move-stage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/leads/move-stage.ts tests/unit/move-stage.test.ts
git commit -m "feat: add moveLeadToStage with stage history and duration tracking"
```

---

## Task 5: Knowledge Extractor

**Files:**
- Create: `src/lib/leads/knowledge-extractor.ts`
- Test: `tests/unit/knowledge-extractor.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/knowledge-extractor.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM client
vi.mock("@/lib/ai/llm-client", () => ({
  generateResponse: vi.fn(),
}));

// Mock the supabase service client
const mockInsert = vi.fn().mockReturnValue({
  select: vi.fn().mockReturnValue({
    single: vi.fn().mockResolvedValue({ data: {}, error: null }),
  }),
});
const mockUpsert = vi.fn().mockResolvedValue({ data: {}, error: null });
const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
  }),
});
const mockFrom = vi.fn().mockImplementation((table: string) => {
  if (table === "lead_contacts") return { upsert: mockUpsert };
  if (table === "lead_knowledge") return { upsert: mockUpsert };
  if (table === "leads") return { update: mockUpdate };
  return { insert: mockInsert };
});

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: mockFrom }),
}));

import { generateResponse } from "@/lib/ai/llm-client";
import { extractKnowledge } from "@/lib/leads/knowledge-extractor";

const mockGenerateResponse = vi.mocked(generateResponse);

describe("extractKnowledge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts key-value pairs and upserts them", async () => {
    mockGenerateResponse.mockResolvedValue({
      content: JSON.stringify({
        knowledge: [
          { key: "business", value: "Bakery in Manila" },
          { key: "budget", value: "$5k per month" },
        ],
        contacts: [],
        first_name: null,
        last_name: null,
      }),
      finishReason: "stop",
    });

    await extractKnowledge({
      tenantId: "t-1",
      leadId: "l-1",
      messageText: "I run a bakery in Manila with about $5k monthly budget",
      messageId: "m-1",
    });

    expect(mockGenerateResponse).toHaveBeenCalledOnce();
    expect(mockFrom).toHaveBeenCalledWith("lead_knowledge");
  });

  it("extracts contact info and upserts into lead_contacts", async () => {
    mockGenerateResponse.mockResolvedValue({
      content: JSON.stringify({
        knowledge: [],
        contacts: [
          { type: "phone", value: "+639171234567" },
          { type: "email", value: "test@example.com" },
        ],
        first_name: null,
        last_name: null,
      }),
      finishReason: "stop",
    });

    await extractKnowledge({
      tenantId: "t-1",
      leadId: "l-1",
      messageText: "You can reach me at +639171234567 or test@example.com",
      messageId: "m-2",
    });

    expect(mockFrom).toHaveBeenCalledWith("lead_contacts");
  });

  it("updates leads table when first_name or last_name extracted", async () => {
    mockGenerateResponse.mockResolvedValue({
      content: JSON.stringify({
        knowledge: [],
        contacts: [],
        first_name: "Juan",
        last_name: "Dela Cruz",
      }),
      finishReason: "stop",
    });

    await extractKnowledge({
      tenantId: "t-1",
      leadId: "l-1",
      messageText: "Hi I'm Juan Dela Cruz",
      messageId: "m-3",
    });

    expect(mockFrom).toHaveBeenCalledWith("leads");
  });

  it("does not throw on LLM failure (best-effort)", async () => {
    mockGenerateResponse.mockRejectedValue(new Error("LLM down"));

    await expect(
      extractKnowledge({
        tenantId: "t-1",
        leadId: "l-1",
        messageText: "some message",
        messageId: "m-4",
      })
    ).resolves.not.toThrow();
  });

  it("does not throw on malformed JSON response", async () => {
    mockGenerateResponse.mockResolvedValue({
      content: "not json at all",
      finishReason: "stop",
    });

    await expect(
      extractKnowledge({
        tenantId: "t-1",
        leadId: "l-1",
        messageText: "some message",
        messageId: "m-5",
      })
    ).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/knowledge-extractor.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/leads/knowledge-extractor.ts`:

```typescript
import { generateResponse } from "@/lib/ai/llm-client";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeKey } from "@/lib/leads/key-normalizer";

export interface ExtractKnowledgeParams {
  tenantId: string;
  leadId: string;
  messageText: string;
  messageId: string | null;
}

interface ExtractionResult {
  knowledge: { key: string; value: string }[];
  contacts: { type: "phone" | "email"; value: string }[];
  first_name: string | null;
  last_name: string | null;
}

const EXTRACTION_PROMPT = `You are a data extraction assistant. Analyze the user's message and extract any key facts about them.

Return a JSON object with this exact structure:
{
  "knowledge": [{"key": "category", "value": "extracted fact"}],
  "contacts": [{"type": "phone"|"email", "value": "the number or address"}],
  "first_name": "their first name or null",
  "last_name": "their last name or null"
}

Categories for knowledge: business, budget, location, intent, preference, timeline, pain_point, or any other relevant category.

Only extract facts explicitly stated in the message. Do not infer or guess.
If nothing is extractable, return empty arrays and null names.`;

export async function extractKnowledge(params: ExtractKnowledgeParams): Promise<void> {
  const { tenantId, leadId, messageText, messageId } = params;

  try {
    const response = await generateResponse(EXTRACTION_PROMPT, messageText, {
      temperature: 0.1,
      maxTokens: 256,
      responseFormat: "json_object",
    });

    let parsed: ExtractionResult;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      console.warn("[knowledge-extractor] Failed to parse LLM response as JSON");
      return;
    }

    const supabase = createServiceClient();

    // Upsert knowledge entries
    if (parsed.knowledge?.length > 0) {
      const rows = parsed.knowledge.map((k) => ({
        tenant_id: tenantId,
        lead_id: leadId,
        key: normalizeKey(k.key),
        value: k.value,
        source: "ai_extracted" as const,
        extracted_from: messageId,
        updated_at: new Date().toISOString(),
      }));

      await supabase.from("lead_knowledge").upsert(rows, {
        onConflict: "tenant_id,lead_id,key",
      });
    }

    // Upsert contacts
    if (parsed.contacts?.length > 0) {
      const contactRows = parsed.contacts.map((c) => ({
        tenant_id: tenantId,
        lead_id: leadId,
        type: c.type,
        value: c.value,
        source: "ai_extracted" as const,
        is_primary: false,
      }));

      await supabase.from("lead_contacts").upsert(contactRows, {
        onConflict: "tenant_id,lead_id,type,value",
      });
    }

    // Update first_name / last_name on leads table
    if (parsed.first_name || parsed.last_name) {
      const updates: Record<string, string> = {};
      if (parsed.first_name) updates.first_name = parsed.first_name;
      if (parsed.last_name) updates.last_name = parsed.last_name;

      await supabase
        .from("leads")
        .update(updates)
        .eq("id", leadId)
        .eq("tenant_id", tenantId);
    }
  } catch (err) {
    console.warn("[knowledge-extractor] Extraction failed (non-blocking):", err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/knowledge-extractor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/leads/knowledge-extractor.ts tests/unit/knowledge-extractor.test.ts
git commit -m "feat: add AI knowledge extraction from lead messages"
```

---

## Task 6: Summary Generator

**Files:**
- Create: `src/lib/leads/summary-generator.ts`
- Test: `tests/unit/summary-generator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/summary-generator.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/llm-client", () => ({
  generateResponse: vi.fn(),
}));

const mockSelect = vi.fn();
const mockInsert = vi.fn().mockResolvedValue({ data: {}, error: null });
const mockEq = vi.fn();
const mockOrder = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "messages") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    { direction: "in", text: "Hi, I want to book an appointment", created_at: "2026-04-25T10:00:00Z" },
                    { direction: "out", text: "Sure! What time works for you?", created_at: "2026-04-25T10:01:00Z" },
                    { direction: "in", text: "Tomorrow at 2pm please", created_at: "2026-04-25T10:02:00Z" },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "lead_notes") {
        return { insert: mockInsert };
      }
      return {};
    }),
  }),
}));

import { generateResponse } from "@/lib/ai/llm-client";
import { generateLeadSummary } from "@/lib/leads/summary-generator";

const mockGenerateResponse = vi.mocked(generateResponse);

describe("generateLeadSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a summary and inserts into lead_notes", async () => {
    mockGenerateResponse.mockResolvedValue({
      content: "Lead wants to book an appointment for tomorrow at 2pm. Positive sentiment.",
      finishReason: "stop",
    });

    await generateLeadSummary({
      tenantId: "t-1",
      leadId: "l-1",
      conversationId: "c-1",
    });

    expect(mockGenerateResponse).toHaveBeenCalledOnce();
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "t-1",
        lead_id: "l-1",
        conversation_id: "c-1",
        type: "ai_summary",
      })
    );
  });

  it("does not throw on LLM failure (best-effort)", async () => {
    mockGenerateResponse.mockRejectedValue(new Error("LLM down"));

    await expect(
      generateLeadSummary({
        tenantId: "t-1",
        leadId: "l-1",
        conversationId: "c-1",
      })
    ).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/summary-generator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/leads/summary-generator.ts`:

```typescript
import { generateResponse } from "@/lib/ai/llm-client";
import { createServiceClient } from "@/lib/supabase/service";

export interface GenerateSummaryParams {
  tenantId: string;
  leadId: string;
  conversationId: string;
}

const SUMMARY_PROMPT = `You are a CRM assistant. Summarize the following conversation between a business chatbot and a lead.

Include:
- Key topics discussed
- Actions taken (buttons clicked, forms submitted, pages visited)
- Lead sentiment and intent signals
- Any commitments made (e.g., "will check back Thursday")
- Outcome: converted, still interested, dropped off, or needs follow-up

Be concise — 2-4 sentences max. Write in third person ("The lead...").`;

export async function generateLeadSummary(params: GenerateSummaryParams): Promise<void> {
  const { tenantId, leadId, conversationId } = params;

  try {
    const supabase = createServiceClient();

    // Fetch recent messages for this conversation
    const { data: messages, error } = await supabase
      .from("messages")
      .select("direction, text, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(50);

    if (error || !messages || messages.length === 0) return;

    // Format messages for the LLM
    const transcript = messages
      .map((m) => {
        const role = m.direction === "in" ? "Lead" : "Bot";
        return `${role}: ${m.text ?? "[attachment]"}`;
      })
      .join("\n");

    const response = await generateResponse(SUMMARY_PROMPT, transcript, {
      temperature: 0.3,
      maxTokens: 256,
      responseFormat: "text",
    });

    // Insert as AI summary note
    await supabase.from("lead_notes").insert({
      tenant_id: tenantId,
      lead_id: leadId,
      conversation_id: conversationId,
      type: "ai_summary",
      content: response.content,
    });
  } catch (err) {
    console.warn("[summary-generator] Summary generation failed (non-blocking):", err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/summary-generator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/leads/summary-generator.ts tests/unit/summary-generator.test.ts
git commit -m "feat: add AI conversation summary generator for leads"
```

---

## Task 7: Hook Extraction + Summary into Conversation Engine

**Files:**
- Modify: `src/lib/ai/conversation-engine.ts`

- [ ] **Step 1: Write a test for the integration**

This is an integration concern — the conversation engine already has tests. We verify the hook doesn't break existing behavior by running existing tests after the change.

- [ ] **Step 2: Add the knowledge extraction hook**

In `src/lib/ai/conversation-engine.ts`, add imports at the top (after existing imports, around line 10):

```typescript
import { extractKnowledge } from "@/lib/leads/knowledge-extractor";
import { generateLeadSummary } from "@/lib/leads/summary-generator";
```

Then, after the `handleMessage` function's Step 12 (increment message count, around line 246) and before Step 13 (apply hedging), add the extraction call. Insert this block:

```typescript
  // Step 12b: Extract knowledge from lead message (non-blocking)
  extractKnowledge({
    tenantId,
    leadId,
    messageText: leadMessage,
    messageId: leadMessageId ?? null,
  }).catch(() => {
    // Swallowed — extraction is best-effort
  });

  // Step 12c: Check for conversation idle gap and trigger summary
  const { data: lastMsg } = await supabase
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversationId)
    .neq("id", leadMessageId ?? "")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastMsg?.created_at) {
    const gap = Date.now() - new Date(lastMsg.created_at).getTime();
    const TEN_MINUTES_MS = 10 * 60 * 1000;
    if (gap >= TEN_MINUTES_MS) {
      generateLeadSummary({ tenantId, leadId, conversationId }).catch(() => {
        // Swallowed — summary is best-effort
      });
    }
  }
```

- [ ] **Step 3: Run existing conversation engine tests**

Run: `npm test -- tests/unit/conversation-engine.test.ts`
Expected: PASS (the new code is non-blocking fire-and-forget, existing mocks should handle new imports)

Note: If tests fail due to unmocked imports, add mocks for the new modules in the existing test file:
```typescript
vi.mock("@/lib/leads/knowledge-extractor", () => ({
  extractKnowledge: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/leads/summary-generator", () => ({
  generateLeadSummary: vi.fn().mockResolvedValue(undefined),
}));
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/conversation-engine.ts
git commit -m "feat: hook knowledge extraction and summary generation into conversation engine"
```

---

## Task 8: Lead Detail API Route (GET + PATCH)

**Files:**
- Create: `src/app/api/leads/[id]/route.ts`
- Test: `tests/unit/lead-api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/lead-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock resolveSession
vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(),
}));

// Build a mock supabase client that tracks calls
let mockDbCalls: { table: string; method: string; args: unknown[] }[] = [];

function createMockChain(table: string) {
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  const track = (method: string) => (...args: unknown[]) => {
    mockDbCalls.push({ table, method, args });
    return chain;
  };

  chain.select = track("select");
  chain.insert = track("insert");
  chain.update = track("update");
  chain.upsert = track("upsert");
  chain.eq = track("eq");
  chain.order = track("order");
  chain.limit = track("limit");
  chain.single = vi.fn().mockResolvedValue({
    data: { id: "lead-1", tenant_id: "t-1", fb_name: "Test Lead", first_name: null, last_name: null, stage_id: "s-1", campaign_id: null, psid: "123", page_id: null, tags: [], created_at: "2026-01-01", last_active_at: "2026-01-01", fb_profile_pic: null },
    error: null,
  });
  chain.maybeSingle = chain.single;

  return chain;
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => createMockChain(table),
  }),
}));

vi.mock("@/lib/leads/move-stage", () => ({
  moveLeadToStage: vi.fn().mockResolvedValue(undefined),
}));

import { resolveSession } from "@/lib/auth/session";
import { GET, PATCH } from "@/app/api/leads/[id]/route";

const mockResolveSession = vi.mocked(resolveSession);

describe("GET /api/leads/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbCalls = [];
  });

  it("returns 401 when unauthenticated", async () => {
    mockResolveSession.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/leads/lead-1"), {
      params: Promise.resolve({ id: "lead-1" }),
    });
    expect(response.status).toBe(401);
  });

  it("returns lead profile when authenticated", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u-1", tenantId: "t-1" });
    const response = await GET(new Request("http://localhost/api/leads/lead-1"), {
      params: Promise.resolve({ id: "lead-1" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.lead).toBeDefined();
    expect(body.lead.id).toBe("lead-1");
  });
});

describe("PATCH /api/leads/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbCalls = [];
  });

  it("returns 401 when unauthenticated", async () => {
    mockResolveSession.mockResolvedValue(null);
    const response = await PATCH(
      new Request("http://localhost/api/leads/lead-1", {
        method: "PATCH",
        body: JSON.stringify({ first_name: "John" }),
      }),
      { params: Promise.resolve({ id: "lead-1" }) }
    );
    expect(response.status).toBe(401);
  });

  it("returns 400 on invalid input", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u-1", tenantId: "t-1" });
    const response = await PATCH(
      new Request("http://localhost/api/leads/lead-1", {
        method: "PATCH",
        body: JSON.stringify({ first_name: 12345 }),
      }),
      { params: Promise.resolve({ id: "lead-1" }) }
    );
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/lead-api.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/app/api/leads/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
import { moveLeadToStage } from "@/lib/leads/move-stage";
import { z } from "zod";

const updateSchema = z.object({
  first_name: z.string().max(100).nullable().optional(),
  last_name: z.string().max(100).nullable().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  stage_id: z.string().uuid().optional(),
  stage_reason: z.string().min(1).max(500).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const { id } = await context.params;
  const service = createServiceClient();

  // Fetch lead + related data in parallel
  const [leadResult, contactsResult, knowledgeResult, historyResult, notesResult] =
    await Promise.all([
      service
        .from("leads")
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single(),
      service
        .from("lead_contacts")
        .select("*")
        .eq("lead_id", id)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true }),
      service
        .from("lead_knowledge")
        .select("*")
        .eq("lead_id", id)
        .eq("tenant_id", tenantId)
        .order("key", { ascending: true }),
      service
        .from("lead_stage_history")
        .select("*")
        .eq("lead_id", id)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50),
      service
        .from("lead_notes")
        .select("*")
        .eq("lead_id", id)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  if (leadResult.error || !leadResult.data) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json({
    lead: leadResult.data,
    contacts: contactsResult.data ?? [],
    knowledge: knowledgeResult.data ?? [],
    stageHistory: historyResult.data ?? [],
    notes: notesResult.data ?? [],
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId, userId } = session;

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
  const { stage_id, stage_reason, ...leadFields } = parsed.data;

  // Handle stage change through moveLeadToStage
  if (stage_id) {
    // Get current stage
    const { data: currentLead } = await service
      .from("leads")
      .select("stage_id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (currentLead && currentLead.stage_id !== stage_id) {
      await moveLeadToStage({
        tenantId,
        leadId: id,
        fromStageId: currentLead.stage_id,
        toStageId: stage_id,
        reason: stage_reason ?? "Stage changed by agent",
        actorType: "agent",
        actorId: userId,
      });
    }
  }

  // Update other lead fields if any
  if (Object.keys(leadFields).length > 0) {
    await service
      .from("leads")
      .update(leadFields)
      .eq("id", id)
      .eq("tenant_id", tenantId);
  }

  // Return updated lead
  const { data: lead } = await service
    .from("leads")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  return NextResponse.json({ lead });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/lead-api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/leads/[id]/route.ts tests/unit/lead-api.test.ts
git commit -m "feat: add lead detail API route (GET profile, PATCH update)"
```

---

## Task 9: Contacts API Routes

**Files:**
- Create: `src/app/api/leads/[id]/contacts/route.ts`
- Create: `src/app/api/leads/[id]/contacts/[contactId]/route.ts`
- Test: `tests/unit/lead-contacts-api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/lead-contacts-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(),
}));

const mockData = {
  contacts: [
    { id: "c-1", tenant_id: "t-1", lead_id: "l-1", type: "phone", value: "+639171234567", is_primary: true, source: "manual", created_at: "2026-01-01" },
  ],
};

function createMockChain() {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockResolvedValue({ data: mockData.contacts, error: null });
  chain.single = vi.fn().mockResolvedValue({ data: mockData.contacts[0], error: null });
  return chain;
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => createMockChain(),
  }),
}));

import { resolveSession } from "@/lib/auth/session";
import { GET, POST } from "@/app/api/leads/[id]/contacts/route";

const mockResolveSession = vi.mocked(resolveSession);

describe("GET /api/leads/[id]/contacts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockResolveSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "l-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns contacts when authenticated", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u-1", tenantId: "t-1" });
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "l-1" }),
    });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/leads/[id]/contacts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 on invalid type", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u-1", tenantId: "t-1" });
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ type: "fax", value: "123" }),
      }),
      { params: Promise.resolve({ id: "l-1" }) }
    );
    expect(res.status).toBe(400);
  });

  it("accepts valid phone contact", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u-1", tenantId: "t-1" });
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ type: "phone", value: "+639171234567" }),
      }),
      { params: Promise.resolve({ id: "l-1" }) }
    );
    expect(res.status).toBe(201);
  });

  it("accepts valid email contact", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u-1", tenantId: "t-1" });
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ type: "email", value: "test@example.com" }),
      }),
      { params: Promise.resolve({ id: "l-1" }) }
    );
    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/lead-contacts-api.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the contacts route**

Create `src/app/api/leads/[id]/contacts/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
import { z } from "zod";

const createContactSchema = z.object({
  type: z.enum(["phone", "email"]),
  value: z.string().min(1).max(200),
  is_primary: z.boolean().optional(),
}).refine(
  (data) => {
    if (data.type === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.value);
    if (data.type === "phone") return /^\+?[\d\s\-()]{7,20}$/.test(data.value);
    return true;
  },
  { message: "Invalid contact value for the given type" }
);

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const { id } = await context.params;
  const service = createServiceClient();

  const { data, error } = await service
    .from("lead_contacts")
    .select("*")
    .eq("lead_id", id)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
  return NextResponse.json({ contacts: data });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const { id } = await context.params;
  const body = await request.json();
  const parsed = createContactSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  const { data, error } = await service
    .from("lead_contacts")
    .insert({
      tenant_id: tenantId,
      lead_id: id,
      type: parsed.data.type,
      value: parsed.data.value,
      is_primary: parsed.data.is_primary ?? false,
      source: "manual",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
  return NextResponse.json({ contact: data }, { status: 201 });
}
```

- [ ] **Step 4: Write the contact delete route**

Create `src/app/api/leads/[id]/contacts/[contactId]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";

type RouteContext = { params: Promise<{ id: string; contactId: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const { contactId } = await context.params;
  const service = createServiceClient();

  const { error } = await service
    .from("lead_contacts")
    .delete()
    .eq("id", contactId)
    .eq("tenant_id", tenantId);

  if (error) return NextResponse.json({ error: "Failed to delete contact" }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/unit/lead-contacts-api.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/api/leads/[id]/contacts/ tests/unit/lead-contacts-api.test.ts
git commit -m "feat: add contacts API routes (GET, POST, DELETE)"
```

---

## Task 10: Knowledge API Routes

**Files:**
- Create: `src/app/api/leads/[id]/knowledge/route.ts`
- Create: `src/app/api/leads/[id]/knowledge/[knowledgeId]/route.ts`
- Test: `tests/unit/lead-knowledge-api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/lead-knowledge-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(),
}));

function createMockChain() {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.upsert = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockResolvedValue({ data: [], error: null });
  chain.single = vi.fn().mockResolvedValue({ data: { id: "k-1", key: "business", value: "Bakery" }, error: null });
  return chain;
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => createMockChain(),
  }),
}));

import { resolveSession } from "@/lib/auth/session";
import { GET, POST } from "@/app/api/leads/[id]/knowledge/route";

const mockResolveSession = vi.mocked(resolveSession);

describe("GET /api/leads/[id]/knowledge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockResolveSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "l-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns knowledge when authenticated", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u-1", tenantId: "t-1" });
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "l-1" }),
    });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/leads/[id]/knowledge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 on missing key", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u-1", tenantId: "t-1" });
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ value: "something" }),
      }),
      { params: Promise.resolve({ id: "l-1" }) }
    );
    expect(res.status).toBe(400);
  });

  it("accepts valid knowledge entry", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u-1", tenantId: "t-1" });
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ key: "business", value: "Bakery in Manila" }),
      }),
      { params: Promise.resolve({ id: "l-1" }) }
    );
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/lead-knowledge-api.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the knowledge routes**

Create `src/app/api/leads/[id]/knowledge/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
import { normalizeKey } from "@/lib/leads/key-normalizer";
import { z } from "zod";

const upsertKnowledgeSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().min(1).max(1000),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const { id } = await context.params;
  const service = createServiceClient();

  const { data, error } = await service
    .from("lead_knowledge")
    .select("*")
    .eq("lead_id", id)
    .eq("tenant_id", tenantId)
    .order("key", { ascending: true });

  if (error) return NextResponse.json({ error: "Failed to fetch knowledge" }, { status: 500 });
  return NextResponse.json({ knowledge: data });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const { id } = await context.params;
  const body = await request.json();
  const parsed = upsertKnowledgeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const canonicalKey = normalizeKey(parsed.data.key);

  const { data, error } = await service
    .from("lead_knowledge")
    .upsert(
      {
        tenant_id: tenantId,
        lead_id: id,
        key: canonicalKey,
        value: parsed.data.value,
        source: "manual",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,lead_id,key" }
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "Failed to save knowledge" }, { status: 500 });
  return NextResponse.json({ knowledge: data });
}
```

Create `src/app/api/leads/[id]/knowledge/[knowledgeId]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";

type RouteContext = { params: Promise<{ id: string; knowledgeId: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const { knowledgeId } = await context.params;
  const service = createServiceClient();

  const { error } = await service
    .from("lead_knowledge")
    .delete()
    .eq("id", knowledgeId)
    .eq("tenant_id", tenantId);

  if (error) return NextResponse.json({ error: "Failed to delete knowledge" }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/lead-knowledge-api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/leads/[id]/knowledge/ tests/unit/lead-knowledge-api.test.ts
git commit -m "feat: add knowledge API routes (GET, POST/upsert, DELETE)"
```

---

## Task 11: Stage History + Notes API Routes

**Files:**
- Create: `src/app/api/leads/[id]/stage-history/route.ts`
- Create: `src/app/api/leads/[id]/notes/route.ts`
- Test: `tests/unit/lead-stage-history-api.test.ts`
- Test: `tests/unit/lead-notes-api.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/lead-stage-history-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(),
}));

function createMockChain() {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockResolvedValue({ data: [], error: null });
  chain.limit = vi.fn().mockResolvedValue({ data: [], error: null });
  return chain;
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => createMockChain(),
  }),
}));

import { resolveSession } from "@/lib/auth/session";
import { GET } from "@/app/api/leads/[id]/stage-history/route";

const mockResolveSession = vi.mocked(resolveSession);

describe("GET /api/leads/[id]/stage-history", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockResolveSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "l-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns stage history when authenticated", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u-1", tenantId: "t-1" });
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "l-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stageHistory).toBeDefined();
  });
});
```

Create `tests/unit/lead-notes-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(),
}));

function createMockChain() {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockResolvedValue({ data: [], error: null });
  chain.limit = vi.fn().mockResolvedValue({ data: [], error: null });
  chain.single = vi.fn().mockResolvedValue({ data: { id: "n-1", content: "Test note" }, error: null });
  return chain;
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => createMockChain(),
  }),
}));

import { resolveSession } from "@/lib/auth/session";
import { GET, POST } from "@/app/api/leads/[id]/notes/route";

const mockResolveSession = vi.mocked(resolveSession);

describe("GET /api/leads/[id]/notes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockResolveSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "l-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns notes when authenticated", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u-1", tenantId: "t-1" });
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "l-1" }),
    });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/leads/[id]/notes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 on empty content", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u-1", tenantId: "t-1" });
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ content: "" }),
      }),
      { params: Promise.resolve({ id: "l-1" }) }
    );
    expect(res.status).toBe(400);
  });

  it("accepts valid note", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u-1", tenantId: "t-1" });
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ content: "Lead seems interested in premium plan" }),
      }),
      { params: Promise.resolve({ id: "l-1" }) }
    );
    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/lead-stage-history-api.test.ts tests/unit/lead-notes-api.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Write the stage history route**

Create `src/app/api/leads/[id]/stage-history/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const { id } = await context.params;
  const service = createServiceClient();

  const { data, error } = await service
    .from("lead_stage_history")
    .select("*")
    .eq("lead_id", id)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: "Failed to fetch stage history" }, { status: 500 });
  return NextResponse.json({ stageHistory: data });
}
```

- [ ] **Step 4: Write the notes route**

Create `src/app/api/leads/[id]/notes/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
import { z } from "zod";

const createNoteSchema = z.object({
  content: z.string().min(1).max(5000),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const { id } = await context.params;
  const service = createServiceClient();

  const { data, error } = await service
    .from("lead_notes")
    .select("*")
    .eq("lead_id", id)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
  return NextResponse.json({ notes: data });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId, userId } = session;

  const { id } = await context.params;
  const body = await request.json();
  const parsed = createNoteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  const { data, error } = await service
    .from("lead_notes")
    .insert({
      tenant_id: tenantId,
      lead_id: id,
      type: "agent_note",
      content: parsed.data.content,
      author_id: userId,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
  return NextResponse.json({ note: data }, { status: 201 });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/unit/lead-stage-history-api.test.ts tests/unit/lead-notes-api.test.ts`
Expected: PASS

Note: Fix the typo in the stage history test — `await response.json()` should be `await res.json()`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/leads/[id]/stage-history/ src/app/api/leads/[id]/notes/ tests/unit/lead-stage-history-api.test.ts tests/unit/lead-notes-api.test.ts
git commit -m "feat: add stage history and notes API routes"
```

---

## Task 12: UI — Contact Section Component

**Files:**
- Create: `src/components/dashboard/leads/ContactSection.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/dashboard/leads/ContactSection.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Phone, Mail, Plus, Trash2, Sparkles, Pencil, Globe } from "lucide-react";
import Badge from "@/components/ui/Badge";

interface Contact {
  id: string;
  type: "phone" | "email";
  value: string;
  is_primary: boolean;
  source: "ai_extracted" | "manual" | "form_submit";
}

const SOURCE_ICON = {
  ai_extracted: Sparkles,
  manual: Pencil,
  form_submit: Globe,
} as const;

const SOURCE_LABEL = {
  ai_extracted: "AI",
  manual: "Manual",
  form_submit: "Form",
} as const;

export default function ContactSection({
  contacts,
  leadId,
  onAdd,
  onDelete,
}: {
  contacts: Contact[];
  leadId: string;
  onAdd: (type: "phone" | "email", value: string) => Promise<void>;
  onDelete: (contactId: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState<"phone" | "email" | null>(null);
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);

  const phones = contacts.filter((c) => c.type === "phone");
  const emails = contacts.filter((c) => c.type === "email");

  async function handleAdd() {
    if (!adding || !newValue.trim()) return;
    setSaving(true);
    await onAdd(adding, newValue.trim());
    setNewValue("");
    setAdding(null);
    setSaving(false);
  }

  function renderContactList(items: Contact[], icon: typeof Phone) {
    const Icon = icon;
    return items.map((contact) => {
      const SourceIcon = SOURCE_ICON[contact.source];
      return (
        <div key={contact.id} className="flex items-center gap-2 py-1.5">
          <Icon className="h-3.5 w-3.5 text-[var(--ws-text-muted)]" />
          <span className="flex-1 text-sm text-[var(--ws-text-primary)]">
            {contact.value}
          </span>
          {contact.is_primary && (
            <Badge variant="default">Primary</Badge>
          )}
          <SourceIcon className="h-3 w-3 text-[var(--ws-text-muted)]" title={SOURCE_LABEL[contact.source]} />
          <button
            onClick={() => onDelete(contact.id)}
            className="rounded p-0.5 text-[var(--ws-text-muted)] hover:text-red-500"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      );
    });
  }

  return (
    <div className="border-b border-[var(--ws-border)] p-5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--ws-text-muted)] uppercase tracking-wide">
          Contact Info
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setAdding("phone")}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--ws-accent)] hover:bg-[var(--ws-accent-subtle)]"
          >
            <Plus className="h-3 w-3" /> Phone
          </button>
          <button
            onClick={() => setAdding("email")}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--ws-accent)] hover:bg-[var(--ws-accent-subtle)]"
          >
            <Plus className="h-3 w-3" /> Email
          </button>
        </div>
      </div>

      {phones.length > 0 && renderContactList(phones, Phone)}
      {emails.length > 0 && renderContactList(emails, Mail)}
      {phones.length === 0 && emails.length === 0 && !adding && (
        <p className="text-xs text-[var(--ws-text-muted)]">No contact info</p>
      )}

      {adding && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type={adding === "email" ? "email" : "tel"}
            placeholder={adding === "email" ? "email@example.com" : "+1234567890"}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="flex-1 rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-1.5 text-sm outline-none focus:border-[var(--ws-accent)]"
            autoFocus
          />
          <button
            onClick={handleAdd}
            disabled={saving || !newValue.trim()}
            className="rounded-lg bg-[var(--ws-accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {saving ? "..." : "Add"}
          </button>
          <button
            onClick={() => { setAdding(null); setNewValue(""); }}
            className="text-xs text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/leads/ContactSection.tsx
git commit -m "feat: add ContactSection component for lead profile"
```

---

## Task 13: UI — Knowledge Section Component

**Files:**
- Create: `src/components/dashboard/leads/KnowledgeSection.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/dashboard/leads/KnowledgeSection.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Brain, Plus, Trash2, Sparkles, Pencil } from "lucide-react";

interface KnowledgeEntry {
  id: string;
  key: string;
  value: string;
  source: "ai_extracted" | "manual";
}

export default function KnowledgeSection({
  knowledge,
  leadId,
  onAdd,
  onDelete,
}: {
  knowledge: KnowledgeEntry[];
  leadId: string;
  onAdd: (key: string, value: string) => Promise<void>;
  onDelete: (knowledgeId: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!newKey.trim() || !newValue.trim()) return;
    setSaving(true);
    await onAdd(newKey.trim(), newValue.trim());
    setNewKey("");
    setNewValue("");
    setAdding(false);
    setSaving(false);
  }

  return (
    <div className="border-b border-[var(--ws-border)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Brain className="h-3.5 w-3.5 text-[var(--ws-text-muted)]" />
          <span className="text-xs font-medium text-[var(--ws-text-muted)] uppercase tracking-wide">
            Key Knowledge
          </span>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--ws-accent)] hover:bg-[var(--ws-accent-subtle)]"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {knowledge.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {knowledge.map((entry) => (
            <div
              key={entry.id}
              className="group relative rounded-lg border border-[var(--ws-border)] p-2.5"
            >
              <div className="flex items-center gap-1 mb-0.5">
                <span className="text-[10px] font-medium text-[var(--ws-text-muted)] uppercase tracking-wider">
                  {entry.key}
                </span>
                {entry.source === "ai_extracted" ? (
                  <Sparkles className="h-2.5 w-2.5 text-amber-400" />
                ) : (
                  <Pencil className="h-2.5 w-2.5 text-[var(--ws-text-muted)]" />
                )}
              </div>
              <p className="text-sm text-[var(--ws-text-primary)] leading-snug">
                {entry.value}
              </p>
              <button
                onClick={() => onDelete(entry.id)}
                className="absolute top-1.5 right-1.5 hidden rounded p-0.5 text-[var(--ws-text-muted)] hover:text-red-500 group-hover:block"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        !adding && (
          <p className="text-xs text-[var(--ws-text-muted)]">
            No knowledge recorded yet
          </p>
        )
      )}

      {adding && (
        <div className="mt-2 space-y-2">
          <input
            placeholder="Key (e.g., Business, Budget)"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-1.5 text-sm outline-none focus:border-[var(--ws-accent)]"
            autoFocus
          />
          <input
            placeholder="Value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-1.5 text-sm outline-none focus:border-[var(--ws-accent)]"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving || !newKey.trim() || !newValue.trim()}
              className="rounded-lg bg-[var(--ws-accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {saving ? "..." : "Save"}
            </button>
            <button
              onClick={() => { setAdding(false); setNewKey(""); setNewValue(""); }}
              className="text-xs text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/leads/KnowledgeSection.tsx
git commit -m "feat: add KnowledgeSection component for lead profile"
```

---

## Task 14: UI — Stage History Timeline Component

**Files:**
- Create: `src/components/dashboard/leads/StageHistoryTimeline.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/dashboard/leads/StageHistoryTimeline.tsx`:

```tsx
"use client";

import { ArrowRight, Bot, User, Zap } from "lucide-react";

interface StageHistoryEntry {
  id: string;
  from_stage_id: string | null;
  to_stage_id: string;
  reason: string;
  actor_type: "ai" | "agent" | "automation";
  actor_id: string | null;
  duration_seconds: number | null;
  created_at: string;
}

interface StageInfo {
  id: string;
  name: string;
  color: string;
}

const ACTOR_ICON = {
  ai: Bot,
  agent: User,
  automation: Zap,
} as const;

const ACTOR_LABEL = {
  ai: "AI",
  agent: "Agent",
  automation: "Automation",
} as const;

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function StageHistoryTimeline({
  history,
  stages,
}: {
  history: StageHistoryEntry[];
  stages: StageInfo[];
}) {
  const stageMap = new Map(stages.map((s) => [s.id, s]));

  if (history.length === 0) {
    return (
      <div className="border-b border-[var(--ws-border)] p-5">
        <span className="text-xs font-medium text-[var(--ws-text-muted)] uppercase tracking-wide">
          Stage History
        </span>
        <p className="mt-2 text-xs text-[var(--ws-text-muted)]">No stage changes</p>
      </div>
    );
  }

  return (
    <div className="border-b border-[var(--ws-border)] p-5">
      <span className="mb-3 block text-xs font-medium text-[var(--ws-text-muted)] uppercase tracking-wide">
        Stage History
      </span>
      <div className="relative space-y-0">
        {/* Vertical line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[var(--ws-border)]" />

        {history.map((entry) => {
          const fromStage = entry.from_stage_id ? stageMap.get(entry.from_stage_id) : null;
          const toStage = stageMap.get(entry.to_stage_id);
          const ActorIcon = ACTOR_ICON[entry.actor_type];

          return (
            <div key={entry.id} className="relative flex gap-3 py-2 pl-5">
              {/* Dot */}
              <div
                className="absolute left-0 top-3.5 h-[15px] w-[15px] rounded-full border-2 border-white"
                style={{ backgroundColor: toStage?.color ?? "#6366f1" }}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-sm">
                  {fromStage ? (
                    <>
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: fromStage.color }}
                      />
                      <span className="text-[var(--ws-text-tertiary)]">{fromStage.name}</span>
                      <ArrowRight className="h-3 w-3 text-[var(--ws-text-muted)]" />
                    </>
                  ) : (
                    <span className="text-[var(--ws-text-muted)]">Assigned to</span>
                  )}
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: toStage?.color ?? "#6366f1" }}
                  />
                  <span className="font-medium text-[var(--ws-text-primary)]">
                    {toStage?.name ?? "Unknown"}
                  </span>
                </div>

                <p className="mt-0.5 text-xs text-[var(--ws-text-tertiary)] leading-relaxed">
                  {entry.reason}
                </p>

                <div className="mt-1 flex items-center gap-3 text-[10px] text-[var(--ws-text-muted)]">
                  <span className="flex items-center gap-0.5">
                    <ActorIcon className="h-2.5 w-2.5" />
                    {ACTOR_LABEL[entry.actor_type]}
                  </span>
                  {entry.duration_seconds !== null && (
                    <span>in prev stage: {formatDuration(entry.duration_seconds)}</span>
                  )}
                  <span>{timeAgo(entry.created_at)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/leads/StageHistoryTimeline.tsx
git commit -m "feat: add StageHistoryTimeline component for lead profile"
```

---

## Task 15: UI — Notes Section Component

**Files:**
- Create: `src/components/dashboard/leads/NotesSection.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/dashboard/leads/NotesSection.tsx`:

```tsx
"use client";

import { useState } from "react";
import { StickyNote, Bot, User, ExternalLink } from "lucide-react";

interface NoteEntry {
  id: string;
  type: "agent_note" | "ai_summary";
  content: string;
  author_id: string | null;
  conversation_id: string | null;
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotesSection({
  notes,
  leadId,
  onAddNote,
}: {
  notes: NoteEntry[];
  leadId: string;
  onAddNote: (content: string) => Promise<void>;
}) {
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!newNote.trim()) return;
    setSaving(true);
    await onAddNote(newNote.trim());
    setNewNote("");
    setSaving(false);
  }

  return (
    <div className="p-5">
      <div className="mb-3 flex items-center gap-1.5">
        <StickyNote className="h-3.5 w-3.5 text-[var(--ws-text-muted)]" />
        <span className="text-xs font-medium text-[var(--ws-text-muted)] uppercase tracking-wide">
          Notes & Summaries
        </span>
      </div>

      {/* Add note area */}
      <div className="mb-4">
        <textarea
          placeholder="Add a note..."
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)] resize-none"
        />
        {newNote.trim() && (
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="mt-1.5 rounded-lg bg-[var(--ws-accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Add Note"}
          </button>
        )}
      </div>

      {/* Notes list */}
      {notes.length > 0 ? (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="rounded-lg border border-[var(--ws-border)] p-3">
              <div className="mb-1.5 flex items-center gap-2">
                {note.type === "ai_summary" ? (
                  <Bot className="h-3.5 w-3.5 text-amber-500" />
                ) : (
                  <User className="h-3.5 w-3.5 text-[var(--ws-accent)]" />
                )}
                <span className="text-xs font-medium text-[var(--ws-text-secondary)]">
                  {note.type === "ai_summary" ? "AI Summary" : "Agent Note"}
                </span>
                <span className="ml-auto text-[10px] text-[var(--ws-text-muted)]">
                  {timeAgo(note.created_at)}
                </span>
              </div>
              <p className="text-sm text-[var(--ws-text-primary)] leading-relaxed whitespace-pre-wrap">
                {note.content}
              </p>
              {note.type === "ai_summary" && note.conversation_id && (
                <a
                  href={`/app/conversations?id=${note.conversation_id}`}
                  className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-[var(--ws-accent)] hover:underline"
                >
                  View conversation <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[var(--ws-text-muted)]">No notes yet</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/leads/NotesSection.tsx
git commit -m "feat: add NotesSection component for lead profile"
```

---

## Task 16: Integrate New Sections into LeadProfilePanel

**Files:**
- Modify: `src/components/dashboard/LeadProfilePanel.tsx`

- [ ] **Step 1: Update the LeadProfile interface and imports**

In `src/components/dashboard/LeadProfilePanel.tsx`, replace the entire file content with the enhanced version that imports and renders all new sections:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Calendar, Tag } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import ActivityFeed, { type ActivityEvent } from "./ActivityFeed";
import ContactSection from "./leads/ContactSection";
import KnowledgeSection from "./leads/KnowledgeSection";
import StageHistoryTimeline from "./leads/StageHistoryTimeline";
import NotesSection from "./leads/NotesSection";

export interface LeadProfile {
  id: string;
  fbName: string | null;
  firstName: string | null;
  lastName: string | null;
  fbProfilePic: string | null;
  psid: string;
  stageId: string | null;
  stageName: string | null;
  stageColor: string | null;
  campaignName: string | null;
  tags: string[];
  createdAt: string;
  lastActiveAt: string;
  events: ActivityEvent[];
}

interface StageOption {
  id: string;
  name: string;
  color: string;
}

interface LeadDetailData {
  contacts: { id: string; type: "phone" | "email"; value: string; is_primary: boolean; source: "ai_extracted" | "manual" | "form_submit" }[];
  knowledge: { id: string; key: string; value: string; source: "ai_extracted" | "manual" }[];
  stageHistory: { id: string; from_stage_id: string | null; to_stage_id: string; reason: string; actor_type: "ai" | "agent" | "automation"; actor_id: string | null; duration_seconds: number | null; created_at: string }[];
  notes: { id: string; type: "agent_note" | "ai_summary"; content: string; author_id: string | null; conversation_id: string | null; created_at: string }[];
}

export default function LeadProfilePanel({
  lead,
  stages,
  onClose,
}: {
  lead: LeadProfile;
  stages: StageOption[];
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<LeadDetailData | null>(null);

  const displayName = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.fbName || "Unknown Lead";

  const fetchDetail = useCallback(async () => {
    const res = await fetch(`/api/leads/${lead.id}`);
    if (res.ok) {
      const data = await res.json();
      setDetail({
        contacts: data.contacts ?? [],
        knowledge: data.knowledge ?? [],
        stageHistory: data.stageHistory ?? [],
        notes: data.notes ?? [],
      });
    }
  }, [lead.id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  async function handleAddContact(type: "phone" | "email", value: string) {
    await fetch(`/api/leads/${lead.id}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, value }),
    });
    await fetchDetail();
  }

  async function handleDeleteContact(contactId: string) {
    await fetch(`/api/leads/${lead.id}/contacts/${contactId}`, { method: "DELETE" });
    await fetchDetail();
  }

  async function handleAddKnowledge(key: string, value: string) {
    await fetch(`/api/leads/${lead.id}/knowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    await fetchDetail();
  }

  async function handleDeleteKnowledge(knowledgeId: string) {
    await fetch(`/api/leads/${lead.id}/knowledge/${knowledgeId}`, { method: "DELETE" });
    await fetchDetail();
  }

  async function handleAddNote(content: string) {
    await fetch(`/api/leads/${lead.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    await fetchDetail();
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-[var(--ws-border)] bg-white shadow-[var(--ws-shadow-lg)]">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--ws-border)] p-5">
          <div className="flex items-center gap-3">
            <Avatar src={lead.fbProfilePic} name={displayName} size="lg" />
            <div>
              <h2 className="text-lg font-semibold text-[var(--ws-text-primary)]">
                {displayName}
              </h2>
              <div className="mt-1 flex items-center gap-1.5">
                {lead.stageName && (
                  <Badge variant="muted">
                    <span
                      className="mr-1.5 inline-block h-2 w-2 rounded-full"
                      style={{
                        backgroundColor: lead.stageColor ?? "#6366f1",
                      }}
                    />
                    {lead.stageName}
                  </Badge>
                )}
                {lead.campaignName && (
                  <Badge variant="default">{lead.campaignName}</Badge>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--ws-text-muted)] hover:bg-[var(--ws-page)] hover:text-[var(--ws-text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Info */}
        <div className="border-b border-[var(--ws-border)] p-5">
          <dl className="space-y-3">
            <div className="flex items-center justify-between">
              <dt className="text-xs font-medium text-[var(--ws-text-muted)] uppercase tracking-wide">
                PSID
              </dt>
              <dd className="font-mono text-sm text-[var(--ws-text-tertiary)]">
                {lead.psid}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-xs font-medium text-[var(--ws-text-muted)] uppercase tracking-wide">
                Created
              </dt>
              <dd className="text-sm text-[var(--ws-text-tertiary)]">
                {new Date(lead.createdAt).toLocaleDateString()}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-xs font-medium text-[var(--ws-text-muted)] uppercase tracking-wide">
                Last Active
              </dt>
              <dd className="text-sm text-[var(--ws-text-tertiary)]">
                {new Date(lead.lastActiveAt).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </div>

        {/* Contact Info */}
        {detail && (
          <ContactSection
            contacts={detail.contacts}
            leadId={lead.id}
            onAdd={handleAddContact}
            onDelete={handleDeleteContact}
          />
        )}

        {/* Key Knowledge */}
        {detail && (
          <KnowledgeSection
            knowledge={detail.knowledge}
            leadId={lead.id}
            onAdd={handleAddKnowledge}
            onDelete={handleDeleteKnowledge}
          />
        )}

        {/* Stage Selector */}
        <div className="border-b border-[var(--ws-border)] p-5">
          <label className="mb-2 block text-xs font-medium text-[var(--ws-text-muted)] uppercase tracking-wide">
            Stage
          </label>
          <select
            defaultValue={lead.stageId ?? ""}
            className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] outline-none focus:border-[var(--ws-accent)]"
          >
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Stage History */}
        {detail && (
          <StageHistoryTimeline
            history={detail.stageHistory}
            stages={stages}
          />
        )}

        {/* Tags */}
        <div className="border-b border-[var(--ws-border)] p-5">
          <div className="mb-2 flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-[var(--ws-text-muted)]" />
            <span className="text-xs font-medium text-[var(--ws-text-muted)] uppercase tracking-wide">
              Tags
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {lead.tags.length > 0 ? (
              lead.tags.map((tag) => (
                <Badge key={tag} variant="default">
                  {tag}
                </Badge>
              ))
            ) : (
              <p className="text-xs text-[var(--ws-text-muted)]">No tags</p>
            )}
          </div>
        </div>

        {/* Activity Timeline */}
        <div className="border-b border-[var(--ws-border)] p-5">
          <div className="mb-3 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-[var(--ws-text-muted)]" />
            <span className="text-xs font-medium text-[var(--ws-text-muted)] uppercase tracking-wide">
              Activity
            </span>
          </div>
          {lead.events.length > 0 ? (
            <ActivityFeed events={lead.events} />
          ) : (
            <p className="py-4 text-center text-xs text-[var(--ws-text-muted)]">
              No activity recorded
            </p>
          )}
        </div>

        {/* Notes & Summaries */}
        {detail && (
          <NotesSection
            notes={detail.notes}
            leadId={lead.id}
            onAddNote={handleAddNote}
          />
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Update LeadsClient to pass new fields in LeadProfile**

In `src/app/(tenant)/app/leads/LeadsClient.tsx`, update the `selectedLeadProfile` construction (around line 93) to include the new fields:

```typescript
  const selectedLeadProfile: LeadProfile | null = selectedLead
    ? {
        id: selectedLead.id,
        fbName: selectedLead.fbName,
        firstName: null, // Will be fetched via API in the panel
        lastName: null,
        fbProfilePic: selectedLead.fbProfilePic,
        psid: selectedLead.psid,
        stageId: selectedLead.stageId,
        stageName: selectedLead.stageId
          ? stageMap.get(selectedLead.stageId)?.name ?? null
          : null,
        stageColor: selectedLead.stageId
          ? stageMap.get(selectedLead.stageId)?.color ?? null
          : null,
        campaignName: null, // Will be fetched via API in the panel
        tags: selectedLead.tags,
        createdAt: selectedLead.createdAt,
        lastActiveAt: selectedLead.lastActiveAt,
        events: events
          .filter((e) => e.leadId === selectedLead.id)
          .map(
            (e): ActivityEvent => ({
              id: e.id,
              type: e.type,
              leadName: selectedLead.fbName,
              leadPic: selectedLead.fbProfilePic,
              leadId: e.leadId,
              payload: e.payload,
              createdAt: e.createdAt,
            })
          ),
      }
    : null;
```

- [ ] **Step 3: Run type check**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/LeadProfilePanel.tsx src/app/\(tenant\)/app/leads/LeadsClient.tsx
git commit -m "feat: integrate contact, knowledge, stage history, and notes sections into lead profile panel"
```

---

## Task 17: Run Full Test Suite and Fix Issues

- [ ] **Step 1: Run all tests**

Run: `npm test`

- [ ] **Step 2: Fix any failing tests**

If existing tests break due to the new `first_name`, `last_name`, `campaign_id` columns on the leads type, update the test mocks to include these nullable fields.

If conversation engine tests fail due to new imports, add the mocks described in Task 7 Step 3.

- [ ] **Step 3: Run type check**

Run: `npm run typecheck`

- [ ] **Step 4: Run lint**

Run: `npm run lint`

- [ ] **Step 5: Fix any issues found and commit**

```bash
git add -A
git commit -m "fix: resolve test and lint issues from lead management integration"
```

---

## Task 18: Manual Smoke Test

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Navigate to the leads page**

Open the tenant dashboard and go to the Leads page. Verify:
- Leads list still renders correctly (pipeline + table views)
- Clicking a lead opens the enhanced profile panel
- New sections appear: Contact Info, Key Knowledge, Stage History, Notes & Summaries
- Can add a phone number via the Contact Info section
- Can add an email via the Contact Info section
- Can add a knowledge entry
- Can add an agent note
- Stage history timeline renders (may be empty if no stage changes yet)

- [ ] **Step 3: Verify API routes**

Test each route in the browser console or via curl:
- `GET /api/leads/{id}` — returns full profile with contacts, knowledge, history, notes
- `POST /api/leads/{id}/contacts` — creates a contact
- `POST /api/leads/{id}/knowledge` — creates/upserts knowledge
- `POST /api/leads/{id}/notes` — creates an agent note

- [ ] **Step 4: Commit any smoke-test fixes**

```bash
git add -A
git commit -m "fix: smoke test fixes for lead management"
```
