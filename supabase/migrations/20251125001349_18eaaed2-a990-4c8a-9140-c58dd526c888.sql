-- Add new columns to clients table for all CSV headers
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS status text,
ADD COLUMN IF NOT EXISTS mls_id text,
ADD COLUMN IF NOT EXISTS street_number text,
ADD COLUMN IF NOT EXISTS street_name text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS state text,
ADD COLUMN IF NOT EXISTS zip text,
ADD COLUMN IF NOT EXISTS price numeric,
ADD COLUMN IF NOT EXISTS home_phone text,
ADD COLUMN IF NOT EXISTS cell_phone text,
ADD COLUMN IF NOT EXISTS listing_date date,
ADD COLUMN IF NOT EXISTS cbs text,
ADD COLUMN IF NOT EXISTS showing_type text,
ADD COLUMN IF NOT EXISTS lock_box text,
ADD COLUMN IF NOT EXISTS combo text,
ADD COLUMN IF NOT EXISTS location text,
ADD COLUMN IF NOT EXISTS special_instructions text,
ADD COLUMN IF NOT EXISTS agent text;

-- Create indexes on commonly queried fields
CREATE INDEX IF NOT EXISTS idx_clients_mls_id ON public.clients(mls_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON public.clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_listing_date ON public.clients(listing_date);