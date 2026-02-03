import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const DOT_FRAMES = ["", ".", "..", "..."] as const;

function useAnimatedDots(intervalMs = 350) {
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setDots((d) => (d + 1) % DOT_FRAMES.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return DOT_FRAMES[dots];
}

export function AnalyzingToastDescription({ label }: { label: string }) {
  const dots = useAnimatedDots(350);

  return (
    <span className="inline-flex items-center gap-2" role="status" aria-live="polite">
      {/* CSS spin may be reduced by OS settings; dots are JS-driven so motion is still visible */}
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="whitespace-nowrap">
        {label}
        <span aria-hidden>{dots}</span>
      </span>
    </span>
  );
}

export function AnalyzingPill({ label }: { label: string }) {
  const dots = useAnimatedDots(350);

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 rounded-md bg-success/10 border border-success/30 shrink-0"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 text-success animate-spin" />
        {/* JS-driven dots ensure visible motion even when CSS animations are suppressed */}
        <span className="text-success font-medium whitespace-nowrap">
          {label}
          <span aria-hidden>{dots}</span>
        </span>
      </div>
    </div>
  );
}
