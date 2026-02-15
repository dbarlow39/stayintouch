
CREATE TABLE public.sync_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_type TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  record_count INTEGER DEFAULT 0
);

ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read sync_log" ON public.sync_log FOR SELECT USING (true);

CREATE INDEX idx_sync_log_type_time ON public.sync_log (sync_type, synced_at DESC);
