---
name: feature-doc
description: Auto-generate Obsidian knowledge graph notes for new features — creates Feature, Entity, Component, and Flow notes with wikilinks and updates MOC index files
---

# feature-doc Skill

## When to Use

Use this skill after implementing a new feature, API route, component, utility, DB migration, or user flow. Also use it when modifying existing features that need their documentation updated.

## Prerequisites

- The Obsidian vault must be bootstrapped first (run `obsidian-bootstrap` skill if not done).
- The following folder structure must exist inside `whatstage_obsidian/`:
  - `whatstage_obsidian/Features/`
  - `whatstage_obsidian/Entities/`
  - `whatstage_obsidian/Components/`
  - `whatstage_obsidian/Flows/`
  - `whatstage_obsidian/Index/`

---

## Process

### Step 1: Gather Information

Ask the user (or detect from recent code changes):

1. **What was built?** — feature name + short description
2. **Which subsystem?** — check `references/subsystems.md` for the correct slug
3. **New DB tables?** — list any new Supabase tables (parse from `supabase/migrations/`)
4. **New pages/components?** — list any new Next.js pages, components, or API routes
5. **New user flow?** — describe any new multi-step user interaction
6. **Related existing features?** — names of features this connects to

---

### Step 2: Generate New Notes

Based on what was built, create notes using the templates in `references/templates.md`:

- **New feature** → create a Feature note in `whatstage_obsidian/Features/`
  - Set `status` to `in-progress` or `complete` depending on implementation state
- **New DB table** → create an Entity note in `whatstage_obsidian/Entities/`
  - Parse the full schema from the migration SQL (columns, types, constraints)
  - Derive RLS policy from migration or policy files
- **New page/component** → create a Component note in `whatstage_obsidian/Components/`
  - Include `file_path`, `route`, `context`, and `type` from the source file
- **New user flow** → create a Flow note in `whatstage_obsidian/Flows/`
  - Include a Mermaid diagram (`flowchart LR` for linear, `flowchart TB` for branching)
  - Keep diagrams to 5–10 nodes

All notes must follow the templates exactly (frontmatter, headings, wikilink format). Omit empty sections rather than leaving them blank.

---

### Step 3: Update Existing Notes

Add wikilinks to connect the new notes into the existing knowledge graph:

| New note type | Existing notes to update | Where to add |
|---------------|--------------------------|--------------|
| New Entity | Feature notes that use it | `## Entities` section |
| New Entity | Component notes that use it | `## Data Consumed` section |
| New Component | Feature notes it belongs to | `## Components` section |
| New Feature | Entity notes it uses | `## Used By Features` section |
| New Feature | Component notes it contains | `## Part Of` section |
| New Flow | Feature notes it belongs to | `## Flows` section |

Read each relevant existing note, add the wikilink, and write the file back. Do not duplicate links already present.

---

### Step 4: Update MOC Index Files

Append new entries to the appropriate MOC (Map of Content) index files in `whatstage_obsidian/Index/`:

- **Feature Roadmap** (`Index/Feature Roadmap.md`)
  - Add a new table row BEFORE the `<!-- AUTO-UPDATED -->` marker
  - Row format: `| [[Feature Name]] | subsystem-slug | status | YYYY-MM-DD |`

- **Component Registry** (`Index/Component Registry.md`)
  - Add a new row in the appropriate section (by type: page, component, api-route, etc.) BEFORE the `<!-- AUTO-UPDATED -->` marker
  - Row format: `| [[ComponentName]] | type | /route | subsystem-slug |`

- **Database Schema Map** (`Index/Database Schema Map.md`)
  - Add the new entity under its subsystem heading
  - Update the ER diagram section if a Mermaid diagram is present
  - Row format: `| [[EntityName]] | table_name | subsystem-slug |`

- **System Overview** (`Index/System Overview.md`)
  - Update ONLY if a new subsystem was added (rare)

---

### Step 5: Validate

After all writes are complete:

1. Collect all wikilinks (`[[...]]`) found in new AND modified notes
2. For each wikilink, check that a corresponding `.md` file exists in `whatstage_obsidian/`
3. Report any broken links (target file not found)
4. Fix broken links: either correct the link text to match the actual file name, or create a stub note if the target is legitimate but missing

---

### Step 6: Report

Print a summary covering:

- **New notes created** — list with paths
- **Existing notes updated** — list with what was added
- **MOC files updated** — which index files were modified
- **Broken wikilinks found** — list any that were found and how they were resolved

---

### Step 7: Update Feature Map Reference

If a new feature was created that does not already appear in `.claude/skills/obsidian-bootstrap/references/feature-map.md`:

1. Open `feature-map.md`
2. Append the new feature entry in the same format as existing entries
3. This ensures future `obsidian-bootstrap` runs will include the feature

Only add features that represent distinct platform capabilities — do not add sub-components or entities.
