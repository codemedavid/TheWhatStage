import { redirect } from "next/navigation";
import { requireTenantContext } from "@/lib/queries/tenant";
import ExperimentDetailClient from "./ExperimentDetailClient";

export default async function ExperimentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try { await requireTenantContext(); } catch { redirect("/login"); }
  const { id } = await params;
  return <ExperimentDetailClient experimentId={id} />;
}
