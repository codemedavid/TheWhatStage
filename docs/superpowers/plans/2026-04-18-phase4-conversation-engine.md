# Phase 4: Conversation Engine & Phase System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the conversation engine that receives a lead's message, manages phase transitions, generates a human-like LLM response via HuggingFace, and handles confidence-based escalation.

**Architecture:** Six focused modules in `src/lib/ai/` following the same patterns as Phases 1-3. `phase-templates.ts` provides default flows per business type. `phase-machine.ts` tracks/advances conversation phases in the DB. `prompt-builder.ts` assembles a 7-layer system prompt. `llm-client.ts` wraps HuggingFace's OpenAI-compatible chat API. `decision-parser.ts` parses the LLM's structured JSON response. `conversation-engine.ts` orchestrates the full pipeline.

**Tech Stack:** TypeScript, Vitest, Supabase (service client), HuggingFace Inference API (Llama 3.1 8B), existing Phase 1-3 modules (`retriever.ts`, `embedding.ts`, `vector-search.ts`)

---

## File Structure

```
src/lib/ai/
├── phase-templates.ts       # Default phase configs per business_type + seeding function
├── phase-machine.ts         # Phase state: get current, advance, increment message count
├── prompt-builder.ts        # 7-layer system prompt assembly
├── llm-client.ts            # HuggingFace text generation wrapper (OpenAI-compatible)
├── decision-parser.ts       # Parse LLM JSON response → typed decision object
├── conversation-engine.ts   # Orchestrator: message in → response out

supabase/migrations/
└── 0005_conversations_needs_human.sql   # Add needs_human column

src/types/
└── database.ts              # Update conversations type with needs_human

tests/unit/
├── phase-templates.test.ts
├── phase-machine.test.ts
├── prompt-builder.test.ts
├── llm-client.test.ts
├── decision-parser.test.ts
├── conversation-engine.test.ts

tests/integration/
└── conversation-engine.test.ts
```

---

## Task 1: Database Migration — `needs_human` Column

**Files:**
- Create: `supabase/migrations/0005_conversations_needs_human.sql`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/0005_conversations_needs_human.sql`:

```sql
alter table conversations add column needs_human boolean not null default false;
```

- [ ] **Step 2: Update the TypeScript database types**

In `src/types/database.ts`, add `needs_human` to the `conversations` table type. Find the `conversations` TableRow and add the field:

```typescript
conversations: TableRow<{
  id: string;
  tenant_id: string;
  lead_id: string;
  last_message_at: string;
  needs_human: boolean;
}>;
```

- [ ] **Step 3: Apply the migration**

Run: `npx supabase db push` (or apply via Supabase dashboard)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0005_conversations_needs_human.sql src/types/database.ts
git commit -m "feat: add needs_human column to conversations table"
```

---

## Task 2: Decision Parser

**Files:**
- Create: `src/lib/ai/decision-parser.ts`
- Create: `tests/unit/decision-parser.test.ts`

This is a pure function with no dependencies — ideal to build first.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/decision-parser.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseDecision } from "@/lib/ai/decision-parser";

describe("parseDecision", () => {
  it("parses valid JSON with all fields", () => {
    const raw = JSON.stringify({
      message: "Hey there! How can I help?",
      phase_action: "stay",
      confidence: 0.85,
      image_ids: ["img-1"],
    });

    const result = parseDecision(raw);

    expect(result.message).toBe("Hey there! How can I help?");
    expect(result.phaseAction).toBe("stay");
    expect(result.confidence).toBe(0.85);
    expect(result.imageIds).toEqual(["img-1"]);
  });

  it("parses advance action", () => {
    const raw = JSON.stringify({
      message: "Great, let me show you our options.",
      phase_action: "advance",
      confidence: 0.9,
      image_ids: [],
    });

    const result = parseDecision(raw);

    expect(result.phaseAction).toBe("advance");
  });

  it("parses escalate action", () => {
    const raw = JSON.stringify({
      message: "Let me get someone who can help.",
      phase_action: "escalate",
      confidence: 0.3,
      image_ids: [],
    });

    const result = parseDecision(raw);

    expect(result.phaseAction).toBe("escalate");
  });

  it("forces escalate when confidence < 0.4", () => {
    const raw = JSON.stringify({
      message: "I think so...",
      phase_action: "stay",
      confidence: 0.2,
      image_ids: [],
    });

    const result = parseDecision(raw);

    expect(result.phaseAction).toBe("escalate");
    expect(result.confidence).toBe(0.2);
  });

  it("clamps confidence above 1.0 to 1.0", () => {
    const raw = JSON.stringify({
      message: "Sure!",
      phase_action: "stay",
      confidence: 1.5,
      image_ids: [],
    });

    const result = parseDecision(raw);

    expect(result.confidence).toBe(1.0);
  });

  it("clamps negative confidence to 0.0 and forces escalate", () => {
    const raw = JSON.stringify({
      message: "Hmm...",
      phase_action: "stay",
      confidence: -0.5,
      image_ids: [],
    });

    const result = parseDecision(raw);

    expect(result.confidence).toBe(0.0);
    expect(result.phaseAction).toBe("escalate");
  });

  it("extracts JSON from markdown code fences", () => {
    const raw = '```json\n{"message":"Hi!","phase_action":"stay","confidence":0.8,"image_ids":[]}\n```';

    const result = parseDecision(raw);

    expect(result.message).toBe("Hi!");
    expect(result.phaseAction).toBe("stay");
  });

  it("extracts JSON when LLM adds preamble text", () => {
    const raw = 'Here is my response:\n{"message":"Hello!","phase_action":"stay","confidence":0.75,"image_ids":[]}';

    const result = parseDecision(raw);

    expect(result.message).toBe("Hello!");
  });

  it("falls back to defaults for missing fields", () => {
    const raw = JSON.stringify({ message: "Hi" });

    const result = parseDecision(raw);

    expect(result.message).toBe("Hi");
    expect(result.phaseAction).toBe("stay");
    expect(result.confidence).toBe(0.5);
    expect(result.imageIds).toEqual([]);
  });

  it("falls back to escalate when message is empty string", () => {
    const raw = JSON.stringify({
      message: "",
      phase_action: "stay",
      confidence: 0.8,
      image_ids: [],
    });

    const result = parseDecision(raw);

    expect(result.phaseAction).toBe("escalate");
    expect(result.message).toBe("");
  });

  it("falls back to defaults for completely invalid input", () => {
    const raw = "This is not JSON at all, just random text.";

    const result = parseDecision(raw);

    expect(result.message).toBe("");
    expect(result.phaseAction).toBe("escalate");
    expect(result.confidence).toBe(0.5);
    expect(result.imageIds).toEqual([]);
  });

  it("falls back phase_action to stay for unknown action values", () => {
    const raw = JSON.stringify({
      message: "Test",
      phase_action: "jump",
      confidence: 0.8,
      image_ids: [],
    });

    const result = parseDecision(raw);

    expect(result.phaseAction).toBe("stay");
  });

  it("filters non-string values from image_ids", () => {
    const raw = JSON.stringify({
      message: "Here you go",
      phase_action: "stay",
      confidence: 0.9,
      image_ids: ["img-1", 42, null, "img-2"],
    });

    const result = parseDecision(raw);

    expect(result.imageIds).toEqual(["img-1", "img-2"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/decision-parser.test.ts`
Expected: FAIL — `decision-parser` module not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/ai/decision-parser.ts`:

```typescript
export interface LLMDecision {
  message: string;
  phaseAction: "stay" | "advance" | "escalate";
  confidence: number;
  imageIds: string[];
}

const VALID_ACTIONS = new Set(["stay", "advance", "escalate"]);

function extractJson(raw: string): unknown | null {
  // Try direct parse first
  try {
    return JSON.parse(raw);
  } catch {
    // Continue to extraction attempts
  }

  // Try extracting from markdown code fences
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // Continue
    }
  }

  // Try finding first { ... } in the string
  const braceMatch = raw.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch {
      // Give up
    }
  }

  return null;
}

function clampConfidence(value: unknown): number {
  const num = typeof value === "number" ? value : 0.5;
  return Math.max(0.0, Math.min(1.0, num));
}

export function parseDecision(raw: string): LLMDecision {
  const parsed = extractJson(raw);

  if (!parsed || typeof parsed !== "object") {
    return {
      message: "",
      phaseAction: "escalate",
      confidence: 0.5,
      imageIds: [],
    };
  }

  const obj = parsed as Record<string, unknown>;

  const message = typeof obj.message === "string" ? obj.message : "";
  const confidence = clampConfidence(obj.confidence);

  let phaseAction: "stay" | "advance" | "escalate" =
    typeof obj.phase_action === "string" && VALID_ACTIONS.has(obj.phase_action)
      ? (obj.phase_action as "stay" | "advance" | "escalate")
      : "stay";

  // Force escalate on empty message
  if (message === "") {
    phaseAction = "escalate";
  }

  // Force escalate on low confidence
  if (confidence < 0.4) {
    phaseAction = "escalate";
  }

  const imageIds = Array.isArray(obj.image_ids)
    ? obj.image_ids.filter((id): id is string => typeof id === "string")
    : [];

  return { message, phaseAction, confidence, imageIds };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/decision-parser.test.ts`
Expected: All 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/decision-parser.ts tests/unit/decision-parser.test.ts
git commit -m "feat: add LLM decision parser with validation and fallbacks"
```

---

## Task 3: LLM Client

**Files:**
- Create: `src/lib/ai/llm-client.ts`
- Create: `tests/unit/llm-client.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/llm-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateResponse } from "@/lib/ai/llm-client";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("HUGGINGFACE_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("generateResponse", () => {
  it("sends correct request format and returns response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { content: '{"message":"Hello!","phase_action":"stay","confidence":0.9,"image_ids":[]}' },
            finish_reason: "stop",
          },
        ],
      }),
    });

    const result = await generateResponse("You are helpful.", "Hi there");

    expect(result.content).toContain("Hello!");
    expect(result.finishReason).toBe("stop");

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/v1/chat/completions");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body);
    expect(body.messages).toEqual([
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi there" },
    ]);
    expect(body.model).toBe("meta-llama/Llama-3.1-8B-Instruct");
    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(512);
  });

  it("uses custom config when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { content: "response" },
            finish_reason: "stop",
          },
        ],
      }),
    });

    await generateResponse("System", "User", {
      temperature: 0.3,
      topP: 0.8,
      maxTokens: 256,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.3);
    expect(body.top_p).toBe(0.8);
    expect(body.max_tokens).toBe(256);
  });

  it("includes Authorization header with API key", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
      }),
    });

    await generateResponse("System", "User");

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer test-key");
  });

  it("throws on non-ok response after retries exhausted", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    await expect(generateResponse("System", "User")).rejects.toThrow(
      "HuggingFace text generation API error (500)"
    );
  });

  it("retries on 503 with backoff", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => "Model loading",
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "finally" }, finish_reason: "stop" }],
      }),
    });

    const result = await generateResponse("System", "User");

    expect(result.content).toBe("finally");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws when HUGGINGFACE_API_KEY is not set", async () => {
    vi.stubEnv("HUGGINGFACE_API_KEY", "");

    await expect(generateResponse("System", "User")).rejects.toThrow(
      "HUGGINGFACE_API_KEY is not set"
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/llm-client.test.ts`
Expected: FAIL — `llm-client` module not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/ai/llm-client.ts`:

```typescript
const HF_API_URL =
  "https://router.huggingface.co/novita/v3/openai/v1/chat/completions";

const MODEL = "meta-llama/Llama-3.1-8B-Instruct";
const FETCH_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 1_000;

export interface LLMConfig {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  finishReason: string;
}

function getApiKey(): string {
  const key = process.env.HUGGINGFACE_API_KEY;
  if (!key) throw new Error("HUGGINGFACE_API_KEY is not set");
  return key;
}

export async function generateResponse(
  systemPrompt: string,
  userMessage: string,
  config?: LLMConfig,
  retries = MAX_RETRIES
): Promise<LLMResponse> {
  const apiKey = getApiKey();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: config?.temperature ?? 0.7,
        top_p: config?.topP ?? 0.9,
        max_tokens: config?.maxTokens ?? 512,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 503 && retries > 0) {
        await new Promise((r) =>
          setTimeout(r, RETRY_BACKOFF_MS * (MAX_RETRIES - retries + 1))
        );
        return generateResponse(systemPrompt, userMessage, config, retries - 1);
      }
      throw new Error(
        `HuggingFace text generation API error (${response.status}): ${errorText}`
      );
    }

    const data = await response.json();
    const choice = data.choices[0];

    return {
      content: choice.message.content,
      finishReason: choice.finish_reason,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/llm-client.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/llm-client.ts tests/unit/llm-client.test.ts
git commit -m "feat: add HuggingFace LLM client with retry and timeout"
```

---

## Task 4: Phase Templates

**Files:**
- Create: `src/lib/ai/phase-templates.ts`
- Create: `tests/unit/phase-templates.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/phase-templates.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDefaultPhases, seedPhaseTemplates } from "@/lib/ai/phase-templates";

const mockInsert = vi.fn().mockReturnValue({ error: null });
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: mockInsert,
    })),
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getDefaultPhases", () => {
  it("returns 5 phases for ecommerce", () => {
    const phases = getDefaultPhases("ecommerce");

    expect(phases).toHaveLength(5);
    expect(phases[0].name).toBe("Greet");
    expect(phases[0].order_index).toBe(0);
    expect(phases[4].name).toBe("Follow-up");
    expect(phases[4].order_index).toBe(4);
  });

  it("returns 5 phases for real_estate", () => {
    const phases = getDefaultPhases("real_estate");

    expect(phases).toHaveLength(5);
    expect(phases[0].name).toBe("Greet");
    expect(phases[1].name).toBe("Understand Needs");
    expect(phases[4].name).toBe("Schedule Viewing");
  });

  it("returns 5 phases for digital_product", () => {
    const phases = getDefaultPhases("digital_product");

    expect(phases).toHaveLength(5);
    expect(phases[1].name).toBe("Educate");
    expect(phases[4].name).toBe("Close");
  });

  it("returns 5 phases for services", () => {
    const phases = getDefaultPhases("services");

    expect(phases).toHaveLength(5);
    expect(phases[1].name).toBe("Nurture");
    expect(phases[2].name).toBe("Qualify");
    expect(phases[3].name).toBe("Pitch");
    expect(phases[4].name).toBe("Close");
  });

  it("all phases have required fields", () => {
    const businessTypes = ["ecommerce", "real_estate", "digital_product", "services"] as const;

    for (const type of businessTypes) {
      const phases = getDefaultPhases(type);
      for (const phase of phases) {
        expect(phase.name).toBeTruthy();
        expect(typeof phase.order_index).toBe("number");
        expect(typeof phase.max_messages).toBe("number");
        expect(phase.max_messages).toBeGreaterThan(0);
        expect(phase.system_prompt).toBeTruthy();
        expect(phase.tone).toBeTruthy();
        expect(phase.goals).toBeTruthy();
        expect(phase.transition_hint).toBeTruthy();
      }
    }
  });

  it("phases have sequential order_index starting from 0", () => {
    const phases = getDefaultPhases("services");

    phases.forEach((phase, i) => {
      expect(phase.order_index).toBe(i);
    });
  });

  it("first phase always has max_messages of 1", () => {
    const businessTypes = ["ecommerce", "real_estate", "digital_product", "services"] as const;

    for (const type of businessTypes) {
      const phases = getDefaultPhases(type);
      expect(phases[0].max_messages).toBe(1);
    }
  });
});

describe("seedPhaseTemplates", () => {
  it("inserts phases into bot_flow_phases with tenant_id", async () => {
    await seedPhaseTemplates("tenant-1", "services");

    expect(mockInsert).toHaveBeenCalledOnce();
    const insertedRows = mockInsert.mock.calls[0][0];
    expect(insertedRows).toHaveLength(5);
    expect(insertedRows[0].tenant_id).toBe("tenant-1");
    expect(insertedRows[0].name).toBe("Greet");
  });

  it("throws when insert fails", async () => {
    mockInsert.mockReturnValueOnce({ error: { message: "DB error" } });

    await expect(seedPhaseTemplates("tenant-1", "ecommerce")).rejects.toThrow(
      "Failed to seed phase templates: DB error"
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/phase-templates.test.ts`
Expected: FAIL — `phase-templates` module not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/ai/phase-templates.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/service";

type BusinessType = "ecommerce" | "real_estate" | "digital_product" | "services";

export interface PhaseTemplate {
  name: string;
  order_index: number;
  max_messages: number;
  system_prompt: string;
  tone: string;
  goals: string;
  transition_hint: string;
}

const ECOMMERCE_PHASES: PhaseTemplate[] = [
  {
    name: "Greet",
    order_index: 0,
    max_messages: 1,
    system_prompt: "Welcome the lead warmly. Introduce yourself as a shopping assistant. Ask what they're looking for today. Keep it brief and friendly.",
    tone: "friendly and casual",
    goals: "Make the lead feel welcome and start a conversation",
    transition_hint: "Advance when the lead mentions what they're looking for or asks a question",
  },
  {
    name: "Browse/Discover",
    order_index: 1,
    max_messages: 5,
    system_prompt: "Help the lead explore products. Answer questions about items, availability, and features. Share relevant product details naturally. Don't push for a sale yet.",
    tone: "helpful and knowledgeable",
    goals: "Help the lead find products that match their needs",
    transition_hint: "Advance when the lead shows interest in specific products or asks about pricing",
  },
  {
    name: "Recommend",
    order_index: 2,
    max_messages: 3,
    system_prompt: "Based on what you've learned, recommend specific products. Highlight benefits relevant to what the lead mentioned. Compare options if helpful.",
    tone: "confident and helpful",
    goals: "Narrow down to 1-2 products the lead is interested in",
    transition_hint: "Advance when the lead says they want a product or asks how to buy",
  },
  {
    name: "Cart/Checkout",
    order_index: 3,
    max_messages: 3,
    system_prompt: "Guide the lead toward purchasing. Share the action button to view the product page or checkout. Handle any last-minute questions about shipping, returns, or payment.",
    tone: "reassuring and direct",
    goals: "Get the lead to click the action button and complete their purchase",
    transition_hint: "Advance after the lead clicks the action button or confirms they'll buy",
  },
  {
    name: "Follow-up",
    order_index: 4,
    max_messages: 5,
    system_prompt: "Thank the lead for their interest or purchase. Ask if there's anything else you can help with. Be warm and leave a good impression.",
    tone: "warm and appreciative",
    goals: "Close the conversation positively and leave the door open for future interactions",
    transition_hint: "This is the final phase — stay here",
  },
];

const REAL_ESTATE_PHASES: PhaseTemplate[] = [
  {
    name: "Greet",
    order_index: 0,
    max_messages: 1,
    system_prompt: "Welcome the lead warmly. Introduce yourself as a real estate assistant. Ask what kind of property they're interested in.",
    tone: "professional and friendly",
    goals: "Make the lead feel welcome and start understanding their needs",
    transition_hint: "Advance when the lead mentions what they're looking for",
  },
  {
    name: "Understand Needs",
    order_index: 1,
    max_messages: 4,
    system_prompt: "Ask about their ideal property: location, size, type (house/apartment/condo), must-haves, and timeline. Listen carefully and acknowledge their preferences.",
    tone: "attentive and curious",
    goals: "Build a clear picture of what the lead is looking for",
    transition_hint: "Advance when you have a clear understanding of their requirements",
  },
  {
    name: "Qualify Budget",
    order_index: 2,
    max_messages: 3,
    system_prompt: "Naturally discuss budget range and financing. Ask if they're pre-approved or need financing help. Be tactful — don't make it feel like an interrogation.",
    tone: "tactful and professional",
    goals: "Understand the lead's budget and financing situation",
    transition_hint: "Advance when you know their budget range",
  },
  {
    name: "Show Listings",
    order_index: 3,
    max_messages: 4,
    system_prompt: "Share relevant listings that match their criteria. Highlight key features that align with what they mentioned. Use action buttons to send listing pages.",
    tone: "enthusiastic and informative",
    goals: "Present matching properties and generate excitement",
    transition_hint: "Advance when the lead wants to see a property in person",
  },
  {
    name: "Schedule Viewing",
    order_index: 4,
    max_messages: 3,
    system_prompt: "Offer to schedule a viewing or consultation. Share the booking action button. Handle scheduling questions and confirm details.",
    tone: "helpful and action-oriented",
    goals: "Get the lead to book a viewing or consultation",
    transition_hint: "This is the final phase — stay here",
  },
];

const DIGITAL_PRODUCT_PHASES: PhaseTemplate[] = [
  {
    name: "Greet",
    order_index: 0,
    max_messages: 1,
    system_prompt: "Welcome the lead. Introduce yourself and the product/service briefly. Ask what brought them here or what they're trying to achieve.",
    tone: "friendly and approachable",
    goals: "Make a connection and understand why they're here",
    transition_hint: "Advance when the lead shares their goal or asks about the product",
  },
  {
    name: "Educate",
    order_index: 1,
    max_messages: 4,
    system_prompt: "Share valuable information about the problem your product solves. Educate without selling. Help the lead understand why this matters. Share relevant knowledge naturally.",
    tone: "knowledgeable and genuine",
    goals: "Position the product as the solution by educating about the problem",
    transition_hint: "Advance when the lead shows understanding and interest in solutions",
  },
  {
    name: "Demo/Preview",
    order_index: 2,
    max_messages: 3,
    system_prompt: "Show what the product can do. Share previews, examples, or testimonials. Use action buttons to link to demo pages or samples. Let the product speak for itself.",
    tone: "confident and excited",
    goals: "Let the lead experience or visualize the product's value",
    transition_hint: "Advance when the lead expresses interest in getting the product",
  },
  {
    name: "Pitch",
    order_index: 3,
    max_messages: 3,
    system_prompt: "Present the offer clearly: what they get, the price, and any bonuses or guarantees. Handle objections honestly. Share the action button to the sales page.",
    tone: "direct and honest",
    goals: "Present the offer and handle objections",
    transition_hint: "Advance when the lead is ready to buy or clicks the action button",
  },
  {
    name: "Close",
    order_index: 4,
    max_messages: 5,
    system_prompt: "If they haven't bought yet, address remaining concerns. If they have, thank them and set expectations for next steps. Be genuine, not pushy.",
    tone: "supportive and patient",
    goals: "Close the sale or leave a positive impression for future follow-up",
    transition_hint: "This is the final phase — stay here",
  },
];

const SERVICES_PHASES: PhaseTemplate[] = [
  {
    name: "Greet",
    order_index: 0,
    max_messages: 1,
    system_prompt: "Welcome the lead warmly. Introduce yourself briefly. Ask how you can help them today. Keep it short and natural.",
    tone: "friendly and helpful",
    goals: "Make the lead feel welcome and open the conversation",
    transition_hint: "Advance when the lead states their need or asks a question",
  },
  {
    name: "Nurture",
    order_index: 1,
    max_messages: 3,
    system_prompt: "Build rapport. Answer questions naturally and share relevant information. Don't rush to sell — focus on being helpful and understanding their situation.",
    tone: "conversational and empathetic",
    goals: "Build trust and understand the lead's situation",
    transition_hint: "Advance when trust is established and you understand their needs",
  },
  {
    name: "Qualify",
    order_index: 2,
    max_messages: 3,
    system_prompt: "Ask qualifying questions to understand if your service is a good fit. Learn about their timeline, budget considerations, and specific requirements. Be natural, not formulaic.",
    tone: "professional and curious",
    goals: "Determine if the lead is a good fit and understand their requirements",
    transition_hint: "Advance when you have enough info to make a relevant pitch",
  },
  {
    name: "Pitch",
    order_index: 3,
    max_messages: 2,
    system_prompt: "Present your solution tailored to what you've learned. Explain how your service addresses their specific needs. Share action buttons for booking or learning more.",
    tone: "confident and personalized",
    goals: "Present a compelling, personalized pitch",
    transition_hint: "Advance after presenting the pitch and action button",
  },
  {
    name: "Close",
    order_index: 4,
    max_messages: 5,
    system_prompt: "Handle any remaining objections or questions. Guide them toward taking the next step (booking, signing up, etc.). If they're not ready, be understanding and leave the door open.",
    tone: "patient and supportive",
    goals: "Convert the lead or leave a positive impression",
    transition_hint: "This is the final phase — stay here",
  },
];

const PHASE_MAP: Record<BusinessType, PhaseTemplate[]> = {
  ecommerce: ECOMMERCE_PHASES,
  real_estate: REAL_ESTATE_PHASES,
  digital_product: DIGITAL_PRODUCT_PHASES,
  services: SERVICES_PHASES,
};

export function getDefaultPhases(businessType: BusinessType): PhaseTemplate[] {
  return PHASE_MAP[businessType];
}

export async function seedPhaseTemplates(
  tenantId: string,
  businessType: BusinessType
): Promise<void> {
  const supabase = createServiceClient();
  const phases = getDefaultPhases(businessType);

  const rows = phases.map((phase) => ({
    tenant_id: tenantId,
    ...phase,
  }));

  const { error } = await supabase.from("bot_flow_phases").insert(rows);

  if (error) {
    throw new Error(`Failed to seed phase templates: ${error.message}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/phase-templates.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/phase-templates.ts tests/unit/phase-templates.test.ts
git commit -m "feat: add phase templates for all business types with seeding"
```

---

## Task 5: Phase Machine

**Files:**
- Create: `src/lib/ai/phase-machine.ts`
- Create: `tests/unit/phase-machine.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/phase-machine.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getCurrentPhase,
  advancePhase,
  incrementMessageCount,
} from "@/lib/ai/phase-machine";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const makePhaseRow = (overrides = {}) => ({
  id: "cp-1",
  phase_id: "phase-1",
  message_count: 0,
  bot_flow_phases: {
    id: "phase-1",
    name: "Greet",
    order_index: 0,
    max_messages: 1,
    system_prompt: "Welcome the lead.",
    tone: "friendly",
    goals: "Open conversation",
    transition_hint: "Advance when lead responds",
    action_button_ids: null,
  },
  ...overrides,
});

describe("getCurrentPhase", () => {
  it("returns the current phase when one exists", async () => {
    const row = makePhaseRow();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: row, error: null }),
            }),
          }),
        }),
      }),
    });

    const result = await getCurrentPhase("conv-1", "tenant-1");

    expect(result.name).toBe("Greet");
    expect(result.orderIndex).toBe(0);
    expect(result.messageCount).toBe(0);
    expect(result.conversationPhaseId).toBe("cp-1");
  });

  it("initializes first phase when no phase exists", async () => {
    // First call: no existing conversation_phase
    const selectChain = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    };

    // Second call: get first bot_flow_phase for tenant
    const firstPhase = {
      id: "phase-1",
      name: "Greet",
      order_index: 0,
      max_messages: 1,
      system_prompt: "Welcome the lead.",
      tone: "friendly",
      goals: "Open conversation",
      transition_hint: "Advance when lead responds",
      action_button_ids: null,
    };
    const selectPhaseChain = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: firstPhase, error: null }),
            }),
          }),
        }),
      }),
    };

    // Third call: insert new conversation_phase
    const insertChain = {
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: "cp-new", phase_id: "phase-1", message_count: 0 },
            error: null,
          }),
        }),
      }),
    };

    mockFrom
      .mockReturnValueOnce(selectChain)     // conversation_phases lookup
      .mockReturnValueOnce(selectPhaseChain) // bot_flow_phases lookup
      .mockReturnValueOnce(insertChain);     // conversation_phases insert

    const result = await getCurrentPhase("conv-1", "tenant-1");

    expect(result.name).toBe("Greet");
    expect(result.orderIndex).toBe(0);
    expect(result.conversationPhaseId).toBe("cp-new");
  });
});

describe("advancePhase", () => {
  it("advances to the next phase by order_index", async () => {
    // Get current phase (order_index 0)
    const currentRow = makePhaseRow({ id: "cp-1" });
    const selectCurrentChain = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: currentRow, error: null }),
            }),
          }),
        }),
      }),
    };

    // Get next phase from bot_flow_phases
    const nextPhase = {
      id: "phase-2",
      name: "Nurture",
      order_index: 1,
      max_messages: 3,
      system_prompt: "Build rapport.",
      tone: "conversational",
      goals: "Build trust",
      transition_hint: "Advance when trust is established",
      action_button_ids: null,
    };
    const selectNextChain = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gt: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: nextPhase, error: null }),
              }),
            }),
          }),
        }),
      }),
    };

    // Insert new conversation_phase
    const insertChain = {
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: "cp-2", phase_id: "phase-2", message_count: 0 },
            error: null,
          }),
        }),
      }),
    };

    mockFrom
      .mockReturnValueOnce(selectCurrentChain)
      .mockReturnValueOnce(selectNextChain)
      .mockReturnValueOnce(insertChain);

    const result = await advancePhase("conv-1", "tenant-1");

    expect(result.name).toBe("Nurture");
    expect(result.orderIndex).toBe(1);
  });

  it("stays on current phase when already on last phase", async () => {
    const lastPhaseRow = makePhaseRow({
      bot_flow_phases: {
        id: "phase-5",
        name: "Close",
        order_index: 4,
        max_messages: 5,
        system_prompt: "Close the conversation.",
        tone: "warm",
        goals: "Convert or leave positive impression",
        transition_hint: "This is the final phase",
        action_button_ids: null,
      },
    });

    const selectCurrentChain = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: lastPhaseRow, error: null }),
            }),
          }),
        }),
      }),
    };

    // No next phase found
    const selectNextChain = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gt: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    };

    mockFrom
      .mockReturnValueOnce(selectCurrentChain)
      .mockReturnValueOnce(selectNextChain);

    const result = await advancePhase("conv-1", "tenant-1");

    expect(result.name).toBe("Close");
    expect(result.orderIndex).toBe(4);
  });
});

describe("incrementMessageCount", () => {
  it("increments message_count by 1", async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    await incrementMessageCount("cp-1");

    expect(mockFrom).toHaveBeenCalledWith("conversation_phases");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/phase-machine.test.ts`
Expected: FAIL — `phase-machine` module not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/ai/phase-machine.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/service";

export interface CurrentPhase {
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

interface BotFlowPhase {
  id: string;
  name: string;
  order_index: number;
  max_messages: number;
  system_prompt: string;
  tone: string;
  goals: string | null;
  transition_hint: string | null;
  action_button_ids: string[] | null;
}

function mapToCurrentPhase(
  conversationPhaseId: string,
  messageCount: number,
  phase: BotFlowPhase
): CurrentPhase {
  return {
    conversationPhaseId,
    phaseId: phase.id,
    name: phase.name,
    orderIndex: phase.order_index,
    maxMessages: phase.max_messages,
    systemPrompt: phase.system_prompt,
    tone: phase.tone,
    goals: phase.goals,
    transitionHint: phase.transition_hint,
    actionButtonIds: phase.action_button_ids,
    messageCount,
  };
}

export async function getCurrentPhase(
  conversationId: string,
  tenantId: string
): Promise<CurrentPhase> {
  const supabase = createServiceClient();

  // Try to get the existing conversation phase
  const { data: existing } = await supabase
    .from("conversation_phases")
    .select("id, phase_id, message_count, bot_flow_phases(*)")
    .eq("conversation_id", conversationId)
    .order("entered_at", { ascending: false })
    .limit(1)
    .single();

  if (existing) {
    const phase = existing.bot_flow_phases as unknown as BotFlowPhase;
    return mapToCurrentPhase(existing.id, existing.message_count, phase);
  }

  // Initialize with the first phase for this tenant
  const { data: firstPhase, error: phaseError } = await supabase
    .from("bot_flow_phases")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("order_index", { ascending: true })
    .limit(1)
    .single();

  if (phaseError || !firstPhase) {
    throw new Error("No bot flow phases configured for this tenant");
  }

  const { data: inserted, error: insertError } = await supabase
    .from("conversation_phases")
    .insert({
      conversation_id: conversationId,
      phase_id: firstPhase.id,
      message_count: 0,
    })
    .select("id, phase_id, message_count")
    .single();

  if (insertError || !inserted) {
    throw new Error(`Failed to initialize conversation phase: ${insertError?.message}`);
  }

  return mapToCurrentPhase(inserted.id, 0, firstPhase as BotFlowPhase);
}

export async function advancePhase(
  conversationId: string,
  tenantId: string
): Promise<CurrentPhase> {
  const supabase = createServiceClient();
  const current = await getCurrentPhase(conversationId, tenantId);

  // Find the next phase by order_index
  const { data: nextPhase } = await supabase
    .from("bot_flow_phases")
    .select("*")
    .eq("tenant_id", tenantId)
    .gt("order_index", current.orderIndex)
    .order("order_index", { ascending: true })
    .limit(1)
    .single();

  // If no next phase, stay on current
  if (!nextPhase) {
    return current;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("conversation_phases")
    .insert({
      conversation_id: conversationId,
      phase_id: nextPhase.id,
      message_count: 0,
    })
    .select("id, phase_id, message_count")
    .single();

  if (insertError || !inserted) {
    throw new Error(`Failed to advance phase: ${insertError?.message}`);
  }

  return mapToCurrentPhase(inserted.id, 0, nextPhase as BotFlowPhase);
}

export async function incrementMessageCount(
  conversationPhaseId: string
): Promise<void> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("conversation_phases")
    .update({ message_count: supabase.rpc ? undefined : 0 })
    .eq("id", conversationPhaseId);

  // Use raw SQL increment via RPC or a simple read-update pattern
  // For simplicity, read current count and increment
  const { data } = await supabase
    .from("conversation_phases")
    .select("message_count")
    .eq("id", conversationPhaseId)
    .single();

  if (data) {
    await supabase
      .from("conversation_phases")
      .update({ message_count: data.message_count + 1 })
      .eq("id", conversationPhaseId);
  }
}
```

**Note:** The `incrementMessageCount` above uses a read-then-update pattern. A cleaner approach is a Supabase RPC function, but to keep this migration-free, the read+update is acceptable for the expected concurrency level (one bot per conversation).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/phase-machine.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/phase-machine.ts tests/unit/phase-machine.test.ts
git commit -m "feat: add phase machine for conversation phase tracking"
```

---

## Task 6: Prompt Builder

**Files:**
- Create: `src/lib/ai/prompt-builder.ts`
- Create: `tests/unit/prompt-builder.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/prompt-builder.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSystemPrompt } from "@/lib/ai/prompt-builder";
import type { CurrentPhase } from "@/lib/ai/phase-machine";
import type { ChunkResult } from "@/lib/ai/vector-search";

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const makePhase = (overrides = {}): CurrentPhase => ({
  conversationPhaseId: "cp-1",
  phaseId: "phase-1",
  name: "Greet",
  orderIndex: 0,
  maxMessages: 1,
  systemPrompt: "Welcome the lead warmly.",
  tone: "friendly",
  goals: "Open conversation",
  transitionHint: "Advance when lead responds",
  actionButtonIds: null,
  messageCount: 0,
  ...overrides,
});

const makeChunk = (content: string, similarity = 0.8): ChunkResult => ({
  id: `chunk-${Math.random()}`,
  content,
  similarity,
  metadata: {},
});

function setupMocks(
  rules: { rule_text: string; category: string }[] = [],
  messages: { direction: string; text: string }[] = []
) {
  // bot_rules query
  const rulesChain = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: rules, error: null }),
      }),
    }),
  };

  // messages query
  const messagesChain = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: messages, error: null }),
        }),
      }),
    }),
  };

  mockFrom
    .mockReturnValueOnce(rulesChain)
    .mockReturnValueOnce(messagesChain);
}

describe("buildSystemPrompt", () => {
  it("includes all 7 layers in the prompt", async () => {
    setupMocks(
      [{ rule_text: "Never discuss competitors", category: "boundary" }],
      [
        { direction: "in", text: "Hi there" },
        { direction: "out", text: "Welcome!" },
      ]
    );

    const prompt = await buildSystemPrompt({
      tenantId: "tenant-1",
      businessName: "Acme Corp",
      currentPhase: makePhase(),
      conversationId: "conv-1",
      ragChunks: [makeChunk("We are open 9-5.")],
    });

    // Layer 1: Base persona
    expect(prompt).toContain("Acme Corp");
    expect(prompt).toContain("real human");
    // Layer 2: Bot rules
    expect(prompt).toContain("Never discuss competitors");
    // Layer 3: Current phase
    expect(prompt).toContain("Welcome the lead warmly.");
    expect(prompt).toContain("friendly");
    // Layer 4: Conversation history
    expect(prompt).toContain("Lead: Hi there");
    expect(prompt).toContain("Bot: Welcome!");
    // Layer 5: Retrieved knowledge
    expect(prompt).toContain("We are open 9-5.");
    // Layer 7: Decision instructions
    expect(prompt).toContain("phase_action");
    expect(prompt).toContain("confidence");
  });

  it("handles empty bot rules gracefully", async () => {
    setupMocks([], []);

    const prompt = await buildSystemPrompt({
      tenantId: "tenant-1",
      businessName: "TestBiz",
      currentPhase: makePhase(),
      conversationId: "conv-1",
      ragChunks: [],
    });

    expect(prompt).toContain("TestBiz");
    expect(prompt).not.toContain("undefined");
  });

  it("handles empty RAG chunks gracefully", async () => {
    setupMocks([], []);

    const prompt = await buildSystemPrompt({
      tenantId: "tenant-1",
      businessName: "TestBiz",
      currentPhase: makePhase(),
      conversationId: "conv-1",
      ragChunks: [],
    });

    expect(prompt).toContain("No specific knowledge retrieved");
  });

  it("includes phase goals and transition hint", async () => {
    setupMocks([], []);

    const prompt = await buildSystemPrompt({
      tenantId: "tenant-1",
      businessName: "TestBiz",
      currentPhase: makePhase({
        goals: "Qualify the lead",
        transitionHint: "Advance when budget is known",
      }),
      conversationId: "conv-1",
      ragChunks: [],
    });

    expect(prompt).toContain("Qualify the lead");
    expect(prompt).toContain("Advance when budget is known");
  });

  it("includes message count and max in phase context", async () => {
    setupMocks([], []);

    const prompt = await buildSystemPrompt({
      tenantId: "tenant-1",
      businessName: "TestBiz",
      currentPhase: makePhase({ messageCount: 2, maxMessages: 3 }),
      conversationId: "conv-1",
      ragChunks: [],
    });

    expect(prompt).toContain("2");
    expect(prompt).toContain("3");
  });

  it("truncates conversation history to 8000 characters", async () => {
    const longMessages = Array.from({ length: 30 }, (_, i) => ({
      direction: i % 2 === 0 ? "in" : "out",
      text: "A".repeat(500),
    }));
    setupMocks([], longMessages);

    const prompt = await buildSystemPrompt({
      tenantId: "tenant-1",
      businessName: "TestBiz",
      currentPhase: makePhase(),
      conversationId: "conv-1",
      ragChunks: [],
    });

    // The history section should be capped
    const historySection = prompt.split("CONVERSATION HISTORY")[1]?.split("RETRIEVED KNOWLEDGE")[0];
    if (historySection) {
      expect(historySection.length).toBeLessThanOrEqual(9000); // some padding for headers
    }
  });

  it("handles images array when provided", async () => {
    setupMocks([], []);

    const prompt = await buildSystemPrompt({
      tenantId: "tenant-1",
      businessName: "TestBiz",
      currentPhase: makePhase(),
      conversationId: "conv-1",
      ragChunks: [],
      images: [
        {
          id: "img-1",
          url: "https://example.com/photo.jpg",
          description: "Office photo",
          context_hint: "Send when asked about location",
        },
      ],
    });

    expect(prompt).toContain("img-1");
    expect(prompt).toContain("Office photo");
    expect(prompt).toContain("Send when asked about location");
  });

  it("handles empty images array gracefully", async () => {
    setupMocks([], []);

    const prompt = await buildSystemPrompt({
      tenantId: "tenant-1",
      businessName: "TestBiz",
      currentPhase: makePhase(),
      conversationId: "conv-1",
      ragChunks: [],
      images: [],
    });

    expect(prompt).toContain("No images available");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/prompt-builder.test.ts`
Expected: FAIL — `prompt-builder` module not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/ai/prompt-builder.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/service";
import type { CurrentPhase } from "@/lib/ai/phase-machine";
import type { ChunkResult } from "@/lib/ai/vector-search";

const MAX_HISTORY_CHARS = 8000;
const MAX_HISTORY_MESSAGES = 20;

export interface KnowledgeImage {
  id: string;
  url: string;
  description: string;
  context_hint: string | null;
}

export interface PromptContext {
  tenantId: string;
  businessName: string;
  currentPhase: CurrentPhase;
  conversationId: string;
  ragChunks: ChunkResult[];
  images?: KnowledgeImage[];
}

function buildLayer1(businessName: string): string {
  return `You are a helpful assistant for ${businessName}. Sound like a real human. Keep messages short and conversational. Never use bullet lists or corporate speak.`;
}

function buildLayer2(rules: { rule_text: string; category: string }[]): string {
  if (rules.length === 0) return "";

  const grouped: Record<string, string[]> = {};
  for (const rule of rules) {
    if (!grouped[rule.category]) grouped[rule.category] = [];
    grouped[rule.category].push(rule.rule_text);
  }

  let section = "\n\n--- BOT RULES ---\n";
  for (const [category, items] of Object.entries(grouped)) {
    section += `${category.toUpperCase()}:\n`;
    for (const item of items) {
      section += `- ${item}\n`;
    }
  }
  return section;
}

function buildLayer3(phase: CurrentPhase): string {
  let section = `\n\n--- CURRENT PHASE: ${phase.name} ---\n`;
  section += `Instructions: ${phase.systemPrompt}\n`;
  section += `Tone: ${phase.tone}\n`;
  if (phase.goals) section += `Goals: ${phase.goals}\n`;
  if (phase.transitionHint) section += `Transition hint: ${phase.transitionHint}\n`;
  section += `Messages in this phase: ${phase.messageCount} / ${phase.maxMessages} (soft limit)\n`;
  return section;
}

function buildLayer4(
  messages: { direction: string; text: string | null }[]
): string {
  if (messages.length === 0) {
    return "\n\n--- CONVERSATION HISTORY ---\nNo previous messages.\n";
  }

  let section = "\n\n--- CONVERSATION HISTORY ---\n";
  let charCount = 0;

  // Messages come in DESC order from DB, reverse to chronological
  const chronological = [...messages].reverse();

  for (const msg of chronological) {
    const prefix = msg.direction === "in" ? "Lead" : "Bot";
    const line = `${prefix}: ${msg.text ?? "(no text)"}\n`;
    if (charCount + line.length > MAX_HISTORY_CHARS) break;
    section += line;
    charCount += line.length;
  }

  return section;
}

function buildLayer5(chunks: ChunkResult[]): string {
  if (chunks.length === 0) {
    return "\n\n--- RETRIEVED KNOWLEDGE ---\nNo specific knowledge retrieved. Answer based on the conversation and your instructions.\n";
  }

  let section = "\n\n--- RETRIEVED KNOWLEDGE ---\nUse this information to answer the lead's question:\n";
  chunks.forEach((chunk, i) => {
    section += `[${i + 1}] ${chunk.content}\n`;
  });
  return section;
}

function buildLayer6(images?: KnowledgeImage[]): string {
  if (!images || images.length === 0) {
    return "\n\n--- AVAILABLE IMAGES ---\nNo images available.\n";
  }

  let section = "\n\n--- AVAILABLE IMAGES ---\nYou may include relevant images in your response:\n";
  for (const img of images) {
    section += `- [${img.id}] ${img.description}`;
    if (img.context_hint) section += ` — ${img.context_hint}`;
    section += "\n";
  }
  section += '\nIf an image is relevant, include its ID in the "image_ids" array in your response.\n';
  return section;
}

function buildLayer7(): string {
  return `\n\n--- RESPONSE FORMAT ---
You MUST respond with a JSON object and nothing else. No text before or after the JSON.

{
  "message": "Your response to the lead (plain text, conversational)",
  "phase_action": "stay or advance or escalate",
  "confidence": 0.0 to 1.0,
  "image_ids": []
}

- "phase_action": Use "stay" to remain in the current phase. Use "advance" if the lead is ready for the next step. Use "escalate" if you cannot help and a human should take over.
- "confidence": How confident you are in your response. 1.0 = very confident, 0.0 = not confident at all.
- "image_ids": Array of image IDs to send after your message. Empty array if no images.`;
}

export async function buildSystemPrompt(ctx: PromptContext): Promise<string> {
  const supabase = createServiceClient();

  // Fetch bot rules and conversation history in parallel
  const [rulesResult, messagesResult] = await Promise.all([
    supabase
      .from("bot_rules")
      .select("rule_text, category")
      .eq("tenant_id", ctx.tenantId)
      .eq("enabled", true),
    supabase
      .from("messages")
      .select("direction, text")
      .eq("conversation_id", ctx.conversationId)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY_MESSAGES),
  ]);

  const rules = rulesResult.data ?? [];
  const messages = messagesResult.data ?? [];

  let prompt = buildLayer1(ctx.businessName);
  prompt += buildLayer2(rules);
  prompt += buildLayer3(ctx.currentPhase);
  prompt += buildLayer4(messages);
  prompt += buildLayer5(ctx.ragChunks);
  prompt += buildLayer6(ctx.images);
  prompt += buildLayer7();

  return prompt;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/prompt-builder.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/prompt-builder.ts tests/unit/prompt-builder.test.ts
git commit -m "feat: add 7-layer system prompt builder"
```

---

## Task 7: Conversation Engine (Orchestrator)

**Files:**
- Create: `src/lib/ai/conversation-engine.ts`
- Create: `tests/unit/conversation-engine.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/conversation-engine.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleMessage } from "@/lib/ai/conversation-engine";

vi.mock("@/lib/ai/phase-machine", () => ({
  getCurrentPhase: vi.fn(),
  advancePhase: vi.fn(),
  incrementMessageCount: vi.fn(),
}));

vi.mock("@/lib/ai/retriever", () => ({
  retrieveKnowledge: vi.fn(),
}));

vi.mock("@/lib/ai/prompt-builder", () => ({
  buildSystemPrompt: vi.fn(),
}));

vi.mock("@/lib/ai/llm-client", () => ({
  generateResponse: vi.fn(),
}));

vi.mock("@/lib/ai/decision-parser", () => ({
  parseDecision: vi.fn(),
}));

const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null }),
});
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      update: mockUpdate,
    })),
  })),
}));

import { getCurrentPhase, advancePhase, incrementMessageCount } from "@/lib/ai/phase-machine";
import { retrieveKnowledge } from "@/lib/ai/retriever";
import { buildSystemPrompt } from "@/lib/ai/prompt-builder";
import { generateResponse } from "@/lib/ai/llm-client";
import { parseDecision } from "@/lib/ai/decision-parser";

const mockGetCurrentPhase = vi.mocked(getCurrentPhase);
const mockAdvancePhase = vi.mocked(advancePhase);
const mockIncrementMessageCount = vi.mocked(incrementMessageCount);
const mockRetrieveKnowledge = vi.mocked(retrieveKnowledge);
const mockBuildSystemPrompt = vi.mocked(buildSystemPrompt);
const mockGenerateResponse = vi.mocked(generateResponse);
const mockParseDecision = vi.mocked(parseDecision);

const defaultPhase = {
  conversationPhaseId: "cp-1",
  phaseId: "phase-1",
  name: "Greet",
  orderIndex: 0,
  maxMessages: 1,
  systemPrompt: "Welcome the lead.",
  tone: "friendly",
  goals: "Open conversation",
  transitionHint: "Advance when lead responds",
  actionButtonIds: null,
  messageCount: 0,
};

const defaultInput = {
  tenantId: "tenant-1",
  businessName: "Acme Corp",
  conversationId: "conv-1",
  leadMessage: "Hi there!",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentPhase.mockResolvedValue(defaultPhase);
  mockRetrieveKnowledge.mockResolvedValue({
    status: "success",
    chunks: [{ id: "c1", content: "Info", similarity: 0.8, metadata: {} }],
    queryTarget: "general",
  });
  mockBuildSystemPrompt.mockResolvedValue("system prompt");
  mockGenerateResponse.mockResolvedValue({
    content: '{"message":"Hello!","phase_action":"stay","confidence":0.85,"image_ids":[]}',
    finishReason: "stop",
  });
  mockParseDecision.mockReturnValue({
    message: "Hello!",
    phaseAction: "stay",
    confidence: 0.85,
    imageIds: [],
  });
  mockIncrementMessageCount.mockResolvedValue(undefined);
});

describe("handleMessage", () => {
  it("runs the full pipeline and returns response", async () => {
    const result = await handleMessage(defaultInput);

    expect(result.message).toBe("Hello!");
    expect(result.phaseAction).toBe("stay");
    expect(result.confidence).toBe(0.85);
    expect(result.currentPhase).toBe("Greet");
    expect(result.escalated).toBe(false);

    expect(mockGetCurrentPhase).toHaveBeenCalledWith("conv-1", "tenant-1");
    expect(mockRetrieveKnowledge).toHaveBeenCalledWith({
      query: "Hi there!",
      tenantId: "tenant-1",
    });
    expect(mockBuildSystemPrompt).toHaveBeenCalledOnce();
    expect(mockGenerateResponse).toHaveBeenCalledWith("system prompt", "Hi there!");
    expect(mockIncrementMessageCount).toHaveBeenCalledWith("cp-1");
  });

  it("advances phase when LLM decides to advance", async () => {
    mockParseDecision.mockReturnValue({
      message: "Great, let me show you our options.",
      phaseAction: "advance",
      confidence: 0.9,
      imageIds: [],
    });
    mockAdvancePhase.mockResolvedValue({
      ...defaultPhase,
      name: "Nurture",
      orderIndex: 1,
    });

    const result = await handleMessage(defaultInput);

    expect(result.phaseAction).toBe("advance");
    expect(mockAdvancePhase).toHaveBeenCalledWith("conv-1", "tenant-1");
  });

  it("escalates and flags conversation when confidence < 0.4", async () => {
    mockParseDecision.mockReturnValue({
      message: "Let me get someone who can help.",
      phaseAction: "escalate",
      confidence: 0.3,
      imageIds: [],
    });

    const result = await handleMessage(defaultInput);

    expect(result.escalated).toBe(true);
    expect(result.phaseAction).toBe("escalate");
  });

  it("prepends hedging phrase when confidence is 0.4-0.7", async () => {
    mockParseDecision.mockReturnValue({
      message: "The price is $25.",
      phaseAction: "stay",
      confidence: 0.55,
      imageIds: [],
    });

    const result = await handleMessage(defaultInput);

    expect(result.confidence).toBe(0.55);
    // Message should start with a hedging phrase
    expect(result.message).not.toBe("The price is $25.");
    expect(result.message).toContain("The price is $25.");
  });

  it("does not hedge when confidence >= 0.7", async () => {
    mockParseDecision.mockReturnValue({
      message: "The price is $25.",
      phaseAction: "stay",
      confidence: 0.85,
      imageIds: [],
    });

    const result = await handleMessage(defaultInput);

    expect(result.message).toBe("The price is $25.");
  });

  it("does not hedge when escalating (confidence < 0.4)", async () => {
    mockParseDecision.mockReturnValue({
      message: "Let me check with my team.",
      phaseAction: "escalate",
      confidence: 0.2,
      imageIds: [],
    });

    const result = await handleMessage(defaultInput);

    expect(result.message).toBe("Let me check with my team.");
  });

  it("passes image IDs through from decision", async () => {
    mockParseDecision.mockReturnValue({
      message: "Here's our office!",
      phaseAction: "stay",
      confidence: 0.9,
      imageIds: ["img-1", "img-2"],
    });

    const result = await handleMessage(defaultInput);

    expect(result.imageIds).toEqual(["img-1", "img-2"]);
  });

  it("does not advance phase when action is stay", async () => {
    const result = await handleMessage(defaultInput);

    expect(result.phaseAction).toBe("stay");
    expect(mockAdvancePhase).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/conversation-engine.test.ts`
Expected: FAIL — `conversation-engine` module not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/ai/conversation-engine.ts`:

```typescript
import { getCurrentPhase, advancePhase, incrementMessageCount } from "@/lib/ai/phase-machine";
import { retrieveKnowledge } from "@/lib/ai/retriever";
import { buildSystemPrompt } from "@/lib/ai/prompt-builder";
import { generateResponse } from "@/lib/ai/llm-client";
import { parseDecision } from "@/lib/ai/decision-parser";
import { createServiceClient } from "@/lib/supabase/service";

const HEDGING_PHRASES = [
  "I believe",
  "If I'm not mistaken,",
  "From what I understand,",
  "I think",
  "As far as I know,",
];

export interface EngineInput {
  tenantId: string;
  businessName: string;
  conversationId: string;
  leadMessage: string;
}

export interface EngineOutput {
  message: string;
  phaseAction: "stay" | "advance" | "escalate";
  confidence: number;
  imageIds: string[];
  currentPhase: string;
  escalated: boolean;
}

function applyHedging(message: string, confidence: number): string {
  if (confidence >= 0.7 || confidence < 0.4) return message;
  const phrase = HEDGING_PHRASES[Math.floor(Math.random() * HEDGING_PHRASES.length)];
  // Lowercase the first letter of the original message when prepending
  const lowerFirst = message.charAt(0).toLowerCase() + message.slice(1);
  return `${phrase} ${lowerFirst}`;
}

export async function handleMessage(input: EngineInput): Promise<EngineOutput> {
  const { tenantId, businessName, conversationId, leadMessage } = input;

  // 1. Get/initialize current phase
  const currentPhase = await getCurrentPhase(conversationId, tenantId);

  // 2. Retrieve relevant knowledge
  const retrieval = await retrieveKnowledge({ query: leadMessage, tenantId });

  // 3. Build system prompt
  const systemPrompt = await buildSystemPrompt({
    tenantId,
    businessName,
    currentPhase,
    conversationId,
    ragChunks: retrieval.chunks,
  });

  // 4. Call LLM
  const llmResponse = await generateResponse(systemPrompt, leadMessage);

  // 5. Parse decision
  const decision = parseDecision(llmResponse.content);

  // 6. Apply side effects
  let escalated = false;

  if (decision.phaseAction === "advance") {
    await advancePhase(conversationId, tenantId);
  } else if (decision.phaseAction === "escalate") {
    escalated = true;
    const supabase = createServiceClient();
    await supabase
      .from("conversations")
      .update({ needs_human: true })
      .eq("id", conversationId);
  }

  // 7. Increment message count
  await incrementMessageCount(currentPhase.conversationPhaseId);

  // 8. Apply confidence hedging
  const message = applyHedging(decision.message, decision.confidence);

  // 9. Return response
  return {
    message,
    phaseAction: decision.phaseAction,
    confidence: decision.confidence,
    imageIds: decision.imageIds,
    currentPhase: currentPhase.name,
    escalated,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/conversation-engine.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/conversation-engine.ts tests/unit/conversation-engine.test.ts
git commit -m "feat: add conversation engine orchestrator with hedging and escalation"
```

---

## Task 8: Integration Tests

**Files:**
- Create: `tests/integration/conversation-engine.test.ts`

- [ ] **Step 1: Write integration tests**

Create `tests/integration/conversation-engine.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleMessage } from "@/lib/ai/conversation-engine";

// Mock fetch for HuggingFace APIs (embedding + text generation)
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock Supabase
const mockRpc = vi.fn();
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    rpc: mockRpc,
    from: mockFrom,
  })),
}));

const API_DIM = 4096;
const fakeEmbedding = Array.from({ length: API_DIM }, (_, i) => Math.sin(i) * 0.01);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("HUGGINGFACE_API_KEY", "test-key");
});

function setupConversationPhase(phase: {
  id: string;
  phase_id: string;
  message_count: number;
  bot_flow_phases: Record<string, unknown>;
}) {
  // conversation_phases select (getCurrentPhase)
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: phase, error: null }),
          }),
        }),
      }),
    }),
  };
}

function setupBotRules(rules: { rule_text: string; category: string }[]) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: rules, error: null }),
      }),
    }),
  };
}

function setupMessages(messages: { direction: string; text: string }[]) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: messages, error: null }),
        }),
      }),
    }),
  };
}

function setupUpdate() {
  return {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  };
}

describe("Conversation Engine Integration", () => {
  it("processes a message through the full pipeline: phase → RAG → LLM → response", async () => {
    const phase = {
      id: "cp-1",
      phase_id: "phase-1",
      message_count: 0,
      bot_flow_phases: {
        id: "phase-1",
        name: "Greet",
        order_index: 0,
        max_messages: 1,
        system_prompt: "Welcome the lead.",
        tone: "friendly",
        goals: "Open conversation",
        transition_hint: "Advance when lead responds",
        action_button_ids: null,
      },
    };

    // Setup mockFrom calls in order:
    // 1. conversation_phases (getCurrentPhase)
    // 2. bot_rules (buildSystemPrompt)
    // 3. messages (buildSystemPrompt)
    // 4. conversation_phases (incrementMessageCount - select)
    // 5. conversation_phases (incrementMessageCount - update)
    mockFrom
      .mockReturnValueOnce(setupConversationPhase(phase))
      .mockReturnValueOnce(setupBotRules([]))
      .mockReturnValueOnce(setupMessages([]))
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { message_count: 0 }, error: null }),
          }),
        }),
      })
      .mockReturnValueOnce(setupUpdate());

    // Embedding API call (for RAG retrieval)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeEmbedding],
    });

    // Vector search returns results
    mockRpc.mockReturnValueOnce({
      data: [
        { id: "c1", content: "Welcome to Acme Corp!", similarity: 0.85, metadata: {} },
      ],
      error: null,
    });

    // LLM text generation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                message: "Hey! Welcome to Acme Corp. How can I help you today?",
                phase_action: "stay",
                confidence: 0.92,
                image_ids: [],
              }),
            },
            finish_reason: "stop",
          },
        ],
      }),
    });

    const result = await handleMessage({
      tenantId: "tenant-1",
      businessName: "Acme Corp",
      conversationId: "conv-1",
      leadMessage: "Hi!",
    });

    expect(result.message).toBe("Hey! Welcome to Acme Corp. How can I help you today?");
    expect(result.phaseAction).toBe("stay");
    expect(result.confidence).toBe(0.92);
    expect(result.currentPhase).toBe("Greet");
    expect(result.escalated).toBe(false);
  });

  it("advances phase when LLM returns advance action", async () => {
    const phase = {
      id: "cp-1",
      phase_id: "phase-1",
      message_count: 1,
      bot_flow_phases: {
        id: "phase-1",
        name: "Greet",
        order_index: 0,
        max_messages: 1,
        system_prompt: "Welcome the lead.",
        tone: "friendly",
        goals: "Open conversation",
        transition_hint: "Advance when lead responds",
        action_button_ids: null,
      },
    };

    const nextPhase = {
      id: "phase-2",
      name: "Nurture",
      order_index: 1,
      max_messages: 3,
      system_prompt: "Build rapport.",
      tone: "conversational",
      goals: "Build trust",
      transition_hint: "Advance when trust is established",
      action_button_ids: null,
    };

    // getCurrentPhase (in handleMessage)
    mockFrom.mockReturnValueOnce(setupConversationPhase(phase));
    // bot_rules
    mockFrom.mockReturnValueOnce(setupBotRules([]));
    // messages
    mockFrom.mockReturnValueOnce(setupMessages([{ direction: "in", text: "Hi!" }]));
    // advancePhase: getCurrentPhase again
    mockFrom.mockReturnValueOnce(setupConversationPhase(phase));
    // advancePhase: get next phase
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gt: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: nextPhase, error: null }),
              }),
            }),
          }),
        }),
      }),
    });
    // advancePhase: insert new conversation_phase
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: "cp-2", phase_id: "phase-2", message_count: 0 },
            error: null,
          }),
        }),
      }),
    });
    // incrementMessageCount
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { message_count: 1 }, error: null }),
        }),
      }),
    });
    mockFrom.mockReturnValueOnce(setupUpdate());

    // Embedding
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeEmbedding],
    });

    // Vector search
    mockRpc.mockReturnValueOnce({
      data: [],
      error: null,
    });

    // Reformulate retry embedding
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeEmbedding],
    });

    // Reformulate retry search
    mockRpc.mockReturnValueOnce({
      data: [],
      error: null,
    });

    // LLM
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                message: "Great to meet you! Tell me more about what you need.",
                phase_action: "advance",
                confidence: 0.88,
                image_ids: [],
              }),
            },
            finish_reason: "stop",
          },
        ],
      }),
    });

    const result = await handleMessage({
      tenantId: "tenant-1",
      businessName: "Acme Corp",
      conversationId: "conv-1",
      leadMessage: "I need help with my project",
    });

    expect(result.phaseAction).toBe("advance");
    expect(result.currentPhase).toBe("Greet");
  });

  it("escalates to human on low confidence", async () => {
    const phase = {
      id: "cp-1",
      phase_id: "phase-1",
      message_count: 2,
      bot_flow_phases: {
        id: "phase-1",
        name: "Qualify",
        order_index: 2,
        max_messages: 3,
        system_prompt: "Qualify the lead.",
        tone: "professional",
        goals: "Understand requirements",
        transition_hint: "Advance when qualified",
        action_button_ids: null,
      },
    };

    // getCurrentPhase
    mockFrom.mockReturnValueOnce(setupConversationPhase(phase));
    // bot_rules
    mockFrom.mockReturnValueOnce(setupBotRules([]));
    // messages
    mockFrom.mockReturnValueOnce(setupMessages([]));
    // escalation: conversations update
    mockFrom.mockReturnValueOnce(setupUpdate());
    // incrementMessageCount
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { message_count: 2 }, error: null }),
        }),
      }),
    });
    mockFrom.mockReturnValueOnce(setupUpdate());

    // Embedding
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeEmbedding],
    });

    // Vector search — empty
    mockRpc.mockReturnValueOnce({ data: [], error: null });

    // Reformulate retry
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeEmbedding],
    });
    mockRpc.mockReturnValueOnce({ data: [], error: null });

    // LLM returns low confidence
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                message: "Let me check with my team and get back to you on that.",
                phase_action: "escalate",
                confidence: 0.25,
                image_ids: [],
              }),
            },
            finish_reason: "stop",
          },
        ],
      }),
    });

    const result = await handleMessage({
      tenantId: "tenant-1",
      businessName: "Acme Corp",
      conversationId: "conv-1",
      leadMessage: "Can you integrate with SAP ERP?",
    });

    expect(result.escalated).toBe(true);
    expect(result.phaseAction).toBe("escalate");
    expect(result.message).toBe("Let me check with my team and get back to you on that.");
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `npx vitest run tests/integration/conversation-engine.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 3: Run all tests to verify nothing is broken**

Run: `npx vitest run`
Expected: All existing + new tests PASS

- [ ] **Step 4: Commit**

```bash
git add tests/integration/conversation-engine.test.ts
git commit -m "test: add integration tests for conversation engine pipeline"
```

---

## Task 9: Update AI_PLAN.md

**Files:**
- Modify: `AI_PLAN.md`

- [ ] **Step 1: Check off all Phase 4 items**

In `AI_PLAN.md`, update all Phase 4 checkboxes from `- [ ]` to `- [x]`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add AI_PLAN.md
git commit -m "docs: mark Phase 4 complete in AI_PLAN.md"
```

---

## Task 10: Run `test-feature` Skill

After all tasks are implemented and passing, run the `test-feature` skill to verify comprehensive test coverage and scaffold any missing tests.

- [ ] **Step 1: Invoke the `test-feature` skill**

Run the `test-feature` skill targeting the Phase 4 modules:
- `src/lib/ai/phase-templates.ts`
- `src/lib/ai/phase-machine.ts`
- `src/lib/ai/prompt-builder.ts`
- `src/lib/ai/llm-client.ts`
- `src/lib/ai/decision-parser.ts`
- `src/lib/ai/conversation-engine.ts`

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Commit any additional tests**

```bash
git add tests/
git commit -m "test: add additional test coverage from test-feature skill"
```
