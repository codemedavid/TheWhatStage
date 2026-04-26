# Test Chat Phase Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the test chat to simulate real campaign phase flows with knowledge retrieval, conversation history tracking, campaign selection, phase jumping, and reset.

**Architecture:** In-memory session store on the server tracks conversation state (current phase, message count, history) per tenant test session. The API accepts campaign/phase selection params. The UI gets a toolbar with campaign picker, phase indicator, phase jump, and reset button.

**Tech Stack:** Next.js App Router API routes, React state, in-memory Map for session storage, existing RAG pipeline + prompt builder.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/lib/ai/test-session.ts` (create) | In-memory session store: create, get, advance, jump, reset sessions |
| `src/app/api/bot/test-chat/route.ts` (modify) | Accept campaignId, sessionId, jumpToPhase, reset params; use real phases |
| `src/app/(tenant)/app/bot/BotClient.tsx` (modify) | TestChatTab: add campaign selector, phase indicator, jump dropdown, reset button |

---

### Task 1: Create In-Memory Test Session Store

**Files:**
- Create: `src/lib/ai/test-session.ts`

- [ ] **Step 1: Create the session store module**

```ts
// src/lib/ai/test-session.ts
import type { CurrentPhase } from "@/lib/ai/phase-machine";

export interface TestSession {
  id: string;
  tenantId: string;
  campaignId: string | null; // null = default bot flow
  currentPhaseIndex: number;
  messageCount: number;
  history: { role: "user" | "bot"; text: string }[];
  phases: PhaseConfig[];
  createdAt: number;
}

export interface PhaseConfig {
  id: string;
  name: string;
  orderIndex: number;
  maxMessages: number;
  systemPrompt: string;
  tone: string;
  goals: string | null;
  transitionHint: string | null;
  actionButtonIds: string[] | null;
}

// Sessions expire after 30 minutes of inactivity
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 1000;
const sessions = new Map<string, TestSession>();

function evictExpired(): void {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(key);
    }
  }
}

function sessionKey(tenantId: string, sessionId: string): string {
  return `${tenantId}:${sessionId}`;
}

export function createSession(
  tenantId: string,
  sessionId: string,
  campaignId: string | null,
  phases: PhaseConfig[]
): TestSession {
  if (sessions.size > MAX_SESSIONS) evictExpired();

  const session: TestSession = {
    id: sessionId,
    tenantId,
    campaignId,
    currentPhaseIndex: 0,
    messageCount: 0,
    history: [],
    phases,
    createdAt: Date.now(),
  };
  sessions.set(sessionKey(tenantId, sessionId), session);
  return session;
}

export function getSession(tenantId: string, sessionId: string): TestSession | null {
  const session = sessions.get(sessionKey(tenantId, sessionId));
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(sessionKey(tenantId, sessionId));
    return null;
  }
  return session;
}

export function deleteSession(tenantId: string, sessionId: string): void {
  sessions.delete(sessionKey(tenantId, sessionId));
}

export function addMessage(session: TestSession, role: "user" | "bot", text: string): void {
  session.history.push({ role, text });
  if (role === "user") {
    session.messageCount += 1;
  }
  session.createdAt = Date.now(); // refresh TTL
}

export function getCurrentPhaseConfig(session: TestSession): PhaseConfig | null {
  return session.phases[session.currentPhaseIndex] ?? null;
}

export function advanceSessionPhase(session: TestSession): PhaseConfig | null {
  if (session.currentPhaseIndex >= session.phases.length - 1) {
    return session.phases[session.currentPhaseIndex]; // stay at last phase
  }
  session.currentPhaseIndex += 1;
  session.messageCount = 0;
  return session.phases[session.currentPhaseIndex];
}

export function jumpToPhase(session: TestSession, phaseId: string): PhaseConfig | null {
  const index = session.phases.findIndex((p) => p.id === phaseId);
  if (index === -1) return null;
  session.currentPhaseIndex = index;
  session.messageCount = 0;
  return session.phases[index];
}

export function phaseToCurrentPhase(phase: PhaseConfig, messageCount: number): CurrentPhase {
  return {
    conversationPhaseId: `test-${phase.id}`,
    phaseId: phase.id,
    name: phase.name,
    orderIndex: phase.orderIndex,
    maxMessages: phase.maxMessages,
    systemPrompt: phase.systemPrompt,
    tone: phase.tone,
    goals: phase.goals,
    transitionHint: phase.transitionHint,
    actionButtonIds: phase.actionButtonIds,
    messageCount,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ai/test-session.ts
git commit -m "feat: add in-memory test session store for test chat phase simulation"
```

---

### Task 2: Update Test Chat API Route

**Files:**
- Modify: `src/app/api/bot/test-chat/route.ts`

- [ ] **Step 1: Rewrite the test-chat route to support sessions, campaigns, phase jumping, and reset**

Replace the entire contents of `src/app/api/bot/test-chat/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";
import { retrieveKnowledge } from "@/lib/ai/retriever";
import { buildSystemPrompt } from "@/lib/ai/prompt-builder";
import { generateResponse } from "@/lib/ai/llm-client";
import { parseDecision } from "@/lib/ai/decision-parser";
import {
  createSession,
  getSession,
  deleteSession,
  addMessage,
  getCurrentPhaseConfig,
  advanceSessionPhase,
  jumpToPhase,
  phaseToCurrentPhase,
  type PhaseConfig,
} from "@/lib/ai/test-session";

const schema = z.object({
  message: z.string().min(1).max(500),
  sessionId: z.string().min(1).max(100),
  campaignId: z.string().uuid().nullable().default(null),
  jumpToPhaseId: z.string().uuid().optional(),
  reset: z.boolean().optional(),
});

// Simple in-memory rate limiter (per-tenant, 30 req/min)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const MAX_RATE_LIMIT_ENTRIES = 10_000;

function checkRateLimit(tenantId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(tenantId);

  if (!entry || now > entry.resetAt) {
    if (rateLimitMap.size > MAX_RATE_LIMIT_ENTRIES) {
      for (const [key, val] of rateLimitMap) {
        if (now > val.resetAt) rateLimitMap.delete(key);
      }
    }
    rateLimitMap.set(tenantId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT) return false;
  entry.count += 1;
  return true;
}

async function loadPhases(tenantId: string, campaignId: string | null): Promise<PhaseConfig[]> {
  const service = createServiceClient();

  if (campaignId) {
    const { data } = await service
      .from("campaign_phases")
      .select("id, name, order_index, max_messages, system_prompt, tone, goals, transition_hint, action_button_ids")
      .eq("campaign_id", campaignId)
      .eq("tenant_id", tenantId)
      .order("order_index", { ascending: true });

    return (data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      orderIndex: p.order_index,
      maxMessages: p.max_messages,
      systemPrompt: p.system_prompt,
      tone: p.tone,
      goals: p.goals,
      transitionHint: p.transition_hint,
      actionButtonIds: p.action_button_ids,
    }));
  }

  // Default bot flow phases
  const { data } = await service
    .from("bot_flow_phases")
    .select("id, name, order_index, max_messages, system_prompt, tone, goals, transition_hint, action_button_ids")
    .eq("tenant_id", tenantId)
    .order("order_index", { ascending: true });

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    orderIndex: p.order_index,
    maxMessages: p.max_messages,
    systemPrompt: p.system_prompt,
    tone: p.tone,
    goals: p.goals,
    transitionHint: p.transition_hint,
    actionButtonIds: p.action_button_ids,
  }));
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: membership } = await service
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership?.tenant_id) {
    return NextResponse.json({ error: "No tenant membership" }, { status: 403 });
  }

  const tenantId = membership.tenant_id;
  const { message, sessionId, campaignId, jumpToPhaseId, reset } = parsed.data;

  if (!checkRateLimit(tenantId)) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
  }

  // Handle reset
  if (reset) {
    deleteSession(tenantId, sessionId);
    return NextResponse.json({ status: "reset" });
  }

  // Get or create session
  let session = getSession(tenantId, sessionId);
  if (!session) {
    const phases = await loadPhases(tenantId, campaignId);
    if (phases.length === 0) {
      return NextResponse.json({
        error: "No phases configured. Add phases to your bot flow or campaign first.",
      }, { status: 400 });
    }
    session = createSession(tenantId, sessionId, campaignId, phases);
  }

  // Handle phase jump
  if (jumpToPhaseId) {
    const jumped = jumpToPhase(session, jumpToPhaseId);
    if (!jumped) {
      return NextResponse.json({ error: "Phase not found" }, { status: 404 });
    }
    return NextResponse.json({
      status: "jumped",
      currentPhase: jumped,
      phaseIndex: session.currentPhaseIndex,
      totalPhases: session.phases.length,
    });
  }

  // Get current phase
  const currentPhaseConfig = getCurrentPhaseConfig(session);
  if (!currentPhaseConfig) {
    return NextResponse.json({ error: "No active phase" }, { status: 500 });
  }

  const { data: tenant } = await service
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .single();

  const businessName = tenant?.name ?? "Your Business";

  // Add user message to history
  addMessage(session, "user", message);

  // Retrieve knowledge
  const retrieval = await retrieveKnowledge({ query: message, tenantId });

  // Build system prompt with real phase
  const currentPhase = phaseToCurrentPhase(currentPhaseConfig, session.messageCount);
  const systemPrompt = await buildSystemPrompt({
    tenantId,
    businessName,
    currentPhase,
    conversationId: `test-${sessionId}`,
    ragChunks: retrieval.chunks,
    testMode: false, // use real phase context now
  });

  const llmResponse = await generateResponse(systemPrompt, message);
  const decision = parseDecision(llmResponse.content);

  // Add bot response to history
  addMessage(session, "bot", decision.message);

  // Handle phase advancement
  let phaseAdvanced = false;
  let newPhase: PhaseConfig | null = null;
  if (decision.phaseAction === "advance") {
    newPhase = advanceSessionPhase(session);
    phaseAdvanced = newPhase !== null && newPhase.id !== currentPhaseConfig.id;
  }

  return NextResponse.json({
    reply: decision.message,
    confidence: decision.confidence,
    phaseAction: decision.phaseAction,
    phaseAdvanced,
    currentPhase: {
      id: getCurrentPhaseConfig(session)!.id,
      name: getCurrentPhaseConfig(session)!.name,
      index: session.currentPhaseIndex,
      total: session.phases.length,
      messageCount: session.messageCount,
      maxMessages: getCurrentPhaseConfig(session)!.maxMessages,
    },
    queryTarget: retrieval.queryTarget,
    retrievalPass: retrieval.retrievalPass,
    chunks: retrieval.chunks.map((c) => ({
      content: c.content,
      similarity: c.similarity,
      source: (c.metadata?.kb_type as string) ?? "general",
    })),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/bot/test-chat/route.ts
git commit -m "feat: update test-chat API to support sessions, campaigns, phase simulation"
```

---

### Task 3: Update TestChatTab UI

**Files:**
- Modify: `src/app/(tenant)/app/bot/BotClient.tsx` (TestChatTab function, lines 317-467)

- [ ] **Step 1: Replace the TestChatTab function with the enhanced version**

Replace the `TestChatTab` function (and its associated types above it) in `BotClient.tsx`:

```tsx
type ReasoningChunk = {
  content: string;
  similarity: number;
  source: string;
};

type PhaseInfo = {
  id: string;
  name: string;
  index: number;
  total: number;
  messageCount: number;
  maxMessages: number;
};

type Reasoning = {
  chunks: ReasoningChunk[];
  confidence: number;
  queryTarget: string;
  retrievalPass: number;
  phaseAction: string;
};

type Campaign = {
  id: string;
  name: string;
};

type PhaseOption = {
  id: string;
  name: string;
  order_index: number;
};

function TestChatTab() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [reasoning, setReasoning] = useState<Reasoning | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId] = useState(() => `test-${Date.now()}`);

  // Campaign & phase state
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [phases, setPhases] = useState<PhaseOption[]>([]);
  const [currentPhase, setCurrentPhase] = useState<PhaseInfo | null>(null);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);

  // Load campaigns on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/campaigns");
        if (res.ok) {
          const data = await res.json();
          setCampaigns(data.campaigns ?? []);
        }
      } finally {
        setLoadingCampaigns(false);
      }
    }
    load();
  }, []);

  // Load phases when campaign changes
  useEffect(() => {
    async function loadPhases() {
      const url = selectedCampaignId
        ? `/api/campaigns/${selectedCampaignId}/phases`
        : "/api/bot/phases";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setPhases(data.phases ?? []);
      }
    }
    loadPhases();
  }, [selectedCampaignId]);

  const handleReset = async () => {
    await fetch("/api/bot/test-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "reset", sessionId, reset: true }),
    });
    setMessages([]);
    setReasoning(null);
    setCurrentPhase(null);
    setError(null);
  };

  const handleCampaignChange = async (campaignId: string | null) => {
    setSelectedCampaignId(campaignId);
    // Reset session when campaign changes
    await handleReset();
  };

  const handleJumpToPhase = async (phaseId: string) => {
    try {
      const res = await fetch("/api/bot/test-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "jump",
          sessionId,
          campaignId: selectedCampaignId,
          jumpToPhaseId: phaseId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentPhase({
          id: data.currentPhase.id,
          name: data.currentPhase.name,
          index: data.phaseIndex,
          total: data.totalPhases,
          messageCount: 0,
          maxMessages: data.currentPhase.maxMessages ?? 3,
        });
        const jumpedPhase = phases.find((p) => p.id === phaseId);
        const systemMsg: Message = {
          id: `sys-${Date.now()}`,
          direction: "out",
          text: `--- Jumped to phase: ${jumpedPhase?.name ?? "Unknown"} ---`,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, systemMsg]);
      }
    } catch {
      setError("Failed to jump to phase");
    }
  };

  const handleSend = async (text: string) => {
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      direction: "in",
      text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/bot/test-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId,
          campaignId: selectedCampaignId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Something went wrong");
        return;
      }

      const data = await res.json();
      const botMsg: Message = {
        id: `bot-${Date.now()}`,
        direction: "out",
        text: data.reply,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, botMsg]);

      // Update phase info
      if (data.currentPhase) {
        setCurrentPhase(data.currentPhase);
      }

      // Show phase advancement notification
      if (data.phaseAdvanced) {
        const advanceMsg: Message = {
          id: `sys-advance-${Date.now()}`,
          direction: "out",
          text: `--- Advanced to phase: ${data.currentPhase.name} ---`,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, advanceMsg]);
      }

      setReasoning({
        chunks: data.chunks ?? [],
        confidence: data.confidence ?? 0,
        queryTarget: data.queryTarget ?? "general",
        retrievalPass: data.retrievalPass ?? 1,
        phaseAction: data.phaseAction ?? "stay",
      });
    } catch {
      setError("Failed to reach the server. Check your connection.");
    } finally {
      setSending(false);
    }
  };

  const confidenceColor =
    reasoning && reasoning.confidence >= 0.7
      ? "bg-green-500"
      : reasoning && reasoning.confidence >= 0.4
        ? "bg-yellow-500"
        : "bg-red-500";

  const confidencePct = reasoning ? Math.round(reasoning.confidence * 100) : 0;

  return (
    <div className="flex h-[500px] flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Campaign Selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-[var(--ws-text-muted)]">Campaign:</label>
          <select
            value={selectedCampaignId ?? "__default__"}
            onChange={(e) => handleCampaignChange(e.target.value === "__default__" ? null : e.target.value)}
            disabled={loadingCampaigns}
            className="rounded-lg border border-[var(--ws-border)] bg-white px-3 py-1.5 text-sm text-[var(--ws-text-primary)] outline-none focus:border-[var(--ws-accent)]"
          >
            <option value="__default__">Default Bot Flow</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Phase Jump */}
        {phases.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-[var(--ws-text-muted)]">Jump to:</label>
            <select
              value=""
              onChange={(e) => { if (e.target.value) handleJumpToPhase(e.target.value); }}
              className="rounded-lg border border-[var(--ws-border)] bg-white px-3 py-1.5 text-sm text-[var(--ws-text-primary)] outline-none focus:border-[var(--ws-accent)]"
            >
              <option value="">Select phase...</option>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Phase Indicator */}
        {currentPhase && (
          <Badge variant="muted">
            Phase {currentPhase.index + 1}/{currentPhase.total}: {currentPhase.name}
            {" "}({currentPhase.messageCount}/{currentPhase.maxMessages} msgs)
          </Badge>
        )}

        {/* Reset Button */}
        <Button variant="ghost" onClick={handleReset} className="ml-auto">
          Reset
        </Button>
      </div>

      {/* Chat + Reasoning */}
      <div className="flex flex-1 gap-4">
        <Card className="flex-1 overflow-hidden">
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-[var(--ws-border)] px-4 py-2">
              <Badge variant="warning">Test Mode</Badge>
              {sending && (
                <span className="flex items-center gap-1 text-xs text-[var(--ws-text-muted)]">
                  <span className="animate-pulse">●</span>
                  <span className="animate-pulse delay-75">●</span>
                  <span className="animate-pulse delay-150">●</span>
                </span>
              )}
            </div>
            {error && (
              <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-600">
                {error}
              </div>
            )}
            <div className="flex-1">
              <MessageThread
                header={{ leadName: "Test User", leadPic: null }}
                messages={messages}
                onSend={sending ? undefined : handleSend}
              />
            </div>
          </div>
        </Card>

        <Card className="w-72 shrink-0 overflow-y-auto p-4">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--ws-text-muted)]">
            AI Reasoning
          </h3>

          {!reasoning ? (
            <p className="text-xs text-[var(--ws-text-muted)]">
              Send a message to see which rules and knowledge chunks the AI uses to generate its response.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Phase Action */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--ws-text-muted)]">Phase action:</span>
                <Badge variant={reasoning.phaseAction === "advance" ? "success" : reasoning.phaseAction === "escalate" ? "warning" : "muted"}>
                  {reasoning.phaseAction}
                </Badge>
              </div>

              {/* Confidence */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs text-[var(--ws-text-muted)]">Confidence</span>
                  <span className="text-xs font-medium text-[var(--ws-text-primary)]">{confidencePct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--ws-bg-secondary)]">
                  <div
                    className={`h-full rounded-full transition-all ${confidenceColor}`}
                    style={{ width: `${confidencePct}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Badge variant="muted">{reasoning.queryTarget}</Badge>
                {reasoning.retrievalPass === 2 && (
                  <Badge variant="warning">Reformulated query</Badge>
                )}
              </div>

              {/* Retrieved Knowledge */}
              <div>
                <p className="mb-2 text-xs font-medium text-[var(--ws-text-muted)]">
                  Retrieved Knowledge ({reasoning.chunks.length})
                </p>
                {reasoning.chunks.length === 0 ? (
                  <p className="text-xs text-[var(--ws-text-muted)]">No chunks retrieved.</p>
                ) : (
                  <div className="space-y-2">
                    {reasoning.chunks.map((chunk, i) => (
                      <div key={i} className="rounded-md border border-[var(--ws-border)] p-2">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs text-[var(--ws-text-muted)]">{chunk.source}</span>
                          <span className="text-xs font-medium text-[var(--ws-text-primary)]">
                            {Math.round(chunk.similarity * 100)}%
                          </span>
                        </div>
                        <p className="line-clamp-3 text-xs text-[var(--ws-text-secondary)]">
                          {chunk.content.slice(0, 120)}
                          {chunk.content.length > 120 ? "…" : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the `RotateCcw` icon import to the lucide imports at the top of BotClient.tsx**

Update the lucide import line:

```tsx
import {
  BookOpen,
  ShieldCheck,
  MessageCircle,
  ClipboardCheck,
  Plus,
} from "lucide-react";
```

No change needed — the Reset button uses `Button` with text only, no icon needed.

- [ ] **Step 3: Commit**

```bash
git add src/app/(tenant)/app/bot/BotClient.tsx
git commit -m "feat: add campaign selector, phase simulation, and reset to test chat UI"
```

---

### Task 4: Update Prompt Builder to Include Conversation History for Test Sessions

**Files:**
- Modify: `src/lib/ai/prompt-builder.ts` (lines 161-207)
- Modify: `src/app/api/bot/test-chat/route.ts`

Currently `buildSystemPrompt` fetches history from the `messages` DB table. For test sessions, we need to pass the in-memory history instead.

- [ ] **Step 1: Add optional `historyOverride` to PromptContext**

In `src/lib/ai/prompt-builder.ts`, update the `PromptContext` interface:

```ts
export interface PromptContext {
  tenantId: string;
  businessName: string;
  currentPhase: CurrentPhase;
  conversationId: string;
  ragChunks: ChunkResult[];
  images?: KnowledgeImage[];
  testMode?: boolean;
  historyOverride?: { role: "user" | "bot"; text: string }[];
}
```

- [ ] **Step 2: Use historyOverride in buildSystemPrompt when provided**

In `buildSystemPrompt`, replace the `messagesPromise` logic:

```ts
  const messagesPromise = ctx.historyOverride
    ? Promise.resolve({
        data: ctx.historyOverride.map((m) => ({
          direction: m.role === "user" ? "in" : "out",
          text: m.text,
        })) as MessageRow[],
        error: null,
      })
    : ctx.testMode
      ? Promise.resolve({ data: [] as MessageRow[], error: null })
      : supabase
          .from("messages")
          .select("direction, text")
          .eq("conversation_id", ctx.conversationId)
          .order("created_at", { ascending: false })
          .limit(MAX_HISTORY_MESSAGES);
```

- [ ] **Step 3: Pass historyOverride from test-chat route**

In the test-chat route, update the `buildSystemPrompt` call to pass the session history:

```ts
  const systemPrompt = await buildSystemPrompt({
    tenantId,
    businessName,
    currentPhase,
    conversationId: `test-${sessionId}`,
    ragChunks: retrieval.chunks,
    testMode: false,
    historyOverride: session.history,
  });
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/prompt-builder.ts src/app/api/bot/test-chat/route.ts
git commit -m "feat: support in-memory conversation history for test chat sessions"
```

---

### Task 5: Verify End-to-End

- [ ] **Step 1: Run type check**

```bash
npm run typecheck
```

Expected: No type errors.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: No lint errors.

- [ ] **Step 3: Run existing tests**

```bash
npm test
```

Expected: All passing (no regressions).

- [ ] **Step 4: Manual smoke test**

Run `npm run dev`, navigate to the Bot tab > Test Chat:
1. Verify campaign dropdown loads campaigns
2. Verify phases load when campaign is selected
3. Send a message and verify response includes phase info
4. Verify phase advancement notification appears
5. Verify "Jump to" switches phase
6. Verify "Reset" clears everything

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during test chat verification"
```
