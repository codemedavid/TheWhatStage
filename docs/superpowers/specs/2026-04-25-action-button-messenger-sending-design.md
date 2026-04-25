# Action Button Sending via Messenger

**Date:** 2026-04-25
**Status:** Approved

## Overview

When a lead is in a campaign phase that has action buttons attached, the AI decides when to send one based on conversation context. The button is sent as a Facebook Messenger button template with a signed URL containing the lead's PSID, tying every action page interaction back to the Messenger lead.

## Decisions

- **Timing:** AI decides when to send (not auto-triggered on phase entry)
- **CTA text:** Tenant sets a default per action page; AI can personalize it
- **Quantity:** One button per message (AI picks the most relevant)

## Data Model Changes

### Add `cta_text` to `action_pages` table

```sql
ALTER TABLE action_pages ADD COLUMN cta_text TEXT;
```

- Tenant-configured default call-to-action message (e.g., "Book your free consultation now!")
- Set via the action page editor in the dashboard
- Falls back to generic default if empty (e.g., "Check this out")

No other schema changes needed. `action_button_ids` on `campaign_phases` already exists, `ButtonMessage` type exists in `send.ts`, and PSID signing is implemented.

## Conversation Engine Changes

### 1. Prompt Builder (`prompt-builder.ts`)

When building the system prompt, if the current phase has `actionButtonIds`, fetch the corresponding action pages and include them:

```
You have the following action buttons available for this phase:
- id: "abc-123" | title: "Free Consultation Booking" | type: calendar | default_cta: "Book your free consultation now!"
- id: "def-456" | title: "Product Catalog" | type: product_catalog | default_cta: "Browse our products"

When you feel the lead is ready, include ONE action button in your response by setting action_button_id to the button's id. You may also write a personalized cta_text, or leave it blank to use the default. Only send a button when the timing feels natural — after building rapport or qualifying the lead. Do not send a button in every message.
```

### 2. Decision Parser (`decision-parser.ts`)

Extend the AI's structured output with two new optional fields:

```json
{
  "message": "That sounds great! I think you'd really benefit from...",
  "phase_action": "none",
  "confidence": 0.85,
  "image_ids": [],
  "action_button_id": "abc-123",
  "cta_text": "I've set up a special booking page just for you — grab your spot!"
}
```

- `action_button_id` — optional UUID, must match one of the phase's available button IDs
- `cta_text` — optional string, AI's personalized CTA

### 3. Engine Output (`conversation-engine.ts`)

Extend `EngineOutput` to include:

```typescript
actionButton?: {
  actionPageId: string;
  ctaText: string;
}
```

After parsing the decision, if `action_button_id` is present:
1. Validate it exists in the phase's `actionButtonIds`
2. Resolve CTA text: AI custom > action page `cta_text` > generic fallback ("Check this out")
3. Include in engine output

### 4. Webhook Handler (`webhook/route.ts`)

After getting the engine output, if `actionButton` is present:

1. Fetch the action page record (need the `slug` and `title`)
2. Build the signed URL: `/a/{slug}?psid={psid}&sig={sig}`
3. Construct full URL: `https://{tenant}.whatstage.com/a/{slug}?psid={psid}&sig={sig}`
4. Send the AI's text message first (normal conversational reply)
5. Send a `ButtonMessage` with the CTA text and a single `web_url` button

### Button Message Structure (FB API)

```json
{
  "recipient": { "id": "{psid}" },
  "message": {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "button",
        "text": "I've set up a special booking page just for you — grab your spot!",
        "buttons": [{
          "type": "web_url",
          "url": "https://tenant.whatstage.com/a/free-consultation?psid=123&sig=abc",
          "title": "Free Consultation Booking"
        }]
      }
    }
  }
}
```

The lead sees:
1. A natural text reply from the bot
2. Followed by a button card with the CTA and a clickable button

## Tracking

No new tracking needed. The existing `action_submissions` table already stores `psid` and `lead_id` when a form is submitted from an action page. The PSID in the URL ties the action back to the Messenger lead.

## UI Changes

**Action Page Editor** — add a "Call to Action Text" input field for the `cta_text` column. Simple text input with placeholder like "Enter the default CTA message for this button."

## Out of Scope

- Sending multiple buttons in one message
- Auto-sending buttons on phase entry
- New action page types
- Button click-through analytics dashboard
