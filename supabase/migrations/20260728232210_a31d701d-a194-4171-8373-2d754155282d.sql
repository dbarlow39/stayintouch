-- 1. app_settings: invite code readable only by admins
DROP POLICY IF EXISTS "Allow anon read for signup" ON public.app_settings;
DROP POLICY IF EXISTS "Allow authenticated read" ON public.app_settings;
CREATE POLICY "Admins can read settings"
  ON public.app_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
REVOKE SELECT ON public.app_settings FROM anon;

-- 2. Public bucket listing: drop broad SELECT policy on ad-images
DROP POLICY IF EXISTS "ad-images authenticated select" ON storage.objects;

-- 3. SECURITY DEFINER functions should not be directly callable by clients
REVOKE EXECUTE ON FUNCTION public.clear_user_templates() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recover_inspection_data(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_auto_imported_closing() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mp_increment_area_completed(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mp_try_claim_gate(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mp_release_gate(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;