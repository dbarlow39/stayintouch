ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS mls_description text,
  ADD COLUMN IF NOT EXISTS mls_description_claude text,
  ADD COLUMN IF NOT EXISTS mls_description_final text;