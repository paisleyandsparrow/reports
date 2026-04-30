-- Migration 010: Stripe billing fields on user_preferences
-- Run in Supabase SQL editor

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS stripe_customer_id  TEXT,
  ADD COLUMN IF NOT EXISTS is_paid             BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS trial_ends_at       TIMESTAMPTZ;

-- Index for webhook lookups by stripe_customer_id
CREATE INDEX IF NOT EXISTS idx_user_preferences_stripe_customer
  ON user_preferences (stripe_customer_id);
