CREATE TABLE public.worksheet_access_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,
  code TEXT NOT NULL UNIQUE,
  property_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  revoked BOOLEAN NOT NULL DEFAULT false,
  last_opened_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ
);

CREATE INDEX idx_worksheet_access_codes_inspection ON public.worksheet_access_codes(inspection_id);
CREATE INDEX idx_worksheet_access_codes_agent ON public.worksheet_access_codes(agent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.worksheet_access_codes TO authenticated;
GRANT ALL ON public.worksheet_access_codes TO service_role;

ALTER TABLE public.worksheet_access_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents view own worksheet codes"
  ON public.worksheet_access_codes FOR SELECT TO authenticated
  USING (agent_id = auth.uid());

CREATE POLICY "Agents create own worksheet codes"
  ON public.worksheet_access_codes FOR INSERT TO authenticated
  WITH CHECK (agent_id = auth.uid());

CREATE POLICY "Agents update own worksheet codes"
  ON public.worksheet_access_codes FOR UPDATE TO authenticated
  USING (agent_id = auth.uid()) WITH CHECK (agent_id = auth.uid());

CREATE POLICY "Agents delete own worksheet codes"
  ON public.worksheet_access_codes FOR DELETE TO authenticated
  USING (agent_id = auth.uid());
