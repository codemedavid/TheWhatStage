ALTER TABLE action_pages ADD COLUMN cta_text TEXT;

COMMENT ON COLUMN action_pages.cta_text IS 'Default call-to-action text shown above the Messenger button';
