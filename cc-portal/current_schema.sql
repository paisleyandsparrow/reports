-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.ad_daily_results (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  date date NOT NULL,
  ad_set_name text NOT NULL,
  tracking_id text,
  spend numeric NOT NULL DEFAULT 0,
  earnings numeric NOT NULL DEFAULT 0,
  ordered_revenue numeric NOT NULL DEFAULT 0,
  shipped_revenue numeric NOT NULL DEFAULT 0,
  roi numeric,
  has_match boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ad_daily_results_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ad_placement_daily (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  date date NOT NULL,
  adset_name text NOT NULL,
  adset_id text,
  publisher_platform text NOT NULL,
  platform_position text NOT NULL,
  spend numeric NOT NULL,
  clicks integer NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  ctr numeric NOT NULL DEFAULT 0,
  cpc numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ad_placement_daily_pkey PRIMARY KEY (id)
);
CREATE TABLE public.allowed_emails (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  customer_name text,
  notes text,
  added_at timestamp with time zone DEFAULT now(),
  CONSTRAINT allowed_emails_pkey PRIMARY KEY (id)
);
CREATE TABLE public.cc_accept_log (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  run_date date NOT NULL UNIQUE,
  campaigns_accepted integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cc_accept_log_pkey PRIMARY KEY (id)
);
CREATE TABLE public.cc_campaign_catalog (
  campaign_id text NOT NULL,
  brand_name text,
  commission_rate numeric,
  status text,
  start_date date,
  end_date date,
  first_seen date NOT NULL,
  last_seen date NOT NULL,
  raw_data jsonb,
  created_at timestamp with time zone DEFAULT now(),
  campaign_name text,
  campaign_instruction text,
  asins ARRAY,
  primary_asin text,
  browse_nodes ARRAY,
  social_platforms ARRAY,
  fully_claimed boolean DEFAULT false,
  creators_accepted integer,
  is_selected boolean DEFAULT false,
  accepted_at timestamp with time zone,
  image_url text,
  CONSTRAINT cc_campaign_catalog_pkey PRIMARY KEY (campaign_id)
);
CREATE TABLE public.cc_data_changes (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  checked_at date NOT NULL,
  date date NOT NULL,
  campaign_title text NOT NULL,
  asin text NOT NULL,
  change_type text NOT NULL,
  old_commission_income numeric,
  new_commission_income numeric,
  old_revenue numeric,
  new_revenue numeric,
  delta_income numeric,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cc_data_changes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.creator_connections_revenue (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  date date NOT NULL,
  campaign_title text NOT NULL,
  asin text NOT NULL,
  clicks integer NOT NULL DEFAULT 0,
  shipped_items integer NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  commission_rate numeric NOT NULL,
  commission_income numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT creator_connections_revenue_pkey PRIMARY KEY (id)
);
CREATE TABLE public.run_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  run_at timestamp with time zone NOT NULL DEFAULT now(),
  date_reported date NOT NULL,
  rows_written integer NOT NULL DEFAULT 0,
  success boolean NOT NULL,
  error text,
  CONSTRAINT run_log_pkey PRIMARY KEY (id)
);
CREATE TABLE public.tracking_id_daily (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  date date NOT NULL,
  tracking_id text NOT NULL,
  earnings numeric NOT NULL DEFAULT 0,
  shipped_revenue numeric NOT NULL DEFAULT 0,
  ordered_revenue numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tracking_id_daily_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_preferences (
  id uuid NOT NULL,
  email text,
  store_name text,
  categories ARRAY,
  social_platforms ARRAY,
  goals ARRAY,
  default_date_range text DEFAULT 'last_30_days'::text,
  favorite_campaigns ARRAY,
  onboarding_complete boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_preferences_pkey PRIMARY KEY (id),
  CONSTRAINT user_preferences_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);