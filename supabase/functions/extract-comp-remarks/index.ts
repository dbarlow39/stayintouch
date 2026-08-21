// Pulls the public remarks of every comparable listing out of the lead's
// CMA / Property Detail Report PDF so the agent can review and edit them
// BEFORE any MLS description is generated.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, corsHeaders, getCompRemarks } from "../_shared/mls-description.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { supabase, user } = await authenticate(req);
    const body = await req.json().catch(() => ({}));
    const leadId = typeof body?.leadId === "string" ? body.leadId.trim() : "";
    if (!leadId) {
      return new Response(JSON.stringify({ error: "leadId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // force = ignore whatever is cached and re-read the PDF.
    if (body?.force === true) {
      await supabase
        .from("market_analysis_files")
        .delete()
        .eq("lead_id", leadId)
        .eq("agent_id", user.id)
        .eq("file_type", "comp_remarks");
    }

    const remarks = await getCompRemarks(supabase, user, leadId, false);

    return new Response(JSON.stringify({ remarks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    const msg = e?.message || "Unexpected error";
    const status = msg === "Unauthorized" || msg === "Missing authorization" ? 401 : 500;
    console.error("extract-comp-remarks error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
