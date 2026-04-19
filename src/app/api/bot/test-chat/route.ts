import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";
import { retrieveKnowledge } from "@/lib/ai/retriever";
import { buildSystemPrompt } from "@/lib/ai/prompt-builder";
import { generateResponse } from "@/lib/ai/llm-client";
import { parseDecision } from "@/lib/ai/decision-parser";

const schema = z.object({
  message: z.string().min(1).max(500),
});

// Simple in-memory rate limiter (per-tenant, 30 req/min)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(tenantId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(tenantId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(tenantId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT) return false;
  entry.count += 1;
  return true;
}

const TEST_PHASE = {
  conversationPhaseId: "test-mode",
  phaseId: "test-mode",
  name: "Test Mode",
  orderIndex: 0,
  maxMessages: 999,
  systemPrompt: "Answer based on retrieved knowledge and rules.",
  tone: "friendly",
  goals: null,
  transitionHint: null,
  actionButtonIds: null,
  messageCount: 0,
};

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

  const { tenantId } = { tenantId: membership.tenant_id };

  if (!checkRateLimit(tenantId)) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
  }

  const { data: tenant } = await service
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .single();

  const businessName = tenant?.name ?? "Your Business";
  const { message } = parsed.data;

  const retrieval = await retrieveKnowledge({ query: message, tenantId });

  const systemPrompt = await buildSystemPrompt({
    tenantId,
    businessName,
    currentPhase: TEST_PHASE,
    conversationId: "test-mode",
    ragChunks: retrieval.chunks,
    testMode: true,
  });

  const llmResponse = await generateResponse(systemPrompt, message);
  const decision = parseDecision(llmResponse.content);

  return NextResponse.json({
    reply: decision.message,
    confidence: decision.confidence,
    queryTarget: retrieval.queryTarget,
    retrievalPass: retrieval.retrievalPass,
    chunks: retrieval.chunks.map((c) => ({
      content: c.content,
      similarity: c.similarity,
      source: (c.metadata?.kb_type as string) ?? "general",
    })),
  });
}
