// Shared helpers for MLS description generators (Gemini + Claude).
// Imported via relative path from sibling edge functions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const MLS_SYSTEM_PROMPT = `You are a seasoned storyteller, an architect of dreams, meticulously crafting the narrative for a home that's eagerly awaiting its next chapter.

Your mission: Transform the attached photos and property data into a compelling MLS description that makes a Zillow scroll stop dead in its tracks. Make a buyer visualize their future and ignite that undeniable spark of "home" before they even step foot through the door.

Use the AI summary, transcription, and photos from the Residential Work Sheet. Imagine you're standing inside this home. What does it feel like? What story does it tell? Lead with the most evocative, unique feature. Paint a sensory picture: morning light through the kitchen window, the warmth of the fireplace on a winter evening, the quiet of the primary suite, the laughter that will fill the backyard.

ALWAYS end with a clear call-to-action sentence directing the reader to call their agent to schedule a personal showing. Examples: "Call your agent today to schedule your personal showing." or "Don't wait, call your agent now to schedule a private tour." Vary the wording but the intent must be the same: contact the agent and book a showing.

STRICT RULES:
- Do NOT use em dashes (—). Use commas, periods, or parentheses instead.
- Keep the description under 1000 characters INCLUDING spaces. This is a hard limit.
- Do not use clichés like "must see" or "won't last long".
- Do not list features dryly. Weave them into the narrative.
- The final sentence MUST be a call to action telling the reader to call their agent to schedule a personal showing.
- Output only the MLS description text. No headings, no preamble, no quotes around it.`;

export async function authenticate(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing authorization");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !user) throw new Error("Unauthorized");
  return { supabase, user };
}

export async function buildWorkSheetContext(supabase: any, user: any, leadId: string) {
  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).eq("agent_id", user.id).single();
  if (!lead) throw new Error("Lead not found");

  let inspection: any = null;
  if (lead.address) {
    const { data } = await supabase
      .from("inspections")
      .select("id, inspection_data, photos, property_address")
      .eq("user_id", user.id)
      .ilike("property_address", `%${lead.address}%`)
      .order("updated_at", { ascending: false })
      .limit(1);
    inspection = data?.[0];
  }
  if (!inspection) {
    const { data } = await supabase
      .from("inspections")
      .select("id, inspection_data, photos, property_address")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1);
    inspection = data?.[0];
  }
  if (!inspection) throw new Error("No Residential Work Sheet found for this lead. Please complete the work sheet first.");

  let summary = "";
  let transcription = "";
  if (inspection.id) {
    const { data: trans } = await supabase
      .from("audio_transcriptions")
      .select("summary, transcription")
      .eq("inspection_id", inspection.id)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (trans?.[0]) {
      summary = trans[0].summary || "";
      transcription = trans[0].transcription || "";
    }
  }

  const photosBySection = (inspection.photos || {}) as Record<string, string[]>;
  const allPhotos: string[] = [];
  for (const urls of Object.values(photosBySection)) {
    if (Array.isArray(urls)) for (const u of urls) if (typeof u === "string" && u.startsWith("http")) allPhotos.push(u);
  }

  const propInfo = (inspection.inspection_data as any)?.["property-info"] || {};
  const facts = {
    address: lead.address || propInfo.address,
    city: lead.city,
    state: lead.state,
    zip: lead.zip,
    bedrooms: lead.bedrooms || propInfo.bedrooms,
    bathrooms: lead.bathrooms || propInfo.bathrooms,
    sqft: lead.square_feet || propInfo.sqft,
    year_built: lead.year_built || propInfo.yearBuilt,
    lot_size_sqft: lead.lot_size_sqft,
    property_type: lead.property_type,
  };

  const userNotes = (lead as any).mls_description_notes?.trim();
  const notesBlock = userNotes
    ? `\n\nAGENT'S POINTS OF INTEREST & EMPHASIS (HIGH PRIORITY — weave these into the narrative naturally):\n${userNotes}\n`
    : "";

  // Seller's own "10 Things They Love" responses — highest priority emphasis.
  let loveBlock = "";
  try {
    const { data: loveRow } = await supabase
      .from("lead_love_responses")
      .select("responses")
      .eq("lead_id", leadId)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const responses = (loveRow as any)?.responses;
    if (Array.isArray(responses) && responses.length > 0) {
      const numbered = responses
        .filter((r: any) => typeof r === "string" && r.trim())
        .map((r: string, i: number) => `${i + 1}. ${r.trim()}`)
        .join("\n");
      if (numbered) {
        loveBlock = `\n\nSELLER'S 10 THINGS THEY LOVE ABOUT THIS HOME (HIGHEST PRIORITY — these are the seller's own words. Emphasize them prominently and weave them naturally into the narrative so a buyer feels what the seller felt):\n${numbered}\n`;
      }
    }
  } catch (_) { /* non-fatal */ }

  // CMA / property detail data from the Market Analysis page (features + narrative).
  let cmaBlock = "";
  try {
    const { data: maRows } = await supabase
      .from("market_analysis_files")
      .select("analysis_json")
      .eq("lead_id", leadId)
      .eq("agent_id", user.id)
      .eq("file_type", "analysis_json")
      .not("analysis_json", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1);
    const analysis: any = maRows?.[0]?.analysis_json;
    if (analysis) {
      const parts: string[] = [];
      const features = Array.isArray(analysis.features)
        ? analysis.features.filter((f: any) => typeof f === "string" && f.trim())
        : [];
      if (features.length) parts.push(`FEATURES:\n${features.map((f: string) => `- ${f.trim()}`).join("\n")}`);
      const prop = analysis.property || {};
      const propFacts = Object.entries(prop)
        .filter(([, v]) => typeof v === "string" && (v as string).trim())
        .map(([k, v]) => `${k}: ${v}`);
      if (propFacts.length) parts.push(`PROPERTY DETAIL:\n${propFacts.join("\n")}`);
      const narrative = [analysis.propertyDescription, analysis.overview, analysis.summary]
        .filter((t: any) => typeof t === "string" && t.trim())
        .join("\n\n");
      if (narrative) parts.push(`NARRATIVE:\n${narrative}`);
      if (parts.length) {
        cmaBlock = `\n\nMARKET ANALYSIS / COMPARABLE LISTING MATERIAL (READ THE RULES BEFORE USING):\nMuch of this material describes OTHER nearby homes (comparable listings), NOT the subject property. Use it ONLY as INSPIRATION for tone, phrasing, and which neighborhood or lifestyle angles resonate with buyers in this market. You may NOT state, imply, or repeat any feature, finish, material, countertop, flooring, appliance, upgrade, or condition found here as a fact about the subject home. The ONLY authoritative sources for what this home actually has are the property facts, the Residential Work Sheet, the photos, the seller's own words, and the agent's notes above. If a detail is not documented in those sources, do not mention it. Never mention pricing, comps, or the analysis itself in the description.\n\n${parts.join("\n\n").slice(0, 6000)}\n`;
      }
    }
  } catch (_) { /* non-fatal */ }

  // Verbatim public remarks pulled from the comparable listings in the CMA /
  // Property Detail Report. Style inspiration only, never facts about the subject.
  let compRemarksBlock = "";
  try {
    // cacheOnly: only use remarks the agent has reviewed/edited and saved.
    const remarks = await getCompRemarks(supabase, user, leadId, true);
    if (remarks.length) {
      const listed = remarks.map((r, i) => `${i + 1}. ${r}`).join("\n").slice(0, 8000);
      compRemarksBlock = `\n\nIDEAS AND ANGLES USED IN NEARBY LISTINGS (LANGUAGE INSPIRATION ONLY):\nThese are selling angles and phrases distilled from the MLS descriptions of OTHER nearby homes. They are NOT descriptions of the subject property. Use them for tone, phrasing, neighborhood angles, and lifestyle hooks only. You may NOT state any feature, finish, material, appliance, upgrade, view, or condition from this list as a fact about the subject home unless it also appears in the property facts. Never mention comps, other addresses, or pricing.\n\n${listed}\n`;
    }

  } catch (_) { /* non-fatal */ }

  const factsText = `PROPERTY FACTS:\n${JSON.stringify(facts, null, 2)}${loveBlock}${notesBlock}${cmaBlock}${compRemarksBlock}\n\nAI SUMMARY OF WORK SHEET:\n${summary || "(none)"}\n\nFULL TRANSCRIPTION:\n${transcription || "(none)"}\n\nINSPECTION SECTION NOTES:\n${JSON.stringify(inspection.inspection_data, null, 2).slice(0, 8000)}\n\nNow write the MLS description. Remember: under 1000 characters, no em dashes, evocative storytelling, end with an imagined call to action.`;


  return { factsText, allPhotos };
}

export function aiGatewayErrorResponse(status: number) {
  if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded, try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings > Workspace > Usage." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ---------------------------------------------------------------------------
// Comparable-listing public remarks
// Opens the CMA / Property Detail Report PDF attached to the lead and extracts
// the verbatim public remarks written for each comparable listing. Results are
// cached on a `comp_remarks` row so the PDF is only read once per lead.
// ---------------------------------------------------------------------------
const COMP_REMARKS_PROMPT = `This document is a CMA / Property Detail Report containing several comparable listings.

Read the PUBLIC REMARKS / marketing description paragraphs written for those comparable listings, then distill them into a short list of interesting selling angles, lifestyle hooks, neighborhood references, and vivid phrases that a listing agent could reuse when writing a new description.

Rules:
- Return ONLY a JSON array of strings, nothing else. Example: ["walkable to Uptown shops and dining", "oversized covered patio built for entertaining"]
- 8 to 12 items total, each one short (under 15 words). One idea per item.
- Do NOT copy whole paragraphs and do NOT return one entry per listing. Merge repeated ideas into a single item.
- Focus on angles and phrasing, not raw specs like bedroom counts, square footage, or prices.
- Skip tables of numbers, tax data, and agent contact info.
- If the document has no marketing description text anywhere, return [].`;


export async function getCompRemarks(
  supabase: any,
  user: any,
  leadId: string,
  cacheOnly = false,
): Promise<string[]> {
  // 1. Cached?
  const { data: cached } = await supabase
    .from("market_analysis_files")
    .select("id, analysis_json")
    .eq("lead_id", leadId)
    .eq("agent_id", user.id)
    .eq("file_type", "comp_remarks")
    .limit(1);
  const cachedList = (cached?.[0]?.analysis_json as any)?.compRemarks;
  if (Array.isArray(cachedList)) return cachedList.filter((r: any) => typeof r === "string" && r.trim());
  if (cacheOnly) {
    console.log("comp remarks: none saved for lead", leadId, "- skipping extraction (cacheOnly)");
    return [];
  }

  // 2. Find the CMA / Property Detail Report document.
  const { data: docs } = await supabase
    .from("market_analysis_files")
    .select("file_path, file_name, document_label, mime_type")
    .eq("lead_id", leadId)
    .eq("agent_id", user.id)
    .not("file_path", "is", null)
    .order("created_at", { ascending: false });

  const isCma = (d: any) =>
    `${d.document_label || ""} ${d.file_name || ""}`.toLowerCase().includes("cma") ||
    `${d.document_label || ""} ${d.file_name || ""}`.toLowerCase().includes("property detail");
  const doc = (docs || []).find(isCma) || (docs || []).find((d: any) => (d.mime_type || "").includes("pdf"));
  if (!doc?.file_path) {
    console.log("comp remarks: no CMA/PDF document found for lead", leadId, "candidates:", (docs || []).length);
    return [];
  }
  console.log("comp remarks: reading document", doc.document_label || doc.file_name, doc.file_path);

  const { data: signed } = await supabase.storage
    .from("market-analysis-docs")
    .createSignedUrl(doc.file_path, 600);
  if (!signed?.signedUrl) return [];

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) return [];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "url", url: signed.signedUrl } },
          { type: "text", text: COMP_REMARKS_PROMPT },
        ],
      }],
    }),
  });

  if (!res.ok) {
    console.error("comp remarks extraction failed:", res.status, (await res.text()).slice(0, 300));
    return [];
  }

  const json = await res.json();
  const text: string = (json.content || []).map((c: any) => c?.text || "").join("").trim();
  const match = text.match(/\[[\s\S]*\]/);
  let remarks: string[] = [];
  try {
    const parsed = JSON.parse(match ? match[0] : text);
    if (Array.isArray(parsed)) remarks = parsed.filter((r: any) => typeof r === "string" && r.trim().length > 8);
  } catch (_) { /* leave empty */ }
  console.log("comp remarks: parsed", remarks.length, "remark(s) for lead", leadId);

  // 3. Cache (even an empty result, to avoid re-reading the PDF every run).
  try {
    if (cached?.[0]?.id) {
      await supabase.from("market_analysis_files")
        .update({ analysis_json: { compRemarks: remarks } })
        .eq("id", cached[0].id);
    } else {
      await supabase.from("market_analysis_files").insert({
        lead_id: leadId,
        agent_id: user.id,
        file_name: "Comparable Listing Remarks",
        file_path: null,
        file_type: "comp_remarks",
        mime_type: "application/json",
        document_label: "Comp Remarks Cache",
        source_type: "storage",
        analysis_json: { compRemarks: remarks },
      });
    }
  } catch (e) { console.error("comp remarks cache failed:", e); }

  return remarks;
}
