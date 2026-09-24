import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface CopyButtonProps {
  value: string | null | undefined;
  label?: string;
  className?: string;
}

const CopyButton = ({ value, label = "Copied", className = "" }: CopyButtonProps) => {
  const [copied, setCopied] = useState(false);
  if (!value || !String(value).trim()) return null;

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(String(value).trim());
      setCopied(true);
      toast.success(`${label}: ${String(value).trim()}`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center justify-center h-6 w-6 shrink-0 rounded-md text-primary hover:bg-accent transition-colors ${className}`}
      title="Copy"
      aria-label="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
};

export default CopyButton;
