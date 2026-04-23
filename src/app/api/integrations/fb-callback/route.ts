import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";

const FB_PAGES_COOKIE = "fb_available_pages";
const COOKIE_MAX_AGE = 600; // 10 minutes

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const stateRaw = searchParams.get("state");

  if (!code || !stateRaw) {
    return NextResponse.redirect(
      new URL("/app/integrations?fb_error=missing_params", request.url)
    );
  }

  let state: { userId: string; source: string };
  try {
    state = JSON.parse(stateRaw);
  } catch {
    return NextResponse.redirect(
      new URL("/app/integrations?fb_error=invalid_state", request.url)
    );
  }

  const appId = process.env.FB_APP_ID;
  const appSecret = process.env.FB_APP_SECRET;

  if (!appId || !appSecret) {
    return NextResponse.redirect(
      new URL("/app/integrations?fb_error=not_configured", request.url)
    );
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/integrations/fb-callback`;

  try {
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
        new URL("/app/integrations?fb_error=token_exchange", request.url)
      );
    }

    const tokenData = await tokenRes.json();
    const shortLivedToken = tokenData.access_token;

    const longLivedRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` +
        new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: shortLivedToken,
        }),
      { method: "GET" }
    );

    const longLivedData = await longLivedRes.json();
    const userAccessToken = longLivedData.access_token ?? shortLivedToken;

    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?` +
        new URLSearchParams({
          access_token: userAccessToken,
          fields: "id,name,access_token,category,picture{url}",
        })
    );

    if (!pagesRes.ok) {
      console.error("FB pages fetch failed:", await pagesRes.text());
      return NextResponse.redirect(
        new URL("/app/integrations?fb_error=pages_fetch", request.url)
      );
    }

    const pagesData = await pagesRes.json();
    const pages = pagesData.data;

    if (!pages || pages.length === 0) {
      return NextResponse.redirect(
        new URL("/app/integrations?fb_error=no_pages", request.url)
      );
    }

    const cookiePayload = JSON.stringify({
      userAccessToken,
      pages: pages.map((p: Record<string, unknown>) => ({
        id: p.id,
        name: p.name,
        access_token: p.access_token,
        category: p.category,
        picture: (p.picture as { data?: { url?: string } })?.data?.url ?? null,
      })),
    });

    const cookieStore = await cookies();
    cookieStore.set(FB_PAGES_COOKIE, cookiePayload, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
      sameSite: "lax",
    });

    const selectUrl =
      state.source === "onboarding"
        ? "/onboarding?step=facebook"
        : "/app/integrations/select-pages";

    return NextResponse.redirect(new URL(selectUrl, request.url));
  } catch (err) {
    console.error("FB callback error:", err);
    return NextResponse.redirect(
      new URL("/app/integrations?fb_error=unknown", request.url)
    );
  }
}
