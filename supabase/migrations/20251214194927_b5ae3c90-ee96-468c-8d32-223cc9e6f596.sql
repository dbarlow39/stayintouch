-- Add email_template column to profiles table for storing agent's custom email template
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_template text;

-- Allow agents to update their own email template (already covered by existing RLS policy)