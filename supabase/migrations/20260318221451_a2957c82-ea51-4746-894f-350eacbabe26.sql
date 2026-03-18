
CREATE TABLE public.market_analysis_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text NOT NULL DEFAULT 'source_doc',
  mime_type text,
  document_label text,
  analysis_json jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.market_analysis_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents can view their own market analysis files"
  ON public.market_analysis_files FOR SELECT
  TO authenticated
  USING (auth.uid() = agent_id);

CREATE POLICY "Agents can insert their own market analysis files"
  ON public.market_analysis_files FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Agents can delete their own market analysis files"
  ON public.market_analysis_files FOR DELETE
  TO authenticated
  USING (auth.uid() = agent_id);
