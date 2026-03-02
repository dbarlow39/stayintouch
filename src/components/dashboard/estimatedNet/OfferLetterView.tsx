import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PropertyData } from "@/types/estimatedNet";
import { ArrowLeft, List, Mail, Calendar, FileText, Copy, DollarSign, ClipboardList, Settings } from "lucide-react";
import { EmailClient, EMAIL_CLIENT_OPTIONS, getEmailClientPreference, setEmailClientPreference, openEmailClient } from "@/utils/emailClientUtils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.jpg";

interface OfferLetterViewProps {
  propertyData: PropertyData;
  propertyId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
  onNavigate: (view: string) => void;
}

const OfferLetterView = ({ propertyData, propertyId, onBack, onEdit, onNavigate }: OfferLetterViewProps) => {
  const { toast } = useToast();
  const [emailClient, setEmailClient] = useState<EmailClient>(getEmailClientPreference);
  const [agentFirstName, setAgentFirstName] = useState<string>("");

  // Extract first name from seller
  const ownerFirstName = propertyData.name.split(' ')[0];

  const defaultLetterText = useMemo(() => {
    return `Hey ${ownerFirstName},

We have received an offer for your property. I have attached a summary of the offer to make it easier to understand the important terms, an estimated net sheet showing all of the numbers and the bottom line for you after everything is paid and a copy of the offer itself.

We can respond in 1 of 3 ways, (1) you can say I'll take it. . . (2) You can decline to respond altogether or (3) you can send over a counter offer with terms acceptable to you. It is my experience the buyer's first offer is not their best offer, sometimes they'll go fishing just to see what you are or are not willing to take. I would say put together a reasonable counter offer and let's see what we can do with this.

Also be sure to check the items listed in Paragraph 5 to make sure you are OK with leaving those items. Otherwise I think everything else looks good to me.

The buyer was asking for a response of some kind before ${propertyData.respondToOfferBy || '[Date not specified]'}.

Take a look and let me know your thoughts.

Thanks
${agentFirstName}`;
  }, [ownerFirstName, propertyData.respondToOfferBy, agentFirstName]);

  const [letterText, setLetterText] = useState<string>("");
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    const fetchAgentProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name')
          .eq('id', user.id)
          .single();
        if (profile?.first_name) {
          setAgentFirstName(profile.first_name);
        }
      }
    };
    fetchAgentProfile();
  }, []);

  const EMAIL_LOGO_WIDTH_PX = 144;

  const resizeImageForEmail = async (imageUrl: string, targetWidth: number): Promise<string> => {
    return await new Promise((resolve, reject) => {
      const img = new Image();

      // Set crossOrigin BEFORE src to avoid "tainted" canvas errors
      if (!imageUrl.startsWith('data:') && !imageUrl.startsWith('blob:')) {
        img.crossOrigin = 'anonymous';
      }

      img.onload = () => {
        const canvas = document.createElement('canvas');

        const naturalWidth = img.naturalWidth || img.width;
        const naturalHeight = img.naturalHeight || img.height;
        if (!naturalWidth || !naturalHeight) {
          reject(new Error('Invalid logo dimensions'));
          return;
        }

        const scale = targetWidth / naturalWidth;
        const targetHeight = Math.max(1, Math.round(naturalHeight * scale));

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        // PNG keeps text/logo edges crisp
        resolve(canvas.toDataURL('image/png'));
      };

      img.onerror = () => reject(new Error('Failed to load logo'));
      img.src = imageUrl;
    });
  };

  const handleEmailClientChange = (value: string) => {
    const client = value as EmailClient;
    setEmailClient(client);
    setEmailClientPreference(client);
  };

  // Initialize letter text after agent name loads
  useEffect(() => {
    if (!hasInitialized && agentFirstName) {
      setLetterText(defaultLetterText);
      setHasInitialized(true);
    }
  }, [agentFirstName, defaultLetterText, hasInitialized]);

  // Also initialize if no agent name after a delay
  useEffect(() => {
    if (!hasInitialized) {
      const timer = setTimeout(() => {
        if (!hasInitialized) {
          setLetterText(defaultLetterText);
          setHasInitialized(true);
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [hasInitialized, defaultLetterText]);


  const handleCopyToClipboard = async () => {
    const content = document.getElementById('offer-letter-content');
    if (!content) return;

    try {
      // Clone the content
      const clonedContent = content.cloneNode(true) as HTMLElement;
      
      // Find the logo image and convert to a physically resized base64 image
      const logoImg = clonedContent.querySelector('img') as HTMLImageElement;
      if (logoImg) {
        const resizedDataUrl = await resizeImageForEmail(logoImg.src, EMAIL_LOGO_WIDTH_PX);
        logoImg.src = resizedDataUrl;
        logoImg.removeAttribute('class');
        logoImg.setAttribute('width', String(EMAIL_LOGO_WIDTH_PX));
        logoImg.style.cssText = [
          `width:${EMAIL_LOGO_WIDTH_PX}px !important`,
          `max-width:${EMAIL_LOGO_WIDTH_PX}px !important`,
          `height:auto !important`,
          `display:block`,
          `margin:0`,
        ].join(';');
      }
      
      // Remove print:hidden elements
      const noPdfElements = clonedContent.querySelectorAll('.print\\:hidden');
      noPdfElements.forEach(el => el.remove());
      
      // Add inline styles for email compatibility
      const logoContainer = clonedContent.querySelector('.flex.items-center.gap-3');
      if (logoContainer) {
        (logoContainer as HTMLElement).style.cssText = 'display: flex; align-items: center; gap: 12px;';
        
        const logoInContainer = logoContainer.querySelector('img');
        if (logoInContainer) {
          // IMPORTANT: must include width constraints here too (cssText overwrites previous styles)
          (logoInContainer as HTMLElement).style.cssText = [
            `display:block`,
            `margin:0`,
            `flex-shrink:0`,
            `width:${EMAIL_LOGO_WIDTH_PX}px !important`,
            `max-width:${EMAIL_LOGO_WIDTH_PX}px !important`,
            `height:auto !important`,
          ].join(';');
        }
        
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

      // Style the card content
      const card = clonedContent.querySelector('.bg-card, [class*="Card"]');
      if (card) {
        (card as HTMLElement).style.cssText = 'padding: 32px; background: white; border: 1px solid #e5e7eb; border-radius: 8px;';
      }
      
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
        description: "The letter with formatted header has been copied. Opening email client...",
      });

      // Open email client using selected preference
      const sellerEmail = propertyData.sellerEmail || '';
      const subject = `We have received an offer for ${propertyData.streetAddress}`;
      openEmailClient(sellerEmail, emailClient, subject);
    } catch (err) {
      console.error('Copy error:', err);
      toast({
        title: "Error",
        description: "Failed to copy content. Please try again.",
        variant: "destructive",
      });
    }
  };

  const navigationItems = [
    {
      label: "Back",
      icon: ArrowLeft,
      onClick: onBack,
    },
    {
      label: "Back to Property Info",
      icon: ArrowLeft,
      onClick: () => onEdit(propertyId),
    },
    {
      label: "My Properties",
      icon: List,
      onClick: onBack,
    },
    {
      label: "Estimated Net",
      icon: DollarSign,
      onClick: () => onNavigate('results'),
    },
    {
      label: "Offer Summary",
      icon: ClipboardList,
      onClick: () => onNavigate('offer-summary'),
    },
    {
      label: "Offer Letter",
      icon: Mail,
      onClick: () => {},
      active: true,
    },
    {
      label: "Important Dates Letter",
      icon: Calendar,
      onClick: () => onNavigate('important-dates'),
    },
    {
      label: "Title Letter",
      icon: Mail,
      onClick: () => onNavigate('title-letter'),
    },
    {
      label: "Agent Letter",
      icon: Mail,
      onClick: () => onNavigate('agent-letter'),
    },
    {
      label: "Request to Remedy",
      icon: FileText,
      onClick: () => onNavigate('request-to-remedy'),
    },
    {
      label: "Settlement Statement",
      icon: FileText,
      onClick: () => onNavigate('settlement-statement'),
    },
  ];

  return (
    <div className="flex w-full min-h-[600px]">
      {/* Left Sidebar Navigation */}
      <aside className="w-56 p-3 border-r bg-card shrink-0 print:hidden">
        {/* Email Client Selector */}
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
              className={`w-full justify-start text-left h-auto py-2 px-3 ${item.active ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' : ''}`}
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
      <div className="flex-1 py-4 px-6 overflow-auto">
        {/* Action Button - Top Right */}
        <div className="flex justify-end mb-4 print:hidden">
          <Button onClick={handleCopyToClipboard} className="copy-email-btn gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
            <Copy className="h-4 w-4" />
            Copy & Email
          </Button>
        </div>
        
        <div className="max-w-4xl">
          <div className="pdf-content p-6" id="offer-letter-content">
            <style dangerouslySetInnerHTML={{ __html: `
              @media print, (min-width: 0px) {
                .pdf-content {
                  font-size: 15px !important;
                  padding: 24px 28px 64px 28px !important;
                }
                .pdf-content h1 {
                  font-size: 31px !important;
                  margin-bottom: 6px !important;
                }
                .pdf-content img {
                  height: 52px !important;
                }
              }
            ` }} />
            <div className="flex items-center gap-3 mb-8 header-section">
              <img src={logo} alt="Sell for 1 Percent" className="h-16 w-auto" />
              <div>
                <h1 className="text-3xl font-bold text-foreground">Offer Letter</h1>
                <p className="text-muted-foreground">Notification of offer received</p>
              </div>
            </div>

            <Card className="p-8 mb-6 card-content">
              <textarea
                className="w-full text-foreground bg-background border border-border rounded-md p-4 text-base leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-ring font-sans"
                rows={22}
                value={letterText}
                onChange={(e) => setLetterText(e.target.value)}
              />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OfferLetterView;
