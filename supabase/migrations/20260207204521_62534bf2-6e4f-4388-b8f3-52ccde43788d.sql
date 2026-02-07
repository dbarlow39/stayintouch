
-- Add admin_fee and caliber_title_bonus columns
ALTER TABLE public.closings 
  ADD COLUMN admin_fee numeric NOT NULL DEFAULT 499,
  ADD COLUMN caliber_title_bonus boolean NOT NULL DEFAULT false,
  ADD COLUMN caliber_title_amount numeric NOT NULL DEFAULT 150;

-- Update default splits to 40/60
ALTER TABLE public.closings 
  ALTER COLUMN company_split_pct SET DEFAULT 40,
  ALTER COLUMN agent_split_pct SET DEFAULT 60;
