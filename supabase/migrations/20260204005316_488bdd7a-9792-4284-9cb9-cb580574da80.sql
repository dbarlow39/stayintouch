-- Create table to track notice completion status per property
CREATE TABLE public.property_notice_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES public.estimated_net_properties(id) ON DELETE CASCADE,
  notice_type TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(property_id, notice_type)
);

-- Enable RLS
ALTER TABLE public.property_notice_status ENABLE ROW LEVEL SECURITY;

-- Create policies - users can only access notices for properties they own
CREATE POLICY "Users can view their own property notices"
ON public.property_notice_status
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.estimated_net_properties
    WHERE id = property_notice_status.property_id
    AND agent_id = auth.uid()
  )
);

CREATE POLICY "Users can insert their own property notices"
ON public.property_notice_status
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.estimated_net_properties
    WHERE id = property_notice_status.property_id
    AND agent_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own property notices"
ON public.property_notice_status
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.estimated_net_properties
    WHERE id = property_notice_status.property_id
    AND agent_id = auth.uid()
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_property_notice_status_updated_at
BEFORE UPDATE ON public.property_notice_status
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();