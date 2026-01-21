-- Change timestamp fields to TEXT to allow natural language descriptions
-- These fields need to accept values like "12 noon on Tuesday" or "48 hours prior to close"

ALTER TABLE public.estimated_net_properties
  ALTER COLUMN final_walk_through TYPE TEXT USING final_walk_through::TEXT,
  ALTER COLUMN possession TYPE TEXT USING possession::TEXT,
  ALTER COLUMN respond_to_offer_by TYPE TEXT USING respond_to_offer_by::TEXT,
  ALTER COLUMN in_contract TYPE TEXT USING in_contract::TEXT,
  ALTER COLUMN loan_commitment TYPE TEXT USING loan_commitment::TEXT,
  ALTER COLUMN loan_app_time_frame TYPE TEXT USING loan_app_time_frame::TEXT;