
-- 1. clients.source_lead_id
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS source_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_clients_source_lead_id ON public.clients(source_lead_id);

-- 2. market_analysis_files: make lead_id nullable, swap CASCADE -> SET NULL, add client_id
ALTER TABLE public.market_analysis_files ALTER COLUMN lead_id DROP NOT NULL;
ALTER TABLE public.market_analysis_files DROP CONSTRAINT IF EXISTS market_analysis_files_lead_id_fkey;
ALTER TABLE public.market_analysis_files
  ADD CONSTRAINT market_analysis_files_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;

ALTER TABLE public.market_analysis_files
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_market_analysis_files_client_id ON public.market_analysis_files(client_id);

-- 3. inspections: add lead_id and client_id (both SET NULL)
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inspections_lead_id ON public.inspections(lead_id);
CREATE INDEX IF NOT EXISTS idx_inspections_client_id ON public.inspections(client_id);
