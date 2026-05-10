import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PropertyData } from "@/types/estimatedNet";
import { filterNavForRepType } from "@/utils/navigationUtils";
import { ArrowLeft, List, Mail, Calendar, FileText, Copy, DollarSign, ClipboardList, Settings, Home, Bell } from "lucide-react";
import { EmailClient, EMAIL_CLIENT_OPTIONS, getEmailClientPreference, setEmailClientPreference, getEmailLink } from "@/utils/emailClientUtils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.jpg";
import { format } from "date-fns";

interface LoanApprovedLetterViewProps {
  propertyData: PropertyData;
  propertyId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
  onNavigate: (view: string) => void;
}

const LoanApprovedLetterView = ({ propertyData, propertyId, onBack, onEdit, onNavigate }: LoanApprovedLetterViewProps) => {
  const { toast } = useToast();
  const [emailClient, setEmailClientState] = useState<EmailClient>(getEmailClientPreference);
  const [agentEmail, setAgentEmail] = useState("");
  const [agentFirstName, setAgentFirstName] = useState("");
  const [agentFullName, setAgentFullName] = useState("");
  const [agentPhone, setAgentPhone] = useState("");
  const [agentBio, setAgentBio] = useState("");
  const [letterVariant, setLetterVariant] = useState<"homeowner" | "professional">("homeowner");

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

  const lenderGreeting = [buyerAgentFirstName, lendingOfficerFirstName].filter(Boolean).join(' & ') || "there";

  const buyerNames = [propertyData.buyerName1, propertyData.buyerName2].filter(Boolean).join(' & ') || "the Buyers";

  const fullAddress = [
    propertyData.streetAddress,
    propertyData.city,
    propertyData.state && propertyData.zip ? `${propertyData.state} ${propertyData.zip}` : propertyData.state || propertyData.zip
  ].filter(Boolean).join(', ');

  const closingDateFormatted = propertyData.closingDate
    ? (() => { try { return format(new Date(propertyData.closingDate), 'MMMM d, yyyy'); } catch { return propertyData.closingDate; } })()
    : "TBD";

  const handleCopyToClipboard = async () => {
    const content = document.getElementById('loan-approved-letter-content');
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
        ? `Loan Approved — ${propertyData.streetAddress}`
        : `Loan Approval Update — ${propertyData.streetAddress}`;
      const recipients = letterVariant === "homeowner"
        ? (propertyData.sellerEmail || "")
        : ([propertyData.agentEmail, propertyData.lendingOfficerEmail].filter(Boolean).join(','));
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
    { label: "Loan Approved", icon: FileText, onClick: () => {}, active: true },
  ];
  const displayNavItems = filterNavForRepType(navigationItems, propertyData.representationType);

  const signature = agentBio ? (
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
  );

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
          {displayNavItems.map((item, idx) => (
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
        <div className="max-w-4xl mx-auto" id="loan-approved-letter-content">
          <div className="flex items-center justify-between mb-8 print:mb-4">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Sell for 1 Percent" className="h-16 w-auto print:h-12" />
              <div>
                <h1 className="text-3xl font-bold text-foreground">
                  {letterVariant === "homeowner" ? "Loan Approved" : "Loan Approval Update"}
                </h1>
                <p className="text-muted-foreground">
                  {letterVariant === "homeowner"
                    ? `Notice to ${propertyData.name || "Homeowner"}`
                    : `Notice to Buyer's Agent & Lender`}
                </p>
              </div>
            </div>
            <div className="flex gap-2 print:hidden no-pdf">
              <div className="flex rounded-md border overflow-hidden mr-2">
                <Button
                  variant={letterVariant === "homeowner" ? "default" : "ghost"}
                  size="sm"
                  className="rounded-none"
                  onClick={() => setLetterVariant("homeowner")}
                  type="button"
                >
                  Homeowner
                </Button>
                <Button
                  variant={letterVariant === "professional" ? "default" : "ghost"}
                  size="sm"
                  className="rounded-none"
                  onClick={() => setLetterVariant("professional")}
                  type="button"
                >
                  Lender & Agent
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
                    Great news! The buyer's loan for {fullAddress} has been approved by {propertyData.lenderName || "the lender"}. This is a major milestone in the transaction and means we are on track for a smooth closing.
                  </p>
                  <p className="mb-4">
                    The next steps will be to receive the Clear to Close and finalize any remaining details before closing day. I'll keep you updated as things progress.
                  </p>
                  <p className="mb-4">Please don't hesitate to reach out if you have any questions.</p>
                  <p className="mb-4">Thanks</p>
                  <p className="mb-4">{agentFirstName}</p>
                  {signature}
                </>
              ) : (
                <>
                  <p className="mb-4">Hi {lenderGreeting},</p>
                  <p className="mb-4">
                    In regard to {buyerNames} and the property located at {fullAddress} that we have in contract. I wanted to get an update on the buyer's loan approval to be sure we are on track for the scheduled closing coming up on {closingDateFormatted}. If you would let me know.
                  </p>
                  <p className="mb-4">Thanks</p>
                  <p className="mb-4">{agentFirstName}</p>
                  {signature}
                </>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default LoanApprovedLetterView;
