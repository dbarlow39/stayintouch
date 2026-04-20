ALTER TABLE public.market_analysis_files
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'storage',
  ADD COLUMN IF NOT EXISTS inline_data jsonb,
  ALTER COLUMN file_path DROP NOT NULL;