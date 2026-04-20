import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant/context";
import DashboardNav from "@/components/dashboard/DashboardNav";
import FacebookConnectBanner from "@/components/dashboard/FacebookConnectBanner";

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

  const { data: tenant } = await supabase
    .from("tenants")
    .select("fb_page_id, onboarding_completed")
    .eq("id", tenantCtx.tenantId)
    .single();

  return (
    <div className="flex h-screen bg-[var(--ws-page)]">
      <DashboardNav tenantSlug={tenantCtx.tenantSlug} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <FacebookConnectBanner
          fbPageId={tenant?.fb_page_id ?? null}
          onboardingCompleted={tenant?.onboarding_completed ?? false}
        />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
