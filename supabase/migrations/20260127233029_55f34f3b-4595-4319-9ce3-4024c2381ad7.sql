-- Add source email reference to suggested_tasks
ALTER TABLE public.suggested_tasks 
ADD COLUMN source_email_id uuid REFERENCES public.client_email_logs(id),
ADD COLUMN gmail_message_id text;