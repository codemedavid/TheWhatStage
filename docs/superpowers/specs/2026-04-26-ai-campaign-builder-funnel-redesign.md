# AI Campaign Builder — Funnel Redesign

**Date:** 2026-04-26
**Status:** Draft (awaiting user review)
**Scope:** Spec 1 of 3 in the chatbot-flow rebuild. Specs 2 and 3 (campaign model rewrite, conversation engine rewrite) follow.

## Problem

The current AI builder produces campaigns that don't drive action. The chatbot over-chats, never sends action pages, and treats "phases" with min-message gates as the structural unit. Result: leads churn in chat instead of getting routed to the page where they convert.

The root cause is that today's campaign model centers on chat phases. It should center on the **destination** — the action page the lead needs to reach to convert.

## Mental Model

A campaign is a **DM funnel**: an ordered sequence of 1..N **funnels**. Each funnel has a single action page (the destination for that step) and chat rules that tell the bot how to drive the lead to click. Lead progresses funnel → funnel by completing the action.

Examples:

- 1-funnel: `sales` → pitch lightly, send page.
- 2-funnel: `qualification → sales` → qualify, then sell.
- 3-funnel: `lead-magnet form → qualification → calendar` → capture, qualify, book.

The AI Builder's job is to make designing this sequence fast and produce a campaign that downstream systems (campaign model, conversation engine) can execute deterministically.

## Out of Scope (this spec)

- The campaign + funnel database schema (spec 2).
- Conversation engine rewrite, awareness detection, fast-forward logic (spec 3).
- Inline action page creation inside the builder (v2).
- Edit mode for existing campaigns (use the regular campaign editor; v2 may add).
- A/B variant generation across funnels.

## Builder UX

The builder is a hybrid: a wizard for structural choices, conversational chat for the open-ended kickoff. Action page selection is **pick-existing-only** in v1.

### Entry & empty state

If the tenant has zero published action pages, block entry with a CTA: "Build your first action page, then come back." The funnel model has no meaning without destinations.

### Step 1 — Conversational kickoff (chat)

One short prompt: *"What are you trying to do with this campaign?"* Tenant answers in their own words. The model uses this only to propose a funnel structure in step 2; it does not branch the rest of the flow.

### Step 2 — Funnel structure (wizard)

The AI proposes a 1-, 2-, or 3-funnel sequence based on step 1's answer and the tenant's available action pages. Tenant can:

- Accept the proposal as-is.
- Add, remove, or reorder funnels.
- For each slot, override the AI's suggested page with any other published action page.

Constraints:

- Minimum 1 funnel, maximum 3 funnels in v1. (3 covers lead-gen → qualify → book, the longest realistic path.)
- A funnel slot must resolve to exactly one published action page before the user can advance.
- Two funnels in the same campaign may point to the same action page; the system does not prevent it but warns.

Output of step 2: an ordered list of `action_page_id`s.

### Step 3 — Per-funnel chat rules (template-driven, repeated per funnel)

For each funnel, the system already knows the action page's `type`. Step 3 is template-driven, not interrogation:

1. **Auto-generate default chat rules** from a per-type template. Templates ship with the system and embody best practices for that page type. See "Templates" below.
2. **Tenant adds a short free-form description** of the page in their own words (e.g. *"Sales page for our $497 coaching program"*). One field, optional but recommended.
3. **Tenant reviews the generated rules** with inline edit affordances:
    - Add a custom rule.
    - Edit any rule.
    - Remove rules.
    - For qualification funnels: add custom qualifying questions/requirements.
4. **Regenerate** button re-runs the template against the latest description (rare; main path is direct edit).

Each funnel's review is its own panel; the tenant moves through them in funnel order.

### Step 4 — Review & generate

Tenant sees a single summary screen: funnel order, action page per slot, chat rules per funnel, top-level campaign rules. Inline edits allowed. On confirm, the AI writes the campaign + funnels (see "Output contract").

## Templates

Templates are first-class artifacts in the codebase, one per action page `type`. Each template produces an array of plain-language chat rules tailored to driving the lead to that page type.

| Page type | Template intent (one-liner) |
|---|---|
| `sales` | Light reinforcement, handle 1–2 common objections, push to page within 2–3 turns. |
| `form` (lead-gen) | Educate, deliver value, sell the pitch, then nudge to fill. Longer chat permitted. |
| `qualification` | Brief pitch + 1–2 qualifying questions, then send the qualification page. |
| `calendar` | Confirm fit + value of meeting, send booking page. |
| `product_catalog` | Ask which product they're interested in (if scope is broad), send relevant catalog/product. |
| `checkout` | Treated like `sales` for chat purposes; closes the loop after a previous funnel. |

Concrete rule text for each template ships with the implementation. The exact wording is a content task, not a design decision; the spec only fixes the *intent* per type.

The tenant's free-form page description from step 3 is appended to the template output as additional context the conversation engine can use.

## Output Contract

On generate, the builder writes the following. Field-level only — schema details are spec 2's problem.

1. **One campaign row**:
    - `name`, `description`, `is_primary` (existing fields).
    - `goal` derived from the *last* funnel's action page type (the conversion step):
        - `sales`/`checkout` → `purchase`
        - `form` → `form_submit`
        - `qualification` → `qualified` (new goal value, spec 2 to add)
        - `calendar` → `appointment_booked`
        - `product_catalog` → `purchase` (catalog feeds checkout)
    - `top_level_rules` — a small array of cross-cutting rules (tone, brand voice, hard "do not say"s) generated from step 1.
2. **Ordered funnel rows** (new entity, spec 2 defines table):
    - `campaign_id`, `position` (0-indexed), `action_page_id`, `chat_rules` (text array), `page_description` (tenant's step-3 free text).
3. **No phase rows** are written. The legacy `campaign_phases` model is replaced; spec 2 handles migration of existing campaigns.

## What the Builder Does Not Do (v1)

- No inline action page creation. Pick from existing only.
- No edit mode for existing campaigns. Builder is create-only; edits happen in the campaign editor.
- No fast-forward configuration. Whether the bot can advance a lead past a funnel on chat signal is spec 3's call.
- No A/B variants per funnel.
- No more than 3 funnels.

## Open Questions for Spec 2 (Campaign Model)

These are decisions spec 2 must resolve so this builder can write its output:

1. Funnel storage — new `campaign_funnels` table or extension of `campaign_phases`?
2. `chat_rules` storage shape — text array, or structured (rule + category)?
3. New `goal` enum value `qualified` — or should qualification funnels keep the goal of the *next* funnel?
4. Migration strategy for existing campaigns currently using `campaign_phases`.
5. Top-level campaign rules — new column on `campaigns`, or reuse `campaign_rules`?

## Open Questions for Spec 3 (Conversation Engine)

Surfaced here so they aren't forgotten:

1. How does the bot detect "interest" within a funnel before sending the page? (Replaces awareness ladder.)
2. Fast-forward: what chat signals advance a lead past a funnel without action completion?
3. Hard cap on chat turns per funnel before forcibly sending the action page?
4. What happens after the lead completes the *last* funnel? (Stop messaging, mark converted, hand off?)

## Success Criteria

- A tenant can produce a working 1–3 funnel campaign from the builder in under 5 minutes.
- The output contract is complete enough that spec 2 can build the schema without re-asking design questions.
- Template-driven step 3 means no funnel ever ships with an empty `chat_rules` array.
- Generated campaigns have a clearly identified conversion destination (the last funnel's action page).

## Testing

- Unit tests for each template's rule generator (input: page metadata; output: stable rule array).
- Component tests for the funnel-structure wizard (add/remove/reorder, validation).
- Integration test for the full builder flow against a seeded tenant with the 6 page types.
- E2E: create a 3-funnel campaign end-to-end and assert the persisted campaign + funnel rows.
