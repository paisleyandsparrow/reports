-- ============================================================
-- Creator Coders — STAGING full schema
-- Apply this in one shot to a fresh Supabase project via:
--   Supabase Dashboard → SQL Editor → paste → Run
-- ============================================================

-- ── 001: Core tables ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS allowed_emails (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email         text UNIQUE NOT NULL,
  customer_name text,
  notes         text,
  added_at      timestamptz DEFAULT now()
);

ALTER TABLE allowed_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read allowed_emails"
  ON allowed_emails FOR SELECT TO authenticated USING (true);

-- ── user_preferences ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_preferences (
  id                   uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email                text,
  store_name           text,
  categories           text[],
  social_platforms     text[],
  goals                text[],
  default_date_range   text DEFAULT 'last_30_days',
  favorite_campaigns   text[],
  onboarding_complete  boolean DEFAULT false,
  creator_id           text,
  -- 010: stripe billing
  stripe_customer_id   text,
  is_paid              boolean NOT NULL DEFAULT false,
  subscription_status  text NOT NULL DEFAULT 'none',
  trial_ends_at        timestamptz,
  -- 009: automation
  max_campaigns_per_day integer DEFAULT 500,
  max_per_run           integer DEFAULT 100,
  run_start_hour        integer DEFAULT 8,
  run_end_hour          integer DEFAULT 20,
  acceptance_enabled    boolean DEFAULT false,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own preferences"
  ON user_preferences FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "users can insert own preferences"
  ON user_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "users can update own preferences"
  ON user_preferences FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE INDEX IF NOT EXISTS idx_user_preferences_stripe_customer
  ON user_preferences (stripe_customer_id);

-- ── creator_connections_revenue ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS creator_connections_revenue (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date             date NOT NULL,
  campaign_title   text NOT NULL,
  asin             text NOT NULL,
  clicks           integer NOT NULL DEFAULT 0,
  shipped_items    integer NOT NULL DEFAULT 0,
  revenue          numeric NOT NULL DEFAULT 0,
  commission_rate  numeric NOT NULL,
  commission_income numeric NOT NULL DEFAULT 0,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE creator_connections_revenue ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ccr_unique_per_user
  ON creator_connections_revenue (user_id, date, campaign_title, asin);
CREATE INDEX IF NOT EXISTS idx_ccr_user_id
  ON creator_connections_revenue (user_id);

CREATE POLICY "users can read own cc revenue"
  ON creator_connections_revenue FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users can insert own cc revenue"
  ON creator_connections_revenue FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users can update own cc revenue"
  ON creator_connections_revenue FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users can delete own cc revenue"
  ON creator_connections_revenue FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ── cc_campaign_catalog ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cc_campaign_catalog (
  campaign_id          text PRIMARY KEY,
  brand_name           text,
  campaign_name        text,
  campaign_instruction text,
  commission_rate      numeric,
  status               text,
  start_date           date,
  end_date             date,
  first_seen           date NOT NULL DEFAULT CURRENT_DATE,
  last_seen            date NOT NULL DEFAULT CURRENT_DATE,
  raw_data             jsonb,
  asins                text[],
  primary_asin         text,
  browse_nodes         text[],
  social_platforms     text[],
  fully_claimed        boolean DEFAULT false,
  creators_accepted    integer,
  is_selected          boolean DEFAULT false,
  accepted_at          timestamptz,
  image_url            text,
  created_at           timestamptz DEFAULT now()
);

-- ── cc_accept_log ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cc_accept_log (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_date           date NOT NULL UNIQUE,
  campaigns_accepted integer NOT NULL DEFAULT 0,
  created_at         timestamptz DEFAULT now()
);

-- ── user_campaign_queue ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_campaign_queue (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id   text NOT NULL,
  status        text DEFAULT 'pending' CHECK (status IN ('pending','accepted','failed','skipped')),
  marked_at     timestamptz DEFAULT now(),
  accepted_at   timestamptz,
  accepted_date date,
  batch_id      uuid,
  UNIQUE(user_id, campaign_id)
);

ALTER TABLE user_campaign_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can manage own queue"
  ON user_campaign_queue FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_queue_user_status ON user_campaign_queue(user_id, status);

-- ── user_campaign_rules ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_campaign_rules (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  category       text,
  min_commission numeric,
  max_commission numeric,
  brand_contains text,
  enabled        boolean DEFAULT true,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rules_user ON user_campaign_rules(user_id);

-- ── user_integrations ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_integrations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_type text NOT NULL,
  access_token     text,
  ad_account_id    text,
  extra_config     jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, integration_type)
);

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_integrations: own rows only"
  ON public.user_integrations FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER user_integrations_updated_at
  BEFORE UPDATE ON public.user_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Functions ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_earning_summary(days_back integer DEFAULT NULL)
RETURNS TABLE (
  campaign_title text,
  asin_count     integer,
  total_income   numeric,
  total_revenue  numeric,
  total_units    bigint,
  max_rate       numeric,
  top_asin       text
)
LANGUAGE sql SECURITY INVOKER STABLE AS $$
  SELECT
    campaign_title,
    COUNT(DISTINCT asin)::integer                                     AS asin_count,
    SUM(commission_income)                                            AS total_income,
    SUM(revenue)                                                      AS total_revenue,
    SUM(shipped_items)::bigint                                        AS total_units,
    MAX(commission_rate)                                              AS max_rate,
    (array_agg(asin ORDER BY commission_income DESC NULLS LAST))[1]  AS top_asin
  FROM creator_connections_revenue
  WHERE commission_income > 0
    AND (days_back IS NULL OR date >= CURRENT_DATE - days_back)
  GROUP BY campaign_title
  ORDER BY SUM(commission_income) DESC
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.get_earning_summary(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_earning_detail(days_back integer DEFAULT NULL)
RETURNS TABLE (
  campaign_title text,
  asin           text,
  total_income   numeric,
  total_revenue  numeric,
  total_units    bigint,
  max_rate       numeric
)
LANGUAGE sql SECURITY INVOKER STABLE AS $$
  SELECT
    campaign_title,
    asin,
    SUM(commission_income) AS total_income,
    SUM(revenue)           AS total_revenue,
    SUM(shipped_items)::bigint AS total_units,
    MAX(commission_rate)   AS max_rate
  FROM creator_connections_revenue
  WHERE commission_income > 0
    AND (days_back IS NULL OR date >= CURRENT_DATE - days_back)
  GROUP BY campaign_title, asin
  ORDER BY SUM(commission_income) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_earning_detail(integer) TO authenticated;
