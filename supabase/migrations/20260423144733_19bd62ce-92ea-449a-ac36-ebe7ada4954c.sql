CREATE TABLE public.listing_inquiries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  property_street TEXT,
  mls_id TEXT,
  listing_agent_name TEXT,
  listing_agent_email TEXT,
  inquirer_name TEXT NOT NULL,
  inquirer_phone TEXT,
  inquirer_email TEXT,
  requested_date TEXT,
  inquirer_ip TEXT
);

ALTER TABLE public.listing_inquiries ENABLE ROW LEVEL SECURITY;

-- Anyone (anon or authenticated) can submit an inquiry
CREATE POLICY "Anyone can submit an inquiry"
ON public.listing_inquiries
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only admins can view inquiries
CREATE POLICY "Admins can view all inquiries"
ON public.listing_inquiries
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_listing_inquiries_created_at ON public.listing_inquiries (created_at DESC);