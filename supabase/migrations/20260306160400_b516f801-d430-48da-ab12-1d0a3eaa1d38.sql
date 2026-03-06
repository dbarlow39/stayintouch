CREATE TABLE public.inspection_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  inspection_data jsonb,
  photos jsonb,
  property_address text,
  saved_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.inspection_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own inspection history"
  ON public.inspection_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own inspection history"
  ON public.inspection_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_inspection_history_inspection_id ON public.inspection_history(inspection_id);
CREATE INDEX idx_inspection_history_saved_at ON public.inspection_history(saved_at DESC);