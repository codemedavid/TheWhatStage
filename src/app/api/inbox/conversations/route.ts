import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  // Get tenant membership
  const { data: membership } = await service
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "No tenant membership" }, { status: 403 });
  }

  // Fetch conversations with joined lead info and last message
  // Sort: needs_human DESC (escalated first), then last_message_at DESC
  const { data: conversations, error } = await service
    .from("conversations")
    .select(
      `
      id,
      lead_id,
      last_message_at,
      needs_human,
      bot_paused_at,
      escalation_reason,
      escalation_message_id,
      leads(fb_name, fb_profile_pic),
      messages(text, created_at)
    `
    )
    .eq("tenant_id", membership.tenant_id)
    .order("needs_human", { ascending: false })
    .order("last_message_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 });
  }

  const shaped = (conversations ?? []).map((conv) => {
    // leads is a single joined row (one-to-one via lead_id FK)
    const lead = Array.isArray(conv.leads) ? conv.leads[0] : conv.leads;

    // messages is an array; pick the most recent by created_at
    const messagesArr = Array.isArray(conv.messages) ? conv.messages : [];
    const lastMsg = messagesArr.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];

    return {
      id: conv.id,
      leadId: conv.lead_id,
      leadName: lead?.fb_name ?? null,
      leadPic: lead?.fb_profile_pic ?? null,
      lastMessage: lastMsg?.text ?? null,
      lastMessageAt: conv.last_message_at,
      needsHuman: conv.needs_human,
      botPausedAt: conv.bot_paused_at,
      escalationReason: conv.escalation_reason,
      escalationMessageId: conv.escalation_message_id,
    };
  });

  return NextResponse.json({ conversations: shaped });
}
