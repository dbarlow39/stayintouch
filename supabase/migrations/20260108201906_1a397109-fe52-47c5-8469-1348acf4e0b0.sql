-- Add new market tracking columns to weekly_market_data
ALTER TABLE public.weekly_market_data
ADD COLUMN new_listings integer DEFAULT 0,
ADD COLUMN closed_deals integer DEFAULT 0,
ADD COLUMN in_contracts integer DEFAULT 0,
ADD COLUMN article_summary text;