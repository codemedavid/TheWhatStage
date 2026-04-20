-- 0014_automated_onboarding.sql
-- Adds onboarding_generations table and new tenant columns for automated onboarding

-- New columns on tenants
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS business_description text,
  ADD COLUMN IF NOT EXISTS main_action text,
  ADD COLUMN IF NOT EXISTS differentiator text,
  ADD COLUMN IF NOT EXISTS qualification_criteria text,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Onboarding generation tracking with checkpoint retry
CREATE TABLE IF NOT EXISTS onboarding_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  input jsonb NOT NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  checkpoint text
    CHECK (checkpoint IN ('context', 'campaign', 'parallel', 'embeddings', 'persisted')),
  results jsonb NOT NULL DEFAULT '{}',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_onboarding_generations_user ON onboarding_generations(user_id);
CREATE INDEX idx_onboarding_generations_status ON onboarding_generations(status)
  WHERE status = 'running';

-- RLS: users can only see their own generations
ALTER TABLE onboarding_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own generations"
  ON onboarding_generations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own generations"
  ON onboarding_generations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role can do everything (for the orchestrator)
CREATE POLICY "Service role full access"
  ON onboarding_generations FOR ALL
  USING (auth.role() = 'service_role');
