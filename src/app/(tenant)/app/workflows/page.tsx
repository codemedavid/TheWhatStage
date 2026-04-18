import { redirect } from "next/navigation";
import { requireTenantContext } from "@/lib/queries/tenant";
import { getWorkflows } from "@/lib/queries/workflows";
import WorkflowsClient from "./WorkflowsClient";

export default async function WorkflowsPage() {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    redirect("/login");
  }

  const workflows = await getWorkflows(ctx.tenantId);

  return (
    <WorkflowsClient
      workflows={workflows.map((w) => ({
        id: w.id,
        name: w.name,
        trigger: w.trigger as Record<string, unknown>,
        enabled: w.enabled,
        createdAt: w.created_at,
      }))}
    />
  );
}
