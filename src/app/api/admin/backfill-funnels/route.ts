/**
 * One-shot backfill endpoint: creates a default action_page + a single
 * campaign_funnel for any active campaign that has zero funnels.
 *
 * Without this, campaigns created before the funnel refactor (or via the
 * legacy POST /api/campaigns route) silently pause every conversation in the
 * engine because conversation-engine.ts:139 returns when funnels.length === 0.
 *
 * Auth: Bearer ${CRON_SECRET} — same gate the drop-off cron uses, so this can
 * be triggered from a one-off curl or scheduled once.
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { defaultRulesForPageType, type ActionPageType } from "@/lib/ai/funnel-templates";

// action_pages.type is constrained by the DB enum to: form | calendar | sales | product_catalog | checkout.
// (funnel-templates.ts has an extra "qualification" type that lives only in the chat-rules layer, not in action_pages.)
type StorablePageType = "form" | "calendar" | "sales" | "product_catalog" | "checkout";
type MainAction = "form" | "appointment" | "purchase" | "sales_page" | "call" | null | undefined;

const MAIN_ACTION_TO_PAGE_TYPE: Record<NonNullable<MainAction>, StorablePageType> = {
  form: "form",
  appointment: "calendar",
  purchase: "checkout",
  sales_page: "sales",
  call: "calendar",
};

const ACTION_PAGE_TITLES: Record<StorablePageType, string> = {
  form: "Lead Capture Form",
  calendar: "Book a Call",
  sales: "Sales Page",
  product_catalog: "Product Catalog",
  checkout: "Checkout",
};

function pageTypeFor(mainAction: MainAction): StorablePageType {
  if (mainAction && MAIN_ACTION_TO_PAGE_TYPE[mainAction]) {
    return MAIN_ACTION_TO_PAGE_TYPE[mainAction];
  }
  return "form";
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  const { data: campaigns, error: campErr } = await service
    .from("campaigns")
    .select("id, tenant_id, name, description")
    .eq("status", "active");
  if (campErr) {
    return NextResponse.json({ error: `Campaign load failed: ${campErr.message}` }, { status: 500 });
  }

  const results: Array<{ campaignId: string; tenantId: string; status: "skipped" | "seeded" | "error"; reason?: string }> = [];

  for (const c of campaigns ?? []) {
    const campaignId = c.id as string;
    const tenantId = c.tenant_id as string;

    const { count: funnelCount, error: countErr } = await service
      .from("campaign_funnels")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId);
    if (countErr) {
      results.push({ campaignId, tenantId, status: "error", reason: countErr.message });
      continue;
    }
    if ((funnelCount ?? 0) > 0) {
      results.push({ campaignId, tenantId, status: "skipped", reason: "already has funnels" });
      continue;
    }

    const { data: tenant } = await service
      .from("tenants")
      .select("main_action, name")
      .eq("id", tenantId)
      .single();
    const mainAction: MainAction = (tenant as { main_action?: MainAction } | null)?.main_action ?? null;
    const tenantName = (tenant as { name?: string } | null)?.name ?? "this business";
    const pageType = pageTypeFor(mainAction);
    const pageTitle = ACTION_PAGE_TITLES[pageType];

    // Reuse an existing action page of this type if one already exists for the tenant.
    let actionPageId: string | null = null;
    const { data: existingPages } = await service
      .from("action_pages")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("type", pageType)
      .limit(1);
    if (existingPages && existingPages.length > 0) {
      actionPageId = existingPages[0].id as string;
    } else {
      const { data: newPage, error: pageErr } = await service
        .from("action_pages")
        .insert({
          tenant_id: tenantId,
          slug: `${pageType.replace(/_/g, "-")}-backfill-${campaignId.slice(0, 8)}`,
          type: pageType,
          title: pageTitle,
          config: {},
          published: false,
        })
        .select("id")
        .single();
      if (pageErr || !newPage) {
        results.push({ campaignId, tenantId, status: "error", reason: pageErr?.message ?? "page insert failed" });
        continue;
      }
      actionPageId = newPage.id as string;
    }

    const { error: funnelErr } = await service.from("campaign_funnels").insert({
      campaign_id: campaignId,
      tenant_id: tenantId,
      position: 0,
      action_page_id: actionPageId,
      page_description: `${pageTitle} for ${tenantName}.`,
      pitch: (c.description as string | null) ?? null,
      qualification_questions: [] as string[],
      chat_rules: defaultRulesForPageType(pageType as ActionPageType),
    });
    if (funnelErr) {
      results.push({ campaignId, tenantId, status: "error", reason: funnelErr.message });
      continue;
    }

    results.push({ campaignId, tenantId, status: "seeded" });
  }

  const summary = {
    total: results.length,
    seeded: results.filter((r) => r.status === "seeded").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    error: results.filter((r) => r.status === "error").length,
  };

  return NextResponse.json({ summary, results }, { status: 200 });
}
