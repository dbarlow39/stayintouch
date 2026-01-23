import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PropertyData } from "@/types/estimatedNet";
import { ArrowLeft, List, Mail, Calendar, FileText, Copy, DollarSign, ClipboardList, Settings } from "lucide-react";
import { EmailClient, EMAIL_CLIENT_OPTIONS, getEmailClientPreference, setEmailClientPreference, openEmailClient } from "@/utils/emailClientUtils";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.jpg";
import { addDays, format } from "date-fns";

interface RequestToRemedyViewProps {
  propertyData: PropertyData;
  propertyId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
  onNavigate: (view: string) => void;
}

const RequestToRemedyView = ({ propertyData, propertyId, onBack, onEdit, onNavigate }: RequestToRemedyViewProps) => {
  const { toast } = useToast();
  const [emailClient, setEmailClient] = useState<EmailClient>(getEmailClientPreference);

  const EMAIL_LOGO_WIDTH_PX = 144;

  const resizeImageForEmail = async (imageUrl: string, targetWidth: number): Promise<string> => {
    return await new Promise((resolve, reject) => {
      const img = new Image();

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

  // Extract first name
  const ownerFirstName = propertyData.name.split(' ')[0];

  // Calculate remedy dates
  const inContractDate = propertyData.inContract ? new Date(propertyData.inContract) : new Date();
  const inspectionDeadline = addDays(inContractDate, propertyData.inspectionDays || 0);
  const remedyDeadline = addDays(inContractDate, (propertyData.inspectionDays || 0) + (propertyData.remedyPeriodDays || 0));

  const handleCopyToClipboard = async () => {
    const content = document.getElementById('request-to-remedy-content');
    if (!content) return;

    try {
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

      // Style the prose content
      const proseContainer = clonedContent.querySelector('.prose');
      if (proseContainer) {
        const paragraphs = proseContainer.querySelectorAll('p');
        paragraphs.forEach(p => {
          (p as HTMLElement).style.cssText = 'margin-bottom: 16px; line-height: 1.6;';
        });
        
        const unorderedLists = proseContainer.querySelectorAll('ul');
        unorderedLists.forEach(ul => {
          (ul as HTMLElement).style.cssText = 'margin: 16px 0 24px 0; padding-left: 24px;';
        });

        const orderedLists = proseContainer.querySelectorAll('ol');
        orderedLists.forEach(ol => {
          (ol as HTMLElement).style.cssText = 'margin: 16px 0 24px 0; padding-left: 24px;';
        });
        
        const listItems = proseContainer.querySelectorAll('li');
        listItems.forEach(li => {
          (li as HTMLElement).style.cssText = 'margin: 4px 0;';
        });
      }

      // Single-space the agent contact information
      const agentInfoContainer = clonedContent.querySelector('.agent-info');
      if (agentInfoContainer) {
        const agentParagraphs = agentInfoContainer.querySelectorAll('p');
        agentParagraphs.forEach(p => {
          (p as HTMLElement).style.cssText = 'margin: 0; line-height: 1.3;';
        });
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
        description: "The request to remedy has been copied. Opening email client...",
      });

      // Open email client using selected preference
      const sellerEmail = propertyData.sellerEmail || '';
      const subject = `Request to Remedy for ${propertyData.streetAddress}`;
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
      onClick: () => onNavigate('offer-letter'),
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
      onClick: () => {},
      active: true,
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
          <Button onClick={handleCopyToClipboard} className="gap-2 bg-rose-500 hover:bg-rose-600 text-white">
            <Copy className="h-4 w-4" />
            Copy & Email
          </Button>
        </div>
        
        <div className="max-w-4xl">
          <div className="pdf-content p-6" id="request-to-remedy-content">
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
                <h1 className="text-3xl font-bold text-foreground">Request to Remedy</h1>
                <p className="text-muted-foreground">Buyer's inspection concerns</p>
              </div>
            </div>

            <Card className="p-8 mb-6 card-content">
              <div className="prose prose-lg max-w-none text-foreground space-y-4">
                <p>Hi {ownerFirstName},</p>
                
                <p>
                  The buyer did their home inspection and have several concerns they would like to have addressed. Please review the attached Buyers Request to Remedy asking for certain items to be addressed. The only things the buyers are interested in being fixed are those items in their Request to Remedy. I have attached the home inspection report for reference of these items. Don't get caught up reading the whole report as the buyer is only interested in fixing items on the Remedy Request.
                </p>

                <p><strong>Dates we need to keep in mind:</strong></p>
                <ul className="list-disc space-y-2 mb-6">
                  <li>
                    Buyers request to remedy to be submitted no later than:{" "}
                    <strong>{format(inspectionDeadline, "MMMM d, yyyy")}</strong>
                  </li>
                  <li>
                    Sellers Remedy Response and Agreement with Buyer no later than:{" "}
                    <strong>{format(remedyDeadline, "MMMM d, yyyy")}</strong>
                  </li>
                </ul>

                <p>You have 4 ways to resolve their request to remedy:</p>

                <ol className="list-decimal space-y-2 mb-6">
                  <li>You can say yes you agree to make the repairs requested.</li>
                  <li>You can say no you do not agree and will not make any repairs.</li>
                  <li>You can say you'll make some repairs and not others.</li>
                  <li>You can offer a credit towards the sales price or closing cost and allow the buyer to take care of the requested items after closing.</li>
                </ol>

                <p>
                  I have always found the best way to handle the buyers request to remedy is choice (4) which is to offer the buyer a cash offer and let them deal with the items after closing. This way you don't have to worry about hiring vendors and can concentrate on moving.
                </p>

                <p>
                  Take a look and let me know your thoughts and questions and we can prepare a response.
                </p>

                <div className="mt-8">
                  <p className="mb-0">Thanks,</p>
                  <div className="text-foreground mt-4 agent-info">
                    <p className="font-semibold">{propertyData.listingAgentName}</p>
                    <p>{propertyData.listingAgentPhone}</p>
                    <p>{propertyData.listingAgentEmail}</p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RequestToRemedyView;
