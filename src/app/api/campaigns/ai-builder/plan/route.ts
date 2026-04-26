import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";
import { generatePlan } from "@/lib/ai/campaign-builder";
import {
  loadBuilderTenantContext,
  loadCampaignPlanForRevision,
  saveCampaignPlan,
} from "@/lib/ai/campaign-builder-store";

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(2000),
});

const planSchema = z.object({
  message: z.string().trim().min(3).max(2000),
  history: z.array(chatMessageSchema).max(20).optional(),
  campaignId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = planSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const service = createServiceClient();
    const [context, existing] = await Promise.all([
      loadBuilderTenantContext(service, session.tenantId),
      parsed.data.campaignId
        ? loadCampaignPlanForRevision(service, session.tenantId, parsed.data.campaignId)
        : Promise.resolve(null),
    ]);

    const result = await generatePlan({
      context,
      message: parsed.data.message,
      history: parsed.data.history,
      existingPlan: existing?.plan ?? null,
      existingRules: existing?.rules ?? [],
    });

    if (result.action === "question") {
      return NextResponse.json({
        action: "question",
        question: result.question,
        campaign: parsed.data.campaignId ? { id: parsed.data.campaignId } : null,
      });
    }

    const campaign = await saveCampaignPlan(service, session.tenantId, {
      campaignId: parsed.data.campaignId,
      campaignName: result.campaign_name,
      campaignDescription: result.campaign_description,
      campaignGoal: result.campaign_goal,
      plan: result.plan,
      rules: result.campaign_rules,
    });

    return NextResponse.json({
      action: "plan",
      campaign,
      plan: result.plan,
      rules: result.campaign_rules,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate plan";
    const status = message.includes("lead activity") || message.includes("Only non-primary") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
