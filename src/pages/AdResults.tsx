import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  BarChart3, Eye, MousePointerClick, DollarSign, Users, Heart,
  MessageSquare, Share2, Loader2, TrendingUp, ExternalLink, RefreshCw,
  ArrowLeft, Mail, Clock, Target, CircleDollarSign, Activity, Copy, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { getEmailClientPreference, getEmailLink } from '@/utils/emailClientUtils';
import logo from '@/assets/logo.jpg';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface InsightsData {
  post_id: string;
  created_time: string | null;
  message: string | null;
  full_picture: string | null;
  likes: number;
  comments: number;
  shares: number;
  engagements: number;
  impressions: number;
  reach: number;
  clicks: any;
  click_types: Record<string, number> | null;
  activity: Record<string, number> | null;
  reactions: Record<string, number> | null;
  engaged_users: number;
  ad_insights: {
    impressions: number;
    reach: number;
    clicks: number;
    spend: number;
    cpc: number;
    cpm: number;
    actions: any[];
    cost_per_action: any[];
  } | null;
}

interface AdPost {
  id: string;
  post_id: string;
  listing_address: string;
  listing_id: string;
  status: string;
  daily_budget: number;
  duration_days: number;
  boost_started_at: string;
}

const AdResultsPage = () => {
  const { postId } = useParams<{ postId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<InsightsData | null>(null);
  const [adPost, setAdPost] = useState<AdPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fetchingRef = useRef(false);

  const listingAddress = searchParams.get('address') || '';
  const listingId = searchParams.get('listingId') || '';

  // Fetch ad post metadata from DB
  useEffect(() => {
    if (!user || !postId) return;
    supabase
      .from('facebook_ad_posts' as any)
      .select('*')
      .eq('agent_id', user.id)
      .eq('post_id', postId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setAdPost(data as any);
      });
  }, [user, postId]);

  const fetchInsights = useCallback(async () => {
    if (!user || !postId || fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/facebook-ad-insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({ agent_id: user.id, post_id: postId }),
      });
      const result = await resp.json();
      if (result.error) throw new Error(result.error);
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch insights');
    }
    setLoading(false);
    fetchingRef.current = false;
  }, [postId, user]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const generateEmailBody = () => {
    if (!data) return '';
    const ad = data.ad_insights;
    const totalEngagements = data.engagements || 0;
    const totalImpressions = ad?.impressions || data.impressions || 0;
    const totalReach = ad?.reach || data.reach || 0;
    const totalSpend = ad?.spend || 0;
    const costPerEngagement = totalEngagements > 0 && totalSpend > 0
      ? (totalSpend / totalEngagements).toFixed(2) : '0.00';

    const postDate = data.created_time
      ? new Date(data.created_time).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'N/A';

    let body = `Facebook Ad Results - ${listingAddress}\n`;
    body += `Sellfor1Percent.com - Full Service Real Estate for just a 1% Commission\n\n`;
    body += `━━━ Performance Summary ━━━\n`;
    body += `Post Date: ${postDate}\n`;
    body += `Post Engagements: ${totalEngagements.toLocaleString()}\n`;
    body += `Views: ${totalImpressions.toLocaleString()}\n`;
    body += `Reach: ${totalReach.toLocaleString()}\n`;
    if (totalSpend > 0) {
      body += `Amount Spent: $${totalSpend.toFixed(2)}\n`;
      body += `Cost per Engagement: $${costPerEngagement}\n`;
    }
    body += `\n━━━ Engagement ━━━\n`;
    body += `Likes: ${data.likes}\n`;
    body += `Comments: ${data.comments}\n`;
    body += `Shares: ${data.shares}\n`;

    if (ad?.actions?.length) {
      body += `\n━━━ Activity Breakdown ━━━\n`;
      const actionLabels: Record<string, string> = {
        post_engagement: 'Post Engagements',
        link_click: 'Link Clicks',
        landing_page_view: 'Landing Page Views',
        page_engagement: 'Page Engagements',
        post_reaction: 'Post Reactions',
        comment: 'Comments',
      };
      for (const action of ad.actions) {
        const label = actionLabels[action.action_type] || action.action_type.replace(/_/g, ' ');
        body += `${label}: ${action.value}\n`;
      }
    }

    body += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    body += `View on Facebook: https://www.facebook.com/${postId}\n\n`;
    body += `Sellfor1Percent.com\nFull Service Real Estate for just a 1% Commission\n`;

    return body;
  };

  const handleCopyAndEmail = () => {
    const body = generateEmailBody();
    navigator.clipboard.writeText(body).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
      toast.success('Ad results copied to clipboard! Opening email...');

      // Open email client
      const subject = `Facebook Ad Results - ${listingAddress}`;
      const link = getEmailLink('', getEmailClientPreference(), subject);
      window.open(link, '_blank');
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading ad results...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-destructive">{error || 'No data found'}</p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Go Back
            </Button>
            <Button variant="outline" size="sm" onClick={fetchInsights}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const ad = data.ad_insights;
  const totalReach = ad?.reach || data.reach || 0;
  const totalImpressions = ad?.impressions || data.impressions || 0;
  const totalClicks = ad?.clicks || (typeof data.clicks === 'number' ? data.clicks : 0);
  const totalSpend = ad?.spend || 0;
  const totalEngagements = data.engagements || 0;
  const costPerEngagement = totalEngagements > 0 && totalSpend > 0
    ? (totalSpend / totalEngagements).toFixed(2) : '0.00';

  // Build activity items from ad actions or click_types
  const activityItems: { label: string; value: number }[] = [];
  if (ad?.actions?.length) {
    const actionLabels: Record<string, string> = {
      post_engagement: 'Post engagements',
      link_click: 'Link clicks',
      landing_page_view: 'Landing page views',
      page_engagement: 'Page engagements',
      post_reaction: 'Post reactions',
      comment: 'Comments',
      onsite_conversion_post_save: 'Post saves',
      post_interaction_gross: 'Post interactions',
      'onsite_conversion.post_net_like': 'Net likes',
    };
    for (const action of ad.actions) {
      const val = parseInt(action.value);
      if (val > 0) {
        activityItems.push({
          label: actionLabels[action.action_type] || action.action_type.replace(/_/g, ' '),
          value: val,
        });
      }
    }
  } else if (data.click_types) {
    Object.entries(data.click_types).forEach(([key, val]) => {
      if (typeof val === 'number' && val > 0) {
        activityItems.push({ label: key.replace(/_/g, ' '), value: val });
      }
    });
  }
  if (activityItems.length === 0) {
    if (data.likes > 0) activityItems.push({ label: 'Reactions', value: data.likes });
    if (data.comments > 0) activityItems.push({ label: 'Comments', value: data.comments });
    if (data.shares > 0) activityItems.push({ label: 'Shares', value: data.shares });
  }
  activityItems.sort((a, b) => b.value - a.value);
  const maxActivity = activityItems.length > 0 ? activityItems[0].value : 1;

  const postDate = data.created_time
    ? new Date(data.created_time).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const adStatus = adPost?.status === 'boosted' ? 'Active' : adPost?.status || 'Active';

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="h-8">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Separator orientation="vertical" className="h-5" />
            <img src={logo} alt="Sellfor1Percent.com" className="h-8 rounded" />
            <div>
              <h1 className="text-lg font-bold text-card-foreground">Ad Results</h1>
              <p className="text-xs text-muted-foreground">Sellfor1Percent.com</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchInsights} className="h-8">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
            </Button>
            <Button size="sm" onClick={handleCopyAndEmail} className="h-8">
              {copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Mail className="w-3.5 h-3.5 mr-1.5" />}
              {copied ? 'Copied!' : 'Copy & Email'}
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Performance */}
          <div className="lg:col-span-2 space-y-6">
            {/* Performance Section */}
            <section className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-semibold text-card-foreground flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" /> Performance
                </h2>
                {postDate && (
                  <span className="text-xs text-muted-foreground">Posted {postDate}</span>
                )}
              </div>
              {listingAddress && (
                <p className="text-sm text-muted-foreground mb-4">{listingAddress}</p>
              )}
              {totalSpend > 0 && (
                <p className="text-xs text-muted-foreground mb-4">
                  ${totalSpend.toFixed(2)} spent
                  {adPost?.duration_days ? ` over ${adPost.duration_days} days` : ''}
                </p>
              )}

              {/* Metric cards */}
              <div className="grid grid-cols-2 gap-3">
                <MetricCard
                  icon={<Users className="w-4 h-4 text-primary" />}
                  label="Post engagements"
                  value={totalEngagements.toLocaleString()}
                />
                <MetricCard
                  icon={<DollarSign className="w-4 h-4 text-emerald-600" />}
                  label="Cost per Post Engagement"
                  value={`$${costPerEngagement}`}
                />
                <MetricCard
                  icon={<Eye className="w-4 h-4 text-blue-600" />}
                  label="Views"
                  value={totalImpressions.toLocaleString()}
                />
                <MetricCard
                  icon={<TrendingUp className="w-4 h-4 text-amber-600" />}
                  label="Reach"
                  value={totalReach.toLocaleString()}
                />
              </div>
            </section>

            {/* Activity Section */}
            {activityItems.length > 0 && (
              <section className="bg-card rounded-xl border border-border p-6">
                <h2 className="text-base font-semibold text-card-foreground flex items-center gap-2 mb-4">
                  <Activity className="w-4 h-4 text-primary" /> Activity
                </h2>
                <div className="space-y-3">
                  {activityItems.map((item, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-muted-foreground capitalize">{item.label}</span>
                        <span className="text-sm font-semibold text-primary">
                          {item.value.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-6 bg-muted rounded-sm overflow-hidden">
                        <div
                          className="h-full bg-primary/80 rounded-sm transition-all"
                          style={{ width: `${Math.max((item.value / maxActivity) * 100, 3)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Engagement Section */}
            <section className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-base font-semibold text-card-foreground mb-4">Engagement</h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-red-500" />
                  <span className="text-lg font-bold text-card-foreground">{data.likes}</span>
                  <span className="text-sm text-muted-foreground">Likes</span>
                </div>
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-500" />
                  <span className="text-lg font-bold text-card-foreground">{data.comments}</span>
                  <span className="text-sm text-muted-foreground">Comments</span>
                </div>
                <div className="flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-lg font-bold text-card-foreground">{data.shares}</span>
                  <span className="text-sm text-muted-foreground">Shares</span>
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: Details + Preview */}
          <div className="space-y-6">
            {/* Details Card */}
            <section className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-base font-semibold text-card-foreground mb-4">Details</h2>
              <div className="space-y-4">
                <DetailRow
                  icon={<div className="w-3 h-3 rounded-full border-2 border-emerald-500 bg-emerald-500/20" />}
                  label="Status"
                  value={adStatus}
                />
                <Separator />
                <DetailRow
                  icon={<Target className="w-4 h-4 text-blue-500" />}
                  label="Goal"
                  value="Get more engagement"
                />
                <Separator />
                {adPost?.daily_budget && adPost.daily_budget > 0 && (
                  <>
                    <DetailRow
                      icon={<CircleDollarSign className="w-4 h-4 text-emerald-500" />}
                      label="Daily budget"
                      value={`$${adPost.daily_budget.toFixed(2)}`}
                    />
                    <Separator />
                  </>
                )}
                {adPost?.duration_days && adPost.duration_days > 0 && (
                  <>
                    <DetailRow
                      icon={<Clock className="w-4 h-4 text-muted-foreground" />}
                      label="Duration"
                      value={`${adPost.duration_days} days`}
                    />
                    <Separator />
                  </>
                )}
                {totalSpend > 0 && (
                  <DetailRow
                    icon={<DollarSign className="w-4 h-4 text-primary" />}
                    label="Total spent"
                    value={`$${totalSpend.toFixed(2)}`}
                  />
                )}
              </div>
            </section>

            {/* Preview Card */}
            <section className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-base font-semibold text-card-foreground mb-4">Preview</h2>
              <div className="border border-border rounded-lg overflow-hidden">
                {data.full_picture && (
                  <img
                    src={data.full_picture}
                    alt="Ad preview"
                    className="w-full h-48 object-cover"
                  />
                )}
                {data.message && (
                  <div className="p-3">
                    <p className="text-xs text-card-foreground whitespace-pre-wrap leading-relaxed">
                      {data.message}
                    </p>
                  </div>
                )}
              </div>
              <div className="mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => window.open(`https://www.facebook.com/${postId}`, '_blank')}
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> View on Facebook
                </Button>
              </div>
            </section>

            {/* Branding Footer */}
            <div className="bg-card rounded-xl border border-border p-4 text-center">
              <img src={logo} alt="Sellfor1Percent.com" className="h-10 rounded mx-auto mb-2" />
              <p className="text-xs font-medium text-card-foreground">Sellfor1Percent.com</p>
              <p className="text-[10px] text-muted-foreground">Full Service Real Estate for just a 1% Commission</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="border border-border rounded-lg p-4 bg-card">
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className="text-2xl font-bold text-card-foreground">{value}</span>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-card-foreground">{value}</p>
      </div>
    </div>
  );
}

export default AdResultsPage;
