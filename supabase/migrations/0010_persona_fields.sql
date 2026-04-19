-- supabase/migrations/0010_persona_fields.sql

-- Add persona fields to tenants
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS persona_tone TEXT NOT NULL DEFAULT 'friendly',
  ADD COLUMN IF NOT EXISTS custom_instructions TEXT;

-- Enforce length on rule_text
ALTER TABLE bot_rules
  ADD CONSTRAINT bot_rules_rule_text_length
  CHECK (char_length(rule_text) <= 500);

-- Enforce length on custom_instructions (applied at API layer too, but belt-and-suspenders)
ALTER TABLE tenants
  ADD CONSTRAINT tenants_custom_instructions_length
  CHECK (custom_instructions IS NULL OR char_length(custom_instructions) <= 2000);
