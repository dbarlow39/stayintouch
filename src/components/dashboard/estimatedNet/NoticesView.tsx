import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PropertyData } from "@/types/estimatedNet";
import { format, addDays, subDays, isBefore, startOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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
  AlertTriangle,
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

interface NoticeStatus {
  notice_type: string;
  completed: boolean;
}

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

// Helper to parse displayed date back to Date object
const parseDueDate = (dueDateStr: string): Date | null => {
  if (dueDateStr === "Date not set") return null;
  const [month, day, year] = dueDateStr.split('/');
  if (!month || !day || !year) return null;
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
};

const NoticesView = ({
  propertyData,
  propertyId,
  onBack,
  onEdit,
  onNavigate,
}: NoticesViewProps) => {
  const [noticeStatuses, setNoticeStatuses] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Fetch notice statuses from database
  const fetchNoticeStatuses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('property_notice_status')
        .select('notice_type, completed')
        .eq('property_id', propertyId);

      if (error) throw error;

      const statuses: Record<string, boolean> = {};
      (data || []).forEach((status: NoticeStatus) => {
        statuses[status.notice_type] = status.completed;
      });
      setNoticeStatuses(statuses);
    } catch (error) {
      console.error('Error fetching notice statuses:', error);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    fetchNoticeStatuses();
  }, [fetchNoticeStatuses]);

  // Toggle notice completion status
  const toggleNoticeCompletion = async (noticeType: NoticeType, completed: boolean) => {
    try {
      // Optimistically update UI
      setNoticeStatuses(prev => ({ ...prev, [noticeType]: completed }));

      const { error } = await supabase
        .from('property_notice_status')
        .upsert({
          property_id: propertyId,
          notice_type: noticeType,
          completed,
          completed_at: completed ? new Date().toISOString() : null,
        }, {
          onConflict: 'property_id,notice_type'
        });

      if (error) throw error;

      toast({
        title: completed ? "Notice marked complete" : "Notice marked incomplete",
        description: `${noticeType.replace(/-/g, ' ')} status updated.`,
      });
    } catch (error) {
      // Revert on error
      setNoticeStatuses(prev => ({ ...prev, [noticeType]: !completed }));
      console.error('Error updating notice status:', error);
      toast({
        title: "Error",
        description: "Failed to update notice status.",
        variant: "destructive",
      });
    }
  };

  // Calculate due dates based on property data
  const calculateDueDates = (): { value: NoticeType; label: string; dueDate: string; dueDateObj: Date | null }[] => {
    const inContractDate = parseLocalDate(propertyData.inContract);
    const closingDate = parseLocalDate(propertyData.closingDate);
    
    // Home Inspection: inContract + inspectionDays
    const inspectionDueDate = inContractDate && propertyData.inspectionDays
      ? addDays(inContractDate, propertyData.inspectionDays)
      : null;
    
    // Deposit: Use depositCollection text or calculate if it contains days
    let depositDueDate: Date | null = null;
    if (propertyData.depositCollection && inContractDate) {
      const daysMatch = propertyData.depositCollection.match(/(\d+)\s*days?/i);
      if (daysMatch) {
        depositDueDate = addDays(inContractDate, parseInt(daysMatch[1]));
      }
    }
    
    // Loan Application: inContract + loanAppTimeFrame days
    const loanApplicationDueDate = inContractDate && propertyData.loanAppTimeFrame
      ? addDays(inContractDate, parseInt(propertyData.loanAppTimeFrame) || 7)
      : null;
    
    // Appraisal Ordered: 14 days before closing
    const appraisalDueDate = closingDate ? subDays(closingDate, 14) : null;
    
    // Title Commitment: 15 days before closing
    const titleCommitmentDueDate = closingDate ? subDays(closingDate, 15) : null;
    
    // Loan Approved: inContract + loanCommitment days
    const loanApprovedDueDate = inContractDate && propertyData.loanCommitment
      ? addDays(inContractDate, parseInt(propertyData.loanCommitment) || 21)
      : null;
    
    // Clear to Close: 4 days before closing
    const clearToCloseDueDate = closingDate ? subDays(closingDate, 4) : null;
    
    // HUD Settlement Statement: 2 days before closing
    const hudSettlementDueDate = closingDate ? subDays(closingDate, 2) : null;

    return [
      { value: "deposit-received", label: "Deposit Received", dueDate: formatDueDate(depositDueDate), dueDateObj: depositDueDate },
      { value: "home-inspection-scheduled", label: "Home Inspection Scheduled", dueDate: formatDueDate(inspectionDueDate), dueDateObj: inspectionDueDate },
      { value: "loan-application", label: "Loan Application", dueDate: formatDueDate(loanApplicationDueDate), dueDateObj: loanApplicationDueDate },
      { value: "title-commitment-received", label: "Title Commitment Received", dueDate: formatDueDate(titleCommitmentDueDate), dueDateObj: titleCommitmentDueDate },
      { value: "appraisal-ordered", label: "Appraisal Ordered", dueDate: formatDueDate(appraisalDueDate), dueDateObj: appraisalDueDate },
      { value: "loan-approved", label: "Loan Approved", dueDate: formatDueDate(loanApprovedDueDate), dueDateObj: loanApprovedDueDate },
      { value: "clear-to-close", label: "Clear to Close", dueDate: formatDueDate(clearToCloseDueDate), dueDateObj: clearToCloseDueDate },
      { value: "hud-settlement-statement", label: "HUD Settlement Statement", dueDate: formatDueDate(hudSettlementDueDate), dueDateObj: hudSettlementDueDate },
    ];
  };

  const noticeOptions = calculateDueDates();

  // Check for overdue incomplete notices
  const today = startOfDay(new Date());
  const overdueNotices = noticeOptions.filter(option => {
    const isCompleted = noticeStatuses[option.value] || false;
    if (isCompleted) return false;
    if (!option.dueDateObj) return false;
    return isBefore(option.dueDateObj, today);
  });

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

  const handleSendNotice = (noticeType: NoticeType) => {
    if (noticeType === "clear-to-close") {
      onNavigate("clear-to-close-letter");
      return;
    }
    if (noticeType === "home-inspection-scheduled") {
      onNavigate("home-inspection-letter");
      return;
    }
    if (noticeType === "deposit-received") {
      onNavigate("deposit-letter");
      return;
    }
    console.log("Sending notice:", noticeType);
  };

  // Check if a notice is overdue
  const isOverdue = (option: { value: NoticeType; dueDateObj: Date | null }) => {
    if (!option.dueDateObj) return false;
    const isCompleted = noticeStatuses[option.value] || false;
    if (isCompleted) return false;
    return isBefore(option.dueDateObj, today);
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
            {/* Overdue Notices Warning */}
            {overdueNotices.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Overdue Notices:</strong>{" "}
                  {overdueNotices.map(n => n.label).join(", ")} — Please complete these items.
                </AlertDescription>
              </Alert>
            )}

            <TooltipProvider delayDuration={300}>
              <div className="space-y-3">
                {noticeOptions.map((option) => {
                  const isCompleted = noticeStatuses[option.value] || false;
                  const overdue = isOverdue(option);

                  return (
                    <Tooltip key={option.value}>
                      <TooltipTrigger asChild>
                        <div
                          onClick={() => handleSendNotice(option.value)}
                          className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${
                            overdue 
                              ? "border-destructive bg-destructive/10 hover:bg-destructive/20" 
                              : isCompleted 
                                ? "border-green-500 bg-green-500/10 hover:bg-green-500/20" 
                                : "border-border hover:bg-muted/50"
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <Label
                              className={`cursor-pointer font-medium ${
                                isCompleted ? "line-through text-muted-foreground" : ""
                              }`}
                            >
                              {option.label}
                            </Label>
                            {overdue && (
                              <span className="text-xs text-destructive font-semibold">OVERDUE</span>
                            )}
                          </div>
                          <div className="flex items-center space-x-3">
                            <Checkbox
                              id={`checkbox-${option.value}`}
                              checked={isCompleted}
                              onCheckedChange={(checked) => {
                                // Stop click from triggering the parent div's onClick
                                toggleNoticeCompletion(option.value, checked as boolean);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              disabled={loading}
                            />
                            <span className={`text-sm ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                              Due: {option.dueDate}
                            </span>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Click to send notice</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default NoticesView;
