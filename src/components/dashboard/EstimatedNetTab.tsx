import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Calculator, Trash2, Edit, DollarSign, Users, FileText, Home } from "lucide-react";
import { PropertyData, EstimatedNetProperty } from "@/types/estimatedNet";
import { calculateClosingCosts, formatCurrency } from "@/utils/estimatedNetCalculations";
import PropertyInputForm from "./estimated-net/PropertyInputForm";
import ClosingCostsDisplay from "./estimated-net/ClosingCostsDisplay";

interface Client {
  id: string;
  first_name: string | null;
  last_name: string | null;
  street_number: string | null;
  street_name: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  email: string | null;
  phone: string | null;
  cell_phone: string | null;
  price: number | null;
  status: string | null;
  annual_taxes?: number | null;
}

const EstimatedNetTab = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [editingProperty, setEditingProperty] = useState<EstimatedNetProperty | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<EstimatedNetProperty | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [activeTab, setActiveTab] = useState("clients");

  // Fetch active clients (status = "A") - include annual_taxes
  const { data: activeClients, isLoading: loadingClients } = useQuery({
    queryKey: ["active-clients", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, street_number, street_name, city, state, zip, email, phone, cell_phone, price, status, annual_taxes")
        .eq("agent_id", user!.id)
        .eq("status", "A")
        .order("last_name", { ascending: true });
      
      if (error) throw error;
      return data as Client[];
    },
    enabled: !!user,
  });

  // Fetch existing estimates
  const { data: properties, isLoading: loadingProperties } = useQuery({
    queryKey: ["estimated-net-properties", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimated_net_properties")
        .select("*")
        .order("name", { ascending: true });
      
      if (error) throw error;
      return data as EstimatedNetProperty[];
    },
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("estimated_net_properties")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estimated-net-properties"] });
      toast({ title: "Property deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error deleting property", description: error.message, variant: "destructive" });
    },
  });

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setEditingProperty(null);
    setShowForm(true);
  };

  const handleNewProperty = () => {
    setSelectedClient(null);
    setEditingProperty(null);
    setShowForm(true);
  };

  const handleEditProperty = (property: EstimatedNetProperty) => {
    setSelectedClient(null);
    setEditingProperty(property);
    setShowForm(true);
  };

  const handleViewResults = (property: EstimatedNetProperty) => {
    setSelectedProperty(property);
    setShowResults(true);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingProperty(null);
    setSelectedClient(null);
    queryClient.invalidateQueries({ queryKey: ["estimated-net-properties"] });
    setActiveTab("estimates");
  };

  const getPropertyData = (property: EstimatedNetProperty): PropertyData => ({
    name: property.name,
    sellerPhone: property.seller_phone || "",
    sellerEmail: property.seller_email || "",
    streetAddress: property.street_address,
    city: property.city,
    state: property.state,
    zip: property.zip,
    offerPrice: Number(property.offer_price),
    firstMortgage: Number(property.first_mortgage),
    secondMortgage: Number(property.second_mortgage),
    listingAgentCommission: Number(property.listing_agent_commission),
    buyerAgentCommission: Number(property.buyer_agent_commission),
    closingCost: Number(property.closing_cost),
    typeOfLoan: property.type_of_loan || "Conventional",
    loanAppTimeFrame: property.loan_app_time_frame || "",
    loanCommitment: property.loan_commitment || "",
    preApprovalDays: property.pre_approval_days || 0,
    homeWarranty: Number(property.home_warranty),
    homeWarrantyCompany: property.home_warranty_company || "",
    deposit: Number(property.deposit),
    depositCollection: property.deposit_collection || "",
    inContract: property.in_contract || "",
    closingDate: property.closing_date || "",
    possession: property.possession || "",
    finalWalkThrough: property.final_walk_through || "",
    respondToOfferBy: property.respond_to_offer_by || "",
    inspectionDays: property.inspection_days || 0,
    remedyPeriodDays: property.remedy_period_days || 0,
    annualTaxes: Number(property.annual_taxes),
    firstHalfPaid: property.first_half_paid,
    secondHalfPaid: property.second_half_paid,
    taxDaysDueThisYear: property.tax_days_due_this_year || 0,
    daysFirstHalfTaxes: Number(property.days_first_half_taxes) || 0,
    daysSecondHalfTaxes: Number(property.days_second_half_taxes) || 0,
    agentName: property.agent_name || "",
    agentContact: property.agent_contact || "",
    agentEmail: property.agent_email || "",
    listingAgentName: property.listing_agent_name || "",
    listingAgentPhone: property.listing_agent_phone || "",
    listingAgentEmail: property.listing_agent_email || "",
    adminFee: Number(property.admin_fee),
    appliances: property.appliances || "",
    notes: property.notes || "",
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Estimated Net Calculator</h3>
          <p className="text-sm text-muted-foreground">Select a client or view existing estimates</p>
        </div>
        <Button onClick={handleNewProperty} variant="outline">
          <Plus className="w-4 h-4 mr-2" />
          Manual Entry
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="clients" className="gap-2">
            <Users className="w-4 h-4" />
            Active Clients ({activeClients?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="estimates" className="gap-2">
            <FileText className="w-4 h-4" />
            Saved Estimates ({properties?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="mt-4">
          {loadingClients ? (
            <div className="text-center py-12 text-muted-foreground">Loading clients...</div>
          ) : !activeClients || activeClients.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No active clients found. Add clients in the Clients tab first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeClients.map((client) => (
                <Card 
                  key={client.id} 
                  className="shadow-soft hover:shadow-medium transition-all cursor-pointer hover:border-primary/50"
                  onClick={() => handleSelectClient(client)}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Home className="w-4 h-4 text-muted-foreground" />
                      {client.first_name} {client.last_name}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {client.street_number} {client.street_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {client.city}, {client.state} {client.zip}
                    </p>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">List Price:</span>
                      <span className="font-medium">
                        {client.price ? formatCurrency(client.price) : "N/A"}
                      </span>
                    </div>
                    <Button className="w-full mt-3" size="sm">
                      <Calculator className="w-4 h-4 mr-2" />
                      Create Estimate
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="estimates" className="mt-4">
          {loadingProperties ? (
            <div className="text-center py-12 text-muted-foreground">Loading estimates...</div>
          ) : !properties || properties.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calculator className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No estimates yet. Select a client above to create one.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {properties.map((property) => {
                const propertyData = getPropertyData(property);
                const closingCosts = calculateClosingCosts(propertyData);
                
                return (
                  <Card key={property.id} className="shadow-soft hover:shadow-medium transition-shadow">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-semibold line-clamp-1">
                        {property.name}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {property.street_address}, {property.city}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Offer Price:</span>
                        <span className="font-medium">{formatCurrency(Number(property.offer_price))}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Estimated Net:</span>
                        <span className={`font-bold ${closingCosts.estimatedNet >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                          {formatCurrency(closingCosts.estimatedNet)}
                        </span>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1"
                          onClick={() => handleViewResults(property)}
                        >
                          <DollarSign className="w-3 h-3 mr-1" />
                          View
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleEditProperty(property)}
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => deleteMutation.mutate(property.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Property Input Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProperty ? "Edit Property" : selectedClient ? `Estimate for ${selectedClient.first_name} ${selectedClient.last_name}` : "New Estimated Net Calculation"}
            </DialogTitle>
          </DialogHeader>
          <PropertyInputForm 
            editingProperty={editingProperty}
            preselectedClient={selectedClient}
            onSuccess={handleFormSuccess}
            onCancel={() => setShowForm(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Closing Costs Results Dialog */}
      <Dialog open={showResults} onOpenChange={setShowResults}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Estimated Net Sheet</DialogTitle>
          </DialogHeader>
          {selectedProperty && (
            <ClosingCostsDisplay 
              propertyData={getPropertyData(selectedProperty)}
              onClose={() => setShowResults(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EstimatedNetTab;
