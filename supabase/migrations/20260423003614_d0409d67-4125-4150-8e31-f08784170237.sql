CREATE TABLE public.auto_email_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL,
  gmail_message_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'skipped', 'error')),
  reason TEXT,
  parsed_data JSONB DEFAULT '{}'::jsonb,
  recipient_emails TEXT[],
  client_id UUID,
  source_subject TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_auto_email_log_unique_trigger 
  ON public.auto_email_log(gmail_message_id, keyword);

CREATE INDEX idx_auto_email_log_agent ON public.auto_email_log(agent_id, created_at DESC);

ALTER TABLE public.auto_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents can view their own auto email log"
ON public.auto_email_log
FOR SELECT
TO authenticated
USING (auth.uid() = agent_id);
