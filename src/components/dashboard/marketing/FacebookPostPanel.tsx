import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Facebook, Check, Loader2, Link2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { MarketingListing, formatListingPrice } from '@/data/marketingListings';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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
  const [message, setMessage] = useState('');

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
        .select('page_name, access_token')
        .eq('agent_id', user!.id)
        .maybeSingle();
      console.log('[FB] checkConnection result:', data);
      if (data && (data as any).access_token) {
        setConnected(true);
        setPageName((data as any).page_name || 'Facebook');
      }
    } catch (err) {
      console.error('[FB] checkConnection error:', err);
    }
    setLoading(false);
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

  const handleOAuthCallback = async (code: string) => {
    setLoading(true);
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/facebook-oauth-callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({ code, agent_id: user!.id }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      setConnected(true);
      setPageName(data.page_name);
      toast.success(`Connected to ${data.page_name}!`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to connect Facebook');
    }
    setLoading(false);
  };

  const generateDefaultMessage = () => {
    const price = formatListingPrice(listing.price);
    return `🏠 ${listing.status === 'sold' ? 'JUST SOLD!' : 'NEW LISTING!'}\n\n📍 ${fullAddress}\n💰 ${price}\n🛏️ ${listing.beds} Beds | 🛁 ${listing.baths} Baths | 📐 ${listing.sqft.toLocaleString()} sqft\n\n${listing.description?.slice(0, 200) || ''}\n\n📞 Contact ${listing.agent?.name || 'us'} for details!\n\n#RealEstate #${listing.city.replace(/\s/g, '')} #HomeForSale #Ohio`;
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
      // If listing has photos, use the first one
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
      if (data.error) throw new Error(data.error);
      setPosted(true);
      toast.success('Posted to Facebook! 🎉');
      setTimeout(() => setPosted(false), 5000);
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
          <h3 className="text-lg font-bold text-card-foreground">Post to Facebook</h3>
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
        <h3 className="text-lg font-bold text-card-foreground">Post to Facebook</h3>
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
          <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
            <Check className="w-3 h-3 text-emerald-500" />
            Connected to <span className="font-medium text-foreground">{pageName}</span>
          </p>

          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-[200px] text-sm mb-3"
            placeholder="Write your Facebook post..."
          />

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
              <><ExternalLink className="w-4 h-4 mr-2" /> Post to Facebook Page</>
            )}
          </Button>
        </>
      )}
    </div>
  );
};

export default FacebookPostPanel;
