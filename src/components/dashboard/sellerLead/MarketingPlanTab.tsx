import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Loader2, Sparkles, Copy, Printer, FileDown,
  MessageSquare, Target, DollarSign, Handshake, ClipboardCheck,
  DoorOpen, Signpost, Mail, Megaphone, Camera, Home as HomeIcon,
  Clapperboard, Users, ChevronRight,
} from "lucide-react";

// Subsection name -> { Lucide icon, emoji for docx export }
const SUBSECTION_ICONS: Array<{ match: RegExp; Icon: any; emoji: string }> = [
  { match: /feedback loop/i,                Icon: MessageSquare,   emoji: "💬" },
  { match: /retargeting/i,                  Icon: Target,          emoji: "🎯" },
  { match: /price strategy|pricing/i,       Icon: DollarSign,      emoji: "💵" },
  { match: /offer review|negotiation/i,     Icon: Handshake,       emoji: "🤝" },
  { match: /transaction management/i,       Icon: ClipboardCheck,  emoji: "✅" },
  { match: /open house|broker open/i,       Icon: DoorOpen,        emoji: "🚪" },
  { match: /signage|ground game/i,          Icon: Signpost,        emoji: "🪧" },
  { match: /email marketing/i,              Icon: Mail,            emoji: "✉️" },
  { match: /digital advertising|ads?\b/i,   Icon: Megaphone,       emoji: "📣" },
  { match: /photo|media/i,                  Icon: Camera,          emoji: "📷" },
  { match: /property prep|staging/i,        Icon: HomeIcon,        emoji: "🏠" },
  { match: /content|reels/i,                Icon: Clapperboard,    emoji: "🎬" },
  { match: /demographic|targeting plan/i,   Icon: Users,           emoji: "👥" },
];

const pickSubsectionIcon = (text: string) =>
  SUBSECTION_ICONS.find((s) => s.match.test(text)) ?? { Icon: ChevronRight, emoji: "▶" };
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  HeadingLevel,
  LevelFormat,
  PageOrientation,
  VerticalAlign,
} from "docx";
import { saveAs } from "file-saver";

const RUBY = "9B111E";

export default function MarketingPlanTab({ lead }: { lead: any }) {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [markdown, setMarkdown] = useState<string>("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const pollingStoppedRef = useRef(false);

  const fullAddress = [lead?.address, lead?.city, lead?.state, lead?.zip]
    .filter(Boolean)
    .join(", ");

  useEffect(() => {
    if (!lead?.id) return;
    let cancelled = false;
    (async () => {
      const { data: job } = await supabase
        .from("marketing_plan_jobs")
        .select("id")
        .eq("seller_lead_id", lead.id)
        .eq("status", "completed")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled || !job) return;
      const { data: result } = await supabase
        .from("marketing_plan_results")
        .select("content")
        .eq("job_id", (job as any).id)
        .eq("stage", "final_plan")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const content = (result as any)?.content;
      if (content) setMarkdown(content);
    })();
    return () => {
      cancelled = true;
    };
  }, [lead?.id]);

  useEffect(() => {
    if (!jobId) return;

    pollingStoppedRef.current = false;

    const pollJob = async () => {
      const { data: job, error: jobError } = await supabase
        .from("marketing_plan_jobs")
        .select("id, status, current_stage, error")
        .eq("id", jobId)
        .maybeSingle();

      if (pollingStoppedRef.current) return;

      if (jobError) {
        setLoading(false);
        setJobId(null);
        toast({
          title: "Failed to check marketing plan status",
          description: jobError.message,
          variant: "destructive",
        });
        return;
      }

      const jobRow = job as any;
      if (!jobRow) {
        setStatusMessage("Waiting for the marketing plan job to start…");
        return;
      }

      setStatusMessage(jobRow.current_stage || "Building marketing plan…");

      if (jobRow.status === "failed") {
        setLoading(false);
        setJobId(null);
        toast({
          title: "Failed to generate marketing plan",
          description: jobRow.error || "Unknown error",
          variant: "destructive",
        });
        return;
      }

      if (jobRow.status !== "completed") return;

      const { data: result, error: resultError } = await supabase
        .from("marketing_plan_results")
        .select("content")
        .eq("job_id", jobId)
        .eq("stage", "final_plan")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pollingStoppedRef.current) return;

      if (resultError) {
        setLoading(false);
        setJobId(null);
        toast({
          title: "Marketing plan completed, but could not load",
          description: resultError.message,
          variant: "destructive",
        });
        return;
      }

      const resultRow = result as any;
      if (!resultRow?.content) {
        setStatusMessage("Marketing plan completed. Loading final document…");
        return;
      }

      setMarkdown(resultRow.content);
      setLoading(false);
      setJobId(null);
      setStatusMessage("");
      toast({ title: "Marketing plan ready" });
    };

    void pollJob();
    const interval = window.setInterval(() => {
      void pollJob();
    }, 5000);

    return () => {
      pollingStoppedRef.current = true;
      window.clearInterval(interval);
    };
  }, [jobId]);

  const isWorking = loading || Boolean(jobId);

  const generate = async () => {
    if (!lead?.id) {
      toast({ title: "No lead selected", variant: "destructive" });
      return;
    }
    if (!fullAddress) {
      toast({ title: "Lead has no address", variant: "destructive" });
      return;
    }
    setLoading(true);
    setStatusMessage("Starting marketing plan job…");
    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-listing-marketing-plan",
        { body: { leadId: lead.id } },
      );
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const newJobId = (data as any)?.jobId;
      if (!newJobId) throw new Error("Marketing plan job did not start");
      setMarkdown("");
      setJobId(newJobId);
      setStatusMessage("Queued. This can take a few minutes.");
    } catch (e: any) {
      setJobId(null);
      setLoading(false);
      setStatusMessage("");
      toast({
        title: "Failed to generate marketing plan",
        description: e?.message || "Unknown error",
        variant: "destructive",
      });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const print = () => window.print();

  const getAgentName = async (): Promise<string> => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return "Dave Barlow";
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, first_name, last_name")
        .eq("id", uid)
        .maybeSingle();
      const p: any = profile;
      const name =
        p?.full_name ||
        [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() ||
        auth?.user?.email ||
        "Dave Barlow";
      return name;
    } catch {
      return "Dave Barlow";
    }
  };

  const parseInline = (text: string): TextRun[] => {
    // split on **bold**
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts
      .filter((p) => p.length > 0)
      .map((p) => {
        if (p.startsWith("**") && p.endsWith("**")) {
          return new TextRun({ text: p.slice(2, -2), bold: true, font: "Arial" });
        }
        return new TextRun({ text: p, font: "Arial" });
      });
  };

  const mdToDocxChildren = (md: string): Paragraph[] => {
    const lines = md.replace(/\r\n/g, "\n").split("\n");
    const out: Paragraph[] = [];
    for (const raw of lines) {
      const line = raw.trimEnd();
      if (!line.trim()) {
        out.push(new Paragraph({ children: [new TextRun({ text: "", font: "Arial" })] }));
        continue;
      }
      if (line.startsWith("### ")) {
        out.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 160, after: 80 },
            children: [new TextRun({ text: line.slice(4), bold: true, font: "Arial", size: 24, color: RUBY })],
          }),
        );
      } else if (line.startsWith("## ")) {
        out.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 260, after: 120 },
            children: [
              new TextRun({ text: line.slice(3), bold: true, font: "Arial", size: 28, color: RUBY }),
            ],
          }),
        );
      } else if (line.startsWith("#### ")) {
        const text = line.slice(5);
        const { emoji } = pickSubsectionIcon(text);
        out.push(
          new Paragraph({
            spacing: { before: 200, after: 80 },
            children: [new TextRun({ text: `${emoji}  ${text}`, bold: true, font: "Arial", size: 22, color: RUBY })],
          }),
        );
      } else if (line.startsWith("# ")) {
        out.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 160 },
            children: [new TextRun({ text: line.slice(2), bold: true, font: "Arial", size: 32, color: RUBY })],
          }),
        );
      } else if (/^\s*[-*]\s+/.test(line)) {
        out.push(
          new Paragraph({
            numbering: { reference: "bullets", level: 0 },
            children: parseInline(line.replace(/^\s*[-*]\s+/, "")),
          }),
        );
      } else if (/^\s*\d+\.\s+/.test(line)) {
        out.push(
          new Paragraph({
            numbering: { reference: "numbers", level: 0 },
            children: parseInline(line.replace(/^\s*\d+\.\s+/, "")),
          }),
        );
      } else {
        out.push(
          new Paragraph({
            spacing: { after: 100 },
            children: parseInline(line),
          }),
        );
      }
    }
    return out;
  };

  const buildHeaderTable = async (agent: string, dateStr: string): Promise<Table> => {
    const DARK_SCARLET = "8B0000";
    const SCARLET = "CC0000";

    let logoRun: ImageRun | null = null;
    try {
      const res = await fetch("/logo-sellfor1percent.jpg");
      const buf = await res.arrayBuffer();
      logoRun = new ImageRun({
        type: "jpg",
        data: new Uint8Array(buf),
        transformation: { width: 252, height: 117 },
        altText: { title: "Logo", description: "Sell for 1 Percent Realtors", name: "Logo" },
      });
    } catch {
      logoRun = null;
    }

    const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
    const borders = {
      top: noBorder,
      bottom: noBorder,
      left: noBorder,
      right: noBorder,
    };

    return new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [3000, 6360],
      borders: {
        ...borders,
        insideHorizontal: noBorder,
        insideVertical: noBorder,
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders,
              width: { size: 3000, type: WidthType.DXA },
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  children: logoRun
                    ? [logoRun]
                    : [new TextRun({ text: "Sell for 1 Percent", bold: true, font: "Arial" })],
                }),
              ],
            }),
            new TableCell({
              borders,
              width: { size: 6360, type: WidthType.DXA },
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({ text: "MARKETING PLAN", bold: true, color: DARK_SCARLET, font: "Arial", size: 32 }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  spacing: { before: 60 },
                  children: [
                    new TextRun({ text: fullAddress, bold: true, color: SCARLET, font: "Arial", size: 20 }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  spacing: { before: 60 },
                  children: [
                    new TextRun({ text: `Prepared by ${agent} | ${dateStr}`, color: DARK_SCARLET, font: "Arial", size: 18 }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });
  };

  const exportDocx = async () => {
    if (!markdown) return;
    setExporting(true);
    try {
      const agent = await getAgentName();
      const dateStr = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date());

      const header = await buildHeaderTable(agent, dateStr);
      const body = mdToDocxChildren(markdown);

      const doc = new Document({
        styles: {
          default: { document: { run: { font: "Arial", size: 22 } } },
        },
        numbering: {
          config: [
            {
              reference: "bullets",
              levels: [
                {
                  level: 0,
                  format: LevelFormat.BULLET,
                  text: "\u2022",
                  alignment: AlignmentType.LEFT,
                  style: { paragraph: { indent: { left: 720, hanging: 360 } } },
                },
              ],
            },
            {
              reference: "numbers",
              levels: [
                {
                  level: 0,
                  format: LevelFormat.DECIMAL,
                  text: "%1.",
                  alignment: AlignmentType.LEFT,
                  style: { paragraph: { indent: { left: 720, hanging: 360 } } },
                },
              ],
            },
          ],
        },
        sections: [
          {
            properties: {
              page: {
                size: {
                  width: 12240,
                  height: 15840,
                  orientation: PageOrientation.PORTRAIT,
                },
                margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
              },
            },
            children: [
              header,
              new Paragraph({ spacing: { after: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: "CC0000" } }, children: [] }),
              ...body,
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const safeAddr = (fullAddress || "marketing-plan").replace(/[^\w\-]+/g, "_").slice(0, 80);
      saveAs(blob, `Marketing_Plan_${safeAddr}.docx`);
    } catch (e: any) {
      toast({
        title: "Export failed",
        description: e?.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Marketing Plan</h2>
          <p className="text-sm text-muted-foreground">
            {fullAddress || "No address on this lead."}
          </p>
        </div>
        <div className="flex gap-2">
          {markdown && (
            <>
              <Button variant="outline" size="sm" onClick={copy}>
                <Copy className="h-4 w-4 mr-2" /> Copy
              </Button>
              <Button variant="outline" size="sm" onClick={print}>
                <Printer className="h-4 w-4 mr-2" /> Print
              </Button>
              <Button variant="outline" size="sm" onClick={exportDocx} disabled={exporting}>
                {exporting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Exporting…</>
                ) : (
                  <><FileDown className="h-4 w-4 mr-2" /> Word</>
                )}
              </Button>
            </>
          )}
          <Button onClick={generate} disabled={isWorking || !fullAddress}>
            {isWorking ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" /> {markdown ? "Regenerate" : "Generate Marketing Plan"}</>
            )}
          </Button>
        </div>
      </div>

      {isWorking && !markdown && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {statusMessage || "Building your marketing plan. This can take a few minutes."}
        </Card>
      )}

      {markdown && (
        <Card className="p-6">
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown>{markdown}</ReactMarkdown>
          </div>
        </Card>
      )}

      {!markdown && !isWorking && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Click "Generate Marketing Plan" to build a full plan for this listing.
        </Card>
      )}
    </div>
  );
}
