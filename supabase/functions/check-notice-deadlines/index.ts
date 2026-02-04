import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NoticeOption {
  value: string;
  label: string;
  dueDate: Date | null;
}

interface PropertyWithNotices {
  id: string;
  agent_id: string;
  name: string;
  street_address: string;
  in_contract: string | null;
  closing_date: string | null;
  inspection_days: number | null;
  loan_app_time_frame: string | null;
  loan_commitment: string | null;
  deposit_collection: string | null;
}

// Helper to parse date string as local date
const parseLocalDate = (dateString: string | null): Date | null => {
  if (!dateString) return null;
  const [year, month, day] = dateString.split('-');
  if (!year || !month || !day) return null;
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
};

// Calculate due dates for a property
const calculateDueDates = (property: PropertyWithNotices): NoticeOption[] => {
  const inContractDate = parseLocalDate(property.in_contract);
  const closingDate = parseLocalDate(property.closing_date);
  
  const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };
  
  const subDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() - days);
    return result;
  };

  // Home Inspection: inContract + inspectionDays
  const inspectionDueDate = inContractDate && property.inspection_days
    ? addDays(inContractDate, property.inspection_days)
    : null;
  
  // Deposit: Use depositCollection text or calculate if it contains days
  let depositDueDate: Date | null = null;
  if (property.deposit_collection && inContractDate) {
    const daysMatch = property.deposit_collection.match(/(\d+)\s*days?/i);
    if (daysMatch) {
      depositDueDate = addDays(inContractDate, parseInt(daysMatch[1]));
    }
  }
  
  // Loan Application: inContract + loanAppTimeFrame days
  const loanApplicationDueDate = inContractDate && property.loan_app_time_frame
    ? addDays(inContractDate, parseInt(property.loan_app_time_frame) || 7)
    : null;
  
  // Appraisal Ordered: 14 days before closing
  const appraisalDueDate = closingDate ? subDays(closingDate, 14) : null;
  
  // Title Commitment: 15 days before closing
  const titleCommitmentDueDate = closingDate ? subDays(closingDate, 15) : null;
  
  // Loan Approved: inContract + loanCommitment days
  const loanApprovedDueDate = inContractDate && property.loan_commitment
    ? addDays(inContractDate, parseInt(property.loan_commitment) || 21)
    : null;
  
  // Clear to Close: 4 days before closing
  const clearToCloseDueDate = closingDate ? subDays(closingDate, 4) : null;
  
  // HUD Settlement Statement: 2 days before closing
  const hudSettlementDueDate = closingDate ? subDays(closingDate, 2) : null;

  return [
    { value: "deposit-received", label: "Deposit Received", dueDate: depositDueDate },
    { value: "home-inspection-scheduled", label: "Home Inspection Scheduled", dueDate: inspectionDueDate },
    { value: "loan-application", label: "Loan Application", dueDate: loanApplicationDueDate },
    { value: "title-commitment-received", label: "Title Commitment Received", dueDate: titleCommitmentDueDate },
    { value: "appraisal-ordered", label: "Appraisal Ordered", dueDate: appraisalDueDate },
    { value: "loan-approved", label: "Loan Approved", dueDate: loanApprovedDueDate },
    { value: "clear-to-close", label: "Clear to Close", dueDate: clearToCloseDueDate },
    { value: "hud-settlement-statement", label: "HUD Settlement Statement", dueDate: hudSettlementDueDate },
  ];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Use service role key for cron jobs to bypass RLS
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch all properties that are under contract (have in_contract date set)
    const { data: properties, error: propertiesError } = await supabase
      .from("estimated_net_properties")
      .select("id, agent_id, name, street_address, in_contract, closing_date, inspection_days, loan_app_time_frame, loan_commitment, deposit_collection")
      .not("in_contract", "is", null);

    if (propertiesError) {
      throw propertiesError;
    }

    console.log(`Found ${properties?.length || 0} properties under contract`);

    const overdueItems: { 
      agent_id: string; 
      property_name: string;
      property_address: string;
      overdue_notices: string[] 
    }[] = [];

    for (const property of properties || []) {
      // Calculate due dates for this property
      const notices = calculateDueDates(property);

      // Fetch completed statuses for this property
      const { data: statuses, error: statusError } = await supabase
        .from("property_notice_status")
        .select("notice_type, completed")
        .eq("property_id", property.id);

      if (statusError) {
        console.error(`Error fetching statuses for property ${property.id}:`, statusError);
        continue;
      }

      const completedMap: Record<string, boolean> = {};
      (statuses || []).forEach((s: { notice_type: string; completed: boolean }) => {
        completedMap[s.notice_type] = s.completed;
      });

      // Check for overdue incomplete notices
      const overdueNotices = notices.filter(notice => {
        if (!notice.dueDate) return false;
        const isCompleted = completedMap[notice.value] || false;
        if (isCompleted) return false;
        return notice.dueDate < today;
      });

      if (overdueNotices.length > 0) {
        overdueItems.push({
          agent_id: property.agent_id,
          property_name: property.name,
          property_address: property.street_address,
          overdue_notices: overdueNotices.map(n => n.label),
        });
      }
    }

    console.log(`Found ${overdueItems.length} properties with overdue notices`);

    // Group by agent for potential notifications
    const agentOverdues: Record<string, typeof overdueItems> = {};
    overdueItems.forEach(item => {
      if (!agentOverdues[item.agent_id]) {
        agentOverdues[item.agent_id] = [];
      }
      agentOverdues[item.agent_id].push(item);
    });

    // Log overdue items (in future, this could trigger email notifications)
    for (const [agentId, items] of Object.entries(agentOverdues)) {
      console.log(`Agent ${agentId} has ${items.length} properties with overdue notices:`);
      items.forEach(item => {
        console.log(`  - ${item.property_name} (${item.property_address}): ${item.overdue_notices.join(", ")}`);
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        propertiesChecked: properties?.length || 0,
        overdueCount: overdueItems.length,
        overdueItems 
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200 
      }
    );
  } catch (error) {
    console.error("Error checking notice deadlines:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500 
      }
    );
  }
});
