-- 0026_knowledge_editable.sql
-- Adds content_hash for cheap change detection and display_order for
-- preserving section order in the unified richtext editor.

ALTER TABLE knowledge_docs
  ADD COLUMN content_hash text,
  ADD COLUMN display_order integer NOT NULL DEFAULT 0;

CREATE INDEX idx_knowledge_docs_tenant_type_order
  ON knowledge_docs(tenant_id, type, display_order);

-- Backfill content_hash for existing rows so subsequent saves can diff.
UPDATE knowledge_docs
  SET content_hash = encode(digest(coalesce(content, ''), 'sha256'), 'hex')
  WHERE content_hash IS NULL;
