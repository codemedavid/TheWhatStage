import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getTenantContext } from "@/lib/tenant/context";
import { peekPendingAuth } from "@/lib/fb/pending-auth";

export async function GET(request: NextRequest) {
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

  const token = request.nextUrl.searchParams.get("fb_token");
  if (!token) {
    return NextResponse.json(
      { error: "No available pages. Please authenticate with Facebook first." },
      { status: 404 }
    );
  }

  const pending = peekPendingAuth(token);
  if (!pending) {
    return NextResponse.json(
      { error: "Session expired. Please authenticate with Facebook again." },
      { status: 404 }
    );
  }

  const service = createServiceClient();
  const pageIds = pending.pages.map((p) => p.id);
  const { data: existingPages } = await service
    .from("tenant_pages")
    .select("fb_page_id, tenant_id, status")
    .in("fb_page_id", pageIds);

  const existingMap = new Map(
    (existingPages ?? []).map((p) => [
      p.fb_page_id,
      { tenantId: p.tenant_id, status: p.status },
    ])
  );

  const pages = pending.pages.map((p) => {
    const existing = existingMap.get(p.id);
    let availability: "available" | "connected_here" | "connected_other" =
      "available";
    if (existing) {
      availability =
        existing.tenantId === tenantCtx.tenantId
          ? "connected_here"
          : "connected_other";
    }
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      picture: p.picture,
      availability,
    };
  });

  return NextResponse.json({ pages });
}
