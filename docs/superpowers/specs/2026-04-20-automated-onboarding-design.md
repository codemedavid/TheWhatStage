# Automated Onboarding — Design Spec

**Date:** 2026-04-20
**Status:** Approved

## Overview

Redesign the WhatStage onboarding wizard so that a new tenant goes from signup to a fully configured bot — campaign, conversation phases, system prompts, and knowledge base — with zero manual setup. The LLM generates everything from a short set of business questions.

## Goals

- New tenants land in a ready-to-use dashboard with a working bot after onboarding
- Minimize friction: 3 existing steps (profile, industry, goal) + 2 new steps (business info, optional URL) + generation + preview
- Facebook connect moves post-onboarding to reduce dropout
- Checkpoint-based retry so generation failures don't lose progress

## Non-Goals

- Ideal customer profiling (removed — LLM infers from business description)
- Image upload during onboarding (deferred to dashboard)
- Multi-campaign generation (one primary campaign per onboarding)

---

## Onboarding Wizard Flow

### Step 1: Profile
- Fields: first name, last name
- Same as current implementation

### Step 2: Industry
- Field: business type (enum)
- Options: ecommerce, real_estate, digital_product, services
- Same as current implementation

### Step 3: Goal
- Field: bot goal (enum)
- Options: qualify_leads, sell, understand_intent, collect_lead_info
- Same as current implementation

### Step 4: Business Info (NEW)
- **What does your business offer?** — textarea, required. Free-text description of products/services.
- **What's the main action you want leads to take?** — dropdown, required. Options:
  - Fill out a form
  - Book an appointment
  - Browse & purchase products
  - Visit a sales page
  - Schedule a call
- **What makes you different?** — textarea, optional. Unique selling proposition.
- **What do you need to know to qualify a lead?** — textarea, required. Qualification criteria the bot should extract during conversations.

### Step 5: Website URL (NEW)
- **Website URL** — text input, optional
- Skip button available
- If provided, the site is scraped during generation to create URL-based knowledge
- Copy: "Got a website? We'll learn from it."

### Step 6: Generation (NEW)
- Loading screen with step-by-step progress indicators
- Steps shown: Building business profile → Creating campaign flow → Writing conversation prompts → Generating knowledge base → Finalizing setup
- Progress updates via SSE from the orchestrator API
- Error state shows retry button; progress is preserved via checkpoints
- Estimated time: ~30 seconds

### Step 7: Preview (NEW)
- Summary screen showing:
  - Campaign name + goal
  - Knowledge count (X FAQs + Y articles)
  - Conversation flow visualization (phase names as pills with arrows)
  - Sample bot greeting (first message the bot would send)
- Single "Looks good, let's go!" button
- Clicking this finalizes onboarding and redirects to `/app/bot`

---

## Generation Orchestrator

### API: `POST /api/onboarding/generate`

Single endpoint that handles tenant creation and full bot generation.

**Request body:**
```typescript
{
  businessType: "ecommerce" | "real_estate" | "digital_product" | "services";
  botGoal: "qualify_leads" | "sell" | "understand_intent" | "collect_lead_info";
  businessDescription: string;
  mainAction: "form" | "appointment" | "purchase" | "sales_page" | "call";
  differentiator?: string;
  qualificationCriteria: string;
  websiteUrl?: string;
  firstName: string;
  lastName: string;
  tenantName: string;
  tenantSlug: string;
}
```

**Response:** Server-Sent Events (SSE) stream with progress updates:
```
{ step: "context", status: "done" }
{ step: "campaign", status: "done" }
{ step: "prompts", status: "done" }
{ step: "knowledge", status: "done" }
{ step: "embeddings", status: "done" }
{ step: "persisted", status: "done", data: { preview } }
```

On failure:
```
{ step: "<failed_step>", status: "failed", error: "...", generationId: "..." }
```

### API: `POST /api/onboarding/generate/retry`

**Request body:**
```typescript
{ generationId: string }
```

**Response:** Same SSE stream, resuming from last checkpoint.

### Pipeline Steps

#### Step 1: Build Context (no LLM)
- Format all form inputs into a structured business context object
- This object is passed to all subsequent LLM calls
- Checkpoint: `context`

#### Step 2: Generate Campaign + Phase Outlines (1 LLM call)
- Input: business context
- Output (JSON):
  ```typescript
  {
    campaign: {
      name: string;
      description: string;
      goal: "form_submit" | "appointment_booked" | "purchase" | "stage_reached";
      follow_up_message: string;
    };
    phases: Array<{
      name: string;
      order: number;
      max_messages: number;
      goals: string;
      transition_hint: string;
      tone: string;
    }>;
  }
  ```
- LLM decides number of phases (3-6) based on business type and goal
- Checkpoint: `campaign`

#### Step 3 (parallel): Three concurrent LLM operations

**3a: Generate Phase System Prompts**
- One LLM call per phase (parallel via `Promise.all`)
- Input: business context + phase outline (name, goals, transition_hint)
- Output: system_prompt string per phase (up to 5000 chars)
- Token limit: 512 per call

**3b: Generate FAQs + General Rich Text**
- One LLM call for FAQs:
  - Input: business context
  - Output: `{ faqs: [{ question, answer }] }` — 8-12 pairs
  - Token limit: 1024
- One LLM call for general knowledge article:
  - Input: business context
  - Output: plain text "About [Business]" article
  - Token limit: 1024

**3c: Scrape URL + Generate URL-based Rich Text (conditional)**
- Only runs if `websiteUrl` is provided
- Fetch page, extract clean text (HTML stripping / defuddle)
- One LLM call:
  - Input: scraped content + business context
  - Output: structured knowledge article from real website content
  - Token limit: 1024

Checkpoint after all parallel work: `parallel`

#### Step 4: Embed Knowledge Chunks
- Generate embeddings for all FAQ chunks and rich text content
- Uses existing `embedBatch()` function (BAAI/bge-large-en-v1.5, 1024-dim)
- Checkpoint: `embeddings`

#### Step 5: Write to DB (atomic transaction)
- Create tenant via existing `create_tenant_with_owner` RPC
- Update tenant with new business context columns
- Insert campaign (marked as primary, status: active)
- Insert campaign_phases with generated system prompts
- Insert knowledge_docs for each FAQ, general article, and URL article
- Insert knowledge_chunks with embeddings
- Update onboarding_generations status to `completed`
- Checkpoint: `persisted`

### Validation

Every LLM JSON response is parsed and validated with Zod before proceeding. Malformed output marks the step as failed and eligible for retry.

---

## Checkpoint Retry Mechanism

### Table: `onboarding_generations`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| user_id | uuid | FK → auth.users — used as primary key before tenant exists |
| tenant_id | uuid | FK → tenants, nullable — set during persist step after tenant creation |
| input | jsonb | All form data |
| status | text | `running`, `completed`, `failed` |
| checkpoint | text | Last completed: `context`, `campaign`, `parallel`, `embeddings`, `persisted` |
| results | jsonb | Accumulated outputs from completed steps |
| error | text | Error message if failed |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

### Retry Logic

1. First call creates a generation record with status `running`
2. After each pipeline step completes, checkpoint + results are updated
3. On failure: status → `failed`, error message stored, checkpoint preserved
4. Retry call loads existing record, reads checkpoint, skips completed steps
5. On success: status → `completed`

If the tenant was already created (checkpoint >= `persisted` partially), retry detects the existing tenant and skips creation.

---

## Database Changes

### New table: `onboarding_generations`
As described above.

### Modified table: `tenants` — new columns

| Column | Type | Notes |
|--------|------|-------|
| business_description | text | Nullable — "What does your business offer?" |
| main_action | text | Nullable — enum: form, appointment, purchase, sales_page, call |
| differentiator | text | Nullable — optional USP |
| qualification_criteria | text | Nullable — lead qualification info |
| website_url | text | Nullable — optional business URL |
| onboarding_completed | boolean | Default false, set true on "Looks good" click |

### No changes to existing tables
- `campaigns` — auto-populated by orchestrator
- `campaign_phases` — auto-populated with generated prompts
- `knowledge_docs` / `knowledge_chunks` — auto-populated with generated content

---

## Post-Onboarding Dashboard

### Facebook Connect Banner
- Persistent banner at top of dashboard layout (`/app/layout.tsx`)
- Shown when `tenant.fb_page_id` is null and `tenant.onboarding_completed` is true
- Dismissable (stored in localStorage) but re-appears on next session until connected
- CTA button triggers existing Facebook OAuth flow
- Copy: "Connect your Facebook Page to start receiving messages."

### Landing Page After Onboarding
- Redirect to `/app/bot` so tenants see their generated phases and prompts
- More rewarding than an empty leads page

### Facebook Connect Route
- Move `/api/onboarding/fb-connect` to `/api/settings/fb-connect`
- Same OAuth flow, just triggered from dashboard context

---

## LLM Configuration

- Provider: HuggingFace Inference API (existing)
- Primary model: google/gemma-3-27b-it (existing)
- Fallback model: mistralai/Mistral-7B-Instruct-v0.3 (existing)
- Per-call token limits:
  - Campaign + phases: 512 tokens
  - Phase system prompts: 512 tokens each
  - FAQs: 1024 tokens
  - Rich text articles: 1024 tokens each
- Temperature: 0.4 (existing default)
- All calls use JSON response format where structured output is needed
- Retry: 2 retries with exponential backoff on 503/429 (existing)

---

## Removed from Onboarding

- **Bot Setup step** (tone, rules, custom instruction) — LLM generates these from business context
- **Action Types step** — LLM infers appropriate action types from main_action dropdown
- **Facebook Connect step** — moved to post-onboarding dashboard banner

---

## Summary of Changes

| Area | What Changes |
|------|-------------|
| Onboarding wizard | Replace steps 4-6 with: Business Info → Website URL → Generation → Preview |
| New API routes | `/api/onboarding/generate` (SSE), `/api/onboarding/generate/retry` |
| Modified API routes | Remove `/api/onboarding/create-tenant` (absorbed into generate) |
| Moved routes | `/api/onboarding/fb-connect` → `/api/settings/fb-connect` |
| New DB table | `onboarding_generations` |
| Modified DB table | `tenants` (5 new columns + onboarding_completed flag) |
| New lib modules | `src/lib/ai/onboarding-generator.ts` (orchestrator), `src/lib/ai/onboarding-prompts.ts` (prompt templates) |
| Dashboard changes | Facebook connect banner in layout, redirect to /app/bot after onboarding |
| Components | New: BusinessInfoStep, WebsiteStep, GenerationStep, PreviewStep. Modified: OnboardingWizard |
