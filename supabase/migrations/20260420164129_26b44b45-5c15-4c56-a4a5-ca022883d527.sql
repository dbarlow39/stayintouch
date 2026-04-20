ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS bedrooms integer,
  ADD COLUMN IF NOT EXISTS bathrooms numeric,
  ADD COLUMN IF NOT EXISTS square_feet integer,
  ADD COLUMN IF NOT EXISTS year_built integer,
  ADD COLUMN IF NOT EXISTS lot_size_sqft integer,
  ADD COLUMN IF NOT EXISTS annual_taxes numeric,
  ADD COLUMN IF NOT EXISTS assessed_value numeric,
  ADD COLUMN IF NOT EXISTS market_value numeric,
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS property_type text,
  ADD COLUMN IF NOT EXISTS estated_data jsonb,
  ADD COLUMN IF NOT EXISTS estated_fetched_at timestamptz;