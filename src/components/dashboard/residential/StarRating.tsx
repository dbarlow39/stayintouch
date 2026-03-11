import { Star, X } from "lucide-react";
import { Label } from "@/components/ui/label";

interface StarRatingProps {
  value: number;
  onChange: (rating: number) => void;
  label?: string;
  readOnly?: boolean;
}

export const StarRating = ({ value, onChange, label = "Section Rating", readOnly = false }: StarRatingProps) => {
  const rounded = Math.round(value * 10) / 10;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        {readOnly && value > 0 && (
          <span className="text-xs font-semibold text-muted-foreground">{rounded.toFixed(1)} / 5</span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          readOnly ? (
            <div key={star} className="p-0.5">
              <Star
                className={`h-6 w-6 ${
                  star <= Math.round(value)
                    ? "fill-yellow-400 text-yellow-400"
                    : "fill-none text-muted-foreground/40"
                }`}
              />
            </div>
          ) : (
            <button
              key={star}
              type="button"
              onClick={() => onChange(star === value ? 0 : star)}
              className="p-0.5 transition-transform hover:scale-110 focus:outline-none"
            >
              <Star
                className={`h-6 w-6 transition-colors ${
                  star <= value
                    ? "fill-yellow-400 text-yellow-400"
                    : "fill-none text-muted-foreground/40 hover:text-yellow-300"
                }`}
              />
            </button>
          )
        ))}
        {!readOnly && value > 0 && (
          <button
            type="button"
            onClick={() => onChange(0)}
            className="ml-1 p-1 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors focus:outline-none"
            title="Clear rating"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};