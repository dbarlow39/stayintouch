-- Table to store Gmail OAuth tokens per agent
CREATE TABLE public.gmail_oauth_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMP WITH TIME ZONE NOT NULL,
  email_address TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gmail_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- RLS policies - agents can only see/manage their own tokens
CREATE POLICY "Agents can view their own Gmail tokens"
  ON public.gmail_oauth_tokens FOR SELECT
  USING (auth.uid() = agent_id);

CREATE POLICY "Agents can insert their own Gmail tokens"
  ON public.gmail_oauth_tokens FOR INSERT
  WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Agents can update their own Gmail tokens"
  ON public.gmail_oauth_tokens FOR UPDATE
  USING (auth.uid() = agent_id);

CREATE POLICY "Agents can delete their own Gmail tokens"
  ON public.gmail_oauth_tokens FOR DELETE
  USING (auth.uid() = agent_id);

-- Table to store email logs per client
CREATE TABLE public.client_email_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  gmail_message_id TEXT NOT NULL UNIQUE,
  thread_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT,
  snippet TEXT,
  body_preview TEXT,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_read BOOLEAN DEFAULT false,
  labels TEXT[],
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_email_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies - agents can only see/manage their own email logs
CREATE POLICY "Agents can view their own email logs"
  ON public.client_email_logs FOR SELECT
  USING (auth.uid() = agent_id);

CREATE POLICY "Agents can insert their own email logs"
  ON public.client_email_logs FOR INSERT
  WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Agents can update their own email logs"
  ON public.client_email_logs FOR UPDATE
  USING (auth.uid() = agent_id);

CREATE POLICY "Agents can delete their own email logs"
  ON public.client_email_logs FOR DELETE
  USING (auth.uid() = agent_id);

-- Create indexes for performance
CREATE INDEX idx_client_email_logs_client ON public.client_email_logs(client_id);
CREATE INDEX idx_client_email_logs_agent ON public.client_email_logs(agent_id);
CREATE INDEX idx_client_email_logs_received ON public.client_email_logs(received_at DESC);
CREATE INDEX idx_client_email_logs_gmail_id ON public.client_email_logs(gmail_message_id);

-- Trigger for updated_at on gmail_oauth_tokens
CREATE TRIGGER update_gmail_oauth_tokens_updated_at
  BEFORE UPDATE ON public.gmail_oauth_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();