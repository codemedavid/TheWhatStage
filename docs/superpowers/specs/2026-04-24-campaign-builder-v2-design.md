# Campaign Builder V2: Plan-First Sales System Design

**Date:** 2026-04-24
**Status:** Draft
**Goal:** Upgrade the AI campaign builder from a one-shot phase generator into a plan-first sales system designer with campaign-level rules and interactive phase refinement.

---

## Problem

The current campaign builder jumps straight to generating phases. There's no step where the AI thinks through the sales approach before committing to a phase structure. Tenants can't see *why* the AI made the choices it did, and they can't iterate on the strategy separately from the phases.

Additionally, there's no campaign-level prompt or rules. The system prompt is built from tenant-wide `bot_rules` + per-phase `system_prompt`. If a tenant wants rules that apply across all phases of a specific campaign (e.g., "always mention the guarantee"), there's nowhere to put them.

## Design Summary

Replace the current generate-then-revise flow with a three-stage builder:

1. **Plan** — AI designs a campaign plan (goal, approach, behaviors, phase outline, campaign rules) through adaptive conversation
2. **Generate Phases** — tenant approves the plan, clicks a button, AI produces full phases from the plan
3. **Refine** — tenant edits individual phases, adds new ones, or revises the plan, all through chat with smart-scoped updates

Campaign rules become a first-class field on campaigns, injected into the conversation engine's system prompt between tenant-wide bot rules and phase context.

---

## Data Model

### New fields on `campaigns` table

**`campaign_rules`** — `text[]`, default `'{}'`

An array of plain-language rules that apply across all phases of this campaign.

Examples:
- "Always mention the free consultation before asking for a booking"
- "Never discuss pricing until the lead has expressed clear interest"
- "If they ask about competitors, redirect to our unique process"

**`campaign_plan`** — `jsonb`, default `null`

The strategic blueprint the AI produced before generating phases. Schema:

```json
{
  "goal_summary": "Book dental appointments for anxious first-time patients",
  "selling_approach": "Trust-first — reduce anxiety before asking for commitment",
  "buyer_context": "Warm leads from Facebook ads, likely nervous about dental visits",
  "key_behaviors": [
    "Lead with empathy, not features",
    "Answer fear-based questions immediately",
    "Only suggest booking after they feel safe"
  ],
  "phase_outline": [
    { "name": "Ease Into It", "purpose": "Lower anxiety and build comfort" },
    { "name": "Understand Needs", "purpose": "Learn what specific dental work they need" },
    { "name": "Offer Booking", "purpose": "Present a low-pressure path to schedule" }
  ]
}
```

The `phase_outline` is a rough sketch — names and purposes only. Full phases (with `system_prompt`, `tone`, `goals`, etc.) get generated in the next step.

**No changes to `campaign_phases`** — phases keep their existing schema.

### Migration

Single migration adding both columns:

```sql
ALTER TABLE campaigns
  ADD COLUMN campaign_plan jsonb DEFAULT NULL,
  ADD COLUMN campaign_rules text[] DEFAULT '{}';
```

---

## Builder Flow & State Machine

The builder derives state from what exists on the campaign:

| State | Condition | Preview Shows |
|---|---|---|
| `NO_PLAN` | `campaign_plan` is null | Empty state or developing plan |
| `HAS_PLAN` | `campaign_plan` exists, no phases | Campaign plan card + "Generate Phases" button |
| `HAS_PHASES` | `campaign_plan` exists, phases exist | Collapsed plan summary + phase cards + action buttons |

### NO_PLAN — Planning conversation

- Chat is freeform. AI adapts depth based on how much detail the tenant gives.
- Vague input ("booking campaign") → AI asks 2-4 questions about goal, approach, constraints.
- Detailed input ("trust-first qualification for nervous dental patients, never hard-sell, always mention the free consult") → AI generates plan immediately.
- Preview panel shows the Campaign Plan as it develops.
- Each chat revision updates the plan in place.
- Button appears once plan exists: **"Generate Phases"**.

### HAS_PLAN → HAS_PHASES — Generating phases

- Tenant clicks "Generate Phases."
- AI takes the campaign plan and generates full phases.
- Preview updates to show plan summary + phase cards.

### HAS_PHASES — Phase-level refinement

Chat is still freeform. AI smart-scopes what changed:

- **Single phase edit**: "Make the qualification phase softer" → updates just that phase.
- **Flow change**: "Add an objection-handling phase after qualify" → inserts new phase, adjusts neighbors' transition hints.
- **Plan change**: "Actually, we should never mention pricing" → updates campaign rules and re-evaluates affected phases.
- **Full restructure**: "Start over with the phases" → regenerates all phases from plan.

Phase cards are **clickable** — clicking one sets it as the "focused phase" so the AI knows which phase the tenant is discussing.

---

## API Design

Three endpoints replace the current `generate` and `revise`:

### POST `/api/campaigns/ai-builder/plan`

Used during `NO_PLAN` and for plan revisions in any state.

**Input:**
```json
{
  "message": "string (required, 3-2000 chars)",
  "history": [{ "role": "user|assistant", "text": "string" }],
  "campaignId": "string (optional — omit to create new draft)"
}
```

**Behavior:**
- No `campaignId` → creates a new draft campaign, saves the plan on it.
- With `campaignId` → updates the existing campaign's plan.
- AI may return a clarifying question instead of a plan (adaptive depth).
- If campaign already has phases and the plan changes, returns `affectedPhaseIndices` so the UI can indicate which phases may need updating.

**Response (question):**
```json
{
  "action": "question",
  "question": "What's the main objection these leads usually have?",
  "campaign": { "id": "...", "name": "..." }
}
```

**Response (plan):**
```json
{
  "action": "plan",
  "campaign": { "id": "...", "name": "...", "status": "draft" },
  "plan": { "goal_summary": "...", "selling_approach": "...", ... },
  "rules": ["rule 1", "rule 2"],
  "affectedPhaseIndices": [0, 2]
}
```

### POST `/api/campaigns/ai-builder/phases`

Used when tenant clicks "Generate Phases."

**Input:**
```json
{
  "campaignId": "string (required)"
}
```

**Behavior:**
- Reads the campaign's `campaign_plan` and `campaign_rules`.
- Generates full phases from the plan.
- Deletes any existing phases on the draft, inserts new ones.
- Blocks if campaign has lead activity (same safety check as today).

**Response:**
```json
{
  "phases": [
    { "name": "...", "order_index": 0, "max_messages": 3, "system_prompt": "...", "tone": "...", "goals": "...", "transition_hint": "..." }
  ]
}
```

### POST `/api/campaigns/ai-builder/phase-edit`

Used during `HAS_PHASES` for all phase-level changes.

**Input:**
```json
{
  "campaignId": "string (required)",
  "message": "string (required, 3-2000 chars)",
  "history": [{ "role": "user|assistant", "text": "string" }],
  "focusedPhaseIndex": "number (optional — set when a phase card is selected)"
}
```

**Behavior:**
- AI receives: campaign plan, campaign rules, all current phases, focused phase index, chat message.
- AI decides scope of change.

**Response:**
```json
{
  "action": "update | add | regenerate",
  "phases": [...],
  "updatedIndices": [1],
  "addedIndex": 3,
  "rulesUpdate": ["updated rule 1", "new rule"]
}
```

- `update` — partial update, `updatedIndices` indicates which phases changed.
- `add` — new phase inserted, `addedIndex` indicates position.
- `regenerate` — full rebuild from plan, all phases replaced.
- `rulesUpdate` — if present, campaign rules were also changed.

### Unchanged endpoints

- `POST /api/campaigns/[id]/test-against-primary` — unchanged.
- `PATCH /api/campaigns/[id]` — updated to support `campaign_rules` field for manual editing from settings.

---

## Prompt Builder Integration

### New Layer 2.5 — Campaign Rules

Inserted between Layer 2 (bot_rules) and Layer 3 (offering context) in `buildSystemPrompt`:

```
--- CAMPAIGN RULES ---
These rules apply to this specific campaign. Follow them in every phase:
- Always mention the free consultation before asking for a booking
- Never discuss pricing until the lead has expressed clear interest
```

**Priority ordering:** tenant-wide bot_rules (broadest) → campaign rules → phase context (narrowest). Conflicts resolve in favor of narrower scope.

**Implementation:** `buildSystemPrompt` already receives campaign context. Fetch `campaign_rules` from the campaign record. If empty, skip the layer.

---

## Campaign Builder LLM Prompts

### Plan prompt (used by `/plan`)

**System prompt role:** "You are a sales system architect for Messenger bots. Your job is to understand what the tenant wants to achieve and design a campaign plan — not phases yet, just the strategic blueprint."

**Adaptive depth instruction:** "If the tenant gives detailed direction, produce the plan immediately. If vague, ask 1-2 focused questions before producing the plan. Never ask more than 2 questions in a row."

**Output schema:**
```json
{
  "action": "question | plan",
  "question": "string (if action=question)",
  "plan": {
    "goal_summary": "string",
    "selling_approach": "string",
    "buyer_context": "string",
    "key_behaviors": ["string"],
    "phase_outline": [{ "name": "string", "purpose": "string" }]
  },
  "campaign_name": "string",
  "campaign_description": "string",
  "campaign_goal": "form_submit | appointment_booked | purchase | stage_reached",
  "campaign_rules": ["string"]
}
```

The `question` action lets the AI ask a clarifying question instead of generating, which drives the adaptive depth.

### Phase generation prompt (used by `/phases`)

**System prompt role:** "You are generating conversation phases from an approved campaign plan. Each phase is a behavioral briefing for a Messenger sales bot, not a canned script."

**Context provided:** Full `campaign_plan` and `campaign_rules`.

**Uses CLOSER as hidden reasoning** (same as today — not visible in output).

**Output:** Array of phases matching existing `GeneratedCampaignPhase` schema.

### Phase edit prompt (used by `/phase-edit`)

**System prompt role:** "You are refining phases of an existing campaign. Decide the minimal scope of change needed."

**Context provided:** Campaign plan, campaign rules, all current phases, focused phase index (if any), chat message.

**Smart-scoping instruction:** "If the change only affects one phase, return only that phase as changed. If it affects the flow, update affected neighbors. If it fundamentally changes the approach, regenerate all phases."

**Output schema:**
```json
{
  "action": "update | add | regenerate",
  "phases": [...],
  "updatedIndices": [0],
  "addedIndex": 2,
  "rulesUpdate": ["string"]
}
```

---

## UI Changes

### Builder page (`/app/campaigns/ai-builder`)

Same two-panel layout. Preview panel adapts based on state:

**NO_PLAN (empty):** Existing empty state ("Draft preview appears here").

**NO_PLAN (plan developing):** Campaign Plan card showing:
- Goal summary
- Selling approach
- Buyer context
- Key behaviors (bulleted)
- Phase outline (numbered, name + purpose)
- Campaign rules (bulleted)
- Button: **"Generate Phases"**

**HAS_PHASES:** Collapsed plan summary at top + phase cards:
- Each card: number, name, goals, tone
- Clicking a card highlights it and sets it as focused
- Focused card has a visible border accent
- Button: **"Add Phase"** at bottom of phase list
- Action buttons: "Edit Draft", "Test Against Primary", "Make Primary"

### Chat panel

Placeholder text adapts:
- No plan: "Describe the campaign you want to build..."
- Has plan, no phases: "Revise the plan or click Generate Phases..."
- Has phases, no focus: "Describe changes to the campaign..."
- Has phases, focused: "Describe changes for [Phase Name]..."

Button label: **"Send"** (replaces "Generate Draft" / "Revise Draft").

When AI returns a `question` action, the question appears as an assistant message in the chat. No preview change.

### Campaign settings — new Campaign Rules section

Added to the Settings tab in `CampaignEditorClient.tsx`:
- Rules displayed as an editable list
- Each rule: text input + delete button
- "Add Rule" button at bottom
- Saves via existing `PATCH /api/campaigns/[id]`

---

## What This Design Does NOT Include

- **Tenant-level buyer persona / business context config** — separate feature for later, as discussed.
- **Streaming responses** — the builder uses standard request/response. Streaming can be added later if generation feels slow.
- **Version history for plans** — plans are overwritten on revision. History could be added later via a separate `campaign_plan_versions` table if needed.
- **Collaborative editing** — single-user builder. No real-time sync between multiple users editing the same campaign.
