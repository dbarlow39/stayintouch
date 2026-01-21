import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PropertyData, ClosingCostData } from "@/types/estimatedNet";
import { calculateClosingCosts, formatCurrency } from "@/utils/estimatedNetCalculations";
import { ArrowLeft, Download, List, Mail, Calendar, FileText, ArrowRight, DollarSign, ClipboardList } from "lucide-react";
import logo from "@/assets/logo.jpg";

interface OfferSummaryViewProps {
  propertyData: PropertyData;
  propertyId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
  onNavigate: (view: string) => void;
}

const OfferSummaryView = ({ propertyData, propertyId, onBack, onEdit, onNavigate }: OfferSummaryViewProps) => {
  const closingCosts = calculateClosingCosts(propertyData);

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    // Handle both date strings and text descriptions
    if (dateString.includes('-') && dateString.length === 10) {
      const [year, month, day] = dateString.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
    return dateString;
  };

  const calculateInspectionEndDate = () => {
    if (propertyData.inspectionDays === 0) return "Waived";
    let baseDate: Date;
    if (propertyData.inContract && propertyData.inContract.includes('-')) {
      const [year, month, day] = propertyData.inContract.split('-');
      baseDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    } else {
      baseDate = new Date();
    }
    baseDate.setDate(baseDate.getDate() + propertyData.inspectionDays);
    return baseDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const calculateRemedyEndDate = () => {
    if (propertyData.remedyPeriodDays === 0) return "Waived";
    let baseDate: Date;
    if (propertyData.inContract && propertyData.inContract.includes('-')) {
      const [year, month, day] = propertyData.inContract.split('-');
      baseDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    } else {
      baseDate = new Date();
    }
    baseDate.setDate(baseDate.getDate() + propertyData.inspectionDays + propertyData.remedyPeriodDays);
    return baseDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const handleDownloadPDF = async () => {
    const html2canvas = (await import('html2canvas')).default;
    const { jsPDF } = await import('jspdf');
    
    const element = document.getElementById('offer-summary-content');
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
    pdf.save(`Summary of Offer - ${propertyData.streetAddress}.pdf`);
  };

  const SummaryRow = ({ label, value }: { label: string; value: string | number }) => (
    <div className="flex justify-between py-3 border-b border-border summary-row">
      <span className="font-medium text-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
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
      onClick: () => onNavigate('results'),
    },
    {
      label: "Offer Summary",
      icon: ClipboardList,
      onClick: () => {},
      active: true,
    },
    {
      label: "Offer Letter",
      icon: Mail,
      onClick: () => onNavigate('offer-letter'),
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
        {/* Download PDF Button - Top Right */}
        <div className="flex justify-end mb-4 print:hidden">
          <Button onClick={handleDownloadPDF} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
        </div>
        
        <div className="max-w-4xl">
          <div className="pdf-content p-6" id="offer-summary-content">
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
                .pdf-content .summary-row {
                  padding-top: 5px !important;
                  padding-bottom: 5px !important;
                }
                .pdf-content .card-content {
                  padding: 18px !important;
                }
                .pdf-content .header-section {
                  margin-bottom: 14px !important;
                }
                .pdf-content .property-header {
                  margin-bottom: 12px !important;
                  padding-bottom: 9px !important;
                }
                .pdf-content img {
                  height: 52px !important;
                }
                .pdf-content .net-highlight {
                  padding: 9px !important;
                  margin-top: 9px !important;
                }
              }
            ` }} />
            <div className="flex items-center gap-3 mb-8 header-section">
              <img src={logo} alt="Sell for 1 Percent" className="h-16 w-auto" />
              <div>
                <h1 className="text-3xl font-bold text-foreground">Summary of Offer</h1>
                <p className="text-muted-foreground">Complete offer overview</p>
              </div>
            </div>

            <Card className="p-6 mb-6 card-content">
              <div className="mb-6 pb-4 border-b-2 border-primary property-header">
                <h2 className="text-xl font-semibold text-foreground mb-1">{propertyData.name}</h2>
                <p className="text-muted-foreground">{propertyData.streetAddress}</p>
                <p className="text-muted-foreground">{propertyData.city}, {propertyData.state} {propertyData.zip}</p>
              </div>

              <div className="space-y-1 mb-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">Financial Summary</h3>
                <SummaryRow label="Offer Price" value={formatCurrency(propertyData.offerPrice)} />
                <SummaryRow label="Buyer Closing Cost" value={formatCurrency(propertyData.closingCost)} />
                <div className="flex justify-between py-3 bg-accent/10 px-4 rounded-lg mt-4 net-highlight">
                  <span className="font-bold text-foreground">
                    Estimated Net <span className="text-sm">(after all expenses paid)</span>
                  </span>
                  <span className="font-bold text-accent">{formatCurrency(closingCosts.estimatedNet)}</span>
                </div>
              </div>

              <div className="space-y-1 mb-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">Loan Information</h3>
                <SummaryRow label="Type of Loan" value={propertyData.typeOfLoan || "Not specified"} />
                <SummaryRow label="Pre-Approval (Days)" value={propertyData.preApprovalDays || 0} />
                {propertyData.appliances && <SummaryRow label="Appliances" value={propertyData.appliances} />}
              </div>

              <div className="space-y-1 mb-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">Timeline & Dates</h3>
                <SummaryRow label="Inspection Period" value={calculateInspectionEndDate()} />
                <SummaryRow label="Remedy Period" value={calculateRemedyEndDate()} />
                <SummaryRow label="Closing Date" value={formatDate(propertyData.closingDate)} />
                <SummaryRow label="Possession" value={formatDate(propertyData.possession)} />
                <SummaryRow label="Buyer's Final Walk Through" value={propertyData.finalWalkThrough || "Not specified"} />
                <SummaryRow label="Respond By" value={propertyData.respondToOfferBy || "Not specified"} />
              </div>

              <div className="space-y-1 mb-6">
                <h3 className="text-lg font-semibold text-foreground mb-3">Additional Costs</h3>
                <SummaryRow label="Home Warranty" value={formatCurrency(propertyData.homeWarranty)} />
                <SummaryRow label="Good Faith Deposit" value={formatCurrency(propertyData.deposit)} />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-foreground mb-3">Agent Information</h3>
                <SummaryRow label="Buyer Agent" value={propertyData.agentName || "Not specified"} />
                <SummaryRow label="Buyer Agent Cell Phone" value={propertyData.agentContact || "Not specified"} />
                {propertyData.agentEmail && <SummaryRow label="Buyer Agent Email" value={propertyData.agentEmail} />}
              </div>

              {propertyData.notes && (
                <div className="mt-6 pt-4 border-t border-border">
                  <h3 className="text-lg font-semibold text-foreground mb-2">Notes</h3>
                  <p className="text-muted-foreground whitespace-pre-wrap">{propertyData.notes}</p>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OfferSummaryView;
