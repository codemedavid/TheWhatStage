import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getTenantContext } from "@/lib/tenant/context";
import { invalidateCachedPage } from "@/lib/fb/page-cache";

export async function DELETE(
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
    .select("id, fb_page_id, fb_page_token")
    .eq("id", pageId)
    .eq("tenant_id", tenantCtx.tenantId)
    .single();

  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  try {
    await fetch(
      `https://graph.facebook.com/v21.0/${page.fb_page_id}/subscribed_apps`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: page.fb_page_token }),
      }
    );
  } catch (err) {
    console.warn("Failed to unsubscribe page webhook:", err);
  }

  await service
    .from("tenant_pages")
    .update({ status: "disconnected" })
    .eq("id", pageId)
    .eq("tenant_id", tenantCtx.tenantId);

  invalidateCachedPage(page.fb_page_id);

  return NextResponse.json({ success: true });
}
