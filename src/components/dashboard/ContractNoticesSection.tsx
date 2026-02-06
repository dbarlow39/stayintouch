import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, AlertTriangle, CheckCircle2 } from "lucide-react";
import { addDays, subDays, isBefore, startOfDay, format, differenceInDays } from "date-fns";

interface PropertyRow {
  id: string;
  name: string;
  street_address: string;
  in_contract: string | null;
  closing_date: string | null;
  inspection_days: number | null;
  loan_app_time_frame: string | null;
  loan_commitment: string | null;
  deposit_collection: string | null;
}

interface NoticeStatusRow {
  property_id: string;
  notice_type: string;
  completed: boolean;
}

interface NoticeItem {
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  noticeType: string;
  label: string;
  dueDate: Date;
  completed: boolean;
}

const parseLocalDate = (dateString: string | null): Date | null => {
  if (!dateString) return null;
  const [year, month, day] = dateString.split("-");
  if (!year || !month || !day) return null;
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
};

const calculateNotices = (property: PropertyRow): { type: string; label: string; dueDate: Date | null }[] => {
  const inContractDate = parseLocalDate(property.in_contract);
  const closingDate = parseLocalDate(property.closing_date);

  let depositDueDate: Date | null = null;
  if (property.deposit_collection && inContractDate) {
    const daysMatch = property.deposit_collection.match(/(\d+)\s*days?/i);
    if (daysMatch) depositDueDate = addDays(inContractDate, parseInt(daysMatch[1]));
  }

  const inspectionDueDate = inContractDate && property.inspection_days
    ? addDays(inContractDate, property.inspection_days) : null;

  const loanAppDueDate = inContractDate && property.loan_app_time_frame
    ? addDays(inContractDate, parseInt(property.loan_app_time_frame) || 7) : null;

  const titleCommitmentDueDate = closingDate ? subDays(closingDate, 15) : null;
  const appraisalDueDate = closingDate ? subDays(closingDate, 14) : null;

  const loanApprovedDueDate = inContractDate && property.loan_commitment
    ? addDays(inContractDate, parseInt(property.loan_commitment) || 21) : null;

  const clearToCloseDueDate = closingDate ? subDays(closingDate, 4) : null;
  const hudSettlementDueDate = closingDate ? subDays(closingDate, 2) : null;

  return [
    { type: "deposit-received", label: "Deposit Received", dueDate: depositDueDate },
    { type: "home-inspection-scheduled", label: "Home Inspection Scheduled", dueDate: inspectionDueDate },
    { type: "loan-application", label: "Loan Application", dueDate: loanAppDueDate },
    { type: "title-commitment-received", label: "Title Commitment Received", dueDate: titleCommitmentDueDate },
    { type: "appraisal-ordered", label: "Appraisal Ordered", dueDate: appraisalDueDate },
    { type: "loan-approved", label: "Loan Approved", dueDate: loanApprovedDueDate },
    { type: "clear-to-close", label: "Clear to Close", dueDate: clearToCloseDueDate },
    { type: "hud-settlement-statement", label: "HUD Settlement Statement", dueDate: hudSettlementDueDate },
  ];
};

interface ContractNoticesSectionProps {
  onNavigateToProperty?: (propertyId: string) => void;
}

const ContractNoticesSection = ({ onNavigateToProperty }: ContractNoticesSectionProps) => {
  const { user } = useAuth();

  const { data: properties } = useQuery({
    queryKey: ["contract-properties", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimated_net_properties")
        .select("id, name, street_address, in_contract, closing_date, inspection_days, loan_app_time_frame, loan_commitment, deposit_collection")
        .not("in_contract", "is", null);
      if (error) throw error;
      return data as PropertyRow[];
    },
    enabled: !!user,
  });

  const { data: noticeStatuses } = useQuery({
    queryKey: ["all-notice-statuses", user?.id],
    queryFn: async () => {
      if (!properties || properties.length === 0) return [];
      const propertyIds = properties.map((p) => p.id);
      const { data, error } = await supabase
        .from("property_notice_status")
        .select("property_id, notice_type, completed")
        .in("property_id", propertyIds);
      if (error) throw error;
      return data as NoticeStatusRow[];
    },
    enabled: !!properties && properties.length > 0,
  });

  const today = startOfDay(new Date());

  const allNotices = useMemo(() => {
    if (!properties) return [];

    const statusMap: Record<string, boolean> = {};
    (noticeStatuses || []).forEach((s) => {
      statusMap[`${s.property_id}:${s.notice_type}`] = s.completed;
    });

    const items: NoticeItem[] = [];
    for (const property of properties) {
      const notices = calculateNotices(property);
      for (const notice of notices) {
        if (!notice.dueDate) continue;
        const completed = statusMap[`${property.id}:${notice.type}`] || false;
        items.push({
          propertyId: property.id,
          propertyName: property.name,
          propertyAddress: property.street_address,
          noticeType: notice.type,
          label: notice.label,
          dueDate: notice.dueDate,
          completed,
        });
      }
    }

    // Only show overdue and up to 3 days in the future
    const threeDaysOut = addDays(today, 3);
    return items
      .filter((item) => !item.completed && isBefore(item.dueDate, addDays(threeDaysOut, 1)))
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [properties, noticeStatuses]);

  if (!properties || properties.length === 0 || allNotices.length === 0) {
    return null;
  }

  const overdueNotices = allNotices.filter((n) => isBefore(n.dueDate, today));
  const upcomingNotices = allNotices.filter((n) => !isBefore(n.dueDate, today));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          Contract Notices
          {overdueNotices.length > 0 && (
            <Badge variant="destructive" className="ml-2">
              {overdueNotices.length} overdue
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {overdueNotices.length > 0 && (
          <div className="space-y-1 mb-3">
            {overdueNotices.map((notice) => (
              <NoticeRow key={`${notice.propertyId}-${notice.noticeType}`} notice={notice} today={today} onClick={() => onNavigateToProperty?.(notice.propertyId)} />
            ))}
          </div>
        )}

        {upcomingNotices.length > 0 && overdueNotices.length > 0 && (
          <div className="border-t pt-2" />
        )}

        {upcomingNotices.map((notice) => (
          <NoticeRow key={`${notice.propertyId}-${notice.noticeType}`} notice={notice} today={today} onClick={() => onNavigateToProperty?.(notice.propertyId)} />
        ))}
      </CardContent>
    </Card>
  );
};

const NoticeRow = ({ notice, today, onClick }: { notice: NoticeItem; today: Date; onClick?: () => void }) => {
  const overdue = isBefore(notice.dueDate, today);
  const daysUntil = differenceInDays(notice.dueDate, today);

  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between py-2 px-3 rounded-md text-sm cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all ${
        overdue
          ? "bg-destructive/10 text-destructive"
          : daysUntil <= 3
          ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
          : ""
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {overdue ? (
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        )}
        <span className="font-medium truncate">{notice.label}</span>
        <span className="text-muted-foreground truncate text-xs">— {notice.propertyName}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        <span className="text-xs">
          {format(notice.dueDate, "MM/dd/yyyy")}
        </span>
        {overdue ? (
          <Badge variant="destructive" className="text-xs">
            {Math.abs(daysUntil)}d overdue
          </Badge>
        ) : daysUntil <= 3 ? (
          <Badge className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20 text-xs">
            {daysUntil === 0 ? "Today" : `${daysUntil}d`}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs">
            {daysUntil}d
          </Badge>
        )}
      </div>
    </div>
  );
};

export default ContractNoticesSection;
