import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PropertyData } from "@/types/estimatedNet";
import { calculateClosingCosts, formatCurrency } from "@/utils/estimatedNetCalculations";
import { ArrowLeft, Download, List, Mail, Calendar, FileText, ArrowRight, DollarSign, ClipboardList, Settings, Copy, Loader2, Send } from "lucide-react";
import { EmailClient, EMAIL_CLIENT_OPTIONS, getEmailClientPreference, setEmailClientPreference, getEmailLink } from "@/utils/emailClientUtils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
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
  const sellerFirstName = propertyData.name ? propertyData.name.split(/\s*[&,]\s*/).map((n: string) => n.split(' ')[0]).join(' & ') : 'there';
  const [introText, setIntroText] = useState(`Hi ${sellerFirstName},\n\nThank you for the time you spent with me talking about the sale of your home. As promised here is a breakdown of all of the fees associated with the sale of your home. All of these fees come from the standard Columbus Realtors purchase contract including the buyer agent's commission. As we talked about, we recommend making the buyer's commission negotiable, but you can count on the buyer asking you to pay their Realtors fee. While most of these fees are not negotiable, we recommend you build them into your sales price to get a satisfactory bottom line number including the buyer agents commission.`);
  const [closingText, setClosingText] = useState("Once you have had a chance to review please let me know if you have any questions. Once again thanks for your time and I look forward to working you in the near future.");
  const { toast } = useToast();
  const { user } = useAuth();

  // Email dialog state
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailPreviewHtml, setEmailPreviewHtml] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState(propertyData.sellerEmail || "");
  const [profileData, setProfileData] = useState<{
    full_name: string; preferred_email: string; email: string;
    first_name: string | null; cell_phone: string | null; bio: string | null;
  } | null>(null);

  // Fetch agent profile
  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('full_name, preferred_email, email, first_name, cell_phone, bio')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => { if (data) setProfileData(data as any); });
  }, [user]);

  const handleEmailClientChange = (value: string) => {
    const client = value as EmailClient;
    setEmailClient(client);
    setEmailClientPreference(client);
  };

  const buildCostRows = () => {
    const rows = [
      { label: "Selling Price", amount: closingCosts.sellingPrice },
      { label: "1st Mortgage", amount: closingCosts.firstMortgage },
      { label: "2nd Mortgage", amount: closingCosts.secondMortgage },
      { label: "Buyer Closing Cost", amount: closingCosts.buyerClosingCost },
      { label: "Taxes 1st Half 2025", amount: closingCosts.taxesFirstHalf },
      { label: "Taxes 2nd Half 2025", amount: closingCosts.taxesSecondHalf },
      { label: "Taxes Due for Year 2026", amount: closingCosts.taxesDueForYear },
      { label: `Listing Agent Commission (${propertyData.listingAgentCommission}%)`, amount: closingCosts.listingAgentCommission },
      { label: `Buyer Agent Commission (${propertyData.buyerAgentCommission}%)`, amount: closingCosts.buyerAgentCommission },
      { label: "County Conveyance Fee", amount: closingCosts.countyConveyanceFee },
      { label: `Home Warranty${closingCosts.homeWarrantyCompany ? ` - ${closingCosts.homeWarrantyCompany}` : ''}`, amount: closingCosts.homeWarranty },
      { label: "Title Examination", amount: closingCosts.titleExamination },
      { label: "Title Settlement", amount: closingCosts.titleSettlement },
      { label: "Closing Fee", amount: closingCosts.closingFee },
      { label: "Deed Preparation", amount: closingCosts.deedPreparation },
      { label: "Overnight Fee", amount: closingCosts.overnightFee },
      { label: "Recording Fee", amount: closingCosts.recordingFee },
      { label: "Survey Coverage", amount: closingCosts.surveyCoverage },
      { label: "Admin Fee", amount: closingCosts.adminFee },
      { label: "Title Insurance", amount: closingCosts.titleInsurance },
    ];
    return rows;
  };

  const imageUrlToBase64 = async (url: string): Promise<string> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const getEmailPayload = async () => {
    const clientFirstNames = propertyData.name
      ? propertyData.name.split(/\s*[&,]\s*/).map((n: string) => n.split(' ')[0]).join(' & ')
      : 'there';

    let logoBase64 = '';
    try {
      logoBase64 = await imageUrlToBase64(logo);
    } catch (e) {
      console.warn('Failed to convert logo to base64:', e);
    }

    return {
      to_email: recipientEmail,
      from_name: profileData?.full_name || "Agent",
      reply_to: profileData?.preferred_email || profileData?.email || "",
      client_name: propertyData.name || "Client",
      street_address: propertyData.streetAddress,
      city: propertyData.city,
      state: propertyData.state,
      zip: propertyData.zip,
      closing_date: propertyData.closingDate || null,
      cost_rows: buildCostRows(),
      estimated_net: closingCosts.estimatedNet,
      logo_url: logoBase64,
      client_first_names: clientFirstNames,
      agent_first_name: profileData?.first_name || profileData?.full_name?.split(' ')[0] || '',
      agent_full_name: profileData?.full_name || '',
      agent_phone: profileData?.cell_phone || '',
      agent_email: profileData?.preferred_email || profileData?.email || '',
      agent_bio: profileData?.bio || '',
      intro_text: introText,
      closing_text: closingText,
    };
  };

  const handleOpenEmailPreview = async () => {
    setEmailDialogOpen(true);
    setEmailLoading(true);
    setRecipientEmail(propertyData.sellerEmail || "");

    try {
      const payload = { ...(await getEmailPayload()), preview_only: true };
      const { data, error } = await supabase.functions.invoke('send-estimated-net-email', {
        body: payload,
      });

      if (error) throw error;
      setEmailPreviewHtml(data.html || "");
    } catch (err: any) {
      console.error("Preview error:", err);
      toast({ title: "Failed to load preview", description: err.message, variant: "destructive" });
      setEmailDialogOpen(false);
    } finally {
      setEmailLoading(false);
    }
  };

  const handleSendEmail = async () => {
    if (!recipientEmail) {
      toast({ title: "Email required", description: "Please enter a recipient email address", variant: "destructive" });
      return;
    }

    setEmailSending(true);
    try {
      const payload = { ...(await getEmailPayload()), to_email: recipientEmail };
      const { data, error } = await supabase.functions.invoke('send-estimated-net-email', {
        body: payload,
      });

      if (error) throw error;
      toast({ title: "Email sent!", description: `Estimated Net sent to ${recipientEmail}` });
      setEmailDialogOpen(false);
    } catch (err: any) {
      console.error("Send error:", err);
      toast({ title: "Failed to send email", description: err.message, variant: "destructive" });
    } finally {
      setEmailSending(false);
    }
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
    pdf.save(`Estimated Net - ${propertyData.streetAddress}.pdf`);
  };

  const handleCopyToClipboard = async () => {
    const content = document.getElementById('closing-costs-content');
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

      const subject = `Estimated Net - ${propertyData.streetAddress}`;
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

  const CostRow = ({ label, amount, isTotal = false }: { label: string; amount: number; isTotal?: boolean }) => (
    <div className={`flex justify-between py-2 cost-row ${isTotal ? 'border-t-2 border-primary font-bold text-lg' : 'border-b border-border'}`}>
      <span className={isTotal ? 'text-foreground' : 'text-foreground'}>{label}</span>
      <span className={isTotal ? 'text-green-600' : 'text-foreground'}>{formatCurrency(amount)}</span>
    </div>
  );

  const navigationItems = [
    { label: "Back", icon: ArrowLeft, onClick: onBack },
    { label: "Back to Property Info", icon: ArrowLeft, onClick: () => onEdit(propertyId) },
    { label: "My Properties", icon: List, onClick: onBack },
    { label: "Estimated Net", icon: DollarSign, onClick: () => {}, active: true },
    { label: "Offer Summary", icon: ClipboardList, onClick: () => onNavigate('offer-summary') },
    { label: "Offer Letter", icon: Mail, onClick: () => onNavigate('offer-letter') },
    { label: "Important Dates Letter", icon: Calendar, onClick: () => onNavigate('important-dates') },
    { label: "Title Letter", icon: Mail, onClick: () => onNavigate('title-letter') },
    { label: "Agent Letter", icon: Mail, onClick: () => onNavigate('agent-letter') },
    { label: "Request to Remedy", icon: FileText, onClick: () => onNavigate('request-to-remedy') },
    { label: "Settlement Statement", icon: FileText, onClick: () => onNavigate('settlement-statement') },
  ];

  return (
    <>
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
      <div className="flex-1 py-4 px-6 overflow-auto">
        {/* Action Buttons - Top Right */}
        <div className="flex justify-end gap-2 mb-4 print:hidden">
          <Button onClick={handleOpenEmailPreview} size="lg" className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Mail className="mr-2 h-4 w-4" />
            Email
          </Button>
          <Button onClick={handleCopyToClipboard} size="lg" className="copy-email-btn bg-emerald-600 hover:bg-emerald-700 text-white">
            <Copy className="mr-2 h-4 w-4" />
            Copy & Email
          </Button>
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
            <div className="flex items-center justify-between mb-8 header-section">
              <div className="flex items-center gap-3">
                <img src={logo} alt="Sell for 1 Percent" className="h-16 w-auto" />
                <div>
                  <h1 className="text-3xl font-bold text-foreground">Estimated Net</h1>
                  <p className="text-muted-foreground">A Breakdown of Your Expenses</p>
                </div>
              </div>
            </div>

            <Card className="p-6 mb-6 card-content">
              <div className="mb-6 property-info">
                <h2 className="text-xl font-semibold text-foreground mb-1">{propertyData.name}</h2>
                <p className="text-muted-foreground">{propertyData.streetAddress}</p>
                <p className="text-muted-foreground">{propertyData.city}, {propertyData.state} {propertyData.zip}</p>
              </div>

              <div className="mb-6">
                <textarea
                  className="w-full text-foreground bg-background border border-border rounded-md p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={9}
                  value={introText}
                  onChange={(e) => setIntroText(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                {propertyData.closingDate && (
                  <p className="text-sm font-semibold text-foreground text-right pb-1">
                    Estimated Closing Date: {new Date(propertyData.closingDate + 'T00:00:00').toLocaleDateString()}
                  </p>
                )}
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

              {/* Closing & Agent Signature */}
              <div className="mt-8 pt-4">
                <textarea
                  className="w-full text-foreground bg-background border border-border rounded-md p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring mb-2"
                  rows={3}
                  value={closingText}
                  onChange={(e) => setClosingText(e.target.value)}
                />
                <p className="text-foreground mb-1">Thanks</p>
                <p className="text-foreground mb-3">{profileData?.first_name || profileData?.full_name?.split(' ')[0] || 'Your Agent'}</p>
                {profileData?.bio ? (
                  <div
                    className="text-foreground [&_img]:max-w-full"
                    dangerouslySetInnerHTML={{
                      __html: /<[a-z][\s\S]*>/i.test(profileData.bio)
                        ? profileData.bio.replace(/<P>/gi, '<br><br>')
                        : `<p style="white-space: pre-line;">${profileData.bio}</p>`
                    }}
                  />
                ) : (
                  <div className="text-foreground">
                    <p>{profileData?.full_name || ''}</p>
                    {profileData?.cell_phone && <p>cell: {profileData.cell_phone}</p>}
                    {(profileData?.preferred_email || profileData?.email) && (
                      <p>email: {profileData.preferred_email || profileData.email}</p>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>

    {/* Email Preview Dialog */}
    <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Email Preview - Estimated Net</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label htmlFor="recipient-email">Recipient Email</Label>
              <Input
                id="recipient-email"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="seller@example.com"
              />
            </div>
            <Button
              onClick={handleSendEmail}
              disabled={emailSending || !recipientEmail}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {emailSending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {emailSending ? "Sending..." : "Send Email"}
            </Button>
          </div>

          {emailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden bg-muted/30">
              <iframe
                srcDoc={emailPreviewHtml}
                className="w-full min-h-[600px] bg-white"
                title="Email Preview"
                sandbox="allow-same-origin"
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default ClosingCostsView;
