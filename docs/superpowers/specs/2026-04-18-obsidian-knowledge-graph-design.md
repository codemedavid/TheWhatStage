# WhatStage — Obsidian Knowledge Graph & Auto-Doc Skills

**Date:** 2026-04-18
**Status:** Approved
**Scope:** Obsidian vault structure, two Claude Code skills (obsidian-bootstrap + feature-doc), and complete feature map for WhatStage

---

## 1. Overview

WhatStage is a multi-tenant Messenger Funnel platform with 9 subsystems and 41 features. This spec defines:

1. An **Obsidian knowledge graph** that documents every feature, DB entity, UI component, and user flow with full cross-referencing via wikilinks
2. An **obsidian-bootstrap** skill that scans the existing codebase and seeds the vault
3. A **feature-doc** skill that auto-generates Obsidian notes for new features and keeps MOCs updated

## 2. Obsidian Vault Structure

```
whatstage_obsidian/
├── Features/          # One note per feature (41 features)
├── Entities/          # One note per DB table (23 tables)
├── Components/        # One note per UI page/component (~18)
├── Flows/             # End-to-end user journeys (~10)
└── Index/             # MOC dashboards (4 files)
```

### Folder Purposes

- **Features/** — Business capabilities (e.g., Lead Pipeline, Qualification Engine). Links to entities, components, and flows.
- **Entities/** — Database tables. Schema, relationships (FKs as wikilinks), RLS policies, which features/components use them.
- **Components/** — React pages and components. File path, route, data consumed, parent feature.
- **Flows/** — User journeys with Mermaid flowchart + numbered step-by-step with wikilinks at each step.
- **Index/** — 4 MOC files: System Overview, Database Schema Map, Feature Roadmap, Component Registry.

## 3. Note Templates

### 3.1 Feature Note

```markdown
---
tags: [feature, {subsystem}]
status: planned | in-progress | complete
subsystem: {subsystem-slug}
created: {YYYY-MM-DD}
---

# {Feature Name}

## Description
{What this feature does and why it exists}

## Entities
- [[{table_name}]] — {role in this feature}

## Components
- [[{ComponentName}]] — {role}

## Flows
- [[{Flow Name}]]

## API Routes
- `{METHOD} {path}` — {purpose}

## Notes
{Additional context, decisions, TODOs}
```

### 3.2 Entity Note

```markdown
---
tags: [entity, {subsystem}]
table: {table_name}
subsystem: {subsystem-slug}
created: {YYYY-MM-DD}
---

# {table_name}

## Schema
| Column | Type | Constraints |
|--------|------|------------|
| {col} | {type} | {constraints} |

## Relationships
- Belongs to [[{parent_table}]] ({fk_column})
- Has many [[{child_table}]]

## Used By Features
- [[{Feature Name}]]

## Used By Components
- [[{ComponentName}]]

## RLS Policy
`{policy_name}` — {description}
```

### 3.3 Component Note

```markdown
---
tags: [component, {type: page|component|api-route}, {subsystem}]
file_path: {src/path/to/file.tsx}
route: {/route/path}
subsystem: {subsystem-slug}
created: {YYYY-MM-DD}
---

# {ComponentName}

## Description
{What this component renders/does}

## Route
`{/route/path}` ({context: marketing | tenant dashboard | action page})

## Data Consumed
- [[{table_name}]] — {how it's used}

## Part Of
- [[{Feature Name}]]

## Source
`{src/path/to/file.tsx}`
```

### 3.4 Flow Note

```markdown
---
tags: [flow, {subsystem}]
subsystem: {subsystem-slug}
created: {YYYY-MM-DD}
---

# {Flow Name}

## Diagram
```mermaid
flowchart LR
    A[{Step 1}] --> B[{Step 2}]
    B --> C[{Step 3}]
    ...
```

## Steps
1. **{Step description}** → [[{Feature/Entity/Component}]] {detail}
2. **{Step description}** → [[{Feature/Entity/Component}]] {detail}
...

## Entities Involved
- [[{table_name}]], [[{table_name}]]

## Components Involved
- [[{ComponentName}]], [[{ComponentName}]]
```

## 4. Index / MOC Files

### 4.1 System Overview (`Index/System Overview.md`)

Contains:
- Mermaid architecture diagram showing all 9 subsystems and their connections
- Subsystem table with links to all features and status

### 4.2 Database Schema Map (`Index/Database Schema Map.md`)

Contains:
- Mermaid ER diagram of all 23 tables
- Tables grouped by subsystem with wikilinks

### 4.3 Feature Roadmap (`Index/Feature Roadmap.md`)

Contains:
- Status legend (planned/in-progress/complete)
- Table: Feature | Subsystem | Status | Entities | Components
- `<!-- AUTO-UPDATED -->` marker where feature-doc appends new entries

### 4.4 Component Registry (`Index/Component Registry.md`)

Contains:
- Pages grouped by section (Marketing, Tenant Dashboard, Action Pages)
- API routes table
- Shared components table
- `<!-- AUTO-UPDATED -->` marker for new entries

## 5. Skill 1: obsidian-bootstrap

**Location:** `.claude/skills/obsidian-bootstrap/`

**Purpose:** One-time scan of the existing codebase to seed the Obsidian vault.

**When to use:** Run once at project start. Can be re-run to resync — this deletes all generated vault content and regenerates from current codebase state.

### Process

1. **Create vault folders** — `Features/`, `Entities/`, `Components/`, `Flows/`, `Index/`
2. **Scan DB schema** — parse `supabase/migrations/*.sql` and `src/types/database.ts`
   - Extract all tables, columns, types, constraints, foreign keys
   - Generate one Entity note per table using the template
   - Wire FK relationships as wikilinks between entity notes
3. **Scan source files** — glob `src/app/**/*` and `src/components/**/*`
   - Generate one Component note per page and shared component
   - Extract route paths from directory structure
   - Map file paths to subsystems using the subsystem mapping
4. **Generate feature notes** — create one Feature note per feature from the feature map (Section 7)
   - Link to relevant entities and components
   - Set initial status to `planned`
5. **Generate flow notes** — create core user journey flows:
   - Lead Qualification Flow
   - Appointment Booking Flow
   - Product Purchase Flow
   - Messenger Webhook Flow
   - Tenant Onboarding Flow
   - Bot Conversation Flow
   - Workflow Execution Flow
   - Action Page Submission Flow
   - RAG Knowledge Retrieval Flow
   - Conversation Review & Correction Flow
6. **Build MOC files** — generate all 4 Index files
7. **Validate** — check all wikilinks resolve to existing notes, report any broken links

### File Structure

```
.claude/skills/obsidian-bootstrap/
├── SKILL.md
└── references/
    ├── templates.md        # All 4 note templates
    ├── subsystems.md       # Table/route → subsystem mapping
    ├── feature-map.md      # Complete feature list (41 features)
    └── moc-templates.md    # MOC templates
```

## 6. Skill 2: feature-doc

**Location:** `.claude/skills/feature-doc/`

**Purpose:** Triggered when implementing a new feature. Generates Obsidian notes and updates existing ones.

**When to use:** After adding a new feature, API route, component, DB migration, or user flow.

### Process

1. **Identify what's new** — ask the user what was built (feature name, subsystem, what entities/components/flows are involved). If invoked right after implementation, also scan recent file changes for context:
   - New feature? → Feature note
   - New DB table/migration? → Entity note(s)
   - New page/component? → Component note(s)
   - New user journey? → Flow note
2. **Generate notes** — create notes using shared templates from `references/templates.md`
3. **Update existing notes** — add wikilinks to related existing notes:
   - If new entity → update Feature notes that use it
   - If new component → update Feature notes it belongs to
   - If new feature → update Entity notes with "Used By Features"
4. **Generate flow** — if the feature involves a user-facing journey, create a Flow note with Mermaid diagram + step-by-step
5. **Update MOCs** — append new entries to:
   - Feature Roadmap (new features)
   - Component Registry (new components/pages)
   - Database Schema Map (new entities)
   - System Overview (if new subsystem)
6. **Validate links** — check all wikilinks in new/updated notes resolve to existing notes

### File Structure

```
.claude/skills/feature-doc/
├── SKILL.md
└── references/
    ├── templates.md        # Shared note templates (same as bootstrap)
    └── subsystems.md       # Subsystem mapping (same as bootstrap)
```

## 7. Complete Feature Map

### 7.1 Auth & Multi-tenancy (4 features)

| Feature | Description | Entities |
|---------|-------------|----------|
| Auth Flow | Supabase auth — signup, login, callback, session management | tenant_members |
| Tenant Routing | Wildcard subdomain resolution — middleware extracts slug, resolves tenant_id | tenants |
| Tenant Management | Settings — business type, bot goal, FB credentials, team members | tenants, tenant_members |
| Onboarding | New tenant creation wizard — slug, name, business type, bot goal, FB connect | tenants, tenant_members |

### 7.2 Messenger Bot Engine (5 features)

| Feature | Description | Entities |
|---------|-------------|----------|
| Webhook Handler | Receive & verify FB webhooks — signature validation, event parsing, tenant routing | — |
| Message Handling | Process incoming messages — create/update lead, log conversation, trigger bot flows | leads, conversations, messages, lead_events |
| Send API | Send messages — text, images, action buttons with URLs to action pages | messages |
| Bot Flows | Configurable triggers — keyword match, first message, postback → response templates | bot_flows |
| AI Reasoning | HuggingFace integration — context evaluation, intent detection, stage recommendation | leads, lead_events, knowledge_chunks |

### 7.3 Lead Management (4 features)

| Feature | Description | Entities |
|---------|-------------|----------|
| Lead Pipeline | Kanban board — drag leads between stages, filter by tags, search | leads, stages |
| Lead Profile | Detail view — FB info, stage history, activity timeline, tags, notes | leads, lead_events, qualification_responses |
| Activity Tracking | Event log — messages, form submits, appointments, purchases, stage changes | lead_events |
| Stage Management | Configure stages — add/remove/reorder, custom colors, auto-move rules | stages |

### 7.4 Action Pages (6 features)

| Feature | Description | Entities |
|---------|-------------|----------|
| Form Pages | Configurable lead capture forms — fields, validation, submit → lead_event | action_pages, action_submissions |
| Calendar Booking | Appointment scheduler — available slots, booking confirmation, reminders | action_pages, appointments |
| Sales Pages | Landing pages — product showcase, CTA buttons, testimonials | action_pages |
| Product Catalog | E-commerce pages — product grid, detail view, cart, add to cart | action_pages, products |
| Checkout | Order completion — cart summary, payment reference, order confirmation | orders, action_submissions |
| Action Page Builder | Dashboard UI — create/edit action pages, configure fields, preview, publish | action_pages |

### 7.5 Commerce (3 features)

| Feature | Description | Entities |
|---------|-------------|----------|
| Product Management | CRUD products — name, price, images (Cloudinary), stock tracking | products |
| Order Management | View/manage orders — status updates, order history | orders |
| Appointment Management | View/manage bookings — confirm, cancel, reschedule, calendar view | appointments |

### 7.6 Workflows & Automation (4 features)

| Feature | Description | Entities |
|---------|-------------|----------|
| Workflow Engine | Core execution — trigger evaluation, step processing, run logging | workflows, workflow_steps, workflow_runs |
| Workflow Builder | Dashboard UI — visual step editor, trigger config, enable/disable | workflows, workflow_steps |
| Workflow Steps | Step types — send message, send image, wait, condition, move stage, tag, HTTP | workflow_steps |
| Workflow Triggers | Event-based — on form submit, on purchase, on stage change, on appointment | workflows |

### 7.7 Tenant Dashboard (3 features)

| Feature | Description | Entities |
|---------|-------------|----------|
| Dashboard Home | Overview — lead count, recent activity, stage distribution, quick actions | leads, lead_events, stages |
| Conversation Inbox | Live chat — message history per lead, send manual messages, Supabase realtime | conversations, messages, leads |
| Analytics | Funnel metrics — conversion rates, action page performance, lead sources | lead_events, action_submissions, leads |

### 7.8 RAG & Bot Training (6 features)

| Feature | Description | Entities |
|---------|-------------|----------|
| Knowledge Base | Tenant uploads docs, FAQs, product info — stored and chunked for retrieval | knowledge_docs, knowledge_chunks |
| RAG Pipeline | Chunk → embed → vector store. Bot retrieves relevant context per conversation | knowledge_chunks |
| Bot Rules & Persona | Define behavior rules, tone, boundaries that guide AI responses | bot_rules |
| Test Conversation | Sandbox chat — tenant talks to their own bot, sees RAG context, tests actions | conversations, messages |
| Conversation Review | Review past conversations — flag bad responses, corrections become rules | conversation_corrections, bot_rules |
| Training Dashboard | Unified UI — upload docs, set rules, define goal, test, review, iterate | knowledge_docs, bot_rules |

**New DB tables:**
- `knowledge_docs` — uploaded documents (title, content, type, tenant_id)
- `knowledge_chunks` — chunked + embedded text (doc_id, content, embedding, metadata)
- `bot_rules` — behavior rules (tenant_id, rule_text, source: manual | correction, enabled)
- `conversation_corrections` — flagged responses (conversation_id, message_id, correction_text, applied_as_rule)

### 7.9 Goal-Driven Actions (6 features)

| Feature | Description | Entities |
|---------|-------------|----------|
| Goal Configuration | Set primary goal (qualify, book, sell, collect) — shapes bot personality and strategy | tenants (bot_goal field) |
| Qualification Engine | Quiz-style form builder — conditional questions, scoring, auto-tag + auto-stage | qualification_forms, qualification_responses |
| Qualification Data View | See every answer, score, triggered conditions, resulting tags/stage | qualification_responses, leads |
| Booking Integration | Bot motivates booking → pushes calendar → appointment on dashboard | appointments, action_pages |
| Sales Push | Bot showcases products → pushes catalog/checkout → order tracked | products, orders, action_pages |
| Action Conditions | If/then rules on form answers — e.g. budget > $10k → tag + stage + workflow | action_conditions |

**New DB tables:**
- `qualification_forms` — form config (tenant_id, fields, scoring_rules, conditions)
- `qualification_responses` — lead answers (form_id, lead_id, answers, score, triggered_conditions)
- `action_conditions` — if/then rules (tenant_id, action_page_id, condition, actions: tag/stage/workflow)

### Goal → System Behavior Matrix

| Bot Goal | Bot Personality | Action Pushed | Data Stored | Auto Result |
|----------|----------------|---------------|-------------|-------------|
| Qualify Leads | Probing, curious, motivates form fill | Qualification quiz | All answers + score | Tag + stage move + workflow trigger |
| Book Appointments | Urgent, highlights availability | Calendar booking page | Appointment details | Appointment on dashboard |
| Sell Products | Persuasive, showcases value | Product catalog + checkout | Order + items | Order tracked, lead → Customer |
| Collect Info | Friendly, asks for details | Lead capture form | Form submissions | Lead enriched, tagged |

## 8. Totals

| Metric | Count |
|--------|-------|
| Subsystems | 9 |
| Features | 41 |
| DB tables (existing) | 16 |
| DB tables (new) | 7 |
| DB tables (total) | 23 |
| UI components/pages | ~18 |
| Core user flows | ~10 |
| MOC index files | 4 |
| **Total Obsidian notes** | **~85+** |
