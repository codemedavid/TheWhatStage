# Facebook Page Connection — Multi-Page Support

**Date:** 2026-04-24
**Status:** Approved

## Overview

Add multi-page Facebook connection support to WhatStage. Tenants can authenticate with Facebook, select one or more Pages they manage, and connect them to their workspace. All connected pages share the same bot configuration, campaigns, and lead pipeline. The system is designed for high-volume webhook throughput from the start.

## Current State

- Single-page support: `tenants` table stores `fb_page_id`, `fb_page_token`
- OAuth flow auto-selects `pages[0]` — no user choice
- `FacebookStep` component exists but is not wired into onboarding wizard
- Webhook handler resolves tenant by querying `tenants.fb_page_id`
- Settings page has a basic connect/status indicator

## Design Decisions

- **Shared bot model:** All connected pages share the same bot logic, campaigns, action pages, and pipeline. Leads from any page go into the same tenant pipeline.
- **Page selection UI:** Checklist — user selects which pages to connect after OAuth.
- **Single shared webhook:** All pages route to `/api/fb/webhook`. The payload includes the page ID, which resolves the tenant via `tenant_pages` lookup.
- **Integrations page:** New dedicated `/app/integrations` nav item for managing connected pages.
- **Onboarding + Integrations:** Facebook connection available during onboarding AND from the Integrations page post-setup.
- **Token expiry:** Warning banner on all dashboard pages when any page has an expired token.
- **Performance-first:** In-memory cache for page→tenant mapping, partial DB indexes, lean webhook handler.

---

## 1. Database Schema

### New `tenant_pages` table

```sql
CREATE TABLE tenant_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fb_page_id text NOT NULL,
  fb_page_name text,
  fb_page_avatar text,
  fb_page_token text NOT NULL,
  fb_user_token text,
  status text NOT NULL DEFAULT 'active',  -- active, token_expired, disconnected
  connected_at timestamptz NOT NULL DEFAULT now(),
  token_refreshed_at timestamptz,

  CONSTRAINT unique_page_per_tenant UNIQUE (tenant_id, fb_page_id),
  CONSTRAINT unique_page_global UNIQUE (fb_page_id)
);

-- Fast webhook lookups — only active pages
CREATE INDEX idx_tenant_pages_fb_page_id_active
  ON tenant_pages(fb_page_id) WHERE status = 'active';

-- Tenant-scoped queries (integrations page, stats)
CREATE INDEX idx_tenant_pages_tenant_id
  ON tenant_pages(tenant_id);
```

**Constraints:**
- `UNIQUE(fb_page_id)` globally — a Facebook page can only be connected to one tenant
- `UNIQUE(tenant_id, fb_page_id)` — no duplicate connections within a tenant
- Partial index on `fb_page_id WHERE status = 'active'` for webhook performance

### Leads table modification

```sql
ALTER TABLE leads ADD COLUMN page_id uuid REFERENCES tenant_pages(id);
CREATE INDEX idx_leads_page_id ON leads(page_id);
```

Links each lead to the page they came from, enabling per-page stats.

### RLS policies

```sql
-- Tenant members can view their own pages
CREATE POLICY tenant_pages_select ON tenant_pages
  FOR SELECT USING (tenant_id = current_tenant_id());

-- Only owners/admins can manage pages
CREATE POLICY tenant_pages_manage ON tenant_pages
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('owner', 'admin')
  );
```

### Migration

- Migrate existing `tenants.fb_page_id` / `fb_page_token` data into `tenant_pages` as the first row per tenant
- Backfill `leads.page_id` for existing leads using the migrated `tenant_pages.id`
- Deprecate `tenants.fb_page_id`, `tenants.fb_page_token`, `tenants.fb_app_secret` columns (keep temporarily for rollback safety)

---

## 2. OAuth Flow & Page Selection

### Flow

1. User clicks "Connect Facebook Pages" (onboarding or integrations page)
2. `GET /api/integrations/fb-connect` — redirects to Facebook OAuth
   - Scopes: `pages_show_list`, `pages_messaging`, `pages_manage_metadata`
   - Redirect URI: `{APP_URL}/api/integrations/fb-callback`
3. Facebook redirects back with auth code
4. `GET /api/integrations/fb-callback`:
   - Exchanges code for user access token
   - Exchanges for long-lived user token
   - Calls `GET /me/accounts` to fetch all pages
   - Stores page list + user token in encrypted HTTP-only cookie (temporary)
   - Redirects to `/app/integrations/select-pages` (or onboarding equivalent)
5. Page selection UI displays checklist:
   - Page avatar, name, category
   - Pages already connected to another tenant shown as disabled with "Connected to another workspace"
   - Pages already connected to this tenant shown as checked + disabled
6. User selects pages, clicks "Connect Selected"
7. `POST /api/integrations/fb-pages`:
   - Reads page list from cookie
   - For each selected page: exchange user token for long-lived page token
   - Subscribe each page to webhook: `POST /{page_id}/subscribed_apps`
   - Insert rows into `tenant_pages`
   - Clear the cookie
   - Return success
8. Redirect to integrations page showing connected pages

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/integrations/fb-connect` | GET | Initiate Facebook OAuth redirect |
| `/api/integrations/fb-callback` | GET | Handle OAuth callback, store pages in cookie, redirect to selection |
| `/api/integrations/fb-pages` | GET | List connected pages for current tenant |
| `/api/integrations/fb-pages` | POST | Connect selected pages (subscribe webhooks, insert into DB) |
| `/api/integrations/fb-pages/[pageId]` | DELETE | Disconnect a page (unsubscribe webhook, set status to disconnected) |
| `/api/integrations/fb-pages/available` | GET | Read available pages from cookie (for selection UI) |

---

## 3. Webhook Handler Refactor

### In-memory cache

```typescript
// Module-level cache: fb_page_id → { tenant_id, fb_page_token, fb_page_name, page_id }
const pageCache = new Map<string, { tenantId: string; pageToken: string; pageName: string; pageId: string; cachedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
```

- Populated on first lookup per page
- Invalidated when pages are connected/disconnected (cache.delete)
- Stale entries auto-expire via TTL check on read
- Each Vercel function instance has its own cache — DB is the fallback, and the partial index keeps it fast (~1ms)

### Webhook handler flow

1. Verify `x-hub-signature-256` using `FB_APP_SECRET` env var
2. Respond `200 OK` immediately (Facebook requires fast response)
3. For each `entry` in payload:
   a. Extract `entry.id` (page ID)
   b. Check cache → miss? Query `tenant_pages WHERE fb_page_id = ? AND status = 'active'`
   c. Not found → log warning, skip
   d. Found → process messaging events with resolved tenant context and page token
4. When processing: create/upsert lead with `page_id` set

### Token expiry detection

- If `sendMessage` returns Facebook error code 190 (invalid token):
  - Update `tenant_pages SET status = 'token_expired'` for that page
  - Invalidate cache entry
  - Log the error
- Dashboard checks for `token_expired` pages on load

### Future scaling path

When volume requires it, the webhook handler can push events to a queue (Vercel Queues) instead of processing inline. The lean handler + cache pattern makes this swap straightforward — change the processing step to an enqueue step, add a consumer function.

---

## 4. UI Components

### 4.1 Onboarding — Facebook Step

- Insert into onboarding wizard after `generation` step, before `preview`
- "Connect Facebook Pages" button + "Skip for now" link
- After OAuth + page selection, advances to preview step
- Skippable — onboarding completes without Facebook connection

### 4.2 Integrations Page (`/app/integrations`)

New nav item in `DashboardNav.tsx` — between "Workflows" and "Settings".

**Layout:**
- Header: "Integrations" title + "Connect Facebook Pages" button
- Connected pages list — cards showing:
  - Page avatar + name
  - Status badge: green "Active" or yellow "Token Expired"
  - Stats: messages received, leads generated
  - Connected date
  - "Disconnect" button (with confirmation dialog)
  - "Reconnect" button (shown when token expired)

### 4.3 Page Selection UI

Shown after OAuth callback redirects back.

- Checklist of pages: avatar, name, category, checkbox
- "Already connected" badge on pages linked to other tenants (checkbox disabled)
- "Already connected to this workspace" for pages already in this tenant (checked + disabled)
- "Connect Selected" button at bottom
- Loading state with progress while subscribing webhooks

### 4.4 Warning Banner

Extends existing `FacebookConnectBanner` pattern:

- **No pages connected:** "Connect a Facebook Page to start receiving leads" → link to `/app/integrations`
- **Token expired:** "One or more Facebook Pages need to be reconnected" → link to `/app/integrations`
- Shows on all dashboard pages
- Dismissible per session (sessionStorage)

### 4.5 Settings Page Cleanup

- Remove the Facebook connection section from Settings
- Replace with: "Manage your Facebook Pages in [Integrations](/app/integrations)"

---

## 5. Data Flow & Per-Page Stats

### Message sending

When replying to a lead:
1. Look up `lead.page_id` → get `tenant_pages.fb_page_token`
2. Use that page's token to call the Facebook Send API
3. Page token resolved from cache (same cache as webhook handler)

### Per-page stats (for Integrations page)

```sql
-- Messages received per page
SELECT tp.id, COUNT(m.id) as message_count
FROM tenant_pages tp
JOIN leads l ON l.page_id = tp.id
JOIN conversations c ON c.lead_id = l.id
JOIN messages m ON m.conversation_id = c.id AND m.direction = 'in'
WHERE tp.tenant_id = $1
GROUP BY tp.id;

-- Leads per page
SELECT page_id, COUNT(*) as lead_count
FROM leads
WHERE tenant_id = $1 AND page_id IS NOT NULL
GROUP BY page_id;
```

### Indexes supporting these queries

- `idx_leads_page_id` on `leads(page_id)` — new
- Existing indexes on `conversations(lead_id)`, `messages(conversation_id)` — already in place

---

## 6. Deprecated Routes

The following existing routes are replaced by the new `/api/integrations/*` routes and should be removed:

- `GET /api/onboarding/fb-connect` → replaced by `/api/integrations/fb-connect` (onboarding step redirects here)
- `GET /api/onboarding/fb-callback` → replaced by `/api/integrations/fb-callback`
- `GET /api/settings/fb-connect` → replaced by `/api/integrations/fb-connect`
- `GET /api/settings/fb-callback` → replaced by `/api/integrations/fb-callback`

The callback route accepts an optional `?source=onboarding` query param to redirect back to the correct UI after page selection.

---

## 7. Security

- **Page tokens:** Stored encrypted in `tenant_pages.fb_page_token` (same encryption as current `tenants.fb_page_token`)
- **User tokens:** Stored encrypted in `tenant_pages.fb_user_token`
- **Cookie for page selection:** HTTP-only, secure, encrypted, short TTL (10 minutes)
- **RLS:** `tenant_pages` scoped to tenant via `current_tenant_id()`
- **Webhook signature:** Verified using `FB_APP_SECRET` env var before any processing
- **Global uniqueness:** `UNIQUE(fb_page_id)` prevents a page from being connected to multiple tenants simultaneously
