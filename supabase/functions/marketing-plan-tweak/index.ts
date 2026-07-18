// Applies a user-requested revision to an existing marketing plan without
// re-running stages 1-4. Loads the current plan text, sends it to Claude with
// the user's instruction, and overwrites the stored result if valid.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders, callClaude } from "../_shared/marketing-plan-claude.ts";
import { serviceClient, authUser, saveStageResult } from "../_shared/marketing-plan-common.ts";

const MODEL = "claude-sonnet-4-5";

const SYSTEM_PROMPT = `You are revising an existing seller-facing marketing plan document.

RULES (non-negotiable):
1. Apply ONLY the user's requested change. Do not rewrite, restructure, or "improve" other sections.
2. Return the ENTIRE revised document verbatim, preserving every heading, section, bullet, table, and the "---INTERNAL---" delimiter if present, along with all internal notes after it.
3. Preserve all existing formatting (markdown headings, bold, lists, tables).
4. Do NOT use em-dashes (—) or en-dashes (–) anywhere. Use periods, commas, "to", or parentheses instead.
5. Do not add commentary, preambles, or explanations. Output the revised plan text only.
6. If the user's instruction is ambiguous or impossible to apply, return the original plan unchanged.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const user = await authUser(req);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { job_id, instruction } = await req.json();
    if (!job_id || typeof job_id !== "string") {
      return new Response(JSON.stringify({ error: "job_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!instruction || typeof instruction !== "string" || instruction.trim().length < 3) {
      return new Response(JSON.stringify({ error: "instruction required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = serviceClient();

    // Verify job ownership.
    const { data: job, error: jobErr } = await db
      .from("marketing_plan_jobs")
      .select("id, agent_id")
      .eq("id", job_id)
      .single();
    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (job.agent_id !== user.userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load current plan.
    const { data: resultRow, error: resErr } = await db
      .from("marketing_plan_results")
      .select("content")
      .eq("job_id", job_id)
      .eq("stage", "marketing_plan")
      .single();
    if (resErr || !resultRow?.content) {
      return new Response(JSON.stringify({ error: "No existing marketing plan to revise" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const original = resultRow.content as string;

    const userMsg = `CURRENT MARKETING PLAN:
\`\`\`
${original}
\`\`\`

REQUESTED CHANGE:
${instruction.trim()}

Return the full revised plan now.`;

    const { text } = await callClaude({
      model: MODEL,
      system: SYSTEM_PROMPT,
      max_tokens: 24000,
      temperature: 0.2,
      messages: [{ role: "user", content: userMsg }],
    });

    // Sanity check: refuse to overwrite with truncated/empty output.
    if (!text || text.trim().length < 500) {
      return new Response(
        JSON.stringify({ error: "Model returned too little content; original plan unchanged." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await saveStageResult(db, job_id, "marketing_plan", text);
    await db
      .from("marketing_plan_jobs")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", job_id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("marketing-plan-tweak error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
