-- Migration 008: user_integrations table
--
-- Stores per-user API credentials for third-party integrations (Meta Ads, etc.)
-- The token is protected by RLS — each user can only read/write their own row.
-- The access_token never needs to leave the client/server pair that owns it.

CREATE TABLE IF NOT EXISTS public.user_integrations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_type text NOT NULL,            -- e.g. 'meta_ads'
  access_token     text,                     -- Meta long-lived access token
  ad_account_id    text,                     -- e.g. 'act_123456789'
  extra_config     jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, integration_type)
);

-- Row-level security: users can only touch their own rows
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_integrations: own rows only"
  ON public.user_integrations
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at on changes
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_integrations_updated_at
  BEFORE UPDATE ON public.user_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
