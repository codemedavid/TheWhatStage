ALTER TABLE campaigns
  ADD COLUMN campaign_plan jsonb DEFAULT NULL,
  ADD COLUMN campaign_rules text[] DEFAULT '{}';

COMMENT ON COLUMN campaigns.campaign_plan IS 'Strategic blueprint: goal_summary, selling_approach, buyer_context, key_behaviors, phase_outline';
COMMENT ON COLUMN campaigns.campaign_rules IS 'Plain-language rules applied across all phases of this campaign';
