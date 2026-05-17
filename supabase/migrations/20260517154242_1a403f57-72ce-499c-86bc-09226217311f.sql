ALTER TABLE public.estimated_net_properties
  ADD COLUMN IF NOT EXISTS parent_offer_id uuid NULL REFERENCES public.estimated_net_properties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS offer_label text NULL,
  ADD COLUMN IF NOT EXISTS escalation_cap numeric NULL,
  ADD COLUMN IF NOT EXISTS appraisal_gap numeric NULL;

CREATE INDEX IF NOT EXISTS idx_estimated_net_properties_parent_offer_id
  ON public.estimated_net_properties(parent_offer_id);