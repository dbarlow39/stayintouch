import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  BarChart3, Eye, MousePointerClick, DollarSign, Users, Heart,
  MessageSquare, Share2, Loader2, TrendingUp, ExternalLink, RefreshCw, Maximize2
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface FacebookAdResultsProps {
  postId: string;
  listingAddress?: string;
  onClose?: () => void;
}

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

const FacebookAdResults = ({ postId, listingAddress, onClose }: FacebookAdResultsProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<InsightsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const fetchInsights = useCallback(async () => {
    if (!user || fetchingRef.current) return;
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
      toast.error('Failed to load ad results');
    }
    setLoading(false);
    fetchingRef.current = false;
  }, [postId, user]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading ad results...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-destructive mb-3">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchInsights}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
        </Button>
      </div>
    );
  }

  if (!data) return null;

  // Use ad insights if available (boosted), otherwise use organic metrics
  // The edge function now returns ad-reported engagements when ad_insights exist,
  // so data.engagements already reflects the correct source
  const ad = data.ad_insights;
  const totalReach = data.reach || 0;
  const totalImpressions = data.impressions || 0;
  const totalClicks = data.clicks || 0;
  const totalSpend = ad?.spend || 0;
  const totalEngagements = data.engagements || 0;

  // Activity breakdown - prefer ad actions when available (matches Facebook Ads Manager)
  const activityItems: { label: string; value: number; color: string }[] = [];

  if (ad?.actions && Array.isArray(ad.actions) && ad.actions.length > 0) {
    // Only show the same activity items Facebook Ads Manager displays
    const allowedActions: Record<string, string> = {
      post_engagement: 'Post engagements',
      link_click: 'Link clicks',
      post_reaction: 'Post reactions',
      post: 'Post shares',
      like: 'Facebook likes',
      'onsite_conversion.post_save': 'Post saves',
    };
    ad.actions.forEach((action: any) => {
      const label = allowedActions[action.action_type];
      if (label && action.value && parseInt(action.value) > 0) {
        activityItems.push({
          label,
          value: parseInt(action.value),
          color: 'bg-rose-500',
        });
      }
    });
  } else {
    // Fall back to organic post insights
    if (data.click_types && typeof data.click_types === 'object') {
      const typeLabels: Record<string, string> = {
        link_clicks: 'Link clicks',
        other_clicks: 'Other clicks',
        photo_view: 'Photo views',
        video_play: 'Video plays',
      };
      Object.entries(data.click_types).forEach(([key, val]) => {
        if (typeof val === 'number' && val > 0) {
          activityItems.push({
            label: typeLabels[key] || key.replace(/_/g, ' '),
            value: val,
            color: 'bg-rose-500',
          });
        }
      });
    }

    // Add organic reactions/comments/shares
    if (activityItems.length === 0) {
      if (data.likes > 0) activityItems.push({ label: 'Reactions', value: data.likes, color: 'bg-rose-400' });
      if (data.comments > 0) activityItems.push({ label: 'Comments', value: data.comments, color: 'bg-rose-500' });
      if (data.shares > 0) activityItems.push({ label: 'Shares', value: data.shares, color: 'bg-rose-500' });
    }
  }

  // Sort by value descending
  activityItems.sort((a, b) => b.value - a.value);
  const maxActivity = activityItems.length > 0 ? activityItems[0].value : 1;

  const postDate = data.created_time
    ? new Date(data.created_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-card-foreground flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Ad Results
          </h3>
          {listingAddress && (
            <p className="text-xs text-muted-foreground mt-0.5">{listingAddress}</p>
          )}
          {postDate && (
            <p className="text-xs text-muted-foreground">Posted {postDate}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={fetchInsights} className="h-7">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} className="h-7 text-xs">
              Close
            </Button>
          )}
        </div>
      </div>

      {/* Spend summary */}
      {totalSpend > 0 && (
        <p className="text-xs text-muted-foreground">
          ${totalSpend.toFixed(2)} spent{ad ? ' (boosted)' : ''}
        </p>
      )}

      {/* Performance Cards */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          icon={<Users className="w-4 h-4 text-blue-500" />}
          label="Post engagements"
          value={totalEngagements.toLocaleString()}
        />
        <MetricCard
          icon={<Eye className="w-4 h-4 text-indigo-500" />}
          label="Views"
          value={totalImpressions.toLocaleString()}
        />
        <MetricCard
          icon={<TrendingUp className="w-4 h-4 text-amber-500" />}
          label="Reach"
          value={totalReach.toLocaleString()}
        />
      </div>

      {/* Activity Breakdown */}
      {activityItems.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-card-foreground mb-2">Activity</h4>
          <div className="space-y-2">
            {activityItems.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-24 truncate">{item.label}</span>
                <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
                  <div
                    className={`h-full ${item.color} rounded-sm transition-all`}
                    style={{ width: `${Math.max((item.value / maxActivity) * 100, 4)}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-card-foreground w-10 text-right">
                  {item.value.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Social Engagement */}
      <div>
        <h4 className="text-sm font-semibold text-card-foreground mb-2">Engagement</h4>
        <div className="grid grid-cols-3 gap-2">
          <div className="flex items-center gap-1.5 text-xs">
            <Heart className="w-3.5 h-3.5 text-red-500" />
            <span className="text-card-foreground font-medium">{data.likes}</span>
            <span className="text-muted-foreground">Likes</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-card-foreground font-medium">{data.comments}</span>
            <span className="text-muted-foreground">Comments</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <Share2 className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-card-foreground font-medium">{data.shares}</span>
            <span className="text-muted-foreground">Shares</span>
          </div>
        </div>
      </div>

      {/* Audience Breakdown */}
      {data.audience && data.audience.length > 0 && (
        <>
          <Separator />
          <AudienceBreakdown audience={data.audience} totalReach={totalReach} />
        </>
      )}

      {/* Action Buttons */}
      <div className="space-y-2">
        <Button
          variant="default"
          size="sm"
          className="w-full text-xs"
          onClick={() => {
            const params = new URLSearchParams();
            if (listingAddress) params.set('address', listingAddress);
            navigate(`/ad-results/${postId}?${params.toString()}`);
          }}
        >
          <Maximize2 className="w-3.5 h-3.5 mr-1.5" /> View Full Report and Email Report
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={() => {
            window.open(`https://www.facebook.com/${postId}`, '_blank');
          }}
        >
          <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> View on Facebook
        </Button>
      </div>
    </div>
  );
};

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="border border-border rounded-lg p-3 bg-card">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className="text-lg font-bold text-card-foreground">{value}</span>
    </div>
  );
}

function AudienceBreakdown({ audience, totalReach }: { audience: AudienceRow[]; totalReach: number }) {
  // Aggregate by age group
  const ageGroups = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
  const genderColors: Record<string, string> = { female: 'bg-blue-500', male: 'bg-teal-400' };

  // Calculate totals per gender
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
      <h4 className="text-sm font-semibold text-card-foreground mb-1">Audience</h4>
      <p className="text-xs text-muted-foreground mb-3">
        This ad reached <span className="font-semibold text-card-foreground">{totalReach.toLocaleString()}</span> people in your audience.
      </p>
      <div className="flex gap-4 text-xs mb-3">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />
          {womenPct}% Women
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-teal-400 inline-block" />
          {menPct}% Men
        </span>
      </div>
      <div className="flex items-end gap-1.5 h-32">
        {ageGroups.map(ag => {
          const fH = (buckets[ag].female / maxVal) * 100;
          const mH = (buckets[ag].male / maxVal) * 100;
          return (
            <div key={ag} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="flex items-end gap-0.5 w-full h-24">
                <div className="flex-1 bg-blue-500 rounded-t-sm transition-all" style={{ height: `${Math.max(fH, 2)}%` }} />
                <div className="flex-1 bg-teal-400 rounded-t-sm transition-all" style={{ height: `${Math.max(mH, 2)}%` }} />
              </div>
              <span className="text-[10px] text-muted-foreground">{ag}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default FacebookAdResults;
