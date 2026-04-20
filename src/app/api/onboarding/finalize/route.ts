// src/app/api/onboarding/finalize/route.ts
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return new Response("Unauthorized", { status: 401 });

  const tenantId = user.user_metadata?.tenant_id;
  if (!tenantId || !z.string().uuid().safeParse(tenantId).success) {
    return Response.json({ error: "No tenant associated with this account" }, { status: 400 });
  }

  const service = createServiceClient();

  // Verify user owns the tenant before updating
  const { data: membership } = await service
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await service
    .from("tenants")
    .update({ onboarding_completed: true })
    .eq("id", tenantId);

  if (error) return Response.json({ error: "Failed to finalize" }, { status: 500 });

  return Response.json({ ok: true });
}
