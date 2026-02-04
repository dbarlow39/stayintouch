import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PropertyData } from "@/types/estimatedNet";
import { ArrowLeft, List, Mail, Calendar, FileText, Copy, DollarSign, ClipboardList, Settings, Download, Home } from "lucide-react";
import { EmailClient, EMAIL_CLIENT_OPTIONS, getEmailClientPreference, setEmailClientPreference, getEmailLink } from "@/utils/emailClientUtils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.jpg";
import { format, subDays } from "date-fns";

interface AgentLetterViewProps {
  propertyData: PropertyData;
  propertyId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
  onNavigate: (view: string) => void;
}

const AgentLetterView = ({ propertyData, propertyId, onBack, onEdit, onNavigate }: AgentLetterViewProps) => {
  const { toast } = useToast();
  const [emailClient, setEmailClient] = useState<EmailClient>(getEmailClientPreference);
  const [agentFirstName, setAgentFirstName] = useState<string>("");
  const [agentPhone, setAgentPhone] = useState<string>("");
  const [agentEmail, setAgentEmail] = useState<string>("");

  useEffect(() => {
    const fetchAgentProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, cell_phone, preferred_email, email')
          .eq('id', user.id)
          .single();
        if (profile) {
          setAgentFirstName(profile.first_name || "");
          setAgentPhone(profile.cell_phone || "");
          setAgentEmail(profile.preferred_email || profile.email || "");
        }
      }
    };
    fetchAgentProfile();
  }, []);

  const handleEmailClientChange = (value: string) => {
    const client = value as EmailClient;
    setEmailClient(client);
    setEmailClientPreference(client);
  };

  // Helper function to parse date string as local date to avoid timezone shifts
  const parseLocalDate = (dateString: string): Date => {
    const [year, month, day] = dateString.split('-');
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  };

  // Calculate 15 days prior to closing date
  const titleCommitmentDue = propertyData.closingDate 
    ? format(subDays(parseLocalDate(propertyData.closingDate), 15), "MM/dd/yyyy")
    : "";

  // Pre-approval due in days
  const preApprovalDue = propertyData.preApprovalDays === 0 
    ? "Received" 
    : propertyData.preApprovalDays 
    ? `${propertyData.preApprovalDays} days` 
    : "";

  // Calculate loan commitment due date (in contract date + loan commitment days)
  const loanCommitmentDue = propertyData.inContract && propertyData.loanCommitment
    ? format(new Date(parseLocalDate(propertyData.inContract).getTime() + parseInt(propertyData.loanCommitment) * 24 * 60 * 60 * 1000), "MM/dd/yyyy")
    : "";

  // Calculate home inspection due date
  const inspectionDue = propertyData.inContract && propertyData.inspectionDays
    ? format(new Date(parseLocalDate(propertyData.inContract).getTime() + propertyData.inspectionDays * 24 * 60 * 60 * 1000), "MM/dd/yyyy")
    : "";

  // Calculate remedy period due date
  const remedyDue = propertyData.remedyPeriodDays === 0
    ? "Buyer Waived"
    : propertyData.inContract && propertyData.inspectionDays && propertyData.remedyPeriodDays
    ? format(new Date(parseLocalDate(propertyData.inContract).getTime() + (propertyData.inspectionDays + propertyData.remedyPeriodDays) * 24 * 60 * 60 * 1000), "MM/dd/yyyy")
    : "";

  // Deposit due date
  const depositDue = propertyData.depositCollection || "";

  // Extract buyer agent first name
  const buyerAgentFirstName = propertyData.agentName?.split(" ")[0] || "";

  const handleCopyToClipboard = async () => {
    const content = document.getElementById('agent-letter-content');
    if (!content) return;

    try {
      const clonedContent = content.cloneNode(true) as HTMLElement;
      
      // Convert logo to base64
      const logoImg = clonedContent.querySelector('img') as HTMLImageElement;
      if (logoImg) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        await new Promise((resolve, reject) => {
          img.onload = () => {
            // Resize to 175px width
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
      
      // Style the processor section paragraphs to have single spacing
      const processorSection = clonedContent.querySelector('.bg-muted\\/50');
      if (processorSection) {
        const paragraphs = processorSection.querySelectorAll('p');
        paragraphs.forEach((p) => {
          (p as HTMLElement).style.cssText = 'margin: 0; padding: 0; line-height: 1.5;';
        });
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

      // Open email client with pre-filled subject and recipient
      const subject = `Transaction Summary for "${propertyData.streetAddress}"`;
      const link = getEmailLink(propertyData.agentEmail || "", emailClient, subject);
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

  const handleDownloadPDF = async () => {
    const html2canvas = (await import('html2canvas')).default;
    const { jsPDF } = await import('jspdf');
    
    const element = document.getElementById('agent-letter-content');
    if (!element) return;
    
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
    });
    
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const marginLeft = 10;
    const marginRight = 10;
    const marginTop = 10;
    const marginBottom = 16;

    const maxWidth = pageWidth - marginLeft - marginRight;
    const maxHeight = pageHeight - marginTop - marginBottom;

    let imgWidth = maxWidth;
    let imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (imgHeight > maxHeight) {
      imgHeight = maxHeight;
      imgWidth = (canvas.width * imgHeight) / canvas.height;
    }

    const x = marginLeft + (maxWidth - imgWidth) / 2;
    const y = marginTop;

    pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
    pdf.save(`Agent Letter - ${propertyData.streetAddress}.pdf`);
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
      icon: Home,
      onClick: () => onNavigate('title-letter'),
    },
    {
      label: "Agent Letter",
      icon: Mail,
      onClick: () => {},
      active: true,
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
      <aside className="w-56 p-3 border-r bg-card shrink-0 print:hidden no-pdf">
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
      <div className="flex-1 py-8 px-4">
        <div className="max-w-4xl mx-auto" id="agent-letter-content">
          <div className="flex items-center justify-between mb-8 print:mb-4">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Sell for 1 Percent" className="h-16 w-auto print:h-12" />
              <div>
                <h1 className="text-3xl font-bold text-foreground">Transaction Summary</h1>
                <p className="text-muted-foreground">Details of The Purchase Offer</p>
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
            <div className="space-y-6">
              <div>
                <p className="mb-4">Hi {buyerAgentFirstName},</p>
                <p className="mb-4">
                  We are in contract on {propertyData.streetAddress}, {propertyData.city}, {propertyData.state} {propertyData.zip}. 
                  I look forward to working with you and your team to close this one. Below is additional information about 
                  the title company and the contract dates I have.
                </p>
              </div>

              <div className="bg-muted/50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Caliber Title / Title First</h3>
                <p>Kameron Faulkner or Shina Painter</p>
                <p className="text-sm text-muted-foreground">Processor</p>
                <p>Phone: 614-854-0980</p>
                <p>polaris@titlefirst.com</p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-4">Important Dates</h2>
                <table className="w-full">
                  <tbody className="space-y-2">
                    <tr className="border-b">
                      <td className="py-2 font-medium">Closing date:</td>
                      <td className="py-2 text-right">{propertyData.closingDate ? format(parseLocalDate(propertyData.closingDate), "MM/dd/yyyy") : ""}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 font-medium">Possession Date:</td>
                      <td className="py-2 text-right">{propertyData.possession ? format(parseLocalDate(propertyData.possession), "MM/dd/yyyy") : ""}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 font-medium">Pre-approval Due:</td>
                      <td className="py-2 text-right">{preApprovalDue}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 font-medium">Loan Commitment due:</td>
                      <td className="py-2 text-right">{loanCommitmentDue}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 font-medium">Home Inspection period ends:</td>
                      <td className="py-2 text-right">{inspectionDue}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 font-medium">Buyers Request to Remedy period ends:</td>
                      <td className="py-2 text-right">{remedyDue}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 font-medium">Title Commitment due:</td>
                      <td className="py-2 text-right">{titleCommitmentDue}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 font-medium">Earnest Money due:</td>
                      <td className="py-2 text-right">{depositDue}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 font-medium">Final walk-through:</td>
                      <td className="py-2 text-right">{propertyData.finalWalkThrough || ""}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-6">
                <p className="mb-4">
                  Let me know if you see anything that needs to be changed. I look forward to working with you to get this one closed.
                </p>
                <p className="mt-6">Thanks</p>
                <p className="mt-4">{agentFirstName}</p>
                <p>{agentPhone}</p>
                <p>{agentEmail}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AgentLetterView;
