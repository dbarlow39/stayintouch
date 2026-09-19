import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Simple in-memory rate limit on failed code lookups (per IP)
const attempts = new Map<string, { count: number; reset: number }>();
function tooManyAttempts(ip: string) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now > rec.reset) return false;
  return rec.count >= 20;
}
function noteFailure(ip: string) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now > rec.reset) attempts.set(ip, { count: 1, reset: now + 10 * 60 * 1000 });
  else rec.count += 1;
}

const normalize = (code: string) => code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const action = String(body.action || "load");
  const rawCode = String(body.code || "");
  if (!rawCode || rawCode.length > 32) return json({ error: "Code is required" }, 400);
  if (tooManyAttempts(ip)) return json({ error: "Too many attempts. Please try again later." }, 429);

  const code = normalize(rawCode);

  const { data: access } = await supabase
    .from("worksheet_access_codes")
    .select("id, inspection_id, agent_id, property_address, expires_at, revoked")
    .eq("code", code)
    .maybeSingle();

  if (!access || access.revoked || new Date(access.expires_at) < new Date()) {
    noteFailure(ip);
    return json({ error: "That code isn't valid. Please double-check it with your agent." }, 404);
  }

  const { data: inspection, error: inspErr } = await supabase
    .from("inspections")
    .select("id, property_address, inspection_data, photos")
    .eq("id", access.inspection_id)
    .maybeSingle();

  if (inspErr || !inspection) return json({ error: "Worksheet not found" }, 404);

  // ---- LOAD ----
  if (action === "load") {
    await supabase
      .from("worksheet_access_codes")
      .update({ last_opened_at: new Date().toISOString() })
      .eq("id", access.id);

    return json({
      propertyAddress: inspection.property_address || access.property_address || "",
      data: inspection.inspection_data || {},
      photos: inspection.photos || {},
    });
  }

  // ---- PHOTO UPLOAD ----
  if (action === "photo") {
    const dataUrl = String(body.photo || "");
    if (!dataUrl.startsWith("data:image/")) return json({ error: "Invalid image" }, 400);
    const base64 = dataUrl.split(",")[1] ?? "";
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    if (bytes.length > 8 * 1024 * 1024) return json({ error: "Image is too large" }, 400);

    const fileName = `${access.agent_id}/seller/${access.inspection_id}/${Date.now()}_${crypto.randomUUID()}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("inspection-photos")
      .upload(fileName, bytes, { contentType: "image/jpeg" });
    if (upErr) return json({ error: upErr.message }, 500);

    const { data: urlData } = supabase.storage.from("inspection-photos").getPublicUrl(fileName);
    return json({ url: urlData.publicUrl });
  }

  // ---- SAVE / SUBMIT ----
  if (action === "save" || action === "submit") {
    const incomingData = (body.data ?? {}) as Record<string, any>;
    const incomingPhotos = (body.photos ?? {}) as Record<string, string[]>;
    if (typeof incomingData !== "object" || Array.isArray(incomingData)) {
      return json({ error: "Invalid data" }, 400);
    }

    const existingData = (inspection.inspection_data as Record<string, any>) || {};
    const existingPhotos = (inspection.photos as Record<string, string[]>) || {};

    // Merge section by section; seller values win only for fields they filled in.
    const mergedData: Record<string, any> = { ...existingData };
    for (const [sectionId, sectionValues] of Object.entries(incomingData)) {
      if (!sectionValues || typeof sectionValues !== "object") continue;
      const cleaned: Record<string, any> = {};
      for (const [fieldId, value] of Object.entries(sectionValues as Record<string, any>)) {
        if (value === undefined || value === null) continue;
        if (typeof value === "string" && value.trim() === "") continue;
        if (Array.isArray(value) && value.length === 0) continue;
        cleaned[fieldId] = typeof value === "string" ? value.slice(0, 5000) : value;
      }
      mergedData[sectionId] = { ...(existingData[sectionId] || {}), ...cleaned };
    }

    const mergedPhotos: Record<string, string[]> = { ...existingPhotos };
    for (const [sectionId, list] of Object.entries(incomingPhotos)) {
      if (!Array.isArray(list)) continue;
      const urls = list.filter((p) => typeof p === "string" && p.startsWith("http")).slice(0, 30);
      mergedPhotos[sectionId] = urls;
    }

    // Snapshot before overwriting so the agent can recover
    await supabase.from("inspection_history").insert({
      inspection_id: inspection.id,
      user_id: access.agent_id,
      inspection_data: inspection.inspection_data,
      photos: inspection.photos,
      property_address: inspection.property_address,
    });

    const { error: updErr } = await supabase
      .from("inspections")
      .update({ inspection_data: mergedData, photos: mergedPhotos })
      .eq("id", inspection.id);
    if (updErr) return json({ error: updErr.message }, 500);

    if (action === "submit") {
      await supabase
        .from("worksheet_access_codes")
        .update({ submitted_at: new Date().toISOString() })
        .eq("id", access.id);
    }

    return json({ success: true });
  }

  return json({ error: "Unknown action" }, 400);
});
