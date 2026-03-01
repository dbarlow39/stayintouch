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

interface TitleCommitmentLetterViewProps {
  propertyData: PropertyData;
  propertyId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
  onNavigate: (view: string) => void;
}

const TitleCommitmentLetterView = ({ propertyData, propertyId, onBack, onEdit, onNavigate }: TitleCommitmentLetterViewProps) => {
  const { toast } = useToast();
  const [emailClient, setEmailClientState] = useState<EmailClient>(getEmailClientPreference);
  const [agentEmail, setAgentEmail] = useState("");
  const [agentFirstName, setAgentFirstName] = useState("");
  const [agentFullName, setAgentFullName] = useState("");
  const [agentPhone, setAgentPhone] = useState("");
  const [agentBio, setAgentBio] = useState("");
  const [letterVariant, setLetterVariant] = useState<"homeowner" | "title">("homeowner");

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
    const content = document.getElementById('title-commitment-letter-content');
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

      const subject = letterVariant === "homeowner"
        ? `Title Commitment Received - ${propertyData.streetAddress}`
        : `Title Commitment Request - ${propertyData.streetAddress}`;
      const recipients = letterVariant === "homeowner"
        ? (propertyData.sellerEmail || "")
        : (propertyData.titleEmail || "");
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

  const processorFirstNames = propertyData.titleProcessor
    ? propertyData.titleProcessor.split(/\s*(?:&|and)\s*/i).map(n => n.trim().split(' ')[0]).join(' & ')
    : "there";

  const sellerFirstNames = propertyData.name
    ? propertyData.name.split(/\s*(?:&|and)\s*/i).map(n => n.trim().split(' ')[0]).join(' & ')
    : "there";

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
    { label: "Title Commitment", icon: FileText, onClick: () => {}, active: true },
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
        <div className="max-w-4xl mx-auto" id="title-commitment-letter-content">
          <div className="flex items-center justify-between mb-8 print:mb-4">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Sell for 1 Percent" className="h-16 w-auto print:h-12" />
              <div>
                <h1 className="text-3xl font-bold text-foreground">
                  {letterVariant === "homeowner" ? "Title Commitment Received" : "Title Commitment Request"}
                </h1>
                <p className="text-muted-foreground">
                  {letterVariant === "homeowner"
                    ? `Notice to ${propertyData.name || "Client"}`
                    : `To ${propertyData.titleCompanyName || "Title Company"}`}
                </p>
              </div>
            </div>
            <div className="flex gap-2 print:hidden no-pdf">
              <div className="flex rounded-md border overflow-hidden mr-2">
                <Button
                  variant={letterVariant === "homeowner" ? "default" : "ghost"}
                  size="sm"
                  className={letterVariant === "homeowner" ? "rounded-none" : "rounded-none"}
                  onClick={() => setLetterVariant("homeowner")}
                  type="button"
                >
                  Homeowner
                </Button>
                <Button
                  variant={letterVariant === "title" ? "default" : "ghost"}
                  size="sm"
                  className={letterVariant === "title" ? "rounded-none" : "rounded-none"}
                  onClick={() => setLetterVariant("title")}
                  type="button"
                >
                  Title Company
                </Button>
              </div>
              <Button onClick={handleCopyToClipboard} size="lg" className="copy-email-btn bg-emerald-600 hover:bg-emerald-700 text-white">
                <Copy className="mr-2 h-4 w-4" />
                Copy & Email
              </Button>
            </div>
          </div>

          <Card className="p-8 mb-6 print:shadow-none">
            <div className="prose prose-lg max-w-none text-foreground">
              {letterVariant === "homeowner" ? (
                <>
                  <p className="mb-4">Hi {sellerFirstNames},</p>
                  <p className="mb-4">
                    The title company has completed the first phase of the title work required to sell your home known as the Title Commitment. The primary reason for this search is to make sure there are no crazy liens on your property, if there are the title company will be reaching out to you to start the process of cleaning them up.
                  </p>
                  <p className="mb-4">
                    I did take a quick look and everything appears to be in good shape and so no worries at this point. In the mean time don't take out any new loans or put the house up as collateral in a poker game. . . LOL, but really we have had those situations arise.
                  </p>
                  <p className="mb-4">
                    Long story short is everything is progressing just the way it should. Let me know if you have any questions.
                  </p>
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
                </>
              ) : (
                <>
                  <p className="mb-4">Hi {processorFirstNames},</p>
                   <p className="mb-4">
                     Just checking in on the title commitment for {propertyData.streetAddress || "the property"}. Per the contract we are to have this produced for the buyer and the buyers lender by {propertyData.closingDate ? (() => { const [y, m, d] = propertyData.closingDate!.split('-').map(Number); const dt = new Date(y, m - 1, d - 15); return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); })() : "[Title Commitment Due Date]"}.
                   </p>
                  <p className="mb-4">Let me know.</p>
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
                </>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default TitleCommitmentLetterView;
