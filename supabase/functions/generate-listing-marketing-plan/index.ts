import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DROPBOX_APP_KEY = Deno.env.get("DROPBOX_APP_KEY")!;
const DROPBOX_APP_SECRET = Deno.env.get("DROPBOX_APP_SECRET")!;
const PRICE_ANALYSIS_FOLDER = "/0 Sell for 1 Percent/0 Price Analysis";

const SYSTEM_PROMPT = `You are a top-producing real estate listing agent building a complete, execution-ready marketing plan for a specific new listing.

Output rules:
- Return ONE cohesive Markdown document.
- Use these H2 sections IN THIS EXACT ORDER, with these exact titles:
  ## Neighborhood Highlights
  ## Demographics
  ## Ideal Buyer
  ## Lifestyle If I Lived Here
  ## Biggest Cons of the Neighborhood
  ## Objection Handlers
  ## Full Marketing Plan
  ## Neighborhood Farming Plan
  ## Execution List
- Under "Objection Handlers", pair each con from the previous section 1:1.
- Under "Execution List", include two subsections: "### Content & Reels Ideas" (with at least one reel per objection above) and "### Demographic Targeting Plan".
- Be concrete and local. Use bullet points, short paragraphs, and specific numbers where reasonable.
- If an "Authoritative Property Facts" block is provided, treat every field in it as ground truth. Do NOT contradict it (especially school district, beds, baths, sqft, year built, lot size, owners). Weave those facts into the plan naturally.
- Do not invent verified statistics you cannot reasonably infer. When generalizing, say so plainly.
- No preamble, no closing pleasantries. Start with the first H2.`;

async function getDropboxAccessToken(supabase: any, agentId: string): Promise<string | null> {
  const { data } = await supabase
    .from("dropbox_tokens").select("*").eq("agent_id", agentId).maybeSingle();
  if (!data) return null;
  let accessToken = data.access_token;
  if (new Date(data.expires_at) < new Date(Date.now() + 60_000)) {
    const r = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: data.refresh_token,
        client_id: DROPBOX_APP_KEY,
        client_secret: DROPBOX_APP_SECRET,
      }),
    });
    const rd = await r.json();
    if (!r.ok) {
      console.error("Dropbox token refresh failed", rd);
      return null;
    }
    accessToken = rd.access_token;
    await supabase.from("dropbox_tokens").update({
      access_token: accessToken,
      expires_at: new Date(Date.now() + (rd.expires_in || 14400) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("agent_id", agentId);
  }
  return accessToken;
}

function buildSearchQuery(address: string): string {
  // e.g., "6010 Tuswell Drive" -> "6010 Tuswell"
  const m = address.match(/^\s*(\d+)\s+([A-Za-z0-9'\-]+)/);
  if (m) return `${m[1]} ${m[2]}`;
  return address.split(",")[0].trim();
}

async function searchDropboxTaxRecord(
  accessToken: string,
  address: string,
): Promise<{ path: string; name: string } | null> {
  const query = buildSearchQuery(address);
  console.log("Dropbox search query:", query, "folder:", PRICE_ANALYSIS_FOLDER);
  const res = await fetch("https://api.dropboxapi.com/2/files/search_v2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      options: {
        path: PRICE_ANALYSIS_FOLDER,
        max_results: 20,
        file_status: "active",
        filename_only: false,
      },
    }),
  });
  if (!res.ok) {
    console.error("Dropbox search failed", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  const matches = (data.matches || [])
    .map((m: any) => m.metadata?.metadata)
    .filter((m: any) => m && m[".tag"] === "file" && /\.pdf$/i.test(m.name));
  if (matches.length === 0) return null;

  // Prefer files whose name contains the street number
  const streetNum = address.match(/^\s*(\d+)/)?.[1];
  const streetWord = address.match(/^\s*\d+\s+([A-Za-z0-9'\-]+)/)?.[1]?.toLowerCase();
  const scored = matches
    .map((m: any) => {
      const name = String(m.name).toLowerCase();
      let score = 0;
      if (streetNum && name.includes(streetNum)) score += 2;
      if (streetWord && name.includes(streetWord)) score += 2;
      return { m, score };
    })
    .sort((a: any, b: any) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score === 0) return null;
  return { path: best.m.path_lower || best.m.path_display, name: best.m.name };
}

async function downloadDropboxFile(accessToken: string, path: string): Promise<Uint8Array | null> {
  const res = await fetch("https://content.dropboxapi.com/2/files/download", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Dropbox-API-Arg": JSON.stringify({ path }),
    },
  });
  if (!res.ok) {
    console.error("Dropbox download failed", res.status, await res.text());
    return null;
  }
  return new Uint8Array(await res.arrayBuffer());
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// PDF extraction removed — Claude reads the PDF directly in the single generation call below.


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { leadId } = await req.json();
    if (!leadId) {
      return new Response(JSON.stringify({ error: "leadId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("address, city, state, zip, agent_id")
      .eq("id", leadId)
      .single();
    if (leadErr || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fullAddress = [lead.address, lead.city, lead.state, lead.zip]
      .filter(Boolean)
      .join(", ");
    if (!fullAddress) {
      return new Response(JSON.stringify({ error: "Lead has no address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try to pull the Dropbox tax record PDF. Best-effort.
    let taxPdfB64: string | null = null;
    let taxFileName: string | null = null;
    try {
      let agentId: string | null = lead.agent_id || null;
      if (!agentId) {
        const authHeader = req.headers.get("Authorization");
        if (authHeader) {
          const jwt = authHeader.replace(/^Bearer\s+/i, "");
          const { data: userData } = await supabase.auth.getUser(jwt);
          agentId = userData?.user?.id || null;
        }
      }
      if (agentId) {
        const token = await getDropboxAccessToken(supabase, agentId);
        if (token) {
          const hit = await searchDropboxTaxRecord(token, lead.address || fullAddress);
          if (hit) {
            console.log("Tax record match:", hit.name);
            const bytes = await downloadDropboxFile(token, hit.path);
            if (bytes) {
              taxFileName = hit.name;
              taxPdfB64 = bytesToBase64(bytes);
            }
          } else {
            console.log("No Dropbox tax record match for", lead.address);
          }
        } else {
          console.log("Dropbox not connected for agent", agentId);
        }
      }
    } catch (e) {
      console.error("Dropbox lookup error (non-fatal):", e);
    }

    const factsInstruction = taxPdfB64
      ? `\n\nThe attached PDF is the authoritative county tax record for this property. Treat every fact in it (school district, beds, baths, sqft, year built, lot size, owners, taxes, etc.) as ground truth and do NOT contradict it. Weave those facts into the plan naturally.`
      : "";

    const userText = `I just took a new listing at ${fullAddress}. I want you to help me build a complete marketing plan. Work through all of the following:

Give me the highlights of the neighborhood.

Pull demographic data from this area.

Identify the ideal buyer I should be marketing to.

If I lived here, what would my lifestyle look like?

Identify the biggest cons of living in this neighborhood.

Give me an objection handler for each one.

Build a full marketing plan for the listing. The goal is to generate as many offers as possible.

Include a neighborhood farming plan for this specific listing.

Then turn the plan into an execution list: content/reels ideas (including reels that handle objections from the cons above) and a demographic targeting plan for reaching the right buyer.${factsInstruction}`;

    const userContent: any[] = [];
    if (taxPdfB64) {
      userContent.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: taxPdfB64 },
      });
    }
    userContent.push({ type: "text", text: userText });

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Anthropic error:", aiRes.status, errText);
      return new Response(JSON.stringify({ error: `AI request failed (${aiRes.status})` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const markdown = (data?.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();
    if (!markdown) {
      return new Response(JSON.stringify({ error: "AI returned empty response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        markdown,
        address: fullAddress,
        taxRecordUsed: taxFileName,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (e) {
    console.error("generate-listing-marketing-plan error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
