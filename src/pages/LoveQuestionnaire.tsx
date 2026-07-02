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

interface Section {
  title: string;
  description: string;
  prompt: string;
  indices: number[];
}

const SECTIONS: Section[] = [
  {
    title: "Daily Moments & Interior Comforts",
    description: "Think about your daily routines, your favorite spots to unwind, and how the house feels throughout the day.",
    prompt: "Where do you drink your morning coffee? Where and how do you unwind or recharge at the end of the day? Which room gets the best natural light? How does this home support your routines (working from home, family dinners, hobbies, getting kids ready, etc.)? What small, functional feature will you miss the most?",
    indices: [0, 1, 2],
  },
  {
    title: "Hosting & Entertaining",
    description: "Think about holidays, birthdays, or casual Friday nights with friends and family.",
    prompt: "Where does everyone naturally gather when you host? What feature or detail do guests always notice or compliment? Any custom touches, built-ins, architectural details, or updates that make this home feel one-of-a-kind? What surprised you most (in a good way) when you first moved in or lived here? What is your home's \"party trick\" (e.g., great deck flow, massive kitchen island, cozy basement)?",
    indices: [3, 4, 5],
  },
  {
    title: "Community & The Neighborhood",
    description: "Step outside. What makes your specific lot, street, or community special?",
    prompt: "What is your favorite view from a window? What do you enjoy most about the yard, patio, deck, or views outside? What neighborhood perks can you enjoy without even leaving the area (sounds, proximity, community feel, etc.)? What will you miss most after moving about your home, neighborhood or the street dynamics?",
    indices: [6, 7, 8],
  },
  {
    title: 'The "First Impression" Flashback',
    description: "Let's take a trip down memory lane.",
    prompt: 'When you first toured this home as a buyer, what was the exact moment or feature that made you say, "Yep, this is the one"?',
    indices: [9],
  },
];

const LoveQuestionnaire = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
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
        body: JSON.stringify({ token, responses }),
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
          <h1 className="text-2xl font-bold mb-3">Thank you so much!</h1>
          <p className="text-muted-foreground leading-relaxed">
            Your insights are incredibly valuable. I am going to weave these unique details into your property descriptions, social media spotlights, and marketing materials so prospective buyers can truly see themselves living in your beautiful home. I'll be in touch soon!
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
              <Heart className="w-6 h-6 text-[#9B111E] fill-[#9B111E]" />
              <CardTitle className="text-2xl text-[#9B111E]">10 Things You Love About Your Home</CardTitle>
            </div>
            <div className="text-sm text-muted-foreground space-y-3">
              <p>
                Hi {meta?.firstName || "there"} — as we get ready to list <strong>{meta?.propertyAddress}</strong>, share the things you've loved most about living here.
              </p>
              <p>
                Buyers don't just buy houses — they buy the feeling of living there. Help us capture the real heart of your home by sharing the specific details, moments, and feelings that make it special to you. Be as descriptive as possible (the little things often matter most). We'll turn your answers into authentic marketing that attracts the right buyers.
              </p>
              <p>The more personal, the better. We'll use them to write a listing description that connects with the right buyer.</p>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="space-y-2">
                <Label htmlFor="security" className="text-red-600 font-bold">Security word (from your email)</Label>
                <Input
                  id="security"
                  value={securityWord}
                  onChange={(e) => setSecurityWord(e.target.value)}
                  placeholder="Type the word shown in the email"
                  maxLength={50}
                  autoComplete="off"
                  className="border-red-600 focus-visible:ring-red-600 placeholder:text-red-600 placeholder:font-semibold text-red-600 font-semibold"
                />
              </div>

              {SECTIONS.map((section, sIdx) => (
                <div key={sIdx} className="space-y-4 pt-2 border-t first:border-t-0 first:pt-0">
                  <div>
                    <h3 className="text-lg font-semibold text-[#9B111E]">{section.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
                    <div className="mt-3 bg-[#9B111E]/10 border border-[#9B111E]/20 rounded-md px-3 py-2 text-sm text-[#5C0A12]">
                      <span className="font-medium">Prompt to spark your memory: </span>
                      {section.prompt}
                    </div>
                  </div>

                  {section.indices.map((i) => (
                    <div key={i} className="space-y-2">
                      <Label htmlFor={`r-${i}`}>Love Item #{i + 1}</Label>
                      <Textarea
                        id={`r-${i}`}
                        value={responses[i]}
                        onChange={(e) => {
                          const next = [...responses];
                          next[i] = e.target.value.slice(0, 1000);
                          setResponses(next);
                        }}
                        rows={4}
                      />
                    </div>
                  ))}
                </div>
              ))}

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2">{error}</div>
              )}

              <Button type="submit" disabled={submitting} className="w-full bg-[#9B111E] hover:bg-[#7A0D17] text-white">
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
