import { redirect } from "next/navigation";
import { requireTenantContext } from "@/lib/queries/tenant";
import ExperimentsClient from "./ExperimentsClient";

export default async function ExperimentsPage() {
  try { await requireTenantContext(); } catch { redirect("/login"); }
  return <ExperimentsClient />;
}
