import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant/context";
import DashboardNav from "@/components/dashboard/DashboardNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const tenantCtx = await getTenantContext();
  if (!tenantCtx) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen bg-[var(--ws-page)]">
      <DashboardNav tenantSlug={tenantCtx.tenantSlug} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
