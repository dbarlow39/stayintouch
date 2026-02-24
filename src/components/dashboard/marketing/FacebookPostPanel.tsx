import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Facebook, Check, Loader2, Link2, DollarSign, Calendar, MapPin, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { MarketingListing, formatListingPrice } from '@/data/marketingListings';
import FacebookAdResults from './FacebookAdResults';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const budgetOptions = [
  { value: '5', label: '$5/day' },
  { value: '10', label: '$10/day' },
  { value: '15', label: '$15/day' },
  { value: '20', label: '$20/day' },
  { value: '25', label: '$25/day' },
  { value: '50', label: '$50/day' },
  { value: '100', label: '$100/day' },
];

const durationOptions = [
  { value: '3', label: '3 days' },
  { value: '5', label: '5 days' },
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
];

const radiusOptions = [
  { value: '15', label: '15 Miles' },
  { value: '20', label: '20 Miles' },
  { value: '25', label: '25 Miles' },
  { value: '30', label: '30 Miles' },
];

interface FacebookPostPanelProps {
  listing: MarketingListing;
}

const FacebookPostPanel = ({ listing }: FacebookPostPanelProps) => {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [pageName, setPageName] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [postId, setPostId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [boostEnabled, setBoostEnabled] = useState(false);
  const [boostConfig, setBoostConfig] = useState({
    dailyBudget: '10',
    duration: '7',
    radius: '15',
    targetZip: listing.zip
  });
  const [showResults, setShowResults] = useState(false);

  const fullAddress = `${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}`;

  // Check if Facebook is connected
  useEffect(() => {
    if (!user) return;
    checkConnection();
  }, [user]);

  // Handle redirect back from OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fbConnected = params.get('fb_connected');
    const fbError = params.get('fb_error');
    if (fbConnected) {
      setConnected(true);
      setPageName(fbConnected);
      setLoading(false);
      toast.success(`Connected to ${fbConnected}!`);
      const url = new URL(window.location.href);
      url.searchParams.delete('fb_connected');
      window.history.replaceState({}, '', url.toString());
    } else if (fbError) {
      toast.error(`Facebook connection failed: ${fbError}`);
      const url = new URL(window.location.href);
      url.searchParams.delete('fb_error');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const checkConnection = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('facebook_oauth_tokens' as any)
        .select('page_name, access_token, page_access_token')
        .eq('agent_id', user!.id)
        .maybeSingle();
      console.log('[FB] checkConnection result:', data);
      if (data && (data as any).access_token) {
        setConnected(true);
        setPageName((data as any).page_name || 'Facebook');
        // Flag if page token is missing (needs reconnect)
        if (!(data as any).page_access_token) {
          setPageName('');
          setConnected(false);
        }
      }
    } catch (err) {
      console.error('[FB] checkConnection error:', err);
    }
    setLoading(false);
  };

  const disconnectFacebook = async () => {
    try {
      await supabase
        .from('facebook_oauth_tokens' as any)
        .delete()
        .eq('agent_id', user!.id);
      setConnected(false);
      setPageName('');
      setMessage('');
      toast.success('Facebook disconnected. You can reconnect now.');
    } catch (err) {
      console.error('[FB] disconnect error:', err);
    }
  };

  const connectFacebook = async () => {
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/facebook-auth-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({ agent_id: user!.id, app_origin: window.location.origin }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      window.open(data.auth_url, '_blank');
    } catch (err: any) {
      toast.error(err.message || 'Failed to start Facebook login');
    }
  };

  const generateDefaultMessage = () => {
    const price = formatListingPrice(listing.price);
    const agentPhoneMap: Record<string, string> = {
      'David E Barlow': '614-778-6616',
      'Jaysen E Barlow': '614-579-1442',
      'Jaime Barlow': '614-493-8541',
      'Jaime E Barlow': '614-493-8541',
    };
    const agentPhoneVal = (listing.agent?.phone && !/^\*+$/.test(listing.agent.phone))
      ? listing.agent.phone
      : (listing.agent?.name ? agentPhoneMap[listing.agent.name] || '' : '');
    const phoneDisplay = agentPhoneVal ? ` at ${agentPhoneVal}` : '';
    return `🏠 ${listing.status === 'sold' ? 'JUST SOLD!' : 'NEW LISTING!'}\n\n📍 ${fullAddress}\n💰 ${price}\n🛏️ ${listing.beds} Beds | 🛁 ${listing.baths} Baths | 📐 ${listing.sqft.toLocaleString()} sqft\n\n${listing.description?.slice(0, 200) || ''}\n\n📞 Contact ${listing.agent?.name || 'us'}${phoneDisplay} for details!\n\n#RealEstate #${listing.city.replace(/\s/g, '')} #HomeForSale #Ohio`;
  };

  useEffect(() => {
    if (connected && !message) {
      setMessage(generateDefaultMessage());
    }
  }, [connected]);

  const postToFacebook = async () => {
    if (!message.trim()) {
      toast.error('Please enter a message');
      return;
    }
    setPosting(true);
    try {
      const body: any = {
        agent_id: user!.id,
        message: message.trim(),
      };
      if (listing.photos?.length > 0) {
        body.photo_url = listing.photos[0];
      }

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/facebook-post-listing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      console.log('[FB] Post response:', data);
      if (data.error) throw new Error(data.error);
      const returnedPostId = data.post_id || data.id || null;
      console.log('[FB] Setting postId to:', returnedPostId);
      setPosted(true);
      setPostId(returnedPostId);

      // Save to facebook_ad_posts table for tracking
      if (returnedPostId) {
        try {
          const fullAddress = `${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}`;
          await supabase.from('facebook_ad_posts' as any).insert({
            agent_id: user!.id,
            listing_id: listing.id,
            listing_address: fullAddress,
            post_id: returnedPostId,
            daily_budget: boostEnabled ? Number(boostConfig.dailyBudget) : 0,
            duration_days: boostEnabled ? Number(boostConfig.duration) : 0,
            status: boostEnabled ? 'boosted' : 'organic',
          });
        } catch (dbErr) {
          console.error('[FB] Failed to save ad post record:', dbErr);
        }
      }

      // Handle boost if enabled
      if (boostEnabled && returnedPostId) {
        try {
          const boostResp = await fetch(`${SUPABASE_URL}/functions/v1/boost-facebook-post`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${ANON_KEY}`,
            },
            body: JSON.stringify({
              agent_id: user!.id,
              post_id: returnedPostId,
              daily_budget: Number(boostConfig.dailyBudget),
              duration_days: Number(boostConfig.duration),
              radius_miles: Number(boostConfig.radius),
              zip: boostConfig.targetZip || undefined,
            }),
          });
          const boostData = await boostResp.json();
          if (boostData.error) throw new Error(boostData.error);
          toast.success(`Posted and boosted! $${Number(boostConfig.dailyBudget) * Number(boostConfig.duration)} over ${boostConfig.duration} days 🚀`);
        } catch (err: any) {
          toast.warning('Post created but boost failed: ' + (err.message || 'Unknown error'));
        }
      } else {
        toast.success('Posted to Facebook! 🎉');
      }

      setBoostEnabled(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to post to Facebook');
    }
    setPosting(false);
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
        <Facebook className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-bold text-card-foreground">Post to Facebook & Instagram</h3>
        </div>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <Facebook className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-bold text-card-foreground">Post to Facebook & Instagram</h3>
      </div>

      {!connected ? (
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground mb-3">
            Connect your Facebook Page to post listing ads directly.
          </p>
          <Button onClick={connectFacebook} className="w-full" size="sm">
            <Link2 className="w-4 h-4 mr-2" />
            Connect Facebook Page
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Check className="w-3 h-3 text-emerald-500" />
              Connected to <span className="font-medium text-foreground">{pageName}</span>
            </p>
            <Button variant="ghost" size="sm" className="text-xs h-6 px-2 text-muted-foreground" onClick={disconnectFacebook}>
              Disconnect
            </Button>
          </div>

          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-[200px] text-sm mb-3"
            placeholder="Write your Facebook post..."
          />

          {/* Boost toggle */}
          <div className="border border-border rounded-lg p-3 mb-3">
            <div className="flex items-center gap-2 mb-3">
              <Checkbox
                id="boost-toggle"
                checked={boostEnabled}
                onCheckedChange={(checked) => setBoostEnabled(checked as boolean)}
              />
              <label htmlFor="boost-toggle" className="text-sm font-medium text-card-foreground cursor-pointer">
                Boost this post
              </label>
            </div>

            {boostEnabled && (
              <div className="space-y-3 pt-3 border-t border-border">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      <DollarSign className="w-3 h-3 inline mr-1" />Daily Budget
                    </label>
                    <Select value={boostConfig.dailyBudget} onValueChange={(val) => setBoostConfig({ ...boostConfig, dailyBudget: val })}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {budgetOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      <Calendar className="w-3 h-3 inline mr-1" />Duration
                    </label>
                    <Select value={boostConfig.duration} onValueChange={(val) => setBoostConfig({ ...boostConfig, duration: val })}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {durationOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      <MapPin className="w-3 h-3 inline mr-1" />Targeting Radius
                    </label>
                    <Select value={boostConfig.radius} onValueChange={(val) => setBoostConfig({ ...boostConfig, radius: val })}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {radiusOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      <MapPin className="w-3 h-3 inline mr-1" />Zip Code
                    </label>
                    <Input
                      value={boostConfig.targetZip}
                      onChange={(e) => setBoostConfig({ ...boostConfig, targetZip: e.target.value })}
                      placeholder="Zip code"
                      className="text-sm"
                      maxLength={5}
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Total: ${Number(boostConfig.dailyBudget) * Number(boostConfig.duration)} over {boostConfig.duration} days
                </p>
              </div>
            )}
          </div>

          <Button
            onClick={postToFacebook}
            disabled={posting || posted || !message.trim()}
            className="w-full"
            size="sm"
          >
            {posted ? (
              <><Check className="w-4 h-4 mr-2" /> Posted!</>
            ) : posting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Posting...</>
            ) : (
              <><Facebook className="w-4 h-4 mr-2" /> Post to Facebook & Instagram</>
            )}
          </Button>

          {/* View Results button after posting */}
          {posted && postId && !showResults && (
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2"
              onClick={() => setShowResults(true)}
            >
              <BarChart3 className="w-4 h-4 mr-2" /> View Ad Results
            </Button>
          )}

          {/* Results panel */}
          {showResults && postId && (
            <div className="mt-3 border border-border rounded-lg p-4">
              <FacebookAdResults
                postId={postId}
                listingAddress={fullAddress}
                onClose={() => setShowResults(false)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FacebookPostPanel;
