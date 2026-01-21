-- Create estimated_net_properties table for storing property calculations
CREATE TABLE public.estimated_net_properties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Seller & Property Info
  name TEXT NOT NULL,
  seller_phone TEXT,
  seller_email TEXT,
  street_address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'OH',
  zip TEXT NOT NULL,
  
  -- Financial Details
  offer_price NUMERIC NOT NULL DEFAULT 0,
  first_mortgage NUMERIC NOT NULL DEFAULT 0,
  second_mortgage NUMERIC NOT NULL DEFAULT 0,
  listing_agent_commission NUMERIC NOT NULL DEFAULT 1,
  buyer_agent_commission NUMERIC NOT NULL DEFAULT 3,
  closing_cost NUMERIC NOT NULL DEFAULT 0,
  
  -- Loan Details
  type_of_loan TEXT DEFAULT 'Conventional',
  loan_app_time_frame TEXT,
  loan_commitment TEXT,
  pre_approval_days INTEGER DEFAULT 0,
  
  -- Additional Costs
  home_warranty NUMERIC NOT NULL DEFAULT 0,
  home_warranty_company TEXT,
  deposit NUMERIC NOT NULL DEFAULT 1000,
  deposit_collection TEXT DEFAULT 'Within 3 Days of Acceptance',
  admin_fee NUMERIC NOT NULL DEFAULT 499,
  
  -- Dates
  in_contract DATE,
  closing_date DATE,
  possession DATE,
  final_walk_through TEXT DEFAULT '48 hours prior to close',
  respond_to_offer_by TIMESTAMP WITH TIME ZONE,
  
  -- Inspection
  inspection_days INTEGER DEFAULT 7,
  remedy_period_days INTEGER DEFAULT 2,
  
  -- Tax Information
  annual_taxes NUMERIC NOT NULL DEFAULT 0,
  first_half_paid BOOLEAN NOT NULL DEFAULT false,
  second_half_paid BOOLEAN NOT NULL DEFAULT false,
  tax_days_due_this_year INTEGER DEFAULT 0,
  days_first_half_taxes NUMERIC DEFAULT 0,
  days_second_half_taxes NUMERIC DEFAULT 0,
  
  -- Listing Agent Information
  listing_agent_name TEXT,
  listing_agent_phone TEXT,
  listing_agent_email TEXT,
  
  -- Buyer Agent Information
  agent_name TEXT,
  agent_contact TEXT,
  agent_email TEXT,
  
  -- Additional
  appliances TEXT,
  notes TEXT
);

-- Enable Row Level Security
ALTER TABLE public.estimated_net_properties ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Agents can view their own properties"
ON public.estimated_net_properties
FOR SELECT
USING (auth.uid() = agent_id);

CREATE POLICY "Agents can insert their own properties"
ON public.estimated_net_properties
FOR INSERT
WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Agents can update their own properties"
ON public.estimated_net_properties
FOR UPDATE
USING (auth.uid() = agent_id);

CREATE POLICY "Agents can delete their own properties"
ON public.estimated_net_properties
FOR DELETE
USING (auth.uid() = agent_id);

CREATE POLICY "Admins can view all properties"
ON public.estimated_net_properties
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_estimated_net_properties_updated_at
BEFORE UPDATE ON public.estimated_net_properties
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_estimated_net_properties_agent_id ON public.estimated_net_properties(agent_id);
CREATE INDEX idx_estimated_net_properties_client_id ON public.estimated_net_properties(client_id);