import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getTenantContext } from "@/lib/tenant/context";
import { consumePendingAuth } from "@/lib/fb/pending-auth";
import { randomUUID } from "crypto";
import { invalidateCachedPage } from "@/lib/fb/page-cache";

export async function GET() {
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
  const { data: pages } = await service
    .from("tenant_pages")
    .select("id, fb_page_id, fb_page_name, fb_page_avatar, status, connected_at")
    .eq("tenant_id", tenantCtx.tenantId)
    .neq("status", "disconnected")
    .order("connected_at", { ascending: true });

  return NextResponse.json({ pages: pages ?? [] });
}

export async function POST(request: Request) {
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

  const body = await request.json();
  const selectedIds: string[] = body.pageIds;
  const fbToken: string | undefined = body.fbToken;

  if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
    return NextResponse.json(
      { error: "No pages selected" },
      { status: 400 }
    );
  }

  if (!fbToken) {
    return NextResponse.json(
      { error: "Session expired. Please authenticate with Facebook again." },
      { status: 400 }
    );
  }

  const cookieData = consumePendingAuth(fbToken);
  if (!cookieData) {
    return NextResponse.json(
      { error: "Session expired. Please authenticate with Facebook again." },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const connected: string[] = [];
  const errors: Array<{ pageId: string; error: string }> = [];

  const { data: tenant } = await service
    .from("tenants")
    .select("fb_verify_token")
    .eq("id", tenantCtx.tenantId)
    .single();

  if (!tenant?.fb_verify_token) {
    await service
      .from("tenants")
      .update({ fb_verify_token: randomUUID() })
      .eq("id", tenantCtx.tenantId);
  }

  for (const pageId of selectedIds) {
    const page = cookieData.pages.find((p) => p.id === pageId);
    if (!page) {
      errors.push({ pageId, error: "Page not found in session" });
      continue;
    }

    try {
      const subRes = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: page.access_token,
            subscribed_fields: "messages,messaging_postbacks,message_echoes,messaging_referrals,message_reads",
          }),
        }
      );

      if (!subRes.ok) {
        const subErr = await subRes.text();
        console.error(`Failed to subscribe page ${pageId}:`, subErr);
        errors.push({ pageId, error: "Failed to subscribe to webhook" });
        continue;
      }

      const { error: insertError } = await service
        .from("tenant_pages")
        .upsert(
          {
            tenant_id: tenantCtx.tenantId,
            fb_page_id: pageId,
            fb_page_name: page.name,
            fb_page_avatar: page.picture,
            fb_page_token: page.access_token,
            fb_user_token: cookieData.userAccessToken,
            status: "active",
            connected_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id,fb_page_id" }
        );

      if (insertError) {
        console.error(`Failed to insert page ${pageId}:`, insertError);
        errors.push({ pageId, error: insertError.message });
        continue;
      }

      invalidateCachedPage(pageId);
      connected.push(pageId);
    } catch (err) {
      console.error(`Error connecting page ${pageId}:`, err);
      errors.push({ pageId, error: "Unexpected error" });
    }
  }

  return NextResponse.json({ connected, errors });
}
