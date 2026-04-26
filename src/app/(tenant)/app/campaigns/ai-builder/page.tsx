import { redirect } from "next/navigation";
import { requireTenantContext } from "@/lib/queries/tenant";
import { createServiceClient } from "@/lib/supabase/service";
import { AiBuilderEmptyState } from "@/components/dashboard/campaigns/AiBuilderEmptyState";
import { FunnelBuilderClient } from "@/components/dashboard/campaigns/FunnelBuilderClient";
import type { AvailablePage } from "@/lib/ai/funnel-builder";
import type { ActionPageType } from "@/lib/ai/funnel-templates";

export default async function AiCampaignBuilderPage() {
  let tenantId: string;
  try {
    const ctx = await requireTenantContext();
    tenantId = ctx.tenantId;
  } catch {
    redirect("/login");
  }

  const service = createServiceClient();
  const { data: pages } = await service
    .from("action_pages")
    .select("id, type, title")
    .eq("tenant_id", tenantId)
    .eq("published", true);

  if (!pages || pages.length === 0) {
    return <AiBuilderEmptyState />;
  }

  const availablePages: AvailablePage[] = pages.map((p) => ({
    id: p.id,
    type: p.type as ActionPageType,
    title: p.title,
  }));

  return <FunnelBuilderClient availablePages={availablePages} />;
}
