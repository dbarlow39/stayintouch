-- Add triage_category column for email digest categorization
ALTER TABLE suggested_tasks 
ADD COLUMN IF NOT EXISTS triage_category TEXT DEFAULT 'important'
CHECK (triage_category IN ('urgent', 'important', 'fyi', 'ignore'));

-- Add email_summary column for brief summaries
ALTER TABLE suggested_tasks 
ADD COLUMN IF NOT EXISTS email_summary TEXT;

-- Add action_needed column for what user needs to do
ALTER TABLE suggested_tasks 
ADD COLUMN IF NOT EXISTS action_needed TEXT;

-- Add sender column for easy display
ALTER TABLE suggested_tasks 
ADD COLUMN IF NOT EXISTS sender TEXT;

-- Add snoozed_until column for snooze functionality
ALTER TABLE suggested_tasks 
ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMP WITH TIME ZONE;