import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const { id: campaignId } = await context.params;
  const service = createServiceClient();

  const { data: phases } = await service
    .from("campaign_phases")
    .select("id, name, order_index")
    .eq("campaign_id", campaignId)
    .eq("tenant_id", tenantId)
    .order("order_index", { ascending: true });

  if (!phases) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const phaseMetrics = await Promise.all(
    phases.map(async (phase) => {
      const { data: cpRows } = await service
        .from("conversation_phases")
        .select("id, message_count, entered_at, exited_at, exit_reason")
        .eq("phase_id", phase.id);

      const rows = cpRows ?? [];
      const entered = rows.length;
      const advanced = rows.filter(
        (r) => r.exit_reason === "advanced" || r.exit_reason === "converted"
      ).length;
      const dropped = rows.filter((r) => r.exit_reason === "dropped").length;
      const exitedRows = rows.filter((r) => r.exited_at);
      const avgMessages =
        entered > 0
          ? rows.reduce((sum, r) => sum + r.message_count, 0) / entered
          : 0;
      const avgTimeMs =
        exitedRows.length > 0
          ? exitedRows.reduce(
              (sum, r) =>
                sum +
                (new Date(r.exited_at!).getTime() -
                  new Date(r.entered_at).getTime()),
              0
            ) / exitedRows.length
          : 0;

      return {
        phase_id: phase.id,
        name: phase.name,
        order_index: phase.order_index,
        entered,
        advanced,
        dropped,
        in_progress: entered - advanced - dropped,
        success_rate: entered > 0 ? advanced / entered : 0,
        avg_messages: Math.round(avgMessages * 10) / 10,
        avg_time_minutes: Math.round(avgTimeMs / 60000),
      };
    })
  );

  const { data: totalLeadsData } = await service
    .from("lead_campaign_assignments")
    .select("id", { count: "exact" })
    .eq("campaign_id", campaignId);

  const { data: conversionsData } = await service
    .from("campaign_conversions")
    .select("id", { count: "exact" })
    .eq("campaign_id", campaignId);

  const totalLeads = totalLeadsData?.length ?? 0;
  const totalConversions = conversionsData?.length ?? 0;

  const highestDropOff = phaseMetrics.reduce(
    (max, p) => {
      const dropRate = p.entered > 0 ? p.dropped / p.entered : 0;
      return dropRate > max.rate ? { name: p.name, rate: dropRate } : max;
    },
    { name: "", rate: 0 }
  );

  return NextResponse.json({
    summary: {
      total_leads: totalLeads,
      total_conversions: totalConversions,
      conversion_rate: totalLeads > 0 ? totalConversions / totalLeads : 0,
      highest_drop_off: highestDropOff.name || null,
      highest_drop_off_rate: highestDropOff.rate,
    },
    phases: phaseMetrics,
  });
}
