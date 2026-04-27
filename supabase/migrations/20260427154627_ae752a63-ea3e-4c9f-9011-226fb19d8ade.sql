ALTER TABLE public.closings
  ADD COLUMN IF NOT EXISTS representation TEXT,
  ADD COLUMN IF NOT EXISTS paperwork_checklist JSONB NOT NULL DEFAULT '{}'::jsonb;