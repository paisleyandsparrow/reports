-- Migration: Add store_id column to user_preferences
-- store_id = Amazon Associate tracking tag, e.g. "jenpaispa-20"
-- store_name = friendly display name, e.g. "Paisley & Sparrow"
-- Run this in Supabase SQL Editor for both staging and prod.

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS store_id text;

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS trial_starts_at timestamptz;
