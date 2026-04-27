-- Add creator_id to user_preferences so the CC acceptance link is personalized per user.
-- Safe to run multiple times (IF NOT EXISTS guard).

ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS creator_id text;
