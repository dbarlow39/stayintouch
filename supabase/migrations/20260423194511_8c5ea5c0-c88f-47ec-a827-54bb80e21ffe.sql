-- Buyers Guide Requests table
CREATE TABLE public.buyers_guide_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  buying_timeframe TEXT,
  mls_id TEXT,
  property_street TEXT,
  inquirer_ip TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.buyers_guide_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a buyers guide request"
ON public.buyers_guide_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Admins can view all buyers guide requests"
ON public.buyers_guide_requests
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Public bucket for the buyers guide PDF
INSERT INTO storage.buckets (id, name, public)
VALUES ('buyers-guide', 'buyers-guide', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can read buyers guide files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'buyers-guide');

CREATE POLICY "Admins can upload buyers guide files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'buyers-guide' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update buyers guide files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'buyers-guide' AND has_role(auth.uid(), 'admin'::app_role));