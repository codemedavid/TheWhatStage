-- Track when a lead can no longer be reached via Messenger
-- (e.g. FB app lacks Advanced Access for pages_messaging, 24h window expired,
-- user deleted account, or page-scoped ID can't be resolved — subcode 33).
ALTER TABLE leads ADD COLUMN unreachable_reason text;
ALTER TABLE leads ADD COLUMN unreachable_at timestamptz;

CREATE INDEX idx_leads_unreachable ON leads(tenant_id) WHERE unreachable_at IS NOT NULL;
-- Allow logging FB Send-API delivery failures as a lead_event.
ALTER TYPE lead_event_type ADD VALUE IF NOT EXISTS 'send_failed';
