import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PropertyData } from "@/types/estimatedNet";
import { ArrowLeft, List, Mail, Calendar, FileText, Copy, DollarSign, ClipboardList, Settings, Home, Bell, Edit, BarChart3 } from "lucide-react";
import { EmailClient, EMAIL_CLIENT_OPTIONS, getEmailClientPreference, setEmailClientPreference, getEmailLink } from "@/utils/emailClientUtils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.jpg";

interface AdResultsLetterViewProps {
  propertyData: PropertyData;
  propertyId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
  onNavigate: (view: string) => void;
}

interface AdMetrics {
  engagements: number;
  impressions: number;
  reach: number;
  spend: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  linkClicks: number;
  videoViews: number;
}

const AdResultsLetterView = ({ propertyData, propertyId, onBack, onEdit, onNavigate }: AdResultsLetterViewProps) => {
  const { toast } = useToast();
  const [emailClient, setEmailClientState] = useState<EmailClient>(getEmailClientPreference);
  const [agentEmail, setAgentEmail] = useState("");
  const [agentFirstName, setAgentFirstName] = useState("");
  const [agentFullName, setAgentFullName] = useState("");
  const [agentPhone, setAgentPhone] = useState("");
  const [agentBio, setAgentBio] = useState("");
  const [metrics, setMetrics] = useState<AdMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [noAds, setNoAds] = useState(false);

  useEffect(() => {
    const fetchAgentProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('preferred_email, email, first_name, last_name, cell_phone, bio')
          .eq('id', user.id)
          .single();
        if (profile) {
          setAgentEmail(profile.preferred_email || profile.email || "");
          setAgentFirstName(profile.first_name || "");
          setAgentFullName(`${profile.first_name || ""} ${profile.last_name || ""}`.trim());
          setAgentPhone(profile.cell_phone || "");
          setAgentBio(profile.bio || "");
        }
      }
    };
    fetchAgentProfile();
  }, []);

  // Fetch ad results for this property
  useEffect(() => {
    const fetchAdResults = async () => {
      setLoading(true);
      try {
        const fullAddress = `${propertyData.streetAddress}, ${propertyData.city}, ${propertyData.state} ${propertyData.zip}`;
        
        // Build a flexible search pattern from street number + first word
        const streetParts = propertyData.streetAddress?.trim().split(/\s+/) || [];
        const streetNumber = streetParts[0] || "";
        const streetWord = streetParts[1] || "";
        const flexiblePattern = streetNumber && streetWord ? `%${streetNumber}%${streetWord}%` : `%${propertyData.streetAddress}%`;

        const { data: adPosts } = await supabase
          .from('facebook_ad_posts')
          .select('post_id, campaign_id, ad_id')
          .ilike('listing_address', flexiblePattern)
          .order('boost_started_at', { ascending: false })
          .limit(1);

        if (!adPosts || adPosts.length === 0) {
          setNoAds(true);
          setLoading(false);
          return;
        }

        const post = adPosts[0];

        // Fetch insights from the edge function
        const { data: insights, error } = await supabase.functions.invoke('facebook-ad-insights', {
          body: {
            postId: post.post_id,
            campaignId: post.campaign_id,
            adId: post.ad_id,
          }
        });

        if (error) {
          console.error('Error fetching ad insights:', error);
          setNoAds(true);
        } else if (insights) {
          setMetrics({
            engagements: insights.engagements || 0,
            impressions: insights.impressions || 0,
            reach: insights.reach || 0,
            spend: insights.spend || 0,
            likes: insights.likes || 0,
            comments: insights.comments || 0,
            shares: insights.shares || 0,
            saves: insights.saves || 0,
            linkClicks: insights.linkClicks || 0,
            videoViews: insights.videoViews || 0,
          });
        }
      } catch (err) {
        console.error('Error loading ad results:', err);
        setNoAds(true);
      } finally {
        setLoading(false);
      }
    };

    fetchAdResults();
  }, [propertyData]);

  const handleEmailClientChange = (value: string) => {
    const client = value as EmailClient;
    setEmailClientState(client);
    setEmailClientPreference(client);
  };

  const handleCopyToClipboard = async () => {
    const content = document.getElementById('ad-results-letter-content');
    if (!content) return;

    try {
      const clonedContent = content.cloneNode(true) as HTMLElement;

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
            const dataUrl = canvas.toDataURL('image/jpeg');
            logoImg.src = dataUrl;
            logoImg.style.width = `${targetWidth}px`;
            logoImg.style.height = 'auto';
            logoImg.setAttribute('width', String(targetWidth));
            resolve(true);
          };
          img.onerror = reject;
          img.src = logoImg.src;
        });
      }

      const noPdfElements = clonedContent.querySelectorAll('.no-pdf, .print\\:hidden');
      noPdfElements.forEach(el => el.remove());

      // Style the header
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
          if (heading) {
            (heading as HTMLElement).style.cssText = 'margin: 0; padding: 0; font-size: 30px; font-weight: bold; line-height: 1.2;';
          }
          const subtitle = textContainer.querySelector('p');
          if (subtitle) {
            (subtitle as HTMLElement).style.cssText = 'margin: 0; padding: 0; font-size: 16px; line-height: 1.2; color: #6b7280;';
          }
        }
      }

      // Style metrics grid for email
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

      // Style activity breakdown for email
      const activityGrid = clonedContent.querySelector('[data-activity-grid]');
      if (activityGrid) {
        (activityGrid as HTMLElement).style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0;';
        activityGrid.querySelectorAll('[data-activity-item]').forEach(item => {
          (item as HTMLElement).style.cssText = 'display: flex; justify-content: space-between; width: 48%; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; background: #f9fafb;';
        });
      }

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

      const subject = `Facebook Ad Results - ${propertyData.streetAddress}`;
      const recipients = propertyData.sellerEmail || "";
      const link = getEmailLink(recipients, emailClient, subject);
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

  const clientFirstNames = propertyData.name?.split(/\s*[&,]\s*/).map(n => n.split(' ')[0]).join(' & ') || "there";
  const fullAddress = `${propertyData.streetAddress}${propertyData.city ? `, ${propertyData.city}` : ""}${propertyData.state ? `, ${propertyData.state}` : ""}${propertyData.zip ? ` ${propertyData.zip}` : ""}`;

  const formatNumber = (num: number) => num.toLocaleString();

  const navigationItems = [
    { label: "Back", icon: ArrowLeft, onClick: onBack },
    { label: "Back to Property Info", icon: ArrowLeft, onClick: () => onEdit(propertyId) },
    { label: "My Properties", icon: List, onClick: onBack },
    { label: "Estimated Net", icon: DollarSign, onClick: () => onNavigate('results') },
    { label: "Offer Summary", icon: ClipboardList, onClick: () => onNavigate('offer-summary') },
    { label: "Offer Letter", icon: Mail, onClick: () => onNavigate('offer-letter') },
    { label: "Important Dates Letter", icon: Calendar, onClick: () => onNavigate('important-dates') },
    { label: "Title Letter", icon: Home, onClick: () => onNavigate('title-letter') },
    { label: "Agent Letter", icon: Mail, onClick: () => onNavigate('agent-letter') },
    { label: "Notices", icon: Bell, onClick: () => onNavigate('notices') },
    { label: "Closed", icon: FileText, onClick: () => onNavigate('closed-referral-letter') },
    { label: "Ad Results Letter", icon: BarChart3, onClick: () => {}, active: true },
  ];

  return (
    <div className="flex w-full min-h-[600px]">
      {/* Left Sidebar Navigation */}
      <aside className="w-56 p-3 border-r bg-card shrink-0 print:hidden no-pdf">
        <div className="flex items-center gap-2 mb-4 px-1">
          <Settings className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={emailClient} onValueChange={handleEmailClientChange}>
            <SelectTrigger className="h-8 text-sm bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              {EMAIL_CLIENT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          {navigationItems.map((item, idx) => (
            <Button
              key={idx}
              variant="ghost"
              className={`w-full justify-start text-left h-auto py-2 px-3 ${item.active ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : ''}`}
              onClick={item.onClick}
              type="button"
            >
              <item.icon className="mr-2 h-4 w-4 shrink-0" />
              <span className="text-sm">{item.label}</span>
            </Button>
          ))}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 py-8 px-4">
        <div className="max-w-4xl mx-auto" id="ad-results-letter-content">
          <div className="flex items-center justify-between mb-8 print:mb-4">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Sell for 1 Percent" className="h-16 w-auto print:h-12" />
              <div>
                <h1 className="text-3xl font-bold text-foreground">Facebook Ad Results</h1>
                <p className="text-muted-foreground">{fullAddress}</p>
              </div>
            </div>
            <div className="flex gap-2 print:hidden no-pdf">
              <Button onClick={handleCopyToClipboard} size="lg" className="bg-blue-500 hover:bg-blue-600 text-white" disabled={loading || noAds}>
                <Copy className="mr-2 h-4 w-4" />
                Copy & Email
              </Button>
            </div>
          </div>

          <Card className="p-8 mb-6 print:shadow-none">
            <div className="prose prose-lg max-w-none text-foreground">
              <p className="mb-4">Hi {clientFirstNames},</p>

              <p className="mb-4">
                We know that the more eyeballs that we can get to see your home from buyers looking on their favorite real estate website like Zillow, Realtor.com or Redfin to posting paid ads on social media sites like Facebook and Instagram the better our chances of finding you a buyer.
              </p>

              <p className="mb-4">
                We recently posted a paid advertising campaign for your property on Facebook and Instagram and wanted to share the results of that ad with you.
              </p>

              {/* Ad Results Section */}
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-pulse space-y-4">
                    <div className="h-6 bg-muted rounded w-48 mx-auto" />
                    <div className="flex gap-4 justify-center">
                      <div className="h-24 w-32 bg-muted rounded" />
                      <div className="h-24 w-32 bg-muted rounded" />
                      <div className="h-24 w-32 bg-muted rounded" />
                    </div>
                  </div>
                </div>
              ) : noAds ? (
                <div className="text-center py-6 bg-muted/30 rounded-lg">
                  <p className="text-muted-foreground">No Facebook ad data found for this property.</p>
                </div>
              ) : metrics ? (
                <div className="my-6">
                  {/* Primary Metrics */}
                  <div className="grid grid-cols-3 gap-4 mb-6" data-metrics-grid>
                    <div className="text-center p-4 border rounded-lg bg-muted/30" data-metric-card>
                      <div className="text-3xl font-bold text-foreground" data-metric-value>{formatNumber(metrics.engagements)}</div>
                      <div className="text-sm text-muted-foreground" data-metric-label>Engagements</div>
                    </div>
                    <div className="text-center p-4 border rounded-lg bg-muted/30" data-metric-card>
                      <div className="text-3xl font-bold text-foreground" data-metric-value>{formatNumber(metrics.impressions)}</div>
                      <div className="text-sm text-muted-foreground" data-metric-label>Views</div>
                    </div>
                    <div className="text-center p-4 border rounded-lg bg-muted/30" data-metric-card>
                      <div className="text-3xl font-bold text-foreground" data-metric-value>{formatNumber(metrics.reach)}</div>
                      <div className="text-sm text-muted-foreground" data-metric-label>People Reached</div>
                    </div>
                  </div>

                  {/* Activity Breakdown */}
                  <h3 className="font-semibold text-lg mb-3">Activity Breakdown</h3>
                  <div className="grid grid-cols-2 gap-2 mb-6" data-activity-grid>
                    {[
                      { label: "Likes", value: metrics.likes },
                      { label: "Comments", value: metrics.comments },
                      { label: "Shares", value: metrics.shares },
                      { label: "Saves", value: metrics.saves },
                      { label: "Link Clicks", value: metrics.linkClicks },
                      { label: "Video Views", value: metrics.videoViews },
                    ].filter(item => item.value > 0).map(item => (
                      <div key={item.label} className="flex justify-between items-center py-2 px-3 border rounded-md bg-muted/20" data-activity-item>
                        <span className="text-sm text-muted-foreground">{item.label}</span>
                        <span className="font-semibold text-foreground">{formatNumber(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <p className="mb-4">Let me know if you have any questions.</p>

              <p className="mb-4">Thanks</p>
              <p className="mb-4">{agentFirstName}</p>
              {agentBio ? (
                /<[a-z][\s\S]*>/i.test(agentBio) ? (
                  <div className="mb-4 [&_img]:max-w-full [&_img]:h-auto" dangerouslySetInnerHTML={{ __html: agentBio.replace(/<P>/gi, '<br><br>') }} />
                ) : (
                  <p className="mb-4 whitespace-pre-line">{agentBio}</p>
                )
              ) : (
                <>
                  <p className="mb-0">{agentFullName}</p>
                  <p className="mb-0">cell: {agentPhone}</p>
                  <p className="mb-4">email: {agentEmail}</p>
                </>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdResultsLetterView;
