-- Make email column nullable to allow clients without emails
ALTER TABLE public.clients ALTER COLUMN email DROP NOT NULL;