CREATE TABLE public.lead_love_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,
  token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  token_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  responses JSONB,
  sent_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_love_responses TO authenticated;
GRANT ALL ON public.lead_love_responses TO service_role;

ALTER TABLE public.lead_love_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents manage their own love responses"
  ON public.lead_love_responses
  FOR ALL
  USING (auth.uid() = agent_id)
  WITH CHECK (auth.uid() = agent_id);

CREATE INDEX idx_lead_love_responses_lead_id ON public.lead_love_responses(lead_id);
CREATE INDEX idx_lead_love_responses_token ON public.lead_love_responses(token);

CREATE TRIGGER update_lead_love_responses_updated_at
  BEFORE UPDATE ON public.lead_love_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();