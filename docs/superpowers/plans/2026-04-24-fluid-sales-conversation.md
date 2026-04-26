# Fluid Sales Conversation Prompt & Offer-Aware RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live Messenger bot aware of the active campaign/offer and able to handle vague buying signals like "interested" without asking generic context-free questions.

**Architecture:** Keep the existing phase machine and RAG pipeline, but make phase guidance advisory in the prompt and enrich retrieval queries with campaign/offer context when the lead message is vague. Production `conversation-engine.ts` should match test chat by passing campaign context into `buildSystemPrompt`.

**Tech Stack:** Next.js 16, TypeScript, Supabase, Vitest, existing LLM/RAG modules under `src/lib/ai`.

---

## File Structure

- Modify `src/lib/ai/prompt-builder.ts`
  - Add a sales strategy prompt layer based on CLOSER-style reasoning without persona imitation.
  - Reframe phase context as advisory, not rigid.
  - Add vague high-intent handling rules.
  - Keep response format and anti-hallucination behavior unchanged.

- Modify `src/lib/ai/conversation-engine.ts`
  - Fetch the assigned campaign's `name`, `description`, and `goal`.
  - Pass campaign context into `buildSystemPrompt`.
  - Pass campaign, phase, and business context into `retrieveKnowledge`.

- Modify `src/lib/ai/retriever.ts`
  - Extend `RetrievalParams` with optional context fields.
  - Build an enriched retrieval query for vague high-intent messages.
  - Keep the final LLM user message unchanged.

- Modify `src/lib/ai/query-router.ts`
  - Recognize vague buying signals such as `interested`, `details`, `pa info`, `hm`, and `available`.
  - Route those to `both` unless stronger product/general terms dominate.

- Modify tests:
  - `tests/unit/prompt-builder.test.ts`
  - `tests/unit/conversation-engine.test.ts`
  - `tests/unit/retriever.test.ts`
  - `tests/unit/query-router.test.ts`

---

### Task 1: Prompt Builder Sales Strategy And Soft Phases

**Files:**
- Modify: `src/lib/ai/prompt-builder.ts`
- Test: `tests/unit/prompt-builder.test.ts`

- [ ] **Step 1: Write failing prompt-builder tests**

Add these tests inside `describe("buildSystemPrompt", () => { ... })`:

```ts
it("includes sales strategy guidance without impersonating a sales figure", async () => {
  setupMocks();

  const prompt = await buildSystemPrompt(makeContext());

  expect(prompt).toContain("SALES CONVERSATION STRATEGY");
  expect(prompt).toContain("Use this as hidden reasoning, not as a script");
  expect(prompt).toContain("Clarify:");
  expect(prompt).toContain("Sell outcome:");
  expect(prompt).toContain("Do not force every step");
  expect(prompt.toLowerCase()).not.toContain("act like alex");
});

it("frames current phase as advisory guidance instead of a rigid script", async () => {
  setupMocks();

  const prompt = await buildSystemPrompt(makeContext());

  expect(prompt).toContain("The phase is guidance, not a rule");
  expect(prompt).toContain("respond to the lead's intent first");
  expect(prompt).toContain("You may advance when the conversation naturally moves forward");
});

it("instructs vague high-intent messages to default to the current offer", async () => {
  setupMocks();

  const prompt = await buildSystemPrompt(
    makeContext({
      campaign: {
        name: "Spring Enrollment",
        description: "A coaching program for small businesses that want more qualified leads.",
        goal: "form_submit",
      },
    })
  );

  expect(prompt).toContain('If the lead says "interested"');
  expect(prompt).toContain("Assume they mean the current offer if one is available");
  expect(prompt).toContain('Do not ask "interested in what?"');
  expect(prompt).toContain("Spring Enrollment");
  expect(prompt).toContain("A coaching program for small businesses");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/unit/prompt-builder.test.ts
```

Expected result:

```text
FAIL tests/unit/prompt-builder.test.ts
Expected substring: "SALES CONVERSATION STRATEGY"
```

- [ ] **Step 3: Implement prompt layers**

In `src/lib/ai/prompt-builder.ts`, add:

```ts
function buildSalesStrategy(): string {
  return [
    "--- SALES CONVERSATION STRATEGY ---",
    "Use this as hidden reasoning, not as a script.",
    "- Clarify: understand why they reached out and what outcome they want.",
    "- Label: briefly reflect the problem or desire in their words.",
    "- Overview: if useful, ask what they tried, considered, or need to compare.",
    "- Sell outcome: connect the offer to the result they care about, not just features.",
    "- Explain concerns: answer price, trust, fit, timing, and decision-maker concerns directly.",
    "- Reinforce: after they choose a next step, make them feel clear about what happens next.",
    "",
    "Do not force every step. Pick the next useful move for this exact message.",
  ].join("\n");
}

function buildVagueIntentRules(): string {
  return [
    "--- VAGUE BUYING SIGNALS ---",
    'If the lead says "interested", "details", "how much", "available?", "pa info", "hm", or similar:',
    "- Assume they mean the current offer if one is available.",
    "- Reply with a short contextual bridge showing you know the offer.",
    "- Ask only one next question, or give the next action if the path is clear.",
    '- Do not ask "interested in what?" unless there are multiple unrelated offers and no campaign context.',
  ].join("\n");
}
```

Update `buildPhaseContext` so it includes the soft-phase rule after the phase details:

```ts
  lines.push(
    "",
    "The phase is guidance, not a rule. If the lead's intent clearly belongs to another step, respond to the lead's intent first. You may advance when the conversation naturally moves forward."
  );
```

Update `buildSystemPrompt` layer order:

```ts
  const layer3 = buildOfferingContext(businessType, botGoal, ctx.campaign);
  const layer4 = buildSalesStrategy();
  const layer5 = buildVagueIntentRules();
  const layer6 = buildPhaseContext(ctx.currentPhase, ctx.testMode ?? false);
  const layer7 = buildConversationHistory(messages);
  const layer8 = buildRetrievedKnowledge(ctx.ragChunks);
  const layer9 = buildAvailableImages(ctx.images);
  const layer10 = buildDecisionInstructions();

  return [layer1, layer2, layer3, layer4, layer5, layer6, layer7, layer8, layer9, layer10]
    .filter((l) => l.length > 0)
    .join("\n\n");
```

- [ ] **Step 4: Run prompt-builder tests to verify green**

Run:

```bash
npm test -- tests/unit/prompt-builder.test.ts
```

Expected result:

```text
PASS tests/unit/prompt-builder.test.ts
```

- [ ] **Step 5: Commit**

Run:

```bash
git add src/lib/ai/prompt-builder.ts tests/unit/prompt-builder.test.ts
git commit -m "feat: add fluid sales prompt strategy"
```

---

### Task 2: Production Campaign Context Handoff

**Files:**
- Modify: `src/lib/ai/conversation-engine.ts`
- Test: `tests/unit/conversation-engine.test.ts`

- [ ] **Step 1: Write failing production handoff test**

Update the Supabase mock in `tests/unit/conversation-engine.test.ts` so the `campaigns` table returns campaign data:

```ts
      if (table === "campaigns") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  name: "Primary Offer",
                  description: "A lead generation service for local businesses.",
                  goal: "form_submit",
                },
                error: null,
              }),
            }),
          }),
        };
      }
```

Add this test:

```ts
it("passes assigned campaign context into retrieval and prompt building", async () => {
  await handleMessage({
    ...defaultInput,
    leadMessage: "Interested",
  });

  expect(mockRetrieveKnowledge).toHaveBeenCalledWith(
    expect.objectContaining({
      query: "Interested",
      tenantId: "tenant-1",
      context: expect.objectContaining({
        businessName: "Acme Corp",
        currentPhaseName: "Greet",
        campaign: {
          name: "Primary Offer",
          description: "A lead generation service for local businesses.",
          goal: "form_submit",
        },
      }),
    })
  );

  expect(mockBuildSystemPrompt).toHaveBeenCalledWith(
    expect.objectContaining({
      campaign: {
        name: "Primary Offer",
        description: "A lead generation service for local businesses.",
        goal: "form_submit",
      },
    })
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/conversation-engine.test.ts
```

Expected result:

```text
FAIL tests/unit/conversation-engine.test.ts
Expected mockRetrieveKnowledge to be called with context
```

- [ ] **Step 3: Implement campaign fetch and handoff**

In `src/lib/ai/conversation-engine.ts`, after loading `currentPhase`, fetch campaign context before retrieval:

```ts
  const { data: campaignData } = await supabase
    .from("campaigns")
    .select("name, description, goal")
    .eq("id", campaignId)
    .single();

  const campaignContext = campaignData
    ? {
        name: campaignData.name,
        description: campaignData.description,
        goal: campaignData.goal,
      }
    : undefined;
```

Update retrieval:

```ts
  const retrieval = await retrieveKnowledge({
    query: leadMessage,
    tenantId,
    context: {
      businessName,
      currentPhaseName: currentPhase.name,
      campaign: campaignContext,
    },
  });
```

Update prompt building:

```ts
  const systemPrompt = await buildSystemPrompt({
    tenantId,
    businessName,
    currentPhase,
    conversationId,
    ragChunks: retrieval.chunks,
    images: promptImages.length > 0 ? promptImages : undefined,
    campaign: campaignContext,
  });
```

- [ ] **Step 4: Run conversation-engine tests to verify green**

Run:

```bash
npm test -- tests/unit/conversation-engine.test.ts
```

Expected result:

```text
PASS tests/unit/conversation-engine.test.ts
```

- [ ] **Step 5: Commit**

Run:

```bash
git add src/lib/ai/conversation-engine.ts tests/unit/conversation-engine.test.ts
git commit -m "feat: pass campaign context to live bot"
```

---

### Task 3: Context-Aware Retrieval For Vague Buying Signals

**Files:**
- Modify: `src/lib/ai/retriever.ts`
- Test: `tests/unit/retriever.test.ts`

- [ ] **Step 1: Write failing retriever test**

Add this test to `tests/unit/retriever.test.ts`:

```ts
it("enriches vague high-intent queries with campaign and phase context before search", async () => {
  mockClassify.mockReturnValue("both");
  mockSearch
    .mockResolvedValueOnce([chunk("g1", 0.8)])
    .mockResolvedValueOnce([chunk("p1", 0.9)]);
  mockRerank.mockResolvedValue([chunk("p1", 0.92), chunk("g1", 0.78)]);

  await retrieveKnowledge({
    query: "Interested",
    tenantId,
    context: {
      businessName: "Acme Corp",
      currentPhaseName: "Greet",
      campaign: {
        name: "Primary Offer",
        description: "A lead generation service for local businesses.",
        goal: "form_submit",
      },
    },
  });

  expect(mockEmbed).toHaveBeenCalledWith(
    expect.stringContaining("Lead message: Interested")
  );
  expect(mockEmbed).toHaveBeenCalledWith(
    expect.stringContaining("Campaign: Primary Offer")
  );
  expect(mockEmbed).toHaveBeenCalledWith(
    expect.stringContaining("Offer: A lead generation service for local businesses.")
  );

  expect(mockSearch).toHaveBeenCalledWith(
    expect.objectContaining({
      ftsQuery: expect.stringContaining("Primary Offer"),
    })
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/retriever.test.ts
```

Expected result:

```text
FAIL tests/unit/retriever.test.ts
Expected mockEmbed to be called with string containing "Campaign: Primary Offer"
```

- [ ] **Step 3: Implement retrieval context enrichment**

In `src/lib/ai/retriever.ts`, update types:

```ts
export interface RetrievalCampaignContext {
  name: string;
  description: string | null;
  goal: string;
}

export interface RetrievalContext {
  businessName?: string;
  businessType?: string;
  currentPhaseName?: string;
  recentMessages?: string[];
  campaign?: RetrievalCampaignContext;
}

export interface RetrievalParams {
  query: string;
  tenantId: string;
  context?: RetrievalContext;
}
```

Add helpers:

```ts
const VAGUE_HIGH_INTENT_PATTERNS = [
  /\binterested\b/i,
  /\bdetails?\b/i,
  /\bpa\s*info\b/i,
  /\bhm\b/i,
  /\bhow much\b/i,
  /\bavailable\b/i,
  /\bavail\b/i,
];

function isVagueHighIntentQuery(query: string): boolean {
  const normalized = query.trim();
  if (!normalized) return false;
  if (normalized.length > 80) return false;
  return VAGUE_HIGH_INTENT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function buildSearchQuery(query: string, context?: RetrievalContext): string {
  if (!context || !isVagueHighIntentQuery(query)) return query;

  const lines = [`Lead message: ${query}`];

  if (context.campaign?.name) lines.push(`Campaign: ${context.campaign.name}`);
  if (context.campaign?.description) lines.push(`Offer: ${context.campaign.description}`);
  if (context.campaign?.goal) lines.push(`Campaign goal: ${context.campaign.goal}`);
  if (context.currentPhaseName) lines.push(`Phase: ${context.currentPhaseName}`);
  if (context.businessName) lines.push(`Business: ${context.businessName}`);
  if (context.businessType) lines.push(`Business type: ${context.businessType}`);
  if (context.recentMessages?.length) {
    lines.push(`Recent context: ${context.recentMessages.slice(-4).join(" | ")}`);
  }

  return lines.join("\n");
}
```

Use the enriched query for embedding, full-text search, and expansion input, while keeping reranking tied to the real lead query:

```ts
  const { query, tenantId, context } = params;
  const queryTarget = classifyQuery(query);
  const searchQuery = buildSearchQuery(query, context);

  const queryEmbedding = await embedText(searchQuery);
  const pass1Chunks = await searchTargets(queryEmbedding, searchQuery, tenantId, queryTarget);
  const pass1Reranked = await rerankChunks(query, pass1Chunks);
```

Update Pass 2:

```ts
  const expanded = await expandQuery(searchQuery);
```

- [ ] **Step 4: Run retriever tests to verify green**

Run:

```bash
npm test -- tests/unit/retriever.test.ts
```

Expected result:

```text
PASS tests/unit/retriever.test.ts
```

- [ ] **Step 5: Commit**

Run:

```bash
git add src/lib/ai/retriever.ts tests/unit/retriever.test.ts
git commit -m "feat: enrich retrieval for vague buyer intent"
```

---

### Task 4: Query Router Vague Buying Signals

**Files:**
- Modify: `src/lib/ai/query-router.ts`
- Test: `tests/unit/query-router.test.ts`

- [ ] **Step 1: Write failing query-router tests**

Add:

```ts
it("routes vague high-intent buying signals to both knowledge stores", () => {
  expect(classifyQuery("Interested")).toBe("both");
  expect(classifyQuery("Pa info")).toBe("both");
  expect(classifyQuery("Send details")).toBe("both");
  expect(classifyQuery("HM?")).toBe("both");
});

it("keeps availability and price questions product-oriented when product terms are clear", () => {
  expect(classifyQuery("Available pa yung blue widget?")).toBe("product");
  expect(classifyQuery("How much is the blue widget?")).toBe("product");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/unit/query-router.test.ts
```

Expected result:

```text
FAIL tests/unit/query-router.test.ts
Expected "general" or "product" to be "both" for vague buying signals
```

- [ ] **Step 3: Implement router keywords**

In `src/lib/ai/query-router.ts`, add:

```ts
const VAGUE_BUYING_KEYWORDS = [
  "interested",
  "details",
  "detail",
  "pa info",
  "info",
  "hm",
];
```

Add a score:

```ts
  const vagueBuyingScore = VAGUE_BUYING_KEYWORDS.filter((kw) => lower.includes(kw)).length;
```

Before the final `return "both";`, add:

```ts
  if (vagueBuyingScore > 0 && productScore === 0 && generalScore === 0) return "both";
```

Keep existing product routing for `available`, `how much`, `price`, and concrete product terms.

- [ ] **Step 4: Run query-router tests to verify green**

Run:

```bash
npm test -- tests/unit/query-router.test.ts
```

Expected result:

```text
PASS tests/unit/query-router.test.ts
```

- [ ] **Step 5: Commit**

Run:

```bash
git add src/lib/ai/query-router.ts tests/unit/query-router.test.ts
git commit -m "feat: route vague buyer signals to rag"
```

---

### Task 5: Focused Verification

**Files:**
- Verify all files touched by Tasks 1-4.

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
npm test -- tests/unit/prompt-builder.test.ts tests/unit/conversation-engine.test.ts tests/unit/retriever.test.ts tests/unit/query-router.test.ts
```

Expected result:

```text
PASS tests/unit/prompt-builder.test.ts
PASS tests/unit/conversation-engine.test.ts
PASS tests/unit/retriever.test.ts
PASS tests/unit/query-router.test.ts
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected result:

```text
tsc --noEmit
```

with exit code `0`.

- [ ] **Step 3: Inspect final diff**

Run:

```bash
git diff -- src/lib/ai/prompt-builder.ts src/lib/ai/conversation-engine.ts src/lib/ai/retriever.ts src/lib/ai/query-router.ts tests/unit/prompt-builder.test.ts tests/unit/conversation-engine.test.ts tests/unit/retriever.test.ts tests/unit/query-router.test.ts
```

Expected result:

```text
Diff only contains prompt strategy, campaign context handoff, retrieval query enrichment, router keywords, and matching tests.
```

- [ ] **Step 4: Commit verification fixes if any were needed**

If Step 1 or Step 2 required fixes, commit only those files:

```bash
git add src/lib/ai tests/unit
git commit -m "fix: stabilize fluid sales conversation tests"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review

Spec coverage:
- Soft/advisory phases are covered in Task 1.
- Active offer awareness in production is covered in Task 2.
- Vague buying signal handling is covered in Tasks 1, 3, and 4.
- Context-aware retrieval is covered in Task 3.
- No new database schema or CRM-style lead scoring is introduced.

Placeholder scan:
- No `TBD`, `TODO`, or unresolved placeholders are used.
- Bracketed examples from the design spec are not part of this implementation plan.

Type consistency:
- `campaign` shape uses `{ name: string; description: string | null; goal: string }` consistently in prompt, retrieval, and conversation engine context.
- `retrieveKnowledge` keeps the real `query` field and adds optional `context`, so existing callers remain valid.
