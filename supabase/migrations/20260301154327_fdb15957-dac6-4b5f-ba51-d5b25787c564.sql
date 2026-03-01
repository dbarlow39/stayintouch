
-- Store recently removed listings so they can be recognized if they reappear within 24 hours
CREATE TABLE public.removed_listings_memory (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mls_number text NOT NULL,
  listing_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  removed_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '24 hours')
);

-- Index for fast lookup by MLS number
CREATE INDEX idx_removed_listings_mls ON public.removed_listings_memory (mls_number);

-- Index for cleanup queries
CREATE INDEX idx_removed_listings_expires ON public.removed_listings_memory (expires_at);

-- Enable RLS (service role only - edge function writes/reads)
ALTER TABLE public.removed_listings_memory ENABLE ROW LEVEL SECURITY;

-- No public policies needed - only service role accesses this table
