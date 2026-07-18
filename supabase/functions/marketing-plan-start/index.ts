// Creates a marketing_plan_jobs row and kicks off stage 1.
// Documents are uploaded to storage on the client side, then their storage paths are
// posted here so we can persist them as marketing_plan_documents rows.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authUser, serviceClient, invokeNextStage } from "../_shared/marketing-plan-common.ts";
import { corsHeaders } from "../_shared/marketing-plan-claude.ts";

interface DocIn {
  storage_path: string;
  doc_type: string;
  filename: string;
}
interface StartBody {
  seller_lead_id: string;
  list_price?: number | null;
  target_on_market_date?: string | null;
  unusual_notes?: string | null;
  mls_paste?: string | null;
  documents?: DocIn[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = await authUser(req);
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = (await req.json()) as StartBody;
    if (!body.seller_lead_id) throw new Error("seller_lead_id required");

    const db = serviceClient();

    // Verify the lead belongs to the user.
    const { data: lead, error: leadErr } = await db
      .from("leads")
      .select("id, agent_id")
      .eq("id", body.seller_lead_id)
      .maybeSingle();
    if (leadErr) throw leadErr;
    if (!lead || lead.agent_id !== auth.userId) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: job, error: jobErr } = await db
      .from("marketing_plan_jobs")
      .insert({
        seller_lead_id: body.seller_lead_id,
        user_id: auth.userId,
        status: "running",
        current_stage: "property_data",
        list_price: body.list_price ?? null,
        target_on_market_date: body.target_on_market_date ?? null,
        unusual_notes: body.unusual_notes ?? null,
        mls_paste: body.mls_paste ?? null,
      })
      .select("id")
      .single();
    if (jobErr) throw jobErr;

    if (body.documents && body.documents.length) {
      const rows = body.documents.map((d) => ({
        job_id: job.id,
        storage_path: d.storage_path,
        doc_type: d.doc_type,
        filename: d.filename,
      }));
      const { error: dErr } = await db.from("marketing_plan_documents").insert(rows);
      if (dErr) throw dErr;
    }

    await invokeNextStage("marketing-plan-stage1-property", job.id);

    return new Response(JSON.stringify({ jobId: job.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("marketing-plan-start error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
