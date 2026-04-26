import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Resolves the authenticated user's session and tenant membership.
 * Returns null if unauthenticated or not a tenant member.
 */
export async function resolveSession(): Promise<{ userId: string; tenantId: string } | null> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const service = createServiceClient();
  const { data } = await service
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data?.tenant_id) return null;
  return { userId: user.id, tenantId: data.tenant_id };
}

/**
 * Like resolveSession but throws "UNAUTHORIZED" instead of returning null.
 * Use in API routes that require authentication.
 */
export async function requireTenantSession(): Promise<{ userId: string; tenantId: string }> {
  const session = await resolveSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}
