// src/app/api/onboarding/finalize/route.ts
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
  if (!tenantId) return Response.json({ error: "No tenant found" }, { status: 400 });

  const service = createServiceClient();
  const { error } = await service
    .from("tenants")
    .update({ onboarding_completed: true })
    .eq("id", tenantId);

  if (error) return Response.json({ error: "Failed to finalize" }, { status: 500 });

  return Response.json({ ok: true });
}
