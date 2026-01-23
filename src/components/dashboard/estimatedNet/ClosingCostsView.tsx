import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PropertyData } from "@/types/estimatedNet";
import { calculateClosingCosts, formatCurrency } from "@/utils/estimatedNetCalculations";
import { ArrowLeft, Download, List, Mail, Calendar, FileText, ArrowRight, DollarSign, ClipboardList, Settings } from "lucide-react";
import { EmailClient, EMAIL_CLIENT_OPTIONS, getEmailClientPreference, setEmailClientPreference } from "@/utils/emailClientUtils";
import logo from "@/assets/logo.jpg";

interface ClosingCostsViewProps {
  propertyData: PropertyData;
  propertyId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
  onNavigate: (view: string) => void;
}

const ClosingCostsView = ({ propertyData, propertyId, onBack, onEdit, onNavigate }: ClosingCostsViewProps) => {
  const closingCosts = calculateClosingCosts(propertyData);
  const [emailClient, setEmailClient] = useState<EmailClient>(getEmailClientPreference);

  const handleEmailClientChange = (value: string) => {
    const client = value as EmailClient;
    setEmailClient(client);
    setEmailClientPreference(client);
  };

  const handleDownloadPDF = async () => {
    const html2canvas = (await import('html2canvas')).default;
    const { jsPDF } = await import('jspdf');
    
    const element = document.getElementById('closing-costs-content');
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

    // Ensure we never clip at the bottom by fitting the image within the page bounds
    // with an explicit bottom margin (~5/8" = 15.9mm).
    const marginLeft = 10;
    const marginRight = 10;
    const marginTop = 10;
    const marginBottom = 16;

    const maxWidth = pageWidth - marginLeft - marginRight;
    const maxHeight = pageHeight - marginTop - marginBottom;

    // Start by fitting to width, then shrink to fit height if needed.
    let imgWidth = maxWidth;
    let imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (imgHeight > maxHeight) {
      imgHeight = maxHeight;
      imgWidth = (canvas.width * imgHeight) / canvas.height;
    }

    const x = marginLeft + (maxWidth - imgWidth) / 2;
    const y = marginTop;

    pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
    pdf.save(`Estimated Net - ${propertyData.streetAddress}.pdf`);
  };

  const CostRow = ({ label, amount, isTotal = false }: { label: string; amount: number; isTotal?: boolean }) => (
    <div className={`flex justify-between py-2 cost-row ${isTotal ? 'border-t-2 border-primary font-bold text-lg' : 'border-b border-border'}`}>
      <span className={isTotal ? 'text-foreground' : 'text-foreground'}>{label}</span>
      <span className={isTotal ? 'text-accent' : 'text-foreground'}>{formatCurrency(amount)}</span>
    </div>
  );

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
      onClick: () => {},
      active: true,
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
        {/* Download PDF Button - Top Right */}
        <div className="flex justify-end mb-4 print:hidden">
          <Button onClick={handleDownloadPDF} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
        </div>
        
        <div className="max-w-4xl">
          <div className="pdf-content p-6" id="closing-costs-content">
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
                .pdf-content h2 {
                  font-size: 21px !important;
                  margin-bottom: 5px !important;
                }
                .pdf-content h3 {
                  font-size: 17px !important;
                  margin-bottom: 6px !important;
                  margin-top: 10px !important;
                }
                .pdf-content .cost-row {
                  padding-top: 6px !important;
                  padding-bottom: 6px !important;
                }
                .pdf-content .card-content {
                  padding: 24px 28px !important;
                }
                .pdf-content .header-section {
                  margin-bottom: 14px !important;
                }
                .pdf-content .property-info {
                  margin-bottom: 12px !important;
                }
                .pdf-content img {
                  height: 52px !important;
                }
              }
            ` }} />
            <div className="flex items-center gap-3 mb-8 header-section">
              <img src={logo} alt="Sell for 1 Percent" className="h-16 w-auto" />
              <div>
                <h1 className="text-3xl font-bold text-foreground">Estimated Net</h1>
                <p className="text-muted-foreground">A Breakdown of Your Expenses</p>
              </div>
            </div>

            <Card className="p-6 mb-6 card-content">
              <div className="mb-6 property-info">
                <h2 className="text-xl font-semibold text-foreground mb-1">{propertyData.name}</h2>
                <p className="text-muted-foreground">{propertyData.streetAddress}</p>
                <p className="text-muted-foreground">{propertyData.city}, {propertyData.state} {propertyData.zip}</p>
              </div>

              <div className="space-y-1">
                <CostRow label="Selling Price" amount={closingCosts.sellingPrice} />
                <CostRow label="1st Mortgage" amount={closingCosts.firstMortgage} />
                <CostRow label="2nd Mortgage" amount={closingCosts.secondMortgage} />
                <CostRow label="Buyer Closing Cost" amount={closingCosts.buyerClosingCost} />
                
                <div className="pt-2 pb-1">
                  <h3 className="font-semibold text-foreground">Tax Information</h3>
                </div>
                <CostRow label="Taxes 1st Half 2025" amount={closingCosts.taxesFirstHalf} />
                <CostRow label="Taxes 2nd Half 2025" amount={closingCosts.taxesSecondHalf} />
                <CostRow label="Taxes Due for Year 2026" amount={closingCosts.taxesDueForYear} />
                
                <div className="pt-2 pb-1">
                  <h3 className="font-semibold text-foreground">Commissions & Fees</h3>
                </div>
                <CostRow label={`Listing Agent Commission (${propertyData.listingAgentCommission}%)`} amount={closingCosts.listingAgentCommission} />
                <CostRow label={`Buyer Agent Commission (${propertyData.buyerAgentCommission}%)`} amount={closingCosts.buyerAgentCommission} />
                <CostRow label="County Conveyance Fee" amount={closingCosts.countyConveyanceFee} />
                
                <div className="pt-2 pb-1">
                  <h3 className="font-semibold text-foreground">Additional Costs</h3>
                </div>
                <CostRow 
                  label={`Home Warranty${closingCosts.homeWarrantyCompany ? ` - ${closingCosts.homeWarrantyCompany}` : ''}`} 
                  amount={closingCosts.homeWarranty} 
                />
                <CostRow label="Title Examination" amount={closingCosts.titleExamination} />
                <CostRow label="Title Settlement" amount={closingCosts.titleSettlement} />
                <CostRow label="Closing Fee" amount={closingCosts.closingFee} />
                <CostRow label="Deed Preparation" amount={closingCosts.deedPreparation} />
                <CostRow label="Overnight Fee" amount={closingCosts.overnightFee} />
                <CostRow label="Recording Fee" amount={closingCosts.recordingFee} />
                <CostRow label="Survey Coverage" amount={closingCosts.surveyCoverage} />
                <CostRow label="Admin Fee" amount={closingCosts.adminFee} />
                <CostRow label="Title Insurance" amount={closingCosts.titleInsurance} />
                
                <div className="pt-4">
                  <CostRow label="Estimated Net" amount={closingCosts.estimatedNet} isTotal />
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClosingCostsView;
