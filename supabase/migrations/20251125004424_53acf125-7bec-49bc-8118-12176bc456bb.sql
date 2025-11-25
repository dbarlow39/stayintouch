-- Change listing_date from date type to text to accept any date format from CSV
ALTER TABLE public.clients ALTER COLUMN listing_date TYPE text USING listing_date::text;