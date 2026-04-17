# AI Chatbot & RAG Pipeline — Design Spec

**Date**: 2026-04-18  
**Status**: Approved  
**Subsystem**: RAG, Messenger, AI

---

## 1. Architecture Overview

The AI system has 4 major subsystems:

```
┌─────────────────────────────────────────────────┐
│                 TENANT DASHBOARD                 │
│  Knowledge Upload │ Flow Builder │ Image Manager │
└────────┬──────────┴──────┬───────┴───────┬───────┘
         │                 │               │
┌────────▼─────────┐ ┌────▼────────┐ ┌────▼────────┐
│  RAG Pipeline    │ │ Conversation│ │  Media       │
│  ─────────────── │ │ Engine      │ │  Registry    │
│  • Chunking      │ │ ─────────── │ │ ─────────── │
│  • Embedding     │ │ • Phase FSM │ │ • Image tags │
│  • Vector search │ │ • LLM calls │ │ • Auto-send  │
│  • Re-ranking    │ │ • Handoff   │ │   rules      │
└────────┬─────────┘ └──────┬──────┘ └──────┬──────┘
         │                  │               │
         └──────────┬───────┴───────────────┘
                    │
            ┌───────▼───────┐
            │  Knowledge    │
            │  Store        │
            │  ───────────  │
            │  • General KB │
            │  • Product KB │
            │  (separate    │
            │   vector      │
            │   spaces)     │
            └───────────────┘
```

**Two separate RAG stores:**
- **General Knowledge** — FAQs, docs, manuals, business info
- **Product Knowledge** — product catalog, prices, specs, images

The **Conversation Engine** tracks which phase a lead is in, decides what to retrieve, generates human-like responses, and knows when to escalate.

---

## 2. RAG Pipeline

### Knowledge Types & Ingestion

| Source Type | Processing | Stored As |
|---|---|---|
| **PDF** | Extract text per page, chunk | General KB chunks |
| **Word (.docx)** | Extract text, chunk | General KB chunks |
| **Excel (.xlsx)** | Row-per-entry or sheet summary | General or Product KB |
| **Manual FAQ** | Question + answer pairs, stored as-is (no chunking) | General KB chunks |
| **Rich Text Editor** | Google Docs-style editor, tenant writes freeform content | General KB chunks |
| **Product entries** | Structured: name, price, description, images, specs | Product KB (separate) |

### Chunking Strategy

- **Documents** (PDF, Word, rich text): Split by semantic paragraphs, ~500 tokens per chunk with 50-token overlap
- **FAQ pairs**: Each Q+A is one chunk (no splitting)
- **Products**: Each product becomes one chunk with all structured fields serialized as natural text
- **Excel**: Each row becomes one chunk (for product data) or chunked as a document (for general info)

### Embedding & Storage

- **Model**: `Qwen/Qwen3-Embedding-8B` via HuggingFace Inference API (Scaleway provider)
- **Vector dimensions**: Stored in Supabase `pgvector` column
- **Batch embedding**: Chunks are embedded in batches of up to 10 per API call to reduce processing time for bulk uploads
- **Two namespaces**: `knowledge_chunks.kb_type` — either `'general'` or `'product'`
- **Image references**: Chunks with associated images store `image_urls` in the `metadata` JSONB field (URLs point to Cloudinary)

### Retrieval Flow

```
Query → Embed query → Vector search (cosine similarity)
  → Top-K results (k=5 general, k=3 product)
  → Re-rank by relevance score
  → Inject into LLM context
```

Retrieval is **agentic** — the Conversation Engine decides which knowledge store to query based on context:
- Lead asking about prices → Query Product KB
- Lead asking "what do you do?" → Query General KB
- Ambiguous → Query both, merge results

---

## 3. Conversation Engine & Phase System

### Phase-Based Flow

Each tenant gets a conversation flow — an ordered list of phases. Seeded from templates based on `business_type`, fully customizable (hybrid approach).

**Example flow (services business):**

```
Phase 1: Greet (1 msg)     → "Hey! Welcome to [Business]. How can I help?"
Phase 2: Nurture (3 msgs)  → Build rapport, answer questions naturally
Phase 3: Qualify (3 msgs)  → Ask qualifying questions, understand needs
Phase 4: Pitch (2 msgs)    → Present solution, send action button
Phase 5: Close (ongoing)   → Handle objections, push toward conversion
```

Each phase has: `name`, `order_index`, `max_messages`, `system_prompt`, `tone`, `goals`, `transition_hint`, `action_button_ids`, `image_attachments`.

### Phase Transition Logic

- The bot does **not** rigidly follow message counts
- After each message, the LLM evaluates whether to stay or advance
- `max_messages` is a soft signal — nudges transition but doesn't force it
- Lead behavior drives transitions — jumping to prices skips Nurture
- Backward movement is allowed — bot adapts tone without formally going back

### Human-Like Behavior Rules

- **Natural language** — No bullet lists, no corporate speak. Short messages, casual tone (customizable)
- **Uncertainty handling** — Low confidence triggers: "Let me check with my team and get back to you"
- **Inquiry mode** — When lead is browsing/asking, bot plays along naturally without rushing to pitch
- **Context memory** — Bot references earlier parts of the conversation
- **Image sending** — When context matches an image's tags/description, bot includes it naturally

### Human Handoff

1. Bot sends graceful message
2. Conversation flagged as `needs_human`
3. Tenant gets notification
4. Human takes over in Conversation Inbox, bot pauses

---

## 4. Media Registry & Image Sending

### Image Attachment Methods

1. **Phase-level** — Tenant assigns images to a phase
2. **Knowledge-level** — Images attached to knowledge chunks
3. **Product-level** — Product `images` JSONB pulled automatically

### Image Selection Logic

During response generation, the LLM receives available images with descriptions. The prompt includes:

```
Available images you may include in your response:
- [img_id_1] Office photo: "Our modern co-working space" — send when asked about location
- [img_id_2] Product A: "Blue widget front view" — send when discussing Blue Widget

If an image is relevant, include [SEND_IMAGE:img_id] at the end of your message.
```

The response parser detects `[SEND_IMAGE:img_id]`, strips it, and sends the image as a separate Messenger attachment after the text.

### Why Text-Based Matching (Not Vision Embedding)

- Tenants write descriptions when uploading (they know their images)
- LLM is already good at semantic matching from text
- No separate vision model needed (saves cost + complexity)

---

## 5. Knowledge Upload & Editor System

### Upload Interfaces

| Tab | What it does |
|---|---|
| **Documents** | Upload PDF, Word, Excel. Auto-processed, chunked, embedded |
| **FAQ** | Add Q+A pairs manually. Each pair = one chunk |
| **Editor** | Rich text editor (Tiptap). Freeform content, chunked on save |
| **Products** | Structured product form: name, price, description, images, specs |

### Document Processing Pipeline

```
Upload file → Detect type → Extract text → Chunk → Embed → Store
```

Processing is **async** using Vercel's `waitUntil()` — the upload API route returns immediately with a `processing` status, then continues extraction/chunking/embedding in the background. The UI polls a status endpoint to show: `uploading → processing → ready`. If processing fails, status is set to `error` with a message in `knowledge_docs.metadata`.

### Rich Text Editor

Tiptap-based block editor: paragraphs, headings, lists, inline images, formatting. Content saved as HTML, stripped to plain text for chunking. On save, the entire document is re-chunked — old chunks are deleted and new ones are created and embedded. Editor documents are small enough that full re-chunking is simpler and cheaper than diff-based partial updates.

### Product Knowledge (Separate RAG)

Products serialized to natural text, embedded, stored with `kb_type='product'`. Sync mechanism:

- **On product create/update**: Application-level hook in the product CRUD API calls the embedding pipeline to upsert the corresponding `knowledge_chunks` entry
- **On product delete**: Cascade delete via `doc_id` FK removes the chunk automatically
- Each product gets a single `knowledge_docs` record (type=`product`) which owns its chunk

### Processing Libraries

| File type | Library |
|---|---|
| PDF | `pdf-parse` |
| Word (.docx) | `mammoth` |
| Excel (.xlsx) | `xlsx` (SheetJS) |
| Rich text | Tiptap → HTML → plain text |

---

## 6. LLM Integration & Agentic Behavior

### Models

| Purpose | Model | Provider |
|---|---|---|
| Embedding | `Qwen/Qwen3-Embedding-8B` | HuggingFace Inference (Scaleway) |
| Text generation | `meta-llama/Llama-3.1-8B-Instruct` | HuggingFace Router (Novita) |

### System Prompt Architecture (Layered)

```
Layer 1: Base persona — "You are a helpful assistant for [Business]. Sound like a real human."
Layer 2: Bot rules — Tenant-defined constraints from bot_rules table
Layer 3: Current phase — Phase instructions, tone, goals
Layer 4: Conversation history — Last 20 messages (or ~2,000 tokens, whichever is smaller)
Layer 5: Retrieved knowledge — RAG results
Layer 6: Available images — With descriptions and context hints
Layer 7: Decision instructions — Output JSON: { phase_action, confidence, image_ids }
```

### Agentic Decision Loop

```
Message in → Build prompt → LLM response + decision JSON
  → confidence < 0.4? → escalate to human
  → phase_action = 'advance'? → move to next phase
  → image_ids present? → send images after text
  → Update state, send response
```

### Agentic RAG (Smart Retrieval)

Query classification happens **without an extra LLM call** — a lightweight keyword/embedding heuristic routes to the correct KB before the main LLM call:

1. **Fast query routing** — Keyword heuristic first (e.g., "price", "cost", "how much" → Product KB; "hours", "location" → General KB). If ambiguous, query both KBs and merge results
2. **Targeted search** — Route to correct KB based on classification
3. **Follow-up queries** — If initial results have low similarity scores (< 0.3), the engine reformulates the query and searches again
4. **No-result handling** — Ask clarifying question or escalate (never hallucinate)
5. **Query type output** — The LLM's decision JSON includes `query_type` so future turns can refine routing

### Confidence Thresholds

| Confidence | Behavior |
|---|---|
| 0.7 - 1.0 | Respond normally |
| 0.4 - 0.7 | Respond with hedging ("I believe...", "If I'm not mistaken...") |
| < 0.4 | Escalate to human |

---

## 7. Database Schema Changes

### Extensions

```sql
create extension if not exists vector;
```

### New Tables

**`bot_flow_phases`**

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `tenant_id` | uuid | FK → tenants, CASCADE |
| `name` | text | NOT NULL |
| `order_index` | integer | NOT NULL, default 0 |
| `max_messages` | integer | NOT NULL, default 3 |
| `system_prompt` | text | NOT NULL |
| `tone` | text | default 'friendly and helpful' |
| `goals` | text | nullable |
| `transition_hint` | text | nullable |
| `action_button_ids` | uuid[] | nullable |
| `created_at` | timestamptz | default now() |

**`knowledge_docs`**

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `tenant_id` | uuid | FK → tenants, CASCADE |
| `title` | text | NOT NULL |
| `type` | text | NOT NULL (`pdf`, `docx`, `xlsx`, `faq`, `richtext`, `product`) |
| `content` | text | nullable |
| `file_url` | text | nullable (Cloudinary URL) |
| `status` | text | NOT NULL, default `processing` (`processing`, `ready`, `error`) |
| `metadata` | jsonb | default `{}` (error messages, page count, etc.) |
| `created_at` | timestamptz | default now() |

**`knowledge_chunks`**

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `doc_id` | uuid | FK → knowledge_docs, CASCADE |
| `tenant_id` | uuid | FK → tenants, CASCADE (denormalized) |
| `content` | text | NOT NULL |
| `kb_type` | text | NOT NULL (`general`, `product`) |
| `embedding` | vector(N) | nullable (dimension N determined by Qwen3-Embedding-8B output at implementation time) |
| `metadata` | jsonb | default `{}` |
| `created_at` | timestamptz | default now() |

**`knowledge_images`**

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `tenant_id` | uuid | FK → tenants, CASCADE |
| `url` | text | NOT NULL |
| `description` | text | NOT NULL |
| `tags` | text[] | default `{}` |
| `context_hint` | text | nullable |
| `created_at` | timestamptz | default now() |

**`conversation_phases`**

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `conversation_id` | uuid | FK → conversations, CASCADE |
| `phase_id` | uuid | FK → bot_flow_phases, CASCADE |
| `entered_at` | timestamptz | default now() |
| `message_count` | integer | default 0 |

### Indexes

```sql
-- HNSW index — works at any scale, no training data required (unlike IVFFlat)
create index on knowledge_chunks using hnsw (embedding vector_cosine_ops);
create index on knowledge_chunks (tenant_id, kb_type);
create index on conversation_phases (conversation_id);
create index on knowledge_images (tenant_id);
```

### RLS

All new tables scoped to `current_tenant_id()`, same pattern as existing tables.

---

## 8. Phased Implementation Plan

### Phase 1: Foundation — Embedding & Vector Store
- [ ] Enable `pgvector` extension in Supabase
- [ ] Create all new database tables + migrations
- [ ] Build HuggingFace embedding client
- [ ] Build vector search utility (cosine similarity)
- [ ] Unit + integration tests

### Phase 2: Knowledge Ingestion Pipeline
- [ ] Document processor: PDF, Word, Excel text extraction
- [ ] Chunking engine (semantic splitting, overlap)
- [ ] FAQ ingestion (direct store)
- [ ] Product-to-chunk serializer
- [ ] Upload API routes
- [ ] Unit + integration tests

### Phase 3: RAG Retrieval Engine
- [ ] Query classifier (product vs general vs small talk)
- [ ] Targeted vector search
- [ ] Re-ranking and result merging
- [ ] Query reformulation on low-confidence
- [ ] Unit + integration tests

### Phase 4: Conversation Engine & Phase System
- [ ] Bot flow phase templates (seeded per business type)
- [ ] Phase state machine
- [ ] LLM integration with layered prompt builder
- [ ] Decision parser (stay/advance/escalate)
- [ ] Confidence-based escalation
- [ ] Unit + integration tests

### Phase 5: Image & Media System
- [ ] Knowledge images CRUD
- [ ] Image attachment to phases and chunks
- [ ] Image selection logic in LLM prompt
- [ ] `[SEND_IMAGE]` parser
- [ ] Unit + integration tests

### Phase 6: Knowledge Upload Dashboard
- [ ] Document upload UI (drag & drop, progress)
- [ ] FAQ editor UI
- [ ] Rich text editor (Tiptap)
- [ ] Product knowledge entry form
- [ ] Processing status indicators
- [ ] Component + E2E tests

### Phase 7: Conversation Flow Builder
- [ ] Phase builder UI (add/remove/reorder)
- [ ] Phase configuration forms
- [ ] Template selection during onboarding
- [ ] Image attachment to phases
- [ ] Component + E2E tests

### Phase 8: Human Handoff & Review
- [ ] Escalation flagging
- [ ] Conversation Inbox for human takeover
- [ ] Bot pause/resume per conversation
- [ ] Notification system
- [ ] E2E tests
