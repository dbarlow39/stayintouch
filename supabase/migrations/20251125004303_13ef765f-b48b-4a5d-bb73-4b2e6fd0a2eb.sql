-- Make last_name and first_name columns nullable to allow flexible client data
ALTER TABLE public.clients ALTER COLUMN last_name DROP NOT NULL;
ALTER TABLE public.clients ALTER COLUMN first_name DROP NOT NULL;