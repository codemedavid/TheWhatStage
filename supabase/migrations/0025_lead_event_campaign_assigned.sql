-- Add campaign_assigned to lead_event_type so we can log when a lead is
-- routed into a campaign (primary fallback chain or experiment variant).
ALTER TYPE lead_event_type ADD VALUE IF NOT EXISTS 'campaign_assigned';
