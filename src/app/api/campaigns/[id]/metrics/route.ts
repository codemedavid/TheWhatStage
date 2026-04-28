import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveSession } from "@/lib/auth/session";
import { listFunnelsForCampaign } from "@/lib/db/campaign-funnels";

type RouteContext = { params: Promise<{ id: string }> };

const DROP_OFF_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function GET(_request: Request, context: RouteContext) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = session;

  const { id: campaignId } = await context.params;
  const service = createServiceClient();

  // Load funnels (ordered by position ascending)
  let funnels;
  try {
    funnels = await listFunnelsForCampaign(service, campaignId);
  } catch {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (funnels.length === 0) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Verify tenant ownership via the first funnel's tenantId
  if (funnels[0].tenantId !== tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Load all conversations currently assigned to this campaign (for this tenant)
  const { data: convRows } = await service
    .from("conversations")
    .select(
      "id, current_funnel_id, current_funnel_position, bot_paused_at, last_message_at, funnel_message_count"
    )
    .eq("current_campaign_id", campaignId)
    .eq("tenant_id", tenantId);

  const conversations = convRows ?? [];
  const now = Date.now();

  // Build action_page_id → funnel map for submission lookups
  const actionPageIds = funnels
    .map((f) => f.actionPageId)
    .filter((id): id is string => id != null);

  // Load action page titles for display names
  const { data: actionPageRows } = await service
    .from("action_pages")
    .select("id, title")
    .in("id", actionPageIds.length > 0 ? actionPageIds : ["00000000-0000-0000-0000-000000000000"]);

  const actionPageTitleMap = new Map<string, string>(
    (actionPageRows ?? []).map((ap) => [ap.id, ap.title])
  );

  // Load action_submissions counts per action_page_id (conversion signal)
  // action_submissions doesn't have a campaign_id column so we filter by
  // action_page_id + tenant_id — this is a best-effort approximation.
  // TODO: once action_submissions gains a campaign_id column, filter by it too.
  const { data: submissionRows } = await service
    .from("action_submissions")
    .select("action_page_id")
    .eq("tenant_id", tenantId)
    .in(
      "action_page_id",
      actionPageIds.length > 0 ? actionPageIds : ["00000000-0000-0000-0000-000000000000"]
    );

  const submissionCountMap = new Map<string, number>();
  for (const row of submissionRows ?? []) {
    submissionCountMap.set(
      row.action_page_id,
      (submissionCountMap.get(row.action_page_id) ?? 0) + 1
    );
  }

  // Compute per-funnel metrics
  const funnelMetrics = funnels.map((funnel) => {
    // reached_count: conversations that have reached or passed this funnel step
    const reached = conversations.filter(
      (c) => c.current_funnel_position >= funnel.position
    );
    const entered = reached.length;

    // active_count: currently on this exact funnel step and bot not paused
    const active = conversations.filter(
      (c) =>
        c.current_funnel_id === funnel.id &&
        c.bot_paused_at == null
    );

    // advanced_count: moved past this step (position strictly greater)
    const advanced = conversations.filter(
      (c) => c.current_funnel_position > funnel.position
    ).length;

    // drop_off_count: on this step, bot not paused, but last activity > 24 h ago
    const dropped = active.filter(
      (c) =>
        now - new Date(c.last_message_at).getTime() > DROP_OFF_THRESHOLD_MS
    ).length;

    const inProgress = active.length - dropped;

    // conversion_count from action_submissions for this funnel's action page
    const conversionCount = funnel.actionPageId
      ? (submissionCountMap.get(funnel.actionPageId) ?? 0)
      : 0;

    const successRate = entered > 0 ? advanced / entered : 0;

    // avg_messages: average funnel_message_count for conversations on this step
    const activeConvs = conversations.filter(
      (c) => c.current_funnel_id === funnel.id
    );
    const avgMessages =
      activeConvs.length > 0
        ? activeConvs.reduce((sum, c) => sum + (c.funnel_message_count ?? 0), 0) /
          activeConvs.length
        : 0;

    return {
      // Keep response shape identical to legacy so the client needs no changes
      phase_id: funnel.id,
      name: (funnel.actionPageId && actionPageTitleMap.get(funnel.actionPageId)) ||
        `Funnel step ${funnel.position + 1}`,
      order_index: funnel.position,
      entered,
      advanced,
      dropped,
      in_progress: Math.max(0, inProgress),
      success_rate: successRate,
      avg_messages: Math.round(avgMessages * 10) / 10,
      // avg_time_minutes: not directly trackable from funnel state; always 0
      // TODO: add entered_at / exited_at timestamps to conversations to compute this
      avg_time_minutes: 0,
      // Extra field for conversion signal (not consumed by current client)
      conversion_count: conversionCount,
    };
  });

  // Summary
  const { data: totalLeadsData } = await service
    .from("lead_campaign_assignments")
    .select("id", { count: "exact" })
    .eq("campaign_id", campaignId);

  const { data: conversionsData } = await service
    .from("campaign_conversions")
    .select("id", { count: "exact" })
    .eq("campaign_id", campaignId);

  const totalLeads = totalLeadsData?.length ?? 0;
  const totalConversions = conversionsData?.length ?? 0;

  const highestDropOff = funnelMetrics.reduce(
    (max, p) => {
      const dropRate = p.entered > 0 ? p.dropped / p.entered : 0;
      return dropRate > max.rate ? { name: p.name, rate: dropRate } : max;
    },
    { name: "", rate: 0 }
  );

  return NextResponse.json({
    summary: {
      total_leads: totalLeads,
      total_conversions: totalConversions,
      conversion_rate: totalLeads > 0 ? totalConversions / totalLeads : 0,
      highest_drop_off: highestDropOff.name || null,
      highest_drop_off_rate: highestDropOff.rate,
    },
    phases: funnelMetrics,
  });
}
