import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { PropertyData } from "@/types/estimatedNet";
import PropertyInputForm from "./PropertyInputForm";
import ClosingCostsView from "./ClosingCostsView";
import OfferLetterView from "./OfferLetterView";
import OfferSummaryView from "./OfferSummaryView";
import ImportantDatesView from "./ImportantDatesView";
import TitleLetterView from "./TitleLetterView";
import AgentLetterView from "./AgentLetterView";
import RequestToRemedyView from "./RequestToRemedyView";
import SettlementStatementView from "./SettlementStatementView";
import NoticesView from "./NoticesView";
import ClearToCloseLetterView from "./ClearToCloseLetterView";
import HomeInspectionLetterView from "./HomeInspectionLetterView";
import DepositLetterView from "./DepositLetterView";
import AppraisalLetterView from "./AppraisalLetterView";
import LoanApplicationLetterView from "./LoanApplicationLetterView";
import TitleCommitmentLetterView from "./TitleCommitmentLetterView";
import ClosedReferralLetterView from "./ClosedReferralLetterView";
import AdResultsLetterView from "./AdResultsLetterView";
import PropertyNotesView from "./PropertyNotesView";

type ViewState = 'form' | 'results' | 'offer-letter' | 'offer-summary' | 'important-dates' | 'title-letter' | 'agent-letter' | 'request-to-remedy' | 'settlement-statement' | 'notices' | 'clear-to-close-letter' | 'home-inspection-letter' | 'deposit-letter' | 'appraisal-letter' | 'loan-application-letter' | 'title-commitment-letter' | 'closed-referral-letter' | 'ad-results-letter' | 'property-notes';

interface LeadData {
  id: string;
  first_name: string;
  last_name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  email?: string;
}

interface LeadEstimatedNetProps {
  lead: LeadData;
  onBack?: () => void;
}

const LeadEstimatedNet = ({ lead, onBack }: LeadEstimatedNetProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [viewState, setViewState] = useState<ViewState>('form');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentPropertyId, setCurrentPropertyId] = useState<string | null>(null);
  const [currentPropertyData, setCurrentPropertyData] = useState<PropertyData | null>(null);
  const [initialClient, setInitialClient] = useState<{
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
  } | null>(null);
  const [loaded, setLoaded] = useState(false);

  // On mount, check if there's an existing estimate matching this lead's address
  useEffect(() => {
    if (!user || loaded) return;

    const findExisting = async () => {
      if (lead.address) {
        // Try to find an existing estimate by street address match
        const { data } = await supabase
          .from("estimated_net_properties")
          .select("id")
          .eq("agent_id", user.id)
          .ilike("street_address", `%${lead.address.trim()}%`)
          .limit(1);

        if (data && data.length > 0) {
          setEditingId(data[0].id);
          setLoaded(true);
          return;
        }
      }

      // No existing estimate — pre-fill from lead data
      const addressParts = (lead.address || "").trim().match(/^(\d+)\s+(.+)$/);
      setInitialClient({
        id: "", // No client link — this is a lead
        firstName: lead.first_name || "",
        lastName: lead.last_name || "",
        streetNumber: addressParts?.[1] || undefined,
        streetName: addressParts?.[2] || undefined,
        city: lead.city || undefined,
        state: lead.state || undefined,
        zip: lead.zip || undefined,
        phone: lead.phone || undefined,
        email: lead.email || undefined,
      });
      setLoaded(true);
    };

    findExisting();
  }, [user, lead, loaded]);

  const handleFormSave = (propertyId: string, propertyData: PropertyData, targetView?: string) => {
    setCurrentPropertyId(propertyId);
    setCurrentPropertyData(propertyData);
    setEditingId(propertyId);
    queryClient.invalidateQueries({ queryKey: ["estimated-net-properties"] });

    const viewMap: Record<string, ViewState> = {
      'closing-costs': 'results',
      'offer-summary': 'offer-summary',
      'offer-letter': 'offer-letter',
      'important-dates': 'important-dates',
      'title-letter': 'title-letter',
      'agent-letter': 'agent-letter',
      'request-to-remedy': 'request-to-remedy',
      'settlement-statement': 'settlement-statement',
      'notices': 'notices',
      'property-notes': 'property-notes',
    };
    setViewState(viewMap[targetView || 'closing-costs'] || 'results');
  };

  const handleFormCancel = () => {
    if (onBack) onBack();
  };

  const handleBackToForm = () => {
    if (currentPropertyId) {
      setEditingId(currentPropertyId);
    }
    setViewState('form');
  };

  const handleEditEstimate = (id: string) => {
    setEditingId(id);
    setViewState('form');
  };

  const handleNavigate = (view: string) => {
    setViewState(view as ViewState);
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const wrapperClass = "[&_aside.w-56]:hidden";

  if (viewState === 'form') {
    return (
      <div className={wrapperClass}>
        <PropertyInputForm
          editingId={editingId}
          onSave={handleFormSave}
          onCancel={handleFormCancel}
          initialClient={initialClient}
          onClearInitialClient={() => setInitialClient(null)}
          hideSections={['parties', 'title-company', 'document-upload', 'contract-extra-fields', 'dates-timeline']}
        />
      </div>
    );
  }

  // All result/letter views
  if (currentPropertyData && currentPropertyId) {
    const commonProps = {
      propertyData: currentPropertyData,
      propertyId: currentPropertyId,
      onBack: handleBackToForm,
      onEdit: handleEditEstimate,
      onNavigate: handleNavigate,
    };

    const renderView = () => {
      switch (viewState) {
        case 'results':
          return <ClosingCostsView {...commonProps} />;
        case 'offer-letter':
          return <OfferLetterView {...commonProps} />;
        case 'offer-summary':
          return <OfferSummaryView {...commonProps} />;
        case 'important-dates':
          return <ImportantDatesView {...commonProps} />;
        case 'title-letter':
          return <TitleLetterView {...commonProps} />;
        case 'agent-letter':
          return <AgentLetterView {...commonProps} />;
        case 'request-to-remedy':
          return <RequestToRemedyView {...commonProps} />;
        case 'settlement-statement':
          return <SettlementStatementView {...commonProps} />;
        case 'notices':
          return <NoticesView {...commonProps} />;
        case 'clear-to-close-letter':
          return <ClearToCloseLetterView {...commonProps} />;
        case 'home-inspection-letter':
          return <HomeInspectionLetterView {...commonProps} />;
        case 'deposit-letter':
          return <DepositLetterView {...commonProps} />;
        case 'appraisal-letter':
          return <AppraisalLetterView {...commonProps} />;
        case 'loan-application-letter':
          return <LoanApplicationLetterView {...commonProps} />;
        case 'title-commitment-letter':
          return <TitleCommitmentLetterView {...commonProps} />;
        case 'closed-referral-letter':
          return <ClosedReferralLetterView {...commonProps} />;
        case 'ad-results-letter':
          return <AdResultsLetterView {...commonProps} />;
        case 'property-notes':
          return <PropertyNotesView {...commonProps} />;
      }
    };

    return <div className={wrapperClass}>{renderView()}</div>;
  }

  // Fallback — go back to form
  return (
    <div className={wrapperClass}>
      <PropertyInputForm
        editingId={editingId}
        onSave={handleFormSave}
        onCancel={handleFormCancel}
        initialClient={initialClient}
        onClearInitialClient={() => setInitialClient(null)}
        hideSections={['parties', 'title-company', 'document-upload', 'contract-extra-fields', 'dates-timeline']}
      />
    </div>
  );
};

export default LeadEstimatedNet;
