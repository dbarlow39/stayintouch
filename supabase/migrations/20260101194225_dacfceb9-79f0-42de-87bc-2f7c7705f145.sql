-- Update RLS policy for master_email_templates to use Dave Barlow's ID
DROP POLICY IF EXISTS "Master user can manage master template" ON public.master_email_templates;

CREATE POLICY "Master user can manage master template" 
ON public.master_email_templates 
FOR ALL 
USING (auth.uid() = '579941cc-bf37-4a75-8030-450e06c49f44'::uuid)
WITH CHECK (auth.uid() = '579941cc-bf37-4a75-8030-450e06c49f44'::uuid);