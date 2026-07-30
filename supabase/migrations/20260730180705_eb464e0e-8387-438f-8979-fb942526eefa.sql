CREATE OR REPLACE FUNCTION public.clear_user_templates()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS DISTINCT FROM '579941cc-bf37-4a75-8030-450e06c49f44'::uuid THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles SET email_template = NULL WHERE email_template IS NOT NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.clear_user_templates() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_user_templates() TO authenticated;