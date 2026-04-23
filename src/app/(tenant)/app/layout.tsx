import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getTenantContext } from "@/lib/tenant/context";
import DashboardNav from "@/components/dashboard/DashboardNav";
import FacebookConnectBanner from "@/components/dashboard/FacebookConnectBanner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const [{ data: { user } }, tenantCtx] = await Promise.all([
    supabase.auth.getUser(),
    getTenantContext(),
  ]);

  if (!user) {
    redirect("/login");
  }

  if (!tenantCtx) {
    redirect("/login");
  }

  const serviceClient = createServiceClient();

  const [{ data: membership }, { data: tenant }, { count: activeCount }, { count: expiredCount }] =
    await Promise.all([
      serviceClient
        .from("tenant_members")
        .select("user_id")
        .eq("user_id", user.id)
        .eq("tenant_id", tenantCtx.tenantId)
        .maybeSingle(),
      serviceClient
        .from("tenants")
        .select("onboarding_completed")
        .eq("id", tenantCtx.tenantId)
        .single(),
      serviceClient
        .from("tenant_pages")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantCtx.tenantId)
        .eq("status", "active"),
      serviceClient
        .from("tenant_pages")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantCtx.tenantId)
        .eq("status", "token_expired"),
    ]);

  if (!membership) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen bg-[var(--ws-page)]">
      <DashboardNav tenantSlug={tenantCtx.tenantSlug} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <FacebookConnectBanner
          hasActivePages={(activeCount ?? 0) > 0}
          hasExpiredPages={(expiredCount ?? 0) > 0}
          onboardingCompleted={tenant?.onboarding_completed ?? false}
        />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
