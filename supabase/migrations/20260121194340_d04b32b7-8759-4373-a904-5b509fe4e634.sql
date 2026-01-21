-- Add annual_taxes column to clients table to cache Estated API results
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS annual_taxes NUMERIC;