import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PropertyData } from "@/types/estimatedNet";
import { ArrowLeft, List, Mail, Calendar, FileText, Copy, DollarSign, ClipboardList, Settings, Download, Home } from "lucide-react";
import { EmailClient, EMAIL_CLIENT_OPTIONS, getEmailClientPreference, setEmailClientPreference, getEmailLink } from "@/utils/emailClientUtils";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.jpg";
import { formatCurrency } from "@/utils/estimatedNetCalculations";

interface TitleLetterViewProps {
  propertyData: PropertyData;
  propertyId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
  onNavigate: (view: string) => void;
}

const TitleLetterView = ({ propertyData, propertyId, onBack, onEdit, onNavigate }: TitleLetterViewProps) => {
  const { toast } = useToast();
  const [emailClient, setEmailClient] = useState<EmailClient>(getEmailClientPreference);

  const handleEmailClientChange = (value: string) => {
    const client = value as EmailClient;
    setEmailClient(client);
    setEmailClientPreference(client);
  };

  const handleCopyToClipboard = async () => {
    const content = document.getElementById('title-letter-content');
    if (!content) return;

    try {
      const clonedContent = content.cloneNode(true) as HTMLElement;
      
      // Convert logo to base64
      const logoImg = clonedContent.querySelector('img');
      if (logoImg) {
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
            logoImg.style.width = '200px';
            logoImg.style.height = 'auto';
            logoImg.setAttribute('width', '200');
            resolve(true);
          };
          img.onerror = reject;
          img.src = logoImg.src;
        });
      }
      
      // Add inline styles for email compatibility
      const logoContainer = clonedContent.querySelector('.flex.items-center.gap-3');
      if (logoContainer) {
        (logoContainer as HTMLElement).style.cssText = 'display: flex; align-items: center; gap: 12px;';
        
        const logoInContainer = logoContainer.querySelector('img');
        if (logoInContainer) {
          const logoEl = logoInContainer as HTMLImageElement;
          logoEl.style.display = 'block';
          logoEl.style.margin = '0';
          logoEl.style.flexShrink = '0';
          logoEl.style.width = '200px';
          logoEl.style.height = 'auto';
          logoEl.setAttribute('width', '200');
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
      
      // Style all paragraphs
      clonedContent.querySelectorAll('p').forEach((p) => {
        (p as HTMLElement).style.cssText = 'margin: 16px 0; line-height: 1.6; color: #374151;';
      });
      
      // Style headings
      clonedContent.querySelectorAll('h2').forEach((h2) => {
        (h2 as HTMLElement).style.cssText = 'font-size: 20px; font-weight: bold; margin: 24px 0 16px; color: #111827;';
      });
      
      // Style tables
      clonedContent.querySelectorAll('table').forEach((table) => {
        (table as HTMLElement).style.cssText = 'width: 100%; border-collapse: collapse; margin: 16px 0;';
      });
      
      clonedContent.querySelectorAll('td').forEach((td) => {
        (td as HTMLElement).style.cssText = 'padding: 12px 16px; border-bottom: 1px solid #e5e7eb;';
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

      // Open email client with pre-filled subject
      const subject = `Title Information - ${propertyData.streetAddress}`;
      const link = getEmailLink("", emailClient, subject);
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
    
    const element = document.getElementById('title-letter-content');
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
    pdf.save(`Title Letter - ${propertyData.streetAddress}.pdf`);
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
      onClick: () => {},
      active: true,
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
              className={`w-full justify-start text-left h-auto py-2 px-3 ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''} ${item.active ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' : ''}`}
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
        {/* Action Buttons */}
        <div className="flex justify-end gap-2 mb-4 print:hidden">
          <Button onClick={handleCopyToClipboard} variant="default" className="gap-2">
            <Copy className="h-4 w-4" />
            Copy & Email
          </Button>
          <Button onClick={handleDownloadPDF} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
        </div>
        
        <div className="max-w-4xl">
          <div className="bg-white p-8 rounded-lg shadow-sm" id="title-letter-content">
            {/* Header with Logo */}
            <div className="flex items-center gap-3 mb-8">
              <img src={logo} alt="Sell for 1 Percent" className="h-16 w-auto" />
              <div>
                <h1 className="text-3xl font-bold text-foreground">Title Letter</h1>
                <p className="text-muted-foreground">Title Company Information</p>
              </div>
            </div>

            {/* Property Information */}
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-foreground mb-2 flex items-center gap-2">
                <Home className="h-5 w-5 text-primary" />
                Property Details
              </h2>
              <table className="w-full">
                <tbody>
                  <tr>
                    <td className="py-2 text-muted-foreground w-1/3">Property Address:</td>
                    <td className="py-2 font-medium">{propertyData.streetAddress}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-muted-foreground">City, State, Zip:</td>
                    <td className="py-2 font-medium">{propertyData.city}, {propertyData.state} {propertyData.zip}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-muted-foreground">Seller Name:</td>
                    <td className="py-2 font-medium">{propertyData.name}</td>
                  </tr>
                  {propertyData.sellerPhone && (
                    <tr>
                      <td className="py-2 text-muted-foreground">Seller Phone:</td>
                      <td className="py-2 font-medium">{propertyData.sellerPhone}</td>
                    </tr>
                  )}
                  {propertyData.sellerEmail && (
                    <tr>
                      <td className="py-2 text-muted-foreground">Seller Email:</td>
                      <td className="py-2 font-medium">{propertyData.sellerEmail}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Contract Information */}
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-foreground mb-2">Contract Details</h2>
              <table className="w-full">
                <tbody>
                  <tr>
                    <td className="py-2 text-muted-foreground w-1/3">Sale Price:</td>
                    <td className="py-2 font-medium">{formatCurrency(propertyData.offerPrice)}</td>
                  </tr>
                  {propertyData.closingDate && (
                    <tr>
                      <td className="py-2 text-muted-foreground">Closing Date:</td>
                      <td className="py-2 font-medium">{new Date(propertyData.closingDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="py-2 text-muted-foreground">Deposit Amount:</td>
                    <td className="py-2 font-medium">{formatCurrency(propertyData.deposit)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Listing Agent Information */}
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-foreground mb-2">Listing Agent</h2>
              <table className="w-full">
                <tbody>
                  {propertyData.listingAgentName && (
                    <tr>
                      <td className="py-2 text-muted-foreground w-1/3">Name:</td>
                      <td className="py-2 font-medium">{propertyData.listingAgentName}</td>
                    </tr>
                  )}
                  {propertyData.listingAgentPhone && (
                    <tr>
                      <td className="py-2 text-muted-foreground">Phone:</td>
                      <td className="py-2 font-medium">{propertyData.listingAgentPhone}</td>
                    </tr>
                  )}
                  {propertyData.listingAgentEmail && (
                    <tr>
                      <td className="py-2 text-muted-foreground">Email:</td>
                      <td className="py-2 font-medium">{propertyData.listingAgentEmail}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Buyer Agent Information */}
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-foreground mb-2">Buyer's Agent</h2>
              <table className="w-full">
                <tbody>
                  {propertyData.agentName && (
                    <tr>
                      <td className="py-2 text-muted-foreground w-1/3">Name:</td>
                      <td className="py-2 font-medium">{propertyData.agentName}</td>
                    </tr>
                  )}
                  {propertyData.agentContact && (
                    <tr>
                      <td className="py-2 text-muted-foreground">Phone:</td>
                      <td className="py-2 font-medium">{propertyData.agentContact}</td>
                    </tr>
                  )}
                  {propertyData.agentEmail && (
                    <tr>
                      <td className="py-2 text-muted-foreground">Email:</td>
                      <td className="py-2 font-medium">{propertyData.agentEmail}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mortgage Information */}
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-foreground mb-2">Mortgage Payoff Information</h2>
              <table className="w-full">
                <tbody>
                  <tr>
                    <td className="py-2 text-muted-foreground w-1/3">1st Mortgage:</td>
                    <td className="py-2 font-medium">{formatCurrency(propertyData.firstMortgage)}</td>
                  </tr>
                  {propertyData.secondMortgage > 0 && (
                    <tr>
                      <td className="py-2 text-muted-foreground">2nd Mortgage:</td>
                      <td className="py-2 font-medium">{formatCurrency(propertyData.secondMortgage)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Tax Information */}
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-foreground mb-2">Tax Information</h2>
              <table className="w-full">
                <tbody>
                  <tr>
                    <td className="py-2 text-muted-foreground w-1/3">Annual Taxes:</td>
                    <td className="py-2 font-medium">{formatCurrency(propertyData.annualTaxes)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-muted-foreground">First Half Paid:</td>
                    <td className="py-2 font-medium">{propertyData.firstHalfPaid ? 'Yes' : 'No'}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-muted-foreground">Second Half Paid:</td>
                    <td className="py-2 font-medium">{propertyData.secondHalfPaid ? 'Yes' : 'No'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Notes */}
            {propertyData.notes && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-foreground mb-2">Additional Notes</h2>
                <p className="text-muted-foreground whitespace-pre-wrap">{propertyData.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TitleLetterView;
