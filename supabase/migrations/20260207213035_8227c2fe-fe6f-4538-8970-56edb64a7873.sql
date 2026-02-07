ALTER TABLE public.closings DROP CONSTRAINT closings_status_check;
ALTER TABLE public.closings ALTER COLUMN status SET DEFAULT 'not_received';