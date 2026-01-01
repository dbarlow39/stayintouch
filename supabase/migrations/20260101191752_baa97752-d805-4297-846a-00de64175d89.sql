-- Create master email templates table
CREATE TABLE public.master_email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template text NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.master_email_templates ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read the master template
CREATE POLICY "Authenticated users can read master template"
ON public.master_email_templates
FOR SELECT
TO authenticated
USING (true);

-- Only the master user can insert/update/delete
CREATE POLICY "Master user can manage master template"
ON public.master_email_templates
FOR ALL
TO authenticated
USING (auth.uid() = '0859dbb2-f31d-4409-8c2f-e001706f3866'::uuid)
WITH CHECK (auth.uid() = '0859dbb2-f31d-4409-8c2f-e001706f3866'::uuid);

-- Create function to clear all user templates (called when master saves)
CREATE OR REPLACE FUNCTION public.clear_user_templates()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET email_template = NULL WHERE email_template IS NOT NULL;
END;
$$;