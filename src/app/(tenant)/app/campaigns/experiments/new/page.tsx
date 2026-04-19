import { redirect } from "next/navigation";
import { requireTenantContext } from "@/lib/queries/tenant";
import NewExperimentClient from "./NewExperimentClient";

export default async function NewExperimentPage() {
  try { await requireTenantContext(); } catch { redirect("/login"); }
  return <NewExperimentClient />;
}
