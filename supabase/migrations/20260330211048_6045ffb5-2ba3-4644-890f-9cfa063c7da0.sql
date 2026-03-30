
-- Create daily_call_sheets table
CREATE TABLE public.daily_call_sheets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL,
  sheet_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(agent_id, sheet_date)
);

-- Create daily_call_entries table
CREATE TABLE public.daily_call_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sheet_id UUID NOT NULL REFERENCES public.daily_call_sheets(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  action TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(sheet_id, row_number)
);

-- Enable RLS
ALTER TABLE public.daily_call_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_call_entries ENABLE ROW LEVEL SECURITY;

-- RLS for daily_call_sheets
CREATE POLICY "Agents can view their own call sheets" ON public.daily_call_sheets FOR SELECT USING (auth.uid() = agent_id);
CREATE POLICY "Agents can insert their own call sheets" ON public.daily_call_sheets FOR INSERT WITH CHECK (auth.uid() = agent_id);
CREATE POLICY "Agents can update their own call sheets" ON public.daily_call_sheets FOR UPDATE USING (auth.uid() = agent_id);
CREATE POLICY "Agents can delete their own call sheets" ON public.daily_call_sheets FOR DELETE USING (auth.uid() = agent_id);

-- RLS for daily_call_entries (via join to sheets)
CREATE POLICY "Agents can view their own call entries" ON public.daily_call_entries FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.daily_call_sheets WHERE daily_call_sheets.id = daily_call_entries.sheet_id AND daily_call_sheets.agent_id = auth.uid())
);
CREATE POLICY "Agents can insert their own call entries" ON public.daily_call_entries FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.daily_call_sheets WHERE daily_call_sheets.id = daily_call_entries.sheet_id AND daily_call_sheets.agent_id = auth.uid())
);
CREATE POLICY "Agents can update their own call entries" ON public.daily_call_entries FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.daily_call_sheets WHERE daily_call_sheets.id = daily_call_entries.sheet_id AND daily_call_sheets.agent_id = auth.uid())
);
CREATE POLICY "Agents can delete their own call entries" ON public.daily_call_entries FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.daily_call_sheets WHERE daily_call_sheets.id = daily_call_entries.sheet_id AND daily_call_sheets.agent_id = auth.uid())
);
