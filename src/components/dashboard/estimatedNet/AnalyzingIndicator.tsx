import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const SPINNER_FRAMES = ["|", "/", "-", "\\"] as const;

export function AnalyzingToastDescription({ label }: { label: string }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span className="inline-flex items-center gap-2">
      {/* Keep CSS spin for browsers that allow it, but also animate text so motion is always visible */}
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="whitespace-nowrap">
        {SPINNER_FRAMES[frame]} {label}
      </span>
    </span>
  );
}

export function AnalyzingPill({ label }: { label: string }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-md bg-success/10 border border-success/30 shrink-0">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 text-success animate-spin" />
        {/* Text-based spinner ensures visible motion even when CSS animations are suppressed */}
        <span className="text-success font-medium whitespace-nowrap">
          {SPINNER_FRAMES[frame]} {label}
        </span>
      </div>
    </div>
  );
}
