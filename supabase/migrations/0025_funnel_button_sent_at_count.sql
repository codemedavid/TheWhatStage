-- Tracks the funnel_message_count value at the moment the action button was
-- last sent in the current step. NULL = button not yet sent. Used by the
-- engine to compute "messages since button" for stalemate/escalation logic.
alter table conversations
  add column funnel_button_sent_at_count integer null;
