import { Star } from "lucide-react";
import { Label } from "@/components/ui/label";

interface StarRatingProps {
  value: number;
  onChange: (rating: number) => void;
  label?: string;
}

export const StarRating = ({ value, onChange, label = "Section Rating" }: StarRatingProps) => {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-foreground">{label}</Label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
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
        ))}
      </div>
    </div>
  );
};
