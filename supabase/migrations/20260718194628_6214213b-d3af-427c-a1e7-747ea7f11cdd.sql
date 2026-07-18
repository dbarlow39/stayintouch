
-- 1) Drop overly permissive policies
DROP POLICY IF EXISTS "Allow anon read access for external apps" ON public.clients;
DROP POLICY IF EXISTS "Anyone can read sync_log" ON public.sync_log;

-- 2) sync_log: restrict SELECT to authenticated users only
CREATE POLICY "Authenticated users can read sync_log"
  ON public.sync_log FOR SELECT
  TO authenticated
  USING (true);

-- 3) agents: allow the creator (agent's admin) to read their own added rows
--    (do NOT open to public; table contains SSNs/PII)
CREATE POLICY "Users can view agents they created"
  ON public.agents FOR SELECT
  TO authenticated
  USING (auth.uid() = created_by);

-- 4) Revoke EXECUTE on sensitive SECURITY DEFINER functions from anon/authenticated.
--    has_role is used inside RLS policies, so keep EXECUTE for authenticated (and anon in case
--    of unauth policies referencing it) — but revoke direct callability where safe.
REVOKE EXECUTE ON FUNCTION public.clear_user_templates() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recover_inspection_data(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_auto_imported_closing() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_updated_at() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, PUBLIC;
-- Keep has_role callable so RLS policies referencing it continue to work
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;

-- 5) Public storage buckets: prevent anon listing by scoping SELECT policies to
--    authenticated only. Public CDN URLs for these buckets still serve files
--    without RLS since the buckets are marked public.
DROP POLICY IF EXISTS "Ad images are publicly accessible" ON storage.objects;
CREATE POLICY "Authenticated can list ad-images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'ad-images');

DROP POLICY IF EXISTS "Anyone can view email assets" ON storage.objects;
CREATE POLICY "Authenticated can list email-assets"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'email-assets');

DROP POLICY IF EXISTS "Anyone can view inspection photos" ON storage.objects;
CREATE POLICY "Authenticated can list inspection-photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'inspection-photos');

DROP POLICY IF EXISTS "Public can read buyers guide files" ON storage.objects;
CREATE POLICY "Authenticated can list buyers-guide"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'buyers-guide');
