-- Aggregated earning summary for the current authenticated user.
-- Uses SECURITY INVOKER so RLS on creator_connections_revenue applies automatically
-- (only rows where user_id = auth.uid() are visible).
-- days_back = NULL → all time, otherwise last N days.

CREATE OR REPLACE FUNCTION public.get_earning_summary(days_back integer DEFAULT NULL)
RETURNS TABLE (
  campaign_title text,
  asin          text,
  total_income  numeric,
  total_revenue numeric,
  total_units   bigint,
  max_rate      numeric
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT
    campaign_title,
    asin,
    SUM(commission_income)     AS total_income,
    SUM(revenue)               AS total_revenue,
    SUM(shipped_items)::bigint AS total_units,
    MAX(commission_rate)       AS max_rate
  FROM creator_connections_revenue
  WHERE commission_income > 0
    AND (days_back IS NULL OR date >= CURRENT_DATE - days_back)
  GROUP BY campaign_title, asin
  ORDER BY SUM(commission_income) DESC;
$$;

-- Grant execute to authenticated users (anon key + session)
GRANT EXECUTE ON FUNCTION public.get_earning_summary(integer) TO authenticated;
