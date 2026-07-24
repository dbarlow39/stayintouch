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
  ## The Vibe
  ## Full Marketing Plan
  
  ## Execution List
- Under "Execution List", include two subsections: "### Content & Reels Ideas" and "### Demographic Targeting Plan".
- Be concrete and local. Use bullet points, short paragraphs, and specific numbers where reasonable.
- If an "Authoritative Property Facts" block is provided, treat every field in it as ground truth. Do NOT contradict it (especially school district, beds, baths, sqft, year built, lot size, owners). Weave those facts into the plan naturally.
- Do not invent verified statistics you cannot reasonably infer. When generalizing, say so plainly.
- Do NOT include a Pricing Strategy, price recommendation, or list-price section — pricing lives in the Market Analysis, not here.
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

Describe "The Vibe" of the neighborhood — its personality, character, energy, and what makes it feel distinct.

Build a full marketing plan for the listing. The goal is to generate as many offers as possible.

Include a neighborhood farming plan for this specific listing.

Then turn the plan into an execution list: content/reels ideas and a demographic targeting plan for reaching the right buyer.

## Buyer Profile Logic (must follow)
Before naming the ideal buyer, cross-check the property's physical layout against the tax record (stories, bedroom locations, primary bedroom floor, stairs).

- Two-story homes with all/most bedrooms upstairs:
  - Primary persona: growing family with school-age or soon-to-be school-age children.
  - Secondary persona: newly married / newly partnered couples planning for children in the next 1–3 years. Call this out explicitly when the property sits in a top-rated school district (e.g., Hilliard, Dublin, Olentangy, Upper Arlington, New Albany) and name the district by name as a driver.
  - Do NOT list "empty nesters," "downsizers," or "aging-in-place" buyers as a target for this floor plan. Stairs to every bedroom disqualifies them.
- Ranch / first-floor primary suite homes: empty nesters and downsizers are appropriate; growing families are secondary.
- If the floor plan is ambiguous from the tax record, say so and pick the persona supported by the strongest evidence rather than guessing.

## Property Prep & Staging Language (must follow verbatim)
When the Full Marketing Plan includes a "Property Prep & Staging" subsection, use exactly these bullets (in this order, with this wording):
- Professional deep clean, including windows, baseboards, and all surfaces
- Declutter, remove excess furniture, and personal collections
- Stage to highlight family functionality:
  - Primary bedroom: create a serene adult retreat
  - Secondary bedrooms: one as kid's room, one as tween/teen room, one as home office/nursery
  - Finished basement: playroom/rec room setup with cozy seating
  - Dining room: family dinner scene with tasteful place settings
- Exterior curb appeal: fresh mulch, trim hedges, refresh driveway and patio, add potted flowers at entry and a new front door mat that says "Welcome Home"
- Minor repairs: patch any wall dings, touch up paint, replace burned-out bulbs, fix leaky faucets

Do NOT use the words "depersonalize" or "power-wash" anywhere in the plan.

## Photography & Media Rules (must follow)
When the Full Marketing Plan includes a "Photography & Media" subsection, follow these rules:
- Always include: "40–50 high-res photos with HDR and twilight exterior shots".
- Drone footage: ONLY include a drone bullet if the tax record shows the lot is 1.0 acre or larger. Otherwise omit any mention of drone footage entirely.
- Do NOT mention Matterport or 3D virtual tours. Omit that bullet entirely.
- Video tour bullet must read: "Cinematic video tour with upbeat, family-friendly music" (no fixed duration like "60-second").
- Lifestyle B-roll: only include this bullet if you can name specific, verified nearby parks/streets/schools tied to this property's actual neighborhood. If you cannot verify specifics, omit the B-roll bullet entirely — do not invent locations.

## Digital Advertising Blitz Language (must follow verbatim)
When the Full Marketing Plan includes a "Digital Advertising Blitz" subsection, use exactly these bullets (in this order, with this wording). Do NOT include budgets, dollar amounts, day counts, Google Ads, Google Display, parenting blogs, or any other channels beyond those listed:
- Facebook & Instagram Ads: Carousel ads featuring 8–10 best photos
- Retargeting pixel installed on property website to re-engage viewers
- Search ads targeting keywords tailored to this listing (e.g., "[City] homes for sale," "[Bedroom count] bedroom [City] OH," "[Subdivision] homes," "family homes near me")
- YouTube Pre-Roll Ads: Video ad (60-sec tour) targeted to married couples, ages 28–45, within a 20-mile radius of [nearest major suburb], with interests in: [local school district], family activities, real estate, homeownership
- TikTok Ads: 30-second teaser video targeted to [local ZIP codes], ages 25–45, interests in home buying and family activities

Replace the bracketed placeholders with the actual city, subdivision, school district, and ZIP codes for this property. Do not add any additional advertising bullets or channels.

## Forbidden Sections (must follow)
Do NOT include a "Social Media Organic Push" section or any organic-social subsection (Instagram, Facebook, TikTok, LinkedIn grid posts, Reels, Stories, group shares, hashtag lists, etc.) anywhere in the Full Marketing Plan. Organic social content ideas belong ONLY in the "Content & Reels Ideas" subsection under the Execution List. Paid social lives in the Digital Advertising Blitz subsection.

## Email Marketing Language (must follow verbatim)
When the Full Marketing Plan includes an "Email Marketing" subsection, use exactly these two bullets (in this order, with this wording). Do NOT include any neighborhood farming, postcard, or third bullet here — farming belongs in its own section:
- Agent-to-Agent Blast: Send to 5000+ Columbus area agents, emphasizing [local school district] and strong buyer demand
- Past Client Database: Email to my past clients and other known buyers looking in the area with subject line: "Just Listed: [Local School District] Gem—Share with Friends!"

Replace the bracketed placeholders with the actual school district for this property. Do not invent specific past-client counts.

## Open Houses Language (must follow verbatim)
When the Full Marketing Plan includes an "Open Houses" subsection, use exactly these two bullets (in this order, with this wording). Do NOT include Broker Opens, catering, specific days/times, weekend schedules, or any additional bullets:
- We do offer to do Open Houses and have agents on staff who will do Open Houses for you. What we have found over the years is 99% of all home buyers who have a serious interest in buying will schedule an individual private showing to look your home. Open House's typically bring in tire kickers and your neighbors but if you feel strongly about them we will schedule an Open House after the 2nd weekend on the market. Why after the 2nd weekend? Typically, a home that is priced right and is in good cosmetic condition will find a buyer within the first 10 to 14 days of being on the market. After that we will want to start to turn every rock we can to try and find your right buyer.
- Promote all open houses via Zillow, Realtor.com, Facebook Events, Instagram Stories, and email blasts 48 hours in advance

## Signage & Ground Game Language (must follow verbatim)
When the Full Marketing Plan includes a "Signage & Ground Game" subsection, use exactly these four bullets (in this order, with this wording). Do NOT include specific sign counts, street/intersection names, door-hangers, distances, or any additional bullets:
- Install For Sale sign
- Place directional signs where it makes sense
- Send 100 Just Listed Postcards to your surrounding neighbors "Your Neighbor's Home is For Sale—Spread the Word!"
- Generate a targeted marketing campaign on Facebook and Instagram targeting your neighborhood

## Phase 3 (Days 13–21) Language (must follow verbatim)
When the Full Marketing Plan includes a "Phase 3: Momentum & Follow-Up (Days 13–21)" section, use exactly these three subsections with these exact bullets (in this order, with this wording). Do NOT include a "Second Wave Content" subsection or any other subsection in Phase 3. Do NOT add additional bullets.

Feedback Loop
- Email every showing agent within 1 hour of their showing for feedback
- Adjust messaging or price if consistent objections emerge

Retargeting Campaign
- Facebook/Instagram retargeting ads to everyone who clicked on initial ads or visited property website
- Messaging: "Don't miss out—schedule your showing today before it's gone!"

Price Strategy (if needed)
- Monitor online views through Zillow and MLS
- Monitor showing volume and offer activity
- Monitor showing feedback
- If 8+ showings with no offers by Day 7, consider small price adjustment ($100 to $5000 depending on price bracket) to create urgency
- If multiple offers by Day 2, consider "Highest & Best" deadline to drive competition

## Phase 4 (Days 22+) Language (must follow verbatim)
When the Full Marketing Plan includes a "Phase 4: Closing the Deal (Days 22+)" section, use exactly these two subsections with these exact bullets (in this order, with this wording). Do NOT add additional bullets or subsections.

Offer Review & Negotiation
- Present all offers transparently to sellers
- Generate Summary Sheet for better understanding of offer
- Generate estimated Net Sheet showing all of the numbers and bottom line
- Coach sellers on strength of each buyer: financing, contingencies, closing timeline, appraisal gap coverage
- Negotiate highest net proceeds while protecting sellers' timeline and contingencies

Transaction Management
- Communicate clearly with all parties during inspection, appraisal, and closing coordination
- Proactively address any title, HOA, or lender delays${factsInstruction}`;
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
