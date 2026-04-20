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
      tone: p.tone ?? "friendly",
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
    tone: p.tone ?? "friendly",
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

  // Fetch tenant + campaign info in parallel
  const tenantPromise = service
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .single();

  const campaignPromise = session.campaignId
    ? service
        .from("campaigns")
        .select("name, description, goal")
        .eq("id", session.campaignId)
        .single()
    : Promise.resolve({ data: null });

  const [{ data: tenant }, { data: campaignData }] = await Promise.all([
    tenantPromise,
    campaignPromise,
  ]);

  const businessName = tenant?.name ?? "Your Business";
  const campaignContext = campaignData
    ? { name: campaignData.name, description: campaignData.description, goal: campaignData.goal }
    : undefined;

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
    testMode: false,
    historyOverride: session.history,
    campaign: campaignContext,
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
