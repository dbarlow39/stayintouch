import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime:
  | { waitUntil?: (promise: Promise<unknown>) => void }
  | undefined;

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

  // Prefer the Realist tax-record PDF (filename contains "reallist"/"realist").
  // Downrank other same-address PDFs (market analysis, mls, photos, etc.) so they don't win ties.
  const streetNum = address.match(/^\s*(\d+)/)?.[1];
  const streetWord = address.match(/^\s*\d+\s+([A-Za-z0-9'\-]+)/)?.[1]?.toLowerCase();
  const scored = matches
    .map((m: any) => {
      const name = String(m.name).toLowerCase();
      let score = 0;
      if (streetNum && name.includes(streetNum)) score += 2;
      if (streetWord && name.includes(streetWord)) score += 2;
      if (/reallist|realist/.test(name)) score += 20;
      if (/\b(tax|parcel|auditor)\b/.test(name)) score += 5;
      if (/market analysis|cma|zillow|redfin|\bmls\b|photos?|history|notes|residential work sheet/.test(name)) score -= 20;
      return { m, score };
    })
    .sort((a: any, b: any) => b.score - a.score);
  const best = scored[0];
  // Require a positive score AND that the filename actually looks like a tax record.
  // Sending the wrong PDF (e.g. Market Analysis) is worse than sending none.
  if (!best || best.score <= 0) return null;
  const bestName = String(best.m.name).toLowerCase();
  if (!/reallist|realist|\b(tax|parcel|auditor)\b/.test(bestName)) return null;
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

// PDF extraction removed — Claude reads the PDF directly during the background generation job.

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} not configured`);
  return value;
}

function buildMarketingPrompt(fullAddress: string, hasTaxPdf: boolean): string {
  const factsInstruction = hasTaxPdf
    ? `\n\nThe attached PDF is the authoritative county tax record for this property. Treat every fact in it (school district, beds, baths, sqft, year built, lot size, owners, taxes, etc.) as ground truth and do NOT contradict it. Weave those facts into the plan naturally.`
    : "";

  return `I just took a new listing at ${fullAddress}. I want you to help me build a complete marketing plan. Work through all of the following:

Give me the highlights of the neighborhood.

Pull demographic data from this area.

Identify the ideal buyer I should be marketing to.

If I lived here, what would my lifestyle look like?

Identify the biggest cons of living in this neighborhood.

Give me an objection handler for each one.

Build a full marketing plan for the listing. The goal is to generate as many offers as possible.

Include a neighborhood farming plan for this specific listing.

Then turn the plan into an execution list: content/reels ideas (including reels that handle objections from the cons above) and a demographic targeting plan for reaching the right buyer.${factsInstruction}`;
}

async function updateJob(
  supabase: any,
  jobId: string,
  values: Record<string, unknown>,
): Promise<void> {
  await supabase
    .from("marketing_plan_jobs")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

async function runMarketingPlanJob(params: {
  supabase: any;
  jobId: string;
  agentId: string;
  leadAddress: string;
  fullAddress: string;
}): Promise<void> {
  const { supabase, jobId, agentId, leadAddress, fullAddress } = params;

  try {
    await updateJob(supabase, jobId, {
      status: "processing",
      current_stage: "Finding Realist tax record",
      error: null,
    });

    const anthropicKey = getRequiredEnv("ANTHROPIC_API_KEY");
    let taxPdfB64: string | null = null;
    let taxFileName: string | null = null;

    try {
      const token = await getDropboxAccessToken(supabase, agentId);
      if (token) {
        const hit = await searchDropboxTaxRecord(token, leadAddress || fullAddress);
        if (hit) {
          console.log("Tax record match:", hit.name);
          await updateJob(supabase, jobId, {
            current_stage: `Reading tax record: ${hit.name}`,
          });
          const bytes = await downloadDropboxFile(token, hit.path);
          if (bytes) {
            taxFileName = hit.name;
            taxPdfB64 = bytesToBase64(bytes);
          }
        } else {
          console.log("No Dropbox tax record match for", leadAddress);
        }
      } else {
        console.log("Dropbox not connected for agent", agentId);
      }
    } catch (e) {
      console.error("Dropbox lookup error (non-fatal):", e);
    }

    await updateJob(supabase, jobId, {
      current_stage: taxFileName
        ? `Generating plan with tax record: ${taxFileName}`
        : "Generating plan without tax record",
    });

    const userContent: any[] = [];
    if (taxPdfB64) {
      userContent.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: taxPdfB64 },
      });
    }
    userContent.push({ type: "text", text: buildMarketingPrompt(fullAddress, Boolean(taxPdfB64)) });

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Anthropic error:", aiRes.status, errText);
      throw new Error(
        aiRes.status === 429
          ? "Rate limit exceeded. Please try again shortly."
          : `AI request failed (${aiRes.status})`,
      );
    }

    const data = await aiRes.json();
    const markdown = (data?.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();

    if (!markdown) throw new Error("AI returned empty response");

    await supabase.from("marketing_plan_results").insert({
      job_id: jobId,
      stage: "final_plan",
      content: markdown,
    });

    await updateJob(supabase, jobId, {
      status: "completed",
      current_stage: taxFileName ? `Completed using ${taxFileName}` : "Completed",
      error: null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Marketing plan background job failed:", message);
    await updateJob(supabase, jobId, {
      status: "failed",
      current_stage: "Failed",
      error: message,
    });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid request body" }, 400);
    }

    const leadId = typeof body?.leadId === "string" ? body.leadId : "";
    if (!leadId) return jsonResponse({ error: "leadId required" }, 400);

    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return jsonResponse({ error: "Authentication required" }, 401);

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    const requestingUserId = userData?.user?.id;
    if (userErr || !requestingUserId) {
      return jsonResponse({ error: "Authentication required" }, 401);
    }

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("address, city, state, zip, agent_id")
      .eq("id", leadId)
      .single();

    if (leadErr || !lead) return jsonResponse({ error: "Lead not found" }, 404);

    const agentId = lead.agent_id || requestingUserId;
    if (agentId !== requestingUserId) return jsonResponse({ error: "Forbidden" }, 403);

    const fullAddress = [lead.address, lead.city, lead.state, lead.zip]
      .filter(Boolean)
      .join(", ");

    if (!fullAddress) return jsonResponse({ error: "Lead has no address" }, 400);

    const { data: job, error: jobErr } = await supabase
      .from("marketing_plan_jobs")
      .insert({
        seller_lead_id: leadId,
        user_id: agentId,
        status: "queued",
        current_stage: "Queued",
      })
      .select("id")
      .single();

    if (jobErr || !job?.id) {
      console.error("Failed to create marketing plan job:", jobErr);
      return jsonResponse({ error: "Failed to start marketing plan job" }, 500);
    }

    const backgroundJob = runMarketingPlanJob({
      supabase,
      jobId: job.id,
      agentId,
      leadAddress: lead.address || fullAddress,
      fullAddress,
    });

    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(backgroundJob);
    } else {
      backgroundJob.catch((e) => console.error("Background job error:", e));
    }

    return jsonResponse({
      jobId: job.id,
      status: "queued",
      address: fullAddress,
    });
  } catch (e) {
    console.error("generate-listing-marketing-plan error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
