import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, Home, Send } from "lucide-react";
import { toast } from "sonner";
import { inspectionSections } from "@/data/inspectionData";
import { SellerSection } from "@/components/dashboard/residential/SellerSection";
import logo from "@/assets/logo.jpg";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/seller-worksheet`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const MAX_PHOTOS = 3;

const callFn = async (payload: Record<string, any>) => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Something went wrong");
  return json;
};

const SellerWorkSheet = () => {
  const { code: codeParam } = useParams<{ code?: string }>();
  const [codeInput, setCodeInput] = useState(codeParam || "");
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [data, setData] = useState<Record<string, any>>({});
  const [photos, setPhotos] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const dataRef = useRef(data);
  const photosRef = useRef(photos);
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { photosRef.current = photos; }, [photos]);

  const openCode = useCallback(async (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    setChecking(true);
    setError(null);
    try {
      const res = await callFn({ action: "load", code });
      setAddress(res.propertyAddress || "");
      setData(res.data || {});
      setPhotos(res.photos || {});
      setActiveCode(code);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (codeParam) openCode(codeParam);
  }, [codeParam, openCode]);

  // Auto-save every 2 minutes while filling in
  useEffect(() => {
    if (!activeCode || submitted) return;
    const timer = setInterval(() => {
      callFn({ action: "save", code: activeCode, data: dataRef.current, photos: photosRef.current }).catch(() => {});
    }, 2 * 60 * 1000);
    return () => clearInterval(timer);
  }, [activeCode, submitted]);

  const handleFieldChange = (sectionId: string, fieldId: string, value: any) => {
    setData((prev) => ({ ...prev, [sectionId]: { ...(prev[sectionId] || {}), [fieldId]: value } }));
  };

  const handlePhotosChange = (sectionId: string, next: string[]) => {
    setPhotos((prev) => ({ ...prev, [sectionId]: next }));
  };

  const uploadPhoto = useCallback(async (dataUrl: string) => {
    const res = await callFn({ action: "photo", code: activeCode, photo: dataUrl });
    return res.url as string;
  }, [activeCode]);

  const handleSave = async (submit: boolean) => {
    if (!activeCode) return;
    setSaving(true);
    try {
      await callFn({
        action: submit ? "submit" : "save",
        code: activeCode,
        data: dataRef.current,
        photos: photosRef.current,
      });
      if (submit) setSubmitted(true);
      else toast.success("Saved — you can come back with the same code any time.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-muted/30">
        <header className="bg-white border-b">
          <div className="container mx-auto px-4 py-4 flex items-center gap-3">
            <img src={logo} alt="Sell For 1 Percent" className="h-10" />
            <span className="font-semibold">Sell For 1 Percent</span>
          </div>
        </header>
        <div className="container mx-auto px-4 py-16 max-w-xl text-center">
          <CheckCircle2 className="w-16 h-16 mx-auto text-[#9B111E] mb-4" />
          <h1 className="text-2xl font-bold mb-3">Thank you!</h1>
          <p className="text-muted-foreground leading-relaxed">
            Your information and photos have been sent to your agent. If you remember something later, just open this
            page again with the same code.
          </p>
        </div>
      </div>
    );
  }

  if (!activeCode) {
    return (
      <div className="min-h-screen bg-muted/30">
        <header className="bg-white border-b">
          <div className="container mx-auto px-4 py-4 flex items-center gap-3">
            <img src={logo} alt="Sell For 1 Percent" className="h-10" />
            <span className="font-semibold">Sell For 1 Percent</span>
          </div>
        </header>
        <div className="container mx-auto px-4 py-12 max-w-md">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 mb-1">
                <Home className="w-6 h-6 text-[#9B111E]" />
                <CardTitle className="text-2xl text-[#9B111E]">Home Information Sheet</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">
                Enter the access code your agent sent you to fill in the details about your home and add your own photos.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Access Code</Label>
                <Input
                  id="code"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase().slice(0, 20))}
                  placeholder="ABCD-1234"
                  onKeyDown={(e) => { if (e.key === "Enter") openCode(codeInput); }}
                />
              </div>
              {error && (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2">{error}</div>
              )}
              <Button
                className="w-full bg-[#9B111E] hover:bg-[#7A0D17] text-white"
                disabled={checking || !codeInput.trim()}
                onClick={() => openCode(codeInput)}
              >
                {checking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Open My Home Sheet
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="w-8 h-8 animate-spin text-[#9B111E]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 pb-28">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <img src={logo} alt="Sell For 1 Percent" className="h-10" />
          <span className="font-semibold">Sell For 1 Percent</span>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-3xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-[#9B111E]">Tell us about your home</h1>
          {address && <p className="text-muted-foreground mt-1">{address}</p>}
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            Open each section and fill in what you know — skip anything you're unsure about. You can add up to{" "}
            {MAX_PHOTOS} photos per area. Your work saves automatically, and you can return later with the same code.
          </p>
        </div>

        {inspectionSections.map((section) => (
          <SellerSection
            key={section.id}
            title={section.title}
            sectionId={section.id}
            fields={section.fields.map((f) => ({ ...f, value: data[section.id]?.[f.id] }))}
            onFieldChange={(fieldId, value) => handleFieldChange(section.id, fieldId, value)}
            photos={photos[section.id] || []}
            onPhotosChange={(next) => handlePhotosChange(section.id, next)}
            uploadPhoto={uploadPhoto}
            maxPhotos={MAX_PHOTOS}
          />
        ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t bg-white/95 backdrop-blur">
        <div className="container mx-auto px-4 py-3 max-w-3xl flex gap-3">
          <Button variant="outline" className="flex-1" disabled={saving} onClick={() => handleSave(false)}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save for Later
          </Button>
          <Button
            className="flex-1 bg-[#9B111E] hover:bg-[#7A0D17] text-white"
            disabled={saving}
            onClick={() => handleSave(true)}
          >
            <Send className="w-4 h-4 mr-2" />
            Send to My Agent
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SellerWorkSheet;
