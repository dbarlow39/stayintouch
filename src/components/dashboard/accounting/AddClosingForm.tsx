import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useAgentsList } from "./useAgentsList";

interface AddClosingFormProps {
  onBack: () => void;
}

const AddClosingForm = ({ onBack }: AddClosingFormProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: agentOptions = [] } = useAgentsList();
  const [saving, setSaving] = useState(false);
  const [addressQuery, setAddressQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [lookupResult, setLookupResult] = useState<{ city: string; state: string; zip: string; annual_taxes: number; owner_name: string } | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const lookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Query clients for address autocomplete
  const { data: clientSuggestions = [] } = useQuery({
    queryKey: ["client-address-lookup", addressQuery],
    queryFn: async () => {
      if (addressQuery.length < 2) return [];
      // Search all clients (no status filter) by street name or number
      const q = addressQuery.trim();
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, street_number, street_name, city, state, zip, price, agent, phone, email, status")
        .or(`street_name.ilike.%${q}%,street_number.ilike.%${q}%`)
        .limit(20);
      if (error) throw error;
      return (data || []).filter(c => c.street_number || c.street_name);
    },
    enabled: addressQuery.length >= 2,
  });

  // Fallback: Estated property lookup when no client matches found
  useEffect(() => {
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    setLookupResult(null);

    if (addressQuery.length < 5 || clientSuggestions.length > 0) return;

    lookupTimerRef.current = setTimeout(async () => {
      setLookupLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("lookup-property", {
          body: { address: addressQuery, state: form.state || "OH" },
        });
        if (!error && data && !data.error && (data.city || data.zip)) {
          setLookupResult(data);
          setShowSuggestions(true);
        }
      } catch {
        // silently fail
      } finally {
        setLookupLoading(false);
      }
    }, 1000);

    return () => { if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current); };
  }, [addressQuery, clientSuggestions.length]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelectClient = (client: typeof clientSuggestions[0]) => {
    const address = [client.street_number, client.street_name].filter(Boolean).join(" ");
    
    // Try to match client.agent to an agent in the dropdown (fuzzy by last name)
    let matchedAgent = "";
    if (client.agent) {
      const clientAgentLower = client.agent.toLowerCase();
      const exactMatch = agentOptions.find(a => a.full_name.toLowerCase() === clientAgentLower);
      if (exactMatch) {
        matchedAgent = exactMatch.full_name;
      } else {
        // Try matching by last name
        const clientLastName = client.agent.split(" ").pop()?.toLowerCase() || "";
        const lastNameMatch = agentOptions.find(a => 
          a.full_name.toLowerCase().split(" ").pop() === clientLastName
        );
        if (lastNameMatch) matchedAgent = lastNameMatch.full_name;
      }
    }

    setForm(prev => ({
      ...prev,
      property_address: address,
      city: client.city || prev.city,
      state: client.state || prev.state,
      zip: client.zip || prev.zip,
      sale_price: client.price ? String(client.price) : prev.sale_price,
      agent_name: matchedAgent || prev.agent_name,
    }));
    setAddressQuery(address);
    setShowSuggestions(false);
  };

  const handleSelectLookup = () => {
    if (!lookupResult) return;
    setForm(prev => ({
      ...prev,
      city: lookupResult.city || prev.city,
      state: lookupResult.state || prev.state,
      zip: lookupResult.zip || prev.zip,
    }));
    setShowSuggestions(false);
    setLookupResult(null);
  };

  const [form, setForm] = useState({
    agent_name: "",
    property_address: "",
    city: "Columbus",
    state: "OH",
    zip: "",
    closing_date: "",
    sale_price: "",
    total_check: "",
    admin_fee: "499",
    company_split_pct: "40",
    agent_split_pct: "60",
    caliber_title_bonus: true,
    caliber_title_amount: "150",
    notes: "",
    check_status: "",
    paperwork_received: false,
  });

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const companyPct = parseFloat(form.company_split_pct) || 0;
  const agentPct = parseFloat(form.agent_split_pct) || 0;
  const salePrice = parseFloat(form.sale_price.replace(/,/g, "")) || 0;
  const calculatedCheck = salePrice > 0 ? Math.max(salePrice * 0.01, 2250) + 499 : 0;
  const totalCheck = form.total_check ? (parseFloat(form.total_check) || 0) : calculatedCheck;
  const adminFee = parseFloat(form.admin_fee) || 0;
  const totalCommission = totalCheck - adminFee;
  const companyShare = totalCommission * (companyPct / 100);
  const agentShare = totalCommission * (agentPct / 100);
  const caliberAmount = form.caliber_title_bonus ? (parseFloat(form.caliber_title_amount) || 150) : 0;
  const agentCheckTotal = agentShare + caliberAmount;

  const handleSplitChange = (field: "company_split_pct" | "agent_split_pct", value: string) => {
    const num = parseFloat(value) || 0;
    if (field === "company_split_pct") {
      setForm(prev => ({ ...prev, company_split_pct: value, agent_split_pct: String(100 - num) }));
    } else {
      setForm(prev => ({ ...prev, agent_split_pct: value, company_split_pct: String(100 - num) }));
    }
  };

  const handleSave = async () => {
    if (!user || !form.agent_name || !form.property_address || !form.closing_date) {
      toast.error("Please fill in agent name, property address, and closing date.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("closings").insert({
        agent_id: user.id,
        agent_name: form.agent_name,
        property_address: form.property_address,
        city: form.city,
        state: form.state,
        zip: form.zip,
        closing_date: form.closing_date,
        sale_price: parseFloat(form.sale_price) || 0,
        total_commission: totalCheck,
        admin_fee: adminFee,
        company_split_pct: companyPct,
        agent_split_pct: agentPct,
        company_share: companyShare,
        agent_share: agentShare,
        caliber_title_bonus: form.caliber_title_bonus,
        caliber_title_amount: caliberAmount > 0 ? caliberAmount : 150,
        notes: form.notes,
        status: form.check_status || "pending",
        paperwork_status: form.paperwork_received ? "received" : "pending",
        created_by: user.id,
      });
      if (error) throw error;
      toast.success("Closing logged successfully—you're almost there.");
      queryClient.invalidateQueries({ queryKey: ["accounting-closings-summary"] });
      onBack();
    } catch (err: any) {
      toast.error(err.message || "Failed to save closing");
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="mb-2">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
      </Button>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-medium">Add New Closing</CardTitle>
          <CardDescription>Enter the closing details. We'll calculate the split for you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Agent Name *</Label>
              <Select value={form.agent_name} onValueChange={v => update("agent_name", v)}>
                <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
                <SelectContent>
                  {agentOptions.map(a => (
                    <SelectItem key={a.id} value={a.full_name}>{a.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 relative" ref={suggestionsRef}>
              <Label>Property Address *</Label>
              <Input
                value={form.property_address}
                onChange={e => {
                  update("property_address", e.target.value);
                  setAddressQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => { if (clientSuggestions.length > 0 || lookupResult) setShowSuggestions(true); }}
                placeholder="123 Main St"
                autoComplete="off"
              />
              {showSuggestions && (clientSuggestions.length > 0 || lookupResult || lookupLoading) && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {clientSuggestions.length > 0 ? (
                    clientSuggestions.map(c => {
                      const addr = [c.street_number, c.street_name].filter(Boolean).join(" ");
                      const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex justify-between items-center"
                          onClick={() => handleSelectClient(c)}
                        >
                          <span className="font-medium">{addr}</span>
                          <span className="text-muted-foreground text-xs ml-2">{name}</span>
                        </button>
                      );
                    })
                  ) : lookupLoading ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">Looking up address...</div>
                  ) : lookupResult ? (
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                      onClick={handleSelectLookup}
                    >
                      <span className="font-medium">{form.property_address}</span>
                      <span className="text-muted-foreground text-xs ml-2">
                        {[lookupResult.city, lookupResult.state, lookupResult.zip].filter(Boolean).join(", ")}
                      </span>
                      {lookupResult.owner_name && (
                        <span className="text-muted-foreground text-xs ml-2">• {lookupResult.owner_name}</span>
                      )}
                    </button>
                  ) : null}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={form.city} onChange={e => update("city", e.target.value)} placeholder="Columbus" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>State</Label>
                <Input value={form.state} onChange={e => update("state", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Zip</Label>
                <Input value={form.zip} onChange={e => update("zip", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Closing Date *</Label>
              <Input type="date" value={form.closing_date} onChange={e => update("closing_date", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Sale Price</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="text"
                  inputMode="numeric"
                  className="pl-7"
                  value={form.sale_price ? Number(form.sale_price.replace(/,/g, "")).toLocaleString("en-US") : ""}
                  onChange={e => {
                    const raw = e.target.value.replace(/[^0-9]/g, "");
                    update("sale_price", raw);
                  }}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Total Check</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="text"
                  inputMode="numeric"
                  className="pl-7"
                  value={(() => {
                    const raw = form.total_check || (calculatedCheck > 0 ? String(calculatedCheck) : "");
                    const num = parseFloat(String(raw).replace(/,/g, ""));
                    return num ? num.toLocaleString("en-US") : "";
                  })()}
                  onChange={e => {
                    const raw = e.target.value.replace(/[^0-9.]/g, "");
                    update("total_check", raw);
                  }}
                  placeholder="Auto-calculated"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Admin Fee</Label>
              <Input type="number" value={form.admin_fee} onChange={e => update("admin_fee", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Total Commission</Label>
              <div className="flex items-center h-10 px-3 rounded-md border bg-muted/30 text-sm font-medium">
                {formatCurrency(totalCommission)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-8">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="check_received"
                checked={form.check_status === "received"}
                onCheckedChange={(checked) => setForm(prev => ({ ...prev, check_status: checked ? "received" : "" }))}
              />
              <Label htmlFor="check_received" className="cursor-pointer">Check Received</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="paperwork_received"
                checked={form.paperwork_received}
                onCheckedChange={(checked) => setForm(prev => ({ ...prev, paperwork_received: !!checked }))}
              />
              <Label htmlFor="paperwork_received" className="cursor-pointer">Paperwork Received</Label>
            </div>
          </div>

          {/* Caliber Title Bonus */}
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="caliber_title_add"
                checked={form.caliber_title_bonus}
                onCheckedChange={(checked) => setForm(prev => ({ ...prev, caliber_title_bonus: !!checked }))}
              />
              <Label htmlFor="caliber_title_add" className="cursor-pointer">Caliber Title Bonus</Label>
            </div>
            {form.caliber_title_bonus && (
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Amount:</Label>
                <Input
                  type="number"
                  value={form.caliber_title_amount}
                  onChange={e => update("caliber_title_amount", e.target.value)}
                  className="w-28"
                />
              </div>
            )}
          </div>

          {/* Split Calculator */}
          <Card className="bg-muted/30 border-0">
            <CardContent className="pt-6">
              <h3 className="text-sm font-medium mb-4">Commission Split Preview</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="space-y-2">
                  <Label>Company %</Label>
                  <Input type="number" value={form.company_split_pct} onChange={e => handleSplitChange("company_split_pct", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Agent %</Label>
                  <Input type="number" value={form.agent_split_pct} onChange={e => handleSplitChange("agent_split_pct", e.target.value)} />
                </div>
              </div>
              <div className={`grid ${form.caliber_title_bonus ? 'grid-cols-3' : 'grid-cols-2'} gap-4 text-center`}>
                <div className="bg-background rounded-lg p-4">
                  <p className="text-xs text-muted-foreground mb-1">Company Share</p>
                  <p className="text-lg font-semibold">{formatCurrency(companyShare)}</p>
                </div>
                <div className="bg-background rounded-lg p-4">
                  <p className="text-xs text-muted-foreground mb-1">Agent Share</p>
                  <p className="text-lg font-semibold text-emerald-700">{formatCurrency(agentShare)}</p>
                </div>
                {form.caliber_title_bonus && (
                  <div className="bg-background rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Agent Check Total</p>
                    <p className="text-xs text-muted-foreground mb-1">(incl. Caliber Bonus)</p>
                    <p className="text-lg font-semibold text-emerald-700">{formatCurrency(agentCheckTotal)}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>


          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => update("notes", e.target.value)} placeholder="Optional notes about this closing..." rows={3} />
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onBack}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-700 hover:bg-emerald-600 text-white">
              {saving ? "Saving..." : "Add Closing"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AddClosingForm;
