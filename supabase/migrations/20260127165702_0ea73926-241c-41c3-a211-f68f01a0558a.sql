-- Create client_notes table for storing timestamped notes
CREATE TABLE public.client_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;

-- Create policies for agent access
CREATE POLICY "Agents can view their own client notes" 
ON public.client_notes 
FOR SELECT 
USING (auth.uid() = agent_id);

CREATE POLICY "Agents can create notes for their clients" 
ON public.client_notes 
FOR INSERT 
WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Agents can update their own notes" 
ON public.client_notes 
FOR UPDATE 
USING (auth.uid() = agent_id);

CREATE POLICY "Agents can delete their own notes" 
ON public.client_notes 
FOR DELETE 
USING (auth.uid() = agent_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_client_notes_updated_at
BEFORE UPDATE ON public.client_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster lookups
CREATE INDEX idx_client_notes_client_id ON public.client_notes(client_id);
CREATE INDEX idx_client_notes_agent_id ON public.client_notes(agent_id);