CREATE TABLE public.listings_pending_removal (
  mls_number text PRIMARY KEY,
  first_missed_at timestamptz NOT NULL DEFAULT now(),
  cached_listing jsonb NOT NULL
);

ALTER TABLE public.listings_pending_removal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read pending removals"
ON public.listings_pending_removal
FOR SELECT
USING (true);