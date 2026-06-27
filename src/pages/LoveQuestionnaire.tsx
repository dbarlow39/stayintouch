import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Heart, CheckCircle2 } from "lucide-react";
import logo from "@/assets/logo.jpg";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-love-questionnaire`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

interface Meta {
  firstName: string;
  propertyAddress: string;
  agentName: string;
  alreadySubmitted?: boolean;
}

const LoveQuestionnaire = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [securityWord, setSecurityWord] = useState("");
  const [responses, setResponses] = useState<string[]>(Array(10).fill(""));
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Missing link token.");
      setLoading(false);
      return;
    }
    fetch(`${FN_URL}?token=${encodeURIComponent(token)}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Unable to load questionnaire");
        return j;
      })
      .then((j: Meta) => {
        if (j.alreadySubmitted) {
          setSubmitted(true);
        } else {
          setMeta(j);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!securityWord.trim()) {
      setError("Please enter the security word from your email.");
      return;
    }
    const filled = responses.filter((r) => r.trim().length > 0);
    if (filled.length === 0) {
      setError("Please share at least one thing you love about your home.");
      return;
    }
    setSubmitting(true);
    try {
      const resp = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({ token, security_word: securityWord, responses }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || "Submission failed");
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

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
          <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-600 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Thank you!</h1>
          <p className="text-muted-foreground">
            Your answers have been sent to your listing agent. They'll use the emotional details you shared to write a description that helps buyers fall in love with your home the way you did.
          </p>
        </div>
      </div>
    );
  }

  if (error && !meta) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
        <Card className="max-w-md">
          <CardHeader><CardTitle>We couldn't load this form</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">{error}</p></CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <img src={logo} alt="Sell For 1 Percent" className="h-10" />
          <span className="font-semibold">Sell For 1 Percent</span>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <Heart className="w-6 h-6 text-emerald-600" />
              <CardTitle className="text-2xl">10 Things You Love About Your Home</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Hi {meta?.firstName || "there"} — as we get ready to list <strong>{meta?.propertyAddress}</strong>, share the things you've loved most about living here. The more personal, the better. We'll use them to write a listing description that connects with the right buyer.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="security">Security word (from your email)</Label>
                <Input
                  id="security"
                  value={securityWord}
                  onChange={(e) => setSecurityWord(e.target.value)}
                  placeholder="Type the word shown in the email"
                  maxLength={50}
                  autoComplete="off"
                />
              </div>

              {responses.map((value, i) => (
                <div key={i} className="space-y-2">
                  <Label htmlFor={`r-${i}`}>#{i + 1} — What do you love?</Label>
                  <Textarea
                    id={`r-${i}`}
                    value={value}
                    onChange={(e) => {
                      const next = [...responses];
                      next[i] = e.target.value.slice(0, 1000);
                      setResponses(next);
                    }}
                    rows={2}
                    placeholder={i === 0 ? "e.g. The way the kitchen fills with morning light" : ""}
                  />
                </div>
              ))}

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2">{error}</div>
              )}

              <Button type="submit" disabled={submitting} className="w-full bg-emerald-600 hover:bg-emerald-700">
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Heart className="w-4 h-4 mr-2" />}
                Send to {meta?.agentName || "my agent"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LoveQuestionnaire;
