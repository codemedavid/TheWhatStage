# Feature Map

All 41 WhatStage features organized by subsystem. Used by `bootstrap` to generate Feature notes and by `feature-doc` to append new features.

---

## Auth & Multi-tenancy

### Auth Flow
- **Subsystem:** auth
- **Description:** Supabase auth — signup, login, callback, session management
- **Entities:** [[tenant_members]]
- **Components:** [[LoginPage]], [[SignupPage]], [[AuthCallbackRoute]]

### Tenant Routing
- **Subsystem:** auth
- **Description:** Wildcard subdomain resolution — middleware extracts tenant slug, resolves tenant_id
- **Entities:** [[tenants]]
- **Components:** [[Middleware]]

### Tenant Management
- **Subsystem:** auth
- **Description:** Settings page — business type, bot goal, FB credentials, team members
- **Entities:** [[tenants]], [[tenant_members]]
- **Components:** [[SettingsPage]]

### Onboarding
- **Subsystem:** auth
- **Description:** New tenant creation wizard — slug, name, business type, bot goal, FB page connect
- **Entities:** [[tenants]], [[tenant_members]]
- **Components:** [[OnboardingPage]], [[CreateTenantRoute]]

---

## Messenger Bot Engine

### Webhook Handler
- **Subsystem:** messenger
- **Description:** Receive and verify Facebook webhooks — signature validation, event parsing, tenant routing
- **Entities:** (none directly — delegates to Message Handling)
- **Components:** [[FbWebhookRoute]]

### Message Handling
- **Subsystem:** messenger
- **Description:** Process incoming messages — create/update lead, log conversation, trigger bot flows
- **Entities:** [[leads]], [[conversations]], [[messages]], [[lead_events]]
- **Components:** [[FbWebhookRoute]]

### Send API
- **Subsystem:** messenger
- **Description:** Send messages back to leads — text, images, action buttons with URLs to action pages
- **Entities:** [[messages]]
- **Components:** (library code, no UI component)

### Bot Flows
- **Subsystem:** messenger
- **Description:** Configurable triggers — keyword match, first message, postback → response templates with action buttons
- **Entities:** [[bot_flows]]
- **Components:** [[BotPage]]

### AI Reasoning
- **Subsystem:** messenger
- **Description:** HuggingFace integration — evaluates conversation context, detects intent, recommends stage movement
- **Entities:** [[leads]], [[lead_events]], [[knowledge_chunks]]
- **Components:** (library code, no UI component)

---

## Lead Management

### Lead Pipeline
- **Subsystem:** leads
- **Description:** Kanban board — drag leads between stages, filter by tags, search
- **Entities:** [[leads]], [[stages]]
- **Components:** [[LeadsPage]]

### Lead Profile
- **Subsystem:** leads
- **Description:** Detail view — FB info, stage history, activity timeline, tags, qualification data
- **Entities:** [[leads]], [[lead_events]], [[qualification_responses]]
- **Components:** [[LeadsPage]]

### Activity Tracking
- **Subsystem:** leads
- **Description:** Event log — messages, form submits, appointments, purchases, stage changes
- **Entities:** [[lead_events]]
- **Components:** [[LeadsPage]]

### Stage Management
- **Subsystem:** leads
- **Description:** Configure pipeline stages — add/remove/reorder, custom colors, auto-move rules
- **Entities:** [[stages]]
- **Components:** [[SettingsPage]]

---

## Action Pages

### Form Pages
- **Subsystem:** actions
- **Description:** Configurable lead capture forms — custom fields, validation, submit creates lead_event
- **Entities:** [[action_pages]], [[action_submissions]]
- **Components:** [[ActionSlugPage]]

### Calendar Booking
- **Subsystem:** actions
- **Description:** Appointment scheduler — available time slots, booking confirmation, reminders
- **Entities:** [[action_pages]], [[appointments]]
- **Components:** [[ActionSlugPage]]

### Sales Pages
- **Subsystem:** actions
- **Description:** Landing pages — product showcase, CTA buttons, testimonials
- **Entities:** [[action_pages]]
- **Components:** [[ActionSlugPage]]

### Product Catalog
- **Subsystem:** actions
- **Description:** E-commerce pages — product grid, detail view, add to cart
- **Entities:** [[action_pages]], [[products]]
- **Components:** [[ActionSlugPage]]

### Checkout
- **Subsystem:** actions
- **Description:** Order completion — cart summary, payment reference capture, order confirmation
- **Entities:** [[orders]], [[action_submissions]]
- **Components:** [[ActionSlugPage]]

### Action Page Builder
- **Subsystem:** actions
- **Description:** Dashboard UI — create/edit action pages, configure fields and layout, preview, publish
- **Entities:** [[action_pages]]
- **Components:** [[ActionsPage]]

---

## Commerce

### Product Management
- **Subsystem:** commerce
- **Description:** CRUD products — name, price, images via Cloudinary, stock tracking
- **Entities:** [[products]]
- **Components:** [[ActionsPage]]

### Order Management
- **Subsystem:** commerce
- **Description:** View and manage orders — status updates (pending → paid → fulfilled), order history
- **Entities:** [[orders]]
- **Components:** [[LeadsPage]]

### Appointment Management
- **Subsystem:** commerce
- **Description:** View and manage bookings — confirm, cancel, reschedule, calendar view
- **Entities:** [[appointments]]
- **Components:** [[LeadsPage]]

---

## Workflows & Automation

### Workflow Engine
- **Subsystem:** workflows
- **Description:** Core execution — trigger evaluation, step processing, run logging, error handling
- **Entities:** [[workflows]], [[workflow_steps]], [[workflow_runs]]
- **Components:** (library code, no UI component)

### Workflow Builder
- **Subsystem:** workflows
- **Description:** Dashboard UI — visual step editor, trigger configuration, enable/disable toggle
- **Entities:** [[workflows]], [[workflow_steps]]
- **Components:** [[WorkflowsPage]]

### Workflow Steps
- **Subsystem:** workflows
- **Description:** Step types — send_message, send_image, wait, condition, move_stage, tag, http
- **Entities:** [[workflow_steps]]
- **Components:** [[WorkflowsPage]]

### Workflow Triggers
- **Subsystem:** workflows
- **Description:** Event-based triggers — on form_submit, on purchase, on stage_changed, on appointment_booked
- **Entities:** [[workflows]]
- **Components:** [[WorkflowsPage]]

---

## Tenant Dashboard

### Dashboard Home
- **Subsystem:** dashboard
- **Description:** Overview — lead count, recent activity, stage distribution chart, quick action buttons
- **Entities:** [[leads]], [[lead_events]], [[stages]]
- **Components:** [[DashboardNav]]

### Conversation Inbox
- **Subsystem:** dashboard
- **Description:** Live chat view — message history per lead, send manual messages, Supabase Realtime updates
- **Entities:** [[conversations]], [[messages]], [[leads]]
- **Components:** [[DashboardNav]]

### Analytics
- **Subsystem:** dashboard
- **Description:** Funnel metrics — conversion rates per stage, action page performance, lead source breakdown
- **Entities:** [[lead_events]], [[action_submissions]], [[leads]]
- **Components:** [[DashboardNav]]

---

## RAG & Bot Training

### Knowledge Base
- **Subsystem:** rag
- **Description:** Tenant uploads documents, FAQs, product info — stored and chunked for bot retrieval
- **Entities:** [[knowledge_docs]], [[knowledge_chunks]]
- **Components:** [[BotPage]]

### RAG Pipeline
- **Subsystem:** rag
- **Description:** Chunk uploaded docs → generate embeddings → store in vector column. Bot retrieves relevant chunks per conversation turn.
- **Entities:** [[knowledge_chunks]]
- **Components:** (library code, no UI component)

### Bot Rules & Persona
- **Subsystem:** rag
- **Description:** Tenant defines behavior rules ("always ask for email"), tone, boundaries ("never discuss pricing") that constrain AI responses
- **Entities:** [[bot_rules]]
- **Components:** [[BotPage]]

### Test Conversation
- **Subsystem:** rag
- **Description:** Sandbox chat — tenant talks to their own bot, sees which RAG chunks were retrieved, tests action button delivery
- **Entities:** [[conversations]], [[messages]]
- **Components:** [[BotPage]]

### Conversation Review
- **Subsystem:** rag
- **Description:** Review past real conversations — flag bad bot responses, write corrections, corrections auto-become rules
- **Entities:** [[conversation_corrections]], [[bot_rules]]
- **Components:** [[BotPage]]

### Training Dashboard
- **Subsystem:** rag
- **Description:** Unified UI — upload docs, manage rules, set goal, open test chat, review conversations, iterate
- **Entities:** [[knowledge_docs]], [[bot_rules]]
- **Components:** [[BotPage]]

---

## Goal-Driven Actions

### Goal Configuration
- **Subsystem:** goals
- **Description:** Tenant sets primary bot goal (qualify_leads, sell, understand_intent, collect_lead_info) — shapes bot personality and which actions it pushes
- **Entities:** [[tenants]]
- **Components:** [[SettingsPage]], [[OnboardingPage]]

### Qualification Engine
- **Subsystem:** goals
- **Description:** Quiz-style form builder — conditional questions, scoring rules, auto-tag and auto-stage based on answers
- **Entities:** [[qualification_forms]], [[qualification_responses]]
- **Components:** [[ActionsPage]], [[ActionSlugPage]]

### Qualification Data View
- **Subsystem:** goals
- **Description:** Dashboard view — see every answer a lead gave, their score, which conditions triggered, resulting tags and stage
- **Entities:** [[qualification_responses]], [[leads]]
- **Components:** [[LeadsPage]]

### Booking Integration
- **Subsystem:** goals
- **Description:** Bot motivates booking → pushes calendar action page → appointment auto-appears on tenant dashboard
- **Entities:** [[appointments]], [[action_pages]]
- **Components:** [[ActionSlugPage]]

### Sales Push
- **Subsystem:** goals
- **Description:** Bot showcases products → pushes product catalog/checkout action page → order auto-tracked
- **Entities:** [[products]], [[orders]], [[action_pages]]
- **Components:** [[ActionSlugPage]]

### Action Conditions
- **Subsystem:** goals
- **Description:** If/then rules on form answers — e.g. budget > $10k → tag "high-value" → move to "Qualified" stage → trigger follow-up workflow
- **Entities:** [[action_conditions]]
- **Components:** [[ActionsPage]]
