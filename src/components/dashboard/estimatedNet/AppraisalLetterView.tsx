import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PropertyData } from "@/types/estimatedNet";
import { ArrowLeft, List, Mail, Calendar, FileText, Copy, DollarSign, ClipboardList, Settings, Home, Bell } from "lucide-react";
import { EmailClient, EMAIL_CLIENT_OPTIONS, getEmailClientPreference, setEmailClientPreference, getEmailLink } from "@/utils/emailClientUtils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.jpg";
import { format } from "date-fns";

interface AppraisalLetterViewProps {
  propertyData: PropertyData;
  propertyId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
  onNavigate: (view: string) => void;
}

const AppraisalLetterView = ({ propertyData, propertyId, onBack, onEdit, onNavigate }: AppraisalLetterViewProps) => {
  const { toast } = useToast();
  const [emailClient, setEmailClientState] = useState<EmailClient>(getEmailClientPreference);
  const [agentEmail, setAgentEmail] = useState("");
  const [agentFirstName, setAgentFirstName] = useState("");
  const [agentFullName, setAgentFullName] = useState("");
  const [agentPhone, setAgentPhone] = useState("");

  useEffect(() => {
    const fetchAgentProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('preferred_email, email, first_name, last_name, cell_phone')
          .eq('id', user.id)
          .single();
        if (profile) {
          setAgentEmail(profile.preferred_email || profile.email || "");
          setAgentFirstName(profile.first_name || "");
          setAgentFullName(`${profile.first_name || ""} ${profile.last_name || ""}`.trim());
          setAgentPhone(profile.cell_phone || "");
        }
      }
    };
    fetchAgentProfile();
  }, []);

  const handleEmailClientChange = (value: string) => {
    const client = value as EmailClient;
    setEmailClientState(client);
    setEmailClientPreference(client);
  };

  const handleCopyToClipboard = async (contentId: string, subject: string, recipients: string) => {
    const content = document.getElementById(contentId);
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

      const headerSection = clonedContent.querySelector('.flex.items-center.justify-between.mb-8');
      if (headerSection) {
        (headerSection as HTMLElement).style.cssText = 'display: flex; align-items: center; margin-bottom: 32px;';
      }

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

      const card = clonedContent.querySelector('.bg-card, [class*="Card"]');
      if (card) {
        (card as HTMLElement).style.cssText = 'padding: 32px; background: white; border: 1px solid #e5e7eb; border-radius: 8px;';
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

  // Seller first name(s)
  const sellerFirstNames = propertyData.name
    ? propertyData.name.split(/\s*(?:&|and)\s*/i).map(n => n.trim().split(' ')[0]).join(' & ')
    : "there";

  // Buyer agent first name
  const buyerAgentFirstName = propertyData.agentName
    ? propertyData.agentName.trim().split(' ')[0]
    : "";

  // Lending officer first name
  const lendingOfficerFirstName = propertyData.lendingOfficer
    ? propertyData.lendingOfficer.trim().split(' ')[0]
    : "";

  // Greeting for lender letter
  const lenderGreeting = [buyerAgentFirstName, lendingOfficerFirstName].filter(Boolean).join(' & ') || "there";

  // Buyer names
  const buyerNames = [propertyData.buyerName1, propertyData.buyerName2].filter(Boolean).join(' & ') || "the Buyers";

  // Full address
  const fullAddress = [propertyData.streetAddress, propertyData.city, propertyData.state, propertyData.zip].filter(Boolean).join(', ');

  // Closing date formatted
  const closingDateFormatted = propertyData.closingDate
    ? (() => { try { return format(new Date(propertyData.closingDate), 'MMMM d, yyyy'); } catch { return propertyData.closingDate; } })()
    : "TBD";

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
    { label: "Appraisal", icon: FileText, onClick: () => {}, active: true },
  ];

  return (
    <div className="flex w-full min-h-[600px]">
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

      <div className="flex-1 py-8 px-4">
        {/* Letter to Homeowners */}
        <div className="max-w-4xl mx-auto" id="appraisal-letter-homeowners">
          <div className="flex items-center justify-between mb-8 print:mb-4">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Sell for 1 Percent" className="h-16 w-auto print:h-12" />
              <div>
                <h1 className="text-3xl font-bold text-foreground">Appraisal Scheduled</h1>
                <p className="text-muted-foreground">Notice to {propertyData.name || "Client"}</p>
              </div>
            </div>
            <div className="flex gap-2 print:hidden no-pdf">
              <Button
                onClick={() => handleCopyToClipboard(
                  'appraisal-letter-homeowners',
                  `Appraisal Scheduled - ${propertyData.streetAddress}`,
                  propertyData.sellerEmail || ""
                )}
                size="lg"
                className="bg-rose-500 hover:bg-rose-600 text-white"
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy & Email
              </Button>
            </div>
          </div>

          <Card className="p-8 mb-6 print:shadow-none">
            <div className="prose prose-lg max-w-none text-foreground">
              <p className="mb-4">Hey {sellerFirstNames},</p>

              <p className="mb-4">
                The appraisal has been scheduled for your home. Nothing for you to do, the appraiser will only be at the house for about 20 minutes, they'll do a walk through, take some pictures and then the real work for the appraiser begins.
              </p>

              <p className="mb-4">
                Typically it takes an appraiser 2 to 3 business days to finalize their report and the only time we hear from the appraiser is if there is a problem with the valuation. Don't worry, I don't think we will have a problem with your property.
              </p>

              <p className="mb-4">
                If you are still living in the property, you do not need to leave like you would for a showing or a home inspection. I would only caution not to get to chatty with the appraiser about all of the things you have done to the house, what you think adds $1000's of value to home may actually be looked as a negative. Only answer questions the appraiser ask is the best way to handle it while still being friendly.
              </p>

              <p className="mb-4">Let me know if you have any questions.</p>

              <p className="mb-4">Thanks</p>
              <p className="mb-4">{agentFirstName}</p>
              <p className="mb-0">The best compliment I can receive is a referral from you!</p>
              <p className="mb-0">{agentFullName}</p>
              <p className="mb-0">cell: {agentPhone}</p>
              <p className="mb-4">email: {agentEmail}</p>
            </div>
          </Card>
        </div>

        {/* Letter to Lender */}
        <div className="max-w-4xl mx-auto mt-10" id="appraisal-letter-lender">
          <div className="flex items-center justify-between mb-8 print:mb-4">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Sell for 1 Percent" className="h-16 w-auto print:h-12" />
              <div>
                <h1 className="text-3xl font-bold text-foreground">Appraisal Ordered</h1>
                <p className="text-muted-foreground">Notice to Buyer's Agent & Lender</p>
              </div>
            </div>
            <div className="flex gap-2 print:hidden no-pdf">
              <Button
                onClick={() => {
                  const recipients = [propertyData.agentEmail, propertyData.lendingOfficerEmail].filter(Boolean).join(',');
                  handleCopyToClipboard(
                    'appraisal-letter-lender',
                    `Appraisal Ordered for ${propertyData.streetAddress}`,
                    recipients
                  );
                }}
                size="lg"
                className="bg-rose-500 hover:bg-rose-600 text-white"
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy & Email
              </Button>
            </div>
          </div>

          <Card className="p-8 mb-6 print:shadow-none">
            <div className="prose prose-lg max-w-none text-foreground">
              <p className="mb-4">Hi {lenderGreeting},</p>

              <p className="mb-4">
                In regard to {buyerNames} and the property located at {fullAddress} that we have in contract, I noticed the appraisal has not yet been ordered. We are about 2 weeks out from the scheduled closing on {closingDateFormatted} and wanted to be sure we are still on track to get things closed on time?
              </p>

              <p className="mb-4">Let me know if you would.</p>

              <p className="mb-4">Thanks</p>
              <p className="mb-4">{agentFirstName}</p>
              <p className="mb-0">The best compliment I can receive is a referral from you!</p>
              <p className="mb-0">{agentFullName}</p>
              <p className="mb-0">cell: {agentPhone}</p>
              <p className="mb-4">email: {agentEmail}</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AppraisalLetterView;
