import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { PropertyData } from "@/types/estimatedNet";
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
  | "home-inspection-scheduled"
  | "deposit-received"
  | "appraisal-ordered"
  | "title-commitment-received"
  | "loan-approved"
  | "clear-to-close";

const noticeOptions: { value: NoticeType; label: string }[] = [
  { value: "home-inspection-scheduled", label: "Home Inspection Scheduled" },
  { value: "deposit-received", label: "Deposit Received" },
  { value: "appraisal-ordered", label: "Appraisal Ordered" },
  { value: "title-commitment-received", label: "Title Commitment Received" },
  { value: "loan-approved", label: "Loan Approved" },
  { value: "clear-to-close", label: "Clear to Close" },
];

const NoticesView = ({
  propertyData,
  propertyId,
  onBack,
  onEdit,
  onNavigate,
}: NoticesViewProps) => {
  const [selectedNotice, setSelectedNotice] = useState<NoticeType | null>(null);

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
                  className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                >
                  <RadioGroupItem value={option.value} id={option.value} />
                  <Label
                    htmlFor={option.value}
                    className="flex-1 cursor-pointer font-medium"
                  >
                    {option.label}
                  </Label>
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
