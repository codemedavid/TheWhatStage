import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";
import { generatePhasesFromPlan } from "@/lib/ai/campaign-builder";
import {
  loadBuilderTenantContext,
  loadCampaignForPhaseGen,
  saveGeneratedPhases,
} from "@/lib/ai/campaign-builder-store";

const phasesSchema = z.object({
  campaignId: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = phasesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const service = createServiceClient();
    const [context, { plan, rules }] = await Promise.all([
      loadBuilderTenantContext(service, session.tenantId),
      loadCampaignForPhaseGen(service, session.tenantId, parsed.data.campaignId),
    ]);

    const phases = await generatePhasesFromPlan({ context, plan, rules });
    await saveGeneratedPhases(service, session.tenantId, parsed.data.campaignId, phases);

    return NextResponse.json({ phases }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate phases";
    const status = message.includes("lead activity") || message.includes("Only non-primary") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
