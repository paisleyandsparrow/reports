-- Migration 006: Revamp earning summary functions
--
-- Changes:
--   1. Replace get_earning_summary → campaign-level grouping (no asin), LIMIT 20
--      (powers the "Already Earning" strip on the main page)
--   2. Add get_earning_detail → per (campaign_title, asin), no limit
--      (powers the full /earnings detail page)
--
-- NOTE: must DROP first because return type changed (removed asin col, added asin_count)

DROP FUNCTION IF EXISTS public.get_earning_summary(integer);

CREATE OR REPLACE FUNCTION public.get_earning_summary(days_back integer DEFAULT NULL)
RETURNS TABLE (
  campaign_title  text,
  asin_count      integer,
  total_income    numeric,
  total_revenue   numeric,
  total_units     bigint,
  max_rate        numeric
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT
    campaign_title,
    COUNT(DISTINCT asin)::integer   AS asin_count,
    SUM(commission_income)          AS total_income,
    SUM(revenue)                    AS total_revenue,
    SUM(shipped_items)::bigint      AS total_units,
    MAX(commission_rate)            AS max_rate
  FROM creator_connections_revenue
  WHERE commission_income > 0
    AND (days_back IS NULL OR date >= CURRENT_DATE - days_back)
  GROUP BY campaign_title
  ORDER BY SUM(commission_income) DESC
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.get_earning_summary(integer) TO authenticated;

-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_earning_detail(days_back integer DEFAULT NULL)
RETURNS TABLE (
  campaign_title  text,
  asin            text,
  total_income    numeric,
  total_revenue   numeric,
  total_units     bigint,
  max_rate        numeric
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT
    campaign_title,
    asin,
    SUM(commission_income)          AS total_income,
    SUM(revenue)                    AS total_revenue,
    SUM(shipped_items)::bigint      AS total_units,
    MAX(commission_rate)            AS max_rate
  FROM creator_connections_revenue
  WHERE commission_income > 0
    AND (days_back IS NULL OR date >= CURRENT_DATE - days_back)
  GROUP BY campaign_title, asin
  ORDER BY SUM(commission_income) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_earning_detail(integer) TO authenticated;
