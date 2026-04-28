-- Add last_follow_up_at sentinel to conversations so the drop-off scanner
-- can avoid sending duplicate follow-ups within the same threshold window.
alter table conversations
  add column last_follow_up_at timestamptz null;
