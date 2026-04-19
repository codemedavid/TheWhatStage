import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const schema = z.object({
  conversation_id: z.string().uuid(),
});

export async function POST(request: Request) {
  // 1. Auth check
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation error" },
      { status: 400 }
    );
  }

  const { conversation_id } = parsed.data;
  const service = createServiceClient();

  // 3. Verify tenant membership
  const { data: membership } = await service
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "No tenant membership" }, { status: 403 });
  }

  // 4. Clear pause state
  await service
    .from("conversations")
    .update({
      bot_paused_at: null,
      needs_human: false,
      escalation_reason: null,
      escalation_message_id: null,
    })
    .eq("id", conversation_id)
    .eq("tenant_id", membership.tenant_id);

  // 5. Log resume event
  await service.from("escalation_events").insert({
    conversation_id,
    tenant_id: membership.tenant_id,
    type: "bot_resumed",
    reason: "manual",
    agent_user_id: user.id,
  });

  return NextResponse.json({ success: true });
}
