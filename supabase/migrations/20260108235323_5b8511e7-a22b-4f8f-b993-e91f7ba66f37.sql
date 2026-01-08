-- Restrict MLS properties to agents only (not all authenticated users)
-- Drop the permissive policy
DROP POLICY IF EXISTS "Authenticated users can view MLS properties" ON public.mls_properties;

-- Create new restrictive policy - only agents and admins can view
CREATE POLICY "Only agents and admins can view MLS properties"
  ON public.mls_properties FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'agent'::app_role) 
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );