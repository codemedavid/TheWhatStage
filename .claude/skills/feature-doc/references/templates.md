# Note Templates Reference

Shared templates used by `obsidian-bootstrap` (vault seeding) and `feature-doc` (incremental documentation).
Both skills must generate notes that match these templates exactly.

---

## 1. Feature Note Template

````markdown
---
tags:
  - feature
status: planned
subsystem: <subsystem-name>
created: <YYYY-MM-DD>
---

# <Feature Name>

## Description

<One or two sentences describing what this feature does and why it exists.>

## Entities

- [[<EntityName>]]
- [[<EntityName>]]

## Components

- [[<ComponentName>]]
- [[<ComponentName>]]

## Flows

- [[<Flow Name>]]

## API Routes

- [[<RouteComponentName>]] — `METHOD /path`

## Notes

<Any additional context, edge cases, or open questions.>
````

### Rules

- **Title Case** for the note heading and file name (e.g., `Lead Stage Movement`, file: `Lead Stage Movement.md`).
- File name must exactly match the level-1 heading — no abbreviations.
- Every item under Entities, Components, Flows, and API Routes must be a wikilink `[[...]]`.
- `status` values: `planned` | `in-progress` | `complete`.
- `subsystem` must be one of: `messenger-bot`, `tenant-dashboard`, `action-pages`, `workflow-engine`, `lead-management`, `auth`, `core`.
- Omit empty sections rather than leaving them blank.

---

## 2. Entity Note Template

````markdown
---
tags:
  - entity
table: <sql_table_name>
subsystem: <subsystem-name>
created: <YYYY-MM-DD>
---

# <EntityName>

## Schema

| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| <column> | <type> | <constraints> |

## Relationships

- **Belongs to** [[<EntityName>]] via `<fk_column>`
- **Has many** [[<EntityName>]]

## Used By Features

- [[<Feature Name>]]

## Used By Components

- [[<ComponentName>]]

## RLS Policy

<Describe the Row Level Security policy in plain language, e.g. "Tenants can only read and write rows where tenant_id matches their own auth.uid().">
````

### Rules

- **EntityName** is PascalCase (e.g., `Lead`, `TenantConfig`).
- `table` in frontmatter is the **lowercase snake_case** Postgres table name parsed from migrations (e.g., `leads`, `tenant_configs`).
- Parse schema from `supabase/migrations/` — do not invent columns.
- FK column pointing to another table → "Belongs to [[OtherEntity]] via `fk_column`".
- Reverse side of FK → "Has many [[ChildEntity]]".
- If no RLS policy exists yet, write "None defined yet."
- Omit Relationships section if the entity has no foreign keys and no children.

---

## 3. Component Note Template

````markdown
---
tags:
  - component
  - <type>
file_path: src/<path/to/file.tsx>
route: /<url-path>
subsystem: <subsystem-name>
context: <context>
created: <YYYY-MM-DD>
---

# <ComponentName>

## Description

<One sentence describing what this component renders or handles.>

## Route

`/<url-path>` — <context> context

## Data Consumed

- [[<EntityName>]]
- [[<EntityName>]]

## Part Of

- [[<Feature Name>]]
- [[<Flow Name>]]

## Source

`src/<path/to/file.tsx>`
````

### Rules

- **ComponentName** is PascalCase derived from the file path:
  - `src/app/(tenant)/app/leads/page.tsx` → `LeadsPage`
  - `src/app/api/fb/webhook/route.ts` → `FbWebhookRoute`
  - `src/components/dashboard/DashboardNav.tsx` → `DashboardNav`
  - `src/middleware.ts` → `Middleware`
- `type` tag must be one of: `page` | `component` | `api-route` | `layout` | `middleware`.
- `context` must be one of: `marketing` | `tenant-dashboard` | `action-page` | `api`.
- `route` is the URL path this component is served at; use `n/a` for non-routed components.
- Data Consumed lists every Supabase entity the component reads or writes (as wikilinks).
- Part Of lists every Feature or Flow this component participates in (as wikilinks).
- Omit `route` and the Route section for non-page components (type: `component`).

---

## 4. Flow Note Template

````markdown
---
tags:
  - flow
subsystem: <subsystem-name>
created: <YYYY-MM-DD>
---

# <Flow Name>

## Diagram

\```mermaid
flowchart LR
  A[Step One] --> B[Step Two]
  B --> C{Decision?}
  C -- Yes --> D[Step Three]
  C -- No --> E[Step Four]
\```

## Steps

1. **Step One** — description with [[EntityOrComponent]] wikilink.
2. **Step Two** — description with [[EntityOrComponent]] wikilink.
3. **Decision** — condition that determines the next path, referencing [[EntityOrComponent]].
4. **Step Three** — description with [[EntityOrComponent]] wikilink.
5. **Step Four** — description with [[EntityOrComponent]] wikilink.

## Entities Involved

- [[<EntityName>]]

## Components Involved

- [[<ComponentName>]]
````

### Rules

- **Title Case** for the note heading and file name (e.g., `Messenger Postback Handling`, file: `Messenger Postback Handling.md`).
- Use `flowchart LR` (left-to-right) for linear sequences; use `flowchart TB` (top-to-bottom) for branching/decision-heavy flows.
- Keep diagrams to **5–10 nodes** maximum for readability.
- Every numbered step must contain **at least one wikilink** to an entity or component.
- Mermaid code fences are written with a leading backslash (`\`\`\`mermaid`) so they render correctly when this reference file itself is inside a code fence.
- `subsystem` must be one of: `messenger-bot`, `tenant-dashboard`, `action-pages`, `workflow-engine`, `lead-management`, `auth`, `core`.
- Omit empty sections rather than leaving them blank.
