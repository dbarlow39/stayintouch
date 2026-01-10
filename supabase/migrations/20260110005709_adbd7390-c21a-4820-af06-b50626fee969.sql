-- Create the update_updated_at_column function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create follow-up sequences table to define drip campaigns
CREATE TABLE public.follow_up_sequences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sequence steps table for individual follow-up messages
CREATE TABLE public.sequence_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id UUID NOT NULL REFERENCES public.follow_up_sequences(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  delay_days INTEGER NOT NULL DEFAULT 1,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'both')),
  subject TEXT,
  message_template TEXT NOT NULL,
  use_ai_enhancement BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create lead enrollments table to track which leads are in which sequences
CREATE TABLE public.lead_sequence_enrollments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES public.follow_up_sequences(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  current_step INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  next_send_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(lead_id, sequence_id)
);

-- Create scheduled messages table to track pending and sent messages
CREATE TABLE public.scheduled_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enrollment_id UUID NOT NULL REFERENCES public.lead_sequence_enrollments(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES public.sequence_steps(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  subject TEXT,
  message_content TEXT,
  ai_enhanced BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE public.follow_up_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_sequence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for follow_up_sequences
CREATE POLICY "Agents can view their own sequences"
  ON public.follow_up_sequences FOR SELECT
  TO authenticated
  USING (auth.uid() = agent_id);

CREATE POLICY "Agents can create their own sequences"
  ON public.follow_up_sequences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Agents can update their own sequences"
  ON public.follow_up_sequences FOR UPDATE
  TO authenticated
  USING (auth.uid() = agent_id);

CREATE POLICY "Agents can delete their own sequences"
  ON public.follow_up_sequences FOR DELETE
  TO authenticated
  USING (auth.uid() = agent_id);

-- RLS policies for sequence_steps (based on parent sequence ownership)
CREATE POLICY "Agents can view steps of their sequences"
  ON public.sequence_steps FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.follow_up_sequences 
    WHERE id = sequence_steps.sequence_id AND agent_id = auth.uid()
  ));

CREATE POLICY "Agents can create steps for their sequences"
  ON public.sequence_steps FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.follow_up_sequences 
    WHERE id = sequence_steps.sequence_id AND agent_id = auth.uid()
  ));

CREATE POLICY "Agents can update steps of their sequences"
  ON public.sequence_steps FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.follow_up_sequences 
    WHERE id = sequence_steps.sequence_id AND agent_id = auth.uid()
  ));

CREATE POLICY "Agents can delete steps of their sequences"
  ON public.sequence_steps FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.follow_up_sequences 
    WHERE id = sequence_steps.sequence_id AND agent_id = auth.uid()
  ));

-- RLS policies for lead_sequence_enrollments (based on lead ownership)
CREATE POLICY "Agents can view enrollments for their leads"
  ON public.lead_sequence_enrollments FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leads 
    WHERE id = lead_sequence_enrollments.lead_id AND agent_id = auth.uid()
  ));

CREATE POLICY "Agents can create enrollments for their leads"
  ON public.lead_sequence_enrollments FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.leads 
    WHERE id = lead_sequence_enrollments.lead_id AND agent_id = auth.uid()
  ));

CREATE POLICY "Agents can update enrollments for their leads"
  ON public.lead_sequence_enrollments FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leads 
    WHERE id = lead_sequence_enrollments.lead_id AND agent_id = auth.uid()
  ));

CREATE POLICY "Agents can delete enrollments for their leads"
  ON public.lead_sequence_enrollments FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leads 
    WHERE id = lead_sequence_enrollments.lead_id AND agent_id = auth.uid()
  ));

-- RLS policies for scheduled_messages
CREATE POLICY "Agents can view their scheduled messages"
  ON public.scheduled_messages FOR SELECT
  TO authenticated
  USING (auth.uid() = agent_id);

CREATE POLICY "Agents can create their scheduled messages"
  ON public.scheduled_messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Agents can update their scheduled messages"
  ON public.scheduled_messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = agent_id);

CREATE POLICY "Agents can delete their scheduled messages"
  ON public.scheduled_messages FOR DELETE
  TO authenticated
  USING (auth.uid() = agent_id);

-- Create updated_at trigger for follow_up_sequences
CREATE TRIGGER update_follow_up_sequences_updated_at
  BEFORE UPDATE ON public.follow_up_sequences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();