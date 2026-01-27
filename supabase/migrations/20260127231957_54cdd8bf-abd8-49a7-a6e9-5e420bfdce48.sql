-- Add is_archived column to tasks table
ALTER TABLE public.tasks ADD COLUMN is_archived boolean NOT NULL DEFAULT false;