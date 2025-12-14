-- Add agent profile fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS first_name text,
ADD COLUMN IF NOT EXISTS last_name text,
ADD COLUMN IF NOT EXISTS cell_phone text,
ADD COLUMN IF NOT EXISTS preferred_email text,
ADD COLUMN IF NOT EXISTS website text,
ADD COLUMN IF NOT EXISTS bio text,
ADD COLUMN IF NOT EXISTS profile_completed boolean DEFAULT false;

-- Allow users to insert their own profile (in case trigger didn't create it)
CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = id);