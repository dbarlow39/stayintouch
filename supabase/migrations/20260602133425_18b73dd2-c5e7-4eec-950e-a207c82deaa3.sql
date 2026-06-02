CREATE TABLE public.dropbox_sync_cursor (
  agent_id UUID PRIMARY KEY,
  next_page_token TEXT,
  messages_scanned INT NOT NULL DEFAULT 0,
  backfill_complete BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dropbox_sync_cursor TO authenticated;
GRANT ALL ON public.dropbox_sync_cursor TO service_role;

ALTER TABLE public.dropbox_sync_cursor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents view own cursor" ON public.dropbox_sync_cursor
  FOR SELECT TO authenticated USING (auth.uid() = agent_id);
CREATE POLICY "Agents insert own cursor" ON public.dropbox_sync_cursor
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = agent_id);
CREATE POLICY "Agents update own cursor" ON public.dropbox_sync_cursor
  FOR UPDATE TO authenticated USING (auth.uid() = agent_id);
CREATE POLICY "Agents delete own cursor" ON public.dropbox_sync_cursor
  FOR DELETE TO authenticated USING (auth.uid() = agent_id);