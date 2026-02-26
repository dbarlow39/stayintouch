import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PenLine, Eraser, Check, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface HandwritingCanvasProps {
  onTextExtracted: (text: string) => void;
  existingText?: string;
}

export function HandwritingCanvas({ onTextExtracted, existingText = "" }: HandwritingCanvasProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#000000";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    contextRef.current = ctx;
  }, []);

  useEffect(() => {
    if (isOpen) setTimeout(initCanvas, 50);
  }, [isOpen, initCanvas]);

  const getCoordinates = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDrawing = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    isDrawingRef.current = true;
    const coords = getCoordinates(e);
    lastPosRef.current = coords;
    if (contextRef.current) { contextRef.current.beginPath(); contextRef.current.moveTo(coords.x, coords.y); }
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawingRef.current || !contextRef.current) return;
    const coords = getCoordinates(e);
    contextRef.current.lineTo(coords.x, coords.y);
    contextRef.current.stroke();
    lastPosRef.current = coords;
  };

  const stopDrawing = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    isDrawingRef.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = contextRef.current;
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
  };

  const processHandwriting = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsProcessing(true);
    try {
      const imageData = canvas.toDataURL("image/png");
      const { data, error } = await supabase.functions.invoke("recognize-handwriting", { body: { imageData } });
      if (error) throw error;
      if (data?.text) {
        const newText = existingText ? `${existingText}\n${data.text}` : data.text;
        onTextExtracted(newText);
        toast.success("Handwriting converted to text!");
        setIsOpen(false);
      } else {
        toast.error("Could not recognize handwriting. Please try again.");
      }
    } catch (error) {
      console.error("Handwriting recognition error:", error);
      toast.error("Failed to process handwriting");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" title="Write with finger or stylus">
          <PenLine className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] p-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PenLine className="h-5 w-5" />Handwriting Input</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Write your notes below using your finger or stylus. Tap "Convert" when done.</p>
          <div className="relative border rounded-lg overflow-hidden bg-white">
            <canvas ref={canvasRef} className="w-full touch-none cursor-crosshair" style={{ height: "300px" }}
              onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
              onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} onTouchCancel={stopDrawing} />
          </div>
          <div className="flex gap-2 justify-between">
            <Button type="button" variant="outline" onClick={clearCanvas} className="gap-2"><Eraser className="h-4 w-4" />Clear</Button>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)} className="gap-2"><X className="h-4 w-4" />Cancel</Button>
              <Button type="button" onClick={processHandwriting} disabled={isProcessing} className="gap-2">
                {isProcessing ? <><Loader2 className="h-4 w-4 animate-spin" />Converting...</> : <><Check className="h-4 w-4" />Convert</>}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
