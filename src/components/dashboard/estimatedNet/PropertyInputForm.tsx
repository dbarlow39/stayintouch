import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PropertyData } from "@/types/estimatedNet";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, List, Download, Mail, Calendar, FileText, ArrowRight, DollarSign, ClipboardList } from "lucide-react";
import { getEmailClientPreference, openEmailClient } from "@/utils/emailClientUtils";

interface InitialClientData {
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

interface PropertyInputFormProps {
  editingId: string | null;
  onSave: (propertyId: string, propertyData: PropertyData, targetView?: string) => void;
  onCancel: () => void;
  initialClient?: InitialClientData | null;
  onClearInitialClient?: () => void;
}

const PropertyInputForm = ({ editingId, onSave, onCancel, initialClient, onClearInitialClient }: PropertyInputFormProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [linkedClientId, setLinkedClientId] = useState<string | null>(null);
  const [navigationTarget, setNavigationTarget] = useState<string>("closing-costs");
  
  const formRef = useRef<HTMLFormElement>(null);
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
    loanAppTimeFrame: "7",
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
    notes: ""
  });
  const [propertyMatches, setPropertyMatches] = useState<any[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [clientSuggestions, setClientSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const autocompleteTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hydratedKeyRef = useRef<string | null>(null);

  // Helper function to convert text to title case
  const toTitleCase = (text: string): string => {
    if (!text) return text;
    return text
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Load property data if editing
  useEffect(() => {
    const loadData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      if (editingId) {
        await loadProperty(editingId);
      } else {
        await loadUserDefaults(session.user.id);
      }
    };

    loadData();
  }, [editingId]);

  // Handle initial client from Clients tab
  useEffect(() => {
    if (initialClient && !editingId) {
      const streetAddress = [initialClient.streetNumber, initialClient.streetName]
        .filter(Boolean)
        .join(' ')
        .trim();
      
      setLinkedClientId(initialClient.id);
      setFormData(prev => ({
        ...prev,
        name: `${initialClient.firstName} ${initialClient.lastName}`.trim(),
        streetAddress,
        city: initialClient.city || prev.city,
        state: initialClient.state || prev.state,
        zip: initialClient.zip || prev.zip,
        sellerPhone: initialClient.phone ?? "",
        sellerEmail: initialClient.email ?? "",
        annualTaxes: initialClient.annualTaxes ?? prev.annualTaxes,
      }));
      
      // Clear the initial client after using it
      onClearInitialClient?.();
    }
  }, [initialClient, editingId, onClearInitialClient]);

  const hydrateMissingFromClient = async (
    clientId: string,
    current: { streetAddress: string; city: string; state: string; zip: string; sellerPhone: string; annualTaxes: number },
    opts?: { estimateId?: string | null }
  ) => {
    try {
      const { data: client, error } = await supabase
        .from("clients")
        .select("phone, cell_phone, home_phone, annual_taxes")
        .eq("id", clientId)
        .maybeSingle();

      if (error || !client) return;

      const fallbackPhone = client.phone || client.cell_phone || client.home_phone || "";
      const clientAnnualTaxes = client.annual_taxes != null ? Number(client.annual_taxes) : 0;
      const updatesForEstimate: Record<string, any> = {};

      // Fill missing seller phone
      if (!current.sellerPhone?.trim() && fallbackPhone) {
        setFormData(prev => ({
          ...prev,
          sellerPhone: prev.sellerPhone?.trim() ? prev.sellerPhone : fallbackPhone,
        }));

        if (opts?.estimateId) {
          updatesForEstimate.seller_phone = fallbackPhone;
        }
      }

      // Fill missing taxes from client, and if still missing try lookup by address
      const shouldLookupTaxes = (taxes: number) => !taxes || taxes <= 0;

      if (shouldLookupTaxes(current.annualTaxes) && clientAnnualTaxes > 0) {
        setFormData(prev => ({
          ...prev,
          annualTaxes: prev.annualTaxes > 0 ? prev.annualTaxes : clientAnnualTaxes,
        }));

        if (opts?.estimateId) {
          updatesForEstimate.annual_taxes = clientAnnualTaxes;
        }

        // Best-effort: persist immediately so the next edit load already has it.
        if (opts?.estimateId && Object.keys(updatesForEstimate).length > 0) {
          await supabase
            .from("estimated_net_properties")
            .update(updatesForEstimate)
            .eq("id", opts.estimateId);
        }
        return;
      }

      if (shouldLookupTaxes(current.annualTaxes) && current.streetAddress) {
        const { data: taxData, error: taxError } = await supabase.functions.invoke("lookup-property", {
          body: {
            address: current.streetAddress,
            city: current.city,
            state: current.state,
            zip: current.zip,
          },
        });

        const fetched = taxData?.annual_amount;
        const normalized = fetched != null ? Number(fetched) : 0;
        if (!taxError && normalized > 0) {
          setFormData(prev => ({
            ...prev,
            annualTaxes: prev.annualTaxes > 0 ? prev.annualTaxes : normalized,
          }));

          if (opts?.estimateId) {
            updatesForEstimate.annual_taxes = normalized;
          }

          // Cache onto client for next time (best-effort)
          if (!clientAnnualTaxes || clientAnnualTaxes <= 0) {
            await supabase
              .from("clients")
              .update({ annual_taxes: normalized })
              .eq("id", clientId);
          }

          // Best-effort: persist immediately so the next edit load already has it.
          if (opts?.estimateId && Object.keys(updatesForEstimate).length > 0) {
            await supabase
              .from("estimated_net_properties")
              .update(updatesForEstimate)
              .eq("id", opts.estimateId);
          }
        }
      }
    } catch (e) {
      console.error("hydrateMissingFromClient error:", e);
    }
  };

  const parseStreetAddress = (address: string): { streetNumber: string; streetName: string } | null => {
    const trimmed = (address || "").trim();
    // Handles: "113 Blackstone Ct", "7693 Mikayla Dr Apt B", etc.
    const match = trimmed.match(/^([0-9]+)\s+(.+)$/);
    if (!match) return null;
    return { streetNumber: match[1], streetName: match[2] };
  };

  const normalizeStreetNameForSearch = (streetName: string) => {
    // Drop unit/suite/apt fragments to make matching more reliable against imported CRM data.
    const withoutUnit = (streetName || "")
      .replace(/\b(apt|apartment|unit|ste|suite|#)\b.*$/i, "")
      .replace(/[,]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const tokens = withoutUnit.split(" ").filter(Boolean);
    // Use up to first 3 tokens (e.g. "Clubview Boulevard S" -> "Clubview Boulevard S")
    // but avoids including extra trailing descriptors that often vary.
    const base = tokens.slice(0, Math.min(tokens.length, 3)).join(" ");
    return { withoutUnit, base };
  };

  const findClientIdForAddress = async (
    agentId: string,
    address: { streetNumber: string; streetName: string },
    _city?: string,
    zip?: string
  ) => {
    const streetNumber = (address.streetNumber || "").trim();
    const { base } = normalizeStreetNameForSearch(address.streetName);

    // Zip is usually stable; city can vary/missing in imports, so don't require it.
    const run = async (withZip: boolean) => {
      const q = supabase
        .from("clients")
        .select("id")
        .eq("agent_id", agentId)
        // street_number values sometimes have trailing spaces from CSV imports; match either exact or prefix.
        .or(`street_number.eq.${streetNumber},street_number.ilike.${streetNumber}%`)
        .ilike("street_name", `%${base}%`)
        .limit(1);

      if (withZip && zip) q.eq("zip", zip);

      const { data, error } = await q;
      if (error) return null;
      return data?.[0]?.id ?? null;
    };

    // Try with zip first, then loosen.
    const withZip = await run(true);
    if (withZip) return withZip;
    return await run(false);
  };

  const hydrateMissingFromAddressLookup = async (
    current: { streetAddress: string; city: string; state: string; zip: string; annualTaxes: number },
    opts?: { estimateId?: string | null }
  ) => {
    try {
      if (!current.streetAddress) return;
      if (current.annualTaxes && current.annualTaxes > 0) return;

      const { data: taxData, error: taxError } = await supabase.functions.invoke("lookup-property", {
        body: {
          address: current.streetAddress,
          city: current.city,
          state: current.state,
          zip: current.zip,
        },
      });

      if (taxError) {
        console.error("lookup-property error:", taxError);
        return;
      }

      const fetched = taxData?.annual_amount;
      const normalized = fetched != null ? Number(fetched) : 0;
      if (normalized > 0) {
        setFormData(prev => ({
          ...prev,
          annualTaxes: prev.annualTaxes > 0 ? prev.annualTaxes : normalized,
        }));

        if (opts?.estimateId) {
          await supabase
            .from("estimated_net_properties")
            .update({ annual_taxes: normalized })
            .eq("id", opts.estimateId);
        }
      }
    } catch (e) {
      console.error("hydrateMissingFromAddressLookup error:", e);
    }
  };

  const loadUserDefaults = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("first_name, last_name, cell_phone, preferred_email")
        .eq("id", userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        const fullName = [data.first_name, data.last_name].filter(Boolean).join(' ');
        setFormData(prev => ({
          ...prev,
          listingAgentName: fullName || "",
          listingAgentPhone: data.cell_phone || "",
          listingAgentEmail: data.preferred_email || "",
        }));
      }
    } catch (error: any) {
      console.error("Error loading user defaults:", error);
    }
  };

  const loadProperty = async (id: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("estimated_net_properties")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      if (data) {
        setLinkedClientId(data.client_id ?? null);

        const nextFormData: PropertyData = {
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

        setFormData(nextFormData);

        // If this estimate isn't linked to a client yet, try to match by address so we can pull phone/taxes.
        let clientIdToUse = data.client_id ?? null;
        if (!clientIdToUse) {
          const { data: auth } = await supabase.auth.getUser();
          const agentId = auth.user?.id;
          const parsed = parseStreetAddress(nextFormData.streetAddress);
          if (agentId && parsed) {
            clientIdToUse = await findClientIdForAddress(agentId, parsed, nextFormData.city, nextFormData.zip);
            if (clientIdToUse) {
              setLinkedClientId(clientIdToUse);
              // best-effort: link the estimate to the client so future loads are instant
              await supabase
                .from("estimated_net_properties")
                .update({ client_id: clientIdToUse })
                .eq("id", id);
            }
          }
        }

        if (clientIdToUse) {
          await hydrateMissingFromClient(
            clientIdToUse,
            {
            streetAddress: nextFormData.streetAddress,
            city: nextFormData.city,
            state: nextFormData.state,
            zip: nextFormData.zip,
            sellerPhone: nextFormData.sellerPhone,
            annualTaxes: nextFormData.annualTaxes,
            },
            { estimateId: id }
          );
        } else {
          // Fallback: if taxes are missing, try lookup directly by the estimate address
          await hydrateMissingFromAddressLookup(
            {
            streetAddress: nextFormData.streetAddress,
            city: nextFormData.city,
            state: nextFormData.state,
            zip: nextFormData.zip,
            annualTaxes: nextFormData.annualTaxes,
            },
            { estimateId: id }
          );
        }
      }
    } catch (error: any) {
      toast({
        title: "Error loading property",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // For NEW estimates: once we have a linked client, fill missing seller phone/taxes automatically.
  useEffect(() => {
    if (!linkedClientId) return;
    if (loading) return;

    const key = `${linkedClientId}|${formData.streetAddress}|${formData.city}|${formData.zip}`;
    if (hydratedKeyRef.current === key) return;

    const needsPhone = !formData.sellerPhone?.trim();
    const needsTaxes = !formData.annualTaxes || formData.annualTaxes <= 0;
    if (!needsPhone && !needsTaxes) return;

    hydratedKeyRef.current = key;
    void hydrateMissingFromClient(
      linkedClientId,
      {
        streetAddress: formData.streetAddress,
        city: formData.city,
        state: formData.state,
        zip: formData.zip,
        sellerPhone: formData.sellerPhone,
        annualTaxes: formData.annualTaxes,
      },
      { estimateId: editingId }
    );
  }, [linkedClientId, formData.streetAddress, formData.city, formData.zip, formData.sellerPhone, formData.annualTaxes, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const taxDaysDue = calculateTaxDaysDue();
      
      const propertyData = {
        agent_id: user.id,
        client_id: linkedClientId,
        name: formData.name,
        seller_phone: formData.sellerPhone || null,
        seller_email: formData.sellerEmail || null,
        street_address: formData.streetAddress,
        city: formData.city,
        state: formData.state,
        zip: formData.zip,
        offer_price: Number(formData.offerPrice) || 0,
        first_mortgage: Number(formData.firstMortgage) || 0,
        second_mortgage: Number(formData.secondMortgage) || 0,
        listing_agent_commission: Number(formData.listingAgentCommission) || 0,
        buyer_agent_commission: Number(formData.buyerAgentCommission) || 0,
        closing_cost: Number(formData.closingCost) || 0,
        type_of_loan: formData.typeOfLoan,
        loan_app_time_frame: formData.loanAppTimeFrame || null,
        loan_commitment: formData.loanCommitment || null,
        pre_approval_days: Number(formData.preApprovalDays) || 0,
        home_warranty: Number(formData.homeWarranty) || 0,
        home_warranty_company: formData.homeWarrantyCompany,
        deposit: Number(formData.deposit) || 0,
        deposit_collection: formData.depositCollection,
        in_contract: formData.inContract || null,
        closing_date: formData.closingDate || null,
        possession: formData.possession || null,
        final_walk_through: formData.finalWalkThrough || null,
        respond_to_offer_by: formData.respondToOfferBy || null,
        inspection_days: Number(formData.inspectionDays) || 0,
        remedy_period_days: Number(formData.remedyPeriodDays) || 0,
        annual_taxes: Number(formData.annualTaxes) || 0,
        first_half_paid: formData.firstHalfPaid,
        second_half_paid: formData.secondHalfPaid,
        tax_days_due_this_year: taxDaysDue,
        days_first_half_taxes: Number(formData.daysFirstHalfTaxes) || 0,
        days_second_half_taxes: Number(formData.daysSecondHalfTaxes) || 0,
        agent_name: formData.agentName,
        agent_contact: formData.agentContact,
        agent_email: formData.agentEmail,
        listing_agent_name: formData.listingAgentName,
        listing_agent_phone: formData.listingAgentPhone,
        listing_agent_email: formData.listingAgentEmail,
        admin_fee: Number(formData.adminFee) || 0,
        appliances: formData.appliances,
        notes: formData.notes,
      };

      let savedId: string;

      if (editingId) {
        const { error } = await supabase
          .from("estimated_net_properties")
          .update(propertyData)
          .eq("id", editingId);

        if (error) throw error;
        savedId = editingId;
      } else {
        const { data, error } = await supabase
          .from("estimated_net_properties")
          .insert(propertyData)
          .select()
          .single();

        if (error) throw error;
        savedId = data.id;
      }

      const updatedFormData = {
        ...formData,
        taxDaysDueThisYear: taxDaysDue,
      };

      onSave(savedId, updatedFormData, navigationTarget);
    } catch (error: any) {
      toast({
        title: "Error saving property",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: keyof PropertyData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Search Stay in Touch clients database
  const searchClients = async (query: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('search-clients', {
        body: { searchQuery: query }
      });

      if (error) {
        console.error('Client search error:', error);
        return [];
      }

      return data?.clients || [];
    } catch (error) {
      console.error('Error searching clients:', error);
      return [];
    }
  };

  const handleAddressAutocomplete = async () => {
    if (!formData.streetAddress || formData.streetAddress.trim().length < 3) {
      setClientSuggestions([]);
      return;
    }

    try {
      const clientResults = await searchClients(formData.streetAddress);
      setClientSuggestions(clientResults);

      if (clientResults.length > 0) {
        setShowSuggestions(true);
      }
    } catch (error) {
      console.error('Error in autocomplete:', error);
    }
  };

  // Handle selecting a client from Stay in Touch
  const handleSelectClient = async (client: any) => {
    setFormData(prev => ({
      ...prev,
      name: client.name || `${client.firstName} ${client.lastName}`.trim(),
      streetAddress: client.streetAddress || `${client.streetNumber} ${client.streetName}`.trim(),
      city: client.city,
      state: client.state,
      zip: client.zip,
      sellerPhone: client.phone || "",
      sellerEmail: client.email || "",
    }));
    
    setShowSuggestions(false);
    setClientSuggestions([]);
    setLookingUp(true);

    // Look up property details using lookup-property edge function
    try {
      const { data, error } = await supabase.functions.invoke('lookup-property', {
        body: {
          address: client.streetAddress || `${client.streetNumber} ${client.streetName}`.trim(),
          city: client.city,
          state: client.state,
          zip: client.zip,
        }
      });

      if (!error && data?.matches?.length > 0) {
        const property = data.matches[0];
        
        setFormData(prev => ({
          ...prev,
          annualTaxes: property.taxes?.annual || prev.annualTaxes,
        }));

        toast({
          title: "Client & Property Found!",
          description: `Loaded ${client.name || `${client.firstName} ${client.lastName}`} from Stay in Touch`,
        });
      } else {
        toast({
          title: "Client Loaded",
          description: `${client.name || `${client.firstName} ${client.lastName}`} from Stay in Touch`,
        });
      }
    } catch (error: any) {
      console.error('Error looking up property:', error);
      toast({
        title: "Client Loaded",
        description: `${client.name || `${client.firstName} ${client.lastName}`} from Stay in Touch`,
      });
    } finally {
      setLookingUp(false);
    }
  };

  // Autocomplete effect with debouncing
  useEffect(() => {
    if (autocompleteTimeoutRef.current) {
      clearTimeout(autocompleteTimeoutRef.current);
    }

    if (formData.streetAddress.trim().length >= 3 && !editingId) {
      autocompleteTimeoutRef.current = setTimeout(() => {
        handleAddressAutocomplete();
      }, 300);
    } else if (formData.streetAddress.trim().length < 3) {
      setClientSuggestions([]);
      setShowSuggestions(false);
    }

    return () => {
      if (autocompleteTimeoutRef.current) {
        clearTimeout(autocompleteTimeoutRef.current);
      }
    };
  }, [formData.streetAddress, editingId]);

  // Calculate tax days due this year based on closing date
  const calculateTaxDaysDue = () => {
    if (!formData.closingDate) return 0;
    
    const closingDate = new Date(formData.closingDate);
    const startOfYear = new Date(closingDate.getFullYear(), 0, 1);
    const daysDifference = Math.floor((closingDate.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    return daysDifference;
  };

  const taxDaysDue = calculateTaxDaysDue();
  const taxesDueAmount = Math.round((formData.annualTaxes / 365) * taxDaysDue);

  const handleAcceptAddress = () => {
    const selectedIndex = parseInt(selectedPropertyId);
    if (isNaN(selectedIndex) || !propertyMatches[selectedIndex]) return;
    const selectedProperty = propertyMatches[selectedIndex];

    setFormData(prev => ({
      ...prev,
      name: selectedProperty.owner ? toTitleCase(selectedProperty.owner) : prev.name,
      streetAddress: selectedProperty.address?.street ? toTitleCase(selectedProperty.address.street) : prev.streetAddress,
      city: selectedProperty.address?.city ? toTitleCase(selectedProperty.address.city) : prev.city,
      state: selectedProperty.address?.state || prev.state,
      zip: selectedProperty.address?.zip || prev.zip,
      annualTaxes: selectedProperty.taxes?.annual || prev.annualTaxes,
    }));

    toast({
      title: "Property Found!",
      description: "Property information loaded successfully",
    });

    setPropertyMatches([]);
    setSelectedPropertyId("");
  };

  const handleRejectAddress = () => {
    setPropertyMatches([]);
    setSelectedPropertyId("");
  };

  const triggerSubmitAndNavigate = (target: string) => {
    setNavigationTarget(target);
    setTimeout(() => formRef.current?.requestSubmit(), 0);
  };


  const navigationItems = [
    {
      label: "Back",
      icon: ArrowLeft,
      onClick: onCancel,
    },
    {
      label: "Back to Property Info",
      icon: ArrowLeft,
      onClick: () => {},
      disabled: true,
    },
    {
      label: "My Properties",
      icon: List,
      onClick: onCancel,
    },
    {
      label: "Estimated Net",
      icon: DollarSign,
      onClick: () => triggerSubmitAndNavigate("closing-costs"),
    },
    {
      label: "Offer Summary",
      icon: ClipboardList,
      onClick: () => triggerSubmitAndNavigate("offer-summary"),
    },
    {
      label: "Offer Letter",
      icon: Mail,
      onClick: () => triggerSubmitAndNavigate("offer-letter"),
    },
    {
      label: "Important Dates Letter",
      icon: Calendar,
      onClick: () => triggerSubmitAndNavigate("important-dates"),
    },
    {
      label: "Title Letter",
      icon: Mail,
      onClick: () => triggerSubmitAndNavigate("title-letter"),
    },
    {
      label: "Agent Letter",
      icon: Mail,
      onClick: () => triggerSubmitAndNavigate("agent-letter"),
    },
    {
      label: "Request to Remedy",
      icon: FileText,
      onClick: () => triggerSubmitAndNavigate("request-to-remedy"),
    },
    {
      label: "Settlement Statement",
      icon: FileText,
      onClick: () => triggerSubmitAndNavigate("settlement-statement"),
    },
    {
      label: "Notices",
      icon: Mail,
      onClick: () => triggerSubmitAndNavigate("notices"),
    },
  ];

  return (
    <div className="flex w-full min-h-[600px]">
      {/* Left Sidebar Navigation */}
      <aside className="w-56 p-3 border-r bg-card shrink-0">
        <div className="space-y-1">
          {navigationItems.map((item, idx) => (
            <Button
              key={idx}
              variant="ghost"
              className={`w-full justify-start text-left h-auto py-2 px-3 ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={item.disabled ? undefined : item.onClick}
              disabled={item.disabled}
              type="button"
            >
              <item.icon className="mr-2 h-4 w-4 shrink-0" />
              <span className="text-sm">{item.label}</span>
            </Button>
          ))}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 py-4 px-6 overflow-auto">
        <div className="max-w-4xl">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-foreground">
              {editingId ? "Edit Property" : "Property Information"}
            </h2>
            <p className="text-muted-foreground">Enter property and offer details</p>
          </div>

          <form ref={formRef} onSubmit={handleSubmit}>
        <Card className="p-6 mb-6">
          <h3 className="text-xl font-semibold mb-4 text-foreground">Seller(s) & Property Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="streetAddress">
                Street Address
                {lookingUp && <span className="text-muted-foreground text-xs ml-2">(loading property details...)</span>}
              </Label>
              <div className="relative">
                <Input
                  id="streetAddress"
                  value={formData.streetAddress}
                  onChange={(e) => {
                    updateField("streetAddress", e.target.value);
                    if (e.target.value.length >= 3) {
                      setShowSuggestions(true);
                    }
                  }}
                  onFocus={() => {
                    if (clientSuggestions.length > 0) {
                      setShowSuggestions(true);
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowSuggestions(false), 200);
                  }}
                  required
                  placeholder="Start typing a name or address..."
                  autoComplete="off"
                />
                {showSuggestions && clientSuggestions.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-80 overflow-auto">
                    <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted border-b border-border">
                      Stay in Touch Clients
                    </div>
                    {clientSuggestions.map((client, idx) => (
                      <div
                        key={`client-${idx}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectClient(client);
                        }}
                        className="px-3 py-2 cursor-pointer hover:bg-accent transition-colors border-b border-border"
                      >
                        <div className="text-sm font-medium text-primary">
                          {client.name || `${client.firstName} ${client.lastName}`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {client.streetAddress}, {client.city}, {client.state} {client.zip}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => updateField("city", e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={formData.state}
                  onChange={(e) => updateField("state", e.target.value)}
                  maxLength={2}
                  required
                />
              </div>
              <div>
                <Label htmlFor="zip">Zip</Label>
                <Input
                  id="zip"
                  value={formData.zip}
                  onChange={(e) => updateField("zip", e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="name">Seller(s) Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => updateField("name", e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="sellerPhone">Seller Phone</Label>
              <div className="relative">
                <Input
                  id="sellerPhone"
                  type="tel"
                  value={formData.sellerPhone}
                  onChange={(e) => updateField("sellerPhone", e.target.value)}
                  className="pr-10"
                />
                {formData.sellerPhone && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 text-primary hover:text-primary/80"
                    onClick={() => window.open(`tel:${formData.sellerPhone}`, '_self')}
                    title="Call this number"
                  >
                    <span className="text-xs font-bold">📞</span>
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="sellerEmail">Seller Email(s)</Label>
              <div className="relative">
                <Input
                  id="sellerEmail"
                  type="text"
                  value={formData.sellerEmail}
                  onChange={(e) => updateField("sellerEmail", e.target.value)}
                  placeholder="email@example.com, email2@example.com"
                  className="pr-10"
                />
                {formData.sellerEmail && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 text-primary hover:text-primary/80"
                    onClick={() => openEmailClient(formData.sellerEmail.split(',')[0].trim())}
                    title="Send Email"
                  >
                    <Mail className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Separate multiple emails with commas
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 mb-6">
          <h3 className="text-xl font-semibold mb-4 text-foreground">Listing Agent</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="listingAgentName">Listing Agent Name</Label>
              <Input
                id="listingAgentName"
                value={formData.listingAgentName}
                onChange={(e) => updateField("listingAgentName", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="listingAgentPhone">Listing Agent Phone Number</Label>
              <div className="relative">
                <Input
                  id="listingAgentPhone"
                  type="tel"
                  value={formData.listingAgentPhone}
                  onChange={(e) => updateField("listingAgentPhone", e.target.value)}
                  className="pr-10"
                />
                {formData.listingAgentPhone && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 text-primary hover:text-primary/80"
                    onClick={() => window.open(`tel:${formData.listingAgentPhone}`, '_self')}
                    title="Call this number"
                  >
                    <span className="text-xs font-bold">📞</span>
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="listingAgentEmail">Listing Agent Email</Label>
              <div className="relative">
                <Input
                  id="listingAgentEmail"
                  type="email"
                  value={formData.listingAgentEmail}
                  onChange={(e) => updateField("listingAgentEmail", e.target.value)}
                  className="pr-10"
                />
                {formData.listingAgentEmail && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 text-primary hover:text-primary/80"
                    onClick={() => openEmailClient(formData.listingAgentEmail)}
                    title="Send Email"
                  >
                    <Mail className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6 mb-6">
          <h3 className="text-xl font-semibold mb-4 text-foreground">Contract Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="offerPrice">Offer Price</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="offerPrice"
                  type="number"
                  value={formData.offerPrice || ""}
                  onChange={(e) => updateField("offerPrice", parseFloat(e.target.value) || 0)}
                  required
                  className="pl-7"
                  placeholder="0"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="firstMortgage">1st Mortgage</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="firstMortgage"
                  type="number"
                  value={formData.firstMortgage || ""}
                  onChange={(e) => updateField("firstMortgage", parseFloat(e.target.value) || 0)}
                  className="pl-7"
                  placeholder="0"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="secondMortgage">2nd Mortgage</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="secondMortgage"
                  type="number"
                  value={formData.secondMortgage || ""}
                  onChange={(e) => updateField("secondMortgage", parseFloat(e.target.value) || 0)}
                  className="pl-7"
                  placeholder="0"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="closingCost">Closing Cost</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="closingCost"
                  type="number"
                  value={formData.closingCost || ""}
                  onChange={(e) => updateField("closingCost", parseFloat(e.target.value) || 0)}
                  className="pl-7"
                  placeholder="0"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="listingAgentCommission">Listing Agent Commission (%)</Label>
              <Input
                id="listingAgentCommission"
                type="number"
                step="0.01"
                value={formData.listingAgentCommission || ""}
                onChange={(e) => updateField("listingAgentCommission", parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div>
              <Label htmlFor="buyerAgentCommission">Buyer Agent Commission (%)</Label>
              <Input
                id="buyerAgentCommission"
                type="number"
                step="0.01"
                value={formData.buyerAgentCommission || ""}
                onChange={(e) => updateField("buyerAgentCommission", parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div>
              <Label htmlFor="typeOfLoan">Type of Loan</Label>
              <Select value={formData.typeOfLoan} onValueChange={(value) => updateField("typeOfLoan", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Conventional">Conventional</SelectItem>
                  <SelectItem value="FHA">FHA</SelectItem>
                  <SelectItem value="VA">VA</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="preApprovalDays">(3.2a) Lender Pre-Qualification (Days Due)</Label>
              <Input
                id="preApprovalDays"
                type="number"
                value={formData.preApprovalDays ?? ""}
                onChange={(e) => updateField("preApprovalDays", parseInt(e.target.value) || 0)}
                placeholder="0 = Received or 2 = Contract Default"
              />
            </div>
            <div>
              <Label htmlFor="loanAppTimeFrame">(3.2b) Loan Application</Label>
              <Input
                id="loanAppTimeFrame"
                type="number"
                value={formData.loanAppTimeFrame ?? ""}
                onChange={(e) => updateField("loanAppTimeFrame", e.target.value)}
                placeholder="7"
              />
            </div>
            <div>
              <Label htmlFor="loanCommitment">Loan Commitment (Days Due)</Label>
              <Input
                id="loanCommitment"
                value={formData.loanCommitment}
                onChange={(e) => updateField("loanCommitment", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="inspectionDays">Home Inspection (Days)</Label>
              <Input
                id="inspectionDays"
                type="number"
                value={formData.inspectionDays || ""}
                onChange={(e) => updateField("inspectionDays", parseInt(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div>
              <Label htmlFor="remedyPeriodDays">Remedy Period (Days)</Label>
              <Input
                id="remedyPeriodDays"
                type="number"
                value={formData.remedyPeriodDays || ""}
                onChange={(e) => updateField("remedyPeriodDays", parseInt(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div>
              <Label htmlFor="homeWarrantyCompany">Home Warranty Company</Label>
              <Input
                id="homeWarrantyCompany"
                value={formData.homeWarrantyCompany}
                onChange={(e) => updateField("homeWarrantyCompany", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="homeWarranty">Home Warranty Cost</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="homeWarranty"
                  type="number"
                  value={formData.homeWarranty || ""}
                  onChange={(e) => updateField("homeWarranty", parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className="pl-7"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="deposit">Earnest Money Deposit</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="deposit"
                  type="number"
                  value={formData.deposit || ""}
                  onChange={(e) => updateField("deposit", parseFloat(e.target.value) || 0)}
                  className="pl-7"
                  placeholder="0"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="depositCollection">Deposit Collection</Label>
              <Select value={formData.depositCollection} onValueChange={(value) => updateField("depositCollection", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Within 3 Days of Acceptance">Within 3 Days of Acceptance</SelectItem>
                  <SelectItem value="Within 3 Days of Remedy Expiration">Within 3 Days of Remedy Expiration</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="finalWalkThrough">Final Walk-thru</Label>
              <Input
                id="finalWalkThrough"
                value={formData.finalWalkThrough}
                onChange={(e) => updateField("finalWalkThrough", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="adminFee">Admin Fee</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="adminFee"
                  type="number"
                  value={formData.adminFee || ""}
                  onChange={(e) => updateField("adminFee", parseFloat(e.target.value) || 0)}
                  className="pl-7"
                  placeholder="0"
                />
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6 mb-6">
          <h3 className="text-xl font-semibold mb-4 text-foreground">Dates & Timeline</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="closingDate">Closing Date</Label>
              <Input
                id="closingDate"
                type="date"
                value={formData.closingDate}
                onChange={(e) => updateField("closingDate", e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="possession">Possession Date</Label>
              <Input
                id="possession"
                type="date"
                value={formData.possession}
                onChange={(e) => updateField("possession", e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="respondToOfferBy">Respond to Offer By</Label>
              <Input
                id="respondToOfferBy"
                value={formData.respondToOfferBy}
                onChange={(e) => updateField("respondToOfferBy", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="inContract">In Contract Date</Label>
              <Input
                id="inContract"
                type="date"
                value={formData.inContract}
                onChange={(e) => updateField("inContract", e.target.value)}
              />
            </div>
          </div>
        </Card>

        <Card className="p-6 mb-6">
          <h3 className="text-xl font-semibold mb-4 text-foreground">Tax Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="annualTaxes">Annual Taxes</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="annualTaxes"
                  type="number"
                  value={formData.annualTaxes || ""}
                  onChange={(e) => updateField("annualTaxes", parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className="pl-7"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="taxesDueThisYear">Taxes Due This Year (2026)</Label>
              <Input
                id="taxesDueThisYear"
                type="text"
                value={new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0
                }).format(taxesDueAmount)}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Prorated from Jan 1 to closing date ({taxDaysDue} days)
              </p>
            </div>
            <div>
              <Label>1st Half Paid 2025</Label>
              <div className="flex gap-4 mt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="firstHalfPaid"
                    checked={formData.firstHalfPaid === true}
                    onChange={() => updateField("firstHalfPaid", true)}
                    className="w-4 h-4 text-primary"
                  />
                  <span>Yes</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="firstHalfPaid"
                    checked={formData.firstHalfPaid === false}
                    onChange={() => updateField("firstHalfPaid", false)}
                    className="w-4 h-4 text-primary"
                  />
                  <span>No</span>
                </label>
              </div>
              <div className="relative mt-2">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  type="number"
                  value={formData.firstHalfPaid ? 0 : (formData.daysFirstHalfTaxes || Math.round(formData.annualTaxes / 2))}
                  onChange={(e) => updateField("daysFirstHalfTaxes", parseInt(e.target.value) || 0)}
                  placeholder="0"
                  className="pl-7"
                  disabled={formData.firstHalfPaid}
                />
              </div>
            </div>
            <div>
              <Label>2nd Half Paid 2025</Label>
              <div className="flex gap-4 mt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="secondHalfPaid"
                    checked={formData.secondHalfPaid === true}
                    onChange={() => updateField("secondHalfPaid", true)}
                    className="w-4 h-4 text-primary"
                  />
                  <span>Yes</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="secondHalfPaid"
                    checked={formData.secondHalfPaid === false}
                    onChange={() => updateField("secondHalfPaid", false)}
                    className="w-4 h-4 text-primary"
                  />
                  <span>No</span>
                </label>
              </div>
              <div className="relative mt-2">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  type="number"
                  value={formData.secondHalfPaid ? 0 : (formData.daysSecondHalfTaxes || Math.round(formData.annualTaxes / 2))}
                  onChange={(e) => updateField("daysSecondHalfTaxes", parseInt(e.target.value) || 0)}
                  placeholder="0"
                  className="pl-7"
                  disabled={formData.secondHalfPaid}
                />
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6 mb-6">
          <h3 className="text-xl font-semibold mb-4 text-foreground">Buyer Agent Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="agentName">Buyer Agent Name</Label>
              <Input
                id="agentName"
                value={formData.agentName}
                onChange={(e) => updateField("agentName", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="agentContact">Buyer Agent Cell Phone</Label>
              <Input
                id="agentContact"
                value={formData.agentContact}
                onChange={(e) => updateField("agentContact", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="agentEmail">Buyer Agent Email</Label>
              <Input
                id="agentEmail"
                type="email"
                value={formData.agentEmail}
                onChange={(e) => updateField("agentEmail", e.target.value)}
              />
            </div>
          </div>
        </Card>

        <Card className="p-6 mb-6">
          <h3 className="text-xl font-semibold mb-4 text-foreground">Additional Information</h3>
          <div className="space-y-4">
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                rows={4}
              />
            </div>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" className="text-lg px-8" disabled={loading}>
            {loading ? "Saving..." : editingId ? "Update & Calculate →" : "Calculate Closing Costs →"}
          </Button>
        </div>
      </form>

      {/* Property Selection Dialog */}
      <Dialog open={propertyMatches.length > 0} onOpenChange={(open) => {
        if (!open) {
          handleRejectAddress();
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Property</DialogTitle>
            <DialogDescription>
              Multiple properties were found. Please select the correct one:
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3">
            {propertyMatches.map((property, index) => (
              <Card 
                key={index}
                className={`p-4 cursor-pointer transition-all hover:border-primary ${
                  selectedPropertyId === index.toString() ? 'border-primary bg-accent' : ''
                }`}
                onClick={() => setSelectedPropertyId(index.toString())}
              >
                <div className="space-y-2">
                  <div className="font-semibold">
                    {property.address?.street_address || 'Unknown Address'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {property.address?.city}, {property.address?.state} {property.address?.zip}
                  </div>
                  {property.owner && (
                    <div className="text-sm">
                      <span className="font-medium">Owner:</span> {property.owner}
                    </div>
                  )}
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    {property.structure?.sqft && <span>{property.structure.sqft} sq ft</span>}
                    {property.structure?.beds && <span>{property.structure.beds} beds</span>}
                    {property.structure?.baths && <span>{property.structure.baths} baths</span>}
                  </div>
                  {property.taxes?.annual && (
                    <div className="text-sm">
                      <span className="font-medium">Annual Taxes:</span> ${property.taxes.annual.toLocaleString()}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleRejectAddress}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (selectedPropertyId) {
                  handleAcceptAddress();
                } else {
                  toast({
                    title: "No Selection",
                    description: "Please select a property first",
                    variant: "destructive"
                  });
                }
              }}
              disabled={!selectedPropertyId}
            >
              Use Selected Property
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </div>
      </div>
    </div>
  );
};

export default PropertyInputForm;
