import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Calculator, Trash2, Edit, DollarSign } from "lucide-react";
import { PropertyData, EstimatedNetProperty } from "@/types/estimatedNet";
import { calculateClosingCosts, formatCurrency } from "@/utils/estimatedNetCalculations";
import PropertyInputForm from "./estimated-net/PropertyInputForm";
import ClosingCostsDisplay from "./estimated-net/ClosingCostsDisplay";

const EstimatedNetTab = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [editingProperty, setEditingProperty] = useState<EstimatedNetProperty | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<EstimatedNetProperty | null>(null);

  const { data: properties, isLoading } = useQuery({
    queryKey: ["estimated-net-properties", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimated_net_properties")
        .select("*")
        .order("created_at", { ascending: false });
      
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

  const handleNewProperty = () => {
    setEditingProperty(null);
    setShowForm(true);
  };

  const handleEditProperty = (property: EstimatedNetProperty) => {
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
    queryClient.invalidateQueries({ queryKey: ["estimated-net-properties"] });
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
          <p className="text-sm text-muted-foreground">Calculate seller net proceeds for your properties</p>
        </div>
        <Button onClick={handleNewProperty}>
          <Plus className="w-4 h-4 mr-2" />
          New Estimate
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading properties...</div>
      ) : !properties || properties.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Calculator className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No estimates yet. Create your first one to get started.</p>
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

      {/* Property Input Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProperty ? "Edit Property" : "New Estimated Net Calculation"}
            </DialogTitle>
          </DialogHeader>
          <PropertyInputForm 
            editingProperty={editingProperty}
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
