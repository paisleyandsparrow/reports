-- ============================================================
-- Creator Coders — STAGING seed data
-- Run AFTER schema.sql and AFTER you've signed in once
-- (so your auth.users row exists).
-- Replace YOUR_USER_ID with your UUID from:
--   Supabase Dashboard → Authentication → Users
-- ============================================================

-- 1. Allow staging emails in
INSERT INTO allowed_emails (email, customer_name, notes)
VALUES
  ('creatorcodersportal@gmail.com', 'Creator Coders (staging)', 'primary staging account')
ON CONFLICT (email) DO NOTHING;

-- 2. Seed user_preferences
--    Uses INSERT ... ON CONFLICT so it works whether the row exists or not.
--    Sign in to the staging portal first so auth.users has the row, then run this.
INSERT INTO user_preferences (
  id, email,
  store_name, store_id, creator_id,
  acceptance_enabled, max_campaigns_per_day, max_per_run,
  onboarding_complete, is_paid, subscription_status,
  trial_starts_at, trial_ends_at
)
SELECT
  u.id,
  'creatorcodersportal@gmail.com',
  'Creator Coders',
  'creatorcoders-20',
  'amzn1.creator.ce51e44c-2eaf-401b-a94a-8a64cd412b82',
  true, 500, 100,
  true, true, 'trialing',
  now(), now() + interval '7 days'
FROM auth.users u
WHERE u.email = 'creatorcodersportal@gmail.com'
ON CONFLICT (id) DO UPDATE SET
  store_name            = EXCLUDED.store_name,
  store_id              = EXCLUDED.store_id,
  creator_id            = EXCLUDED.creator_id,
  acceptance_enabled    = EXCLUDED.acceptance_enabled,
  max_campaigns_per_day = EXCLUDED.max_campaigns_per_day,
  max_per_run           = EXCLUDED.max_per_run,
  onboarding_complete   = EXCLUDED.onboarding_complete,
  is_paid               = EXCLUDED.is_paid,
  subscription_status   = EXCLUDED.subscription_status,
  trial_starts_at       = EXCLUDED.trial_starts_at,
  trial_ends_at         = EXCLUDED.trial_ends_at;

-- 3. Seed 10 fake campaigns into cc_campaign_catalog
INSERT INTO cc_campaign_catalog (campaign_id, brand_name, campaign_name, commission_rate, status, first_seen, last_seen)
VALUES
  ('amzn1.campaign.STAGING001', 'Test Brand A',  'Brand A Summer Collection',  8.0,  'active', CURRENT_DATE, CURRENT_DATE),
  ('amzn1.campaign.STAGING002', 'Test Brand B',  'Brand B Essentials',          5.5,  'active', CURRENT_DATE, CURRENT_DATE),
  ('amzn1.campaign.STAGING003', 'Test Brand C',  'Brand C New Arrivals',        10.0, 'active', CURRENT_DATE, CURRENT_DATE),
  ('amzn1.campaign.STAGING004', 'Test Brand D',  'Brand D Flash Sale',          7.0,  'active', CURRENT_DATE, CURRENT_DATE),
  ('amzn1.campaign.STAGING005', 'Test Brand E',  'Brand E Bestsellers',         6.0,  'active', CURRENT_DATE, CURRENT_DATE),
  ('amzn1.campaign.STAGING006', 'Test Brand F',  'Brand F Premium Line',        12.0, 'active', CURRENT_DATE, CURRENT_DATE),
  ('amzn1.campaign.STAGING007', 'Test Brand G',  'Brand G Everyday Deals',      4.5,  'active', CURRENT_DATE, CURRENT_DATE),
  ('amzn1.campaign.STAGING008', 'Test Brand H',  'Brand H Limited Edition',     9.0,  'active', CURRENT_DATE, CURRENT_DATE),
  ('amzn1.campaign.STAGING009', 'Test Brand I',  'Brand I Seasonal Picks',      7.5,  'active', CURRENT_DATE, CURRENT_DATE),
  ('amzn1.campaign.STAGING010', 'Test Brand J',  'Brand J Creator Exclusive',   11.0, 'active', CURRENT_DATE, CURRENT_DATE)
ON CONFLICT (campaign_id) DO NOTHING;

-- 4. Seed those 10 campaigns into the user queue
--    Run after user_preferences row exists (sign in first).
INSERT INTO user_campaign_queue (user_id, campaign_id, status)
SELECT
  up.id,
  c.campaign_id,
  'pending'
FROM cc_campaign_catalog c
CROSS JOIN user_preferences up
WHERE up.email = 'creatorcodersportal@gmail.com'
  AND c.campaign_id LIKE 'amzn1.campaign.STAGING%'
ON CONFLICT (user_id, campaign_id) DO NOTHING;
