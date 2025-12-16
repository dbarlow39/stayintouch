-- Add mortgage rate columns to weekly_market_data for Freddie Mac PMMS data
ALTER TABLE public.weekly_market_data
  ADD COLUMN IF NOT EXISTS mortgage_rate_30yr DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS mortgage_rate_30yr_week_ago DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS mortgage_rate_30yr_year_ago DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS mortgage_rate_15yr DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS mortgage_rate_15yr_week_ago DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS mortgage_rate_15yr_year_ago DOUBLE PRECISION;