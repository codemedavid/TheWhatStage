import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 });
  }

  const service = createServiceClient();
  const { data: actionPages, error } = await service
    .from("action_pages")
    .select("id, title, type, slug")
    .eq("tenant_id", tenantId)
    .order("title", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch action pages" }, { status: 500 });
  }

  return NextResponse.json({ actionPages: actionPages ?? [] });
}
