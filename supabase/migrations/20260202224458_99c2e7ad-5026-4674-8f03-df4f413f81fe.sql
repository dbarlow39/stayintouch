-- Add appraisal_contingency field to estimated_net_properties
ALTER TABLE public.estimated_net_properties
ADD COLUMN appraisal_contingency boolean DEFAULT true;