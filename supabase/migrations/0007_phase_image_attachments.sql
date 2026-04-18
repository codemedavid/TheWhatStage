-- Phase 7: Allow tenants to attach knowledge images to individual phases.
-- The conversation engine uses these IDs to include relevant images in the
-- LLM prompt when a lead is in that phase.

alter table bot_flow_phases
  add column image_attachment_ids uuid[] not null default '{}';
