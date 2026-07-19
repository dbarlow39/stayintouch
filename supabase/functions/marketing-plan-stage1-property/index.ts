// Stage 1: pull authoritative property data from Estated. No AI.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  assertInternalCaller,
  checkGateAndAdvance,
  failJob,
  markStage,
  saveResultIfMissing,
  saveStageResult,
  serviceClient,
} from "../_shared/marketing-plan-common.ts";
import { corsHeaders } from "../_shared/marketing-plan-claude.ts";
import { STAGE4_REQUIRED, STAGE5_REQUIRED } from "../_shared/marketing-plan-gates.ts";

function toMd(field: string, value: any): string {
  if (value === null || value === undefined || value === "") return `- **${field}:** UNVERIFIED`;
  return `- **${field}:** ${value}`;
}

async function advanceDownstreamGates(db: any, jobId: string) {
  // Stage 1 completing may open the Stage 4 gate (needs 1+3) and, if
  // everything else is already in, the Stage 5 gate.
  try {
    await checkGateAndAdvance(db, jobId, STAGE4_REQUIRED, "marketing-plan-stage4-area", "stage4_dispatch");
  } catch (e) { console.error("stage1 gate4 advance error:", e); }
  try {
    await checkGateAndAdvance(db, jobId, STAGE5_REQUIRED, "marketing-plan-stage5-plan", "stage5_dispatch");
  } catch (e) { console.error("stage1 gate5 advance error:", e); }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const { jobId } = await req.json();
  const db = serviceClient();
  const FAILSAFE = `# Property Data (Stage 1)\n\n> Stage 1 did not complete cleanly. Property data must be confirmed manually.`;

  try {
    await markStage(db, jobId, "property_data", "running");

    const { data: job } = await db
      .from("marketing_plan_jobs")
      .select("seller_lead_id")
      .eq("id", jobId)
      .single();
    if (!job) throw new Error("job not found");

    const { data: lead } = await db
      .from("leads")
      .select("address, city, state, zip")
      .eq("id", job.seller_lead_id)
      .single();

    const token = Deno.env.get("ESTATED_API_KEY");
    let md = `# Property Data (Stage 1)\n\nAddress: ${lead?.address || ""}, ${lead?.city || ""} ${lead?.state || ""} ${lead?.zip || ""}\n\n`;

    if (!token) {
      md += "> ESTATED_API_KEY not configured — all property data must be confirmed manually.";
    } else {
      const params = new URLSearchParams({
        token,
        street_address: lead?.address || "",
        city: lead?.city || "",
        state: lead?.state || "",
        zip_code: lead?.zip || "",
      });

      const r = await fetch(`https://apis.estated.com/v4/property?${params.toString()}`);
      if (!r.ok) {
        md += `> Estated returned HTTP ${r.status} — all property data must be confirmed manually.`;
      } else {
        const j = await r.json();
        const d = j?.data;
        if (!d) {
          md += "> Estated returned no match — all property data must be confirmed manually.";
        } else {
          const p = d.parcel || {};
          const s = d.structure || {};
          const l = d.lot || {};
          const a = d.assessment || {};
          const t = d.taxes && d.taxes[0] ? d.taxes[0] : null;
          md += [
            toMd("Parcel ID", p.apn_original || p.apn_unformatted),
            toMd("Year Built", s.year_built),
            toMd("Total Finished Sq Ft", s.total_area_sq_ft),
            toMd("Bedrooms", s.beds_count),
            toMd("Bathrooms", s.baths),
            toMd("Stories", s.stories),
            toMd("Lot Size (sq ft)", l.size_sq_ft || l.size_acres),
            toMd("Construction", s.construction_type || s.exterior_wall_type),
            toMd("Roof", s.roof_material_type || s.roof_style_type),
            toMd("Heating", s.heating_type || s.heating_fuel_type),
            toMd("Cooling", s.air_conditioning_type),
            toMd("Garage / Parking", s.parking_type || s.parking_spaces_count),
            toMd("Assessed Value (Total)", a.total_value),
            toMd("Assessed Land Value", a.land_value),
            toMd("Assessed Improvement Value", a.improvement_value),
            toMd("Most Recent Tax Year", t?.year),
            toMd("Most Recent Tax Amount", t?.amount),
          ].join("\n");
        }
      }
    }

    await saveStageResult(db, jobId, "property_data", md);
  } catch (e) {
    console.error("stage1 error:", e);
    try {
      await saveStageResult(
        db,
        jobId,
        "property_data",
        `# Property Data (Stage 1)\n\n> Stage failed: ${e instanceof Error ? e.message : "unknown"} — all property data must be confirmed manually.`,
      );
    } catch (e2) {
      console.error("stage1 secondary save failed:", e2);
      try { await failJob(db, jobId, `Stage 1 fatal: ${e2 instanceof Error ? e2.message : "unknown"}`); } catch { /* ignore */ }
    }
  } finally {
    // Guarantee a result row exists no matter what happened above.
    try { await saveResultIfMissing(db, jobId, "property_data", FAILSAFE); } catch (e) { console.error("stage1 failsafe error:", e); }
    await advanceDownstreamGates(db, jobId);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
