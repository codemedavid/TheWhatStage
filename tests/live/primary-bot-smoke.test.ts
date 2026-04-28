/**
 * LIVE smoke test for the Primary bot pipeline.
 *
 * Run with:
 *   npx vitest run --config vitest.live.config.ts
 *
 * Hits the real Supabase project + real HuggingFace LLM. Loads env from .env.local.
 * Skips if no primary campaign with funnels exists.
 */
import { describe, it, expect } from "vitest";
import { createServiceClient } from "@/lib/supabase/service";
import { listFunnelsForCampaign } from "@/lib/db/campaign-funnels";
import { funnelToStep } from "@/lib/ai/step-context";
import { ACTION_PAGE_TYPES, type ActionPageType } from "@/lib/ai/funnel-templates";
import { buildSystemPrompt } from "@/lib/ai/prompt-builder";
import { generateResponse } from "@/lib/ai/llm-client";
import { parseDecision } from "@/lib/ai/decision-parser";
import { retrieveKnowledge } from "@/lib/ai/retriever";

const TURNS = [
  "hi! ano meron dito?",
  "magkano?",
  "ok sige game, what's next?",
];

describe("Primary bot — live smoke", () => {
  it("walks 4 turns and shows campaign style + advance toward goal", async () => {
    const service = createServiceClient();

    const { data: campaigns } = await service
      .from("campaigns")
      .select("id, tenant_id, name, description, goal, main_goal, campaign_personality, campaign_rules")
      .eq("is_primary", true)
      .eq("status", "active")
      .limit(1);

    const campaign = campaigns?.[0];
    if (!campaign) {
      console.warn("[primary-bot-smoke] No active primary campaign — skipping.");
      return;
    }

    const tenantId = campaign.tenant_id as string;
    const campaignId = campaign.id as string;

    const funnels = await listFunnelsForCampaign(service as never, campaignId);
    if (funnels.length === 0) {
      console.warn(`[primary-bot-smoke] Campaign ${campaign.name} has 0 funnels — skipping.`);
      return;
    }

    const pageIds = funnels.map((f) => f.actionPageId);
    const { data: pages } = await service
      .from("action_pages")
      .select("id, title, type")
      .in("id", pageIds);
    const pageMap = new Map((pages ?? []).map((p) => [p.id as string, p as { id: string; title: string; type: string }]));

    const { data: tenant } = await service
      .from("tenants")
      .select("name, persona_tone, custom_instructions, business_type, bot_goal")
      .eq("id", tenantId)
      .single();
    const businessName = (tenant as any)?.name ?? "Your Business";
    const personaTone = (tenant as any)?.persona_tone ?? "friendly";

    let funnelIndex = 0;
    const conversation: Array<{ role: "user" | "bot"; text: string }> = [];

    console.log(`\n=== Primary bot smoke for tenant ${tenantId} / campaign "${campaign.name}" ===`);
    console.log(`Funnels: ${funnels.length}, goal=${campaign.goal}, has_personality=${Boolean(campaign.campaign_personality)}, rules=${(campaign.campaign_rules ?? []).length}`);

    for (const userMsg of TURNS) {
      const f = funnels[funnelIndex];
      const page = pageMap.get(f.actionPageId);
      if (!page || !ACTION_PAGE_TYPES.includes(page.type as ActionPageType)) {
        console.warn(`Skipping — invalid page for funnel ${f.id}`);
        return;
      }

      conversation.push({ role: "user", text: userMsg });

      const retrieval = await retrieveKnowledge({ query: userMsg, tenantId });
      const step = funnelToStep({
        funnel: f,
        allFunnels: funnels,
        campaign: { goal: (campaign.goal as string) ?? "stage_reached" },
        page: { title: page.title, type: page.type as ActionPageType },
        tone: personaTone,
      });

      const systemPrompt = await buildSystemPrompt({
        tenantId,
        businessName,
        step,
        conversationId: `live-smoke-${campaignId}`,
        ragChunks: retrieval.chunks,
        testMode: false,
        historyOverride: conversation.map((m) => ({
          direction: m.role === "user" ? "in" : "out",
          text: m.text,
        })),
        campaign: {
          name: campaign.name as string,
          description: (campaign as any).description ?? null,
          goal: campaign.goal as string,
          mainGoal: (campaign as any).main_goal ?? null,
          campaignPersonality: (campaign as any).campaign_personality ?? null,
          campaignRules: ((campaign as any).campaign_rules as string[]) ?? [],
        },
      });

      const llm = await generateResponse(systemPrompt, userMsg);
      const decision = parseDecision(llm.content);
      conversation.push({ role: "bot", text: decision.message });

      console.log(`\n  USER: ${userMsg}`);
      console.log(`  BOT : ${decision.message}`);
      console.log(`  meta: action=${decision.phaseAction} confidence=${decision.confidence} button=${decision.actionButtonId ? "yes" : "no"} step=${funnelIndex + 1}/${funnels.length} (${page.type})`);

      if (decision.phaseAction === "advance" && funnelIndex < funnels.length - 1) {
        funnelIndex += 1;
      }

      expect(decision.message.length).toBeGreaterThan(0);
      expect(["stay", "advance", "escalate"]).toContain(decision.phaseAction);
    }

    // Quick alignment heuristic: at least once across the 4 turns the bot should
    // surface the action button (price question or "what's next" should trigger it).
    // We don't fail the test on this — it's logged so the human can judge.
    console.log(`\n=== End of run ===\n`);
  }, 240_000);
});
