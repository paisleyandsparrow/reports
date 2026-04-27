-- Add user_id to creator_connections_revenue for multi-user support.
--
-- ════════════════════════════════════════════════════════════════════════════
-- RUN THESE STEPS IN ORDER:
--
-- STEP A (run immediately, before anything else):
--   UPDATE user_preferences
--   SET creator_id = 'test-adam'
--   WHERE email = 'woloadam12@gmail.com';
--
-- STEP B: Invite Jen via Supabase Dashboard → Authentication → Users → Invite.
--   Have her sign in so the portal creates her user_preferences row.
--   Confirm with: SELECT id, email FROM user_preferences;
--
-- STEP C: Fill in Jen's email below, then run this migration file.
--
-- STEP D: Adam uploads the CSV through the portal → rows land under Adam's
--   account as test data. Same campaign data as Jen's, zero conflict because
--   user_id differs in the unique index.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Step 1: Add user_id column (nullable initially) ────────────────────────
ALTER TABLE creator_connections_revenue
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- ─── Step 2: Backfill existing rows to Jen ──────────────────────────────────
-- All rows currently in the table were scraped for Jen. Assign them to her.
-- Replace 'jen@example.com' with Jen's actual email before running.
UPDATE creator_connections_revenue
SET user_id = (SELECT id FROM user_preferences WHERE email = 'garydflavin@gmail.com')
WHERE user_id IS NULL;

-- ─── Step 3: Enforce NOT NULL ────────────────────────────────────────────────
-- Will fail intentionally if Step 2 matched 0 rows (wrong email or Jen hasn't
-- onboarded yet). Fix the email or complete Step B above, then retry.
ALTER TABLE creator_connections_revenue
  ALTER COLUMN user_id SET NOT NULL;

-- ─── Step 4: Drop ALL existing unique constraints ────────────────────────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'creator_connections_revenue'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE 'ALTER TABLE creator_connections_revenue DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

-- ─── Step 5: New composite unique index ─────────────────────────────────────
-- (user_id, date, campaign_title, asin) — allows Adam and Jen to hold the
-- same campaign rows independently under their own accounts.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ccr_unique_per_user
  ON creator_connections_revenue (user_id, date, campaign_title, asin);

-- ─── Step 6: Index for fast per-user lookups ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ccr_user_id
  ON creator_connections_revenue (user_id);
