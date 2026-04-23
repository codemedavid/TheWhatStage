import { getTenantContext } from "@/lib/tenant/context";
import { redirect } from "next/navigation";
import IntegrationsClient from "./IntegrationsClient";

export default async function IntegrationsPage() {
  const tenantCtx = await getTenantContext();
  if (!tenantCtx) redirect("/login");

  return <IntegrationsClient tenantId={tenantCtx.tenantId} />;
}
