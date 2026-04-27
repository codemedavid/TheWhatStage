import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";
import { retrieveKnowledge } from "@/lib/ai/retriever";
import { buildSystemPrompt } from "@/lib/ai/prompt-builder";
import { generateResponse } from "@/lib/ai/llm-client";
import { parseDecision } from "@/lib/ai/decision-parser";
import { listFunnelsForCampaign } from "@/lib/db/campaign-funnels";
import {
  ACTION_PAGE_TYPES,
  defaultRulesForPageType,
  type ActionPageType,
} from "@/lib/ai/funnel-templates";
import { funnelToStep } from "@/lib/ai/step-context";
import {
  addMessage,
  advanceSessionFunnel,
  createSession,
  deleteSession,
  getCurrentFunnel,
  getSession,
  jumpToFunnel,
  type FunnelWithPage,
} from "@/lib/ai/test-session";

const schema = z.object({
  message: z.string().min(1).max(500),
  sessionId: z.string().min(1).max(100),
  campaignId: z.string().uuid().nullable().default(null),
  jumpToFunnelId: z.string().uuid().optional(),
  simulateActionCompleted: z.boolean().optional(),
  reset: z.boolean().optional(),
});

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const MAX_RATE_LIMIT_ENTRIES = 10_000;

function checkRateLimit(tenantId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(tenantId);
  if (!entry || now > entry.resetAt) {
    if (rateLimitMap.size > MAX_RATE_LIMIT_ENTRIES) {
      for (const [key, val] of rateLimitMap) if (now > val.resetAt) rateLimitMap.delete(key);
    }
    rateLimitMap.set(tenantId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count += 1;
  return true;
}

async function loadFunnelsWithPages(
  service: ReturnType<typeof createServiceClient>,
  campaignId: string
): Promise<FunnelWithPage[]> {
  const funnels = await listFunnelsForCampaign(service as never, campaignId);
  if (funnels.length === 0) return [];
  const pageIds = funnels.map((f) => f.actionPageId);
  const { data: pages } = await service
    .from("action_pages")
    .select("id, title, type")
    .in("id", pageIds);
  const map = new Map((pages ?? []).map((p) => [p.id as string, p as { id: string; title: string; type: string }]));
  return funnels.map((f) => {
    const page = map.get(f.actionPageId);
    if (!page) throw new Error(`Action page missing for funnel ${f.id}`);
    if (!ACTION_PAGE_TYPES.includes(page.type as ActionPageType)) {
      throw new Error(`Unsupported page type: ${page.type}`);
    }
    return { ...f, pageTitle: page.title, pageType: page.type as ActionPageType };
  });
}

async function autoSeedFunnel(
  service: ReturnType<typeof createServiceClient>,
  tenantId: string
): Promise<FunnelWithPage[]> {
  const { data } = await service
    .from("action_pages")
    .select("id, type, title, published")
    .eq("tenant_id", tenantId)
    .eq("published", true)
    .order("created_at", { ascending: true });
  if (!data || data.length === 0) return [];
  const page = data[0] as { id: string; type: string; title: string };
  if (!ACTION_PAGE_TYPES.includes(page.type as ActionPageType)) return [];
  const pageType = page.type as ActionPageType;
  const now = new Date().toISOString();
  return [
    {
      id: "auto-seed",
      campaignId: "auto-seed",
      tenantId,
      position: 0,
      actionPageId: page.id,
      pageDescription: null,
      pitch: null,
      qualificationQuestions: [],
      chatRules: defaultRulesForPageType(pageType),
      createdAt: now,
      updatedAt: now,
      pageTitle: page.title,
      pageType,
    },
  ];
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const tenantId = membership.tenant_id as string;
  const { message, sessionId, campaignId, jumpToFunnelId, simulateActionCompleted, reset } = parsed.data;

  if (!checkRateLimit(tenantId)) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
  }

  if (reset) {
    deleteSession(tenantId, sessionId);
    return NextResponse.json({ status: "reset" });
  }

  let session = getSession(tenantId, sessionId);
  if (!session) {
    const funnels = campaignId
      ? await loadFunnelsWithPages(service, campaignId)
      : await autoSeedFunnel(service, tenantId);
    if (funnels.length === 0) {
      return NextResponse.json(
        { error: campaignId
            ? "This campaign has no funnels — rebuild via the AI builder."
            : "No published action pages — build one first." },
        { status: 400 }
      );
    }
    session = createSession(tenantId, sessionId, campaignId, funnels);
  }

  if (jumpToFunnelId) {
    const jumped = jumpToFunnel(session, jumpToFunnelId);
    if (!jumped) return NextResponse.json({ error: "Funnel not found" }, { status: 404 });
  }

  if (simulateActionCompleted) {
    advanceSessionFunnel(session);
  }

  const currentFunnel = getCurrentFunnel(session);
  if (!currentFunnel) return NextResponse.json({ error: "No active funnel" }, { status: 500 });

  const tenantPromise = service.from("tenants").select("name, persona_tone, custom_instructions").eq("id", tenantId).single();
  const botRulesPromise = service.from("bot_rules").select("rule_text, category, enabled").eq("tenant_id", tenantId);
  const campaignPromise = session.campaignId
    ? service.from("campaigns").select("name, description, goal, main_goal, campaign_personality, campaign_rules").eq("id", session.campaignId).single()
    : Promise.resolve({ data: null });

  const [{ data: tenant }, { data: campaignData }, { data: botRulesData }] = await Promise.all([tenantPromise, campaignPromise, botRulesPromise]);
  const businessName = (tenant as { name?: string } | null)?.name ?? "Your Business";
  const personaTone = (tenant as { persona_tone?: string } | null)?.persona_tone ?? "friendly";
  const customInstructions = (tenant as { custom_instructions?: string | null } | null)?.custom_instructions ?? null;
  const allBotRules = (botRulesData ?? []) as Array<{ rule_text: string; category: string; enabled: boolean }>;
  const enabledBotRules = allBotRules.filter((r) => r.enabled);
  const campaignContext = campaignData
    ? {
        name: (campaignData as { name: string }).name,
        description: (campaignData as { description: string | null }).description,
        goal: (campaignData as { goal: string }).goal,
        mainGoal: (campaignData as { main_goal?: string | null }).main_goal ?? null,
        campaignPersonality: (campaignData as { campaign_personality?: string | null }).campaign_personality ?? null,
        campaignRules: ((campaignData as { campaign_rules: string[] | null }).campaign_rules ?? []) as string[],
      }
    : undefined;

  addMessage(session, "user", message);

  const retrieval = await retrieveKnowledge({ query: message, tenantId });

  const step = funnelToStep({
    funnel: currentFunnel,
    allFunnels: session.funnels,
    campaign: { goal: campaignContext?.goal ?? "stage_reached" },
    page: { title: currentFunnel.pageTitle, type: currentFunnel.pageType },
    tone: personaTone,
  });

  const systemPrompt = await buildSystemPrompt({
    tenantId,
    businessName,
    step,
    conversationId: `test-${sessionId}`,
    ragChunks: retrieval.chunks,
    testMode: false,
    historyOverride: session.history,
    campaign: campaignContext,
  });

  const llmResponse = await generateResponse(systemPrompt, message);
  const decision = parseDecision(llmResponse.content);
  addMessage(session, "bot", decision.message);

  let funnelAdvanced = false;
  if (decision.phaseAction === "advance") {
    const r = advanceSessionFunnel(session);
    funnelAdvanced = r.advanced;
  }

  const after = getCurrentFunnel(session)!;
  return NextResponse.json({
    reply: decision.message,
    confidence: decision.confidence,
    funnelAction: decision.phaseAction,
    phaseAction: decision.phaseAction,
    funnelAdvanced,
    currentFunnel: {
      id: after.id,
      pageTitle: after.pageTitle,
      pageType: after.pageType,
      index: session.currentFunnelIndex,
      total: session.funnels.length,
    },
    queryTarget: retrieval.queryTarget,
    retrievalPass: retrieval.retrievalPass,
    chunks: retrieval.chunks.map((c) => ({
      content: c.content,
      similarity: c.similarity,
      source: (c.metadata?.kb_type as string) ?? "general",
    })),
    settingsApplied: {
      persona_tone: personaTone,
      custom_instructions_chars: customInstructions?.length ?? 0,
      bot_rules_total: allBotRules.length,
      bot_rules_enabled: enabledBotRules.length,
      bot_rules_by_category: enabledBotRules.reduce<Record<string, number>>((acc, r) => {
        const cat = (r.category ?? "general").toUpperCase();
        acc[cat] = (acc[cat] ?? 0) + 1;
        return acc;
      }, {}),
    },
  });
}
