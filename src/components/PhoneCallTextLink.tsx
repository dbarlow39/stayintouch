import { Phone, MessageSquare } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {inline ? (
          <span
            role="button"
            tabIndex={0}
            className={`cursor-pointer text-primary hover:underline ${className}`}
          >
            {children ?? phone}
          </span>
        ) : (
          <span
            role="button"
            tabIndex={0}
            className={`cursor-pointer ${className}`}
          >
            {children ?? phone}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => window.open(`tel:${digits}`, "_self")}>
          <Phone className="h-4 w-4 mr-2" /> Call
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.open(`sms:${digits}`, "_self")}>
          <MessageSquare className="h-4 w-4 mr-2" /> Text
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default PhoneCallTextLink;
