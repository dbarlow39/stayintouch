import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, FileText, Trash2, Edit } from "lucide-react";
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
import ClientSelectionView from "./estimatedNet/ClientSelectionView";
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

type ViewState = 'list' | 'select-client' | 'form' | 'results' | 'offer-letter' | 'offer-summary' | 'important-dates' | 'title-letter' | 'agent-letter';

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
}

const EstimatedNetTab = ({ selectedClient, onClearSelectedClient }: EstimatedNetTabProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [viewState, setViewState] = useState<ViewState>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentPropertyId, setCurrentPropertyId] = useState<string | null>(null);
  const [currentPropertyData, setCurrentPropertyData] = useState<PropertyData | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [initialClient, setInitialClient] = useState<SelectedClientForEstimate | null>(null);

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

  // Fetch saved estimates
  const { data: estimates = [], isLoading } = useQuery({
    queryKey: ["estimated-net-properties", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimated_net_properties")
        .select("*")
        .eq("agent_id", user!.id)
        .order("name", { ascending: true });
      
      if (error) throw error;
      return data as EstimatedNetProperty[];
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
    email: string | null;
    annual_taxes: number | null;
  }) => {
    const phoneNumber = client.phone || client.cell_phone || undefined;
    let annualTaxes = client.annual_taxes || undefined;

    // If annual taxes are missing, look them up via Estated API
    if (!annualTaxes && client.street_number && client.street_name) {
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

        if (!error && data?.annual_amount) {
          annualTaxes = data.annual_amount;
          
          // Update the client record with the fetched tax data
          await supabase
            .from("clients")
            .update({ annual_taxes: annualTaxes })
            .eq("id", client.id);

          toast({
            title: "Tax data found",
            description: `Annual taxes of ${formatCurrency(annualTaxes)} retrieved and saved.`,
          });
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
      annualTaxes,
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

  const handleViewResults = async (id: string) => {
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
      loanAppTimeFrame: data.loan_app_time_frame || "",
      loanCommitment: data.loan_commitment || "",
      preApprovalDays: data.pre_approval_days ?? 0,
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
      adminFee: Number(data.admin_fee),
      appliances: data.appliances || "",
      notes: data.notes || "",
    };

    setCurrentPropertyId(id);
    setCurrentPropertyData(propertyData);
    setViewState('results');
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

  // Render based on current view state
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

  // List view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Estimated Net Sheets</h2>
          <p className="text-muted-foreground">Create and manage property estimates</p>
        </div>
        <Button onClick={handleNewEstimate}>
          <Plus className="mr-2 h-4 w-4" />
          New Estimate
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : estimates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No estimates yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create your first estimated net sheet to calculate seller proceeds.
            </p>
            <Button onClick={handleNewEstimate}>
              <Plus className="mr-2 h-4 w-4" />
              Create Estimate
            </Button>
          </CardContent>
        </Card>
      ) : (
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
              {estimates.map((estimate) => (
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
    </div>
  );
};

export default EstimatedNetTab;
