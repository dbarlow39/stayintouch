-- Create table to store weekly market data for week-over-week comparison
CREATE TABLE public.weekly_market_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL,
  week_of DATE NOT NULL,
  active_homes INTEGER NOT NULL,
  active_homes_last_week INTEGER,
  inventory_change INTEGER,
  market_avg_dom INTEGER NOT NULL,
  price_trend TEXT NOT NULL CHECK (price_trend IN ('up', 'down', 'stable')),
  price_reductions INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(agent_id, week_of)
);

-- Enable RLS
ALTER TABLE public.weekly_market_data ENABLE ROW LEVEL SECURITY;

-- Agents can manage their own market data
CREATE POLICY "Agents can manage their market data" 
ON public.weekly_market_data 
FOR ALL 
USING (auth.uid() = agent_id)
WITH CHECK (auth.uid() = agent_id);

-- Create table to store sent weekly emails for tracking
CREATE TABLE public.weekly_email_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  market_data_id UUID REFERENCES public.weekly_market_data(id),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  zillow_views INTEGER,
  zillow_saves INTEGER,
  zillow_days INTEGER,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.weekly_email_logs ENABLE ROW LEVEL SECURITY;

-- Agents can view their email logs
CREATE POLICY "Agents can view their weekly email logs" 
ON public.weekly_email_logs 
FOR SELECT 
USING (auth.uid() = agent_id);

-- Agents can insert their email logs
CREATE POLICY "Agents can insert weekly email logs" 
ON public.weekly_email_logs 
FOR INSERT 
WITH CHECK (auth.uid() = agent_id);

-- Add updated_at trigger
CREATE TRIGGER update_weekly_market_data_updated_at
BEFORE UPDATE ON public.weekly_market_data
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();