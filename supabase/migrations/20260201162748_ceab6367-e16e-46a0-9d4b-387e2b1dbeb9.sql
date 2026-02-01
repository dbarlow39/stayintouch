-- Add source_email_id column if it doesn't exist
ALTER TABLE public.suggested_tasks
ADD COLUMN IF NOT EXISTS source_email_id uuid REFERENCES public.client_email_logs(id);

-- Create index for faster lookups on source_email_id
CREATE INDEX IF NOT EXISTS idx_suggested_tasks_source_email_id
ON public.suggested_tasks(source_email_id);

-- Create index for status lookups
CREATE INDEX IF NOT EXISTS idx_suggested_tasks_status
ON public.suggested_tasks(status, agent_id);
