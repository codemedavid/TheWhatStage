-- Add new columns to leads
ALTER TABLE leads ADD COLUMN first_name text;
ALTER TABLE leads ADD COLUMN last_name text;
ALTER TABLE leads ADD COLUMN campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL;

CREATE INDEX idx_leads_campaign_id ON leads(campaign_id);

-- Enum types for new tables
CREATE TYPE lead_contact_type AS ENUM ('phone', 'email');
CREATE TYPE lead_contact_source AS ENUM ('ai_extracted', 'manual', 'form_submit');
CREATE TYPE lead_knowledge_source AS ENUM ('ai_extracted', 'manual');
CREATE TYPE stage_actor_type AS ENUM ('ai', 'agent', 'automation');
CREATE TYPE lead_note_type AS ENUM ('agent_note', 'ai_summary');

-- lead_contacts table
CREATE TABLE lead_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type lead_contact_type NOT NULL,
  value text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  source lead_contact_source NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, lead_id, type, value)
);

CREATE INDEX idx_lead_contacts_lead ON lead_contacts(lead_id);
CREATE INDEX idx_lead_contacts_value ON lead_contacts(value);

ALTER TABLE lead_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON lead_contacts
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- lead_knowledge table
CREATE TABLE lead_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text NOT NULL,
  source lead_knowledge_source NOT NULL DEFAULT 'manual',
  extracted_from uuid REFERENCES messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, lead_id, key)
);

CREATE INDEX idx_lead_knowledge_lead ON lead_knowledge(lead_id);

ALTER TABLE lead_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON lead_knowledge
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- lead_stage_history table
CREATE TABLE lead_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_stage_id uuid REFERENCES stages(id) ON DELETE SET NULL,
  to_stage_id uuid NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  reason text NOT NULL,
  actor_type stage_actor_type NOT NULL,
  actor_id uuid,
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_stage_history_lead ON lead_stage_history(lead_id);
CREATE INDEX idx_lead_stage_history_created ON lead_stage_history(lead_id, created_at DESC);

ALTER TABLE lead_stage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON lead_stage_history
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- lead_notes table
CREATE TABLE lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type lead_note_type NOT NULL,
  content text NOT NULL,
  author_id uuid,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_notes_lead ON lead_notes(lead_id);

ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON lead_notes
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
