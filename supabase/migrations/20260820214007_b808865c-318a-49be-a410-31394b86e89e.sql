CREATE TABLE public.paperwork_sync_messages (
  message_id text PRIMARY KEY,
  agent_id uuid,
  subject text,
  status text NOT NULL DEFAULT 'processed',
  addresses text[] NOT NULL DEFAULT '{}',
  processed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.paperwork_sync_messages TO authenticated;
GRANT ALL ON public.paperwork_sync_messages TO service_role;
ALTER TABLE public.paperwork_sync_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view paperwork sync log"
ON public.paperwork_sync_messages FOR SELECT TO authenticated USING (true);