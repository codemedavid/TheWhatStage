import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  // Verify user is authenticated
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appId = process.env.FB_APP_ID;
  if (!appId) {
    return NextResponse.json(
      { error: "Facebook integration not configured" },
      { status: 503 }
    );
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/settings/fb-callback`;

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: "pages_messaging,pages_show_list,pages_manage_metadata",
    response_type: "code",
    state: user.id,
  });

  const oauthUrl = `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;

  return NextResponse.json({ url: oauthUrl });
}
