import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, File, Trash2, Loader2, FileText, Download, Sparkles } from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

const DOCUMENT_TYPES = [
  { value: "purchase_contract", label: "Purchase Contract" },
  { value: "counter_offer", label: "Counter Offer" },
  { value: "lender_pre_approval", label: "Lender Pre-Approval" },
  { value: "inspection_report", label: "Inspection Report" },
  { value: "other", label: "Other" },
] as const;

export interface ContractExtractedData {
  offerPrice?: number | null;
  buyerAgentCommission?: number | null;
  deposit?: number | null;
  depositCollection?: string | null;
  buyerName1?: string | null;
  buyerName2?: string | null;
  buyerAgentName?: string | null;
  buyerAgentPhone?: string | null;
  buyerAgentEmail?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  typeOfLoan?: string | null;
  lenderName?: string | null;
  lendingOfficer?: string | null;
  lendingOfficerPhone?: string | null;
  lendingOfficerEmail?: string | null;
  preApprovalDays?: number | null;
  loanAppTimeFrame?: string | null;
  loanCommitment?: string | null;
  appraisalContingency?: boolean | null;
  inspectionDays?: number | null;
  closingDate?: string | null;
  possession?: string | null;
  respondToOfferBy?: string | null;
  homeWarranty?: number | null;
  homeWarrantyCompany?: string | null;
  appliances?: string | null;
  remedyPeriodDays?: number | null;
  listingAgentName?: string | null;
  listingAgentPhone?: string | null;
  listingAgentEmail?: string | null;
  sellerPhone?: string | null;
  sellerEmail?: string | null;
  inContract?: string | null;
  finalWalkThrough?: string | null;
}

interface PropertyDocument {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  file_type: string | null;
  document_category?: string | null;
  uploaded_at: string;
}

interface DocumentUploadSectionProps {
  propertyId: string | null;
  clientId: string | null;
  onContractParsed?: (data: ContractExtractedData) => void;
}

const DocumentUploadSection = ({ propertyId, clientId, onContractParsed }: DocumentUploadSectionProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [documents, setDocuments] = useState<PropertyDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [showTypeDialog, setShowTypeDialog] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<string>("purchase_contract");

  // Fetch documents when propertyId changes
  useEffect(() => {
    if (propertyId) {
      fetchDocuments();
    } else {
      setDocuments([]);
    }
  }, [propertyId]);

  const fetchDocuments = async () => {
    if (!propertyId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("property_documents")
        .select("*")
        .eq("property_id", propertyId)
        .order("uploaded_at", { ascending: false });

      if (error) throw error;
      setDocuments((data as PropertyDocument[]) || []);
    } catch (error) {
      console.error("Error fetching documents:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowTypeDialog(true);
  };

  const handleTypeConfirm = () => {
    setShowTypeDialog(false);
    fileInputRef.current?.click();
  };

  const parseContract = async (filePath: string) => {
    setParsing(true);
    try {
      toast({
        title: "Analyzing Contract",
        description: "AI is extracting contract details...",
      });

      const { data, error } = await supabase.functions.invoke('parse-purchase-contract', {
        body: { filePath },
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        toast({
          title: "Contract Parsed Successfully",
          description: "Form fields have been populated from the contract.",
        });
        
        if (onContractParsed) {
          onContractParsed(data.data);
        }
      } else if (data?.error) {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error("Contract parsing error:", error);
      toast({
        title: "Contract Parsing Failed",
        description: error.message || "Could not extract data from contract",
        variant: "destructive",
      });
    } finally {
      setParsing(false);
    }
  };

  const parsePreApproval = async (filePath: string) => {
    setParsing(true);
    try {
      toast({
        title: "Analyzing Pre-Approval Letter",
        description: "AI is extracting lender details...",
      });

      const { data, error } = await supabase.functions.invoke('parse-preapproval-letter', {
        body: { filePath },
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        toast({
          title: "Pre-Approval Letter Parsed Successfully",
          description: "Lender information has been populated.",
        });
        
        if (onContractParsed) {
          onContractParsed(data.data);
        }
      } else if (data?.error) {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error("Pre-approval parsing error:", error);
      toast({
        title: "Pre-Approval Parsing Failed",
        description: error.message || "Could not extract data from pre-approval letter",
        variant: "destructive",
      });
    } finally {
      setParsing(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (!propertyId) {
      toast({
        title: "Save property first",
        description: "Please save the property before uploading documents",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    let uploadedFilePath: string | null = null;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      for (const file of Array.from(files)) {
        const fileExt = file.name.split(".").pop();
        const fileName = `${Date.now()}-${file.name}`;
        const filePath = `${user.id}/${propertyId}/${fileName}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from("deal-documents")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Store the first file path for potential parsing
        if (!uploadedFilePath) {
          uploadedFilePath = filePath;
        }

        // Create database record
        const { error: dbError } = await supabase
          .from("property_documents")
          .insert({
            agent_id: user.id,
            property_id: propertyId,
            client_id: clientId,
            file_name: file.name,
            file_path: filePath,
            file_size: file.size,
            file_type: file.type || fileExt,
          });

        if (dbError) throw dbError;
      }

      toast({
        title: "Documents uploaded",
        description: `${files.length} document(s) uploaded successfully`,
      });

      fetchDocuments();

      // If it's a parseable document and we have a callback, parse it
      if (uploadedFilePath && onContractParsed) {
        if (selectedDocType === "purchase_contract") {
          await parseContract(uploadedFilePath);
        } else if (selectedDocType === "lender_pre_approval") {
          await parsePreApproval(uploadedFilePath);
        }
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload documents",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async (doc: PropertyDocument) => {
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("deal-documents")
        .remove([doc.file_path]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from("property_documents")
        .delete()
        .eq("id", doc.id);

      if (dbError) throw dbError;

      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      toast({
        title: "Document deleted",
        description: doc.file_name,
      });
    } catch (error: any) {
      console.error("Delete error:", error);
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete document",
        variant: "destructive",
      });
    }
  };

  const handleDownload = async (doc: PropertyDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from("deal-documents")
        .download(doc.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Download error:", error);
      toast({
        title: "Download failed",
        description: error.message || "Failed to download document",
        variant: "destructive",
      });
    }
  };

  const handleOpenDocument = async (doc: PropertyDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from("deal-documents")
        .download(doc.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      window.open(url, "_blank");
    } catch (error: any) {
      console.error("Open error:", error);
      toast({
        title: "Could not open document",
        description: error.message || "Failed to open document",
        variant: "destructive",
      });
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (fileType: string | null) => {
    if (!fileType) return <File className="h-4 w-4" />;
    if (fileType.includes("pdf")) return <FileText className="h-4 w-4 text-destructive" />;
    if (fileType.includes("image")) return <File className="h-4 w-4 text-primary" />;
    if (fileType.includes("word") || fileType.includes("doc")) return <FileText className="h-4 w-4 text-primary" />;
    return <File className="h-4 w-4" />;
  };

  const isProcessing = uploading || parsing;

  return (
    <Card className="p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-foreground">Upload Contract Documents</h3>
        {parsing ? (
          <div className="flex items-center gap-3 px-4 py-2 rounded-md bg-green-500/10 border border-green-500/30">
            {/* Animated loader with expanding rings */}
            <div className="relative flex items-center justify-center w-6 h-6">
              <div className="absolute inset-0 rounded-full border-2 border-green-500 animate-ping-slow" />
              <div className="absolute inset-0.5 rounded-full border-2 border-green-400 animate-pulse-ring" />
              <Loader2 className="h-4 w-4 text-green-600 animate-spin" />
            </div>
            <span className="text-green-700 dark:text-green-400 font-medium">
              Analyzing contract
              <span className="inline-flex ml-0.5">
                <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
              </span>
            </span>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={handleUploadClick}
            disabled={isProcessing || !propertyId}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {!isProcessing && "Upload"}
          </Button>
        )}
      </div>

      <AlertDialog open={showTypeDialog} onOpenChange={setShowTypeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>What type of document are you uploading?</AlertDialogTitle>
            <AlertDialogDescription>
              Select the document category. Purchase contracts will be automatically analyzed to populate form fields.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <RadioGroup
            value={selectedDocType}
            onValueChange={setSelectedDocType}
            className="gap-3 py-4"
          >
            {DOCUMENT_TYPES.map((type) => (
              <div key={type.value} className="flex items-center space-x-3">
                <RadioGroupItem value={type.value} id={type.value} />
                <Label htmlFor={type.value} className="cursor-pointer font-normal">
                  {type.label}
                  {type.value === "purchase_contract" && (
                    <span className="ml-2 text-xs text-muted-foreground">(AI will extract fields)</span>
                  )}
                  {type.value === "lender_pre_approval" && (
                    <span className="ml-2 text-xs text-muted-foreground">(AI will extract lender info)</span>
                  )}
                </Label>
              </div>
            ))}
          </RadioGroup>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleTypeConfirm}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        multiple
        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.txt"
      />

      {!propertyId && (
        <p className="text-sm text-muted-foreground text-center py-4">
          Save the property first to upload documents
        </p>
      )}

      {propertyId && loading && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {propertyId && !loading && documents.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No documents uploaded yet
        </p>
      )}

      {documents.length > 0 && (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
            >
              <button
                type="button"
                onClick={() => handleOpenDocument(doc)}
                className="flex items-center gap-3 overflow-hidden text-left hover:underline cursor-pointer"
              >
                {getFileIcon(doc.file_type)}
                <div className="overflow-hidden">
                  <p className="font-medium truncate">{doc.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(doc.file_size)} • {new Date(doc.uploaded_at).toLocaleDateString()}
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDownload(doc)}
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(doc)}
                  title="Delete"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

export default DocumentUploadSection;
