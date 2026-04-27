import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, FileText, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface PaperworkFile {
  name: string;
  path: string;
  size: number;
  uploaded_at: string;
  scan_status?: "pending" | "scanning" | "complete" | "failed";
  scan_result?: any;
}

interface Props {
  /** Stable id used as the storage folder. For new closings, pass a temp id (e.g. crypto.randomUUID()). */
  folderId: string;
  files: PaperworkFile[];
  onChange: (files: PaperworkFile[]) => void;
  /** Called immediately after one or more new files are uploaded successfully. */
  onUpload?: (newFiles: PaperworkFile[]) => void;
  /** When true, shows a "Reading paperwork…" indicator overlay. */
  parsing?: boolean;
  /** Representation type — uploads are blocked when null. */
  representation?: "seller" | "buyer" | null;
}

const MAX_SIZE_MB = 25;

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const ClosingPaperworkUpload = ({ folderId, files, onChange, onUpload, parsing, representation }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleSelect = () => {
    if (!representation) {
      toast.error("Please select a Representation (Seller or Buyer) before uploading documents.");
      return;
    }
    inputRef.current?.click();
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!representation) {
      toast.error("Please select a Representation (Seller or Buyer) before uploading documents.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (!fileList || fileList.length === 0) return;
    const selected = Array.from(fileList);

    // Filter to PDFs only
    const pdfs = selected.filter(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) {
      toast.error("Only PDF files are allowed.");
      return;
    }
    if (pdfs.length < selected.length) {
      toast.warning(`Skipped ${selected.length - pdfs.length} non-PDF file(s).`);
    }

    const oversize = pdfs.filter(f => f.size > MAX_SIZE_MB * 1024 * 1024);
    if (oversize.length > 0) {
      toast.error(`These files exceed ${MAX_SIZE_MB}MB: ${oversize.map(f => f.name).join(", ")}`);
      return;
    }

    setUploading(true);
    const uploaded: PaperworkFile[] = [];
    try {
      for (const file of pdfs) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${folderId}/${Date.now()}-${safeName}`;
        const { error } = await supabase.storage
          .from("closing-paperwork")
          .upload(path, file, { contentType: "application/pdf", upsert: false });
        if (error) {
          toast.error(`Failed to upload ${file.name}: ${error.message}`);
          continue;
        }
        uploaded.push({
          name: file.name,
          path,
          size: file.size,
          uploaded_at: new Date().toISOString(),
          scan_status: "pending",
        });
      }
      if (uploaded.length > 0) {
        onChange([...files, ...uploaded]);
        toast.success(`Uploaded ${uploaded.length} file(s).`);
        onUpload?.(uploaded);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async (file: PaperworkFile) => {
    const { error } = await supabase.storage.from("closing-paperwork").remove([file.path]);
    if (error) {
      toast.error(`Failed to remove file: ${error.message}`);
      return;
    }
    onChange(files.filter(f => f.path !== file.path));
    toast.success("File removed.");
  };

  const handleView = async (file: PaperworkFile) => {
    const { data, error } = await supabase.storage
      .from("closing-paperwork")
      .createSignedUrl(file.path, 60 * 5);
    if (error || !data?.signedUrl) {
      toast.error("Could not open file.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Closing Paperwork</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSelect}
          disabled={uploading}
        >
          {uploading ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
          ) : (
            <><Upload className="w-4 h-4 mr-2" /> Upload PDFs</>
          )}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {parsing && (
        <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Reading paperwork and auto-filling fields…
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Upload all signed paperwork from this closing (PDF only, up to {MAX_SIZE_MB}MB each).
        AI signature scanning will be added in a follow-up step.
      </p>

      {files.length === 0 ? (
        <div className="border border-dashed rounded-md p-6 text-center text-sm text-muted-foreground">
          No paperwork uploaded yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {files.map((f) => (
            <li
              key={f.path}
              className="flex items-center justify-between gap-3 p-3 border rounded-md bg-muted/30"
            >
              <button
                type="button"
                onClick={() => handleView(f)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left hover:underline"
              >
                <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{f.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(f.size)}</p>
                </div>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleRemove(f)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ClosingPaperworkUpload;
