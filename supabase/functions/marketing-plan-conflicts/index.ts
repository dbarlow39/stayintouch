// Evidence-only conflict detection pass. Runs after Stage 4 and BEFORE Stage 5.
// Emits the same unresolved_items JSON schema Stage 5 emits, but based on the
// raw evidence rows only (no plan generated yet). Writes to
// marketing_plan_results (stage="conflicts") and sets the job to
// status="awaiting_agent" so the UI can show the checklist.
//
// If it fails, the row is still written with unresolved_items=[] so the
// pipeline never gets stuck — the sweeper backstops this too.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  assertInternalOrJobOwner,
  saveStageResult,
  serviceClient,
} from "../_shared/marketing-plan-common.ts";
import { callClaude, corsHeaders, OPUS_MODEL } from "../_shared/marketing-plan-claude.ts";

const DEADLINE_MS = 100_000;

const SYSTEM_PROMPT = `You are a strict evidence auditor for a listing marketing plan pipeline.

You will receive the RAW evidence gathered for a specific property: an Estated property record, a walkthrough photo review, a document-facts extraction (HOA / disclosures / market analysis / homeowner transcript / MLS paste), plus area research. You will NOT write any marketing copy. You will produce ONLY a structured JSON block listing every claim that (a) would meaningfully change the marketing if verified, but (b) you decline to state as fact because it looks unverified or the sources disagree.

RULES:
- Read every evidence block carefully.
- Prefer to surface claims that are MATERIAL to marketing (selling points, offsets to likely buyer objections, amenities, documented improvements, mechanical replacement dates, lot / privacy facts, HOA rules and dues, tax figures).
- Split conflicts into TWO kinds:
  * "existence" — sources disagree on whether a thing exists at all (e.g. one source implies a humidifier, another says none).
  * "value" — sources agree the thing exists but disagree on a figure or attribute (e.g. HOA dues, square footage, year built, roof replacement year).
- For every "value" conflict, list every distinct value observed as a separate candidate. If ANY source denies existence entirely, include that denial as an explicit candidate with a plain-English phrase like "No HOA / does not exist" and the source that made the denial.
- If nothing needs agent action, emit an empty unresolved_items array. NEVER omit the JSON block.

OUTPUT FORMAT (STRICT):
Return ONLY a single fenced JSON code block. No preamble, no explanation, no other text. The JSON object has exactly one key "unresolved_items" that is an array. Each array entry has exactly these keys:
  "claim" (string, one sentence)
  "source" (string, which evidence source — for value conflicts, "conflicting" is acceptable when there is no clear winner)
  "reason_unresolved" (string)
  "what_would_confirm" (string)
  "materiality" (string, one of "high", "medium", "low")
  "if_confirmed" (string, what changes in the plan if this is confirmed true)
  "conflict_type" (string, one of "existence" or "value")
  "candidate_values" (array; empty for "existence" conflicts; for "value" conflicts, one entry per distinct value with keys "value" and "source")

Return the JSON block and nothing else.`;

function extractJsonBlock(text: string): { unresolved_items: any[] } {
  const m = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  const raw = m ? m[1] : text;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.unresolved_items)) return parsed;
  } catch {}
  try {
    // Try locating the first { .. } object.
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      if (parsed && Array.isArray(parsed.unresolved_items)) return parsed;
    }
  } catch {}
  return { unresolved_items: [] };
}

async function runConflicts(jobId: string) {
  const db = serviceClient();
  try {
    await db
      .from("marketing_plan_jobs")
      .update({ current_stage: "conflicts", status: "running", updated_at: new Date().toISOString() })
      .eq("id", jobId);

    const { data: job } = await db
      .from("marketing_plan_jobs")
      .select("seller_lead_id, list_price, target_on_market_date, unusual_notes, mls_paste, agent_notes")
      .eq("id", jobId)
      .single();

    const { data: lead } = await db
      .from("leads")
      .select("address, city, state, zip, first_name, last_name, bedrooms, bathrooms, square_feet, year_built")
      .eq("id", (job as any)?.seller_lead_id)
      .single();

    const { data: rows } = await db
      .from("marketing_plan_results")
      .select("stage, content")
      .eq("job_id", jobId);
    const byStage: Record<string, string> = {};
    (rows || []).forEach((r: any) => { byStage[r.stage] = r.content; });

    const areaTopics = ["schools","recreation","convenience","commute","community","demographics","market"];
    const areaBlock = areaTopics.map((t) => byStage[`area_${t}`]).filter(Boolean).join("\n\n");

    const userMsg = `# Subject Property
Address: ${lead?.address || "?"}, ${lead?.city || "?"} ${lead?.state || ""} ${lead?.zip || ""}
Beds/Baths (lead record): ${lead?.bedrooms || "?"} / ${lead?.bathrooms || "?"}
Square feet (lead record): ${lead?.square_feet || "?"}
Year built (lead record): ${lead?.year_built || "?"}
List price (agent): ${(job as any)?.list_price ?? "not specified"}

# Agent form inputs
Unusual notes: ${(job as any)?.unusual_notes || "(none)"}
MLS paste: ${(job as any)?.mls_paste || "(none)"}
Agent-supplied context (not documented): ${(job as any)?.agent_notes || "(none)"}

# Stage 1 — Property Data (Estated)
${byStage.property_data || "(not available)"}

# Stage 2 — Walkthrough Photo Review
${byStage.photo_review || "(not available)"}

# Stage 3 — Document Facts
${byStage.document_facts || "(not available)"}

# Stage 4 — Area Research
${areaBlock || "(not available)"}

Now emit the unresolved_items JSON block per the system rules. JSON only.`;

    const claudePromise = callClaude({
      model: OPUS_MODEL,
      system: SYSTEM_PROMPT,
      max_tokens: 8000,
      output_config: { effort: "high" },
      messages: [{ role: "user", content: userMsg }],
    });
    const timeoutPromise = new Promise<{ __timeout: true }>((resolve) =>
      setTimeout(() => resolve({ __timeout: true }), DEADLINE_MS)
    );
    const winner = await Promise.race([claudePromise, timeoutPromise]);

    let unresolved: any[] = [];
    if ((winner as any).__timeout) {
      console.warn(`marketing-plan-conflicts job ${jobId} hit deadline`);
      claudePromise.catch(() => {});
    } else {
      const res = winner as Awaited<typeof claudePromise>;
      const parsed = extractJsonBlock(res.text || "");
      unresolved = parsed.unresolved_items || [];
    }

    const payload = JSON.stringify({ unresolved_items: unresolved }, null, 2);
    await saveStageResult(db, jobId, "conflicts", payload);
    await db
      .from("marketing_plan_jobs")
      .update({
        status: "awaiting_agent",
        current_stage: "conflicts",
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    console.log(`marketing-plan-conflicts job ${jobId} wrote ${unresolved.length} item(s), status=awaiting_agent`);
  } catch (e) {
    console.error("marketing-plan-conflicts error:", e);
    try {
      await saveStageResult(db, jobId, "conflicts", JSON.stringify({ unresolved_items: [] }));
      await db
        .from("marketing_plan_jobs")
        .update({ status: "awaiting_agent", updated_at: new Date().toISOString() })
        .eq("id", jobId);
    } catch { /* ignore */ }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const { jobId } = await req.json();
  if (!jobId) {
    return new Response(JSON.stringify({ error: "jobId required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const unauth = await assertInternalOrJobOwner(req, jobId);
  if (unauth) return unauth;
  // @ts-ignore EdgeRuntime
  EdgeRuntime.waitUntil(runConflicts(jobId));
  return new Response(JSON.stringify({ ok: true, backgrounded: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
