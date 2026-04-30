ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS mls_description_notes TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS mls_description_notes TEXT;