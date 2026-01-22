import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PropertyData } from "@/types/estimatedNet";
import { ArrowLeft, List, Mail, Calendar, FileText, Copy, DollarSign, ClipboardList, Settings } from "lucide-react";
import { EmailClient, EMAIL_CLIENT_OPTIONS, getEmailClientPreference, setEmailClientPreference, openEmailClient } from "@/utils/emailClientUtils";
import { useToast } from "@/hooks/use-toast";
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

  const handleEmailClientChange = (value: string) => {
    const client = value as EmailClient;
    setEmailClient(client);
    setEmailClientPreference(client);
  };

  // Extract first names
  const ownerFirstName = propertyData.name.split(' ')[0];
  const listingAgentFirstName = propertyData.listingAgentName?.split(' ')[0] || '';


  const handleCopyToClipboard = async () => {
    const content = document.getElementById('offer-letter-content');
    if (!content) return;

    try {
      // Clone the content
      const clonedContent = content.cloneNode(true) as HTMLElement;
      
      // Find the logo image and convert to base64
      const logoImg = clonedContent.querySelector('img') as HTMLImageElement;
      if (logoImg) {
        // Create a canvas to convert the image to base64
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        await new Promise((resolve, reject) => {
          img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx?.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg');
            logoImg.src = dataUrl;
            logoImg.style.width = '100px';
            logoImg.style.height = 'auto';
            logoImg.setAttribute('width', '100');
            resolve(true);
          };
          img.onerror = reject;
          img.src = logoImg.src;
        });
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
          (logoInContainer as HTMLElement).style.cssText = 'display: block; margin: 0; flex-shrink: 0;';
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
      onClick: () => {},
      disabled: true,
    },
    {
      label: "Title Letter",
      icon: Mail,
      onClick: () => {},
      disabled: true,
    },
    {
      label: "Agent Letter",
      icon: Mail,
      onClick: () => {},
      disabled: true,
    },
    {
      label: "Request to Remedy",
      icon: FileText,
      onClick: () => {},
      disabled: true,
    },
    {
      label: "Settlement Statement",
      icon: Mail,
      onClick: () => {},
      disabled: true,
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
              className={`w-full justify-start text-left h-auto py-2 px-3 ${
                item.disabled ? 'opacity-50 cursor-not-allowed' : ''
              } ${item.active ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' : ''}`}
              onClick={item.disabled ? undefined : item.onClick}
              disabled={item.disabled}
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
          <Button onClick={handleCopyToClipboard} variant="outline" className="gap-2">
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
              <div className="prose prose-lg max-w-none text-foreground space-y-4">
                <p>Hey {ownerFirstName},</p>
                
                <p>
                  We have received an offer for your property. I have attached a summary of the offer to make it easier to understand the important terms, an estimated net sheet showing all of the numbers and the bottom line for you after everything is paid and a copy of the offer itself.
                </p>
                
                <p>
                  We can respond in 1 of 3 ways, (1) you can say I'll take it. . . (2) You can decline to respond altogether or (3) you can send over a counter offer with terms acceptable to you. It is my experience the buyer's first offer is not their best offer, sometimes they'll go fishing just to see what you are or are not willing to take. I would say put together a reasonable counter offer and let's see what we can do with this.
                </p>
                
                <p>
                  Also be sure to check the items listed in Paragraph 5 to make sure you are OK with leaving those items. Otherwise I think everything else looks good to me.
                </p>
                
                <p>
                  The buyer was asking for a response of some kind before {propertyData.respondToOfferBy || '[Date not specified]'}.
                </p>
                
                <p>Take a look and let me know your thoughts.</p>
                
                <p className="mb-0">Thanks</p>
                <p className="mb-0"><strong>{listingAgentFirstName}</strong></p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OfferLetterView;
