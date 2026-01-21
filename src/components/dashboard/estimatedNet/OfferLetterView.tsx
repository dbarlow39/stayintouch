import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PropertyData } from "@/types/estimatedNet";
import { ArrowLeft, Download, List, Mail, Calendar, FileText, ArrowRight, Copy, DollarSign } from "lucide-react";
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

  // Extract first names
  const ownerFirstName = propertyData.name.split(' ')[0];
  const listingAgentFirstName = propertyData.listingAgentName?.split(' ')[0] || '';

  const handleDownloadPDF = async () => {
    const html2canvas = (await import('html2canvas')).default;
    const { jsPDF } = await import('jspdf');
    
    const element = document.getElementById('offer-letter-content');
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
    pdf.save(`Offer Letter - ${propertyData.streetAddress}.pdf`);
  };

  const handleCopyToClipboard = async () => {
    const content = document.getElementById('offer-letter-content');
    if (!content) return;

    try {
      const clonedContent = content.cloneNode(true) as HTMLElement;
      
      // Remove print:hidden elements
      const noPdfElements = clonedContent.querySelectorAll('.print\\:hidden');
      noPdfElements.forEach(el => el.remove());
      
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
        description: "The letter has been copied. You can now paste it into an email.",
      });

      // Open email client
      const sellerEmail = propertyData.sellerEmail || '';
      const subject = encodeURIComponent(`We have received an offer for ${propertyData.streetAddress}`);
      window.open(`mailto:${sellerEmail}?subject=${subject}`, '_blank');
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
      icon: FileText,
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
        <div className="space-y-1">
          {navigationItems.map((item, idx) => (
            <Button
              key={idx}
              variant="ghost"
              className={`w-full justify-start text-left h-auto py-2 px-3 ${
                item.disabled ? 'opacity-50 cursor-not-allowed' : ''
              } ${item.active ? 'bg-primary/10 text-primary' : ''}`}
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
        {/* Action Buttons - Top Right */}
        <div className="flex justify-end gap-2 mb-4 print:hidden">
          <Button onClick={handleCopyToClipboard} variant="outline" className="gap-2">
            <Copy className="h-4 w-4" />
            Copy & Email
          </Button>
          <Button onClick={handleDownloadPDF} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Download PDF
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
