
-- 1. Dropbox tokens table (per-agent OAuth)
CREATE TABLE public.dropbox_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  account_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dropbox_tokens TO authenticated;
GRANT ALL ON public.dropbox_tokens TO service_role;

ALTER TABLE public.dropbox_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents can view their own dropbox tokens"
  ON public.dropbox_tokens FOR SELECT
  USING (auth.uid() = agent_id);

CREATE POLICY "Agents can insert their own dropbox tokens"
  ON public.dropbox_tokens FOR INSERT
  WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Agents can update their own dropbox tokens"
  ON public.dropbox_tokens FOR UPDATE
  USING (auth.uid() = agent_id);

CREATE POLICY "Agents can delete their own dropbox tokens"
  ON public.dropbox_tokens FOR DELETE
  USING (auth.uid() = agent_id);

CREATE POLICY "Admins can view all dropbox tokens"
  ON public.dropbox_tokens FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_dropbox_tokens_updated_at
  BEFORE UPDATE ON public.dropbox_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Track Dropbox upload status on closings
ALTER TABLE public.closings
  ADD COLUMN dropbox_upload_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN dropbox_file_path TEXT;

CREATE INDEX idx_closings_dropbox_status
  ON public.closings (dropbox_upload_status)
  WHERE dropbox_upload_status IN ('pending', 'failed');
