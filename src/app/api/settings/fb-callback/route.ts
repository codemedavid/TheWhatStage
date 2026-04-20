import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { randomUUID } from "crypto";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const userId = searchParams.get("state");

  if (!code || !userId) {
    return NextResponse.redirect(
      new URL("/app/settings?fb_error=missing_params", request.url)
    );
  }

  const appId = process.env.FB_APP_ID;
  const appSecret = process.env.FB_APP_SECRET;

  if (!appId || !appSecret) {
    return NextResponse.redirect(
      new URL("/app/settings?fb_error=not_configured", request.url)
    );
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/settings/fb-callback`;

  try {
    // Exchange code for user access token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` +
        new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: redirectUri,
          code,
        }),
      { method: "GET" }
    );

    if (!tokenRes.ok) {
      console.error("FB token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(
        new URL("/app/settings?fb_error=token_exchange", request.url)
      );
    }

    const tokenData = await tokenRes.json();
    const userAccessToken = tokenData.access_token;

    // Get user's pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${userAccessToken}`
    );

    if (!pagesRes.ok) {
      console.error("FB pages fetch failed:", await pagesRes.text());
      return NextResponse.redirect(
        new URL("/app/settings?fb_error=pages_fetch", request.url)
      );
    }

    const pagesData = await pagesRes.json();
    const pages = pagesData.data;

    if (!pages || pages.length === 0) {
      return NextResponse.redirect(
        new URL("/app/settings?fb_error=no_pages", request.url)
      );
    }

    // Use the first page (most common case)
    const page = pages[0];
    const pageId = page.id;
    const pageToken = page.access_token;

    // Subscribe page to webhook events
    await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: pageToken,
          subscribed_fields: "messages,messaging_postbacks",
        }),
      }
    );

    // Update tenant with Facebook credentials
    const service = createServiceClient();
    const verifyToken = randomUUID();

    // Find user's tenant
    const { data: membership } = await service
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .eq("role", "owner")
      .maybeSingle();

    if (membership) {
      await service
        .from("tenants")
        .update({
          fb_page_id: pageId,
          fb_page_token: pageToken,
          fb_verify_token: verifyToken,
        })
        .eq("id", membership.tenant_id);
    }

    // Redirect back to settings with success
    return NextResponse.redirect(
      new URL("/app/settings?fb_connected=true", request.url)
    );
  } catch (err) {
    console.error("FB callback error:", err);
    return NextResponse.redirect(
      new URL("/app/settings?fb_error=unknown", request.url)
    );
  }
}
