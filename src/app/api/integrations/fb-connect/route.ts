import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

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

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") ?? "integrations";

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/integrations/fb-callback`;

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: "pages_messaging,pages_show_list,pages_manage_metadata",
    response_type: "code",
    state: JSON.stringify({ userId: user.id, source }),
  });

  const oauthUrl = `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;

  return NextResponse.json({ url: oauthUrl });
}
