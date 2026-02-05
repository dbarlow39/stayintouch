-- Add Title Company fields to estimated_net_properties
ALTER TABLE public.estimated_net_properties
ADD COLUMN IF NOT EXISTS title_company_name TEXT DEFAULT 'Caliber Title / Title First',
ADD COLUMN IF NOT EXISTS title_processor TEXT DEFAULT 'Kameron Faulkner or Shina Painter',
ADD COLUMN IF NOT EXISTS title_phone TEXT DEFAULT '614-854-0980',
ADD COLUMN IF NOT EXISTS title_email TEXT DEFAULT 'polaris@titlefirst.com';