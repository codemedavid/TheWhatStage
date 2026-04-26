import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";
import { editPhases } from "@/lib/ai/campaign-builder";
import {
  loadBuilderTenantContext,
  loadCampaignForPhaseEdit,
  applyPhaseEdit,
} from "@/lib/ai/campaign-builder-store";

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(2000),
});

const phaseEditSchema = z.object({
  campaignId: z.string().min(1),
  message: z.string().trim().min(3).max(2000),
  history: z.array(chatMessageSchema).max(20).optional(),
  focusedPhaseIndex: z.number().int().min(0).optional(),
});

export async function POST(request: Request) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = phaseEditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const service = createServiceClient();
    const [context, campaignData] = await Promise.all([
      loadBuilderTenantContext(service, session.tenantId),
      loadCampaignForPhaseEdit(service, session.tenantId, parsed.data.campaignId),
    ]);

    const result = await editPhases({
      context,
      plan: campaignData.plan,
      rules: campaignData.rules,
      currentPhases: campaignData.phases,
      message: parsed.data.message,
      focusedPhaseIndex: parsed.data.focusedPhaseIndex,
      history: parsed.data.history,
    });

    await applyPhaseEdit(service, session.tenantId, parsed.data.campaignId, result);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to edit phases";
    const status = message.includes("lead activity") || message.includes("Only non-primary") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
