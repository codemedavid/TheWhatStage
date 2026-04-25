# Lead Management System — Design Spec

**Date:** 2026-04-25
**Status:** Approved

## Overview

Enhance the existing lead management system with contact info (multiple phones/emails), key knowledge (structured + free-form AI-extracted facts), stage history with duration tracking, and agent notes + AI summaries. Follows Approach C (Hybrid) — a single `lead_contacts` table for phones/emails, with dedicated tables for knowledge, stage history, and notes.

## Data Model

### Leads Table Changes

Add columns to the existing `leads` table:

| Column | Type | Purpose |
|--------|------|---------|
| `first_name` | text, nullable | System-defined knowledge field |
| `last_name` | text, nullable | System-defined knowledge field |
| `campaign_id` | uuid, nullable, FK → campaigns | Origin campaign this lead was registered through |

`first_name` / `last_name` are universal fields that live on leads directly. AI fills them from conversation, agents can override. `campaign_id` denormalizes from `lead_campaign_assignments` for fast access to the origin campaign.

### New Tables

#### `lead_contacts`

Multi-value contact info (phones and emails) in one table.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid, PK | |
| `tenant_id` | uuid, FK → tenants | Tenant isolation |
| `lead_id` | uuid, FK → leads | |
| `type` | enum: `phone` \| `email` | Discriminator |
| `value` | text, not null | The phone number or email address |
| `is_primary` | boolean, default false | Marks the preferred contact per type |
| `source` | enum: `ai_extracted` \| `manual` \| `form_submit` | How this was captured |
| `created_at` | timestamptz | |

Unique constraint on `(tenant_id, lead_id, type, value)` — no duplicate entries.

#### `lead_knowledge`

Free-form key-value knowledge entries. AI-extracted or agent-added.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid, PK | |
| `tenant_id` | uuid, FK → tenants | Tenant isolation |
| `lead_id` | uuid, FK → leads | |
| `key` | text, not null | e.g., "Business", "Budget", "Location" |
| `value` | text, not null | e.g., "Bakery in Manila", "$5k/mo" |
| `source` | enum: `ai_extracted` \| `manual` | Who added it |
| `extracted_from` | uuid, nullable, FK → messages | Links back to the message the AI pulled this from |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Unique constraint on `(tenant_id, lead_id, key)` — one value per key per lead. AI or agent updates overwrite.

#### `lead_stage_history`

Audit trail of every stage transition with duration tracking.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid, PK | |
| `tenant_id` | uuid, FK → tenants | Tenant isolation |
| `lead_id` | uuid, FK → leads | |
| `from_stage_id` | uuid, nullable, FK → stages | Null on first assignment |
| `to_stage_id` | uuid, FK → stages | |
| `reason` | text, not null | Why the move happened |
| `actor_type` | enum: `ai` \| `agent` \| `automation` | What triggered the move |
| `actor_id` | uuid, nullable | User ID if agent, null otherwise |
| `duration_seconds` | integer, nullable | Time spent in `from_stage`. Computed at insert time |
| `created_at` | timestamptz | |

#### `lead_notes`

Manual agent notes and AI summaries in one table.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid, PK | |
| `tenant_id` | uuid, FK → tenants | Tenant isolation |
| `lead_id` | uuid, FK → leads | |
| `type` | enum: `agent_note` \| `ai_summary` | Discriminator |
| `content` | text, not null | The note or summary text |
| `author_id` | uuid, nullable, FK → auth.users | User ID for agent notes, null for AI |
| `conversation_id` | uuid, nullable, FK → conversations | Links AI summary to its conversation |
| `created_at` | timestamptz | |

All tables get RLS policies filtering on `tenant_id` matching `current_tenant_id()`.

## AI Knowledge Extraction

Hooks into the existing conversation engine as a post-processing step.

1. After the AI generates a response, a post-processing step runs on the lead's message.
2. Uses the existing LLM client with an extraction prompt to produce structured JSON key-value pairs.
3. Extracted pairs are upserted into `lead_knowledge` (keyed by `lead_id + key`).
4. Contact info (phones, emails) detected in messages are upserted into `lead_contacts` with `source: ai_extracted`.
5. `first_name` / `last_name` are special-cased — if extracted, they update the `leads` table directly.

**Extraction is best-effort and non-blocking.** If it fails, the conversation continues normally.

**What gets extracted:**
- Name (first, last)
- Contact info (phone, email)
- Business/company info
- Location
- Budget/price sensitivity
- Intent signals
- Any other notable facts

A small utility handles key normalization — mapping common variations (e.g., "business" / "Business Type" / "company") to canonical keys.

## Stage Transition Logic

A `moveLeadToStage()` function becomes the single entry point for all stage changes.

1. Looks up the previous `lead_stage_history` entry to compute `duration_seconds` (diff from that entry's `created_at` to now).
2. Inserts a new `lead_stage_history` row with `from_stage_id`, `to_stage_id`, `reason`, `actor_type`, `actor_id`.
3. Updates `leads.stage_id` to the new stage.

All callers pass `actor_type` and `reason`:
- **AI**: Reason is AI-generated (e.g., "Lead booked an appointment via action button").
- **Agent**: Reason is required — agent types it in a modal.
- **Automation**: Reason is the trigger description.

Duration is computed at write time, not query time.

## AI Summary Generation

**Trigger:** When a conversation goes idle (no messages for 10+ minutes) or a new session starts. Not after every message.

**Summary contents:**
- Key topics discussed
- Actions taken (buttons clicked, forms submitted, pages visited)
- Lead sentiment / intent signals
- Commitments made (e.g., "said they'd check back Thursday")
- Outcome (converted, still interested, dropped off, needs follow-up)

**How it works:**
1. `generateLeadSummary(conversationId, leadId)` takes recent conversation messages.
2. Sends to LLM with a summarization prompt.
3. Inserts into `lead_notes` with `type: ai_summary` and `conversation_id` linked.
4. Runs asynchronously — does not block any user-facing flow.

The conversation engine tracks last message timestamp. When a new message arrives with a 10+ minute gap, it fires summary generation for the previous session.

## API Routes

### New Routes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/leads/[id]` | Full lead profile — lead + contacts + knowledge + recent notes + stage history |
| `PATCH` | `/api/leads/[id]` | Update lead fields (first_name, last_name, tags, stage via `moveLeadToStage`) |
| `GET` | `/api/leads/[id]/contacts` | List contacts for a lead |
| `POST` | `/api/leads/[id]/contacts` | Add a phone or email |
| `DELETE` | `/api/leads/[id]/contacts/[contactId]` | Remove a contact entry |
| `GET` | `/api/leads/[id]/knowledge` | List knowledge entries |
| `POST` | `/api/leads/[id]/knowledge` | Add/update a knowledge entry (upsert by key) |
| `DELETE` | `/api/leads/[id]/knowledge/[knowledgeId]` | Remove a knowledge entry |
| `GET` | `/api/leads/[id]/stage-history` | Full stage transition timeline |
| `GET` | `/api/leads/[id]/notes` | List notes and AI summaries |
| `POST` | `/api/leads/[id]/notes` | Agent adds a note |

### Existing Route Changes

- `GET /api/leads` — add optional query params: `?campaign_id=`, `?stage_id=`, `?search=` (searches name, email, phone across tables)

All routes: `resolveSession()` → auth check → service client with `tenant_id` filter. Zod validation on POST/PATCH bodies. Phone format validation. Email format validation.

## UI — Lead Profile Panel Enhancement

Enhances the existing `LeadProfilePanel.tsx`. No new pages — everything lives in the slide-open panel from the leads list.

**Layout (top to bottom):**

1. **Header** — FB profile pic, first_name + last_name (falls back to fb_name), stage badge, campaign badge.
2. **Contact Info** — Phone numbers and emails with primary indicators. "Add" button per type. Source label (AI / manual / form).
3. **Key Knowledge** — Card grid of key-value pairs. Key as label, value as content, source icon (AI sparkle / pencil for manual). "Add knowledge" button. Inline editing on click.
4. **Stage History** — Vertical timeline: from → to, reason, actor (AI/agent name/automation), duration in previous stage, timestamp.
5. **Notes & Summaries** — Reverse-chronological list. Agent notes: user avatar + name. AI summaries: AI icon + conversation link. "Add note" text area at top.

Existing activity feed (lead_events) and tags stay as-is.

## Out of Scope

- Lead scoring / ranking
- Bulk operations (bulk stage moves, tagging, exports)
- Dedicated advanced search UI
- Automation triggers calling `moveLeadToStage` (workflow engine phase)
- Customizable knowledge key templates for tenants
- Real-time notifications on knowledge changes
- Aggregate analytics / funnel dashboards for stage durations
