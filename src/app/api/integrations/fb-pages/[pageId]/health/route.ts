import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getTenantContext } from "@/lib/tenant/context";

const FB_API_VERSION = "v23.0";
const FB_BASE_URL = `https://graph.facebook.com/${FB_API_VERSION}`;

interface CheckResult {
  ok: boolean;
  detail: string;
  raw?: unknown;
}

interface HealthReport {
  pageId: string;
  fbPageId: string;
  status: string;
  checks: {
    tokenValid: CheckResult;
    appSubscribed: CheckResult;
    messagingFeatureReview: CheckResult;
  };
  recommendation: string | null;
}

async function checkToken(fbPageId: string, token: string): Promise<CheckResult> {
  try {
    const res = await fetch(
      `${FB_BASE_URL}/${fbPageId}?fields=id,name,access_token&access_token=${token}`
    );
    const body = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        detail: `Token rejected by Graph API (code=${body?.error?.code}, ${body?.error?.message ?? "unknown"})`,
        raw: body,
      };
    }
    return { ok: true, detail: `Token valid for page "${body.name}"`, raw: { id: body.id, name: body.name } };
  } catch (err) {
    return { ok: false, detail: `Network error: ${(err as Error).message}` };
  }
}

async function checkSubscribedApps(fbPageId: string, token: string): Promise<CheckResult> {
  try {
    const res = await fetch(`${FB_BASE_URL}/${fbPageId}/subscribed_apps?access_token=${token}`);
    const body = await res.json();
    if (!res.ok) {
      return { ok: false, detail: `Cannot read subscribed_apps: ${body?.error?.message ?? "unknown"}`, raw: body };
    }
    const subscriptions = (body.data ?? []) as Array<{ name?: string; subscribed_fields?: string[] }>;
    if (subscriptions.length === 0) {
      return {
        ok: false,
        detail: "Page is not subscribed to any app — webhooks won't fire. Reconnect the page.",
        raw: body,
      };
    }
    const fields = subscriptions[0]?.subscribed_fields ?? [];
    const required = ["messages", "messaging_postbacks"];
    const missing = required.filter((f) => !fields.includes(f));
    if (missing.length) {
      return {
        ok: false,
        detail: `Subscribed but missing required fields: ${missing.join(", ")}. Reconnect the page.`,
        raw: body,
      };
    }
    return { ok: true, detail: `Subscribed with fields: ${fields.join(", ")}`, raw: subscriptions };
  } catch (err) {
    return { ok: false, detail: `Network error: ${(err as Error).message}` };
  }
}

async function checkMessagingFeatureReview(
  fbPageId: string,
  token: string
): Promise<CheckResult> {
  try {
    const res = await fetch(
      `${FB_BASE_URL}/${fbPageId}/messaging_feature_review?access_token=${token}`
    );
    const body = await res.json();
    if (!res.ok) {
      // This endpoint sometimes 404s for pages without any reviewable features —
      // not necessarily a hard failure. Surface but don't fail the whole report.
      return {
        ok: true,
        detail: `messaging_feature_review unavailable (${body?.error?.message ?? res.status}). May indicate Standard Access only — App Review needed for production.`,
        raw: body,
      };
    }
    const features = (body.data ?? []) as Array<{ feature?: string; status?: string }>;
    const approved = features.filter((f) => f.status === "approved").map((f) => f.feature);
    const pending = features.filter((f) => f.status !== "approved");
    if (pending.length) {
      return {
        ok: false,
        detail: `Approved features: [${approved.join(", ") || "none"}]. Pending/rejected: ${pending
          .map((f) => `${f.feature}=${f.status}`)
          .join(", ")}`,
        raw: features,
      };
    }
    return { ok: true, detail: `All features approved: [${approved.join(", ")}]`, raw: features };
  } catch (err) {
    return { ok: false, detail: `Network error: ${(err as Error).message}` };
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const { pageId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantCtx = await getTenantContext();
  if (!tenantCtx) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: page } = await service
    .from("tenant_pages")
    .select("id, fb_page_id, fb_page_token, status")
    .eq("id", pageId)
    .eq("tenant_id", tenantCtx.tenantId)
    .maybeSingle();

  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const [tokenValid, appSubscribed, messagingFeatureReview] = await Promise.all([
    checkToken(page.fb_page_id, page.fb_page_token),
    checkSubscribedApps(page.fb_page_id, page.fb_page_token),
    checkMessagingFeatureReview(page.fb_page_id, page.fb_page_token),
  ]);

  let recommendation: string | null = null;
  if (!tokenValid.ok) {
    recommendation = "Reconnect this Facebook page — its access token is invalid or expired.";
  } else if (!appSubscribed.ok) {
    recommendation = "Reconnect this page to re-subscribe webhook fields.";
  } else if (!messagingFeatureReview.ok) {
    recommendation =
      "Submit your Meta App for App Review to gain Advanced Access on pages_messaging.";
  }

  const report: HealthReport = {
    pageId: page.id,
    fbPageId: page.fb_page_id,
    status: page.status,
    checks: { tokenValid, appSubscribed, messagingFeatureReview },
    recommendation,
  };

  return NextResponse.json(report);
}
