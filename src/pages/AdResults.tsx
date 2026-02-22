import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, RefreshCw, ArrowLeft, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { EmailClient, EMAIL_CLIENT_OPTIONS, getEmailClientPreference, setEmailClientPreference, getEmailLink } from '@/utils/emailClientUtils';
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
  audience: any[] | null;
}

const AdResultsPage = () => {
  const { postId } = useParams<{ postId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<InsightsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<{
    full_name: string; preferred_email: string; email: string;
    first_name: string | null; cell_phone: string | null; bio: string | null;
  } | null>(null);
  const [sellerEmail, setSellerEmail] = useState('');
  const [clientFirstNames, setClientFirstNames] = useState('there');
  const fetchingRef = useRef(false);

  const listingAddress = searchParams.get('address') || '';
  const returnTo = searchParams.get('returnTo') || '';

  // Fetch agent profile
  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('full_name, preferred_email, email, first_name, cell_phone, bio')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => { if (data) setProfileData(data as any); });
  }, [user]);

  // Fetch seller email
  useEffect(() => {
    if (!user || !listingAddress) return;
    const streetPart = listingAddress.split(',')[0].trim();
    const addrWords = streetPart.split(/\s+/);
    const streetNumber = addrWords[0] || '';
    const streetKeyword = addrWords[1] || '';
    const flexiblePattern = streetNumber && streetKeyword
      ? `%${streetNumber}%${streetKeyword}%`
      : `%${streetPart}%`;

    supabase
      .from('estimated_net_properties')
      .select('seller_email, name')
      .eq('agent_id', user.id)
      .ilike('street_address', flexiblePattern)
      .limit(1)
      .maybeSingle()
      .then(({ data: propData }) => {
        if (propData?.seller_email) setSellerEmail(propData.seller_email);
        if (propData?.name) {
          const firstNames = propData.name.split(/\s*[&,]\s*/).map((n: string) => n.split(' ')[0]).join(' & ');
          if (firstNames) setClientFirstNames(firstNames);
        }
        if (!propData?.seller_email) {
          supabase
            .from('clients')
            .select('email, first_name')
            .eq('agent_id', user.id)
            .or(`street_name.ilike.%${streetKeyword}%,location.ilike.%${streetPart}%`)
            .limit(1)
            .maybeSingle()
            .then(({ data: clientData }) => {
              if (clientData?.email) setSellerEmail(clientData.email);
              if (clientData?.first_name) setClientFirstNames(clientData.first_name);
            });
        }
      });
  }, [user, listingAddress]);

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

  useEffect(() => { fetchInsights(); }, [fetchInsights]);

  // Build activity items from data
  const getActivityItems = useCallback(() => {
    if (!data) return [];
    const items: { label: string; value: number }[] = [];
    const ad = data.ad_insights;
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
          items.push({ label, value: parseInt(action.value) });
        }
      }
    } else {
      if (data.likes > 0) items.push({ label: 'Reactions', value: data.likes });
      if (data.comments > 0) items.push({ label: 'Comments', value: data.comments });
      if (data.shares > 0) items.push({ label: 'Shares', value: data.shares });
    }
    items.sort((a, b) => b.value - a.value);
    return items;
  }, [data]);

  const handleCopyAndEmail = async () => {
    const content = document.getElementById('ad-results-letter-content');
    if (!content) return;

    try {
      const clonedContent = content.cloneNode(true) as HTMLElement;

      // Convert logo to base64
      const logoImg = clonedContent.querySelector('img') as HTMLImageElement;
      if (logoImg) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          img.onload = () => {
            const targetWidth = 175;
            const scale = targetWidth / img.width;
            const targetHeight = img.height * scale;
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            ctx?.drawImage(img, 0, 0, targetWidth, targetHeight);
            logoImg.src = canvas.toDataURL('image/jpeg');
            logoImg.style.width = `${targetWidth}px`;
            logoImg.style.height = 'auto';
            logoImg.setAttribute('width', String(targetWidth));
            resolve(true);
          };
          img.onerror = reject;
          img.src = logoImg.src;
        });
      }

      // Remove non-email elements
      clonedContent.querySelectorAll('.no-pdf, .print\\:hidden').forEach(el => el.remove());

      // Style header
      const headerSection = clonedContent.querySelector('.flex.items-center.justify-between.mb-8');
      if (headerSection) {
        (headerSection as HTMLElement).style.cssText = 'display: flex; align-items: center; margin-bottom: 32px;';
      }
      const logoContainer = clonedContent.querySelector('.flex.items-center.gap-3');
      if (logoContainer) {
        (logoContainer as HTMLElement).style.cssText = 'display: flex; align-items: center; gap: 12px;';
        const textContainer = logoContainer.querySelector('div');
        if (textContainer) {
          (textContainer as HTMLElement).style.cssText = 'display: flex; flex-direction: column; justify-content: center; margin: 0;';
          const heading = textContainer.querySelector('h1');
          if (heading) (heading as HTMLElement).style.cssText = 'margin: 0; padding: 0; font-size: 30px; font-weight: bold; line-height: 1.2;';
          const subtitle = textContainer.querySelector('p');
          if (subtitle) (subtitle as HTMLElement).style.cssText = 'margin: 0; padding: 0; font-size: 16px; line-height: 1.2; color: #6b7280;';
        }
      }

      // Style metrics grid
      const metricsGrid = clonedContent.querySelector('[data-metrics-grid]');
      if (metricsGrid) {
        (metricsGrid as HTMLElement).style.cssText = 'display: flex; gap: 16px; margin: 24px 0;';
        metricsGrid.querySelectorAll('[data-metric-card]').forEach(card => {
          (card as HTMLElement).style.cssText = 'flex: 1; text-align: center; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb;';
        });
        metricsGrid.querySelectorAll('[data-metric-value]').forEach(val => {
          (val as HTMLElement).style.cssText = 'font-size: 28px; font-weight: bold; color: #111827; margin-bottom: 4px;';
        });
        metricsGrid.querySelectorAll('[data-metric-label]').forEach(lbl => {
          (lbl as HTMLElement).style.cssText = 'font-size: 14px; color: #6b7280;';
        });
      }

      // Style activity section for email
      const activitySection = clonedContent.querySelector('[data-activity-section]');
      if (activitySection) {
        (activitySection as HTMLElement).style.cssText = 'margin: 24px 0;';
        const heading = activitySection.querySelector('h3');
        if (heading) (heading as HTMLElement).style.cssText = 'font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #111827;';
        activitySection.querySelectorAll('[data-activity-row]').forEach(row => {
          (row as HTMLElement).style.cssText = 'display: flex; align-items: center; gap: 12px; margin-bottom: 8px;';
          const label = row.querySelector('span:first-child') as HTMLElement;
          if (label) label.style.cssText = 'font-size: 14px; color: #6b7280; width: 130px; flex-shrink: 0;';
          const barContainer = row.querySelector('div') as HTMLElement;
          if (barContainer) {
            barContainer.style.cssText = 'flex: 1; height: 24px; background: #f3f4f6; border-radius: 3px; overflow: hidden;';
            const bar = barContainer.querySelector('div') as HTMLElement;
            if (bar) bar.style.cssText = bar.style.cssText.replace(/background[^;]*;?/, '') + '; background: #f43f5e; height: 100%; border-radius: 3px;';
          }
          const value = row.querySelector('span:last-child') as HTMLElement;
          if (value) value.style.cssText = 'font-size: 14px; font-weight: 600; color: #111827; width: 48px; text-align: right; flex-shrink: 0;';
        });
      }

      // Style paragraphs
      clonedContent.querySelectorAll('p').forEach((p) => {
        if (!(p as HTMLElement).style.cssText) {
          (p as HTMLElement).style.cssText = 'margin: 16px 0; line-height: 1.6; color: #374151;';
        }
      });

      const htmlContent = clonedContent.innerHTML;
      const plainText = content.innerText;

      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([htmlContent], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' })
        })
      ]);

      toast({
        title: "Copied to clipboard",
        description: "Opening your email client...",
      });

      const emailClient = getEmailClientPreference();
      const subject = `Facebook Ad Results - ${listingAddress}`;
      const link = getEmailLink(sellerEmail, emailClient, subject);
      window.open(link, '_blank');
    } catch (error) {
      console.error('Failed to copy:', error);
      toast({
        title: "Copy failed",
        description: "Please try again or copy manually",
        variant: "destructive",
      });
    }
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
            <Button variant="outline" size="sm" onClick={() => {
              if (returnTo) navigate(`${returnTo}?tool=ad-results`);
              else navigate('/dashboard');
            }}>
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
  const totalEngagements = data.engagements || 0;
  const totalImpressions = ad?.impressions || data.impressions || 0;
  const totalReach = ad?.reach || data.reach || 0;
  const activityItems = getActivityItems();

  const agentFirstName = profileData?.first_name || profileData?.full_name?.split(' ')[0] || '';
  const agentFullName = profileData?.full_name || '';
  const agentPhone = profileData?.cell_phone || '';
  const agentEmail = profileData?.preferred_email || profileData?.email || '';
  const agentBio = profileData?.bio || '';

  // clientFirstNames is set via state from DB lookup

  const formatNumber = (num: number) => num.toLocaleString();

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar with back button */}
      <div className="border-b border-border bg-card print:hidden no-pdf">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => {
            if (returnTo) navigate(`${returnTo}?tool=ad-results`);
            else navigate('/dashboard');
          }}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
          </Button>
          <Button variant="ghost" size="sm" onClick={fetchInsights}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Letter Content */}
      <div className="py-8 px-4">
        <div className="max-w-4xl mx-auto" id="ad-results-letter-content">
          {/* Header: Logo + Title + Copy & Email */}
          <div className="flex items-center justify-between mb-8 print:mb-4">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Sell for 1 Percent" className="h-16 w-auto print:h-12" />
              <div>
                <h1 className="text-3xl font-bold text-foreground">Facebook Ad Results</h1>
                <p className="text-muted-foreground">{listingAddress}</p>
              </div>
            </div>
            <div className="flex gap-2 print:hidden no-pdf">
              <Button onClick={handleCopyAndEmail} size="lg" className="bg-rose-500 hover:bg-rose-600 text-white">
                <Copy className="mr-2 h-4 w-4" />
                Copy & Email
              </Button>
            </div>
          </div>

          {/* Letter Body */}
          <Card className="p-8 mb-6 print:shadow-none">
            <div className="prose prose-lg max-w-none text-foreground">
              <p className="mb-4">Hi {clientFirstNames},</p>

              <p className="mb-4">
                We know that the more eyeballs that we can get to see your home from buyers looking on their favorite real estate website like Zillow, Realtor.com or Redfin to posting paid ads on social media sites like Facebook and Instagram the better our chances of finding you a buyer.
              </p>

              <p className="mb-4">
                We recently posted a paid advertising campaign for your property on Facebook and Instagram and wanted to share the results of that ad with you.
              </p>

              {/* Metrics Grid */}
              <div className="grid grid-cols-3 gap-4 my-6 not-prose" data-metrics-grid>
                <div className="text-center p-4 border rounded-lg bg-muted/30" data-metric-card>
                  <div className="text-3xl font-bold text-foreground" data-metric-value>{formatNumber(totalEngagements)}</div>
                  <div className="text-sm text-muted-foreground" data-metric-label>Engagements</div>
                </div>
                <div className="text-center p-4 border rounded-lg bg-muted/30" data-metric-card>
                  <div className="text-3xl font-bold text-foreground" data-metric-value>{formatNumber(totalImpressions)}</div>
                  <div className="text-sm text-muted-foreground" data-metric-label>Views</div>
                </div>
                <div className="text-center p-4 border rounded-lg bg-muted/30" data-metric-card>
                  <div className="text-3xl font-bold text-foreground" data-metric-value>{formatNumber(totalReach)}</div>
                  <div className="text-sm text-muted-foreground" data-metric-label>People Reached</div>
                </div>
              </div>

              {/* Activity Breakdown */}
              {activityItems.length > 0 && (() => {
                const maxVal = activityItems[0]?.value || 1;
                return (
                  <div className="my-6 not-prose" data-activity-section>
                    <h3 className="font-semibold text-lg mb-3 text-foreground">Activity</h3>
                    <div className="space-y-2.5">
                      {activityItems.map((item, i) => (
                        <div key={i} className="flex items-center gap-3" data-activity-row>
                          <span className="text-sm text-muted-foreground w-32 shrink-0 truncate">{item.label}</span>
                          <div className="flex-1 h-6 bg-muted rounded-sm overflow-hidden">
                            <div
                              className="h-full bg-rose-500 rounded-sm"
                              style={{ width: `${Math.max((item.value / maxVal) * 100, 3)}%` }}
                            />
                          </div>
                          <span className="text-sm font-semibold text-foreground w-12 text-right shrink-0">{formatNumber(item.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <p className="mb-4">Let me know if you have any questions.</p>

              <p className="mb-4">Thanks</p>
              <p className="mb-4">{agentFirstName}</p>

              {/* Agent Signature */}
              {agentBio ? (
                /<[a-z][\s\S]*>/i.test(agentBio) ? (
                  <div className="mb-4 [&_img]:max-w-full [&_img]:h-auto" dangerouslySetInnerHTML={{ __html: agentBio.replace(/<P>/gi, '<br><br>') }} />
                ) : (
                  <p className="mb-4 whitespace-pre-line">{agentBio}</p>
                )
              ) : (
                <>
                  <p className="mb-0">{agentFullName}</p>
                  {agentPhone && <p className="mb-0">cell: {agentPhone}</p>}
                  {agentEmail && <p className="mb-4">email: {agentEmail}</p>}
                </>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdResultsPage;
