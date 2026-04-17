# Subsystem Mapping Reference

This file maps database tables and source file paths to their subsystem slugs. Used by the `obsidian-bootstrap` and `feature-doc` Claude Code skills to assign the correct `subsystem` tag in Obsidian note frontmatter.

## Subsystem Slugs

| Slug | Display Name | Description |
|------|-------------|-------------|
| auth | Auth & Multi-tenancy | Authentication, tenant routing, onboarding |
| messenger | Messenger Bot Engine | FB webhooks, message handling, send API, bot flows |
| leads | Lead Management | Pipeline, profiles, activity tracking, stages |
| actions | Action Pages | Forms, calendar, sales, product catalog, checkout, builder |
| commerce | Commerce | Products, orders, appointments |
| workflows | Workflows & Automation | Engine, builder, steps, triggers |
| dashboard | Tenant Dashboard | Home, inbox, analytics |
| rag | RAG & Bot Training | Knowledge base, RAG pipeline, rules, test chat, review |
| goals | Goal-Driven Actions | Goal config, qualification, booking, sales push, conditions |

## Table → Subsystem Mapping

| Table | Subsystem |
|-------|-----------|
| tenants | auth |
| tenant_members | auth |
| leads | leads |
| stages | leads |
| lead_events | leads |
| conversations | messenger |
| messages | messenger |
| action_pages | actions |
| action_submissions | actions |
| products | commerce |
| orders | commerce |
| appointments | commerce |
| bot_flows | messenger |
| workflows | workflows |
| workflow_steps | workflows |
| workflow_runs | workflows |
| knowledge_docs | rag |
| knowledge_chunks | rag |
| bot_rules | rag |
| conversation_corrections | rag |
| qualification_forms | goals |
| qualification_responses | goals |
| action_conditions | goals |

## Route Path → Subsystem Mapping

| Path Pattern | Subsystem |
|-------------|-----------|
| `src/app/(marketing)/**` | auth |
| `src/app/(tenant)/app/leads/**` | leads |
| `src/app/(tenant)/app/bot/**` | messenger |
| `src/app/(tenant)/app/actions/**` | actions |
| `src/app/(tenant)/app/workflows/**` | workflows |
| `src/app/(tenant)/app/settings/**` | auth |
| `src/app/(tenant)/a/**` | actions |
| `src/app/api/fb/**` | messenger |
| `src/app/api/onboarding/**` | auth |
| `src/app/auth/**` | auth |
| `src/components/dashboard/**` | dashboard |
| `src/lib/fb/**` | messenger |
| `src/lib/supabase/**` | auth |
| `src/lib/tenant/**` | auth |
| `src/middleware.ts` | auth |
