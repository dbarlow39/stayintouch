ALTER TABLE public.marketing_plan_jobs
  ADD COLUMN IF NOT EXISTS tweak_status TEXT,
  ADD COLUMN IF NOT EXISTS tweak_error TEXT,
  ADD COLUMN IF NOT EXISTS tweak_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tweak_updated_at TIMESTAMPTZ;