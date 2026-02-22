import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PropertyData } from "@/types/estimatedNet";
import { ArrowLeft, List, Mail, Calendar, FileText, Copy, DollarSign, ClipboardList, Settings } from "lucide-react";
import { EmailClient, EMAIL_CLIENT_OPTIONS, getEmailClientPreference, setEmailClientPreference, openEmailClient } from "@/utils/emailClientUtils";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.jpg";

interface SettlementStatementViewProps {
  propertyData: PropertyData;
  propertyId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
  onNavigate: (view: string) => void;
}

const SettlementStatementView = ({ propertyData, propertyId, onBack, onEdit, onNavigate }: SettlementStatementViewProps) => {
  const { toast } = useToast();
  const [emailClient, setEmailClient] = useState<EmailClient>(getEmailClientPreference);

  const EMAIL_LOGO_WIDTH_PX = 175;

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

  const ownerFirstName = propertyData.name.split(' ')[0];

  const handleCopyToClipboard = async () => {
    const content = document.getElementById('settlement-statement-content');
    if (!content) return;

    try {
      const clonedContent = content.cloneNode(true) as HTMLElement;
      
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
      
      const noPdfElements = clonedContent.querySelectorAll('.print\\:hidden');
      noPdfElements.forEach(el => el.remove());
      
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

      const card = clonedContent.querySelector('.bg-card, [class*="Card"]');
      if (card) {
        (card as HTMLElement).style.cssText = 'padding: 32px; background: white; border: 1px solid #e5e7eb; border-radius: 8px;';
      }

      // Add inline color styles to icons for email compatibility
      const icons = clonedContent.querySelectorAll('svg.lucide');
      icons.forEach(icon => {
        (icon as HTMLElement).style.color = '#0EA5E9';
      });

      // Single-space the agent contact information
      const agentInfo = clonedContent.querySelectorAll('.text-foreground p');
      agentInfo.forEach(p => {
        (p as HTMLElement).style.cssText = 'margin: 0; line-height: 1.3;';
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
        description: "The settlement statement has been copied. Opening email client...",
      });

      const sellerEmail = propertyData.sellerEmail || '';
      const subject = `Settlement Statement for ${propertyData.streetAddress}`;
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
      onClick: () => onNavigate('request-to-remedy'),
    },
    {
      label: "Settlement Statement",
      icon: FileText,
      onClick: () => {},
      active: true,
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
          <Button onClick={handleCopyToClipboard} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
            <Copy className="h-4 w-4" />
            Copy & Email
          </Button>
        </div>
        
        <div className="max-w-4xl" id="settlement-statement-content">
          <div className="flex items-center gap-3 mb-8">
            <img src={logo} alt="Sell for 1 Percent" className="h-16 w-auto" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">Settlement Statement</h1>
              <p className="text-muted-foreground">All the numbers for your closing</p>
            </div>
          </div>

          <Card className="p-8 mb-6">
            <div className="prose prose-lg max-w-none text-foreground mb-6">
              <p className="mb-4">Hi {ownerFirstName},</p>
              
              <p className="mb-4">
                Please find attached the settlement statement for your closing. I have gone over the numbers and everything appears to be in order but please take a look and let me know if you have any questions.
              </p>
            </div>

            <h2 className="text-2xl font-semibold mb-6 text-foreground">FAQ's about your settlement statement:</h2>
            
            <div className="space-y-6">
            <div>
                <h3 className="text-xl font-semibold mb-3 text-foreground flex items-center gap-2">
                  <span className="text-lg">🧮&nbsp;</span>
                  Tax Proration:
                </h3>
                <p className="text-foreground leading-relaxed">
                  The number 1 question we always get about the settlement statement is about the property taxes. In central Ohio property taxes are collected 6 months behind so the taxes that were most recently paid were actually for last year which means you are always at least 6 months behind which is always confusing as just about everyone thinks they are current on their taxes and in theory you are current for what is due but when you sell your home you are required to bring your taxes up to date as of the day of closing and that normally means catching up on that 6 month lag.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-3 text-foreground flex items-center gap-2">
                  <span className="text-lg">🛡️&nbsp;</span>
                  Closing Protection Coverage:
                </h3>
                <p className="text-foreground leading-relaxed">
                  This is the other question we get most, what is the Closing Protection Coverage and do I need to pay the $55.00? Closing protection was developed for both Home Sellers, Home Buyers and their Lenders by the state of Ohio back in 2007. In the early 2000's there were a couple of title companies in central Ohio who instead of sending in the payoff's for the home sellers the title companies simply kept and tried to run off with the money. As a result the state set up this special fund so if you are concerned with the title company running off with your money you can pay $55 for this coverage. If you are comfortable with the title company then you have the option not to pay the $55. Either way we would recommend you check with your lender 5 business days after closing just to be sure your loan has been paid off.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-3 text-foreground flex items-center gap-2">
                  <span className="text-lg">💰&nbsp;</span>
                  Escrow Funds:
                </h3>
                <p className="text-foreground leading-relaxed">
                  If you escrow your property taxes as part of your house payment there will be a fund of money that your bank will send back to you after they receive the payoff for your mortgage that the Title company will send them. Once received your mortgage company will have 30 days to send you the escrow funds. The Title company will have a form for you to fill out your forwarding address for the mortgage company to send you the money.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-3 text-foreground flex items-center gap-2">
                  <span className="text-lg">📅&nbsp;</span>
                  Scheduling Your Closing:
                </h3>
                <p className="text-foreground leading-relaxed">
                  Due to Covid we went from "Round Table" closing where both buyer and seller met up to sign the paperwork together to individual closings where each side signs their paperwork separately. As the seller you can sign your side of the paperwork any day prior to the closing date so pick a day and time that is convenient for you and we'll get it scheduled. Don't worry nothing will be transferred and the possession date will not change just because you sign early, everything is dependent on the buyers signing and their money showing up. Once the buyer signs and the money shows up the transfer will begin. Let me know a good time for you to sign your side of the paperwork. Oh, and be sure to bring your photo ID.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-3 text-foreground flex items-center gap-2">
                  <span className="text-lg">💵&nbsp;</span>
                  Your Money:
                </h3>
                <p className="text-foreground leading-relaxed">
                  Once you sign and the buyer signs their paperwork your money will be released. You can receive your funds in a couple of different ways. You pick up a check at the title company, have the check over nighted to you or have the money wired directly to your bank account. The Title company will have a form for you to fill out at the time you sign your paperwork letting them know how you would like your money dispersed. Due to fraud they will not take any information over the phone or through email.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-3 text-foreground flex items-center gap-2">
                  <span className="text-lg">📤&nbsp;</span>
                  Wiring Your Funds:
                </h3>
                <p className="text-foreground leading-relaxed">
                  Please check with your bank as to their policies on holding your money until the funds clear. Due to fraud most banks if not all will put a hold on your funds if you deposit a large check, some for as long as 14 days which makes it hard if you are using the money to buy another home. You'll want to have your funds wired to your account which 99.9% of the time will give you access to 100% of your funds as soon as the money is deposited into your account. The only negative is your bank will most likely charge you a fee to receive the funds normally around $20. If you do decide to wire please make contact with your bank to make sure you have the correct wiring instructions, most of the time you can use the information on your bank check but there are a couple of banks including Chase, 5/3rd and some Credit Unions whose wiring instructions are different than the info on your check so please be sure.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-3 text-foreground flex items-center gap-2">
                  <span className="text-lg">🔑&nbsp;</span>
                  Transfer of Keys:
                </h3>
                <p className="text-foreground leading-relaxed">
                  If you have left your keys in the house then you are done. If you have your keys with you then you have the option of dropping them off at the Title Company or we can leave them in the lockbox that is on the house, our preference is you drop them off at the title company so we're not hunting for the keys as we wait for them to show up. Once the buyer has signed and the money has been received you will be notified and you can remove yourself from the property.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-3 text-foreground flex items-center gap-2">
                  <span className="text-lg">🚚&nbsp;</span>
                  Move Out Day & Time:
                </h3>
                <p className="text-foreground leading-relaxed">
                  You are not required to be out of the home prior to the closing date. The buyer signs the paperwork and the money is wired from the bank. Once the money has been received at the title company the papers will be taken to the recorder's office to be recorded which normally takes about 3 to 4 hours. Once recorded the house is officially transferred to the buyer and the money can be released to you. Normally the buyers will move in the afternoon after recording which means you have until around noon to be out on closing day. That being said we have done closings that have been delayed and have gone as late as 6pm and we have also seen the buyer not move in for a week which means if you can get out the day before closing that would be ideal just to make sure you have plenty of time.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-3 text-foreground flex items-center gap-2">
                  <span className="text-lg">✅&nbsp;</span>
                  Final Walk Through:
                </h3>
                <p className="text-foreground leading-relaxed">
                  The buyer will do a final walk through normally the morning of closing prior to signing their paperwork. The buyer is not looking to make sure everything is perfect they are looking to make sure the home is left in substantially the same condition as when they signed the contract less normal wear and tear and that the items that were to remain with the home are still there. If you have any questions please don't hesitate to reach out.
                </p>
              </div>

              <div className="mt-8">
                <p className="text-foreground leading-relaxed mb-4">
                  There is a lot of information here but if you have any questions please let me know.
                </p>
                <div className="text-foreground">
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
  );
};

export default SettlementStatementView;
