# Action Pages: Form Creator Design Spec

**Date:** 2026-04-25
**Status:** Approved
**Scope:** Form creator action page — first of several action page types

---

## Overview

Action pages are web pages triggered from Messenger via action buttons. Each page type has a specific goal (form submission, appointment booking, purchase, etc.). Leads open these pages from Messenger, and every interaction is tied back to the lead via PSID.

This spec covers the **form creator** — the first and most flexible action page type. Forms are built as embeddable components so they can be reused inside future action page types (e.g., a form embedded in a property listing page).

---

## Data Model

### Existing Tables (no changes)

- **`action_pages`** — `type` (form, calendar, sales, product_catalog, checkout), `config` (JSONB for styling/layout), `published`, `slug`, `tenant_id`
- **`action_submissions`** — `lead_id`, `psid`, `data` (JSONB snapshot of all submitted values), `action_page_id`
- **`lead_contacts`** — multi-value contact info (email, phone) with `source` field
- **`lead_knowledge`** — key-value structured facts about leads
- **`lead_events`** — event log including `form_submit` type

### New Table: `action_page_fields`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `tenant_id` | uuid | FK → tenants, for RLS |
| `action_page_id` | uuid | FK → action_pages |
| `label` | text | Display label (e.g., "Your Email") |
| `field_key` | text | Submission data key (e.g., "email_address"), auto-generated from label but editable |
| `field_type` | enum | `text`, `email`, `phone`, `textarea`, `select`, `number`, `radio`, `checkbox` |
| `placeholder` | text | Optional placeholder text |
| `required` | boolean | Default false |
| `options` | jsonb | For select/radio/checkbox: `["Option A", "Option B"]` |
| `order_index` | integer | Display order |
| `lead_mapping` | jsonb | Nullable. See Lead Mapping section below |
| `created_at` | timestamptz | Default now() |

**Constraints:**
- Unique on `(action_page_id, field_key)` — no duplicate keys per form
- Unique on `(action_page_id, order_index)` — clean ordering
- RLS policy scoped to `tenant_id`

### Schema Change: `lead_contacts`

Add column:
- `is_primary` — boolean, default false

Add partial unique index: only one primary per `(lead_id, type)` where `is_primary = true`.

### `action_pages.config` JSONB Shape for Forms

```typescript
{
  heading: string;              // "Get a Free Quote"
  description?: string;         // Subheading text
  layout: "single_column" | "two_column" | "with_hero";
  hero_image_url?: string;      // For with_hero layout (Cloudinary URL)
  submit_button_text: string;   // Default "Submit"
  thank_you_message: string;    // "Thanks! We'll be in touch."
  brand_color?: string;         // Override tenant default
}
```

### Lead Mapping

The `lead_mapping` JSONB field on `action_page_fields` controls how submitted values are saved to lead identity:

```typescript
// Auto-mapped for email/phone field types (tenant can override)
{ "target": "lead_contact", "type": "email" }
{ "target": "lead_contact", "type": "phone" }

// Manually mapped by tenant to lead knowledge
{ "target": "lead_knowledge", "key": "budget" }
{ "target": "lead_knowledge", "key": "property_type" }

// No mapping
null
```

- `email` and `phone` field types auto-set their lead mapping when created
- Tenant can override or clear any mapping
- Custom fields can be manually mapped to `lead_knowledge` with a tenant-defined key

---

## Form Builder UI (Tenant Dashboard)

### Location

Existing route: `/app/actions/[id]` — replaces the current stub editor.

### Layout

Two-panel design:
- **Left panel** — Field list with drag-to-reorder, add field button, field configuration (inline expand)
- **Right panel** — Live preview of the form as leads will see it

### Field Configuration (inline expand on select)

- Label and placeholder inputs
- Field type selector (changes available options dynamically)
- Required toggle
- For select/radio/checkbox: option list editor (add/remove/reorder options)
- Lead mapping selector:
  - "None" (default for most types)
  - "Email" / "Phone" → maps to `lead_contacts`
  - "Custom lead knowledge" → text input for key name (e.g., "budget")
- Email and phone field types auto-set their mapping on creation (editable)

### Form Settings (top-level config)

- Heading and description text inputs
- Layout template picker: single column, two column, with hero
- Hero image upload (Cloudinary) — visible only for "with hero" layout
- Submit button text
- Thank-you message (shown to lead after submission)
- Brand color override (color picker, defaults to tenant brand color)

### Interactions

- Drag-to-reorder fields → updates `order_index`
- Add field → appends at bottom, expands config inline
- Delete field → confirmation dialog
- Live preview updates as tenant edits
- Explicit save (Save button) — no auto-save to avoid partial states on published forms
- Published/unpublished toggle in header

---

## Public Form Renderer (Embeddable Component)

### Architecture

- **`FormRenderer` component** — core embeddable component. Accepts `actionPage`, `fields`, and `psid` as props. Handles rendering, validation, and submission. Other action page types will embed this component in the future.
- **`/a/[slug]` page** — standalone wrapper. Resolves tenant context, verifies PSID signature, fetches action page + fields, passes them to `FormRenderer`.

### Rendering

- Applies layout template from config (single column, two column, with hero)
- Renders heading, description, fields in `order_index` order
- Responsive design — optimized for mobile (leads come from Messenger)
- Brand color applied to submit button, focus rings, accents
- Client-side validation: required fields, email format, phone format

### Submission Flow

1. Lead fills form, clicks submit
2. Client-side validation runs
3. `POST /api/action-pages/[id]/submissions` with `{ psid, sig, data: { field_key: value, ... } }`
4. Server-side processing:
   - Verify PSID signature
   - Validate required fields against `action_page_fields` schema
   - Insert into `action_submissions` (full data snapshot as JSONB)
   - For each field with `lead_mapping`:
     - `lead_contact` target → insert into `lead_contacts` with `source: "form_submit"` (additive, no overwrite)
     - `lead_knowledge` target → upsert into `lead_knowledge` (latest value wins — knowledge represents current state, not history)
   - Insert `form_submit` event into `lead_events` with meta: `{ submission_id, form_title }`
   - Send Messenger confirmation message (tenant's thank-you text) via FB Send API
5. Client shows thank-you message from config

### Submission API

**`POST /api/action-pages/[id]/submissions`**

Request:
```typescript
{ psid: string; sig: string; data: Record<string, any> }
```

Response:
```typescript
{ success: true; submission_id: string }
```

---

## Messenger Integration & AI Context

### Confirmation on Submit

On form submission, the server sends the tenant's custom thank-you message to the lead via FB Send API. This is a plain text message — not AI-generated. The tenant controls this text per form in form settings.

### AI Context When Lead Messages Again

The conversation engine already loads lead data into prompts. We extend the prompt builder to include:

- **`lead_contacts`** — all emails and phones on file, so the AI doesn't re-ask for info the lead already provided
- **`lead_knowledge`** — all key-value facts (budget, property type, timeline, etc.)
- **Recent submissions** — summary injected into prompt: "Lead submitted 'Free Quote Form' on Apr 25: budget=$50k, timeline=3 months"

No new AI infrastructure needed — we enrich the existing prompt context. The AI naturally uses the data because it's in the conversation prompt.

### Lead Contact Primary Marking

In the tenant dashboard lead profile view:
- All accumulated contacts displayed grouped by type (emails, phones)
- Each group has a "set as primary" action per contact
- Only one primary per type enforced by database partial unique index
- Primary contact is highlighted in the lead profile

### Event Tracking & Conversion

The `form_submit` event in `lead_events`:
```typescript
{
  event_type: "form_submit",
  action_page_id: uuid,
  meta: { submission_id: uuid, form_title: string }
}
```

If a campaign's goal is `form_submit`, this event triggers campaign conversion tracking.

---

## Multiple Submissions

- Leads can submit the same form multiple times
- Each submission is a separate `action_submissions` row — full history preserved
- Identity fields (email, phone) accumulate in `lead_contacts` — previous values are never overwritten
- A lead can have multiple emails and phones on file from different submissions
- Tenant sees submission history on the lead's profile
- Tenant can mark one contact per type as "primary"

---

## Future Action Page Types (Roadmap Only — No Schema)

The following action page types are planned for future phases. Each will be designed and built separately:

1. **Calendar / Appointment Booking** — embeddable like forms, can be attached to other action pages. Second priority after forms.
2. **Direct Sales Page** — product pitch page with CTA
3. **Product Catalog & Checkout** — browsable product list with cart and checkout flow
4. **Lead Qualification** — structured qualification questionnaire (may extend form creator)
5. **Real Estate Property Listing** — property details with embedded appointment booking

Forms and calendars are the two "flexible" / embeddable action types. Other page types will embed them as needed.
