
CREATE OR REPLACE FUNCTION public.notify_auto_imported_closing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn_url text := 'https://ujhohggsvijjqoatvwnl.supabase.co/functions/v1/send-closing-notification';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqaG9oZ2dzdmlqanFvYXR2d25sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4MjYzOTcsImV4cCI6MjA3OTQwMjM5N30.L1LEN9byJDXEPzl3RZcgx39OnLMWef4fjL36hvbffi4';
BEGIN
  IF NEW.paperwork_status = 'received'
     AND NEW.notes IS NOT NULL
     AND NEW.notes ILIKE '%Auto-imported from Gmail%' THEN
    PERFORM net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key,
        'apikey', anon_key
      ),
      body := jsonb_build_object('closing_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_auto_imported_closing ON public.closings;
CREATE TRIGGER trg_notify_auto_imported_closing
AFTER INSERT ON public.closings
FOR EACH ROW EXECUTE FUNCTION public.notify_auto_imported_closing();
