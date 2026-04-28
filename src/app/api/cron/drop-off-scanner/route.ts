import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendMessage, FacebookTokenError, FacebookUnreachableLeadError } from "@/lib/fb/send";

// Default threshold: send a follow-up if no inbound message for this many hours.
const DEFAULT_THRESHOLD_HOURS = 24;
const DEFAULT_FOLLOW_UP_MESSAGE =
  "Hey! Just checking in — let me know if you have any questions or want to continue. 😊";

export async function POST(request: Request) {
  // Verify Vercel Cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const thresholdMs = DEFAULT_THRESHOLD_HOURS * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - thresholdMs).toISOString();

  // -----------------------------------------------------------------------
  // Find conversations that are stuck in a funnel step:
  //   - currently assigned to a funnel (current_funnel_id IS NOT NULL)
  //   - bot is not paused (bot_paused_at IS NULL)
  //   - last overall message older than threshold (last_message_at < cutoff)
  //   - no follow-up already sent within this threshold window
  //     (last_follow_up_at IS NULL OR last_follow_up_at < cutoff)
  //
  // We join campaigns via current_campaign_id to get follow_up_message and
  // follow_up_delay_minutes (overrides default threshold when set).
  // We join leads and tenants for psid and fb_page_token.
  // -----------------------------------------------------------------------
  const { data: stuck, error } = await supabase
    .from("conversations")
    .select(`
      id,
      lead_id,
      tenant_id,
      last_message_at,
      last_follow_up_at,
      current_campaign_id,
      campaigns!conversations_current_campaign_id_fkey(
        follow_up_delay_minutes,
        follow_up_message
      ),
      leads!inner(psid),
      tenants!inner(fb_page_token)
    `)
    .not("current_funnel_id", "is", null)
    .is("bot_paused_at", null)
    .lt("last_message_at", cutoff)
    .or(`last_follow_up_at.is.null,last_follow_up_at.lt.${cutoff}`);

  if (error) {
    console.error("[drop-off-scanner] query error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!stuck || stuck.length === 0) {
    return NextResponse.json({ success: true, processed: 0 });
  }

  let processed = 0;
  let skipped = 0;

  for (const row of stuck) {
    const leads = row.leads as unknown as { psid: string };
    const tenants = row.tenants as unknown as { fb_page_token: string | null };
    const campaign = row.campaigns as unknown as {
      follow_up_delay_minutes: number;
      follow_up_message: string | null;
    } | null;

    // Skip if we have no page token to send with.
    if (!tenants.fb_page_token) {
      console.warn(`[drop-off-scanner] conversation ${row.id}: missing fb_page_token, skipping`);
      skipped++;
      continue;
    }

    // Respect campaign-level delay if it's stricter than default.
    if (campaign?.follow_up_delay_minutes) {
      const campaignThresholdMs = campaign.follow_up_delay_minutes * 60 * 1000;
      const lastMessageAge = Date.now() - new Date(row.last_message_at).getTime();
      if (lastMessageAge < campaignThresholdMs) {
        skipped++;
        continue;
      }
    }

    const followUpText = campaign?.follow_up_message ?? DEFAULT_FOLLOW_UP_MESSAGE;

    try {
      await sendMessage(
        leads.psid,
        { type: "text", text: followUpText },
        tenants.fb_page_token
      );

      // Stamp last_follow_up_at to prevent re-sending within the threshold window.
      const { error: updateError } = await supabase
        .from("conversations")
        .update({ last_follow_up_at: new Date().toISOString() })
        .eq("id", row.id);

      if (updateError) {
        console.error(`[drop-off-scanner] failed to stamp last_follow_up_at for ${row.id}:`, updateError.message);
      }

      // Log a lead_event so the activity timeline shows the follow-up.
      await supabase.from("lead_events").insert({
        tenant_id: row.tenant_id,
        lead_id: row.lead_id,
        type: "message_out",
        payload: {
          source: "drop_off_scanner",
          text: followUpText,
          conversation_id: row.id,
        },
      });

      processed++;
    } catch (err) {
      if (err instanceof FacebookTokenError) {
        console.error(`[drop-off-scanner] conversation ${row.id}: invalid page token`);
      } else if (err instanceof FacebookUnreachableLeadError) {
        console.warn(`[drop-off-scanner] conversation ${row.id}: lead unreachable — ${err.reason}`);
      } else {
        console.error(`[drop-off-scanner] conversation ${row.id}:`, err);
      }
      skipped++;
    }
  }

  return NextResponse.json({ success: true, processed, skipped });
}
