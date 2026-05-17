import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Download, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/utils/estimatedNetCalculations";

interface OfferComparisonViewProps {
  groupKey: string;
  onBack: () => void;
}

type Row = any;

// Map UI field key -> DB column + value type
type FieldDef = {
  key: string;
  label: string;
  type: "currency" | "text" | "days";
  // Read raw DB value from row (so we can derive display for non-DB-direct fields)
  read: (r: Row) => any;
  // DB column to write back to (null = not persisted, derived only)
  column: string | null;
};

const formatDate = (d?: string | null) => {
  if (!d) return "";
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  return d;
};

const fmt$ = (n: any) =>
  n == null || n === "" || Number.isNaN(Number(n)) ? "" : formatCurrency(Number(n));

const OfferComparisonView = ({ groupKey, onBack }: OfferComparisonViewProps) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  // overrides[offerId][fieldKey] = string the user typed
  const [overrides, setOverrides] = useState<Record<string, Record<string, string>>>({});
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: original } = await supabase
        .from("estimated_net_properties")
        .select("*")
        .eq("id", groupKey)
        .maybeSingle();

      const { data: children } = await supabase
        .from("estimated_net_properties")
        .select("*")
        .eq("parent_offer_id", groupKey);

      const list = [original, ...(children || [])].filter(Boolean) as Row[];
      list.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setRows(list);
      setLoading(false);
    })();
  }, [groupKey]);

  const fields: FieldDef[] = useMemo(
    () => [
      { key: "offer_price", label: "Price", type: "currency", column: "offer_price", read: (r) => r.offer_price },
      { key: "estimated_net", label: "Net to Seller", type: "currency", column: "estimated_net", read: (r) => r.estimated_net },
      { key: "lender_name", label: "Lender", type: "text", column: "lender_name", read: (r) => r.lender_name },
      {
        key: "cash_fin",
        label: "Cash/Fin",
        type: "text",
        column: "type_of_loan",
        read: (r) => r.type_of_loan || (Number(r.first_mortgage) > 0 ? "Financed" : "Cash"),
      },
      { key: "escalation_cap", label: "Escalation Cap", type: "currency", column: "escalation_cap", read: (r) => r.escalation_cap },
      { key: "appraisal_gap", label: "Appraisal Gap", type: "currency", column: "appraisal_gap", read: (r) => r.appraisal_gap },
      { key: "closing_cost", label: "Closing Cost", type: "currency", column: "closing_cost", read: (r) => r.closing_cost },
      { key: "appliances", label: "Appliances", type: "text", column: "appliances", read: (r) => r.appliances },
      { key: "inspection_days", label: "Home Inspection (days)", type: "days", column: "inspection_days", read: (r) => r.inspection_days },
      { key: "remedy_period_days", label: "Remedy Period (days)", type: "days", column: "remedy_period_days", read: (r) => r.remedy_period_days },
      { key: "home_warranty", label: "Home Warranty $", type: "currency", column: "home_warranty", read: (r) => r.home_warranty },
      { key: "home_warranty_company", label: "Home Warranty Co.", type: "text", column: "home_warranty_company", read: (r) => r.home_warranty_company },
      { key: "deposit", label: "Deposit", type: "currency", column: "deposit", read: (r) => r.deposit },
      { key: "closing_date", label: "Closing Date", type: "text", column: "closing_date", read: (r) => r.closing_date },
      { key: "possession", label: "Possession", type: "text", column: "possession", read: (r) => r.possession },
      {
        key: "coop_agent_name",
        label: "Agent (Co-op)",
        type: "text",
        // seller-rep => buyer's agent is in agent_name; buyer-rep => listing_agent_name
        column: "agent_name", // default; we override on save below
        read: (r) => (r.representation_type === "seller" ? r.agent_name : r.listing_agent_name),
      },
      {
        key: "coop_agent_phone",
        label: "Phone #",
        type: "text",
        column: "agent_contact",
        read: (r) => (r.representation_type === "seller" ? r.agent_contact : r.listing_agent_phone),
      },
      { key: "notes", label: "Misc", type: "text", column: "notes", read: (r) => r.notes },
    ],
    []
  );

  // The DB column to persist a given field for a given row (handles co-op agent branching)
  const columnFor = (f: FieldDef, r: Row): string | null => {
    if (f.key === "coop_agent_name") {
      return r.representation_type === "seller" ? "agent_name" : "listing_agent_name";
    }
    if (f.key === "coop_agent_phone") {
      return r.representation_type === "seller" ? "agent_contact" : "listing_agent_phone";
    }
    return f.column;
  };

  // Display value (override takes precedence; format currency/date)
  const displayValue = (f: FieldDef, r: Row): string => {
    const ov = overrides[r.id]?.[f.key];
    if (ov !== undefined) return ov;
    const raw = f.read(r);
    if (f.type === "currency") return raw == null || raw === "" ? "" : String(Number(raw));
    if (f.key === "closing_date") return formatDate(raw);
    return raw == null ? "" : String(raw);
  };

  const setOverride = (offerId: string, key: string, value: string) => {
    setOverrides((prev) => ({
      ...prev,
      [offerId]: { ...(prev[offerId] || {}), [key]: value },
    }));
  };

  const handleSaveEdits = async () => {
    setSaving(true);
    try {
      for (const r of rows) {
        const rowOverrides = overrides[r.id];
        if (!rowOverrides) continue;
        const update: Record<string, any> = {};
        for (const f of fields) {
          if (!(f.key in rowOverrides)) continue;
          const col = columnFor(f, r);
          if (!col) continue; // derived field, skip
          const raw = rowOverrides[f.key];
          if (f.type === "currency" || f.type === "days") {
            update[col] = raw === "" ? null : Number(raw);
          } else {
            update[col] = raw === "" ? null : raw;
          }
        }
        if (Object.keys(update).length > 0) {
          const { error } = await supabase
            .from("estimated_net_properties")
            .update(update)
            .eq("id", r.id);
          if (error) throw error;
        }
      }
      // Refresh rows so display reflects saved state, then clear overrides
      const { data: original } = await supabase
        .from("estimated_net_properties")
        .select("*")
        .eq("id", groupKey)
        .maybeSingle();
      const { data: children } = await supabase
        .from("estimated_net_properties")
        .select("*")
        .eq("parent_offer_id", groupKey);
      const list = [original, ...(children || [])].filter(Boolean) as Row[];
      list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      setRows(list);
      setOverrides({});
      toast({ title: "Edits saved", description: "Offer values updated." });
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // For PDF: render using formatted values from current display
  const renderCellForPdf = (f: FieldDef, r: Row): string => {
    const v = displayValue(f, r);
    if (v === "") return "";
    if (f.type === "currency") return fmt$(v);
    if (f.key === "closing_date") return formatDate(v);
    if (f.type === "days") return v ? `${v} days` : "";
    return v;
  };

  const handleDownloadPdf = async () => {
    if (!tableRef.current) return;
    setDownloading(true);
    try {
      const [{ jsPDF }, html2canvasMod] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);
      const html2canvas = (html2canvasMod as any).default || html2canvasMod;
      const canvas = await html2canvas(tableRef.current, { scale: 2, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const ratio = Math.min((pageW - 40) / canvas.width, (pageH - 40) / canvas.height);
      const w = canvas.width * ratio;
      const h = canvas.height * ratio;
      pdf.addImage(imgData, "PNG", (pageW - w) / 2, 20, w, h);
      const addr = rows[0]?.street_address || "offer-comparison";
      pdf.save(`Offer-Comparison-${addr.replace(/[^a-z0-9]/gi, "_")}.pdf`);
    } catch (e: any) {
      toast({ title: "PDF failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const hasEdits = Object.values(overrides).some((v) => Object.keys(v).length > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <h2 className="text-2xl font-bold">Offer Comparison</h2>
            <p className="text-muted-foreground">{rows[0]?.street_address}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleSaveEdits}
            disabled={!hasEdits || saving}
            className="bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-muted disabled:text-muted-foreground"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving…" : "Save Edits"}
          </Button>
          <Button onClick={handleDownloadPdf} disabled={downloading}>
            <Download className="h-4 w-4 mr-2" />
            {downloading ? "Generating…" : "Download PDF"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Tip: edit any cell below, then click Save Edits to persist, or Download PDF to export the current values.
      </p>

      <Card className="p-4 overflow-auto">
        {/* Editable table (on-screen) */}
        <table className="w-full border-collapse text-sm mb-6">
          <thead>
            <tr>
              <th className="border border-border bg-muted text-left p-2 w-48">Field</th>
              {rows.map((r, i) => (
                <th key={r.id} className="border border-border bg-muted text-left p-2">
                  {r.offer_label || `Offer #${i + 1}`}
                  {r.deal_status === "archived_offer" && (
                    <span className="ml-2 text-xs text-muted-foreground">(archived)</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.key}>
                <td className="border border-border p-2 font-semibold bg-muted/40">{f.label}</td>
                {rows.map((r) => (
                  <td key={r.id} className="border border-border p-1 align-top">
                    <input
                      type="text"
                      value={displayValue(f, r)}
                      onChange={(e) => setOverride(r.id, f.key, e.target.value)}
                      className="w-full px-2 py-1 bg-transparent focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {/* Read-only formatted snapshot used for the PDF render */}
        <div className="text-xs text-muted-foreground mb-2">PDF Preview:</div>
        <div ref={tableRef} className="bg-white text-black p-4">
          <h3 className="text-lg font-bold mb-3">
            Offer Comparison — {rows[0]?.street_address}, {rows[0]?.city}
          </h3>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-gray-400 bg-gray-100 text-left p-2 w-48">Field</th>
                {rows.map((r, i) => (
                  <th key={r.id} className="border border-gray-400 bg-gray-100 text-left p-2">
                    {r.offer_label || `Offer #${i + 1}`}
                    {r.deal_status === "archived_offer" && (
                      <span className="ml-2 text-xs text-gray-500">(archived)</span>
                    )}
                    {r.deal_status === "active" && rows.length > 1 && (
                      <span className="ml-2 text-xs text-green-700">(accepted)</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f.key}>
                  <td className="border border-gray-400 p-2 font-semibold bg-gray-50">{f.label}</td>
                  {rows.map((r) => (
                    <td key={r.id} className="border border-gray-400 p-2 align-top">
                      {renderCellForPdf(f, r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default OfferComparisonView;
