
-- Closings table: tracks property closings
CREATE TABLE public.closings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL,
  agent_name TEXT NOT NULL,
  property_address TEXT NOT NULL,
  city TEXT,
  state TEXT DEFAULT 'OH',
  zip TEXT,
  closing_date DATE NOT NULL,
  sale_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  company_split_pct NUMERIC(5,2) NOT NULL DEFAULT 30,
  agent_split_pct NUMERIC(5,2) NOT NULL DEFAULT 70,
  total_commission NUMERIC(12,2) NOT NULL DEFAULT 0,
  company_share NUMERIC(12,2) NOT NULL DEFAULT 0,
  agent_share NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'check_received', 'processed', 'paid')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Checks received for closings
CREATE TABLE public.closing_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  closing_id UUID REFERENCES public.closings(id) ON DELETE CASCADE NOT NULL,
  check_number TEXT,
  check_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payer_name TEXT,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  deposited BOOLEAN NOT NULL DEFAULT false,
  deposited_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Commission payouts to agents
CREATE TABLE public.commission_payouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL,
  agent_name TEXT NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payout_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'printed', 'paid')),
  check_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Link table: which closing checks are included in a payout
CREATE TABLE public.payout_closing_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payout_id UUID REFERENCES public.commission_payouts(id) ON DELETE CASCADE NOT NULL,
  closing_id UUID REFERENCES public.closings(id) ON DELETE CASCADE NOT NULL,
  agent_share NUMERIC(12,2) NOT NULL DEFAULT 0,
  UNIQUE(payout_id, closing_id)
);

-- Compliance documents for closings
CREATE TABLE public.closing_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  closing_id UUID REFERENCES public.closings(id) ON DELETE CASCADE NOT NULL,
  document_name TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'other',
  file_path TEXT,
  file_name TEXT,
  is_received BOOLEAN NOT NULL DEFAULT false,
  received_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Enable RLS on all tables
ALTER TABLE public.closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closing_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_closing_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closing_documents ENABLE ROW LEVEL SECURITY;

-- RLS: Only admins can access these tables
CREATE POLICY "Admins can manage closings"
  ON public.closings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage closing_checks"
  ON public.closing_checks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage commission_payouts"
  ON public.commission_payouts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage payout_closing_links"
  ON public.payout_closing_links FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage closing_documents"
  ON public.closing_documents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Updated_at triggers
CREATE TRIGGER update_closings_updated_at
  BEFORE UPDATE ON public.closings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
