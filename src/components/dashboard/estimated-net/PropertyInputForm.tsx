import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PropertyData, EstimatedNetProperty } from "@/types/estimatedNet";
import { calculateTaxDaysDue } from "@/utils/estimatedNetCalculations";

interface PropertyInputFormProps {
  editingProperty: EstimatedNetProperty | null;
  onSuccess: () => void;
  onCancel: () => void;
}

const PropertyInputForm = ({ editingProperty, onSuccess, onCancel }: PropertyInputFormProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [clientSearch, setClientSearch] = useState("");
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);

  const [formData, setFormData] = useState<PropertyData>({
    name: "",
    sellerPhone: "",
    sellerEmail: "",
    streetAddress: "",
    city: "",
    state: "OH",
    zip: "",
    offerPrice: 0,
    firstMortgage: 0,
    secondMortgage: 0,
    listingAgentCommission: 1,
    buyerAgentCommission: 3,
    closingCost: 0,
    typeOfLoan: "Conventional",
    loanAppTimeFrame: "",
    loanCommitment: "",
    preApprovalDays: 0,
    homeWarranty: 0,
    homeWarrantyCompany: "",
    deposit: 1000,
    depositCollection: "Within 3 Days of Acceptance",
    inContract: "",
    closingDate: "",
    possession: "",
    finalWalkThrough: "48 hours prior to close",
    respondToOfferBy: "",
    inspectionDays: 7,
    remedyPeriodDays: 2,
    annualTaxes: 0,
    firstHalfPaid: false,
    secondHalfPaid: false,
    taxDaysDueThisYear: 0,
    daysFirstHalfTaxes: 0,
    daysSecondHalfTaxes: 0,
    agentName: "",
    agentContact: "",
    agentEmail: "",
    listingAgentName: "",
    listingAgentPhone: "",
    listingAgentEmail: "",
    adminFee: 499,
    appliances: "",
    notes: "",
  });

  // Load editing property data
  useEffect(() => {
    if (editingProperty) {
      setFormData({
        name: editingProperty.name,
        sellerPhone: editingProperty.seller_phone || "",
        sellerEmail: editingProperty.seller_email || "",
        streetAddress: editingProperty.street_address,
        city: editingProperty.city,
        state: editingProperty.state,
        zip: editingProperty.zip,
        offerPrice: Number(editingProperty.offer_price),
        firstMortgage: Number(editingProperty.first_mortgage),
        secondMortgage: Number(editingProperty.second_mortgage),
        listingAgentCommission: Number(editingProperty.listing_agent_commission),
        buyerAgentCommission: Number(editingProperty.buyer_agent_commission),
        closingCost: Number(editingProperty.closing_cost),
        typeOfLoan: editingProperty.type_of_loan || "Conventional",
        loanAppTimeFrame: editingProperty.loan_app_time_frame || "",
        loanCommitment: editingProperty.loan_commitment || "",
        preApprovalDays: editingProperty.pre_approval_days || 0,
        homeWarranty: Number(editingProperty.home_warranty),
        homeWarrantyCompany: editingProperty.home_warranty_company || "",
        deposit: Number(editingProperty.deposit),
        depositCollection: editingProperty.deposit_collection || "Within 3 Days of Acceptance",
        inContract: editingProperty.in_contract || "",
        closingDate: editingProperty.closing_date || "",
        possession: editingProperty.possession || "",
        finalWalkThrough: editingProperty.final_walk_through || "48 hours prior to close",
        respondToOfferBy: editingProperty.respond_to_offer_by || "",
        inspectionDays: editingProperty.inspection_days || 7,
        remedyPeriodDays: editingProperty.remedy_period_days || 2,
        annualTaxes: Number(editingProperty.annual_taxes),
        firstHalfPaid: editingProperty.first_half_paid,
        secondHalfPaid: editingProperty.second_half_paid,
        taxDaysDueThisYear: editingProperty.tax_days_due_this_year || 0,
        daysFirstHalfTaxes: Number(editingProperty.days_first_half_taxes) || 0,
        daysSecondHalfTaxes: Number(editingProperty.days_second_half_taxes) || 0,
        agentName: editingProperty.agent_name || "",
        agentContact: editingProperty.agent_contact || "",
        agentEmail: editingProperty.agent_email || "",
        listingAgentName: editingProperty.listing_agent_name || "",
        listingAgentPhone: editingProperty.listing_agent_phone || "",
        listingAgentEmail: editingProperty.listing_agent_email || "",
        adminFee: Number(editingProperty.admin_fee),
        appliances: editingProperty.appliances || "",
        notes: editingProperty.notes || "",
      });
    }
  }, [editingProperty]);

  // Search clients from Stay in Touch
  const { data: clients } = useQuery({
    queryKey: ["clients-search", clientSearch],
    queryFn: async () => {
      if (clientSearch.length < 2) return [];
      
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, street_number, street_name, city, state, zip, email, phone, cell_phone")
        .eq("agent_id", user!.id)
        .or(`first_name.ilike.%${clientSearch}%,last_name.ilike.%${clientSearch}%,street_name.ilike.%${clientSearch}%`)
        .limit(10);
      
      if (error) throw error;
      return data;
    },
    enabled: !!user && clientSearch.length >= 2,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const taxDaysDue = calculateTaxDaysDue(formData.closingDate);
      
      const propertyData = {
        agent_id: user!.id,
        name: formData.name,
        seller_phone: formData.sellerPhone || null,
        seller_email: formData.sellerEmail || null,
        street_address: formData.streetAddress,
        city: formData.city,
        state: formData.state,
        zip: formData.zip,
        offer_price: formData.offerPrice || 0,
        first_mortgage: formData.firstMortgage || 0,
        second_mortgage: formData.secondMortgage || 0,
        listing_agent_commission: formData.listingAgentCommission || 0,
        buyer_agent_commission: formData.buyerAgentCommission || 0,
        closing_cost: formData.closingCost || 0,
        type_of_loan: formData.typeOfLoan,
        loan_app_time_frame: formData.loanAppTimeFrame || null,
        loan_commitment: formData.loanCommitment || null,
        pre_approval_days: formData.preApprovalDays || 0,
        home_warranty: formData.homeWarranty || 0,
        home_warranty_company: formData.homeWarrantyCompany || null,
        deposit: formData.deposit || 0,
        deposit_collection: formData.depositCollection,
        in_contract: formData.inContract || null,
        closing_date: formData.closingDate || null,
        possession: formData.possession || null,
        final_walk_through: formData.finalWalkThrough || null,
        respond_to_offer_by: formData.respondToOfferBy || null,
        inspection_days: formData.inspectionDays || 0,
        remedy_period_days: formData.remedyPeriodDays || 0,
        annual_taxes: formData.annualTaxes || 0,
        first_half_paid: formData.firstHalfPaid,
        second_half_paid: formData.secondHalfPaid,
        tax_days_due_this_year: taxDaysDue,
        days_first_half_taxes: formData.daysFirstHalfTaxes || 0,
        days_second_half_taxes: formData.daysSecondHalfTaxes || 0,
        listing_agent_name: formData.listingAgentName || null,
        listing_agent_phone: formData.listingAgentPhone || null,
        listing_agent_email: formData.listingAgentEmail || null,
        agent_name: formData.agentName || null,
        agent_contact: formData.agentContact || null,
        agent_email: formData.agentEmail || null,
        admin_fee: formData.adminFee || 0,
        appliances: formData.appliances || null,
        notes: formData.notes || null,
      };

      if (editingProperty) {
        const { error } = await supabase
          .from("estimated_net_properties")
          .update(propertyData)
          .eq("id", editingProperty.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("estimated_net_properties")
          .insert(propertyData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: editingProperty ? "Property updated" : "Property saved" });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({ title: "Error saving property", description: error.message, variant: "destructive" });
    },
  });

  const handleSelectClient = (client: any) => {
    const streetAddress = [client.street_number, client.street_name].filter(Boolean).join(" ");
    setFormData(prev => ({
      ...prev,
      name: [client.first_name, client.last_name].filter(Boolean).join(" "),
      streetAddress,
      city: client.city || "",
      state: client.state || "OH",
      zip: client.zip || "",
      sellerPhone: client.cell_phone || client.phone || "",
      sellerEmail: client.email || "",
    }));
    setShowClientSuggestions(false);
    setClientSearch("");
    toast({ title: "Client loaded", description: `${client.first_name} ${client.last_name}` });
  };

  const updateField = (field: keyof PropertyData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate();
  };

  const taxDaysDue = calculateTaxDaysDue(formData.closingDate);
  const taxesDueAmount = Math.round((formData.annualTaxes / 365) * taxDaysDue);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Client Search */}
      <Card className="p-4">
        <h4 className="font-semibold mb-3">Search Stay in Touch Clients</h4>
        <div className="relative">
          <Input
            placeholder="Type name or address to search clients..."
            value={clientSearch}
            onChange={(e) => {
              setClientSearch(e.target.value);
              setShowClientSuggestions(true);
            }}
            onFocus={() => clients && clients.length > 0 && setShowClientSuggestions(true)}
          />
          {showClientSuggestions && clients && clients.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto">
              {clients.map((client) => (
                <div
                  key={client.id}
                  className="px-3 py-2 cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => handleSelectClient(client)}
                >
                  <div className="font-medium">{client.first_name} {client.last_name}</div>
                  <div className="text-sm text-muted-foreground">
                    {client.street_number} {client.street_name}, {client.city}, {client.state}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Seller & Property Details */}
      <Card className="p-4">
        <h4 className="font-semibold mb-3">Seller & Property Details</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>Street Address *</Label>
            <Input
              value={formData.streetAddress}
              onChange={(e) => updateField("streetAddress", e.target.value)}
              required
            />
          </div>
          <div>
            <Label>City *</Label>
            <Input
              value={formData.city}
              onChange={(e) => updateField("city", e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>State</Label>
              <Input
                value={formData.state}
                onChange={(e) => updateField("state", e.target.value)}
                maxLength={2}
              />
            </div>
            <div>
              <Label>Zip *</Label>
              <Input
                value={formData.zip}
                onChange={(e) => updateField("zip", e.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <Label>Seller(s) Name *</Label>
            <Input
              value={formData.name}
              onChange={(e) => updateField("name", e.target.value)}
              required
            />
          </div>
          <div>
            <Label>Seller Phone</Label>
            <Input
              value={formData.sellerPhone}
              onChange={(e) => updateField("sellerPhone", e.target.value)}
            />
          </div>
          <div>
            <Label>Seller Email</Label>
            <Input
              value={formData.sellerEmail}
              onChange={(e) => updateField("sellerEmail", e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* Financial Details */}
      <Card className="p-4">
        <h4 className="font-semibold mb-3">Financial Details</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Offer Price *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="number"
                value={formData.offerPrice || ""}
                onChange={(e) => updateField("offerPrice", parseFloat(e.target.value) || 0)}
                className="pl-7"
                required
              />
            </div>
          </div>
          <div>
            <Label>1st Mortgage</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="number"
                value={formData.firstMortgage || ""}
                onChange={(e) => updateField("firstMortgage", parseFloat(e.target.value) || 0)}
                className="pl-7"
              />
            </div>
          </div>
          <div>
            <Label>2nd Mortgage</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="number"
                value={formData.secondMortgage || ""}
                onChange={(e) => updateField("secondMortgage", parseFloat(e.target.value) || 0)}
                className="pl-7"
              />
            </div>
          </div>
          <div>
            <Label>Buyer Closing Cost</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="number"
                value={formData.closingCost || ""}
                onChange={(e) => updateField("closingCost", parseFloat(e.target.value) || 0)}
                className="pl-7"
              />
            </div>
          </div>
          <div>
            <Label>Listing Agent Commission (%)</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.listingAgentCommission || ""}
              onChange={(e) => updateField("listingAgentCommission", parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label>Buyer Agent Commission (%)</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.buyerAgentCommission || ""}
              onChange={(e) => updateField("buyerAgentCommission", parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label>Home Warranty</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="number"
                value={formData.homeWarranty || ""}
                onChange={(e) => updateField("homeWarranty", parseFloat(e.target.value) || 0)}
                className="pl-7"
              />
            </div>
          </div>
          <div>
            <Label>Admin Fee</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="number"
                value={formData.adminFee || ""}
                onChange={(e) => updateField("adminFee", parseFloat(e.target.value) || 0)}
                className="pl-7"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Tax Information */}
      <Card className="p-4">
        <h4 className="font-semibold mb-3">Tax Information</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Annual Taxes</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="number"
                value={formData.annualTaxes || ""}
                onChange={(e) => updateField("annualTaxes", parseFloat(e.target.value) || 0)}
                className="pl-7"
              />
            </div>
          </div>
          <div>
            <Label>Closing Date</Label>
            <Input
              type="date"
              value={formData.closingDate}
              onChange={(e) => updateField("closingDate", e.target.value)}
            />
          </div>
          <div>
            <Label>Taxes Due This Year</Label>
            <div className="text-lg font-semibold text-primary">${taxesDueAmount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Prorated ({taxDaysDue} days)</p>
          </div>
          <div>
            <Label>1st Half Paid?</Label>
            <div className="flex gap-4 mt-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={formData.firstHalfPaid}
                  onChange={() => updateField("firstHalfPaid", true)}
                />
                Yes
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={!formData.firstHalfPaid}
                  onChange={() => updateField("firstHalfPaid", false)}
                />
                No
              </label>
            </div>
            {!formData.firstHalfPaid && (
              <div className="relative mt-2">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  type="number"
                  value={formData.daysFirstHalfTaxes || ""}
                  onChange={(e) => updateField("daysFirstHalfTaxes", parseFloat(e.target.value) || 0)}
                  className="pl-7"
                  placeholder="Amount owed"
                />
              </div>
            )}
          </div>
          <div>
            <Label>2nd Half Paid?</Label>
            <div className="flex gap-4 mt-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={formData.secondHalfPaid}
                  onChange={() => updateField("secondHalfPaid", true)}
                />
                Yes
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={!formData.secondHalfPaid}
                  onChange={() => updateField("secondHalfPaid", false)}
                />
                No
              </label>
            </div>
            {!formData.secondHalfPaid && (
              <div className="relative mt-2">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  type="number"
                  value={formData.daysSecondHalfTaxes || ""}
                  onChange={(e) => updateField("daysSecondHalfTaxes", parseFloat(e.target.value) || 0)}
                  className="pl-7"
                  placeholder="Amount owed"
                />
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Notes */}
      <Card className="p-4">
        <h4 className="font-semibold mb-3">Notes</h4>
        <Textarea
          value={formData.notes}
          onChange={(e) => updateField("notes", e.target.value)}
          rows={3}
        />
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving..." : editingProperty ? "Update" : "Calculate & Save"}
        </Button>
      </div>
    </form>
  );
};

export default PropertyInputForm;
