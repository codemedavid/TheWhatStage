import { redirect } from "next/navigation";
import { requireTenantContext } from "@/lib/queries/tenant";
import AiCampaignBuilderClient from "./AiCampaignBuilderClient";

export default async function AiCampaignBuilderPage() {
  try {
    await requireTenantContext();
  } catch {
    redirect("/login");
  }

  return <AiCampaignBuilderClient />;
}
