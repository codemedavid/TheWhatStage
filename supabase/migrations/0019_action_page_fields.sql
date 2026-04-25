-- 0019_action_page_fields.sql
-- Form field definitions for action pages

-- Enum for field types
CREATE TYPE action_field_type AS ENUM (
  'text', 'email', 'phone', 'textarea', 'select', 'number', 'radio', 'checkbox'
);

CREATE TABLE action_page_fields (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action_page_id uuid NOT NULL REFERENCES action_pages(id) ON DELETE CASCADE,
  label       text NOT NULL,
  field_key   text NOT NULL,
  field_type  action_field_type NOT NULL DEFAULT 'text',
  placeholder text,
  required    boolean NOT NULL DEFAULT false,
  options     jsonb,
  order_index integer NOT NULL DEFAULT 0,
  lead_mapping jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- No duplicate field keys per form
ALTER TABLE action_page_fields
  ADD CONSTRAINT uq_action_page_fields_key UNIQUE (action_page_id, field_key);

-- Clean ordering per form
ALTER TABLE action_page_fields
  ADD CONSTRAINT uq_action_page_fields_order UNIQUE (action_page_id, order_index);

-- RLS
ALTER TABLE action_page_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON action_page_fields
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Add partial unique index: only one primary per (lead_id, type)
CREATE UNIQUE INDEX uq_lead_contacts_primary
  ON lead_contacts (lead_id, type)
  WHERE is_primary = true;

-- Add form_submit as a valid lead_knowledge source
ALTER TYPE lead_knowledge_source ADD VALUE IF NOT EXISTS 'form_submit';
