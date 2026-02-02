-- Add new lender and buyer fields to estimated_net_properties table
ALTER TABLE public.estimated_net_properties
ADD COLUMN lender_name text,
ADD COLUMN lending_officer text,
ADD COLUMN lending_officer_phone text,
ADD COLUMN lending_officer_email text,
ADD COLUMN buyer_name_1 text,
ADD COLUMN buyer_name_2 text;