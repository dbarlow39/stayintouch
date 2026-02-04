import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { PropertyData } from "@/types/estimatedNet";
import { format, addDays, subDays } from "date-fns";
import {
  ArrowLeft,
  List,
  DollarSign,
  ClipboardList,
  Mail,
  Calendar,
  FileText,
  Edit,
  Bell,
  Send,
} from "lucide-react";

interface NoticesViewProps {
  propertyData: PropertyData;
  propertyId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
  onNavigate: (view: string) => void;
}

type NoticeType = 
  | "deposit-received"
  | "home-inspection-scheduled"
  | "loan-application"
  | "title-commitment-received"
  | "appraisal-ordered"
  | "loan-approved"
  | "clear-to-close"
  | "hud-settlement-statement";

// Helper to parse date string as local date
const parseLocalDate = (dateString: string): Date | null => {
  if (!dateString) return null;
  const [year, month, day] = dateString.split('-');
  if (!year || !month || !day) return null;
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
};

// Helper to format date for display
const formatDueDate = (date: Date | null): string => {
  if (!date) return "Date not set";
  return format(date, "MM/dd/yyyy");
};

const NoticesView = ({
  propertyData,
  propertyId,
  onBack,
  onEdit,
  onNavigate,
}: NoticesViewProps) => {
  const [selectedNotice, setSelectedNotice] = useState<NoticeType | null>(null);

  // Calculate due dates based on property data
  const calculateDueDates = (): { value: NoticeType; label: string; dueDate: string }[] => {
    const inContractDate = parseLocalDate(propertyData.inContract);
    const closingDate = parseLocalDate(propertyData.closingDate);
    
    // Home Inspection: inContract + inspectionDays
    const inspectionDue = inContractDate && propertyData.inspectionDays
      ? formatDueDate(addDays(inContractDate, propertyData.inspectionDays))
      : "Date not set";
    
    // Deposit: Use depositCollection text or calculate if it contains days
    let depositDue = propertyData.depositCollection || "Date not set";
    if (propertyData.depositCollection && inContractDate) {
      // Try to extract days from text like "Within 3 Days of Acceptance"
      const daysMatch = propertyData.depositCollection.match(/(\d+)\s*days?/i);
      if (daysMatch) {
        depositDue = formatDueDate(addDays(inContractDate, parseInt(daysMatch[1])));
      }
    }
    
    // Loan Application: inContract + loanAppTimeFrame days
    const loanApplicationDue = inContractDate && propertyData.loanAppTimeFrame
      ? formatDueDate(addDays(inContractDate, parseInt(propertyData.loanAppTimeFrame) || 7))
      : "Date not set";
    
    // Appraisal Ordered: 14 days before closing
    const appraisalDue = closingDate
      ? formatDueDate(subDays(closingDate, 14))
      : "Date not set";
    
    // Title Commitment: 15 days before closing
    const titleCommitmentDue = closingDate
      ? formatDueDate(subDays(closingDate, 15))
      : "Date not set";
    
    // Loan Approved: inContract + loanCommitment days
    const loanApprovedDue = inContractDate && propertyData.loanCommitment
      ? formatDueDate(addDays(inContractDate, parseInt(propertyData.loanCommitment) || 21))
      : "Date not set";
    
    // Clear to Close: 4 days before closing
    const clearToCloseDue = closingDate
      ? formatDueDate(subDays(closingDate, 4))
      : "Date not set";
    
    // HUD Settlement Statement: 2 days before closing
    const hudSettlementDue = closingDate
      ? formatDueDate(subDays(closingDate, 2))
      : "Date not set";

    return [
      { value: "deposit-received", label: "Deposit Received", dueDate: depositDue },
      { value: "home-inspection-scheduled", label: "Home Inspection Scheduled", dueDate: inspectionDue },
      { value: "loan-application", label: "Loan Application", dueDate: loanApplicationDue },
      { value: "title-commitment-received", label: "Title Commitment Received", dueDate: titleCommitmentDue },
      { value: "appraisal-ordered", label: "Appraisal Ordered", dueDate: appraisalDue },
      { value: "loan-approved", label: "Loan Approved", dueDate: loanApprovedDue },
      { value: "clear-to-close", label: "Clear to Close", dueDate: clearToCloseDue },
      { value: "hud-settlement-statement", label: "HUD Settlement Statement", dueDate: hudSettlementDue },
    ];
  };

  const noticeOptions = calculateDueDates();

  const navigationItems = [
    {
      label: "Back",
      icon: ArrowLeft,
      onClick: onBack,
    },
    {
      label: "My Properties",
      icon: List,
      onClick: onBack,
    },
    {
      label: "Estimated Net",
      icon: DollarSign,
      onClick: () => onNavigate("results"),
    },
    {
      label: "Offer Summary",
      icon: ClipboardList,
      onClick: () => onNavigate("offer-summary"),
    },
    {
      label: "Offer Letter",
      icon: Mail,
      onClick: () => onNavigate("offer-letter"),
    },
    {
      label: "Important Dates Letter",
      icon: Calendar,
      onClick: () => onNavigate("important-dates"),
    },
    {
      label: "Title Letter",
      icon: Mail,
      onClick: () => onNavigate("title-letter"),
    },
    {
      label: "Agent Letter",
      icon: Mail,
      onClick: () => onNavigate("agent-letter"),
    },
    {
      label: "Request to Remedy",
      icon: FileText,
      onClick: () => onNavigate("request-to-remedy"),
    },
    {
      label: "Settlement Statement",
      icon: FileText,
      onClick: () => onNavigate("settlement-statement"),
    },
    {
      label: "Notices",
      icon: Bell,
      onClick: () => {},
      isActive: true,
    },
    {
      label: "Edit Property",
      icon: Edit,
      onClick: () => onEdit(propertyId),
    },
  ];

  const handleSendNotice = () => {
    // Placeholder for future email sending logic
    console.log("Sending notice:", selectedNotice);
  };

  return (
    <div className="flex gap-6">
      {/* Left Navigation Sidebar */}
      <div className="w-48 flex-shrink-0">
        <div className="space-y-1">
          {navigationItems.map((item, index) => (
            <Button
              key={index}
              variant={item.isActive ? "secondary" : "ghost"}
              size="sm"
              className={`w-full justify-start text-left ${
                item.isActive ? "bg-secondary text-secondary-foreground" : ""
              }`}
              onClick={item.onClick}
            >
              <item.icon className="mr-2 h-4 w-4" />
              {item.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              Client Notices
            </CardTitle>
            <CardDescription>
              Select a notice to send to {propertyData.name || "the client"} regarding{" "}
              {propertyData.streetAddress}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <RadioGroup
              value={selectedNotice || ""}
              onValueChange={(value) => setSelectedNotice(value as NoticeType)}
              className="space-y-3"
            >
              {noticeOptions.map((option) => (
                <div
                  key={option.value}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value={option.value} id={option.value} />
                    <Label
                      htmlFor={option.value}
                      className="cursor-pointer font-medium"
                    >
                      {option.label}
                    </Label>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    Due: {option.dueDate}
                  </span>
                </div>
              ))}
            </RadioGroup>

            <div className="pt-4 border-t">
              <Button
                onClick={handleSendNotice}
                disabled={!selectedNotice}
                className="bg-primary hover:bg-primary/90"
              >
                <Send className="mr-2 h-4 w-4" />
                Prepare Notice
              </Button>
              <p className="text-sm text-muted-foreground mt-2">
                Select a notice type above, then click to prepare the email.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default NoticesView;