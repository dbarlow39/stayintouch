-- Add showing metrics columns to clients table
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS showings_to_date integer,
ADD COLUMN IF NOT EXISTS days_on_market integer;