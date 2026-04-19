import { redirect } from "next/navigation";
import { requireTenantContext } from "@/lib/queries/tenant";
import { createServiceClient } from "@/lib/supabase/service";
import CampaignEditorClient from "./CampaignEditorClient";

export default async function CampaignEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    redirect("/login");
  }

  const { id } = await params;
  const supabase = createServiceClient();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .single();

  if (!campaign) {
    redirect("/app/campaigns");
  }

  return <CampaignEditorClient campaign={campaign} />;
}
