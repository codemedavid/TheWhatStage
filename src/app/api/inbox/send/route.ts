import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendMessage, FacebookUnreachableLeadError, FacebookTokenError } from "@/lib/fb/send";
import { markLeadUnreachable } from "@/lib/fb/lead-reachability";

const SendSchema = z
  .object({
    conversation_id: z.string().uuid(),
    message: z.string().min(1).optional(),
    image_url: z.string().url().optional(),
  })
  .refine((data) => data.message || data.image_url, {
    message: "At least one of message or image_url must be provided",
  });

export async function POST(req: NextRequest) {
  // 1. Auth
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse + validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = SendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation error" },
      { status: 400 }
    );
  }

  const { conversation_id, message, image_url } = parsed.data;
  const service = createServiceClient();

  // 3. Get tenant membership
  const { data: membership } = await service
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "No tenant membership" }, { status: 403 });
  }

  // 4. Get conversation (verify ownership)
  const { data: conversation } = await service
    .from("conversations")
    .select("id, lead_id, bot_paused_at, tenant_id")
    .eq("id", conversation_id)
    .eq("tenant_id", membership.tenant_id)
    .maybeSingle();

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // 5. Get lead PSID
  const { data: lead } = await service
    .from("leads")
    .select("psid")
    .eq("id", conversation.lead_id)
    .maybeSingle();

  if (!lead?.psid) {
    return NextResponse.json({ error: "Lead has no PSID" }, { status: 400 });
  }

  // 6. Get page token
  const { data: tenant } = await service
    .from("tenants")
    .select("fb_page_token")
    .eq("id", membership.tenant_id)
    .maybeSingle();

  if (!tenant?.fb_page_token) {
    return NextResponse.json({ error: "Facebook page not connected" }, { status: 400 });
  }

  // 7. Send via Messenger
  let messageId: string;
  try {
    if (message) {
      const result = await sendMessage(lead.psid, { type: "text", text: message }, tenant.fb_page_token);
      messageId = result.messageId;
    } else {
      const result = await sendMessage(lead.psid, { type: "image", url: image_url! }, tenant.fb_page_token);
      messageId = result.messageId;
    }
  } catch (err) {
    if (err instanceof FacebookUnreachableLeadError) {
      await markLeadUnreachable(service, conversation.lead_id, err);
      return NextResponse.json(
        {
          error: "Lead can't be reached via Messenger.",
          error_code: "lead_unreachable",
          reason: err.reason,
          fb_code: err.fbCode,
          fb_subcode: err.fbSubcode,
          hint:
            err.reason === "outside_messaging_window"
              ? "The 24-hour standard messaging window has expired. Use a message tag or wait for the lead to message first."
              : "Your Facebook app likely lacks Advanced Access for `pages_messaging`. Submit for App Review, or add this user as a Tester in the Meta App Dashboard.",
        },
        { status: 422 }
      );
    }
    if (err instanceof FacebookTokenError) {
      return NextResponse.json(
        { error: "Facebook page token is invalid or expired. Please reconnect the page.", error_code: "page_token_invalid" },
        { status: 401 }
      );
    }
    console.error("Inbox send: unexpected FB error", err);
    return NextResponse.json({ error: "Failed to send message via Messenger" }, { status: 502 });
  }

  // 8. Store message
  const { data: storedMessage } = await service.from("messages").insert({
    conversation_id,
    direction: "out",
    text: message ?? null,
    attachments: image_url ? [{ type: "image", url: image_url }] : null,
    mid: messageId,
  }).select("id").single();

  // 9. Log lead event
  await service.from("lead_events").insert({
    lead_id: conversation.lead_id,
    tenant_id: membership.tenant_id,
    type: "message_out",
    payload: {
      message_id: storedMessage?.id ?? messageId,
      sent_by: "human",
      agent_user_id: user.id,
    },
  });

  // 10-11. Update conversation + auto-pause
  const now = new Date().toISOString();

  if (!conversation.bot_paused_at) {
    // First human reply — pause bot and log escalation
    await service
      .from("conversations")
      .update({ bot_paused_at: now, last_message_at: now })
      .eq("id", conversation_id);

    await service.from("escalation_events").insert({
      conversation_id,
      tenant_id: membership.tenant_id,
      type: "agent_took_over",
      agent_user_id: user.id,
    });
  } else {
    // Bot already paused — just update timestamp
    await service
      .from("conversations")
      .update({ last_message_at: now })
      .eq("id", conversation_id);
  }

  // 12. Return success
  return NextResponse.json({ success: true, messageId });
}
