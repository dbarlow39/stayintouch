import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, FileText, Trash2, Edit, Calendar, CheckCircle, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/utils/estimatedNetCalculations";
import { PropertyData, EstimatedNetProperty } from "@/types/estimatedNet";
import PropertyInputForm from "./estimatedNet/PropertyInputForm";
import ClosingCostsView from "./estimatedNet/ClosingCostsView";
import OfferLetterView from "./estimatedNet/OfferLetterView";
import OfferSummaryView from "./estimatedNet/OfferSummaryView";
import ImportantDatesView from "./estimatedNet/ImportantDatesView";
import TitleLetterView from "./estimatedNet/TitleLetterView";
import AgentLetterView from "./estimatedNet/AgentLetterView";
import RequestToRemedyView from "./estimatedNet/RequestToRemedyView";
import SettlementStatementView from "./estimatedNet/SettlementStatementView";
import NoticesView from "./estimatedNet/NoticesView";
import ClearToCloseLetterView from "./estimatedNet/ClearToCloseLetterView";
import HomeInspectionLetterView from "./estimatedNet/HomeInspectionLetterView";
import DepositLetterView from "./estimatedNet/DepositLetterView";
import AppraisalLetterView from "./estimatedNet/AppraisalLetterView";
import LoanApplicationLetterView from "./estimatedNet/LoanApplicationLetterView";
import TitleCommitmentLetterView from "./estimatedNet/TitleCommitmentLetterView";
import ClosedReferralLetterView from "./estimatedNet/ClosedReferralLetterView";
import AdResultsLetterView from "./estimatedNet/AdResultsLetterView";
import ClientSelectionView from "./estimatedNet/ClientSelectionView";
import UpcomingClosingsView from "./estimatedNet/UpcomingClosingsView";
import ContractNoticesSection from "./ContractNoticesSection";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ViewState = 'list' | 'select-client' | 'form' | 'results' | 'offer-letter' | 'offer-summary' | 'important-dates' | 'title-letter' | 'agent-letter' | 'request-to-remedy' | 'settlement-statement' | 'notices' | 'upcoming-closings' | 'clear-to-close-letter' | 'home-inspection-letter' | 'deposit-letter' | 'appraisal-letter' | 'loan-application-letter' | 'title-commitment-letter' | 'closed-referral-letter' | 'ad-results-letter';

interface SelectedClientForEstimate {
  id: string;
  firstName: string;
  lastName: string;
  streetNumber?: string;
  streetName?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  email?: string;
  annualTaxes?: number;
}

interface EstimatedNetTabProps {
  selectedClient?: SelectedClientForEstimate | null;
  onClearSelectedClient?: () => void;
  navigateToPropertyId?: string | null;
  onClearNavigateToProperty?: () => void;
}

const EstimatedNetTab = ({ selectedClient, onClearSelectedClient, navigateToPropertyId, onClearNavigateToProperty }: EstimatedNetTabProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [viewState, setViewState] = useState<ViewState>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentPropertyId, setCurrentPropertyId] = useState<string | null>(null);
  const [currentPropertyData, setCurrentPropertyData] = useState<PropertyData | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [markSoldId, setMarkSoldId] = useState<string | null>(null);
  const [dealTab, setDealTab] = useState<'active' | 'closed'>('active');
  const [initialClient, setInitialClient] = useState<SelectedClientForEstimate | null>(null);
  const [pendingPropertyNav, setPendingPropertyNav] = useState<{ id: string; view: ViewState } | null>(null);

  // Handle selected client from Clients tab - check for existing estimate first
  useEffect(() => {
    const loadClientEstimate = async () => {
      if (selectedClient && user) {
        // Check if there's an existing estimate for this client
        const { data: existingEstimate } = await supabase
          .from("estimated_net_properties")
          .select("id")
          .eq("agent_id", user.id)
          .eq("client_id", selectedClient.id)
          .maybeSingle();

        if (existingEstimate) {
          // Load existing estimate for editing
          setEditingId(existingEstimate.id);
          setInitialClient(null);
        } else {
          // Create new estimate with client data
          setInitialClient(selectedClient);
          setEditingId(null);
        }
        setViewState('form');
        onClearSelectedClient?.();
      }
    };

    loadClientEstimate();
  }, [selectedClient, onClearSelectedClient, user]);

  // Handle navigation from external sources (Tasks tab) or internal ContractNoticesSection
  useEffect(() => {
    if (navigateToPropertyId) {
      setPendingPropertyNav({ id: navigateToPropertyId, view: 'notices' });
      onClearNavigateToProperty?.();
    }
  }, [navigateToPropertyId]);

  // Process pending property navigation
  useEffect(() => {
    if (!pendingPropertyNav) return;
    const { id, view } = pendingPropertyNav;
    setPendingPropertyNav(null);

    const loadAndNavigate = async () => {
      const { data, error } = await supabase
        .from("estimated_net_properties")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        toast({ title: "Error loading property", description: error.message, variant: "destructive" });
        return;
      }

      const propertyData: PropertyData = {
        name: data.name,
        sellerPhone: data.seller_phone || "",
        sellerEmail: data.seller_email || "",
        streetAddress: data.street_address,
        city: data.city,
        state: data.state,
        zip: data.zip,
        offerPrice: Number(data.offer_price),
        firstMortgage: Number(data.first_mortgage),
        secondMortgage: Number(data.second_mortgage),
        listingAgentCommission: Number(data.listing_agent_commission),
        buyerAgentCommission: Number(data.buyer_agent_commission),
        closingCost: Number(data.closing_cost),
        typeOfLoan: data.type_of_loan || "Conventional",
        lenderName: (data as any).lender_name || "",
        lendingOfficer: (data as any).lending_officer || "",
        lendingOfficerPhone: (data as any).lending_officer_phone || "",
        lendingOfficerEmail: (data as any).lending_officer_email || "",
        buyerName1: (data as any).buyer_name_1 || "",
        buyerName2: (data as any).buyer_name_2 || "",
        loanAppTimeFrame: data.loan_app_time_frame || "",
        loanCommitment: data.loan_commitment || "",
        preApprovalDays: data.pre_approval_days ?? 0,
        appraisalContingency: data.appraisal_contingency ?? true,
        homeWarranty: Number(data.home_warranty),
        homeWarrantyCompany: data.home_warranty_company || "",
        deposit: Number(data.deposit),
        depositCollection: data.deposit_collection || "Within 3 Days of Acceptance",
        inContract: data.in_contract || "",
        closingDate: data.closing_date || "",
        possession: data.possession || "",
        finalWalkThrough: data.final_walk_through || "48 hours prior to close",
        respondToOfferBy: data.respond_to_offer_by || "",
        inspectionDays: data.inspection_days || 0,
        remedyPeriodDays: data.remedy_period_days || 0,
        annualTaxes: Number(data.annual_taxes),
        firstHalfPaid: data.first_half_paid,
        secondHalfPaid: data.second_half_paid,
        taxDaysDueThisYear: data.tax_days_due_this_year || 0,
        daysFirstHalfTaxes: data.days_first_half_taxes || 0,
        daysSecondHalfTaxes: data.days_second_half_taxes || 0,
        agentName: data.agent_name || "",
        agentContact: data.agent_contact || "",
        agentEmail: data.agent_email || "",
        listingAgentName: data.listing_agent_name || "",
        listingAgentPhone: data.listing_agent_phone || "",
        listingAgentEmail: data.listing_agent_email || "",
        titleCompanyName: (data as any).title_company_name || "Caliber Title / Title First",
        titleProcessor: (data as any).title_processor || "Kameron Faulkner or Shina Painter",
        titlePhone: (data as any).title_phone || "614-854-0980",
        titleEmail: (data as any).title_email || "polaris@titlefirst.com",
        adminFee: Number(data.admin_fee),
        appliances: data.appliances || "",
        notes: data.notes || "",
      };

      setCurrentPropertyId(id);
      setCurrentPropertyData(propertyData);
      setViewState(view);
    };

    loadAndNavigate();
  }, [pendingPropertyNav]);

  // Helper to extract street name from address (removes leading numbers)
  const extractStreetName = (address: string): string => {
    // Remove leading numbers and spaces (e.g., "123 Main St" -> "Main St")
    return address.replace(/^\d+\s*/, '').toLowerCase();
  };

  // Fetch saved estimates
  const { data: estimates = [], isLoading } = useQuery({
    queryKey: ["estimated-net-properties", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimated_net_properties")
        .select("*")
        .eq("agent_id", user!.id);
      
      if (error) throw error;
      
      // Sort by street name (excluding the street number)
      return (data as EstimatedNetProperty[]).sort((a, b) => {
        const nameA = extractStreetName(a.street_address || '');
        const nameB = extractStreetName(b.street_address || '');
        return nameA.localeCompare(nameB);
      });
    },
    enabled: !!user,
  });

  const handleNewEstimate = () => {
    setEditingId(null);
    setCurrentPropertyData(null);
    setInitialClient(null);
    setViewState('select-client');
  };

  const handleSelectClientForEstimate = async (client: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    street_number: string | null;
    street_name: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    phone: string | null;
    cell_phone: string | null;
    home_phone: string | null;
    email: string | null;
    annual_taxes: number | null;
  }) => {
    const phoneNumber = client.phone || client.cell_phone || client.home_phone || undefined;
    // Treat null/0 as missing
    let annualTaxes: number | undefined =
      client.annual_taxes != null && Number(client.annual_taxes) > 0 ? Number(client.annual_taxes) : undefined;

    // If annual taxes are missing, look them up via Estated API
    if ((annualTaxes == null || annualTaxes <= 0) && client.street_number && client.street_name) {
      try {
        const address = `${client.street_number} ${client.street_name}`.trim();
        const { data, error } = await supabase.functions.invoke('lookup-property', {
          body: {
            address,
            city: client.city,
            state: client.state,
            zip: client.zip,
          }
        });

        const fetchedAnnualTaxes = data?.annual_amount;

        if (!error && fetchedAnnualTaxes != null) {
          const normalized = Number(fetchedAnnualTaxes);
          if (!Number.isNaN(normalized) && normalized > 0) {
            annualTaxes = normalized;
          
            // Update the client record with the fetched tax data
            const { error: updateError } = await supabase
              .from("clients")
              .update({ annual_taxes: annualTaxes })
              .eq("id", client.id);

            if (updateError) {
              console.error("Error updating client annual_taxes:", updateError);
            }

            toast({
              title: "Tax data found",
              description: `Annual taxes of ${formatCurrency(annualTaxes)} retrieved and saved.`,
            });
          } else {
            toast({
              title: "No tax data found",
              description: "We couldn't find annual tax data for this address.",
            });
          }
        }
      } catch (error) {
        console.error('Error looking up property taxes:', error);
      }
    }

    setInitialClient({
      id: client.id,
      firstName: client.first_name || "",
      lastName: client.last_name || "",
      streetNumber: client.street_number || undefined,
      streetName: client.street_name || undefined,
      city: client.city || undefined,
      state: client.state || undefined,
      zip: client.zip || undefined,
      phone: phoneNumber,
      email: client.email || undefined,
      annualTaxes: annualTaxes ?? undefined,
    });
    setEditingId(null);
    setViewState('form');
  };

  const handleNewClientEstimate = () => {
    setInitialClient(null);
    setEditingId(null);
    setViewState('form');
  };

  const handleEditEstimate = (id: string) => {
    setEditingId(id);
    setViewState('form');
  };

  const handleViewResults = async (id: string, targetView?: ViewState) => {
    // Load the property data from the database
    const { data, error } = await supabase
      .from("estimated_net_properties")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      toast({
        title: "Error loading property",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    // Convert to PropertyData format
    const propertyData: PropertyData = {
      name: data.name,
      sellerPhone: data.seller_phone || "",
      sellerEmail: data.seller_email || "",
      streetAddress: data.street_address,
      city: data.city,
      state: data.state,
      zip: data.zip,
      offerPrice: Number(data.offer_price),
      firstMortgage: Number(data.first_mortgage),
      secondMortgage: Number(data.second_mortgage),
      listingAgentCommission: Number(data.listing_agent_commission),
      buyerAgentCommission: Number(data.buyer_agent_commission),
      closingCost: Number(data.closing_cost),
      typeOfLoan: data.type_of_loan || "Conventional",
      lenderName: (data as any).lender_name || "",
      lendingOfficer: (data as any).lending_officer || "",
      lendingOfficerPhone: (data as any).lending_officer_phone || "",
      lendingOfficerEmail: (data as any).lending_officer_email || "",
      buyerName1: (data as any).buyer_name_1 || "",
      buyerName2: (data as any).buyer_name_2 || "",
      loanAppTimeFrame: data.loan_app_time_frame || "",
      loanCommitment: data.loan_commitment || "",
      preApprovalDays: data.pre_approval_days ?? 0,
      appraisalContingency: data.appraisal_contingency ?? true,
      homeWarranty: Number(data.home_warranty),
      homeWarrantyCompany: data.home_warranty_company || "",
      deposit: Number(data.deposit),
      depositCollection: data.deposit_collection || "Within 3 Days of Acceptance",
      inContract: data.in_contract || "",
      closingDate: data.closing_date || "",
      possession: data.possession || "",
      finalWalkThrough: data.final_walk_through || "48 hours prior to close",
      respondToOfferBy: data.respond_to_offer_by || "",
      inspectionDays: data.inspection_days || 0,
      remedyPeriodDays: data.remedy_period_days || 0,
      annualTaxes: Number(data.annual_taxes),
      firstHalfPaid: data.first_half_paid,
      secondHalfPaid: data.second_half_paid,
      taxDaysDueThisYear: data.tax_days_due_this_year || 0,
      daysFirstHalfTaxes: data.days_first_half_taxes || 0,
      daysSecondHalfTaxes: data.days_second_half_taxes || 0,
      agentName: data.agent_name || "",
      agentContact: data.agent_contact || "",
      agentEmail: data.agent_email || "",
      listingAgentName: data.listing_agent_name || "",
      listingAgentPhone: data.listing_agent_phone || "",
      listingAgentEmail: data.listing_agent_email || "",
     titleCompanyName: (data as any).title_company_name || "Caliber Title / Title First",
     titleProcessor: (data as any).title_processor || "Kameron Faulkner or Shina Painter",
     titlePhone: (data as any).title_phone || "614-854-0980",
     titleEmail: (data as any).title_email || "polaris@titlefirst.com",
      adminFee: Number(data.admin_fee),
      appliances: data.appliances || "",
      notes: data.notes || "",
    };

    setCurrentPropertyId(id);
    setCurrentPropertyData(propertyData);
    setViewState(targetView || 'results');
  };

  const handleFormSave = (propertyId: string, propertyData: PropertyData, targetView?: string) => {
    setCurrentPropertyId(propertyId);
    setCurrentPropertyData(propertyData);
    queryClient.invalidateQueries({ queryKey: ["estimated-net-properties"] });
    
    // Navigate to the requested view, defaulting to results
    if (targetView === 'offer-summary') {
      setViewState('offer-summary');
    } else if (targetView === 'offer-letter') {
      setViewState('offer-letter');
    } else if (targetView === 'important-dates') {
      setViewState('important-dates');
    } else if (targetView === 'title-letter') {
      setViewState('title-letter');
    } else if (targetView === 'agent-letter') {
      setViewState('agent-letter');
    } else if (targetView === 'request-to-remedy') {
      setViewState('request-to-remedy');
    } else if (targetView === 'settlement-statement') {
      setViewState('settlement-statement');
    } else if (targetView === 'notices') {
      setViewState('notices');
    } else {
      setViewState('results');
    }
  };

  const handleFormCancel = () => {
    setEditingId(null);
    setViewState('list');
  };

  const handleBackToList = () => {
    setCurrentPropertyId(null);
    setCurrentPropertyData(null);
    setEditingId(null);
    setViewState('list');
  };

  const handleBackToForm = () => {
    if (currentPropertyId) {
      setEditingId(currentPropertyId);
      setViewState('form');
    } else {
      handleBackToList();
    }
  };

  const handleBackToNotices = () => {
    setViewState('notices');
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const { error } = await supabase
        .from("estimated_net_properties")
        .delete()
        .eq("id", deleteId);

      if (error) throw error;

      toast({
        title: "Estimate deleted",
        description: "The property estimate has been removed.",
      });

      queryClient.invalidateQueries({ queryKey: ["estimated-net-properties"] });
    } catch (error: any) {
      toast({
        title: "Error deleting estimate",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteId(null);
    }
  };

  const handleMarkAsSold = async () => {
    if (!markSoldId) return;

    try {
      // Find the estimate to get the client_id
      const estimate = estimates.find(e => e.id === markSoldId);
      
      // Update client status to "S" (Sold) if linked
      if (estimate?.client_id) {
        const { error: clientError } = await supabase
          .from("clients")
          .update({ status: "S" })
          .eq("id", estimate.client_id);
        if (clientError) throw clientError;
      }

      // Move the deal to "closed" status instead of deleting
      const { error } = await supabase
        .from("estimated_net_properties")
        .update({ deal_status: "closed" })
        .eq("id", markSoldId);
      if (error) throw error;

      toast({
        title: "Property marked as sold",
        description: "The deal has been moved to the Closed tab.",
      });

      queryClient.invalidateQueries({ queryKey: ["estimated-net-properties"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["active-clients-count"] });
      queryClient.invalidateQueries({ queryKey: ["clients-count"] });
    } catch (error: any) {
      toast({
        title: "Error marking as sold",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setMarkSoldId(null);
    }
  };

  const handleReopenDeal = async (id: string) => {
    try {
      const estimate = estimates.find(e => e.id === id);

      // Restore client status to "A" (Active) if linked
      if (estimate?.client_id) {
        const { error: clientError } = await supabase
          .from("clients")
          .update({ status: "A" })
          .eq("id", estimate.client_id);
        if (clientError) throw clientError;
      }

      // Move deal back to active
      const { error } = await supabase
        .from("estimated_net_properties")
        .update({ deal_status: "active" })
        .eq("id", id);
      if (error) throw error;

      toast({
        title: "Deal reopened",
        description: "The deal has been moved back to the Active tab.",
      });

      queryClient.invalidateQueries({ queryKey: ["estimated-net-properties"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["active-clients-count"] });
      queryClient.invalidateQueries({ queryKey: ["clients-count"] });
    } catch (error: any) {
      toast({
        title: "Error reopening deal",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Render based on current view state
  if (viewState === 'upcoming-closings') {
    return (
      <UpcomingClosingsView onBack={handleBackToList} />
    );
  }

  if (viewState === 'select-client') {
    return (
      <ClientSelectionView
        onSelectClient={handleSelectClientForEstimate}
        onNewClient={handleNewClientEstimate}
        onCancel={handleBackToList}
      />
    );
  }

  if (viewState === 'form') {
    return (
      <PropertyInputForm
        editingId={editingId}
        onSave={handleFormSave}
        onCancel={handleFormCancel}
        initialClient={initialClient}
        onClearInitialClient={() => setInitialClient(null)}
      />
    );
  }

  if (viewState === 'results' && currentPropertyData && currentPropertyId) {
    return (
      <ClosingCostsView
        propertyData={currentPropertyData}
        propertyId={currentPropertyId}
        onBack={handleBackToList}
        onEdit={handleEditEstimate}
        onNavigate={(view) => setViewState(view as ViewState)}
      />
    );
  }

  if (viewState === 'offer-letter' && currentPropertyData && currentPropertyId) {
    return (
      <OfferLetterView
        propertyData={currentPropertyData}
        propertyId={currentPropertyId}
        onBack={handleBackToList}
        onEdit={handleEditEstimate}
        onNavigate={(view) => setViewState(view as ViewState)}
      />
    );
  }

  if (viewState === 'offer-summary' && currentPropertyData && currentPropertyId) {
    return (
      <OfferSummaryView
        propertyData={currentPropertyData}
        propertyId={currentPropertyId}
        onBack={handleBackToList}
        onEdit={handleEditEstimate}
        onNavigate={(view) => setViewState(view as ViewState)}
      />
    );
  }

  if (viewState === 'important-dates' && currentPropertyData && currentPropertyId) {
    return (
      <ImportantDatesView
        propertyData={currentPropertyData}
        propertyId={currentPropertyId}
        onBack={handleBackToList}
        onEdit={handleEditEstimate}
        onNavigate={(view) => setViewState(view as ViewState)}
      />
    );
  }

  if (viewState === 'title-letter' && currentPropertyData && currentPropertyId) {
    return (
      <TitleLetterView
        propertyData={currentPropertyData}
        propertyId={currentPropertyId}
        onBack={handleBackToList}
        onEdit={handleEditEstimate}
        onNavigate={(view) => setViewState(view as ViewState)}
      />
    );
  }

  if (viewState === 'agent-letter' && currentPropertyData && currentPropertyId) {
    return (
      <AgentLetterView
        propertyData={currentPropertyData}
        propertyId={currentPropertyId}
        onBack={handleBackToList}
        onEdit={handleEditEstimate}
        onNavigate={(view) => setViewState(view as ViewState)}
      />
    );
  }

  if (viewState === 'request-to-remedy' && currentPropertyData && currentPropertyId) {
    return (
      <RequestToRemedyView
        propertyData={currentPropertyData}
        propertyId={currentPropertyId}
        onBack={handleBackToNotices}
        onEdit={handleEditEstimate}
        onNavigate={(view) => setViewState(view as ViewState)}
      />
    );
  }

  if (viewState === 'settlement-statement' && currentPropertyData && currentPropertyId) {
    return (
      <SettlementStatementView
        propertyData={currentPropertyData}
        propertyId={currentPropertyId}
        onBack={handleBackToNotices}
        onEdit={handleEditEstimate}
        onNavigate={(view) => setViewState(view as ViewState)}
      />
    );
  }

  if (viewState === 'notices' && currentPropertyData && currentPropertyId) {
    return (
      <NoticesView
        propertyData={currentPropertyData}
        propertyId={currentPropertyId}
        onBack={handleBackToForm}
        onEdit={handleEditEstimate}
        onNavigate={(view) => setViewState(view as ViewState)}
      />
    );
  }

  if (viewState === 'clear-to-close-letter' && currentPropertyData && currentPropertyId) {
    return (
      <ClearToCloseLetterView
        propertyData={currentPropertyData}
        propertyId={currentPropertyId}
        onBack={handleBackToNotices}
        onEdit={handleEditEstimate}
        onNavigate={(view) => setViewState(view as ViewState)}
      />
    );
  }

  if (viewState === 'home-inspection-letter' && currentPropertyData && currentPropertyId) {
    return (
      <HomeInspectionLetterView
        propertyData={currentPropertyData}
        propertyId={currentPropertyId}
        onBack={handleBackToNotices}
        onEdit={handleEditEstimate}
        onNavigate={(view) => setViewState(view as ViewState)}
      />
    );
  }

  if (viewState === 'deposit-letter' && currentPropertyData && currentPropertyId) {
    return (
      <DepositLetterView
        propertyData={currentPropertyData}
        propertyId={currentPropertyId}
        onBack={handleBackToNotices}
        onEdit={handleEditEstimate}
        onNavigate={(view) => setViewState(view as ViewState)}
      />
    );
  }

  if (viewState === 'appraisal-letter' && currentPropertyData && currentPropertyId) {
    return (
      <AppraisalLetterView
        propertyData={currentPropertyData}
        propertyId={currentPropertyId}
        onBack={handleBackToNotices}
        onEdit={handleEditEstimate}
        onNavigate={(view) => setViewState(view as ViewState)}
      />
    );
  }

  if (viewState === 'loan-application-letter' && currentPropertyData && currentPropertyId) {
    return (
      <LoanApplicationLetterView
        propertyData={currentPropertyData}
        propertyId={currentPropertyId}
        onBack={handleBackToNotices}
        onEdit={handleEditEstimate}
        onNavigate={(view) => setViewState(view as ViewState)}
      />
    );
  }

  if (viewState === 'title-commitment-letter' && currentPropertyData && currentPropertyId) {
    return (
      <TitleCommitmentLetterView
        propertyData={currentPropertyData}
        propertyId={currentPropertyId}
        onBack={handleBackToNotices}
        onEdit={handleEditEstimate}
        onNavigate={(view) => setViewState(view as ViewState)}
      />
    );
  }

  if (viewState === 'closed-referral-letter' && currentPropertyData && currentPropertyId) {
    return (
      <ClosedReferralLetterView
        propertyData={currentPropertyData}
        propertyId={currentPropertyId}
        onBack={handleBackToNotices}
        onEdit={handleEditEstimate}
        onNavigate={(view) => setViewState(view as ViewState)}
      />
    );
  }

  if (viewState === 'ad-results-letter' && currentPropertyData && currentPropertyId) {
    return (
      <AdResultsLetterView
        propertyData={currentPropertyData}
        propertyId={currentPropertyId}
        onBack={handleBackToNotices}
        onEdit={handleEditEstimate}
        onNavigate={(view) => setViewState(view as ViewState)}
      />
    );
  }

  const activeEstimates = estimates.filter(e => (e.deal_status || 'active') === 'active');
  const closedEstimates = estimates.filter(e => e.deal_status === 'closed');

  const renderEstimateTable = (items: typeof estimates, isClosed = false) => {
    if (items.length === 0) {
      return (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {isClosed ? "No closed deals" : "No estimates yet"}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {isClosed
                ? "Deals you mark as sold will appear here."
                : "Create your first estimated net sheet to calculate seller proceeds."}
            </p>
            {!isClosed && (
              <Button onClick={handleNewEstimate}>
                <Plus className="mr-2 h-4 w-4" />
                Create Estimate
              </Button>
            )}
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Property</TableHead>
              <TableHead>Address</TableHead>
              <TableHead className="text-right">Offer Price</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((estimate) => (
              <TableRow 
                key={estimate.id} 
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleEditEstimate(estimate.id)}
              >
                <TableCell className="font-medium">
                  {estimate.name}
                </TableCell>
                <TableCell>
                  {estimate.street_address}, {estimate.city}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(estimate.offer_price)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditEstimate(estimate.id);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    {!isClosed && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Mark as Sold"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMarkSoldId(estimate.id);
                        }}
                      >
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      </Button>
                    )}
                    {isClosed && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Reopen Deal"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReopenDeal(estimate.id);
                        }}
                      >
                        <Undo2 className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteId(estimate.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    );
  };

  // List view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Working Deals</h2>
          <p className="text-muted-foreground">Keeping Track of Your Deals</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setViewState('upcoming-closings')}>
            <Calendar className="mr-2 h-4 w-4" />
            Upcoming Closings
          </Button>
          <Button onClick={handleNewEstimate}>
            <Plus className="mr-2 h-4 w-4" />
            New Estimate
          </Button>
        </div>
      </div>

      <ContractNoticesSection onNavigateToProperty={(propertyId) => {
        setPendingPropertyNav({ id: propertyId, view: 'notices' });
      }} />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <Tabs value={dealTab} onValueChange={(v) => setDealTab(v as 'active' | 'closed')}>
          <TabsList>
            <TabsTrigger value="active">
              Active ({activeEstimates.length})
            </TabsTrigger>
            <TabsTrigger value="closed">
              Closed ({closedEstimates.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="mt-4">
            {renderEstimateTable(activeEstimates)}
          </TabsContent>
          <TabsContent value="closed" className="mt-4">
            {renderEstimateTable(closedEstimates, true)}
          </TabsContent>
        </Tabs>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Estimate?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The property estimate will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!markSoldId} onOpenChange={() => setMarkSoldId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Sold?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the linked client as "Sold" (removing them from the active clients list) and move this deal to the Closed tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleMarkAsSold}>
              Mark as Sold
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default EstimatedNetTab;
