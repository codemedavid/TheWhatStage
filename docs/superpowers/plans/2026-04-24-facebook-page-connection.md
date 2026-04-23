# Facebook Multi-Page Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable tenants to connect one or more Facebook Pages via OAuth, manage them from a dedicated Integrations page, and route all webhook messages through a `tenant_pages` table with in-memory caching for high-throughput performance.

**Architecture:** New `tenant_pages` table replaces single-page columns on `tenants`. Shared webhook handler resolves tenant via page ID lookup with module-level cache. New `/api/integrations/*` API routes replace the split onboarding/settings FB routes. New `/app/integrations` dashboard page for page management. Onboarding wizard gets a Facebook step.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS), Facebook Graph API v21.0, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-24-facebook-page-connection-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/0015_tenant_pages.sql` | Create `tenant_pages` table, indexes, RLS, add `page_id` to leads, migrate existing data |
| `src/lib/fb/page-cache.ts` | In-memory page→tenant cache with TTL for webhook lookups |
| `src/app/api/integrations/fb-connect/route.ts` | Initiate Facebook OAuth redirect |
| `src/app/api/integrations/fb-callback/route.ts` | Handle OAuth callback, store pages in cookie, redirect to selection UI |
| `src/app/api/integrations/fb-pages/route.ts` | GET: list connected pages; POST: connect selected pages |
| `src/app/api/integrations/fb-pages/[pageId]/route.ts` | DELETE: disconnect a page |
| `src/app/api/integrations/fb-pages/available/route.ts` | GET: read available pages from cookie for selection UI |
| `src/app/api/integrations/fb-pages/stats/route.ts` | GET: per-page stats (lead count, message count) |
| `src/lib/queries/tenant-pages.ts` | Query helpers for tenant_pages (list, stats, status checks) |
| `src/app/(tenant)/app/integrations/page.tsx` | Server component for Integrations page |
| `src/app/(tenant)/app/integrations/IntegrationsClient.tsx` | Client component for managing connected pages |
| `src/app/(tenant)/app/integrations/select-pages/page.tsx` | Server component for page selection after OAuth |
| `src/app/(tenant)/app/integrations/select-pages/SelectPagesClient.tsx` | Client component for page checklist UI |

### Modified Files

| File | Change |
|------|--------|
| `src/app/api/fb/webhook/route.ts` | Refactor to use `tenant_pages` + page cache instead of `tenants` table |
| `src/lib/fb/send.ts` | Add token expiry detection (error code 190) |
| `src/components/dashboard/DashboardNav.tsx` | Add "Integrations" nav item |
| `src/components/dashboard/FacebookConnectBanner.tsx` | Update to handle multi-page + token expiry states |
| `src/app/(tenant)/app/layout.tsx` | Fetch `tenant_pages` status for banner |
| `src/app/(tenant)/app/settings/SettingsClient.tsx` | Replace Facebook section with link to Integrations |
| `src/lib/onboarding/types.ts` | Add "facebook" step to onboarding |
| `src/components/onboarding/OnboardingWizard.tsx` | Wire FacebookStep into wizard |
| `src/lib/queries/tenant.ts` | Keep as-is (still needed for non-FB tenant data) |

### Deleted Files

| File | Reason |
|------|--------|
| `src/app/api/onboarding/fb-connect/route.ts` | Replaced by `/api/integrations/fb-connect` |
| `src/app/api/onboarding/fb-callback/route.ts` | Replaced by `/api/integrations/fb-callback` |
| `src/app/api/settings/fb-connect/route.ts` | Replaced by `/api/integrations/fb-connect` |
| `src/app/api/settings/fb-callback/route.ts` | Replaced by `/api/integrations/fb-callback` |

---

## Task 1: Database Migration — `tenant_pages` Table

**Files:**
- Create: `supabase/migrations/0015_tenant_pages.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0015_tenant_pages.sql
-- Multi-page Facebook connection support

-- 1. Create tenant_pages table
CREATE TABLE tenant_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fb_page_id text NOT NULL,
  fb_page_name text,
  fb_page_avatar text,
  fb_page_token text NOT NULL,
  fb_user_token text,
  status text NOT NULL DEFAULT 'active',
  connected_at timestamptz NOT NULL DEFAULT now(),
  token_refreshed_at timestamptz,

  CONSTRAINT unique_page_per_tenant UNIQUE (tenant_id, fb_page_id),
  CONSTRAINT unique_page_global UNIQUE (fb_page_id)
);

-- 2. Performance indexes
CREATE INDEX idx_tenant_pages_fb_page_id_active
  ON tenant_pages(fb_page_id) WHERE status = 'active';

CREATE INDEX idx_tenant_pages_tenant_id
  ON tenant_pages(tenant_id);

-- 3. Enable RLS
ALTER TABLE tenant_pages ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies
CREATE POLICY tenant_pages_select ON tenant_pages
  FOR SELECT USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_pages_insert ON tenant_pages
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tenant_pages_update ON tenant_pages
  FOR UPDATE USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_pages_delete ON tenant_pages
  FOR DELETE USING (tenant_id = current_tenant_id());

-- 5. Add page_id to leads
ALTER TABLE leads ADD COLUMN page_id uuid REFERENCES tenant_pages(id);
CREATE INDEX idx_leads_page_id ON leads(page_id);

-- 6. Migrate existing single-page data into tenant_pages
INSERT INTO tenant_pages (tenant_id, fb_page_id, fb_page_token, status)
SELECT id, fb_page_id, fb_page_token, 'active'
FROM tenants
WHERE fb_page_id IS NOT NULL AND fb_page_token IS NOT NULL;

-- 7. Backfill leads.page_id from migrated tenant_pages
UPDATE leads l
SET page_id = tp.id
FROM tenant_pages tp
WHERE l.tenant_id = tp.tenant_id
  AND l.page_id IS NULL;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push` (or apply via Supabase dashboard if using hosted)

Verify: Query `SELECT count(*) FROM tenant_pages;` — should match number of tenants that had `fb_page_id` set.

- [ ] **Step 3: Regenerate TypeScript types**

Run: `npx supabase gen types typescript --project-id aeummxsqtcuhgxrmfkow > src/types/database.ts`

Verify: `src/types/database.ts` contains `tenant_pages` table definition with all columns.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0015_tenant_pages.sql src/types/database.ts
git commit -m "feat: add tenant_pages table with indexes, RLS, and data migration"
```

---

## Task 2: Page Cache Module

**Files:**
- Create: `src/lib/fb/page-cache.ts`

- [ ] **Step 1: Create the page cache module**

```typescript
// src/lib/fb/page-cache.ts

export interface CachedPage {
  tenantId: string;
  pageToken: string;
  pageName: string;
  pageId: string; // tenant_pages.id (UUID)
}

interface CacheEntry extends CachedPage {
  cachedAt: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const cache = new Map<string, CacheEntry>();

/**
 * Get a cached page by Facebook page ID.
 * Returns null on miss or stale entry (caller should query DB).
 */
export function getCachedPage(fbPageId: string): CachedPage | null {
  const entry = cache.get(fbPageId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL) {
    cache.delete(fbPageId);
    return null;
  }
  return {
    tenantId: entry.tenantId,
    pageToken: entry.pageToken,
    pageName: entry.pageName,
    pageId: entry.pageId,
  };
}

/**
 * Store a page in the cache.
 */
export function setCachedPage(fbPageId: string, page: CachedPage): void {
  cache.set(fbPageId, { ...page, cachedAt: Date.now() });
}

/**
 * Remove a page from the cache (on disconnect or token expiry).
 */
export function invalidateCachedPage(fbPageId: string): void {
  cache.delete(fbPageId);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/fb/page-cache.ts
git commit -m "feat: add in-memory page cache for webhook lookups"
```

---

## Task 3: Refactor Webhook Handler

**Files:**
- Modify: `src/app/api/fb/webhook/route.ts`

- [ ] **Step 1: Rewrite the webhook handler to use `tenant_pages` + cache**

Replace the full contents of `src/app/api/fb/webhook/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyFacebookSignature } from "@/lib/fb/signature";
import { parseFbWebhook, type FbMessagingEvent } from "@/lib/fb/webhook";
import {
  getCachedPage,
  setCachedPage,
  type CachedPage,
} from "@/lib/fb/page-cache";
import type { Database } from "@/types/database";

type Supabase = ReturnType<typeof createServiceClient>;

/**
 * Resolve tenant context from a Facebook page ID.
 * Checks in-memory cache first, falls back to DB.
 */
async function resolvePageContext(
  fbPageId: string,
  supabase: Supabase
): Promise<CachedPage | null> {
  const cached = getCachedPage(fbPageId);
  if (cached) return cached;

  const { data } = await supabase
    .from("tenant_pages")
    .select("id, tenant_id, fb_page_token, fb_page_name")
    .eq("fb_page_id", fbPageId)
    .eq("status", "active")
    .single();

  if (!data) return null;

  const page: CachedPage = {
    tenantId: data.tenant_id,
    pageToken: data.fb_page_token,
    pageName: data.fb_page_name ?? "",
    pageId: data.id,
  };
  setCachedPage(fbPageId, page);
  return page;
}

/**
 * GET /api/fb/webhook — Facebook webhook verification
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("tenants")
    .select("id")
    .eq("fb_verify_token", token)
    .single();

  if (!data) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(challenge, { status: 200 });
}

/**
 * POST /api/fb/webhook — Facebook webhook events
 */
export async function POST(request: Request) {
  const rawBody = await request.arrayBuffer();
  const bodyBuffer = Buffer.from(rawBody);
  const signature = request.headers.get("x-hub-signature-256");

  // Verify signature using app-level secret
  const appSecret = process.env.FB_APP_SECRET;
  if (appSecret && signature) {
    const valid = verifyFacebookSignature(bodyBuffer, signature, appSecret);
    if (!valid) {
      console.warn("Invalid webhook signature");
      return new NextResponse("Invalid signature", { status: 403 });
    }
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyBuffer.toString());
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const webhookBody = parseFbWebhook(body);
  if (!webhookBody) {
    return new NextResponse("Not a page webhook", { status: 400 });
  }

  const supabase = createServiceClient();

  for (const entry of webhookBody.entry) {
    const fbPageId = entry.id;

    const pageCtx = await resolvePageContext(fbPageId, supabase);
    if (!pageCtx) {
      console.warn(`No active tenant_page found for fb_page_id: ${fbPageId}`);
      continue;
    }

    for (const event of entry.messaging) {
      await processMessagingEvent(
        pageCtx.tenantId,
        pageCtx.pageId,
        event,
        supabase
      );
    }
  }

  return NextResponse.json({ status: "ok" });
}

async function processMessagingEvent(
  tenantId: string,
  pageId: string,
  event: FbMessagingEvent,
  supabase: Supabase
) {
  const psid = event.sender.id;

  const { data: leadData } = await supabase
    .from("leads")
    .upsert(
      {
        tenant_id: tenantId,
        psid,
        page_id: pageId,
        last_active_at: new Date(event.timestamp).toISOString(),
      } as Database["public"]["Tables"]["leads"]["Insert"],
      { onConflict: "tenant_id,psid" }
    )
    .select("id")
    .single();

  if (!leadData) {
    console.error("Failed to upsert lead for psid:", psid);
    return;
  }
  const lead = leadData as { id: string };

  const { data: convData } = await supabase
    .from("conversations")
    .upsert(
      {
        tenant_id: tenantId,
        lead_id: lead.id,
        last_message_at: new Date(event.timestamp).toISOString(),
      } as Database["public"]["Tables"]["conversations"]["Insert"],
      { onConflict: "tenant_id,lead_id" }
    )
    .select("id")
    .single();

  if (!convData) return;
  const conversation = convData as { id: string };

  if (event.message) {
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      direction: "in",
      text: event.message.text ?? null,
      attachments: event.message.attachments
        ? (event.message.attachments as unknown as Database["public"]["Tables"]["messages"]["Row"]["attachments"])
        : null,
      mid: event.message.mid,
    } as Database["public"]["Tables"]["messages"]["Insert"]);

    await supabase.from("lead_events").insert({
      tenant_id: tenantId,
      lead_id: lead.id,
      type: "message_in",
      payload: { mid: event.message.mid, text: event.message.text },
    } as Database["public"]["Tables"]["lead_events"]["Insert"]);
  }

  if (event.postback) {
    await supabase.from("lead_events").insert({
      tenant_id: tenantId,
      lead_id: lead.id,
      type: "action_click",
      payload: {
        payload: event.postback.payload,
        title: event.postback.title,
      },
    } as Database["public"]["Tables"]["lead_events"]["Insert"]);
  }
}
```

- [ ] **Step 2: Verify the app compiles**

Run: `npm run typecheck`
Expected: No errors related to webhook route.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/fb/webhook/route.ts
git commit -m "refactor: webhook handler uses tenant_pages + page cache"
```

---

## Task 4: Token Expiry Detection in Send

**Files:**
- Modify: `src/lib/fb/send.ts`

- [ ] **Step 1: Add token expiry detection**

In `src/lib/fb/send.ts`, replace the `sendMessage` function (lines 76-99):

```typescript
/**
 * Send a message to a Messenger user.
 * Throws FacebookTokenError if the page token is invalid (error code 190).
 */
export class FacebookTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FacebookTokenError";
  }
}

export async function sendMessage(
  psid: string,
  message: OutboundMessage,
  pageAccessToken: string
): Promise<{ messageId: string }> {
  const body = {
    recipient: { id: psid },
    message: buildMessageBody(message),
    messaging_type: "RESPONSE",
  };

  const res = await fetch(
    `${FB_BASE_URL}/me/messages?access_token=${pageAccessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    // Facebook error code 190 = invalid/expired token
    if (err?.error?.code === 190) {
      throw new FacebookTokenError(
        `Page token expired or invalid: ${err.error.message}`
      );
    }
    throw new Error(`FB Send API error: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return { messageId: data.message_id };
}
```

- [ ] **Step 2: Verify the app compiles**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/lib/fb/send.ts
git commit -m "feat: detect Facebook token expiry (error code 190) in sendMessage"
```

---

## Task 5: Tenant Pages Query Helpers

**Files:**
- Create: `src/lib/queries/tenant-pages.ts`

- [ ] **Step 1: Create query helpers**

```typescript
// src/lib/queries/tenant-pages.ts

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface TenantPage {
  id: string;
  tenant_id: string;
  fb_page_id: string;
  fb_page_name: string | null;
  fb_page_avatar: string | null;
  fb_page_token: string;
  status: string;
  connected_at: string;
}

export interface PageStats {
  pageId: string;
  messageCount: number;
  leadCount: number;
}

/**
 * Get all connected pages for a tenant. Cached per request.
 */
export const getTenantPages = cache(async (tenantId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenant_pages")
    .select("id, tenant_id, fb_page_id, fb_page_name, fb_page_avatar, fb_page_token, status, connected_at")
    .eq("tenant_id", tenantId)
    .order("connected_at", { ascending: true });
  return (data ?? []) as TenantPage[];
});

/**
 * Check if any connected page has an expired token. Cached per request.
 */
export const hasExpiredPages = cache(async (tenantId: string) => {
  const supabase = await createClient();
  const { count } = await supabase
    .from("tenant_pages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "token_expired");
  return (count ?? 0) > 0;
});

/**
 * Check if tenant has any active pages. Cached per request.
 */
export const hasActivePages = cache(async (tenantId: string) => {
  const supabase = await createClient();
  const { count } = await supabase
    .from("tenant_pages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "active");
  return (count ?? 0) > 0;
});

/**
 * Get per-page stats (lead count and message count).
 */
export async function getPageStats(tenantId: string): Promise<PageStats[]> {
  const supabase = await createClient();

  // Lead count per page
  const { data: leadCounts } = await supabase
    .rpc("get_page_lead_counts", { p_tenant_id: tenantId });

  // Message count per page
  const { data: messageCounts } = await supabase
    .rpc("get_page_message_counts", { p_tenant_id: tenantId });

  const statsMap = new Map<string, PageStats>();

  for (const row of (leadCounts ?? []) as { page_id: string; count: number }[]) {
    statsMap.set(row.page_id, {
      pageId: row.page_id,
      leadCount: Number(row.count),
      messageCount: 0,
    });
  }

  for (const row of (messageCounts ?? []) as { page_id: string; count: number }[]) {
    const existing = statsMap.get(row.page_id);
    if (existing) {
      existing.messageCount = Number(row.count);
    } else {
      statsMap.set(row.page_id, {
        pageId: row.page_id,
        leadCount: 0,
        messageCount: Number(row.count),
      });
    }
  }

  return Array.from(statsMap.values());
}
```

- [ ] **Step 2: Add the RPC functions to the migration**

Append to `supabase/migrations/0015_tenant_pages.sql`:

```sql
-- RPC: lead counts per page
CREATE OR REPLACE FUNCTION get_page_lead_counts(p_tenant_id uuid)
RETURNS TABLE(page_id uuid, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT l.page_id, count(*)
  FROM leads l
  WHERE l.tenant_id = p_tenant_id
    AND l.page_id IS NOT NULL
  GROUP BY l.page_id;
$$;

-- RPC: message counts per page (inbound only)
CREATE OR REPLACE FUNCTION get_page_message_counts(p_tenant_id uuid)
RETURNS TABLE(page_id uuid, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT l.page_id, count(m.id)
  FROM leads l
  JOIN conversations c ON c.lead_id = l.id AND c.tenant_id = l.tenant_id
  JOIN messages m ON m.conversation_id = c.id AND m.direction = 'in'
  WHERE l.tenant_id = p_tenant_id
    AND l.page_id IS NOT NULL
  GROUP BY l.page_id;
$$;
```

- [ ] **Step 3: Verify the app compiles**

Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/tenant-pages.ts supabase/migrations/0015_tenant_pages.sql
git commit -m "feat: add tenant-pages query helpers and stats RPCs"
```

---

## Task 6: OAuth Routes — fb-connect and fb-callback

**Files:**
- Create: `src/app/api/integrations/fb-connect/route.ts`
- Create: `src/app/api/integrations/fb-callback/route.ts`

- [ ] **Step 1: Create the OAuth redirect route**

```typescript
// src/app/api/integrations/fb-connect/route.ts

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

  // Detect source (onboarding vs integrations) from referer or query
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
```

- [ ] **Step 2: Create the OAuth callback route**

```typescript
// src/app/api/integrations/fb-callback/route.ts

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
    // Exchange code for short-lived user access token
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

    // Exchange for long-lived user token
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

    // Fetch user's pages
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

    // Store pages + user token in encrypted cookie
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

    // Redirect to page selection UI
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
```

- [ ] **Step 3: Verify the app compiles**

Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/integrations/fb-connect/route.ts src/app/api/integrations/fb-callback/route.ts
git commit -m "feat: add unified OAuth routes for Facebook page connection"
```

---

## Task 7: API Routes — List, Connect, Disconnect Pages

**Files:**
- Create: `src/app/api/integrations/fb-pages/route.ts`
- Create: `src/app/api/integrations/fb-pages/[pageId]/route.ts`
- Create: `src/app/api/integrations/fb-pages/available/route.ts`
- Create: `src/app/api/integrations/fb-pages/stats/route.ts`

- [ ] **Step 1: Create the available pages route (reads from cookie)**

```typescript
// src/app/api/integrations/fb-pages/available/route.ts

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

  // Check which pages are already connected (globally)
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
```

- [ ] **Step 2: Create the list and connect pages route**

```typescript
// src/app/api/integrations/fb-pages/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getTenantContext } from "@/lib/tenant/context";
import { randomUUID } from "crypto";
import { invalidateCachedPage } from "@/lib/fb/page-cache";

const FB_PAGES_COOKIE = "fb_available_pages";

/**
 * GET — List connected pages for current tenant.
 */
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

/**
 * POST — Connect selected Facebook pages.
 * Body: { pageIds: string[] }
 */
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

  if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
    return NextResponse.json(
      { error: "No pages selected" },
      { status: 400 }
    );
  }

  // Read pages from cookie
  const cookieStore = await cookies();
  const raw = cookieStore.get(FB_PAGES_COOKIE)?.value;

  if (!raw) {
    return NextResponse.json(
      { error: "Session expired. Please authenticate with Facebook again." },
      { status: 400 }
    );
  }

  let cookieData: {
    userAccessToken: string;
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
    return NextResponse.json({ error: "Invalid session data" }, { status: 400 });
  }

  const service = createServiceClient();
  const connected: string[] = [];
  const errors: Array<{ pageId: string; error: string }> = [];

  // Ensure tenant has a verify token (for webhook verification)
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
      // Subscribe page to webhook
      const subRes = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: page.access_token,
            subscribed_fields: "messages,messaging_postbacks",
          }),
        }
      );

      if (!subRes.ok) {
        const subErr = await subRes.text();
        console.error(`Failed to subscribe page ${pageId}:`, subErr);
        errors.push({ pageId, error: "Failed to subscribe to webhook" });
        continue;
      }

      // Insert into tenant_pages
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

      // Invalidate cache so webhook picks up new page
      invalidateCachedPage(pageId);
      connected.push(pageId);
    } catch (err) {
      console.error(`Error connecting page ${pageId}:`, err);
      errors.push({ pageId, error: "Unexpected error" });
    }
  }

  // Clear cookie
  cookieStore.delete(FB_PAGES_COOKIE);

  return NextResponse.json({ connected, errors });
}
```

- [ ] **Step 3: Create the disconnect route**

```typescript
// src/app/api/integrations/fb-pages/[pageId]/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getTenantContext } from "@/lib/tenant/context";
import { invalidateCachedPage } from "@/lib/fb/page-cache";

/**
 * DELETE — Disconnect a Facebook page.
 */
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

  // Get the page to unsubscribe webhook
  const { data: page } = await service
    .from("tenant_pages")
    .select("id, fb_page_id, fb_page_token")
    .eq("id", pageId)
    .eq("tenant_id", tenantCtx.tenantId)
    .single();

  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  // Unsubscribe from webhook
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
    // Continue with disconnect even if unsubscribe fails
  }

  // Mark as disconnected
  await service
    .from("tenant_pages")
    .update({ status: "disconnected" })
    .eq("id", pageId)
    .eq("tenant_id", tenantCtx.tenantId);

  // Invalidate cache
  invalidateCachedPage(page.fb_page_id);

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Create the stats route**

```typescript
// src/app/api/integrations/fb-pages/stats/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant/context";
import { getPageStats } from "@/lib/queries/tenant-pages";

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

  const stats = await getPageStats(tenantCtx.tenantId);
  return NextResponse.json({ stats });
}
```

- [ ] **Step 5: Verify the app compiles**

Run: `npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add src/app/api/integrations/fb-pages/
git commit -m "feat: add API routes for listing, connecting, disconnecting FB pages, and stats"
```

---

## Task 8: Page Selection UI

**Files:**
- Create: `src/app/(tenant)/app/integrations/select-pages/page.tsx`
- Create: `src/app/(tenant)/app/integrations/select-pages/SelectPagesClient.tsx`

- [ ] **Step 1: Create the server page component**

```typescript
// src/app/(tenant)/app/integrations/select-pages/page.tsx

import SelectPagesClient from "./SelectPagesClient";

export default function SelectPagesPage() {
  return <SelectPagesClient />;
}
```

- [ ] **Step 2: Create the client component**

```typescript
// src/app/(tenant)/app/integrations/select-pages/SelectPagesClient.tsx

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface AvailablePage {
  id: string;
  name: string;
  category: string;
  picture: string | null;
  availability: "available" | "connected_here" | "connected_other";
}

export default function SelectPagesClient() {
  const router = useRouter();
  const [pages, setPages] = useState<AvailablePage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPages() {
      try {
        const res = await fetch("/api/integrations/fb-pages/available");
        if (!res.ok) {
          const data = await res.json();
          setError(data.error ?? "Failed to load pages");
          return;
        }
        const data = await res.json();
        setPages(data.pages);
      } catch {
        setError("Failed to load pages");
      } finally {
        setLoading(false);
      }
    }
    fetchPages();
  }, []);

  function togglePage(pageId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  }

  async function handleConnect() {
    if (selected.size === 0) return;
    setConnecting(true);
    setError(null);

    try {
      const res = await fetch("/api/integrations/fb-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageIds: Array.from(selected) }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to connect pages");
        return;
      }

      router.push("/app/integrations?connected=true");
    } catch {
      setError("Failed to connect pages");
    } finally {
      setConnecting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-6 w-6 border-2 border-[var(--ws-accent)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error && pages.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <p className="text-sm text-[var(--ws-danger)] mb-4">{error}</p>
        <button
          onClick={() => router.push("/app/integrations")}
          className="text-sm text-[var(--ws-accent)] hover:underline"
        >
          Back to Integrations
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <h1 className="text-lg font-semibold text-[var(--ws-text-primary)] mb-1">
        Select Facebook Pages
      </h1>
      <p className="text-sm text-[var(--ws-text-muted)] mb-6">
        Choose which pages to connect to your workspace.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-[var(--ws-danger)]/10 text-sm text-[var(--ws-danger)]">
          {error}
        </div>
      )}

      <div className="space-y-2 mb-6">
        {pages.map((page) => {
          const disabled =
            page.availability === "connected_here" ||
            page.availability === "connected_other";
          const checked =
            page.availability === "connected_here" || selected.has(page.id);

          return (
            <label
              key={page.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                disabled
                  ? "border-[var(--ws-border)] bg-[var(--ws-page)] opacity-60 cursor-not-allowed"
                  : checked
                    ? "border-[var(--ws-accent)] bg-[var(--ws-accent-subtle)] cursor-pointer"
                    : "border-[var(--ws-border)] hover:border-[var(--ws-accent)] cursor-pointer"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => !disabled && togglePage(page.id)}
                className="h-4 w-4 rounded border-[var(--ws-border)] text-[var(--ws-accent)] focus:ring-[var(--ws-accent)]"
              />
              {page.picture && (
                <img
                  src={page.picture}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--ws-text-primary)] truncate">
                  {page.name}
                </p>
                {page.category && (
                  <p className="text-xs text-[var(--ws-text-muted)]">
                    {page.category}
                  </p>
                )}
              </div>
              {page.availability === "connected_here" && (
                <span className="text-xs text-[var(--ws-success)] shrink-0">
                  Already connected
                </span>
              )}
              {page.availability === "connected_other" && (
                <span className="text-xs text-[var(--ws-text-muted)] shrink-0">
                  Connected to another workspace
                </span>
              )}
            </label>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/app/integrations")}
          className="text-sm text-[var(--ws-text-secondary)] hover:text-[var(--ws-text-primary)]"
        >
          Cancel
        </button>
        <button
          onClick={handleConnect}
          disabled={selected.size === 0 || connecting}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--ws-accent)] text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {connecting
            ? "Connecting..."
            : `Connect ${selected.size > 0 ? `(${selected.size})` : ""}`}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the app compiles**

Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add src/app/\(tenant\)/app/integrations/select-pages/
git commit -m "feat: add page selection UI with checklist"
```

---

## Task 9: Integrations Page

**Files:**
- Create: `src/app/(tenant)/app/integrations/page.tsx`
- Create: `src/app/(tenant)/app/integrations/IntegrationsClient.tsx`

- [ ] **Step 1: Create the server page component**

```typescript
// src/app/(tenant)/app/integrations/page.tsx

import { getTenantContext } from "@/lib/tenant/context";
import { redirect } from "next/navigation";
import IntegrationsClient from "./IntegrationsClient";

export default async function IntegrationsPage() {
  const tenantCtx = await getTenantContext();
  if (!tenantCtx) redirect("/login");

  return <IntegrationsClient tenantId={tenantCtx.tenantId} />;
}
```

- [ ] **Step 2: Create the client component**

```typescript
// src/app/(tenant)/app/integrations/IntegrationsClient.tsx

"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

interface ConnectedPage {
  id: string;
  fb_page_id: string;
  fb_page_name: string | null;
  fb_page_avatar: string | null;
  status: string;
  connected_at: string;
}

interface PageStat {
  pageId: string;
  leadCount: number;
  messageCount: number;
}

export default function IntegrationsClient({
  tenantId,
}: {
  tenantId: string;
}) {
  const searchParams = useSearchParams();
  const [pages, setPages] = useState<ConnectedPage[]>([]);
  const [stats, setStats] = useState<Map<string, PageStat>>(new Map());
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [connectingUrl, setConnectingUrl] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(
    searchParams.get("connected") === "true"
      ? "Facebook pages connected successfully!"
      : null
  );

  const fetchPages = useCallback(async () => {
    try {
      const [pagesRes, statsRes] = await Promise.all([
        fetch("/api/integrations/fb-pages"),
        fetch(`/api/integrations/fb-pages/stats?tenantId=${tenantId}`),
      ]);

      if (pagesRes.ok) {
        const pagesData = await pagesRes.json();
        setPages(pagesData.pages);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        const map = new Map<string, PageStat>();
        for (const s of statsData.stats) {
          map.set(s.pageId, s);
        }
        setStats(map);
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  async function handleConnect() {
    setConnectingUrl(true);
    try {
      const res = await fetch("/api/integrations/fb-connect?source=integrations");
      if (res.ok) {
        const data = await res.json();
        window.location.href = data.url;
      }
    } finally {
      setConnectingUrl(false);
    }
  }

  async function handleDisconnect(pageId: string) {
    if (!confirm("Are you sure you want to disconnect this page? Leads from this page will no longer receive bot messages.")) {
      return;
    }
    setDisconnecting(pageId);
    try {
      const res = await fetch(`/api/integrations/fb-pages/${pageId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setPages((prev) => prev.filter((p) => p.id !== pageId));
      }
    } finally {
      setDisconnecting(null);
    }
  }

  async function handleReconnect() {
    await handleConnect();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-6 w-6 border-2 border-[var(--ws-accent)] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-[var(--ws-text-primary)]">
            Integrations
          </h1>
          <p className="text-sm text-[var(--ws-text-muted)]">
            Manage your connected Facebook Pages.
          </p>
        </div>
        <button
          onClick={handleConnect}
          disabled={connectingUrl}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--ws-accent)] text-white disabled:opacity-50"
        >
          {connectingUrl ? "Redirecting..." : "Connect Facebook Pages"}
        </button>
      </div>

      {successMessage && (
        <div className="mb-4 p-3 rounded-lg bg-[var(--ws-success)]/10 text-sm text-[var(--ws-success)]">
          {successMessage}
        </div>
      )}

      {pages.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-[var(--ws-border)] rounded-xl">
          <p className="text-sm text-[var(--ws-text-muted)] mb-4">
            No Facebook Pages connected yet.
          </p>
          <button
            onClick={handleConnect}
            disabled={connectingUrl}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--ws-accent)] text-white disabled:opacity-50"
          >
            Connect your first page
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {pages.map((page) => {
            const pageStat = stats.get(page.id);
            const isExpired = page.status === "token_expired";

            return (
              <div
                key={page.id}
                className={`p-4 rounded-xl border ${
                  isExpired
                    ? "border-[var(--ws-warning)]/50 bg-[var(--ws-warning)]/5"
                    : "border-[var(--ws-border)]"
                }`}
              >
                <div className="flex items-start gap-3">
                  {page.fb_page_avatar ? (
                    <img
                      src={page.fb_page_avatar}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-[var(--ws-accent-subtle)] flex items-center justify-center shrink-0">
                      <span className="text-sm font-medium text-[var(--ws-accent)]">
                        {(page.fb_page_name ?? "?")[0]}
                      </span>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[var(--ws-text-primary)] truncate">
                        {page.fb_page_name ?? page.fb_page_id}
                      </p>
                      {isExpired ? (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-[var(--ws-warning)]/20 text-[var(--ws-warning)]">
                          Token Expired
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-[var(--ws-success)]/20 text-[var(--ws-success)]">
                          Active
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-xs text-[var(--ws-text-muted)]">
                        {pageStat?.messageCount ?? 0} messages
                      </span>
                      <span className="text-xs text-[var(--ws-text-muted)]">
                        {pageStat?.leadCount ?? 0} leads
                      </span>
                      <span className="text-xs text-[var(--ws-text-muted)]">
                        Connected{" "}
                        {new Date(page.connected_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isExpired && (
                      <button
                        onClick={handleReconnect}
                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--ws-warning)] text-white"
                      >
                        Reconnect
                      </button>
                    )}
                    <button
                      onClick={() => handleDisconnect(page.id)}
                      disabled={disconnecting === page.id}
                      className="px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--ws-border)] text-[var(--ws-text-secondary)] hover:bg-[var(--ws-page)] disabled:opacity-50"
                    >
                      {disconnecting === page.id
                        ? "Disconnecting..."
                        : "Disconnect"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify the app compiles**

Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add src/app/\(tenant\)/app/integrations/page.tsx src/app/\(tenant\)/app/integrations/IntegrationsClient.tsx
git commit -m "feat: add Integrations page with connected pages management"
```

---

## Task 10: Update Dashboard Navigation

**Files:**
- Modify: `src/components/dashboard/DashboardNav.tsx`

- [ ] **Step 1: Add Integrations nav item**

In `src/components/dashboard/DashboardNav.tsx`, add `Plug` to the lucide-react import (line 12) and add the Integrations item to `NAV_ITEMS` (after line 37):

Add `Plug` to the import on line 3:

```typescript
import {
  Home,
  MessageSquare,
  Users,
  Bot,
  Link2,
  Zap,
  Plug,
  Settings,
  Menu,
  X,
  Target,
  LogOut,
} from "lucide-react";
```

Update `NAV_ITEMS` to include Integrations between Workflows and the bottom section:

```typescript
const NAV_ITEMS: NavItem[] = [
  { href: "/app", label: "Home", icon: Home, exact: true },
  { href: "/app/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/app/leads", label: "Leads", icon: Users },
  { href: "/app/bot", label: "Bot", icon: Bot },
  { href: "/app/campaigns", label: "Campaigns", icon: Target },
  { href: "/app/actions", label: "Actions", icon: Link2 },
  { href: "/app/workflows", label: "Workflows", icon: Zap },
  { href: "/app/integrations", label: "Integrations", icon: Plug },
];
```

- [ ] **Step 2: Verify the app compiles**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/DashboardNav.tsx
git commit -m "feat: add Integrations nav item to dashboard sidebar"
```

---

## Task 11: Update Facebook Banner for Multi-Page + Token Expiry

**Files:**
- Modify: `src/components/dashboard/FacebookConnectBanner.tsx`
- Modify: `src/app/(tenant)/app/layout.tsx`

- [ ] **Step 1: Update the banner component**

Replace the full contents of `src/components/dashboard/FacebookConnectBanner.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";

const DISMISSED_KEY = "fb-banner-dismissed";

interface FacebookConnectBannerProps {
  hasActivePages: boolean;
  hasExpiredPages: boolean;
  onboardingCompleted: boolean;
}

export default function FacebookConnectBanner({
  hasActivePages,
  hasExpiredPages,
  onboardingCompleted,
}: FacebookConnectBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(DISMISSED_KEY) === "true") setDismissed(true);
  }, []);

  // Show expired token warning (not dismissible)
  if (hasExpiredPages) {
    return (
      <div className="bg-[var(--ws-warning)]/10 border-b border-[var(--ws-warning)]/20 px-4 py-3 flex items-center justify-between gap-4">
        <p className="text-sm text-[var(--ws-text-primary)]">
          One or more Facebook Pages need to be reconnected.
        </p>
        <a
          href="/app/integrations"
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--ws-warning)] text-white shrink-0"
        >
          Fix in Integrations
        </a>
      </div>
    );
  }

  // Show connect prompt (dismissible)
  if (!hasActivePages && onboardingCompleted && !dismissed) {
    function handleDismiss() {
      setDismissed(true);
      sessionStorage.setItem(DISMISSED_KEY, "true");
    }

    return (
      <div className="bg-primary/10 border-b border-primary/20 px-4 py-3 flex items-center justify-between gap-4">
        <p className="text-sm">
          Connect a Facebook Page to start receiving leads.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/app/integrations"
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground"
          >
            Connect Facebook
          </a>
          <button
            type="button"
            onClick={handleDismiss}
            className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 2: Update the dashboard layout to pass new banner props**

In `src/app/(tenant)/app/layout.tsx`, replace the tenant query and banner usage. Change the import and the parallel fetch section:

Replace the existing file with:

```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getTenantContext } from "@/lib/tenant/context";
import DashboardNav from "@/components/dashboard/DashboardNav";
import FacebookConnectBanner from "@/components/dashboard/FacebookConnectBanner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const [{ data: { user } }, tenantCtx] = await Promise.all([
    supabase.auth.getUser(),
    getTenantContext(),
  ]);

  if (!user) {
    redirect("/login");
  }

  if (!tenantCtx) {
    redirect("/login");
  }

  const serviceClient = createServiceClient();

  // Verify membership, fetch tenant info, and check page status in parallel
  const [{ data: membership }, { data: tenant }, { count: activeCount }, { count: expiredCount }] =
    await Promise.all([
      serviceClient
        .from("tenant_members")
        .select("user_id")
        .eq("user_id", user.id)
        .eq("tenant_id", tenantCtx.tenantId)
        .maybeSingle(),
      serviceClient
        .from("tenants")
        .select("onboarding_completed")
        .eq("id", tenantCtx.tenantId)
        .single(),
      serviceClient
        .from("tenant_pages")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantCtx.tenantId)
        .eq("status", "active"),
      serviceClient
        .from("tenant_pages")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantCtx.tenantId)
        .eq("status", "token_expired"),
    ]);

  if (!membership) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen bg-[var(--ws-page)]">
      <DashboardNav tenantSlug={tenantCtx.tenantSlug} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <FacebookConnectBanner
          hasActivePages={(activeCount ?? 0) > 0}
          hasExpiredPages={(expiredCount ?? 0) > 0}
          onboardingCompleted={tenant?.onboarding_completed ?? false}
        />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the app compiles**

Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/FacebookConnectBanner.tsx src/app/\(tenant\)/app/layout.tsx
git commit -m "feat: update banner for multi-page status and token expiry warnings"
```

---

## Task 12: Update Settings Page

**Files:**
- Modify: `src/app/(tenant)/app/settings/SettingsClient.tsx`

- [ ] **Step 1: Replace the Facebook section with a link to Integrations**

In `src/app/(tenant)/app/settings/SettingsClient.tsx`, replace lines 148-164 (the Facebook Card section):

Old:
```typescript
        {/* Facebook */}
        <Card className="p-6">
          <h2 className="mb-2 text-sm font-medium text-[var(--ws-text-tertiary)]">Facebook Page</h2>
          <p className="mb-4 text-xs text-[var(--ws-text-muted)]">
            Connect your Facebook page to start receiving Messenger leads.
          </p>
          {tenant.fbPageId ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full bg-[var(--ws-success)]" />
              <span className="text-[var(--ws-text-secondary)]">
                Connected — Page ID: {tenant.fbPageId}
              </span>
            </div>
          ) : (
            <Button variant="primary">Connect Facebook Page</Button>
          )}
        </Card>
```

New:
```typescript
        {/* Facebook — moved to Integrations */}
        <Card className="p-6">
          <h2 className="mb-2 text-sm font-medium text-[var(--ws-text-tertiary)]">Facebook Pages</h2>
          <p className="mb-4 text-xs text-[var(--ws-text-muted)]">
            Manage your connected Facebook Pages from the Integrations page.
          </p>
          <a
            href="/app/integrations"
            className="text-sm font-medium text-[var(--ws-accent)] hover:underline"
          >
            Go to Integrations →
          </a>
        </Card>
```

- [ ] **Step 2: Verify the app compiles**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/app/\(tenant\)/app/settings/SettingsClient.tsx
git commit -m "refactor: replace settings FB section with link to Integrations"
```

---

## Task 13: Wire Facebook Step into Onboarding

**Files:**
- Modify: `src/lib/onboarding/types.ts`
- Modify: `src/components/onboarding/OnboardingWizard.tsx`
- Modify: `src/components/onboarding/steps/FacebookStep.tsx`

- [ ] **Step 1: Add "facebook" to onboarding step types**

In `src/lib/onboarding/types.ts`, update the `OnboardingStep` type and `STEP_ORDER`:

Replace lines 3-19:

```typescript
export type OnboardingStep =
  | "profile"
  | "industry"
  | "goal"
  | "business-info"
  | "website"
  | "generation"
  | "facebook"
  | "preview";

export const STEP_ORDER: OnboardingStep[] = [
  "profile",
  "industry",
  "goal",
  "business-info",
  "website",
  "generation",
  "facebook",
  "preview",
];

export const STEP_LABELS: Record<OnboardingStep, string> = {
  profile: "Profile",
  industry: "Industry",
  goal: "Goal",
  "business-info": "Business Info",
  website: "Website",
  generation: "Setup",
  facebook: "Facebook",
  preview: "Preview",
};
```

- [ ] **Step 2: Update FacebookStep component to use new OAuth flow**

Replace the full contents of `src/components/onboarding/steps/FacebookStep.tsx`:

```typescript
"use client";

import { useState } from "react";

interface FacebookStepProps {
  onNext: () => void;
  onBack: () => void;
}

export default function FacebookStep({ onNext, onBack }: FacebookStepProps) {
  const [connecting, setConnecting] = useState(false);

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await fetch(
        "/api/integrations/fb-connect?source=onboarding"
      );
      if (res.ok) {
        const data = await res.json();
        window.location.href = data.url;
      }
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--ws-text-primary)]">
          Connect Facebook Page
        </h2>
        <p className="mt-1 text-sm text-[var(--ws-text-muted)]">
          Connect your Facebook Page to start receiving Messenger leads.
          You can connect multiple pages.
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 py-8">
        <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center">
          <svg className="h-8 w-8 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
        </div>

        <button
          onClick={handleConnect}
          disabled={connecting}
          className="px-6 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {connecting ? "Redirecting to Facebook..." : "Connect Facebook Pages"}
        </button>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-[var(--ws-border)]">
        <button
          onClick={onBack}
          className="text-sm text-[var(--ws-text-secondary)] hover:text-[var(--ws-text-primary)]"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="text-sm text-[var(--ws-text-muted)] hover:text-[var(--ws-text-secondary)]"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire FacebookStep into OnboardingWizard**

In `src/components/onboarding/OnboardingWizard.tsx`, add the import and render case for the facebook step. Add this import near the top:

```typescript
import FacebookStep from "@/components/onboarding/steps/FacebookStep";
```

And in the step rendering switch/conditional, add a case for `"facebook"`:

```typescript
case "facebook":
  return (
    <FacebookStep
      onNext={() => dispatch({ type: "NEXT_STEP" })}
      onBack={() => dispatch({ type: "PREV_STEP" })}
    />
  );
```

The exact insertion point depends on the existing switch/conditional structure — add it alongside the other step cases.

- [ ] **Step 4: Handle the `?step=facebook` return from OAuth callback**

In `OnboardingWizard.tsx`, check for `fb_connected` or `step=facebook` query params on mount to resume after OAuth redirect. Add to the existing `useEffect` or `useSearchParams` logic:

```typescript
// After OAuth callback, if we're back with connected=true on the facebook step,
// advance to preview
const searchParams = useSearchParams();
useEffect(() => {
  if (searchParams.get("fb_connected") === "true") {
    dispatch({ type: "GO_TO_STEP", step: "preview" });
  }
  if (searchParams.get("step") === "facebook") {
    dispatch({ type: "GO_TO_STEP", step: "facebook" });
  }
}, [searchParams]);
```

- [ ] **Step 5: Verify the app compiles**

Run: `npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add src/lib/onboarding/types.ts src/components/onboarding/steps/FacebookStep.tsx src/components/onboarding/OnboardingWizard.tsx
git commit -m "feat: wire Facebook step into onboarding wizard"
```

---

## Task 14: Delete Deprecated OAuth Routes

**Files:**
- Delete: `src/app/api/onboarding/fb-connect/route.ts`
- Delete: `src/app/api/onboarding/fb-callback/route.ts`
- Delete: `src/app/api/settings/fb-connect/route.ts`
- Delete: `src/app/api/settings/fb-callback/route.ts`

- [ ] **Step 1: Delete the old routes**

```bash
rm src/app/api/onboarding/fb-connect/route.ts
rm src/app/api/onboarding/fb-callback/route.ts
rm src/app/api/settings/fb-connect/route.ts
rm src/app/api/settings/fb-callback/route.ts
```

- [ ] **Step 2: Check for any remaining references to the old routes**

Search for `fb-connect` and `fb-callback` in the codebase. Any remaining references should point to `/api/integrations/fb-connect` or `/api/integrations/fb-callback`. Fix any stale references found.

Run: `grep -r "onboarding/fb-" src/ --include="*.ts" --include="*.tsx"`
Run: `grep -r "settings/fb-connect" src/ --include="*.ts" --include="*.tsx"`

Expected: No results (all references updated in prior tasks).

- [ ] **Step 3: Verify the app compiles**

Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove deprecated onboarding/settings FB OAuth routes"
```

---

## Task 15: Verify End-to-End

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

Verify: Server starts without errors.

- [ ] **Step 2: Check Integrations page loads**

Navigate to `http://{tenant}.lvh.me:3000/app/integrations`

Expected: Empty state with "No Facebook Pages connected yet." and a "Connect your first page" button.

- [ ] **Step 3: Check nav shows Integrations**

Expected: "Integrations" appears in the sidebar between "Workflows" and "Settings".

- [ ] **Step 4: Check Settings page shows link**

Navigate to `/app/settings`

Expected: Facebook section shows "Go to Integrations →" link instead of the old connect button.

- [ ] **Step 5: Check banner logic**

Expected: If no pages connected and onboarding completed, banner shows "Connect a Facebook Page to start receiving leads." with link to `/app/integrations`.

- [ ] **Step 6: Verify type checking passes**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 7: Commit final state if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during end-to-end verification"
```
