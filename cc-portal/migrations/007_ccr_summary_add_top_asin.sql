-- Migration 007: Add top_asin to get_earning_summary
--
-- Returns the ASIN with the highest single-row commission_income within the campaign.
-- Used by EarningCard to show a product photo via the Amazon CDN.

DROP FUNCTION IF EXISTS public.get_earning_summary(integer);

CREATE OR REPLACE FUNCTION public.get_earning_summary(days_back integer DEFAULT NULL)
RETURNS TABLE (
  campaign_title  text,
  asin_count      integer,
  total_income    numeric,
  total_revenue   numeric,
  total_units     bigint,
  max_rate        numeric,
  top_asin        text
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT
    campaign_title,
    COUNT(DISTINCT asin)::integer                                          AS asin_count,
    SUM(commission_income)                                                 AS total_income,
    SUM(revenue)                                                           AS total_revenue,
    SUM(shipped_items)::bigint                                             AS total_units,
    MAX(commission_rate)                                                   AS max_rate,
    (array_agg(asin ORDER BY commission_income DESC NULLS LAST))[1]       AS top_asin
  FROM creator_connections_revenue
  WHERE commission_income > 0
    AND (days_back IS NULL OR date >= CURRENT_DATE - days_back)
  GROUP BY campaign_title
  ORDER BY SUM(commission_income) DESC
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.get_earning_summary(integer) TO authenticated;
