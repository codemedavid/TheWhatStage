---
name: obsidian-bootstrap
description: One-time scan of the WhatStage codebase to seed the Obsidian knowledge graph vault with all entities, components, features, flows, and MOC index files
---

## When to Use

- First time setting up the Obsidian vault
- After major codebase restructuring to resync from scratch
- WARNING: Re-running deletes all content in whatstage_obsidian/ (except .obsidian/ settings)

## Prerequisites

- whatstage_obsidian/ directory must exist at project root
- Database schema must exist in supabase/migrations/*.sql
- TypeScript types must exist in src/types/database.ts

## Process (7 steps, must be followed IN ORDER)

### Step 1: Clean the vault

Delete all files and folders inside whatstage_obsidian/ EXCEPT the .obsidian/ directory (which holds Obsidian app settings and must be preserved). Then create the following folder structure:

- whatstage_obsidian/Features/
- whatstage_obsidian/Entities/
- whatstage_obsidian/Components/
- whatstage_obsidian/Flows/
- whatstage_obsidian/Index/

### Step 2: Generate Entity notes

Read the database schema from:
- supabase/migrations/*.sql (all migration files, in order)
- src/types/database.ts (TypeScript type definitions)

For each database table:
1. Read references/templates.md for the Entity note template
2. Read references/subsystems.md to find the correct subsystem slug for the table
3. Extract columns, data types, constraints, and foreign key relationships
4. Generate the Entity note using the template
5. Save to whatstage_obsidian/Entities/{table_name}.md

Generate notes for ALL 23 tables (16 existing + 7 new from design spec).

**Existing tables** (16): extract schema from supabase/migrations/*.sql and src/types/database.ts.

**New tables** (7): not yet in migrations — generate with schema from the design spec at docs/superpowers/specs/2026-04-18-obsidian-knowledge-graph-design.md (sections 7.8 and 7.9). Add the following note at the top of each generated note:

> _Table not yet in migrations — schema based on design spec._

New tables to generate:
- knowledge_docs
- knowledge_chunks
- bot_rules
- conversation_corrections
- qualification_forms
- qualification_responses
- action_conditions

### Step 3: Generate Component notes

Scan the following paths:
- src/app/**/*.tsx — Next.js pages and layouts
- src/app/**/route.ts — API route handlers
- src/components/**/*.tsx — shared React components
- src/middleware.ts — Next.js middleware

For each file found:
1. Read references/templates.md for the Component note template
2. Read references/subsystems.md to determine the subsystem
3. Derive the component name from the file path (PascalCase from filename)
4. Derive the route from the file path (for pages and API routes)
5. Determine which entities are consumed by cross-referencing references/feature-map.md
6. Generate the Component note using the template
7. Save to whatstage_obsidian/Components/{ComponentName}.md

### Step 4: Generate Feature notes

Read references/feature-map.md which lists all 41 features across all subsystems.

For each feature:
1. Use the Feature template from references/templates.md
2. Link to relevant Entities (via wikilinks to Entities/{table}.md)
3. Link to relevant Components (via wikilinks to Components/{ComponentName}.md)
4. Set status to `planned`
5. Save to whatstage_obsidian/Features/{Feature Name}.md

### Step 5: Generate Flow notes

Create the following 10 Flow notes, each containing a Mermaid flowchart diagram (5–10 nodes) and a numbered steps section using wikilinks to Entity and Component notes.

Save each to whatstage_obsidian/Flows/{Flow Name}.md.

---

**1. Lead Qualification Flow** (subsystem: goals)

Steps: Lead messages → Bot evaluates → Sends quiz button → Lead fills form → Scored → Conditions evaluated → Tagged + staged → Workflow triggered → Confirmation sent

---

**2. Appointment Booking Flow** (subsystem: goals)

Steps: Lead messages → Bot promotes booking → Booking button sent → Lead opens calendar page → Selects slot → Appointment created → Confirmation sent → Appointment visible in dashboard

---

**3. Product Purchase Flow** (subsystem: goals)

Steps: Lead messages → Bot showcases product → Catalog button sent → Lead browses catalog → Adds to cart → Proceeds to checkout → Order created → Moved to customer stage → Order confirmation sent

---

**4. Messenger Webhook Flow** (subsystem: messenger)

Steps: Facebook webhook POST received → Signature validated → Event type parsed → Tenant resolved from page ID → Lead created or retrieved → Conversation logged → Bot flow triggered → Response sent via Send API

---

**5. Tenant Onboarding Flow** (subsystem: auth)

Steps: Tenant signs up → Email confirmed → Redirected to onboarding page → Enters business details → Selects business type → Sets bot goal → Connects Facebook page → Tenant record created → Default stages seeded → Redirected to dashboard

---

**6. Bot Conversation Flow** (subsystem: messenger)

Steps: Lead sends message → Webhook received → RAG retrieves relevant knowledge chunks → Bot rules applied → AI generates response → Action button attached if applicable → Message sent via Messenger → Conversation logged

---

**7. Workflow Execution Flow** (subsystem: workflows)

Steps: Triggering event occurs → All triggers evaluated for match → Matching workflow started → Steps executed in order → Conditions evaluated at branch points → Actions performed (send message, update stage, etc.) → Workflow run logged

---

**8. Action Page Submission Flow** (subsystem: actions)

Steps: Lead clicks button in Messenger → Opens tenant subdomain page with PSID in URL → Page renders by action type (form/calendar/product) → Lead interacts with page → Submission created in database → Event logged → Workflows triggered → Messenger notification sent

---

**9. RAG Knowledge Retrieval Flow** (subsystem: rag)

Steps: Tenant uploads document → Document chunked into segments → Each chunk embedded via embedding model → Embeddings stored with chunks → Lead sends message → Query embedded → Similarity search finds relevant chunks → Chunks injected into AI prompt → AI generates contextual response

---

**10. Conversation Review Flow** (subsystem: rag)

Steps: Tenant opens conversation review → Browses conversation history → Flags a bad AI response → Writes correction or preferred response → Correction saved as conversation_correction → Applied as bot_rule → Rule appears in rules list → Rule used in future bot prompts

---

### Step 6: Generate MOC files

Read references/moc-templates.md for the MOC (Map of Content) templates. Generate all 4 Index files and save to whatstage_obsidian/Index/.

1. **System Overview** (Index/System Overview.md)
   - Mermaid architecture diagram showing all major subsystems and their relationships
   - Subsystem table listing every subsystem with its description and links to all its features

2. **Database Schema Map** (Index/Database Schema Map.md)
   - Mermaid ER diagram showing all 23 tables with primary keys, foreign keys, and relationships
   - Tables grouped by subsystem with wikilinks to each Entity note

3. **Feature Roadmap** (Index/Feature Roadmap.md)
   - Status legend (planned / in-progress / done)
   - Complete table of all 41 features with status, subsystem, and wikilink to feature note
   - Footer: `<!-- AUTO-UPDATED by obsidian-bootstrap -->`

4. **Component Registry** (Index/Component Registry.md)
   - Pages section: all Next.js page components grouped by app section
   - API Routes section: all route.ts handlers with their HTTP methods and paths
   - Shared Components section: all reusable components from src/components/
   - Footer: `<!-- AUTO-UPDATED by obsidian-bootstrap -->`

### Step 7: Validate wikilinks

Scan every .md file in the vault (all folders, excluding .obsidian/). For each `[[wikilink]]` found:

1. Check if a file named `{wikilink}.md` exists anywhere in the vault
2. If broken: attempt to fix by either creating a stub note in the appropriate folder, or correcting obvious typos in the link text
3. Track count of broken links found and fixed

Report a summary of all broken links found and how each was resolved.

### Step 8: Report

Print a final summary with the following counts:

- Entity notes generated
- Component notes generated
- Feature notes generated
- Flow notes generated
- MOC index files generated
- Total files written
- Broken wikilinks found and fixed
