# WhatStage AI Chatbot — Implementation Plan

> Master tracking file. Check off items as they are implemented.  
> Full design spec: `docs/superpowers/specs/2026-04-18-ai-chatbot-rag-design.md`

---

## Phase 1: Foundation — Embedding & Vector Store

- [x] Enable `pgvector` extension in Supabase
- [x] Create migration: `bot_flow_phases` table
- [x] Create migration: `knowledge_docs` table
- [x] Create migration: `knowledge_chunks` table (with vector column)
- [x] Create migration: `knowledge_images` table
- [x] Create migration: `conversation_phases` table
- [x] Create migration: indexes (HNSW vector index, tenant+kb_type, etc.)
- [x] Create migration: RLS policies for all new tables
- [x] Build `src/lib/ai/embedding.ts` — HuggingFace embedding client wrapper (with batch support, up to 10 chunks per call)
- [x] Build `src/lib/ai/vector-search.ts` — cosine similarity search utility
- [x] Unit tests: embedding client (mock HF API)
- [x] Integration tests: embed → store → query → retrieve

---

## Phase 2: Knowledge Ingestion Pipeline

- [x] Build `src/lib/ai/chunking.ts` — semantic text splitter (~500 tokens, 50 overlap)
- [x] Build `src/lib/ai/processors/pdf.ts` — PDF text extraction (pdf-parse)
- [x] Build `src/lib/ai/processors/docx.ts` — Word text extraction (mammoth)
- [x] Build `src/lib/ai/processors/xlsx.ts` — Excel extraction (SheetJS)
- [x] Build `src/lib/ai/processors/faq.ts` — FAQ pair ingestion (no chunking)
- [x] Build `src/lib/ai/processors/product.ts` — Product-to-chunk serializer
- [x] Build `src/lib/ai/ingest.ts` — orchestrator: detect type → extract → chunk → embed → store
- [x] Build `src/app/api/knowledge/upload/route.ts` — upload API endpoint (uses waitUntil() for async processing)
- [x] Build `src/app/api/knowledge/status/route.ts` — processing status polling endpoint
- [x] Build `src/app/api/knowledge/faq/route.ts` — FAQ CRUD endpoint
- [x] Build product-to-chunk sync hook in product CRUD (create/update → re-embed, delete → cascade)
- [x] Unit tests: each processor in isolation
- [x] Unit tests: chunking engine
- [x] Integration tests: upload PDF → chunks appear in DB with embeddings

---

## Phase 3: RAG Retrieval Engine

- [x] Build `src/lib/ai/query-router.ts` — lightweight keyword/embedding heuristic for KB routing (no extra LLM call)
- [x] Build `src/lib/ai/retriever.ts` — agentic retriever: classify → target KB → search → re-rank
- [x] Implement re-ranking logic (relevance score threshold)
- [x] Implement query reformulation on low-confidence results
- [x] Implement no-result handling (clarifying question or escalate)
- [x] Unit tests: query router with various query types
- [x] Unit tests: retriever with mocked vector search
- [x] Integration tests: end-to-end query → ranked chunks

---

## Phase 4: Conversation Engine & Phase System

- [x] Build `src/lib/ai/phase-templates.ts` — default phase templates per business_type
- [x] Build `src/lib/ai/phase-machine.ts` — phase state machine (track, advance, evaluate)
- [x] Build `src/lib/ai/prompt-builder.ts` — layered system prompt builder (7 layers)
- [x] Build `src/lib/ai/llm-client.ts` — HuggingFace text generation client (OpenAI-compatible)
- [x] Build `src/lib/ai/decision-parser.ts` — parse LLM decision JSON (phase_action, confidence, image_ids)
- [x] Build `src/lib/ai/conversation-engine.ts` — orchestrator: receive message → build prompt → call LLM → parse decision → update state → return response
- [x] Implement confidence-based escalation (< 0.4 → escalate, 0.4-0.7 → hedge, 0.7+ → normal)
- [x] Seed phase templates trigger (on tenant creation, based on business_type)
- [x] Unit tests: prompt builder
- [x] Unit tests: decision parser
- [x] Unit tests: phase machine transitions
- [x] Integration tests: simulate multi-turn conversation → verify phase advancement

---

## Phase 5: Image & Media System

- [x] Build `src/app/api/knowledge/images/route.ts` — knowledge images CRUD
- [x] Build `src/lib/ai/image-selector.ts` — select relevant images for LLM prompt
- [x] Build `src/lib/ai/response-parser.ts` — parse `[SEND_IMAGE:id]` from LLM response
- [x] Integrate image list into prompt builder (Layer 6)
- [x] Integrate image sending into Messenger Send API
- [x] Unit tests: image selector logic
- [x] Unit tests: response parser
- [x] Integration tests: conversation about product → correct image included

---

## Phase 6: Knowledge Upload Dashboard ✅ COMPLETE

- [x] Build `src/components/dashboard/knowledge/DocumentUpload.tsx` — drag & drop file upload
- [x] Build `src/components/dashboard/knowledge/FaqEditor.tsx` — Q+A pair editor
- [x] Build `src/components/dashboard/knowledge/RichTextEditor.tsx` — Tiptap-based editor
- [x] Build `src/components/dashboard/knowledge/ProductKnowledge.tsx` — product entry form
- [x] Build `src/components/dashboard/knowledge/ProcessingStatus.tsx` — upload status indicator
- [x] Build `src/components/dashboard/knowledge/KnowledgePanel.tsx` — knowledge base panel with sub-tabs (wired into BotClient)
- [x] Build `src/app/api/knowledge/docs/route.ts` — GET endpoint listing knowledge docs
- [x] Build `src/app/api/knowledge/richtext/route.ts` — POST endpoint for rich text docs
- [x] Component tests: each editor component
- [x] E2E tests: upload document → see processed → query via API

---

## Phase 7: Conversation Flow Builder ✅ COMPLETE

- [x] Build `src/components/dashboard/flow/PhaseList.tsx` — add/remove/reorder phases (drag-to-reorder with @dnd-kit)
- [x] Build `src/components/dashboard/flow/PhaseCard.tsx` — collapsible card with drag handle
- [x] Build `src/components/dashboard/flow/PhaseForm.tsx` — configure individual phase (name, tone, system prompt, goals, max messages, transition hint, action buttons, image attachments)
- [x] Build `src/components/dashboard/flow/TemplateSelector.tsx` — select starting template
- [x] Build `src/components/dashboard/flow/FlowPanel.tsx` — flow builder container (wired into BotClient)
- [x] Build `src/components/dashboard/flow/ImageAttachmentPicker.tsx` — multi-select knowledge images
- [x] Build `src/components/dashboard/flow/ActionButtonPicker.tsx` — multi-select action pages
- [x] Build `src/hooks/useFlowPhases.ts` — CRUD, reorder, and seed hook
- [x] Build `src/app/api/bot/phases/route.ts` — GET (list) + POST (create)
- [x] Build `src/app/api/bot/phases/[id]/route.ts` — PATCH (update) + DELETE
- [x] Build `src/app/api/bot/phases/reorder/route.ts` — POST (bulk reorder)
- [x] Build `src/app/api/bot/phases/seed/route.ts` — POST (seed from template)
- [x] Build `src/app/api/bot/action-pages/route.ts` — GET (list action pages for picker)
- [x] Build `src/app/api/knowledge/images/list/route.ts` — GET (list images for picker)
- [x] Integrate template selection into onboarding flow
- [x] Component tests: phase builder interactions
- [x] E2E tests: build flow in UI → bot follows it

---

## Phase 8: Human Handoff & Review

- [ ] Add `needs_human` flag to conversations table
- [ ] Build escalation trigger in conversation engine
- [ ] Build `src/components/dashboard/inbox/ConversationInbox.tsx` — human takeover UI
- [ ] Implement bot pause/resume per conversation
- [ ] Build notification system for flagged conversations
- [ ] E2E tests: bot escalates → human sees → takes over

---

## Phase 9: Campaign Flow Builder

- [x] Create migration: campaigns, campaign_phases, lead_campaign_assignments, experiments, experiment_campaigns, campaign_conversions tables
- [x] Create migration: data migration from bot_flow_phases → campaign_phases
- [x] Update TypeScript database types
- [x] Build `src/lib/ai/campaign-assignment.ts` — lead campaign assignment with weighted random
- [x] Build `src/lib/ai/conversion-detector.ts` — conversion detection from lead events
- [x] Build campaign CRUD API (`/api/campaigns/`)
- [x] Build campaign phases API (`/api/campaigns/[id]/phases/`)
- [x] Build experiments API (`/api/experiments/`)
- [x] Build campaign metrics API (`/api/campaigns/[id]/metrics/`)
- [x] Wire conversation engine to use campaign_phases + assignment
- [x] Update phase machine to track exit_reason on phase transitions
- [x] Add Campaigns nav item, campaign list page
- [x] Build campaign editor (Flow / Settings / Metrics tabs)
- [x] Build experiments UI (list, create, detail, promote winner)
- [x] Build phase funnel metrics component
- [x] Build drop-off scanner cron (`/api/cron/drop-off-scanner`)
- [x] Remove Flow Builder tab from Bot page
- [x] Unit tests: campaign assignment, conversion detector, all API routes
- [x] E2E tests: create campaign → lead assigned → converts → metrics update
