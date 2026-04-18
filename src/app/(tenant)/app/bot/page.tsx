import { getTenantContext } from "@/lib/tenant/context";
import { redirect } from "next/navigation";
import BotClient from "./BotClient";

export default async function BotPage() {
  const tenantCtx = await getTenantContext();
  if (!tenantCtx) redirect("/login");

  return <BotClient />;
}
