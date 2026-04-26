import { redirect } from "next/navigation";
import { requireTenantContext } from "@/lib/queries/tenant";
import { createServiceClient } from "@/lib/supabase/service";
import { AiBuilderEmptyState } from "@/components/dashboard/campaigns/AiBuilderEmptyState";
import AiCampaignBuilderClient from "./AiCampaignBuilderClient";

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
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("published", true);

  if (!pages || pages.length === 0) {
    return <AiBuilderEmptyState />;
  }

  return <AiCampaignBuilderClient />;
}
