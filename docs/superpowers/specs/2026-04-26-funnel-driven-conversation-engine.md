# Funnel-Driven Conversation Engine

**Date:** 2026-04-26
**Status:** Approved for planning
**Related:**
- `docs/superpowers/specs/2026-04-26-ai-campaign-builder-funnel-redesign.md`
- `docs/superpowers/specs/2026-04-26-campaign-funnel-data-model.md`
- `docs/superpowers/plans/2026-04-26-ai-builder-and-funnel-model.md` (this spec is the deferred Spec 3)

## Goal

Replace the `campaign_phases` runtime with a `campaign_funnels`-driven conversation engine on **both** the production messenger path and the test-chat path. After this lands, every campaign created by the AI builder runs end-to-end in test-chat and in prod with no further wiring.

## Non-goals

- Migrating or dropping `campaign_phases` / `bot_flow_phases` tables (tables stay; readers are removed).
- Wiring funnel auto-advance into real action-submission webhooks (helper exists, no callsite).
- Stage progression on funnel completion.
- Lead-level funnel analytics.

## Architecture

```
                ┌──────────────────────────┐
                │ campaign_funnels (1..3)  │
                │ - action_page_id         │
                │ - chat_rules[]           │
                │ - page_description       │
                └──────────┬───────────────┘
                           │
                           ▼
   ┌─────────────────────────────────────────┐
   │ funnel-runtime                          │
   │  load / init / advance / increment      │
   │  funnelToStep(funnel, all, campaign,    │
   │               messageCount) → StepCtx   │
   └──────────┬──────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────────┐
   │ buildSystemPrompt(step: StepContext)    │
   │  (refactored: no CurrentPhase)          │
   └──────────┬──────────────────────────────┘
              │
   ┌──────────┴──────────────┐
   ▼                         ▼
prod conversation-engine    test-chat route
(uses conversations row)    (uses in-memory TestSession)
```

## Data model

Migration `supabase/migrations/0022_conversations_funnel_state.sql`:

```sql
alter table conversations
  add column current_campaign_id        uuid null references campaigns(id) on delete set null,
  add column current_funnel_id          uuid null references campaign_funnels(id) on delete set null,
  add column current_funnel_position    integer not null default 0,
  add column funnel_message_count       integer not null default 0;

create index on conversations (current_campaign_id);
create index on conversations (current_funnel_id);
```

No `conversation_funnels` table. State is conversation-scoped; one campaign + funnel active at a time.

## Modules

### `src/lib/ai/funnel-runtime.ts` (new)

```ts
loadFunnelsForCampaign(service, campaignId): CampaignFunnel[]
getOrInitFunnelState(service, conversationId, campaignId, funnels): {
  funnel: CampaignFunnel; position: number; messageCount: number;
}
advanceFunnel(service, conversationId, funnels): {
  funnel: CampaignFunnel; position: number; advanced: boolean; completed: boolean;
}
incrementFunnelMessageCount(service, conversationId): void
markFunnelCompletedByActionPage(
  service, conversationId, actionPageId
): { advanced: boolean }   // helper only; no caller wired in this slice
```

Behavior:
- `getOrInit` writes `current_campaign_id`, `current_funnel_id`, `current_funnel_position=0`, `funnel_message_count=0` if `current_funnel_id` is null OR campaign changed.
- `advanceFunnel` no-ops at last funnel; returns `{ advanced: false, completed: true }`.
- `markFunnelCompletedByActionPage` is a thin helper for a future webhook; it advances iff the page id matches `current_funnel_id`'s `action_page_id`.

### `src/lib/ai/step-context.ts` (new) + prompt-builder refactor

Replace `CurrentPhase` with:

```ts
export interface StepContext {
  name: string;            // "Step 2 of 3 — Discovery Call"
  position: number;        // 0-based
  total: number;
  instructions: string;    // chat_rules joined + "\n\nPage context: " + page_description
  tone: string;            // tenant persona_tone
  goal: string | null;     // campaign.goal mapped to a sentence
  transitionHint: string | null; // derived from page type ("advance when lead has agreed to view the page")
  messageCount: number;
  maxMessages: number;     // default 8
  actionButtonIds: string[]; // [funnel.action_page_id]
}

export function funnelToStep(
  funnel: CampaignFunnel,
  allFunnels: CampaignFunnel[],
  campaign: { goal: string },
  page: { title: string; type: ActionPageType },
  tone: string,
  messageCount: number
): StepContext
```

`buildSystemPrompt` signature changes:

```ts
buildSystemPrompt(ctx: PromptContext)  // ctx.currentPhase → ctx.step: StepContext
```

`buildPhaseContext` is renamed `buildStepContext` and reads from `step`. Other layers untouched.

### `src/lib/ai/conversation-engine.ts`

- Remove imports of `phase-machine`.
- After `getOrAssignCampaign`:
  - `funnels = await loadFunnelsForCampaign(service, campaignId)`
  - If empty → return `{ message: "", paused: true, ...zeros }`. Engine stays silent; logged once.
  - `state = await getOrInitFunnelState(...)`
  - Look up the funnel's action page (`title`, `type`) once.
  - Build `step` via `funnelToStep`.
- On `decision.phase_action === "advance"` → `advanceFunnel`. If `completed` → set `completedFunnel: true` in output (still respond to the lead).
- `incrementFunnelMessageCount(conversationId)` replaces `incrementMessageCount(conversationPhaseId)`.

`EngineOutput` adds `completedFunnel?: boolean`.

### `src/app/api/bot/test-chat/route.ts` + `src/lib/ai/test-session.ts`

`TestSession` shape:

```ts
{
  id; tenantId;
  campaignId: string | null;
  funnels: Array<CampaignFunnel & { pageTitle: string; pageType: ActionPageType }>;
  currentFunnelIndex: number;
  funnelMessageCount: number;
  history; createdAt;
}
```

Route changes:
- Replace `loadPhases` with `loadFunnelsForCampaign`. Join action page (title, type) once.
- If `campaignId == null` → **auto-seed**: pick the first published action page for the tenant and synthesize an in-memory single funnel:
  ```ts
  { id: "auto-seed", actionPageId: page.id, position: 0,
    chatRules: defaultRulesForPageType(page.type), pageDescription: null, ... }
  ```
  If the tenant has no published page → 400 with the same empty-state message used by the AI builder.
- Replace `jumpToPhaseId` with `jumpToFunnelId`.
- Add `simulateActionCompleted: boolean` — when true, advance the session funnel (covers the "real action" leg of the hybrid advance signal) before generating the next reply.
- Build the same `StepContext` and call the refactored `buildSystemPrompt`.

Request schema:

```ts
{
  message: string; sessionId: string;
  campaignId: string|null;
  jumpToFunnelId?: string;
  simulateActionCompleted?: boolean;
  reset?: boolean;
}
```

Response shape:

```ts
{
  reply, confidence, phaseAction,           // unchanged keys
  funnelAdvanced: boolean,
  currentFunnel: { id, pageTitle, pageType, index, total, messageCount, maxMessages },
  queryTarget, retrievalPass, chunks
}
```

### Removal

In this slice, delete:
- `src/lib/ai/phase-machine.ts`
- `src/lib/ai/phase-templates.ts`
- `tests/unit/phase-machine.test.ts` (if present)
- `tests/unit/phase-templates.test.ts` (if present)
- All references to `bot_flow_phases` in engine + test-chat + their tests.

Tables `campaign_phases` and `bot_flow_phases` stay. Other readers (admin UI, analytics) — leave untouched; they are out of scope.

## Test plan

Unit:
- `funnel-runtime.test.ts` — init from clean conversation; advance from 0 to 1; last-funnel no-op returns `completed:true`; campaign change re-initializes; `markFunnelCompletedByActionPage` matches/non-matches.
- `step-context.test.ts` — `funnelToStep` produces expected name/instructions/transitionHint per page type; instructions include all chat_rules and the page_description when present.
- `prompt-builder.test.ts` — refactored signature compiles; `buildSystemPrompt` injects step instructions verbatim; action button id = funnel's action_page_id appears in the action-buttons layer.
- `conversation-engine.test.ts` — campaign with no funnels → silent paused output; advance call invokes `advanceFunnel`; last-funnel advance returns `completedFunnel:true`.
- `test-chat-route.test.ts` — campaign branch; auto-seed branch (no campaign + one published page); 400 when no published page; `simulateActionCompleted` advances the session.

E2E:
- Extend `tests/e2e/ai-builder-funnels.spec.ts`: after save, send a test-chat message and assert a non-empty reply that obeys at least one chat rule (loose substring match on a key term from the seeded rule).

## Risks

- **Old campaigns with phases stop working in prod.** Mitigation: explicit silent-paused response + dashboard surface (out of scope) so the tenant rebuilds via the AI builder. Acceptable per "C" decision.
- **Auto-seeded test-chat funnel uses tenant's first action page** — order is creation time. May surprise tenants with many pages. Acceptable for v1; UI can later let them pick.
- **No `cited_chunks` retention** — unchanged from today, called out so reviewers don't expect new fields.

## Open follow-ups (not in this slice)

1. Action submission webhook → `markFunnelCompletedByActionPage`.
2. Stage progression on `completedFunnel`.
3. UI badge on campaigns whose engine is silent because they have no funnels.
4. Drop `campaign_phases` / `bot_flow_phases` tables once the admin UI stops reading them.
