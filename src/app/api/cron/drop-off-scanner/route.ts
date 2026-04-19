import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  // Verify Vercel Cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Find open conversation phases that haven't received a follow-up yet
  const { data: needsFollowUp } = await supabase
    .from("conversation_phases")
    .select(`
      id,
      conversation_id,
      entered_at,
      follow_ups_sent_at,
      conversations!inner(
        id,
        lead_id,
        tenant_id,
        last_message_at,
        leads!inner(psid),
        tenants!inner(fb_page_token)
      )
    `)
    .is("exited_at", null)
    .is("follow_ups_sent_at", null);

  if (needsFollowUp) {
    for (const row of needsFollowUp) {
      const conv = row.conversations as unknown as {
        lead_id: string;
        tenant_id: string;
        last_message_at: string;
        leads: { psid: string };
        tenants: { fb_page_token: string };
      };

      const { data: assignment } = await supabase
        .from("lead_campaign_assignments")
        .select("campaign_id, campaigns(follow_up_delay_minutes, follow_up_message)")
        .eq("lead_id", conv.lead_id)
        .single();

      if (!assignment?.campaigns) continue;

      const campaign = assignment.campaigns as unknown as {
        follow_up_delay_minutes: number;
        follow_up_message: string | null;
      };

      if (!campaign.follow_up_message) continue;

      const delayMs = campaign.follow_up_delay_minutes * 60 * 1000;
      const lastMessageTime = new Date(conv.last_message_at).getTime();
      const now = Date.now();

      if (now - lastMessageTime < delayMs) continue;

      try {
        const fbResponse = await fetch(
          `https://graph.facebook.com/v18.0/me/messages?access_token=${conv.tenants.fb_page_token}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipient: { id: conv.leads.psid },
              message: { text: campaign.follow_up_message },
            }),
          }
        );

        if (fbResponse.ok) {
          await supabase
            .from("conversation_phases")
            .update({ follow_ups_sent_at: new Date().toISOString() })
            .eq("id", row.id);
        }
      } catch {
        // Log but don't fail the whole cron
      }
    }
  }

  // Mark as dropped if follow-up was sent and still no reply
  const { data: needsDrop } = await supabase
    .from("conversation_phases")
    .select(`
      id,
      follow_ups_sent_at,
      conversations!inner(
        lead_id,
        last_message_at
      )
    `)
    .is("exited_at", null)
    .not("follow_ups_sent_at", "is", null);

  if (needsDrop) {
    for (const row of needsDrop) {
      const conv = row.conversations as unknown as {
        lead_id: string;
        last_message_at: string;
      };

      const { data: assignment } = await supabase
        .from("lead_campaign_assignments")
        .select("campaigns(follow_up_delay_minutes)")
        .eq("lead_id", conv.lead_id)
        .single();

      if (!assignment?.campaigns) continue;

      const campaign = assignment.campaigns as unknown as { follow_up_delay_minutes: number };
      const delayMs = campaign.follow_up_delay_minutes * 60 * 1000;
      const followUpTime = new Date(row.follow_ups_sent_at!).getTime();
      const lastMessage = new Date(conv.last_message_at).getTime();

      if (lastMessage < followUpTime && Date.now() - followUpTime > delayMs) {
        await supabase
          .from("conversation_phases")
          .update({
            exited_at: new Date().toISOString(),
            exit_reason: "dropped",
          })
          .eq("id", row.id);
      }
    }
  }

  return NextResponse.json({ success: true });
}
