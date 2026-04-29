-- Migration 009: Bulk acceptance automation
-- Adds automation settings to user_preferences and creates queue + rules tables.

-- Add automation columns to user_preferences
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS max_campaigns_per_day integer DEFAULT 500,
  ADD COLUMN IF NOT EXISTS max_per_run           integer DEFAULT 100,
  ADD COLUMN IF NOT EXISTS run_start_hour        integer DEFAULT 8,
  ADD COLUMN IF NOT EXISTS run_end_hour          integer DEFAULT 20,
  ADD COLUMN IF NOT EXISTS acceptance_enabled    boolean DEFAULT false;

-- Campaign queue (tracks pending/accepted/failed per user)
CREATE TABLE IF NOT EXISTS user_campaign_queue (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id  text        NOT NULL,
  status       text        DEFAULT 'pending' CHECK (status IN ('pending','accepted','failed','skipped')),
  marked_at    timestamptz DEFAULT now(),
  accepted_at  timestamptz,
  accepted_date date,
  batch_id     uuid,
  UNIQUE(user_id, campaign_id)
);

-- Auto-accept rules (filter by category, commission, brand)
CREATE TABLE IF NOT EXISTS user_campaign_rules (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  category        text,
  min_commission  numeric,
  max_commission  numeric,
  brand_contains  text,
  enabled         boolean     DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_queue_user_status ON user_campaign_queue(user_id, status);
CREATE INDEX IF NOT EXISTS idx_rules_user        ON user_campaign_rules(user_id);
