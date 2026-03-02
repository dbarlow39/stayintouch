import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PropertyData } from "@/types/estimatedNet";
import { ArrowLeft, List, Mail, Calendar, FileText, Copy, DollarSign, ClipboardList, Settings, Loader2, Send, Paperclip, X } from "lucide-react";
import { EmailClient, EMAIL_CLIENT_OPTIONS, getEmailClientPreference, setEmailClientPreference, openEmailClient } from "@/utils/emailClientUtils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
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
  const [emailClient, setEmailClient] = useState<EmailClient>(getEmailClientPreference);
  const [agentFirstName, setAgentFirstName] = useState<string>("");
  const [profileData, setProfileData] = useState<{
    full_name: string; preferred_email: string; email: string;
    first_name: string | null; cell_phone: string | null; bio: string | null;
  } | null>(null);

  // Email dialog state
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailPreviewHtml, setEmailPreviewHtml] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState(propertyData.sellerEmail || "");

  // File attachments state
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extract first name from seller
  const ownerFirstName = propertyData.name.split(' ')[0];

  const defaultLetterText = useMemo(() => {
    return `Hey ${ownerFirstName},

We have received an offer for your property. I have attached a summary of the offer to make it easier to understand the important terms, an estimated net sheet showing all of the numbers and the bottom line for you after everything is paid and a copy of the offer itself.

We can respond in 1 of 3 ways, (1) you can say I'll take it. . . (2) You can decline to respond altogether or (3) you can send over a counter offer with terms acceptable to you. It is my experience the buyer's first offer is not their best offer, sometimes they'll go fishing just to see what you are or are not willing to take. I would say put together a reasonable counter offer and let's see what we can do with this.

Also be sure to check the items listed in Paragraph 5 to make sure you are OK with leaving those items. Otherwise I think everything else looks good to me.

The buyer was asking for a response of some kind before ${propertyData.respondToOfferBy || '[Date not specified]'}.

Take a look and let me know your thoughts.

Thanks
${agentFirstName}`;
  }, [ownerFirstName, propertyData.respondToOfferBy, agentFirstName]);

  const [letterText, setLetterText] = useState<string>("");
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    const fetchAgentProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, full_name, preferred_email, email, cell_phone, bio')
          .eq('id', user.id)
          .single();
        if (profile) {
          setProfileData(profile);
          if (profile.first_name) {
            setAgentFirstName(profile.first_name);
          }
        }
      }
    };
    fetchAgentProfile();
  }, []);

  const EMAIL_LOGO_WIDTH_PX = 144;

  const resizeImageForEmail = async (imageUrl: string, targetWidth: number): Promise<string> => {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      if (!imageUrl.startsWith('data:') && !imageUrl.startsWith('blob:')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const naturalWidth = img.naturalWidth || img.width;
        const naturalHeight = img.naturalHeight || img.height;
        if (!naturalWidth || !naturalHeight) {
          reject(new Error('Invalid logo dimensions'));
          return;
        }
        const scale = targetWidth / naturalWidth;
        const targetHeight = Math.max(1, Math.round(naturalHeight * scale));
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Failed to load logo'));
      img.src = imageUrl;
    });
  };

  const handleEmailClientChange = (value: string) => {
    const client = value as EmailClient;
    setEmailClient(client);
    setEmailClientPreference(client);
  };

  // Initialize letter text after agent name loads
  useEffect(() => {
    if (!hasInitialized && agentFirstName) {
      setLetterText(defaultLetterText);
      setHasInitialized(true);
    }
  }, [agentFirstName, defaultLetterText, hasInitialized]);

  // Also initialize if no agent name after a delay
  useEffect(() => {
    if (!hasInitialized) {
      const timer = setTimeout(() => {
        if (!hasInitialized) {
          setLetterText(defaultLetterText);
          setHasInitialized(true);
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [hasInitialized, defaultLetterText]);

  // File attachment helpers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles = Array.from(files);
    const totalSize = [...attachedFiles, ...newFiles].reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 20 * 1024 * 1024) {
      toast({ title: "Files too large", description: "Total attachments must be under 20MB", variant: "destructive" });
      return;
    }
    setAttachedFiles(prev => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const filesToBase64 = async (files: File[]): Promise<{ filename: string; content: string; }[]> => {
    return Promise.all(files.map(file => new Promise<{ filename: string; content: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve({ filename: file.name, content: base64 });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    })));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Email handlers
  const handleOpenEmailPreview = async () => {
    setEmailDialogOpen(true);
    setEmailLoading(true);
    setRecipientEmail(propertyData.sellerEmail || "");

    try {
      const payload = {
        to_email: "",
        from_name: profileData?.full_name || "Agent",
        reply_to: profileData?.preferred_email || profileData?.email || "",
        client_name: propertyData.name || "Client",
        street_address: propertyData.streetAddress,
        letter_text: letterText,
        agent_first_name: profileData?.first_name || profileData?.full_name?.split(' ')[0] || '',
        agent_full_name: profileData?.full_name || '',
        agent_phone: profileData?.cell_phone || '',
        agent_email: profileData?.preferred_email || profileData?.email || '',
        agent_bio: profileData?.bio || '',
        preview_only: true,
      };
      const { data, error } = await supabase.functions.invoke('send-offer-letter-email', {
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
      const attachments = attachedFiles.length > 0 ? await filesToBase64(attachedFiles) : [];
      const payload = {
        to_email: recipientEmail,
        from_name: profileData?.full_name || "Agent",
        reply_to: profileData?.preferred_email || profileData?.email || "",
        client_name: propertyData.name || "Client",
        street_address: propertyData.streetAddress,
        letter_text: letterText,
        agent_first_name: profileData?.first_name || profileData?.full_name?.split(' ')[0] || '',
        agent_full_name: profileData?.full_name || '',
        agent_phone: profileData?.cell_phone || '',
        agent_email: profileData?.preferred_email || profileData?.email || '',
        agent_bio: profileData?.bio || '',
        attachments,
      };
      const { data, error } = await supabase.functions.invoke('send-offer-letter-email', {
        body: payload,
      });
      if (error) throw error;
      toast({ title: "Email sent!", description: `Offer letter sent to ${recipientEmail}` });
      setEmailDialogOpen(false);
    } catch (err: any) {
      console.error("Send error:", err);
      toast({ title: "Failed to send email", description: err.message, variant: "destructive" });
    } finally {
      setEmailSending(false);
    }
  };

  const handleCopyToClipboard = async () => {
    const content = document.getElementById('offer-letter-content');
    if (!content) return;

    try {
      const clonedContent = content.cloneNode(true) as HTMLElement;
      
      const logoImg = clonedContent.querySelector('img') as HTMLImageElement;
      if (logoImg) {
        const resizedDataUrl = await resizeImageForEmail(logoImg.src, EMAIL_LOGO_WIDTH_PX);
        logoImg.src = resizedDataUrl;
        logoImg.removeAttribute('class');
        logoImg.setAttribute('width', String(EMAIL_LOGO_WIDTH_PX));
        logoImg.style.cssText = [
          `width:${EMAIL_LOGO_WIDTH_PX}px !important`,
          `max-width:${EMAIL_LOGO_WIDTH_PX}px !important`,
          `height:auto !important`,
          `display:block`,
          `margin:0`,
        ].join(';');
      }
      
      const noPdfElements = clonedContent.querySelectorAll('.print\\:hidden');
      noPdfElements.forEach(el => el.remove());
      
      const logoContainer = clonedContent.querySelector('.flex.items-center.gap-3');
      if (logoContainer) {
        (logoContainer as HTMLElement).style.cssText = 'display: flex; align-items: center; gap: 12px;';
        const logoInContainer = logoContainer.querySelector('img');
        if (logoInContainer) {
          (logoInContainer as HTMLElement).style.cssText = [
            `display:block`, `margin:0`, `flex-shrink:0`,
            `width:${EMAIL_LOGO_WIDTH_PX}px !important`,
            `max-width:${EMAIL_LOGO_WIDTH_PX}px !important`,
            `height:auto !important`,
          ].join(';');
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
        description: "The letter with formatted header has been copied. Opening email client...",
      });

      const sellerEmail = propertyData.sellerEmail || '';
      const subject = `We have received an offer for ${propertyData.streetAddress}`;
      openEmailClient(sellerEmail, emailClient, subject);
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
    { label: "Back", icon: ArrowLeft, onClick: onBack },
    { label: "Back to Property Info", icon: ArrowLeft, onClick: () => onEdit(propertyId) },
    { label: "My Properties", icon: List, onClick: onBack },
    { label: "Estimated Net", icon: DollarSign, onClick: () => onNavigate('results') },
    { label: "Offer Summary", icon: ClipboardList, onClick: () => onNavigate('offer-summary') },
    { label: "Offer Letter", icon: Mail, onClick: () => {}, active: true },
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
          <Button onClick={handleOpenEmailPreview} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
            <Mail className="h-4 w-4" />
            Email
          </Button>
          <Button onClick={handleCopyToClipboard} variant="outline" className="gap-2">
            <Copy className="h-4 w-4" />
            Copy & Email
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
              <textarea
                className="w-full text-foreground bg-background border border-border rounded-md p-4 text-base leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-ring font-sans"
                rows={22}
                value={letterText}
                onChange={(e) => setLetterText(e.target.value)}
              />
            </Card>

              <p className="text-sm text-muted-foreground mt-4 italic">Attachments can be added on the next page</p>
          </div>
        </div>
      </div>
    </div>

    {/* Email Preview Dialog */}
    <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Email Preview - Offer Letter</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label htmlFor="offer-recipient-email">Recipient Email</Label>
              <Input
                id="offer-recipient-email"
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

          {/* File Attachments */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Label>Attachments</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1 h-7 text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-3 w-3" />
                Attach Files
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.txt,.csv"
                onChange={handleFileSelect}
              />
            </div>
            {attachedFiles.length > 0 && (
              <div className="space-y-1">
                {attachedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1">
                    <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">{file.name}</span>
                    <span className="text-muted-foreground text-xs shrink-0">{formatFileSize(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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

export default OfferLetterView;
