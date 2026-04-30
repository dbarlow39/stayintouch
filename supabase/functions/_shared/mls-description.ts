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

End with a compelling call to action that invites the reader to imagine themselves there: "Picture yourself..." or "Don't just buy a house, buy a lifestyle..."

STRICT RULES:
- Do NOT use em dashes (—). Use commas, periods, or parentheses instead.
- Keep the description under 1000 characters INCLUDING spaces. This is a hard limit.
- Do not use clichés like "must see" or "won't last long".
- Do not list features dryly. Weave them into the narrative.
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

  const factsText = `PROPERTY FACTS:\n${JSON.stringify(facts, null, 2)}\n\nAI SUMMARY OF WORK SHEET:\n${summary || "(none)"}\n\nFULL TRANSCRIPTION:\n${transcription || "(none)"}\n\nINSPECTION SECTION NOTES:\n${JSON.stringify(inspection.inspection_data, null, 2).slice(0, 8000)}\n\nNow write the MLS description. Remember: under 1000 characters, no em dashes, evocative storytelling, end with an imagined call to action.`;

  return { factsText, allPhotos };
}

export function aiGatewayErrorResponse(status: number) {
  if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded, try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings > Workspace > Usage." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
