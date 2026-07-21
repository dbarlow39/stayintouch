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
2. Return the ENTIRE revised document verbatim, preserving every heading, section, bullet, table, and any delimiter lines that are present ("---VERIFICATION---", "---PLAN---", or legacy "---INTERNAL---") along with all content on either side of them.
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

    const body = await req.json();
    const job_id = body?.job_id;
    const instruction: string | undefined = body?.instruction;
    const agent_confirmations = Array.isArray(body?.agent_confirmations) ? body.agent_confirmations : null;

    if (!job_id || typeof job_id !== "string") {
      return new Response(JSON.stringify({ error: "job_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build a synthesized instruction from structured agent_confirmations,
    // OR use the raw text instruction. One of the two must be provided.
    let effectiveInstruction = "";
    if (agent_confirmations && agent_confirmations.length > 0) {
      const confirmed = agent_confirmations.filter((c: any) => c?.action === "confirmed");
      const rejected = agent_confirmations.filter((c: any) => c?.action === "rejected");
      const parts: string[] = [];
      parts.push("Apply the following agent confirmations to the plan. Do not change any other content.");
      parts.push("");
      if (confirmed.length > 0) {
        parts.push("CONFIRMED ITEMS (treat as established facts and incorporate into the seller-facing plan; remove any hedging or objection language that these facts refute; add each item as a bullet under the internal verification heading \"## Agent-confirmed\" with the claim, agent note if any, and confirmed_at timestamp):");
        for (const c of confirmed) {
          parts.push(`- Claim: ${String(c.claim || "").trim()}`);
          parts.push(`  Source: ${String(c.source || "").trim()}`);
          if (c.agent_note && String(c.agent_note).trim()) parts.push(`  Agent note: ${String(c.agent_note).trim()}`);
          parts.push(`  Confirmed at: ${String(c.confirmed_at || new Date().toISOString())}`);
        }
        parts.push("");
      }
      if (rejected.length > 0) {
        parts.push("REJECTED ITEMS (the agent has explicitly refuted these; they MUST NOT appear anywhere in the seller-facing plan, and any related objection or hedge should stand only on evidence other than these claims):");
        for (const c of rejected) {
          parts.push(`- Claim: ${String(c.claim || "").trim()}`);
          parts.push(`  Source: ${String(c.source || "").trim()}`);
          if (c.agent_note && String(c.agent_note).trim()) parts.push(`  Agent note: ${String(c.agent_note).trim()}`);
        }
        parts.push("");
      }
      parts.push("Also update the JSON block at the end of the verification section to REMOVE any unresolved_items entries whose claim matches a confirmed or rejected item above.");
      if (instruction && instruction.trim().length >= 3) {
        parts.push("");
        parts.push(`Additional agent instruction: ${instruction.trim()}`);
      }
      effectiveInstruction = parts.join("\n");
    } else if (instruction && typeof instruction === "string" && instruction.trim().length >= 3) {
      effectiveInstruction = instruction.trim();
    } else {
      return new Response(JSON.stringify({ error: "instruction or agent_confirmations required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = serviceClient();

    // Verify job ownership. Note: marketing_plan_jobs uses user_id for the owner.
    const { data: job, error: jobErr } = await db
      .from("marketing_plan_jobs")
      .select("id, user_id")
      .eq("id", job_id)
      .single();
    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (job.user_id !== user.userId) {
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
${effectiveInstruction}

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
