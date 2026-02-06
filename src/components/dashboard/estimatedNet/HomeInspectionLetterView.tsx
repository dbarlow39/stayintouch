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

interface HomeInspectionLetterViewProps {
  propertyData: PropertyData;
  propertyId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
  onNavigate: (view: string) => void;
}

const HomeInspectionLetterView = ({ propertyData, propertyId, onBack, onEdit, onNavigate }: HomeInspectionLetterViewProps) => {
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

  const handleCopyToClipboard = async () => {
    const content = document.getElementById('home-inspection-letter-content');
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

      const subject = `Home Inspection - ${propertyData.streetAddress}`;
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
    { label: "Request to Remedy", icon: FileText, onClick: () => onNavigate('request-to-remedy') },
    { label: "Settlement Statement", icon: FileText, onClick: () => onNavigate('settlement-statement') },
    { label: "Notices", icon: Bell, onClick: () => onNavigate('notices') },
    { label: "Home Inspection", icon: FileText, onClick: () => {}, active: true },
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
        <div className="max-w-4xl mx-auto" id="home-inspection-letter-content">
          <div className="flex items-center justify-between mb-8 print:mb-4">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Sell for 1 Percent" className="h-16 w-auto print:h-12" />
              <div>
                <h1 className="text-3xl font-bold text-foreground">Home Inspection</h1>
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
                You may have already seen that the buyers have scheduled their home inspection. The biggest item is to make sure all of the utilities are turned on so the inspector can test everything. If for some reason you have something turned off go ahead and turn it back on and after the inspection you can turn it off again. If a utility cannot be turned back on let me know so I can let the buyer agent know.
              </p>

              <p className="mb-4">
                Otherwise we treat home inspections just like we do showings, if you are still living in the home treat it like you would a showing. The only difference being home inspections typically can take anywhere from 3 to 4 hours so make sure you have a place to go.
              </p>

              <p className="mb-4">
                Once the inspection is completed it normally takes a day or so for the buyer to digest the report and if they have the right to ask for a remedy we should see it a day or 2 after the inspection. I typically do not call the buyer agent to ask them how it went, I recommend we sit tight and if they send over a remedy we'll deal with it then.
              </p>

              <p className="mb-4">
                Rest assured I'll follow up with you as soon as I hear anything. Let me know if you have any questions.
              </p>

              <p className="mb-4">Thanks</p>
              <p className="mb-4">{agentFirstName}</p>
              <p className="mb-4">The best compliment I can receive is a referral from you!</p>
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

export default HomeInspectionLetterView;
