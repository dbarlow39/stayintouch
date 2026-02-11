
-- Create table to store Facebook OAuth tokens per agent
CREATE TABLE public.facebook_oauth_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  page_id TEXT,
  page_name TEXT,
  page_access_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.facebook_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- RLS policies: agents can only access their own tokens
CREATE POLICY "Users can view their own facebook tokens"
  ON public.facebook_oauth_tokens FOR SELECT
  USING (agent_id = auth.uid()::text);

CREATE POLICY "Users can insert their own facebook tokens"
  ON public.facebook_oauth_tokens FOR INSERT
  WITH CHECK (agent_id = auth.uid()::text);

CREATE POLICY "Users can update their own facebook tokens"
  ON public.facebook_oauth_tokens FOR UPDATE
  USING (agent_id = auth.uid()::text);

CREATE POLICY "Users can delete their own facebook tokens"
  ON public.facebook_oauth_tokens FOR DELETE
  USING (agent_id = auth.uid()::text);

-- Trigger for updated_at
CREATE TRIGGER update_facebook_oauth_tokens_updated_at
  BEFORE UPDATE ON public.facebook_oauth_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
