# Phase 4: Conversation Engine & Phase System — Design Spec

**Date**: 2026-04-18  
**Status**: Approved  
**Parent spec**: `docs/superpowers/specs/2026-04-18-ai-chatbot-rag-design.md`  
**Depends on**: Phases 1-3 (embedding, ingestion, RAG retrieval)

---

## Overview

Phase 4 builds the core conversation engine — the orchestrator that receives a lead's message, determines context, generates a human-like response via LLM, and manages phase transitions. It consists of six focused modules following the same patterns established in Phases 1-3.

## Architecture

```
phase-templates.ts  →  phase-machine.ts  →  prompt-builder.ts
                                                    ↓
                                              llm-client.ts
                                                    ↓
                                            decision-parser.ts
                                                    ↓
                                          conversation-engine.ts (orchestrator)
```

All modules live in `src/lib/ai/`. The conversation engine orchestrates the others, same pattern as `retriever.ts` orchestrating `query-router`, `embedding`, and `vector-search`.

---

## Module 1: Phase Templates

**File**: `src/lib/ai/phase-templates.ts`

Provides default phase configurations per `business_type`, used to seed `bot_flow_phases` when a tenant is created.

### Interface

```ts
interface PhaseTemplate {
  name: string;
  order_index: number;
  max_messages: number;
  system_prompt: string;
  tone: string;
  goals: string;
  transition_hint: string;
}

function getDefaultPhases(businessType: BusinessType): PhaseTemplate[]
async function seedPhaseTemplates(tenantId: string, businessType: BusinessType): Promise<void>
```

### Template Sets

| business_type | Phases |
|---|---|
| ecommerce | Greet → Browse/Discover → Recommend → Cart/Checkout → Follow-up |
| real_estate | Greet → Understand Needs → Qualify Budget → Show Listings → Schedule Viewing |
| digital_product | Greet → Educate → Demo/Preview → Pitch → Close |
| services | Greet → Nurture → Qualify → Pitch → Close |

Each phase defines: `name`, `order_index`, `max_messages`, `system_prompt`, `tone`, `goals`, `transition_hint`.

---

## Module 2: Phase Machine

**File**: `src/lib/ai/phase-machine.ts`

Tracks and manages phase transitions for a conversation.

### Interface

```ts
interface CurrentPhase {
  conversationPhaseId: string;
  phaseId: string;
  name: string;
  orderIndex: number;
  maxMessages: number;
  systemPrompt: string;
  tone: string;
  goals: string | null;
  transitionHint: string | null;
  actionButtonIds: string[] | null;
  messageCount: number;
}

async function getCurrentPhase(conversationId: string, tenantId: string): Promise<CurrentPhase>
async function advancePhase(conversationId: string, tenantId: string): Promise<CurrentPhase>
async function incrementMessageCount(conversationPhaseId: string): Promise<void>
```

### Behaviors

- **getCurrentPhase**: Queries `conversation_phases` joined with `bot_flow_phases`, returns the latest by `entered_at`. If none exists, initializes with the tenant's first phase (`order_index = 0`).
- **advancePhase**: Inserts a new `conversation_phases` row for the next phase by `order_index`. If already on the last phase, stays.
- **incrementMessageCount**: Bumps `message_count` on the current row after each exchange.
- **No backward movement in DB** — the LLM adapts tone via prompt context, not state changes.

---

## Module 3: Prompt Builder

**File**: `src/lib/ai/prompt-builder.ts`

Assembles the 7-layer system prompt for the LLM.

### Interface

```ts
interface PromptContext {
  tenantId: string;
  businessName: string;
  currentPhase: CurrentPhase;
  conversationId: string;
  ragChunks: ChunkResult[];
  images?: KnowledgeImage[];
}

async function buildSystemPrompt(ctx: PromptContext): Promise<string>
```

### The 7 Layers

1. **Base persona** — `"You are a helpful assistant for {businessName}. Sound like a real human. Keep messages short and conversational."`
2. **Bot rules** — Fetched from `bot_rules` table (`enabled = true`), formatted by category (tone, boundary, behavior).
3. **Current phase** — Phase's `system_prompt`, `tone`, `goals`, `transition_hint`. Includes `max_messages` and current `message_count` as soft signal.
4. **Conversation history** — Last 20 messages from `messages` table, formatted as `Lead: ...` / `Bot: ...`. Capped at ~8,000 characters (~2,000 tokens).
5. **Retrieved knowledge** — RAG chunks formatted as numbered context blocks.
6. **Available images** — Image id, description, and context hint. Gracefully handles empty array (Phase 5 will populate).
7. **Decision instructions** — Tells the LLM to respond with structured JSON:

```json
{
  "message": "response text",
  "phase_action": "stay|advance|escalate",
  "confidence": 0.0-1.0,
  "image_ids": []
}
```

Bot rules and conversation history are fetched internally (keeps the caller simple).

---

## Module 4: LLM Client

**File**: `src/lib/ai/llm-client.ts`

Wraps the HuggingFace text generation API (OpenAI-compatible endpoint).

### Interface

```ts
interface LLMConfig {
  temperature?: number;  // default 0.7
  topP?: number;         // default 0.9
  maxTokens?: number;    // default 512
}

interface LLMResponse {
  content: string;       // raw text from the model
  finishReason: string;
}

async function generateResponse(
  systemPrompt: string,
  userMessage: string,
  config?: LLMConfig
): Promise<LLMResponse>
```

### Details

- **Endpoint**: HuggingFace OpenAI-compatible chat completions (`/v1/chat/completions`)
- **Model**: `meta-llama/Llama-3.1-8B-Instruct` via Novita provider
- **Message format**: `[{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }]`
- **Reuses `HUGGINGFACE_API_KEY`** env var from embedding.ts
- **Retry logic**: Same pattern as embedding client — retry on 503 with backoff, timeout at 30s

---

## Module 5: Decision Parser

**File**: `src/lib/ai/decision-parser.ts`

Parses the structured JSON response from the LLM into a typed decision object. Pure function, no async.

### Interface

```ts
interface LLMDecision {
  message: string;
  phaseAction: "stay" | "advance" | "escalate";
  confidence: number;
  imageIds: string[];
}

function parseDecision(raw: string): LLMDecision
```

### Parsing Logic

1. Attempt `JSON.parse` on the raw string.
2. If it fails, try to extract JSON from the string (handle markdown code fences or preamble text).
3. Validate and coerce fields:
   - `message` — required string, fallback: empty string triggers escalation
   - `phase_action` — must be `"stay"`, `"advance"`, or `"escalate"`. Fallback: `"stay"`
   - `confidence` — number 0.0-1.0, clamped if out of range. Fallback: `0.5`
   - `image_ids` — string array, fallback: `[]`
4. **Confidence override**: If `confidence < 0.4`, force `phaseAction` to `"escalate"` regardless of what the LLM said.

---

## Module 6: Conversation Engine

**File**: `src/lib/ai/conversation-engine.ts`

Main orchestrator — receives an incoming message and returns the bot's response.

### Interface

```ts
interface EngineInput {
  tenantId: string;
  businessName: string;
  conversationId: string;
  leadMessage: string;
}

interface EngineOutput {
  message: string;
  phaseAction: "stay" | "advance" | "escalate";
  confidence: number;
  imageIds: string[];
  currentPhase: string;        // phase name for logging
  escalated: boolean;
}

async function handleMessage(input: EngineInput): Promise<EngineOutput>
```

### Pipeline

```
1. Get/initialize current phase (phase-machine)
2. Retrieve relevant knowledge (retriever — Phase 3)
3. Build system prompt (prompt-builder)
4. Call LLM (llm-client)
5. Parse decision (decision-parser)
6. Apply side effects:
   - advance → advancePhase()
   - escalate → flag conversation as needs_human
   - stay → no-op
7. Increment message count
8. Apply confidence hedging (0.4-0.7 → prepend hedging phrase)
9. Return response
```

### Confidence-Based Hedging

Applied post-parse in the engine (not in the LLM). If confidence is 0.4-0.7, prepend a randomly selected hedging phrase: "I believe...", "If I'm not mistaken...", "From what I understand...".

### Escalation

Sets `needs_human = true` on the `conversations` table. Requires a migration to add this column.

---

## Database Migration

**File**: `supabase/migrations/0005_conversations_needs_human.sql`

```sql
alter table conversations add column needs_human boolean not null default false;
```

---

## Testing Strategy

### Unit Tests
- **prompt-builder**: Verify each layer is included, correct ordering, truncation of long history
- **decision-parser**: Valid JSON, malformed JSON, missing fields, code-fenced JSON, confidence clamping, escalation override
- **phase-machine**: Initialize first phase, advance to next, stay on last phase, increment message count

### Integration Tests
- **Multi-turn conversation**: Simulate multiple messages → verify phase advancement through the full pipeline
- **Escalation flow**: Low confidence response → verify `needs_human` flag set
- **RAG integration**: Message about products → verify product knowledge retrieved and included in prompt

---

## Confidence Thresholds

| Confidence | Behavior |
|---|---|
| 0.7 - 1.0 | Respond normally |
| 0.4 - 0.7 | Respond with hedging phrase prepended |
| < 0.4 | Force escalate to human |
