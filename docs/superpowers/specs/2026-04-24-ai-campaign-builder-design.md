# Design Spec: Motion-First AI Campaign Builder

**Date:** 2026-04-24  
**Status:** Draft for review  
**Subsystem:** Campaign builder, experiments, AI generation, campaign editor

---

## 1. Purpose

Tenants need an easier way to create new sales campaigns without manually designing every phase. The builder should let them describe a campaign in normal language, generate a saved draft campaign, and make it easy to either edit, test, or promote that campaign.

The goal is to reduce tenant complexity while increasing the bot's chances of closing. Tenants should not need to understand phase strategy, experiment setup, or sales frameworks. They should be able to say things like:

```text
I want a low-friction campaign that builds trust and asks people to check if they qualify for our service.
```

or:

```text
I want a straightforward campaign that answers questions immediately, understands what they want to buy, then re-engages them to close.
```

The AI converts that direction into a concise strategy brief and a draft campaign with phases, tone, goals, transition hints, and follow-up behavior.

---

## 2. Product Model

### 2.1 Primary Campaign Is The General Bot

The system should avoid a separate "general bot" concept. The existing `campaigns.is_primary` campaign remains the default bot for new leads.

Tenant-facing language:

- **Primary campaign** = the general/default bot.
- **Draft campaign** = a new generated campaign being reviewed.
- **Test against primary** = run a simple A/B test between the current primary campaign and a generated campaign.
- **Make primary** = promote the generated campaign to become the general bot.

This keeps the mental model simple: create something new, test it, or make it the default.

### 2.2 Campaigns Are Based On Motion

The builder should infer a **campaign motion** from the tenant's chat direction. A motion describes how the bot should sell, not what the exact phase names must be.

Example motions:

- `answer_first_close_later`: answer questions directly, identify what they want, recommend next step, re-engage to close.
- `trust_first_qualification`: reduce friction, build confidence, ask leads to check if they qualify.
- `discovery_first_matching`: understand what the buyer wants before recommending a product/service.
- `fast_booking`: quickly move warm leads toward an appointment or call.
- `objection_recovery`: focus on trust, price, timing, fit, and stalled leads.
- `soft_consultative`: ask useful questions, guide gently, avoid pressure.

These motion names are internal. The tenant sees plain explanations, not technical labels.

### 2.3 CLOSER Is Hidden Strategy, Not Literal Structure

The builder may use CLOSER-style reasoning internally:

- Clarify why the lead is there.
- Label or reflect the real problem/desire.
- Overview relevant past context or pain when useful.
- Sell the outcome, not only the mechanics.
- Explain concerns directly.
- Reinforce the next decision after the lead acts.

The generated campaign should not force these as literal phase names. Some campaigns should answer immediately and close later. Some should qualify first. Some should move quickly to booking. The motion controls the campaign structure.

References:

- Studylib CLOSER notes: https://studylib.net/doc/27075508/closer-alex-hormozi
- Skool C.L.O.S.E.R summary: https://www.skool.com/acceleratoruniversity/what-is-alex-hormozis-closer-framework?p=5ed0b9b9

---

## 3. User Experience

### 3.1 Entry Points

Add an AI builder entry point from:

- `/app/campaigns`
- `/app/campaigns/new`

Recommended tenant-facing button label:

```text
Build with AI
```

The existing manual campaign creation path remains available.

### 3.2 Builder Screen

Create a dedicated builder screen:

```text
/app/campaigns/ai-builder
```

The page has two main areas:

- **Chat panel:** tenant describes what they want and asks for revisions.
- **Draft preview panel:** shows the generated strategy brief and campaign phases.

The first version should keep the UI focused. It should not expose advanced experiment controls, raw JSON, model settings, or strategy taxonomy.

### 3.3 Chat Behavior

The builder starts with an empty prompt input and a few example chips:

- Low-friction qualification
- Answer questions first
- Re-engage silent leads
- Product matching
- Soft booking campaign

The tenant can type freely. The AI should generate a draft immediately if the direction is sufficient. It should ask at most one clarifying question only when required to avoid a poor campaign, such as when the offer or goal is missing.

After generation, the tenant can keep chatting:

```text
Make phase 1 softer.
```

```text
Make it more Taglish and less salesy.
```

```text
Change the CTA to "check if you qualify."
```

```text
Make it answer pricing questions directly if the knowledge base has the price.
```

The AI updates the draft campaign, not the active primary campaign.

### 3.4 Strategy Brief

Every generated draft includes a short editable strategy brief:

- Campaign motion
- Buyer stage
- Friction level
- Main behavior
- CTA style
- Re-engagement strategy
- Tone
- Key constraints

Example:

```text
Motion: Answer-first close later
Buyer stage: Warm but unclear intent
Friction: Low
Main behavior: Answer direct questions first, then match the lead to the right offer.
CTA: Ask them to check fit or take the next step when intent is clear.
Re-engagement: Follow up based on silence, concern, or buying signal.
Tone: Human, concise, Taglish-friendly, not pushy.
```

The strategy brief is used to explain what the AI generated and to support later revisions. It does not need a dedicated database table in the first version.

### 3.5 Draft Actions

After a draft campaign is generated, show three main actions:

- **Edit Draft:** opens the normal campaign editor.
- **Test Against Primary:** creates an experiment between the current primary campaign and this draft.
- **Make Primary:** promotes this draft to primary.

Advanced experiment setup can remain in the existing experiments UI. The builder should make the common path one click.

---

## 4. Generated Campaign Shape

### 4.1 Campaign

The AI creates a row in `campaigns` with:

- `status = 'draft'`
- `is_primary = false`
- generated `name`
- generated `description`
- goal mapped to the existing enum:
  - `form_submit`
  - `appointment_booked`
  - `purchase`
  - `stage_reached`
- `follow_up_message` aligned to the campaign motion
- `goal_config.strategy` stores the generated strategy brief and internal motion metadata

### 4.2 Phases

The AI creates 3-6 rows in `campaign_phases`.

Phases should be generated from the campaign motion. They should not be fixed to CLOSER labels.

Example for answer-first close-later:

- Understand Buying Intent
- Answer & Match Offer
- Recommend Next Step
- Handle Concern
- Re-engage To Close

Example for trust-first qualification:

- Low-Friction Opener
- Clarify Fit
- Build Trust
- Qualification CTA
- Re-engage With Context

Each phase includes:

- `name`
- `order_index`
- `max_messages`
- `system_prompt`
- `tone`
- `goals`
- `transition_hint`

The phase prompt should brief the bot on behavior, not provide scripts. It should preserve the existing Messenger style: short, human, direct, and matched to the lead's language.

---

## 5. Architecture

### 5.1 New Generation Module

Add a campaign-builder generation module:

```text
src/lib/ai/campaign-builder.ts
```

Responsibilities:

- Build prompts from tenant context and chat instructions.
- Generate a strategy brief, campaign metadata, phases, and follow-up message.
- Validate LLM output with Zod.
- Apply revision requests to the current draft.
- Keep CLOSER guidance internal and motion-based.

This should reuse `generateResponse` from `src/lib/ai/llm-client.ts`.

### 5.2 API Routes

Add:

```text
POST /api/campaigns/ai-builder/generate
POST /api/campaigns/ai-builder/revise
POST /api/campaigns/[id]/test-against-primary
```

`generate`:

- Authenticates tenant.
- Loads tenant context.
- Accepts `message` and optional `history`.
- Generates strategy + campaign draft + phases.
- Inserts campaign and phases.
- Returns campaign id, strategy brief, and generated phases.

`revise`:

- Authenticates tenant.
- Verifies the campaign belongs to the tenant and is not primary.
- Accepts `message`, current strategy brief, and current campaign snapshot.
- Updates campaign fields and phase rows.
- Returns revised preview.

`test-against-primary`:

- Authenticates tenant.
- Finds current primary campaign.
- Creates an experiment with two variants:
  - primary campaign, 50%
  - draft campaign, 50%
- Sets the generated campaign to `active`.
- Sets the experiment status to `running` with `started_at = now()`.
- Returns experiment id.

Because this affects new lead assignment, the UI should show a short confirmation before calling this route. The tenant does not need to configure weights or experiment details in the builder path.

`Make Primary` can use the existing campaign update route by setting `is_primary = true` and `status = 'active'`.

### 5.3 Frontend Components

Add:

```text
src/app/(tenant)/app/campaigns/ai-builder/page.tsx
src/app/(tenant)/app/campaigns/ai-builder/AiCampaignBuilderClient.tsx
src/components/dashboard/campaigns/AiBuilderChat.tsx
src/components/dashboard/campaigns/AiBuilderPreview.tsx
```

The preview should show:

- Strategy brief
- Campaign name and description
- Goal
- Follow-up message
- Phase list with names, tone, and goals
- Actions: Edit Draft, Test Against Primary, Make Primary

### 5.4 Data Persistence

In v1, the generated campaign and phases are saved immediately as a draft. The strategy brief is stored in `campaigns.goal_config.strategy` so it survives refreshes and can be used for later revisions.

The chat transcript can live in client state and API responses only. Persisting the full builder chat is not required for v1.

Future persistence can add:

```text
campaign_strategy_briefs
campaign_builder_sessions
```

These are out of scope for v1 unless later revisions require durable builder history.

---

## 6. Data Flow

### 6.1 Generate Draft

1. Tenant opens AI builder.
2. Tenant sends campaign direction.
3. API loads tenant context:
   - tenant name
   - business type
   - bot goal
   - business description
   - main action
   - qualification criteria
   - existing primary campaign summary
4. LLM returns validated JSON:
   - strategy brief stored in `goal_config.strategy`
   - campaign metadata
   - phases
5. API inserts campaign with `status = 'draft'`.
6. API inserts generated phases.
7. UI shows preview and actions.

### 6.2 Revise Draft

1. Tenant sends revision message.
2. API loads current draft campaign and phases.
3. API reads `goal_config.strategy` and passes it with the revision request.
4. LLM returns revised strategy, campaign metadata, and phase list.
5. API updates campaign, including `goal_config.strategy`.
6. API replaces campaign phases for that draft.
7. UI refreshes preview.

Replacing phases is acceptable in v1 because the campaign is draft-only and has no assigned leads. If the campaign has assignments or conversions, revision should be blocked and the tenant should duplicate instead.

### 6.3 Test Against Primary

1. Tenant clicks **Test Against Primary**.
2. UI confirms that new leads will be split between the current primary and this draft.
3. API finds current primary campaign.
4. API marks the draft campaign `active`.
5. API creates a running experiment with the primary and draft campaign.
6. UI routes tenant to experiment detail page.

---

## 7. Error Handling

- If LLM output fails validation, retry once with a repair prompt.
- If generation still fails, show a plain error and keep the user's input in the chat box.
- If there is no primary campaign, hide **Test Against Primary** and explain that a primary campaign is required.
- If the draft campaign already has assigned leads, block destructive revision and suggest creating a new draft instead.
- If campaign insert succeeds but phase insert fails, delete the draft campaign or return a recoverable error with cleanup.
- If promotion to primary fails, leave the draft unchanged.

---

## 8. Testing Plan

### Unit Tests

- `campaign-builder.test.ts`
  - builds a prompt that includes tenant context, tenant direction, motion inference, and hidden CLOSER guidance
  - validates generated JSON shape
  - maps main action to campaign goal correctly
  - produces non-literal, motion-based phases

- `campaigns-ai-builder-api.test.ts`
  - rejects unauthenticated requests
  - creates a draft campaign and phases from valid generation output
  - returns validation errors for weak input
  - blocks revision of non-draft or assigned campaigns

- `campaign-test-against-primary-api.test.ts`
  - creates a two-campaign experiment with 50/50 weights
  - returns a clear error when no primary campaign exists
  - verifies tenant ownership

### Component Tests

- AI builder page sends chat input and renders generated preview.
- Preview shows strategy brief and phase list.
- Action buttons route correctly.

### Manual Tests

Use these prompts:

```text
I want a low-friction campaign that builds trust and tells people to check if they qualify for our service.
```

```text
I want a straightforward campaign that answers questions immediately, understands what they want to buy, then re-engages them to close.
```

```text
Make phase 1 softer and more Taglish.
```

Expected results:

- Campaign is saved as draft.
- Phases match the motion, not literal CLOSER labels.
- Messaging is concise and human.
- The draft can be edited, tested against primary, or promoted.

---

## 9. Success Criteria

This feature is successful when a tenant can create a new campaign by describing the desired selling motion in plain language, then choose whether to edit, test, or promote it without understanding the underlying campaign and experiment machinery.

The generated bot strategy should feel more human and more likely to close because it can adapt to different motions: direct answer-first selling, trust-first qualification, discovery-first matching, fast booking, and objection recovery.

The system should hide complexity while still preserving expert control for users who want to inspect and edit phases.
