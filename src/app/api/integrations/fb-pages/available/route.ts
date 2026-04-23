import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getTenantContext } from "@/lib/tenant/context";

const FB_PAGES_COOKIE = "fb_available_pages";

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

  const cookieStore = await cookies();
  const raw = cookieStore.get(FB_PAGES_COOKIE)?.value;

  if (!raw) {
    return NextResponse.json(
      { error: "No available pages. Please authenticate with Facebook first." },
      { status: 404 }
    );
  }

  let cookieData: {
    pages: Array<{
      id: string;
      name: string;
      access_token: string;
      category: string;
      picture: string | null;
    }>;
  };
  try {
    cookieData = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid cookie data" }, { status: 400 });
  }

  const service = createServiceClient();
  const pageIds = cookieData.pages.map((p) => p.id);
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

  const pages = cookieData.pages.map((p) => {
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
