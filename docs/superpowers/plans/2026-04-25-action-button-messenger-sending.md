# Action Button Messenger Sending — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up action buttons attached to campaign phases so the AI can send them as Facebook Messenger button templates with signed PSID URLs during conversations.

**Architecture:** Extend the existing decision format with optional `action_button_id` and `cta_text` fields. The prompt builder injects available buttons into the system prompt. The webhook handler resolves the action page, builds a signed URL, and sends a `ButtonMessage` after the text reply.

**Tech Stack:** Supabase (migration), Next.js API routes, Facebook Graph API (button template), Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/XXXX_action_page_cta.sql` | Create | Add `cta_text` column to `action_pages` |
| `src/types/database.ts` | Modify | Add `cta_text` to `action_pages` type |
| `src/lib/ai/decision-parser.ts` | Modify | Parse `action_button_id` and `cta_text` from LLM output |
| `tests/unit/decision-parser.test.ts` | Modify | Tests for new fields |
| `src/lib/ai/prompt-builder.ts` | Modify | Inject available action buttons into system prompt |
| `tests/unit/prompt-builder.test.ts` | Modify | Tests for action button prompt section |
| `src/lib/ai/conversation-engine.ts` | Modify | Add `actionButton` to `EngineOutput`, validate and resolve CTA |
| `tests/unit/conversation-engine.test.ts` | Modify | Tests for action button in engine output |
| `src/lib/fb/action-url.ts` | Create | Build signed action page URLs |
| `tests/unit/action-url.test.ts` | Create | Tests for URL builder |
| `src/app/api/fb/webhook/route.ts` | Modify | Send `ButtonMessage` when engine returns an action button |

---

### Task 1: Database Migration — Add `cta_text` to `action_pages`

**Files:**
- Create: `supabase/migrations/XXXX_action_page_cta.sql`
- Modify: `src/types/database.ts:172-182`

- [ ] **Step 1: Create the migration file**

First, check the latest migration number:

```bash
ls supabase/migrations/ | tail -1
```

Create the next migration:

```sql
-- supabase/migrations/XXXX_action_page_cta.sql
ALTER TABLE action_pages ADD COLUMN cta_text TEXT;

COMMENT ON COLUMN action_pages.cta_text IS 'Default call-to-action text shown above the Messenger button';
```

- [ ] **Step 2: Update the TypeScript type**

In `src/types/database.ts`, add `cta_text` to the `action_pages` type. Find:

```typescript
      action_pages: TableRow<{
        id: string;
        tenant_id: string;
        slug: string;
        type: "form" | "calendar" | "sales" | "product_catalog" | "checkout";
        title: string;
        config: Json;
        published: boolean;
        version: number;
        created_at: string;
      }>;
```

Add `cta_text: string | null;` after `title`:

```typescript
      action_pages: TableRow<{
        id: string;
        tenant_id: string;
        slug: string;
        type: "form" | "calendar" | "sales" | "product_catalog" | "checkout";
        title: string;
        cta_text: string | null;
        config: Json;
        published: boolean;
        version: number;
        created_at: string;
      }>;
```

- [ ] **Step 3: Apply the migration**

```bash
npx supabase db push
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/XXXX_action_page_cta.sql src/types/database.ts
git commit -m "feat: add cta_text column to action_pages table"
```

---

### Task 2: Decision Parser — Parse `action_button_id` and `cta_text`

**Files:**
- Modify: `src/lib/ai/decision-parser.ts`
- Modify: `tests/unit/decision-parser.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these tests to `tests/unit/decision-parser.test.ts`:

```typescript
it("parses action_button_id when present", () => {
  const raw = JSON.stringify({
    message: "Check this out!",
    phase_action: "stay",
    confidence: 0.9,
    image_ids: [],
    action_button_id: "ap-123",
    cta_text: "Book your free consultation!",
  });

  const result = parseDecision(raw);
  expect(result.actionButtonId).toBe("ap-123");
  expect(result.ctaText).toBe("Book your free consultation!");
});

it("returns null actionButtonId when not present", () => {
  const raw = JSON.stringify({
    message: "Hey there!",
    phase_action: "stay",
    confidence: 0.85,
    image_ids: [],
  });

  const result = parseDecision(raw);
  expect(result.actionButtonId).toBeNull();
  expect(result.ctaText).toBeNull();
});

it("returns null actionButtonId when value is not a string", () => {
  const raw = JSON.stringify({
    message: "Hey",
    phase_action: "stay",
    confidence: 0.8,
    image_ids: [],
    action_button_id: 42,
  });

  const result = parseDecision(raw);
  expect(result.actionButtonId).toBeNull();
});

it("returns null ctaText when action_button_id is absent even if cta_text is present", () => {
  const raw = JSON.stringify({
    message: "Hey",
    phase_action: "stay",
    confidence: 0.8,
    image_ids: [],
    cta_text: "Click me!",
  });

  const result = parseDecision(raw);
  expect(result.actionButtonId).toBeNull();
  expect(result.ctaText).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/decision-parser.test.ts
```

Expected: FAIL — `actionButtonId` and `ctaText` properties don't exist on `LLMDecision`.

- [ ] **Step 3: Implement the changes**

In `src/lib/ai/decision-parser.ts`, update the interface:

```typescript
export interface LLMDecision {
  message: string;
  phaseAction: "stay" | "advance" | "escalate";
  confidence: number;
  imageIds: string[];
  actionButtonId: string | null;
  ctaText: string | null;
}
```

In the `parseDecision` function, add parsing after the `imageIds` line:

```typescript
  const actionButtonId =
    typeof obj.action_button_id === "string" && obj.action_button_id.length > 0
      ? obj.action_button_id
      : null;

  const ctaText =
    actionButtonId !== null && typeof obj.cta_text === "string" && obj.cta_text.length > 0
      ? obj.cta_text
      : null;

  return { message, phaseAction, confidence, imageIds, actionButtonId, ctaText };
```

Also update the fallback return at the top of the function:

```typescript
  if (!parsed || typeof parsed !== "object") {
    return {
      message: "",
      phaseAction: "escalate",
      confidence: 0.5,
      imageIds: [],
      actionButtonId: null,
      ctaText: null,
    };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/unit/decision-parser.test.ts
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/decision-parser.ts tests/unit/decision-parser.test.ts
git commit -m "feat: parse action_button_id and cta_text from LLM decision"
```

---

### Task 3: Action URL Builder — Build Signed Action Page URLs

**Files:**
- Create: `src/lib/fb/action-url.ts`
- Create: `tests/unit/action-url.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/action-url.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildActionPageUrl } from "@/lib/fb/action-url";

describe("buildActionPageUrl", () => {
  it("builds a signed URL with psid and sig parameters", () => {
    const url = buildActionPageUrl({
      tenantSlug: "acme",
      actionPageSlug: "free-consultation",
      psid: "123456",
      appSecret: "test-secret",
      appDomain: "whatstage.com",
      protocol: "https",
    });

    expect(url).toContain("https://acme.whatstage.com/a/free-consultation");
    expect(url).toContain("psid=123456");
    expect(url).toContain("sig=");
  });

  it("uses http for local development domains", () => {
    const url = buildActionPageUrl({
      tenantSlug: "acme",
      actionPageSlug: "booking",
      psid: "789",
      appSecret: "secret",
      appDomain: "lvh.me:3000",
      protocol: "http",
    });

    expect(url).toStartWith("http://acme.lvh.me:3000/a/booking");
  });

  it("produces consistent signatures for the same psid and secret", () => {
    const params = {
      tenantSlug: "acme",
      actionPageSlug: "form",
      psid: "same-psid",
      appSecret: "same-secret",
      appDomain: "whatstage.com",
      protocol: "https" as const,
    };

    const url1 = buildActionPageUrl(params);
    const url2 = buildActionPageUrl(params);

    expect(url1).toBe(url2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/action-url.test.ts
```

Expected: FAIL — module `@/lib/fb/action-url` not found.

- [ ] **Step 3: Implement the URL builder**

Create `src/lib/fb/action-url.ts`:

```typescript
import { signPsid } from "@/lib/fb/signature";

export interface ActionPageUrlParams {
  tenantSlug: string;
  actionPageSlug: string;
  psid: string;
  appSecret: string;
  appDomain: string;
  protocol: "http" | "https";
}

export function buildActionPageUrl(params: ActionPageUrlParams): string {
  const { tenantSlug, actionPageSlug, psid, appSecret, appDomain, protocol } = params;
  const sig = signPsid(psid, appSecret);
  return `${protocol}://${tenantSlug}.${appDomain}/a/${actionPageSlug}?psid=${encodeURIComponent(psid)}&sig=${sig}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/unit/action-url.test.ts
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/fb/action-url.ts tests/unit/action-url.test.ts
git commit -m "feat: add action page URL builder with PSID signing"
```

---

### Task 4: Prompt Builder — Inject Available Action Buttons

**Files:**
- Modify: `src/lib/ai/prompt-builder.ts`
- Modify: `tests/unit/prompt-builder.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/prompt-builder.test.ts`. You'll need to extend the mock setup to handle the new `action_pages` query. Add after the existing tests:

```typescript
describe("action button prompt section", () => {
  it("includes available action buttons when phase has actionButtonIds", async () => {
    // Set up mocks for all existing queries plus action_pages
    setupMocks();

    // Add the action_pages mock response to mockFrom
    // When mockFrom is called with "action_pages", return button data
    const actionPagesChain = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [
              {
                id: "ap-1",
                title: "Free Consultation",
                type: "calendar",
                cta_text: "Book now!",
              },
            ],
            error: null,
          }),
        }),
      }),
    };

    // Override mockFrom to handle "action_pages"
    const originalImpl = mockFrom.getMockImplementation();
    mockFrom.mockImplementation((table: string) => {
      if (table === "action_pages") return actionPagesChain;
      if (originalImpl) return originalImpl(table);
      return originalImpl;
    });

    const phase: CurrentPhase = {
      conversationPhaseId: "cp-1",
      phaseId: "p-1",
      name: "Qualification",
      orderIndex: 0,
      maxMessages: 5,
      systemPrompt: "Qualify the lead",
      tone: "friendly",
      goals: "Understand their needs",
      transitionHint: null,
      actionButtonIds: ["ap-1"],
      messageCount: 2,
    };

    const ctx: PromptContext = {
      tenantId: "t-1",
      businessName: "Test Biz",
      currentPhase: phase,
      conversationId: "conv-1",
      ragChunks: [],
    };

    const prompt = await buildSystemPrompt(ctx);
    expect(prompt).toContain("ACTION BUTTONS AVAILABLE");
    expect(prompt).toContain("Free Consultation");
    expect(prompt).toContain("ap-1");
    expect(prompt).toContain("Book now!");
  });

  it("does not include action buttons section when phase has no actionButtonIds", async () => {
    setupMocks();

    const phase: CurrentPhase = {
      conversationPhaseId: "cp-1",
      phaseId: "p-1",
      name: "Qualification",
      orderIndex: 0,
      maxMessages: 5,
      systemPrompt: "Qualify the lead",
      tone: "friendly",
      goals: null,
      transitionHint: null,
      actionButtonIds: null,
      messageCount: 0,
    };

    const ctx: PromptContext = {
      tenantId: "t-1",
      businessName: "Test Biz",
      currentPhase: phase,
      conversationId: "conv-1",
      ragChunks: [],
    };

    const prompt = await buildSystemPrompt(ctx);
    expect(prompt).not.toContain("ACTION BUTTONS AVAILABLE");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/prompt-builder.test.ts
```

Expected: FAIL — prompt does not contain "ACTION BUTTONS AVAILABLE".

- [ ] **Step 3: Implement the action buttons prompt layer**

In `src/lib/ai/prompt-builder.ts`, add a new layer function after `buildAvailableImages`:

```typescript
// Layer 6.5 — action buttons
interface ActionButtonInfo {
  id: string;
  title: string;
  type: string;
  cta_text: string | null;
}

function buildAvailableActionButtons(buttons: ActionButtonInfo[]): string {
  const header = "--- ACTION BUTTONS AVAILABLE ---";
  if (buttons.length === 0) return "";

  const lines = [
    header,
    "You can send ONE action button when the lead is ready. Available buttons:",
  ];
  for (const btn of buttons) {
    const cta = btn.cta_text ?? "Check this out";
    lines.push(`- id: "${btn.id}" | title: "${btn.title}" | type: ${btn.type} | default_cta: "${cta}"`);
  }
  lines.push(
    "",
    'To send a button, include "action_button_id" in your JSON response with the button\'s id.',
    'Optionally include "cta_text" with a personalized call-to-action message. If omitted, the default is used.',
    "Only send a button when the timing feels natural — after building rapport or qualifying the lead. Do not send a button in every message."
  );
  return lines.join("\n");
}
```

Then in the `buildSystemPrompt` function, after the lead context fetch and before assembling layers, add the action button fetch:

```typescript
  // Fetch action button info if phase has action buttons
  let actionButtons: ActionButtonInfo[] = [];
  if (ctx.currentPhase.actionButtonIds && ctx.currentPhase.actionButtonIds.length > 0) {
    const { data: actionPages } = await supabase
      .from("action_pages")
      .select("id, title, type, cta_text")
      .eq("tenant_id", ctx.tenantId)
      .in("id", ctx.currentPhase.actionButtonIds);

    if (actionPages) {
      actionButtons = actionPages as ActionButtonInfo[];
    }
  }

  const actionButtonsLayer = buildAvailableActionButtons(actionButtons);
```

Update the `buildDecisionInstructions` function to include the new fields in the response format:

```typescript
function buildDecisionInstructions(): string {
  return `--- RESPONSE FORMAT ---
You MUST respond with a JSON object and nothing else. No text before or after the JSON.

{
  "message": "Your response to the lead (plain text, conversational)",
  "phase_action": "stay or advance or escalate",
  "confidence": 0.0 to 1.0,
  "image_ids": [],
  "cited_chunks": [1, 2],
  "action_button_id": "optional — id of the action button to send, or omit",
  "cta_text": "optional — personalized call-to-action text, or omit to use default"
}

- "phase_action": "stay" to remain, "advance" if lead is ready, "escalate" if you cannot help.
- "confidence": 1.0 = very confident, 0.0 = not confident. Set below 0.4 if unsure.
- "image_ids": Image IDs to send. Empty array if none.
- "cited_chunks": Indices of the knowledge chunks you used (e.g. [1, 2]).
- "action_button_id": Include ONLY when you want to send an action button. Omit otherwise.
- "cta_text": Custom call-to-action text for the button. Omit to use the default.`;
}
```

Add `actionButtonsLayer` to the final array in `buildSystemPrompt`, between `layer9` (images) and `layer10` (decision instructions):

```typescript
  return [layer1, layer2, campaignRulesLayer, layer3, layer4, layer5, layer6, layer7, layer8, leadLayer, layer9, actionButtonsLayer, layer10]
    .filter((l) => l.length > 0)
    .join("\n\n");
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/unit/prompt-builder.test.ts
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/prompt-builder.ts tests/unit/prompt-builder.test.ts
git commit -m "feat: inject available action buttons into AI system prompt"
```

---

### Task 5: Conversation Engine — Add `actionButton` to `EngineOutput`

**Files:**
- Modify: `src/lib/ai/conversation-engine.ts`
- Modify: `tests/unit/conversation-engine.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/conversation-engine.test.ts`. Look at the existing test file to understand the mocking pattern, then add:

```typescript
it("includes actionButton in output when decision has valid action_button_id", async () => {
  // Mock parseDecision to return an action_button_id
  vi.mocked(parseDecision).mockReturnValue({
    message: "Check this out!",
    phaseAction: "stay",
    confidence: 0.9,
    imageIds: [],
    actionButtonId: "ap-1",
    ctaText: "Book your spot now!",
  });

  // The phase must include ap-1 in its actionButtonIds
  // (mock getCurrentPhase to return a phase with actionButtonIds: ["ap-1"])
  // ... (follow existing mocking pattern in the test file)

  const result = await handleMessage({
    tenantId: "t-1",
    leadId: "l-1",
    businessName: "Biz",
    conversationId: "c-1",
    leadMessage: "Hi",
  });

  expect(result.actionButton).toEqual({
    actionPageId: "ap-1",
    ctaText: "Book your spot now!",
  });
});

it("returns no actionButton when decision has no action_button_id", async () => {
  vi.mocked(parseDecision).mockReturnValue({
    message: "Hello!",
    phaseAction: "stay",
    confidence: 0.85,
    imageIds: [],
    actionButtonId: null,
    ctaText: null,
  });

  const result = await handleMessage({
    tenantId: "t-1",
    leadId: "l-1",
    businessName: "Biz",
    conversationId: "c-1",
    leadMessage: "Hi",
  });

  expect(result.actionButton).toBeUndefined();
});

it("ignores action_button_id not in phase's actionButtonIds", async () => {
  vi.mocked(parseDecision).mockReturnValue({
    message: "Check this!",
    phaseAction: "stay",
    confidence: 0.9,
    imageIds: [],
    actionButtonId: "ap-invalid",
    ctaText: null,
  });

  // Phase only has ["ap-1"] in actionButtonIds

  const result = await handleMessage({
    tenantId: "t-1",
    leadId: "l-1",
    businessName: "Biz",
    conversationId: "c-1",
    leadMessage: "Hi",
  });

  expect(result.actionButton).toBeUndefined();
});
```

Note: Adapt the mocking setup to match the existing patterns in `conversation-engine.test.ts`. The `getCurrentPhase` mock must return a phase with `actionButtonIds: ["ap-1"]`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/conversation-engine.test.ts
```

Expected: FAIL — `actionButton` property doesn't exist on `EngineOutput`.

- [ ] **Step 3: Implement the engine changes**

In `src/lib/ai/conversation-engine.ts`, update `EngineOutput`:

```typescript
export interface EngineOutput {
  message: string;
  phaseAction: "stay" | "advance" | "escalate";
  confidence: number;
  imageIds: string[];
  currentPhase: string;
  escalated: boolean;
  paused: boolean;
  actionButton?: {
    actionPageId: string;
    ctaText: string;
  };
}
```

After step 7 (parse decision) and before step 11 (side effects), add action button validation:

```typescript
  // Step 7b: Validate action button selection
  let actionButton: { actionPageId: string; ctaText: string } | undefined;
  if (decision.actionButtonId) {
    const isValid =
      currentPhase.actionButtonIds !== null &&
      currentPhase.actionButtonIds.includes(decision.actionButtonId);

    if (isValid) {
      // Resolve CTA: AI custom > we'll resolve action page default in webhook handler
      actionButton = {
        actionPageId: decision.actionButtonId,
        ctaText: decision.ctaText ?? "",
      };
    }
  }
```

The empty string `ctaText` signals "use the action page default" — the webhook handler will resolve this.

Include `actionButton` in the return:

```typescript
  return {
    message: finalMessage,
    phaseAction: decision.phaseAction,
    confidence: decision.confidence,
    imageIds: validatedImageIds,
    currentPhase: currentPhase.name,
    escalated,
    paused: false,
    actionButton,
  };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/unit/conversation-engine.test.ts
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/conversation-engine.ts tests/unit/conversation-engine.test.ts
git commit -m "feat: add actionButton to conversation engine output"
```

---

### Task 6: Webhook Handler — Send Button Message via Messenger

**Files:**
- Modify: `src/app/api/fb/webhook/route.ts`

- [ ] **Step 1: Add the action URL import**

At the top of `src/app/api/fb/webhook/route.ts`, add:

```typescript
import { buildActionPageUrl } from "@/lib/fb/action-url";
import { getAppHost, getAppProtocol } from "@/lib/supabase/cookie-domain";
```

- [ ] **Step 2: Update `generateAndSendReply` to handle action buttons**

After the image-sending loop (the `for (const imageId of engineOutput.imageIds)` block), add the action button sending logic:

```typescript
    // Send action button if the engine selected one
    if (engineOutput.actionButton) {
      const { data: actionPage } = await supabase
        .from("action_pages")
        .select("slug, title, cta_text")
        .eq("id", engineOutput.actionButton.actionPageId)
        .eq("tenant_id", tenantId)
        .single();

      if (actionPage) {
        const { data: tenantData } = await supabase
          .from("tenants")
          .select("slug, fb_app_secret")
          .eq("id", tenantId)
          .single();

        if (tenantData?.fb_app_secret && tenantData.slug) {
          const appDomain = getAppHost() ?? "whatstage.com";
          const protocol = getAppProtocol();

          const actionUrl = buildActionPageUrl({
            tenantSlug: tenantData.slug,
            actionPageSlug: actionPage.slug,
            psid,
            appSecret: tenantData.fb_app_secret,
            appDomain,
            protocol,
          });

          // Resolve CTA: engine custom > action page default > generic fallback
          const ctaText =
            engineOutput.actionButton.ctaText ||
            actionPage.cta_text ||
            "Check this out";

          const btnResult = await sendMessage(
            psid,
            {
              type: "buttons",
              text: ctaText,
              buttons: [
                {
                  type: "web_url",
                  title: actionPage.title.slice(0, 20), // FB button title max 20 chars
                  url: actionUrl,
                },
              ],
            },
            pageToken
          );

          // Store the button message
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            direction: "out",
            text: ctaText,
            attachments: [{ type: "button", url: actionUrl, title: actionPage.title }],
            mid: btnResult.messageId,
          } as Database["public"]["Tables"]["messages"]["Insert"]);

          // Log the action button send event
          await supabase.from("lead_events").insert({
            tenant_id: tenantId,
            lead_id: leadId,
            type: "action_button_sent",
            payload: {
              action_page_id: engineOutput.actionButton.actionPageId,
              action_page_slug: actionPage.slug,
              message_id: btnResult.messageId,
            },
          } as Database["public"]["Tables"]["lead_events"]["Insert"]);
        }
      }
    }
```

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: ALL PASS (no regressions)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/fb/webhook/route.ts
git commit -m "feat: send action button as Messenger button template with signed URL"
```

---

### Task 7: Manual Integration Test

**Files:** None (testing only)

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify the full flow**

1. Open the tenant dashboard
2. Create or edit a campaign phase — attach an action page to it
3. Optionally set a `cta_text` on the action page
4. Send a message to the bot via Facebook Messenger
5. Observe: the AI should reply with a text message, and when it decides the timing is right, send a button template
6. Click the button — it should open the action page with `psid` and `sig` in the URL
7. Submit the form — confirm the submission is tied to the lead

- [ ] **Step 3: Verify edge cases**

1. Phase with no action buttons — AI should never include `action_button_id` in its response
2. AI sends an invalid button ID — engine should ignore it, no button sent
3. Action page with no `cta_text` — should fall back to "Check this out"
4. Button title longer than 20 chars — should be truncated

---

## Summary

| Task | What it does |
|------|--------------|
| 1 | DB migration + type update for `cta_text` |
| 2 | Decision parser picks up `action_button_id` and `cta_text` |
| 3 | URL builder creates signed action page URLs |
| 4 | Prompt builder tells AI about available buttons |
| 5 | Engine validates and passes action button through |
| 6 | Webhook sends the actual Messenger button template |
| 7 | Manual integration test |
