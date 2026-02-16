
-- Track Facebook boosted posts and their ad performance
CREATE TABLE public.facebook_ad_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL,
  listing_id TEXT NOT NULL,
  listing_address TEXT NOT NULL,
  post_id TEXT NOT NULL,
  campaign_id TEXT,
  ad_id TEXT,
  daily_budget NUMERIC DEFAULT 0,
  duration_days INTEGER DEFAULT 7,
  boost_started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.facebook_ad_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ad posts"
  ON public.facebook_ad_posts FOR SELECT
  USING (auth.uid() = agent_id);

CREATE POLICY "Users can insert their own ad posts"
  ON public.facebook_ad_posts FOR INSERT
  WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Users can update their own ad posts"
  ON public.facebook_ad_posts FOR UPDATE
  USING (auth.uid() = agent_id);

CREATE TRIGGER update_facebook_ad_posts_updated_at
  BEFORE UPDATE ON public.facebook_ad_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
