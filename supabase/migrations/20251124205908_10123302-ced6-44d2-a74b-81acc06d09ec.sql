-- Create lead status enum
CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'qualified', 'unqualified', 'nurturing');

-- Create deal stage enum
CREATE TYPE deal_stage AS ENUM ('lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost');

-- Create task priority enum
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- Create task status enum
CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');

-- Create leads table
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  status lead_status NOT NULL DEFAULT 'new',
  source TEXT,
  notes TEXT,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create deals table
CREATE TABLE public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  stage deal_stage NOT NULL DEFAULT 'lead',
  value DECIMAL(12, 2),
  close_date DATE,
  property_address TEXT,
  property_details JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create tasks table
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  priority task_priority NOT NULL DEFAULT 'medium',
  status task_status NOT NULL DEFAULT 'pending',
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create SMS logs table
CREATE TABLE public.sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  sent_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create SMS campaigns table
CREATE TABLE public.sms_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  message_template TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft',
  target_filters JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create MLS property cache table
CREATE TABLE public.mls_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mls_id TEXT UNIQUE NOT NULL,
  address TEXT NOT NULL,
  city TEXT,
  state TEXT,
  zip TEXT,
  price DECIMAL(12, 2),
  bedrooms INTEGER,
  bathrooms DECIMAL(3, 1),
  square_feet INTEGER,
  property_type TEXT,
  status TEXT,
  listing_date DATE,
  images JSONB DEFAULT '[]'::jsonb,
  details JSONB DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create property views tracking
CREATE TABLE public.property_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.mls_properties(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT now(),
  source TEXT
);

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mls_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_views ENABLE ROW LEVEL SECURITY;

-- RLS Policies for leads
CREATE POLICY "Agents can view their own leads"
  ON public.leads FOR SELECT
  USING (auth.uid() = agent_id);

CREATE POLICY "Agents can insert their own leads"
  ON public.leads FOR INSERT
  WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Agents can update their own leads"
  ON public.leads FOR UPDATE
  USING (auth.uid() = agent_id);

CREATE POLICY "Agents can delete their own leads"
  ON public.leads FOR DELETE
  USING (auth.uid() = agent_id);

CREATE POLICY "Admins can view all leads"
  ON public.leads FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for deals
CREATE POLICY "Agents can view their own deals"
  ON public.deals FOR SELECT
  USING (auth.uid() = agent_id);

CREATE POLICY "Agents can insert their own deals"
  ON public.deals FOR INSERT
  WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Agents can update their own deals"
  ON public.deals FOR UPDATE
  USING (auth.uid() = agent_id);

CREATE POLICY "Agents can delete their own deals"
  ON public.deals FOR DELETE
  USING (auth.uid() = agent_id);

CREATE POLICY "Admins can view all deals"
  ON public.deals FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for tasks
CREATE POLICY "Agents can manage their own tasks"
  ON public.tasks FOR ALL
  USING (auth.uid() = agent_id)
  WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Admins can view all tasks"
  ON public.tasks FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for SMS logs
CREATE POLICY "Agents can view their SMS logs"
  ON public.sms_logs FOR SELECT
  USING (auth.uid() = agent_id);

CREATE POLICY "Admins can view all SMS logs"
  ON public.sms_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for SMS campaigns
CREATE POLICY "Agents can manage their SMS campaigns"
  ON public.sms_campaigns FOR ALL
  USING (auth.uid() = agent_id)
  WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Admins can view all SMS campaigns"
  ON public.sms_campaigns FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for MLS properties (public read)
CREATE POLICY "Authenticated users can view MLS properties"
  ON public.mls_properties FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for property views
CREATE POLICY "Agents can view their property views"
  ON public.property_views FOR SELECT
  USING (auth.uid() = agent_id);

CREATE POLICY "Agents can insert their property views"
  ON public.property_views FOR INSERT
  WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Admins can view all property views"
  ON public.property_views FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add triggers for updated_at
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_deals_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_sms_campaigns_updated_at
  BEFORE UPDATE ON public.sms_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Create indexes for performance
CREATE INDEX idx_leads_agent_id ON public.leads(agent_id);
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_deals_agent_id ON public.deals(agent_id);
CREATE INDEX idx_deals_stage ON public.deals(stage);
CREATE INDEX idx_tasks_agent_id ON public.tasks(agent_id);
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date);
CREATE INDEX idx_mls_properties_mls_id ON public.mls_properties(mls_id);
CREATE INDEX idx_property_views_agent_id ON public.property_views(agent_id);