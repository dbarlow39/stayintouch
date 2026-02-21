-- Add status column to estimated_net_properties to track active vs closed deals
ALTER TABLE public.estimated_net_properties 
ADD COLUMN deal_status text NOT NULL DEFAULT 'active';

-- Add index for filtering
CREATE INDEX idx_estimated_net_properties_deal_status ON public.estimated_net_properties(deal_status);