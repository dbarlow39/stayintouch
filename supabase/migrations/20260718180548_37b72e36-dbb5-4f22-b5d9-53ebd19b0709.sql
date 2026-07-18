
-- Jobs table
CREATE TABLE public.marketing_plan_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_lead_id UUID NOT NULL,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  current_stage TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  list_price NUMERIC,
  target_on_market_date DATE,
  unusual_notes TEXT,
  mls_paste TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_plan_jobs TO authenticated;
GRANT ALL ON public.marketing_plan_jobs TO service_role;
ALTER TABLE public.marketing_plan_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own marketing plan jobs" ON public.marketing_plan_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_mpj_seller_lead ON public.marketing_plan_jobs(seller_lead_id);
CREATE INDEX idx_mpj_user ON public.marketing_plan_jobs(user_id);

-- Documents uploaded per job
CREATE TABLE public.marketing_plan_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.marketing_plan_jobs(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_plan_documents TO authenticated;
GRANT ALL ON public.marketing_plan_documents TO service_role;
ALTER TABLE public.marketing_plan_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own marketing plan documents" ON public.marketing_plan_documents
  FOR ALL USING (EXISTS (SELECT 1 FROM public.marketing_plan_jobs j WHERE j.id = job_id AND j.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.marketing_plan_jobs j WHERE j.id = job_id AND j.user_id = auth.uid()));
CREATE INDEX idx_mpd_job ON public.marketing_plan_documents(job_id);

-- Stage results
CREATE TABLE public.marketing_plan_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.marketing_plan_jobs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, stage)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_plan_results TO authenticated;
GRANT ALL ON public.marketing_plan_results TO service_role;
ALTER TABLE public.marketing_plan_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own marketing plan results" ON public.marketing_plan_results
  FOR ALL USING (EXISTS (SELECT 1 FROM public.marketing_plan_jobs j WHERE j.id = job_id AND j.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.marketing_plan_jobs j WHERE j.id = job_id AND j.user_id = auth.uid()));
CREATE INDEX idx_mpr_job ON public.marketing_plan_results(job_id);

-- Updated_at trigger for jobs
CREATE TRIGGER update_mpj_updated_at BEFORE UPDATE ON public.marketing_plan_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
