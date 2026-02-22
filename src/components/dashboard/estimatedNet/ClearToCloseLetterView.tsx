import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PropertyData } from "@/types/estimatedNet";
import { ArrowLeft, List, Mail, Calendar, FileText, Copy, DollarSign, ClipboardList, Settings, Home, Bell, Edit } from "lucide-react";
import { EmailClient, EMAIL_CLIENT_OPTIONS, getEmailClientPreference, setEmailClientPreference, getEmailLink } from "@/utils/emailClientUtils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.jpg";

interface ClearToCloseLetterViewProps {
  propertyData: PropertyData;
  propertyId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
  onNavigate: (view: string) => void;
}

const ClearToCloseLetterView = ({ propertyData, propertyId, onBack, onEdit, onNavigate }: ClearToCloseLetterViewProps) => {
  const { toast } = useToast();
  const [emailClient, setEmailClientState] = useState<EmailClient>(getEmailClientPreference);
  const [agentEmail, setAgentEmail] = useState("");
  const [agentFirstName, setAgentFirstName] = useState("");
  const [agentFullName, setAgentFullName] = useState("");
  const [agentPhone, setAgentPhone] = useState("");
  const [agentBio, setAgentBio] = useState("");

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

  const handleEmailClientChange = (value: string) => {
    const client = value as EmailClient;
    setEmailClientState(client);
    setEmailClientPreference(client);
  };

  const handleCopyToClipboard = async () => {
    const content = document.getElementById('clear-to-close-letter-content');
    if (!content) return;

    try {
      const clonedContent = content.cloneNode(true) as HTMLElement;

      // Convert logo to base64 at reduced size
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

      // Remove print:hidden and no-pdf elements
      const noPdfElements = clonedContent.querySelectorAll('.no-pdf, .print\\:hidden');
      noPdfElements.forEach(el => el.remove());

      // Add inline styles for email compatibility
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

      // Style the card content
      const card = clonedContent.querySelector('.bg-card, [class*="Card"]');
      if (card) {
        (card as HTMLElement).style.cssText = 'padding: 32px; background: white; border: 1px solid #e5e7eb; border-radius: 8px;';
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

      const clientName = propertyData.name || "Client";
      const subject = `Clear to Close - ${propertyData.streetAddress}`;
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
    { label: "Clear to Close", icon: FileText, onClick: () => {}, active: true },
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
      <div className="flex-1 py-8 px-4">
        <div className="max-w-4xl mx-auto" id="clear-to-close-letter-content">
          <div className="flex items-center justify-between mb-8 print:mb-4">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Sell for 1 Percent" className="h-16 w-auto print:h-12" />
              <div>
                <h1 className="text-3xl font-bold text-foreground">Clear to Close</h1>
                <p className="text-muted-foreground">Notification for {propertyData.name || "client"}</p>
              </div>
            </div>
            <div className="flex gap-2 print:hidden no-pdf">
              <Button onClick={handleCopyToClipboard} size="lg" className="bg-rose-500 hover:bg-rose-600 text-white">
                <Copy className="mr-2 h-4 w-4" />
                Copy & Email
              </Button>
            </div>
          </div>

          <Card className="p-8 mb-6 print:shadow-none">
            <div className="prose prose-lg max-w-none text-foreground">
              <p className="mb-4">Hey {propertyData.name?.split(' ')[0] || "there"},</p>

              <p className="mb-4">
                Just a quick note that the buyer's lender has issued a "Clear to Close" notice. What that means is the buyer's loan has been fully reviewed by underwriting and all we are doing at this point is waiting to close.
              </p>

              <h2 className="text-xl font-bold mt-6 mb-3">📋 Next Step:</h2>
              <p className="mb-4">
                The next step will be getting a copy of the Settlement Statement for review, normally the day before closing and scheduling you to sign your side of the paperwork.
              </p>

              <h2 className="text-xl font-bold mt-6 mb-3">📅 Scheduling Your Closing:</h2>

              <p className="mb-4">
                Due to Covid we went from "Round Table" closing where both buyer and seller met up to sign the paperwork together to individual closings where each side signs their paperwork separately. As the seller you can sign your side of the paperwork any day prior to the closing date so pick a day and time that is convenient for you and we'll get it scheduled. Don't worry nothing will be transferred and the possession date will not change just because you sign early, everything is dependent on the buyers signing and their money showing up. Once the buyer signs and the money shows up the transfer will begin. Let me know a good time for you to sign your side of the paperwork. Oh, and be sure to bring your photo ID.
              </p>

              <h2 className="text-xl font-bold mt-6 mb-3">💵 Your Money:</h2>

              <p className="mb-4">
                Once you sign and the buyer signs their paperwork your money will be released. You can receive your funds in a couple of different ways. You pick up a check at the title company, have the check over nighted to you or have the money wired directly to your bank account. The Title company will have a form for you to fill out at the time you sign your paperwork letting them know how you would like your money to be dispersed. Due to fraud, they will not take any information over the phone or through email.
              </p>

              <h2 className="text-xl font-bold mt-6 mb-3">📤 Wiring Your Funds:</h2>

              <p className="mb-4">
                Please check with your bank as to their policies on holding your money until the funds clear. Due to fraud most banks if not all will put a hold on your funds if you deposit a large check, some for as long as 14 days which makes it hard if you are using the money to buy another home. You'll want to have your funds wired to your account which 99.9% of the time will give you access to 100% of your funds as soon as the money is deposited into your account. The only negative is your bank will most likely charge you a fee to receive the funds normally around $20. If you do decide to wire please make contact with your bank to make sure you have the correct wiring instructions, most of the time you can use the information on your bank check but there are a couple of banks including Chase, 5/3rd and some Credit Unions whose wiring instructions are different than the info on your check so please be sure.
              </p>

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

export default ClearToCloseLetterView;
