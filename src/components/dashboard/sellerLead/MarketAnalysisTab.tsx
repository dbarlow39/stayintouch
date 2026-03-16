import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Upload,
  FileText,
  Loader2,
  Download,
  Sparkles,
  X,
  CheckCircle2,
  BarChart3,
  Image as ImageIcon,
} from "lucide-react";
import { generateMarketAnalysisDocx } from "@/utils/marketAnalysisDocx";

interface DocumentSlot {
  label: string;
  description: string;
  file: File | null;
  required: boolean;
}

interface MarketAnalysisTabProps {
  lead: any;
}

const MarketAnalysisTab = ({ lead }: MarketAnalysisTabProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [generatingGraphics, setGeneratingGraphics] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [bullseyeImage, setBullseyeImage] = useState<string | null>(null);
  const [zillowImage, setZillowImage] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentSlot[]>([
    { label: "CMA / Property Detail Report", description: "CoreLogic, RPR, or similar report", file: null, required: true },
    { label: "Residential Inspection Worksheet", description: "Room-by-room condition notes", file: null, required: true },
    { label: "Audio of Walk-Through Summary", description: "Seller observations and transcript", file: null, required: false },
    { label: "Zillow PDF Screenshot", description: "Zestimate, range, and property stats", file: null, required: true },
  ]);

  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleFileSelect = (index: number, file: File | null) => {
    setDocuments((prev) =>
      prev.map((doc, i) => (i === index ? { ...doc, file } : doc))
    );
  };

  // Upload files to storage, return file paths
  const uploadFilesToStorage = async (docs: DocumentSlot[]): Promise<{ name: string; filePath: string; mimeType: string }[]> => {
    if (!user) throw new Error("Not authenticated");
    const uploaded: { name: string; filePath: string; mimeType: string }[] = [];
    for (const doc of docs) {
      if (doc.file) {
        const ext = doc.file.name.split(".").pop() || "pdf";
        const filePath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from("market-analysis-docs").upload(filePath, doc.file);
        if (error) throw new Error(`Failed to upload ${doc.label}: ${error.message}`);
        uploaded.push({ name: doc.label, filePath, mimeType: doc.file.type || "application/pdf" });
      }
    }
    return uploaded;
  };

  const hasRequiredDocs = documents
    .filter((d) => d.required)
    .every((d) => d.file !== null);

  const uploadedCount = documents.filter((d) => d.file !== null).length;

  const handleGenerate = async () => {
    setGenerating(true);
    setAnalysis(null);
    setBullseyeImage(null);
    setZillowImage(null);

    try {
      // Upload files to storage first
      const uploadedDocs = await uploadFilesToStorage(documents);

      const { data, error } = await supabase.functions.invoke("generate-market-analysis", {
        body: { documents: uploadedDocs },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      if (!data?.analysis) {
        throw new Error("No analysis returned from AI");
      }

      setAnalysis(data.analysis);
      toast({ title: "Market analysis generated successfully" });

      // Now generate graphics
      setGeneratingGraphics(true);
      try {
        const pricing = data.analysis.pricingStrategy;
        const zillow = data.analysis.zillowAnalysis;
        const overview = data.analysis.propertyOverview;

        const [bullseyeRes, zillowRes] = await Promise.all([
          supabase.functions.invoke("generate-market-graphics", {
            body: {
              type: "bullseye",
              data: {
                address: overview?.address || "",
                bullseyePrice: pricing?.bullseyePrice || "",
                lowerBracketPrice: pricing?.lowerBracketPrice || "",
                upperBracketPrice: pricing?.upperBracketPrice || "",
                bullseyeBracket: pricing?.bullseyeBracket || "",
                lowerBracket: pricing?.lowerBracket || "",
                upperBracket: pricing?.upperBracket || "",
              },
            },
          }),
          supabase.functions.invoke("generate-market-graphics", {
            body: {
              type: "zillow",
              data: {
                address: overview?.address || "",
                zestimate: zillow?.zestimate || "",
                estimatedSalesRange: zillow?.estimatedSalesRange || "",
                rentZestimate: zillow?.rentZestimate || "",
                pricePerSqFt: zillow?.pricePerSqFt || "",
                bedsBaths: zillow?.bedsBathsAsZillowCounts || "",
                propertyType: zillow?.propertyType || "",
                yearBuilt: zillow?.yearBuilt || "",
                updatedDate: zillow?.updatedDate || "",
                appreciationNote: zillow?.appreciationNote || "",
                importantContext: zillow?.importantContext || "",
              },
            },
          }),
        ]);

        if (bullseyeRes.data?.imageUrl) setBullseyeImage(bullseyeRes.data.imageUrl);
        if (zillowRes.data?.imageUrl) setZillowImage(zillowRes.data.imageUrl);

        if (bullseyeRes.data?.imageUrl || zillowRes.data?.imageUrl) {
          toast({ title: "Graphics generated successfully" });
        }
      } catch (graphicErr: any) {
        console.error("Graphics generation error:", graphicErr);
        toast({
          title: "Graphics generation failed",
          description: "Analysis is ready but graphics could not be generated. You can still download the document.",
          variant: "destructive",
        });
      } finally {
        setGeneratingGraphics(false);
      }
    } catch (err: any) {
      console.error("Market analysis error:", err);
      toast({
        title: "Error generating analysis",
        description: err.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!analysis) return;
    try {
      await generateMarketAnalysisDocx(analysis, bullseyeImage, zillowImage);
      toast({ title: "Document downloaded successfully" });
    } catch (err: any) {
      console.error("DOCX generation error:", err);
      toast({
        title: "Error generating document",
        description: err.message || "Please try again",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Market Analysis</h3>
        <p className="text-sm text-muted-foreground">
          Upload property documents to generate a professional Seller Market Analysis
        </p>
      </div>

      {/* Document Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Upload Documents
            <Badge variant="secondary" className="ml-auto">
              {uploadedCount}/{documents.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documents.map((doc, index) => (
              <div
                key={index}
                className={`relative border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer hover:border-primary/50 ${
                  doc.file
                    ? "border-green-500/50 bg-green-500/5"
                    : "border-border"
                }`}
                onClick={() => fileInputRefs.current[index]?.click()}
              >
                <input
                  ref={(el) => (fileInputRefs.current[index] = el)}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  className="hidden"
                  onChange={(e) => handleFileSelect(index, e.target.files?.[0] || null)}
                />
                {doc.file ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium truncate">{doc.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(doc.file.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFileSelect(index, null);
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm font-medium">{doc.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">{doc.description}</p>
                    {doc.required && (
                      <Badge variant="outline" className="mt-2 text-xs">
                        Required
                      </Badge>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center gap-3">
            <Button
              onClick={handleGenerate}
              disabled={!hasRequiredDocs || generating}
              className="flex-1"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing Documents...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Market Analysis
                </>
              )}
            </Button>
          </div>
          {!hasRequiredDocs && (
            <p className="text-xs text-muted-foreground mt-2">
              Upload all required documents to generate the analysis
            </p>
          )}
        </CardContent>
      </Card>

      {/* Generation Progress */}
      {(generating || generatingGraphics) && (
        <Card className="border-primary/20">
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="font-medium">
                {generating ? "Analyzing documents with AI..." : "Generating graphics..."}
              </p>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                {generating
                  ? "Extracting property data, comparable sales, and market conditions from your uploaded documents."
                  : "Creating the Bullseye Pricing Model and Zillow Zestimate graphics."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Analysis Preview */}
      {analysis && !generating && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Analysis Preview
            </h4>
            <Button onClick={handleDownload} variant="default">
              <Download className="w-4 h-4 mr-2" />
              Download .docx
            </Button>
          </div>

          {/* Property Overview */}
          {analysis.propertyOverview && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-[#8B0000]">Property Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-1 text-sm">
                  {Object.entries(analysis.propertyOverview).map(([key, value]) => (
                    <div key={key} className="flex border-b border-border/50 py-1.5">
                      <span className="w-48 shrink-0 font-medium text-muted-foreground capitalize">
                        {key.replace(/([A-Z])/g, " $1").trim()}
                      </span>
                      <span>{String(value || "-")}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notable Features */}
          {analysis.notableFeatures?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-[#8B0000]">Notable Property Features</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {analysis.notableFeatures.map((f: string, i: number) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Comparable Sales */}
          {analysis.comparableSales?.closedSales?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-[#8B0000]">Recent Comparable Sales</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#CC0000] text-white">
                      <th className="px-2 py-1.5 text-left">Address</th>
                      <th className="px-2 py-1.5 text-left">Closed</th>
                      <th className="px-2 py-1.5 text-right">List Price</th>
                      <th className="px-2 py-1.5 text-right">Sold Price</th>
                      <th className="px-2 py-1.5 text-center">Beds/Baths</th>
                      <th className="px-2 py-1.5 text-right">Sq Ft</th>
                      <th className="px-2 py-1.5 text-center">Year</th>
                      <th className="px-2 py-1.5 text-right">DOM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.comparableSales.closedSales.map((comp: any, i: number) => (
                      <tr key={i} className={i % 2 === 1 ? "bg-[#FDECEA]" : ""}>
                        <td className="px-2 py-1.5">{comp.address}</td>
                        <td className="px-2 py-1.5">{comp.closedDate}</td>
                        <td className="px-2 py-1.5 text-right">{comp.listPrice}</td>
                        <td className="px-2 py-1.5 text-right">{comp.soldPrice}</td>
                        <td className="px-2 py-1.5 text-center">{comp.bedsBaths}</td>
                        <td className="px-2 py-1.5 text-right">{comp.sqFt}</td>
                        <td className="px-2 py-1.5 text-center">{comp.yearBuilt}</td>
                        <td className="px-2 py-1.5 text-right">{comp.dom}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Pricing Strategy */}
          {analysis.pricingStrategy && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-[#8B0000]">
                  Bullseye Pricing Strategy
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-center gap-8 py-4">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Lower Bracket</p>
                    <p className="text-lg font-semibold">{analysis.pricingStrategy.lowerBracketPrice}</p>
                    <p className="text-xs text-muted-foreground">{analysis.pricingStrategy.lowerBracket}</p>
                  </div>
                  <div className="text-center bg-[#FDECEA] rounded-lg p-4 border-2 border-[#CC0000]">
                    <p className="text-xs font-medium text-[#CC0000]">★ BULLSEYE</p>
                    <p className="text-2xl font-bold text-[#8B0000]">{analysis.pricingStrategy.bullseyePrice}</p>
                    <p className="text-xs text-muted-foreground">{analysis.pricingStrategy.bullseyeBracket}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Upper Bracket</p>
                    <p className="text-lg font-semibold">{analysis.pricingStrategy.upperBracketPrice}</p>
                    <p className="text-xs text-muted-foreground">{analysis.pricingStrategy.upperBracket}</p>
                  </div>
                </div>
                {analysis.pricingStrategy.priceJustification && (
                  <p className="text-sm text-muted-foreground">
                    {analysis.pricingStrategy.priceJustification}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Graphics Preview */}
          {(bullseyeImage || zillowImage) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  Generated Graphics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {bullseyeImage && (
                    <div>
                      <p className="text-xs font-medium mb-2">Bullseye Pricing Model</p>
                      <img src={bullseyeImage} alt="Bullseye Pricing Model" className="w-full rounded border" />
                    </div>
                  )}
                  {zillowImage && (
                    <div>
                      <p className="text-xs font-medium mb-2">Zillow Zestimate Card</p>
                      <img src={zillowImage} alt="Zillow Zestimate" className="w-full rounded border" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Zillow Analysis */}
          {analysis.zillowAnalysis?.wordOnZestimate && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-[#8B0000]">Zillow Zestimate Analysis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>{analysis.zillowAnalysis.wordOnZestimate}</p>
                <p className="text-muted-foreground italic">{analysis.zillowAnalysis.onlineValuationNote}</p>
              </CardContent>
            </Card>
          )}

          {/* Next Steps */}
          {analysis.nextSteps && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-[#8B0000]">Next Steps</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{analysis.nextSteps}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default MarketAnalysisTab;
