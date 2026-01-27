-- Create table to persist AI suggested tasks
CREATE TABLE public.suggested_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'medium',
  category text NOT NULL DEFAULT 'action-item',
  related_client text,
  reasoning text,
  status text NOT NULL DEFAULT 'pending', -- pending, added, dismissed
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.suggested_tasks ENABLE ROW LEVEL SECURITY;

-- Create policy for agents to manage their own suggested tasks
CREATE POLICY "Agents can manage their own suggested tasks"
ON public.suggested_tasks
FOR ALL
USING (auth.uid() = agent_id)
WITH CHECK (auth.uid() = agent_id);