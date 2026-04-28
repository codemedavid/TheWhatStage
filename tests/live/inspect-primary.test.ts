/**
 * One-shot DB inspector for the Primary Bot campaign.
 * Shows exactly what the prompt-builder will pull in.
 */
import { describe, it } from "vitest";
import { createServiceClient } from "@/lib/supabase/service";
import { listFunnelsForCampaign } from "@/lib/db/campaign-funnels";

describe("Inspect Primary Bot campaign", () => {
  it("dumps all rule sources", async () => {
    const service = createServiceClient();

    const { data: campaigns } = await service
      .from("campaigns")
      .select("id, tenant_id, name, description, goal, main_goal, campaign_personality, campaign_rules, follow_up_message")
      .eq("is_primary", true)
      .eq("status", "active")
      .limit(1);
    const campaign = campaigns?.[0];
    if (!campaign) {
      console.log("No primary campaign.");
      return;
    }

    console.log("\n=== CAMPAIGN ===");
    console.log(JSON.stringify(campaign, null, 2));

    const tenantId = campaign.tenant_id as string;

    const { data: tenant } = await service
      .from("tenants")
      .select("name, persona_tone, custom_instructions, business_type, bot_goal, business_description, qualification_criteria, main_action, differentiator")
      .eq("id", tenantId)
      .single();
    console.log("\n=== TENANT ===");
    console.log(JSON.stringify(tenant, null, 2));

    const { data: rules } = await service
      .from("bot_rules")
      .select("rule_text, category, enabled")
      .eq("tenant_id", tenantId);
    console.log("\n=== BOT_RULES ===");
    console.log(JSON.stringify(rules, null, 2));

    const funnels = await listFunnelsForCampaign(service as never, campaign.id as string);
    console.log("\n=== CAMPAIGN_FUNNELS ===");
    console.log(JSON.stringify(funnels, null, 2));

    if (funnels.length > 0) {
      const ids = funnels.map((f) => f.actionPageId);
      const { data: pages } = await service
        .from("action_pages")
        .select("id, title, type, slug, published")
        .in("id", ids);
      console.log("\n=== ACTION_PAGES ===");
      console.log(JSON.stringify(pages, null, 2));
    }

    const { data: phases } = await service
      .from("campaign_phases")
      .select("name, order_index, goals, transition_hint, tone, system_prompt, max_messages")
      .eq("campaign_id", campaign.id as string)
      .order("order_index");
    console.log("\n=== CAMPAIGN_PHASES (legacy, may shed light on intended questions) ===");
    console.log(JSON.stringify(phases, null, 2));
  }, 60_000);
});
