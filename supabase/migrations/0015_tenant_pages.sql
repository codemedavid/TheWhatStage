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

-- 8. RPC: lead counts per page
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

-- 9. RPC: message counts per page (inbound only)
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
