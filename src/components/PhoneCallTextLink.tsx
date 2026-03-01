import { Phone, MessageSquare } from "lucide-react";

interface PhoneCallTextLinkProps {
  phone: string;
  className?: string;
  children?: React.ReactNode;
  /** If true, renders inline (e.g. as a text link). Otherwise renders as a standalone trigger. */
  inline?: boolean;
}

const PhoneCallTextLink = ({ phone, className = "", children, inline = false }: PhoneCallTextLinkProps) => {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 3) {
    return <span className={className}>{children ?? phone}</span>;
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className={inline ? "text-foreground" : ""}>{children ?? phone}</span>
      <button
        type="button"
        onClick={() => window.open(`tel:${digits}`, "_self")}
        className="inline-flex items-center justify-center h-6 w-6 rounded-md text-primary hover:bg-accent transition-colors"
        title="Call"
      >
        <Phone className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => window.open(`sms:${digits}`, "_self")}
        className="inline-flex items-center justify-center h-6 w-6 rounded-md text-primary hover:bg-accent transition-colors"
        title="Text"
      >
        <MessageSquare className="h-3.5 w-3.5" />
      </button>
    </span>
  );
};

export default PhoneCallTextLink;
