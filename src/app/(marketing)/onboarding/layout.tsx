import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildTenantUrl } from "@/lib/auth/redirect";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Redirect already-onboarded users to their dashboard
  const tenantId = user.user_metadata?.tenant_id as string | undefined;
  if (tenantId) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("slug, onboarding_completed")
      .eq("id", tenantId)
      .single();
    if (tenant?.onboarding_completed) {
      redirect(buildTenantUrl(tenant.slug));
    }
  }

  return <>{children}</>;
}
