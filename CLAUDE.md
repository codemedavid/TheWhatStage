# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**WhatStage** is a multi-tenant "Messenger Funnel" platform — a hybrid chatbot + web funnel system for Facebook Messenger. Tenants (businesses) configure chatbots that guide leads through a funnel using interactive action buttons that open web pages, creating a seamless chat-to-web experience.

### Core Concept: Messenger Funnel

The chatbot acts as a funnel. Tenants configure:
1. **Business type** — e-commerce, real estate, digital product, or services
2. **Bot goal** — qualify leads, sell, understand intent, or collect lead info, book appointment
3. **Action buttons** — buttons sent in chat that open web pages (forms, calendars, product pages, sales pages)
4. **Stages** — leads move through pipeline stages based on overall context, actions taken this reasoned by the ai based on all of these

Leads interact primarily through web pages launched from Messenger. The web pages carry the Facebook user ID (via postback/echo mechanisms) so every action is tied back to the Messenger lead. Leads receive Messenger notifications when they complete actions.

### Key Subsystems

- **Messenger Bot Engine** — Facebook API integration, postbacks, message handling, action button delivery
- **Tenant Dashboard** — multi-tenant admin panel for configuring bots, managing leads, viewing stages/pipeline, activity logs
- **Action Pages** — web pages triggered from Messenger (lead forms, calendar booking, sales pages, e-comm product pages with cart/checkout)
- **Workflow Engine** — automation triggers on actions/events, if/else conditions, send messages/pictures/follow-ups
- **Lead Management** — pipeline stages, activity tracking (form fills, bookings, purchases), automatic stage movement

## Tech Stack

- **Framework:** Next.js (App Router)
- **Database:** Supabase (auth, Postgres, realtime)
- **LLM:** HuggingFace
- **Storage:** Cloudinary (media/assets)
- **Hosting:** Vercel (wildcard subdomains for tenant routing)
- **Messenger Integration:** Facebook Graph API (webhooks, postbacks, send API)
- **E2E Testing:** Playwright
- **Knowledge Base:** Obsidian (skills + plugins for development supermemory)

## Multi-Tenancy

- Wildcard subdomains: `{tenant}.whatstage.com`
- Each tenant is fully isolated (data, config, leads, workflows)
- Action pages served under tenant subdomain so FB user ID is scoped correctly

## Testing Strategy

Every feature must be testable in isolation. When adding a new feature:
- **Unit tests** for individual functions and utilities
- **Integration tests** for API routes and database interactions
- **Component tests** for React components
- **E2E tests** with Playwright for full user flows
- **Endpoint tests** for all API routes

Use the `test-feature` skill to automate test creation for new features.

## Development Commands

```bash
# Dev server
npm run dev

# Run all tests
npm test

# Run specific test file
npm test -- path/to/test

# E2E tests
npx playwright test

# Run single E2E test
npx playwright test path/to/test.spec.ts

# Lint
npm run lint

# Type check
npm run typecheck
```

## Installed Skills

- **playwright-cli** — Browser automation and E2E testing
- **obsidian-cli** — Obsidian vault commands for development supermemory
- **obsidian-markdown** — Obsidian-flavored Markdown syntax
- **obsidian-bases** — Database-like views in Obsidian
- **json-canvas** — Visual canvas/mind map files
- **defuddle** — Extract clean markdown from web pages
- **test-feature** — Automated test scaffolding for new features (unit, integration, component, e2e)

## Project Structure (Planned)

```
├── .agents/skills/          # Obsidian skills
├── .claude/skills/          # Claude Code skills (including test-feature)
├── src/
│   ├── app/                 # Next.js App Router pages
│   ├── components/          # React components
│   ├── lib/                 # Shared utilities, Supabase client, FB API helpers
│   ├── actions/             # Server actions
│   └── types/               # TypeScript types
├── tests/
│   ├── unit/                # Unit tests
│   ├── integration/         # Integration tests
│   └── e2e/                 # Playwright E2E tests
├── supabase/                # Supabase migrations and config
└── public/                  # Static assets
```
