ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS mls_description_claude text,
  ADD COLUMN IF NOT EXISTS mls_description_final text;