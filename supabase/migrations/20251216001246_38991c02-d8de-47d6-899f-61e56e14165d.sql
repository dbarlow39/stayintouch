-- Add freddie_mac_summary column to weekly_market_data table
ALTER TABLE public.weekly_market_data
ADD COLUMN IF NOT EXISTS freddie_mac_summary TEXT;