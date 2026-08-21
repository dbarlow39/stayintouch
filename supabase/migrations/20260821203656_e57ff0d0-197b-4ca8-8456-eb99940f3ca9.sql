ALTER TABLE public.closings
  ADD COLUMN IF NOT EXISTS paperwork_unverified jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS paperwork_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS paperwork_audit jsonb;