-- RLS policies for creator_connections_revenue.
-- Each user can only read/write their own rows (user_id = auth.uid()).

ALTER TABLE creator_connections_revenue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own cc revenue"
  ON creator_connections_revenue FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users can insert own cc revenue"
  ON creator_connections_revenue FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update own cc revenue"
  ON creator_connections_revenue FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users can delete own cc revenue"
  ON creator_connections_revenue FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
