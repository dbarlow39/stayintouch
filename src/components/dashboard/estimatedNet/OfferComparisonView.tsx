import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/utils/estimatedNetCalculations";

interface OfferComparisonViewProps {
  groupKey: string; // either the parent offer id or the original-offer id
  onBack: () => void;
}

type Row = any;

const formatDate = (d?: string | null) => {
  if (!d) return "";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  return d;
};

const fmt$ = (n: any) => (n == null || n === "" || Number.isNaN(Number(n)) ? "" : formatCurrency(Number(n)));

const OfferComparisonView = ({ groupKey, onBack }: OfferComparisonViewProps) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Group = the row with id=groupKey PLUS all rows where parent_offer_id=groupKey
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
      setLoading(false);
    })();
  }, [groupKey]);

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

  const fields: { label: string; render: (r: Row) => string }[] = [
    { label: "Price", render: (r) => fmt$(r.offer_price) },
    { label: "Lender", render: (r) => r.lender_name || "" },
    { label: "Cash/Fin", render: (r) => (Number(r.first_mortgage) > 0 ? "Financed" : "Cash") },
    { label: "Escalation Cap", render: (r) => fmt$(r.escalation_cap) },
    { label: "Appraisal Gap", render: (r) => fmt$(r.appraisal_gap) },
    { label: "Closing Cost", render: (r) => fmt$(r.closing_cost) },
    { label: "Appliances", render: (r) => r.appliances || "" },
    { label: "Home Inspection", render: (r) => (r.inspection_days ? `${r.inspection_days} days` : "") },
    { label: "Remedy Period", render: (r) => (r.remedy_period_days ? `${r.remedy_period_days} days` : "") },
    {
      label: "Home Warranty",
      render: (r) =>
        Number(r.home_warranty) > 0
          ? `${fmt$(r.home_warranty)}${r.home_warranty_company ? ` (${r.home_warranty_company})` : ""}`
          : "",
    },
    { label: "Deposit", render: (r) => fmt$(r.deposit) },
    { label: "Closing Date", render: (r) => formatDate(r.closing_date) },
    { label: "Possession", render: (r) => r.possession || "" },
    {
      label: "Agent",
      render: (r) => (r.representation_type === "buyer" ? r.agent_name : r.listing_agent_name) || "",
    },
    {
      label: "Phone #",
      render: (r) => (r.representation_type === "buyer" ? r.agent_contact : r.listing_agent_phone) || "",
    },
    { label: "Misc", render: (r) => r.notes || "" },
  ];

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
        <Button onClick={handleDownloadPdf} disabled={downloading}>
          <Download className="h-4 w-4 mr-2" />
          {downloading ? "Generating…" : "Download PDF"}
        </Button>
      </div>

      <Card className="p-4 overflow-auto">
        <div ref={tableRef} className="bg-white text-black p-4">
          <h3 className="text-lg font-bold mb-3">
            Offer Comparison — {rows[0]?.street_address}, {rows[0]?.city}
          </h3>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-gray-400 bg-gray-100 text-left p-2 w-40">Field</th>
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
                <tr key={f.label}>
                  <td className="border border-gray-400 p-2 font-semibold bg-gray-50">{f.label}</td>
                  {rows.map((r) => (
                    <td key={r.id} className="border border-gray-400 p-2 align-top">
                      {f.render(r)}
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
