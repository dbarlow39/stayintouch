// Stage 2: walkthrough photo review (Claude Opus vision, batched by 15).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  assertInternalOrJobOwner,
  checkGateAndAdvance,
  markStage,
  saveResultIfMissing,
  saveStageResult,
  serviceClient,
} from "../_shared/marketing-plan-common.ts";
import {
  callClaude,
  corsHeaders,
  OPUS_MODEL,
  type Block,
} from "../_shared/marketing-plan-claude.ts";
import { STAGE5_REQUIRED } from "../_shared/marketing-plan-gates.ts";

async function advanceStage5Gate(db: any, jobId: string) {
  try {
    await checkGateAndAdvance(db, jobId, STAGE5_REQUIRED, "marketing-plan-stage5-plan", "stage5_dispatch");
  } catch (e) { console.error("stage2 gate5 advance error:", e); }
}

const SYSTEM_PROMPT = `You are reviewing an agent's walkthrough photos of a home they are preparing to list.

These are phone photos taken during a tour - unstaged, variable lighting, personal belongings still in frame. They are NOT marketing photos and professional photography has not been done yet.

Read them for FACTS about the property, not for photographic quality. Do not critique the photography, lighting, or composition. Do not give instructions to a photographer.

Your jobs:
1. ESTABLISH GROUND TRUTH. Identify each room or area shown. Be specific - name the room (kitchen, primary bedroom, screened porch, community clubhouse), not a vague category. If you cannot tell, say so. Never invent a feature you cannot see.
2. FLAG LAYOUT AND AMENITY REALITY. These determine what the listing may accurately claim:
   (a) Any staircase, loft, or second floor - this determines whether the home may be described as single-level. State plainly whether you see evidence of an upper level.
   (b) Any basement or lower level, or evidence there is none.
   (c) Whether a pool, clubhouse, gym, or sport court appears to be a COMMUNITY amenity rather than private to the home - look for shared-facility signals such as rows of matching lounge chairs, commercial depth markings, signage, or a separate clubhouse building.
   (d) Notable finishes and upgrades actually visible.
   (e) The strongest visual features of the property - views, outdoor living, unusual architecture - that marketing should be built around.
3. NOTE CONDITION AND PREPARATION. Rooms needing decluttering or depersonalizing before photos and showings, and any visible condition issue a buyer would notice. Be constructive and tactful - this feeds advice given to the homeowner.

Return Markdown:

## Room Inventory
A table: Filename | Room/Area | What It Shows | Notes

## Layout Findings
Explicit statements about stories, stairs, basement, and whether amenities are community or private.

## Features Worth Marketing

## Condition & Preparation Notes`;

const MERGE_PROMPT = `You have batch outputs from reviewing walkthrough photos. Merge them into ONE final report using the same four headings (Room Inventory, Layout Findings, Features Worth Marketing, Condition & Preparation Notes). Preserve every filename in the Room Inventory table. Reconcile any conflicts between batches by keeping the more specific/verified observation.`;

async function fetchImage(url: string): Promise<{ media_type: string; data: string } | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const ct = (r.headers.get("content-type") || "image/jpeg").split(";")[0];
    // Downscale is skipped server-side to keep the runtime simple; Anthropic accepts up to ~5MB per image.
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      bin += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    return { media_type: ct, data: btoa(bin) };
  } catch (_) {
    return null;
  }
}

// Hard server-side deadline for the entire stage. Prevents silent isolate
// kills from leaving the job stuck at status='running'.
const STAGE2_DEADLINE_MS = 240_000;

async function runPhotoReview(jobId: string) {
  const db = serviceClient();
  const startedAt = Date.now();
  const FAILSAFE = "# Walkthrough Photo Review (Stage 2)\n\n> Stage 2 did not complete cleanly. Photo review unavailable.";
  try {
    await markStage(db, jobId, "photo_review", "running");
    await db.from("marketing_plan_jobs").update({ current_batch: 0, updated_at: new Date().toISOString() }).eq("id", jobId);

    const { data: job } = await db
      .from("marketing_plan_jobs")
      .select("seller_lead_id, user_id")
      .eq("id", jobId)
      .single();
    if (!job) throw new Error("job not found");

    const { data: lead } = await db
      .from("leads")
      .select("address")
      .eq("id", job.seller_lead_id)
      .single();

    const address = (lead?.address || "").trim();
    let photos: Record<string, string[]> = {};
    if (address) {
      const words = address.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
      const loose = `%${words.join("%")}%`;
      const { data: insp } = await db
        .from("inspections")
        .select("photos")
        .eq("user_id", job.user_id)
        .ilike("property_address", loose)
        .limit(1);
      if (insp && insp[0]?.photos) {
        photos = insp[0].photos as Record<string, string[]>;
      }
    }

    const items: { name: string; url: string }[] = [];
    for (const [section, arr] of Object.entries(photos)) {
      (arr || []).forEach((url, i) => {
        if (!url) return;
        const clean = url.split("?")[0].split("/").pop() || `${section}-${i}.jpg`;
        items.push({ name: `${section}/${clean}`, url });
      });
    }

    if (items.length === 0) {
      await saveStageResult(
        db,
        jobId,
        "photo_review",
        "# Walkthrough Photo Review (Stage 2)\n\n> No walkthrough photos available — layout and condition could not be visually verified.",
      );
      return;
    }

    const BATCH = 6;
    const batchOutputs: string[] = [];
    const limitedNote =
      items.length < 5
        ? "\n\n> Visual coverage is limited (fewer than 5 photos) — layout findings are provisional."
        : "";

    let overloadRetries = 0;
    let lastStopReason = "unknown";

    for (let i = 0; i < items.length; i += BATCH) {
      if (Date.now() - startedAt > STAGE2_DEADLINE_MS) {
        console.warn(`stage2 hit ${STAGE2_DEADLINE_MS}ms deadline at batch ${Math.floor(i / BATCH) + 1}`);
        break;
      }
      const batch = items.slice(i, i + BATCH);
      const blocks: Block[] = [];
      for (const it of batch) {
        blocks.push({ type: "text", text: `Filename: ${it.name}` });
        const img = await fetchImage(it.url);
        if (img) {
          blocks.push({
            type: "image",
            source: { type: "base64", media_type: img.media_type, data: img.data },
          });
        }
      }
      blocks.push({
        type: "text",
        text: `Please review these ${batch.length} photos and return the Markdown report described in the system prompt.`,
      });

      const res = await callClaude({
        model: OPUS_MODEL,
        system: SYSTEM_PROMPT,
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        messages: [{ role: "user", content: blocks }],
      });
      overloadRetries += res.retries || 0;
      lastStopReason = res.stop_reason || lastStopReason;
      const txt = (res.text || "").trim();
      if (txt.length > 0) batchOutputs.push(txt);
      else console.warn(`stage2 batch ${Math.floor(i / BATCH) + 1} produced empty output (stop_reason=${res.stop_reason}, retries=${res.retries})`);

      const batchNum = Math.floor(i / BATCH) + 1;
      await db
        .from("marketing_plan_jobs")
        .update({ current_batch: batchNum, updated_at: new Date().toISOString() })
        .eq("id", jobId);
    }

    if (batchOutputs.length === 0) {
      // Empty or deadline-hit — record as FAILED with diagnostics so downstream
      // can see it did NOT complete cleanly. Do NOT open the Stage 5 gate here;
      // the finally block deliberately skips advanceStage5Gate in this case.
      await saveStageResult(
        db,
        jobId,
        "photo_review",
        `# Walkthrough Photo Review (Stage 2)\n\n> **FAILED:** No usable photo-review output produced.\n\n<!-- stage2 diagnostics\nempty_output: true\nbatches_attempted: ${Math.min(Math.ceil(items.length / BATCH), Math.floor((Date.now() - startedAt) / 1000))}\nlast_stop_reason: ${lastStopReason}\noverload_retries: ${overloadRetries}\nhit_deadline: ${Date.now() - startedAt > STAGE2_DEADLINE_MS}\n-->`,
      );
      return;
    }

    let finalMd: string;
    if (batchOutputs.length === 1) {
      finalMd = batchOutputs[0];
    } else {
      const merged = await callClaude({
        model: OPUS_MODEL,
        system: MERGE_PROMPT,
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        messages: [
          {
            role: "user",
            content: batchOutputs
              .map((o, i) => `--- BATCH ${i + 1} ---\n${o}`)
              .join("\n\n"),
          },
        ],
      });
      overloadRetries += merged.retries || 0;
      lastStopReason = merged.stop_reason || lastStopReason;
      const mergedTxt = (merged.text || "").trim();
      if (mergedTxt.length === 0) {
        // Merge came back empty — fall back to concatenating raw batch outputs
        // rather than losing all research.
        console.warn(`stage2 merge produced empty output; falling back to concatenated batches`);
        finalMd = batchOutputs.map((o, i) => `### Batch ${i + 1}\n\n${o}`).join("\n\n");
      } else {
        finalMd = mergedTxt;
      }
    }

    const diag = `\n\n<!-- stage2 diagnostics\nempty_output: false\nbatches: ${batchOutputs.length}\nlast_stop_reason: ${lastStopReason}\noverload_retries: ${overloadRetries}\n-->`;
    await saveStageResult(
      db,
      jobId,
      "photo_review",
      `# Walkthrough Photo Review (Stage 2)${limitedNote}\n\n${finalMd}${diag}`,
    );

  } catch (e) {
    console.error("stage2 background error:", e);
    try {
      await saveStageResult(
        db,
        jobId,
        "photo_review",
        `# Walkthrough Photo Review (Stage 2)\n\n> Stage failed: ${e instanceof Error ? e.message : "unknown"} — layout and condition could not be visually verified.`,
      );
    } catch (e2) {
      console.error("stage2 secondary save failed:", e2);
    }
  } finally {
    try { await saveResultIfMissing(db, jobId, "photo_review", FAILSAFE); } catch (e) { console.error("stage2 failsafe error:", e); }
    await advanceStage5Gate(db, jobId);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const { jobId } = await req.json();
  const unauth = await assertInternalOrJobOwner(req, jobId);
  if (unauth) return unauth;

  // Detach the heavy work from the request wall-clock. Any thrown error inside
  // runPhotoReview flips the job to status='failed' via failJob.
  // @ts-ignore EdgeRuntime is provided by Supabase edge-runtime
  EdgeRuntime.waitUntil(runPhotoReview(jobId));

  return new Response(JSON.stringify({ ok: true, backgrounded: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
