# Campaign + Funnel Data Model

**Date:** 2026-04-26
**Status:** Draft (paired with `2026-04-26-ai-campaign-builder-funnel-redesign.md`)
**Scope:** Spec 2 of 3 in the chatbot-flow rebuild. Defines the persistence layer that the AI Builder writes to and the future conversation engine reads from.

## Problem

The current `campaign_phases` table encodes assumptions we're discarding: per-phase `max_messages` gates, free-form `system_prompt` per phase, and an implicit awareness ladder driven by phase order. The new model is an ordered sequence of **funnels**, each tied to one action page with plain-language chat rules.

## Decisions

The five open questions from spec 1 are resolved as follows:

1. **Storage:** new `campaign_funnels` table. The `campaign_phases` table is deprecated and stops being read by new code. (See "Deprecation," below.)
2. **`chat_rules` shape:** plain `text[]` (string array). No category, priority, or structure in v1.
3. **Goal enum:** unchanged. The campaign's `goal` is derived from the *last* funnel's action page type, mapping into the existing `(form_submit | appointment_booked | purchase | stage_reached)` set. No `qualified` goal.
4. **Migration:** none. Existing campaigns built on `campaign_phases` are not auto-migrated. Tenants rebuild via the new AI Builder. The dashboard should surface campaigns that have no funnels as "needs rebuild."
5. **Top-level rules:** reuse the existing `campaign_rules` column (or array on `campaigns`, see schema below).

## Schema

New migration: `supabase/migrations/0021_campaign_funnels.sql`.

```sql
create table campaign_funnels (
  id              uuid primary key default uuid_generate_v4(),
  campaign_id     uuid not null references campaigns(id) on delete cascade,
  tenant_id       uuid not null references tenants(id) on delete cascade,
  position        integer not null,
  action_page_id  uuid not null references action_pages(id) on delete restrict,
  page_description text,
  chat_rules      text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (campaign_id, position)
);

create index on campaign_funnels (campaign_id);
create index on campaign_funnels (tenant_id);

alter table campaign_funnels enable row level security;
create policy "campaign_funnels_all" on campaign_funnels for all
  using (tenant_id = current_tenant_id());
```

**Notes:**
- `position` is 0-indexed, contiguous, unique per campaign. Application enforces contiguity; DB enforces uniqueness.
- `action_page_id` uses `on delete restrict` — deleting a published action page that's wired into a funnel must be blocked at the action page editor level.
- `page_description` is the tenant's free-form note from builder step 3.
- `chat_rules` is an ordered array; the conversation engine concatenates them as bullets in the system prompt.

## `campaign_rules` Column

The existing migration `0016_campaign_plan_and_rules.sql` already adds a `campaign_rules text[]` column to `campaigns`. This stays. Top-level rules from builder step 4 land here.

If `0016` does not yet add this column on the deployed environment, the implementation plan must verify and add it.

## Deprecation Strategy for `campaign_phases`

- New code does not read from `campaign_phases`.
- The conversation engine (spec 3) will read from `campaign_funnels` only.
- The legacy table is not dropped in this spec — drop is gated on confirming nothing reads from it (a follow-up cleanup migration after spec 3 ships).
- The AI Builder does not write to `campaign_phases`.

## TypeScript Types

Add to `src/types/database.ts` via the generated supabase types refresh, plus a domain type in `src/types/campaign.ts`:

```ts
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
```

## Validation Rules

Enforced in the application layer (not DB):

- A campaign must have 1..3 funnels.
- `position` values must be `[0, 1, ..., N-1]` with no gaps.
- Each `action_page_id` must reference a published action page in the same tenant.
- `chat_rules` may be empty in DB but the builder always writes at least one rule per funnel.

## Goal Derivation

When the AI Builder generates a campaign, `campaigns.goal` is set from the last funnel's action page type:

| Last funnel page type | `goal` |
|---|---|
| `sales` | `purchase` |
| `checkout` | `purchase` |
| `product_catalog` | `purchase` |
| `form` | `form_submit` |
| `qualification` | `form_submit` |
| `calendar` | `appointment_booked` |

The `goal_config` JSONB is unused by the new model in v1; leave as default `{}`.

## Testing

- DB migration test: apply `0021`, insert a campaign + 3 funnels, verify uniqueness and cascade.
- Repository test: a `getCampaignFunnels(campaignId)` helper returns funnels ordered by `position`.
- Validation test: rejecting non-contiguous `position` values, > 3 funnels, action pages from wrong tenant.

## Open Questions for Spec 3

- Action completion → funnel advancement: what writes the "this funnel is done" signal? (Webhook from action page submission? `lead_events`?)
- Where does per-lead funnel progress live? New `lead_campaign_progress` table or column on `lead_campaign_assignments`?

These belong to spec 3 because they're conversation-engine concerns. The data model here doesn't pre-decide them.
