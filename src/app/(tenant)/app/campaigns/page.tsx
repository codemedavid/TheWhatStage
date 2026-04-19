import { redirect } from "next/navigation";
import { requireTenantContext } from "@/lib/queries/tenant";
import CampaignsClient from "./CampaignsClient";

export default async function CampaignsPage() {
  try {
    await requireTenantContext();
  } catch {
    redirect("/login");
  }

  return <CampaignsClient />;
}
