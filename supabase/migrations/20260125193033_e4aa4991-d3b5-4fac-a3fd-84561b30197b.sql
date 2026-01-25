-- Create table for storing ShowingTime feedback
CREATE TABLE public.showing_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  showing_agent_name TEXT,
  showing_agent_email TEXT,
  showing_agent_phone TEXT,
  showing_date TIMESTAMP WITH TIME ZONE,
  feedback TEXT,
  buyer_interest_level TEXT,
  source_email_id UUID REFERENCES public.client_email_logs(id),
  raw_email_content TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.showing_feedback ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Agents can view their own feedback"
ON public.showing_feedback FOR SELECT
USING (auth.uid() = agent_id);

CREATE POLICY "Agents can insert their own feedback"
ON public.showing_feedback FOR INSERT
WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Agents can update their own feedback"
ON public.showing_feedback FOR UPDATE
USING (auth.uid() = agent_id);

CREATE POLICY "Agents can delete their own feedback"
ON public.showing_feedback FOR DELETE
USING (auth.uid() = agent_id);

-- Add index for faster lookups
CREATE INDEX idx_showing_feedback_client_id ON public.showing_feedback(client_id);
CREATE INDEX idx_showing_feedback_agent_id ON public.showing_feedback(agent_id);

-- Add trigger for updated_at
CREATE TRIGGER update_showing_feedback_updated_at
BEFORE UPDATE ON public.showing_feedback
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();