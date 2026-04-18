import { redirect } from "next/navigation";
import { requireTenantContext, getStages } from "@/lib/queries/tenant";
import { getLeads, getLeadEvents } from "@/lib/queries/leads";
import LeadsClient from "./LeadsClient";

export default async function LeadsPage() {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    redirect("/login");
  }

  const [leads, stages, events] = await Promise.all([
    getLeads(ctx.tenantId),
    getStages(ctx.tenantId),
    getLeadEvents(ctx.tenantId, 500),
  ]);

  return (
    <LeadsClient
      leads={leads.map((l) => ({
        id: l.id,
        psid: l.psid,
        fbName: l.fb_name,
        fbProfilePic: l.fb_profile_pic,
        stageId: l.stage_id,
        tags: l.tags,
        createdAt: l.created_at,
        lastActiveAt: l.last_active_at,
      }))}
      stages={stages.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        orderIndex: s.order_index,
      }))}
      events={events.map((e) => ({
        id: e.id,
        leadId: e.lead_id,
        type: e.type,
        payload: (e.payload ?? {}) as Record<string, unknown>,
        createdAt: e.created_at,
      }))}
    />
  );
}
