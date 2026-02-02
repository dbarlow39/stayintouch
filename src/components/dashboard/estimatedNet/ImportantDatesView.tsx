import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PropertyData } from "@/types/estimatedNet";
import { ArrowLeft, List, Mail, Calendar, FileText, Copy, DollarSign, ClipboardList, Settings, Home, Phone, Search, Wrench, Eye, Key, Wallet, MapPin } from "lucide-react";
import { EmailClient, EMAIL_CLIENT_OPTIONS, getEmailClientPreference, setEmailClientPreference, openEmailClient } from "@/utils/emailClientUtils";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.jpg";

interface ImportantDatesViewProps {
  propertyData: PropertyData;
  propertyId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
  onNavigate: (view: string) => void;
}

const ImportantDatesView = ({ propertyData, propertyId, onBack, onEdit, onNavigate }: ImportantDatesViewProps) => {
  const { toast } = useToast();
  const [emailClient, setEmailClient] = useState<EmailClient>(getEmailClientPreference);

  const handleEmailClientChange = (value: string) => {
    const client = value as EmailClient;
    setEmailClient(client);
    setEmailClientPreference(client);
  };

  // Extract first names
  const ownerFirstName = propertyData.name.split(' ')[0];
  const listingAgentFirstName = propertyData.listingAgentName?.split(' ')[0] || 'Dave';

  const calculateDate = (baseDate: string, daysToAdd: number): string => {
    let date: Date;
    if (baseDate) {
      // Parse as local date to avoid timezone shifts
      const [year, month, day] = baseDate.split('-');
      date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    } else {
      date = new Date();
    }
    date.setDate(date.getDate() + daysToAdd);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return '';
    const [year, month, day] = dateString.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const inspectionDeadline = calculateDate(propertyData.inContract || '', propertyData.inspectionDays || 0);
  const remedyDeadline = calculateDate(propertyData.inContract || '', (propertyData.inspectionDays || 0) + (propertyData.remedyPeriodDays || 0));
  const utilitiesCallDate = calculateDate(propertyData.closingDate || '', -10);
  const utilitiesShutoffDate = calculateDate(propertyData.closingDate || '', 1);
  const changeAddressDate = calculateDate(propertyData.closingDate || '', -10);

  const handleCopyToClipboard = async () => {
    const content = document.getElementById('important-dates-content');
    if (!content) return;

    try {
      const clonedContent = content.cloneNode(true) as HTMLElement;
      
      // Remove print:hidden elements
      clonedContent.querySelectorAll('.print\\:hidden').forEach((el) => el.remove());
      
      // Find the logo image and convert to base64 at reduced size
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
        description: "The letter has been copied. Opening email client...",
      });

      const sellerEmail = propertyData.sellerEmail || '';
      const subject = `Important Dates for Your Property Sale - ${propertyData.streetAddress}`;
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
      onClick: () => {},
      active: true,
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
      icon: FileText,
      onClick: () => onNavigate('settlement-statement'),
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
        {/* Action Button - Top Right */}
        <div className="flex justify-end mb-4 print:hidden">
          <Button onClick={handleCopyToClipboard} className="gap-2 bg-rose-500 hover:bg-rose-600 text-white">
            <Copy className="h-4 w-4" />
            Copy & Email
          </Button>
        </div>
        
        <div className="max-w-4xl">
          <div id="important-dates-content" className="bg-card p-8 rounded-lg shadow-sm space-y-6">
            <div className="flex items-center gap-3 mb-8 border-b pb-6">
              <img src={logo} alt="Sell for 1 Percent" className="h-16 w-auto" />
              <div>
                <h1 className="text-3xl font-bold text-foreground">Important Dates</h1>
                <p className="text-muted-foreground">Keep Track of Your Closing Timeline</p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-lg">Hi {ownerFirstName},</p>
              
              <p>
                Congratulations on your property going into contract, it is always an exciting time! I have attached a copy of the signed offer to this email for your files.
              </p>
              
              <p>
                Most of the heavy lifting has been completed but there are still several steps for us to work through to get to a successful closing. As we move along there are a number of things to keep in mind in which I will touch on below.
              </p>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Calendar className="h-6 w-6 text-primary" />
                Here are the important dates you should put on your calendar;
              </h2>
              
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <tbody className="divide-y">
                    <tr className="hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium">Closing Date:</td>
                      <td className="px-4 py-3">{formatDate(propertyData.closingDate || '')}</td>
                    </tr>
                    <tr className="hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium">Possession given to buyer:</td>
                      <td className="px-4 py-3">{propertyData.possession ? formatDate(propertyData.possession) : formatDate(propertyData.closingDate || '')}</td>
                    </tr>
                    <tr className="hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium">Home Inspection to be completed by:</td>
                      <td className="px-4 py-3">{propertyData.inspectionDays === 0 ? 'Buyer Waived' : inspectionDeadline}</td>
                    </tr>
                    <tr className="hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium">Buyers Request to Remedy to be completed by:</td>
                      <td className="px-4 py-3">{propertyData.remedyPeriodDays === 0 ? 'Buyer Waived' : remedyDeadline}</td>
                    </tr>
                    <tr className="hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium">Call to schedule final readings for your utilities:</td>
                      <td className="px-4 py-3">{utilitiesCallDate}</td>
                    </tr>
                    <tr className="hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium">Schedule utilities to be taken out of your name as of:</td>
                      <td className="px-4 py-3">{utilitiesShutoffDate}</td>
                    </tr>
                    <tr className="hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium">Change of Address:</td>
                      <td className="px-4 py-3">{changeAddressDate}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Home className="h-6 w-6 text-primary" />
                TITLE COMPANY:
              </h2>
              <p>
                We can send your paperwork to any title company you prefer. If you do not have a preference, I will send your paperwork to Caliber Title can close your home anywhere you would prefer, even come to your home to do so. Title insurance is regulated by State Law and overseen by the State Insurance Board who regulates most of the fees any Title company can charge. Our company does have a business relationship with Caliber Title but the fees are the same as any other title company in the state of Ohio. Beyond that I know once I send the paperwork to Caliber Title we don't have to worry about things getting done, Caliber Title has a team dedicated to our closings so we know every T gets crossed and every I gets dotted. Let me know if you prefer another Title company and if not I will forward your paperwork to Caliber Title. You will next hear from either Kathy or Barb who will want to get your mortgage information to order a payoff for the closing.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Phone className="h-6 w-6 text-primary" />
                Expect a Phone Call or Email from the Title Company:
              </h2>
              <p>
                You will be contacted by someone from Caliber Title. Typically, it will be Kameron Faulkner or Kiyla Reed with Caliber Title/Title First via email or a phone call who will then begin the process of getting the deal closed. They will need to get your current mortgage company, account number and have you sign an authorization letter to request the info from your lender. Most likely you will be sent a secure email with a secure link that will take you to a secure portal to fill out the information. If you should have any questions please feel free to give me a call.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Search className="h-6 w-6 text-primary" />
                HOME INSPECTION:
              </h2>
              <p>
                The next step will be the buyers scheduling their home inspection, this will be scheduled through our showing service and may look like a showing request, but you will notice the length of time for the request will be 2 to 3 hours long. We would recommend you treat the home inspection like you would a showing and vacate the home to allow the home inspector, agent and buyer to inspect your property. It is very likely the buyer and their agent will show up for the home inspection, we highly recommend to all buyers to go to the home inspection to be educated about the home, things like what light switches turn on what, how to operate the appliances, how to change the furnace filter and so forth. In addition if any issues come up the inspector can show and explain what is going on versus the buyer just reading a black and white version of the report, by being there it really does help the whole process.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Wrench className="h-6 w-6 text-primary" />
                BUYERS REQUEST TO REMEDY
              </h2>
              <p>
                Once the inspection is completed the buyer most likely will be sending over what is called the Buyer's request to remedy. These are items the buyer have identified as a result of the home inspection that they would like you to address. Every home inspector is different, every agent is different, and every buyer is different. I say this because what might be important to you may not be important to the buyer and vice versa, so don't worry about the home inspection or the remedy request until they send over their request. Once we come to terms on the request to remedy by either agreeing to make repairs as requested or I normally recommend offering some sort of cash compensation so you don't have to do any work at all prior to closing. If you do agree to make repairs they only need to be made prior to the buyers final walk through which happens anywhere from 1 to 3 days prior to the closing date.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <DollarSign className="h-6 w-6 text-primary" />
                BANKS APPRAISAL
              </h2>
              <p>
                An appraisal will be ordered by the buyer's lender, if the buyer is getting a loan, if the buyer is paying cash there will be no appraisal. The appraiser will need access to your home to inspect the property and take photos. This will be scheduled through our showing service and will look like a traditional showing. Keep in mind these could happen at any time after the home goes into contract. Please treat this like a traditional showing and just vacate the property during the appointment. I am occasionally asked if I will be attending the appraisal and in most cases I will not be going. The listing broker has no say in the appraisal, the lender and the appraiser are the two parties involved in the appraisal. My presence at the appointment serves no purpose unless the location needs me to provide access for some reason.
              </p>
              <p>
                After we get through the home inspection and request to remedy process the buyer's lender will then order the appraisal of your home. Again this will be scheduled through our showing service but this time the appraiser will only be in your house for about 20 minutes and it is not necessary for you leave if you don't wish. Once the appraiser has completed the walk through of your house it normally takes anywhere from 5 to 7 days for the appraisal to be completed and returned to the bank. 90% of the time the appraisal comes back for the value of the purchase price but if it does come back for less then the lender will make contact with me, otherwise the lender will not make any contact and we will proceed to closing. BTW, normally the appraisal is not shared with either the buyer or seller unless it comes in for less.
              </p>
              <p>
                Once we get through the home inspection, the request to remedy and the appraisal we are 95% of the way there, the next step will be for the lender to issue at least 3 days prior to closing what is known as the Closing Disclosure or "CD". By law the buyer has to take at least 3 days to review the closing documents, once this CD is issued we are 99.9% certain the closing will take place as scheduled, otherwise there may be a delay. But rest assured we will stay on top of this entire process.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Eye className="h-6 w-6 text-primary" />
                FINAL WALK THROUGH
              </h2>
              <p>
                The buyers will be coming to the home one final time, this is typically scheduled 24 to 48 hours prior to closing. This is the buyer's opportunity to ensure everything is just as it was when they submitted the offer, minus whatever repairs or improvements had been made. We ask that you leave the home vacant during this time but that the utilities all remain on so the buyer can make sure all the lights and switches work. This usually only lasts 30 minutes to an hour.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Key className="h-6 w-6 text-primary" />
                CLOSING
              </h2>
              <p>
                Due to Covid-19 we are scheduling separate closings for the buyer and seller. You can sign anytime up to and including the day of closing. Ohio Real Title's main office is located near Polaris or they most often will come to you to make it convenient for you. They can come to your home, your office or we have been known to close them at the local Starbucks or Panera. Just let me know what day, time and location works best for you and we'll get it scheduled.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Wallet className="h-6 w-6 text-primary" />
                YOUR FUNDS
              </h2>
              <p>
                Once the closing has been completed, all sides have signed, the buyers lender will release the funds to the title company at which point your funds will become available. You can receive your funds in several different ways. First, you can wait at the title company for a check to be issued, normally available as soon as the lender makes the funds available. Second, you can have your funds overnighted to your address. Please be aware that your bank may put a 5 to 10 day hold on funds deposited by check so be sure to check with your bank about their policies. The third way you can have your funds wired directly to your bank account. By wiring your funds they will be available immediately upon deposit. If you choose to have the funds wired to your bank account, you will want to check with your bank to get their wiring instructions. Normally your check will have the routing number and your account number on it but check with your bank to make sure that information is correct.
              </p>
              <p>
                In the mean time I always suggest you go ahead and make your plans to move. Now is the time to start packing and schedule your movers. Don't worry about packing prior to the home inspection and appraisal, obviously the buyer and appraiser know you are moving so packing is a good sign. At about {utilitiesCallDate} please make sure you call your utility companies to schedule for the final readings. You should keep the utilities in your name until the day after you give the buyer possession.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <MapPin className="h-6 w-6 text-primary" />
                Change of Address:
              </h2>
              <p>
                About 1 week prior to closing be sure to go online and change your postal address. You can get started with this link; https://moversguide.usps.com Also, don't forget to change your address on Amazon, Walmart or any other service you use to buy product and have it delivered to your home. I have seen lot's of packages show up at the old address just because we forget sometimes. . .
              </p>
            </div>

            <div className="space-y-3">
              <p>
                There is a lot of information here, you might go ahead and print this email off and keep for your reference but if you have any questions please feel to give me a call.
              </p>
              <p>
                Again, congratulations!
              </p>
              <p className="font-semibold">
                {listingAgentFirstName}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportantDatesView;
