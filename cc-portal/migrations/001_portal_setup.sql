-- ============================================================
-- CC Portal: New tables only — existing tables are NOT modified
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- 1. allowed_emails — admin controls who can access the portal
CREATE TABLE IF NOT EXISTS allowed_emails (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email        text UNIQUE NOT NULL,
  customer_name text,
  notes        text,
  added_at     timestamptz DEFAULT now()
);

ALTER TABLE allowed_emails ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read (to check if their own email is allowed)
CREATE POLICY "authenticated users can read allowed_emails"
  ON allowed_emails FOR SELECT
  TO authenticated
  USING (true);

-- 2. user_preferences — per-user onboarding data and portal settings
CREATE TABLE IF NOT EXISTS user_preferences (
  id                  uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email               text,
  store_name          text,
  categories          text[],
  social_platforms    text[],
  goals               text[],
  default_date_range  text DEFAULT 'last_30_days',
  favorite_campaigns  text[],
  onboarding_complete boolean DEFAULT false,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own preferences"
  ON user_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "users can insert own preferences"
  ON user_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "users can update own preferences"
  ON user_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);
