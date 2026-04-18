import { redirect } from "next/navigation";
import {
  requireTenantContext,
  getTenant,
  getStages,
  getTenantMembers,
} from "@/lib/queries/tenant";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    redirect("/login");
  }

  const [tenant, stages, members] = await Promise.all([
    getTenant(ctx.tenantId),
    getStages(ctx.tenantId),
    getTenantMembers(ctx.tenantId),
  ]);

  return (
    <SettingsClient
      tenant={
        tenant
          ? {
              name: tenant.name,
              slug: tenant.slug,
              businessType: tenant.business_type,
              botGoal: tenant.bot_goal,
              fbPageId: tenant.fb_page_id,
            }
          : null
      }
      stages={stages.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        orderIndex: s.order_index,
      }))}
      members={members.map((m) => ({
        userId: m.user_id,
        role: m.role as "owner" | "admin" | "agent",
        createdAt: m.created_at,
      }))}
    />
  );
}
