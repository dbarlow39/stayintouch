import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  BarChart3, Eye, MousePointerClick, DollarSign, Users, Heart,
  MessageSquare, Share2, Loader2, TrendingUp, ExternalLink, RefreshCw,
  ArrowLeft, Mail, Clock, Target, CircleDollarSign, Activity, Copy, Check, Send
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import logo from '@/assets/logo.jpg';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface AudienceRow {
  age: string;
  gender: string;
  reach: string;
  impressions: string;
}

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
  audience: AudienceRow[] | null;
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
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [profileData, setProfileData] = useState<{ full_name: string; preferred_email: string; email: string; first_name: string | null; cell_phone: string | null; bio: string | null } | null>(null);
  const [emailPreviewHtml, setEmailPreviewHtml] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [buildingPreview, setBuildingPreview] = useState(false);
  const fetchingRef = useRef(false);

  const listingAddress = searchParams.get('address') || '';
  const listingId = searchParams.get('listingId') || '';

  // Fetch agent profile for email sending
  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('full_name, preferred_email, email, first_name, cell_phone, bio')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProfileData(data as any);
      });
  }, [user]);

  // Fetch ad post metadata and seller email from DB
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

    // Try to find seller email - check estimated_net_properties first, then clients
    if (listingAddress) {
      const streetPart = listingAddress.split(',')[0].trim();
      // Extract street number and first word of street name for flexible matching
      // e.g. "113 Blackstone Court" -> number "113", keyword "Blackstone"
      const addrWords = streetPart.split(/\s+/);
      const streetNumber = addrWords[0] || '';
      const streetKeyword = addrWords[1] || '';
      const flexiblePattern = streetNumber && streetKeyword
        ? `%${streetNumber}%${streetKeyword}%`
        : `%${streetPart}%`;
      
      // Check estimated_net_properties for seller_email first
      supabase
        .from('estimated_net_properties')
        .select('seller_email')
        .eq('agent_id', user.id)
        .ilike('street_address', flexiblePattern)
        .limit(1)
        .maybeSingle()
        .then(({ data: propData }) => {
          if (propData?.seller_email) {
            setRecipientEmail(propData.seller_email);
          } else {
            // Fallback to clients table - match on street_number + street_name or location
            supabase
              .from('clients')
              .select('email, first_name, last_name')
              .eq('agent_id', user.id)
              .or(`street_name.ilike.%${streetKeyword}%,location.ilike.%${streetPart}%`)
              .limit(1)
              .maybeSingle()
              .then(({ data: clientData }) => {
                if (clientData?.email) setRecipientEmail(clientData.email);
              });
          }
        });
    }
  }, [user, postId, listingAddress]);

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

  const buildEmailPayload = useCallback(() => {
    if (!data) return null;
    const ad = data.ad_insights;
    const totalEngagements = data.engagements || 0;
    const totalImpressions = ad?.impressions || data.impressions || 0;
    const totalReach = ad?.reach || data.reach || 0;
    const totalSpend = ad?.spend || 0;
    const postDate = data.created_time
      ? new Date(data.created_time).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'N/A';

    const emailActivityItems: { label: string; value: number }[] = [];
    if (ad?.actions?.length) {
      const allowedActions: Record<string, string> = {
        post_engagement: 'Post engagements',
        link_click: 'Link clicks',
        post_reaction: 'Post reactions',
        post: 'Post shares',
        like: 'Facebook likes',
        'onsite_conversion.post_save': 'Post saves',
      };
      for (const action of ad.actions) {
        const label = allowedActions[action.action_type];
        if (label && parseInt(action.value) > 0) {
          emailActivityItems.push({ label, value: parseInt(action.value) });
        }
      }
    }
    emailActivityItems.sort((a, b) => b.value - a.value);

    // Determine client first names from listing address match
    let clientFirstNames = '';
    
    return {
      to_email: recipientEmail.trim(),
      from_name: profileData?.full_name || 'Agent',
      reply_to: profileData?.preferred_email || profileData?.email || '',
      listing_address: listingAddress,
      post_date: postDate,
      post_engagements: totalEngagements,
      views: totalImpressions,
      reach: totalReach,
      likes: data.likes,
      comments: data.comments,
      shares: data.shares,
      amount_spent: totalSpend,
      activity_items: emailActivityItems,
      ad_preview_image: data.full_picture || null,
      ad_preview_text: data.message || null,
      facebook_post_url: `https://www.facebook.com/${postId}`,
      logo_url: `${window.location.origin}/logo.jpg`,
      // Letter-style fields
      client_first_names: clientFirstNames || undefined,
      agent_first_name: profileData?.first_name || undefined,
      agent_full_name: profileData?.full_name || undefined,
      agent_phone: profileData?.cell_phone || undefined,
      agent_email: profileData?.preferred_email || profileData?.email || undefined,
      agent_bio: profileData?.bio || undefined,
    };
  }, [data, recipientEmail, profileData, listingAddress, postId]);


  const handlePreviewEmail = async () => {
    if (!data) return;
    setBuildingPreview(true);
    try {
      const payload = buildEmailPayload();
      if (!payload) throw new Error('No data');
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-ad-results-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({ ...payload, preview_only: true }),
      });
      const result = await resp.json();
      if (result.error) throw new Error(result.error);
      setEmailPreviewHtml(result.html);
      setShowPreview(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to build preview');
    }
    setBuildingPreview(false);
  };

  const handleSendEmail = async () => {
    if (!data || !recipientEmail.trim() || sending) return;
    setSending(true);
    try {
      const payload = buildEmailPayload();
      if (!payload) throw new Error('No data');
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-ad-results-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify(payload),
      });
      const result = await resp.json();
      if (result.error) throw new Error(result.error);
      toast.success(`Ad results emailed to ${recipientEmail.trim()}`);
      setEmailDialogOpen(false);
      setShowPreview(false);
      setEmailPreviewHtml(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to send email');
    }
    setSending(false);
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
            <Button variant="outline" size="sm" onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/dashboard')}>
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

  // Build activity items - only show 6 Facebook-standard activities
  const activityItems: { label: string; value: number }[] = [];
  if (ad?.actions?.length) {
    const allowedActions: Record<string, string> = {
      post_engagement: 'Post engagements',
      link_click: 'Link clicks',
      post_reaction: 'Post reactions',
      post: 'Post shares',
      like: 'Facebook likes',
      'onsite_conversion.post_save': 'Post saves',
    };
    for (const action of ad.actions) {
      const label = allowedActions[action.action_type];
      if (label && parseInt(action.value) > 0) {
        activityItems.push({ label, value: parseInt(action.value) });
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
            <Button variant="ghost" size="sm" onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/dashboard')} className="h-8">
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
            <Button size="sm" onClick={handlePreviewEmail} disabled={buildingPreview} className="h-8">
              {buildingPreview ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Loading...</>
              ) : (
                <><Eye className="w-3.5 h-3.5 mr-1.5" /> Preview Email</>
              )}
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

            {/* Audience Breakdown */}
            {data.audience && data.audience.length > 0 && (
              <section className="bg-card rounded-xl border border-border p-6">
                <h2 className="text-base font-semibold text-card-foreground flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-primary" /> Audience
                </h2>
                <AudienceChart audience={data.audience} totalReach={totalReach} />
              </section>
            )}
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

      {/* Inline Email Preview */}
      {showPreview && emailPreviewHtml && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-6">
          <section className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-card-foreground flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" /> Email Preview
              </h2>
              <Button variant="outline" size="sm" onClick={() => { setShowPreview(false); setEmailPreviewHtml(null); }}>
                Close Preview
              </Button>
            </div>
            <div className="border border-border rounded-lg overflow-hidden bg-muted/30">
              <iframe
                srcDoc={emailPreviewHtml}
                className="w-full h-[600px] border-0"
                title="Email Preview"
              />
            </div>
          </section>
        </div>
      )}
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

function AudienceChart({ audience, totalReach }: { audience: AudienceRow[]; totalReach: number }) {
  const ageGroups = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
  let totalWomen = 0;
  let totalMen = 0;
  const buckets: Record<string, { female: number; male: number }> = {};
  for (const ag of ageGroups) buckets[ag] = { female: 0, male: 0 };

  for (const row of audience) {
    const reach = parseInt(row.reach) || 0;
    const bucket = buckets[row.age];
    if (!bucket) continue;
    if (row.gender === 'female') { bucket.female += reach; totalWomen += reach; }
    else if (row.gender === 'male') { bucket.male += reach; totalMen += reach; }
  }

  const grandTotal = totalWomen + totalMen || 1;
  const womenPct = ((totalWomen / grandTotal) * 100).toFixed(1);
  const menPct = ((totalMen / grandTotal) * 100).toFixed(1);
  const maxVal = Math.max(...ageGroups.map(ag => Math.max(buckets[ag].female, buckets[ag].male)), 1);

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-3">
        This ad reached <span className="font-semibold text-card-foreground">{totalReach.toLocaleString()}</span> people in your audience.
      </p>
      <div className="flex gap-4 text-sm mb-4">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" />
          {womenPct}% Women
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-teal-400 inline-block" />
          {menPct}% Men
        </span>
      </div>
      <div className="flex items-end gap-2 h-40">
        {ageGroups.map(ag => {
          const fH = (buckets[ag].female / maxVal) * 100;
          const mH = (buckets[ag].male / maxVal) * 100;
          return (
            <div key={ag} className="flex-1 flex flex-col items-center gap-1">
              <div className="flex items-end gap-1 w-full h-32">
                <div className="flex-1 bg-blue-500 rounded-t-sm transition-all" style={{ height: `${Math.max(fH, 2)}%` }} />
                <div className="flex-1 bg-teal-400 rounded-t-sm transition-all" style={{ height: `${Math.max(mH, 2)}%` }} />
              </div>
              <span className="text-xs text-muted-foreground">{ag}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AdResultsPage;
