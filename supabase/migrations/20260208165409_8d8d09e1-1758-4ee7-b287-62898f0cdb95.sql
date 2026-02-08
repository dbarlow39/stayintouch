
-- Create a table to store the invite code
CREATE TABLE public.app_settings (
  id text PRIMARY KEY DEFAULT 'default',
  invite_code text NOT NULL DEFAULT 'CHANGEME',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert the default row
INSERT INTO public.app_settings (id, invite_code) VALUES ('default', 'CHANGEME');

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read the invite code (needed for signup validation)
-- We validate on server side via edge function for security
CREATE POLICY "Allow authenticated read" ON public.app_settings FOR SELECT TO authenticated USING (true);

-- Only admins can update
CREATE POLICY "Admins can update settings" ON public.app_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
