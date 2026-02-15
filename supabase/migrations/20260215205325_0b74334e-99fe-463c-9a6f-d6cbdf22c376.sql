
-- Create a single-row cache table for public listings
CREATE TABLE public.listings_cache (
  id TEXT PRIMARY KEY DEFAULT 'current',
  listings JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.listings_cache ENABLE ROW LEVEL SECURITY;

-- Public read access (no auth required for public listings page)
CREATE POLICY "Anyone can read listings cache"
  ON public.listings_cache
  FOR SELECT
  USING (true);

-- Only service role can write (via edge function)
-- No insert/update/delete policies for anon/authenticated users
