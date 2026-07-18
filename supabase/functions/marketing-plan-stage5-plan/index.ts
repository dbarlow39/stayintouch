// Stage 5: seller marketing plan.
// Backgrounded via EdgeRuntime.waitUntil. The Claude stream is accumulated
// server-side and written to marketing_plan_results every ~2s so the UI can
// display progressive text by polling that row. The ---INTERNAL--- split is
// preserved on every partial write — the seller-facing tab NEVER sees internal
// notes, even mid-stream (the delimiter appears near the end of the response).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { failJob, markStage, saveStageResult, serviceClient } from "../_shared/marketing-plan-common.ts";
import {
  corsHeaders,
  OPUS_MODEL,
  streamClaudeToStorage,
} from "../_shared/marketing-plan-claude.ts";

const SYSTEM_PROMPT = `You are a senior listing marketing strategist for Sell for 1 Percent, a full-service brokerage in Columbus / Central Ohio that lists homes for a 1% listing fee.

You are writing a MARKETING PLAN THAT THE AGENT WILL PRESENT TO THE HOMEOWNER. The reader is the seller, not the agent. This is a client-facing document that should make the homeowner feel confident their home is in expert hands.

AUDIENCE AND TONE
Write to the homeowner directly, in second person ("your home," "we'll"). Warm, professional, and specific. Confident without hype. No internal jargon - never use terms like "objection handling," "farming," "lead gen," "conversion," or "KPI." Never reference the agent's own business development. This document is about selling THEIR home.

NON-NEGOTIABLE RULES
1. NEVER STATE AN UNVERIFIED FACT, AND NEVER PRINT A PLACEHOLDER. You are given a property record, a photo review, document facts, and area research. If something is not established by that evidence, either omit it or describe it in general terms that remain true. NEVER write "[CONFIRM]", "TBD", "N/A", or any bracketed placeholder in the seller-facing document - it must read as a finished piece. Put every unverified item in the internal section instead.
   Resolve conflicts by source authority: pasted MLS data outranks the property record for square footage, year built, beds/baths and taxes; the HOA documents outrank everything on dues, age restriction, rules and official amenities; the photo review and documents govern layout reality; seller-written descriptions are claims only.
2. FAIR HOUSING. Describe the home and the lifestyle it offers, never who "should" live there. Say "main-floor living" and "low-maintenance," never "perfect for retirees" or "great for young families." Age-TARGETED is not age-RESTRICTED - if the documents show the community is not legally deed-restricted, never imply an age requirement. This document goes to a client in writing, so this matters.
3. LAYOUT PRECISION. If the evidence shows a staircase, loft, or second floor, do NOT describe the home as "single-level," "zero stairs," or "one-story" - write "main-level living plus [the upstairs space]." Do not mention a basement or finished lower level unless the evidence establishes one exists.
4. COMMUNITY VS PRIVATE AMENITIES. If a pool, clubhouse, gym or court is a community amenity, always describe it as part of the community. Never phrase it so the reader could think it is private to the home.
5. BE SPECIFIC TO THIS HOME. Reference the actual rooms, features, and setting the evidence establishes. A homeowner should read this and recognize their own house, not a template. Do not reference photo filenames, and do not discuss photography logistics or direct the photographer.

SELLER-FACING DOCUMENT STRUCTURE (Markdown, no preamble):

# Marketing Plan for {address}

Prepared by Sell for 1 Percent

## Your Home

## How We'll Position Your Home

## What Makes Your Home Stand Out

## The Buyer We're Targeting

## Your Neighborhood

## Pricing Strategy

## How We'll Market Your Home

### Professional Photography & Video

### MLS & Syndication

### Social Media & Digital Advertising

### Email & Agent Network

### Open Houses & Showings

### Print & Direct Mail

## Your Timeline

## Questions Buyers May Ask

## Preparing Your Home

## What You Save with Sell for 1 Percent

## Staying in Touch

## Your Agent

{agent name}, Sell for 1 Percent - {phone}, {email}

---INTERNAL---

# Before you present this

## Verify these facts

## Conflicts found in the evidence

## Left out on purpose

## Compliance notes`;

async function runPlan(jobId: string, userId: string) {
  const db = serviceClient();
  try {
    await markStage(db, jobId, "marketing_plan", "running");
    await db
      .from("marketing_plan_jobs")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", jobId);

    const { data: job } = await db
      .from("marketing_plan_jobs")
      .select("id, seller_lead_id, user_id, list_price, target_on_market_date, unusual_notes, mls_paste")
      .eq("id", jobId)
      .single();
    if (!job || job.user_id !== userId) throw new Error("job not found or unauthorized");

    const [{ data: lead }, { data: profile }, { data: results }] = await Promise.all([
      db.from("leads").select("*").eq("id", job.seller_lead_id).single(),
      db.from("profiles").select("full_name, first_name, last_name, cell_phone, email, preferred_email, bio, website").eq("id", job.user_id).single(),
      db.from("marketing_plan_results").select("stage, content").eq("job_id", jobId),
    ]);

    const byStage: Record<string, string> = {};
    (results || []).forEach((r) => { byStage[r.stage] = r.content; });

    const agentName = profile?.full_name || `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || "Your Sell for 1 Percent Agent";
    const agentEmail = profile?.preferred_email || profile?.email || "";
    const agentPhone = profile?.cell_phone || "";
    const addressFull = `${lead?.address || ""}, ${lead?.city || ""} ${lead?.state || ""} ${lead?.zip || ""}`.trim();

    const userMsg = `# Seller Lead
- Name: ${lead?.first_name || ""} ${lead?.last_name || ""}
- Address: ${addressFull}
- Beds/Baths (lead record): ${lead?.bedrooms || "?"} / ${lead?.bathrooms || "?"}
- Square feet (lead record): ${lead?.square_feet || "?"}
- Year built (lead record): ${lead?.year_built || "?"}

# Form Inputs
- List Price: ${job.list_price ?? "not specified"}
- Target On-Market Date: ${job.target_on_market_date ?? "not specified"}
- Anything Unusual: ${job.unusual_notes || "(none)"}

# MLS Data (agent-pasted, HIGHEST PRECEDENCE for sqft, year built, beds/baths, taxes)
${job.mls_paste || "(none pasted)"}

# Agent
- Name: ${agentName}
- Phone: ${agentPhone}
- Email: ${agentEmail}

# Stage 1 — Property Data
${byStage.property_data || "(not available)"}

# Stage 2 — Walkthrough Photo Review
${byStage.photo_review || "(not available)"}

# Stage 3 — Document Facts
${byStage.document_facts || "(not available)"}

# Stage 4 — Area Research
${byStage.area_research || "(not available)"}

Now produce the full seller-facing marketing plan, then the "---INTERNAL---" delimiter on its own line, then the internal notes. Substitute {address}, {agent name}, {phone}, {email} with the real values above. Do not print any bracketed placeholder in the seller-facing document.`;

    await streamClaudeToStorage(
      {
        model: OPUS_MODEL,
        system: SYSTEM_PROMPT,
        max_tokens: 24000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        messages: [{ role: "user", content: userMsg }],
      },
      // onPartial: persist accumulated text + heartbeat. The ---INTERNAL---
      // delimiter is emitted by the model near the end; the UI splits on the
      // full stored string every poll, so partial writes cannot leak internal
      // notes into the seller tab (there is no internal text yet at that point).
      async (partial) => {
        await saveStageResult(db, jobId, "marketing_plan", partial);
        await db
          .from("marketing_plan_jobs")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", jobId);
      },
      async (full) => {
        await saveStageResult(db, jobId, "marketing_plan", full);
        await db
          .from("marketing_plan_jobs")
          .update({ status: "complete", current_stage: "marketing_plan", updated_at: new Date().toISOString() })
          .eq("id", jobId);
      },
      2000,
    );
  } catch (e) {
    console.error("stage5 background error:", e);
    try {
      await failJob(db, jobId, `Stage 5 failed: ${e instanceof Error ? e.message : "unknown"}`);
    } catch { /* ignore */ }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    // Auth: the browser calls this with the user's access token. Service-role
    // invocations (self-retry) skip the user check by passing userId in body.
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace("Bearer ", "").trim();
    const { jobId, userId: bodyUserId } = await req.json();
    if (!jobId) throw new Error("jobId required");

    let userId = bodyUserId;
    if (!userId) {
      // Look up user from token via anon client.
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
      const anon = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } },
      );
      const { data, error } = await anon.auth.getUser();
      if (error || !data.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = data.user.id;
    }

    // Background it — CPU-limit kill cannot throw so the 3-minute stall
    // detector on updated_at is the backstop for silent failures.
    // @ts-ignore EdgeRuntime is provided by Supabase edge-runtime
    EdgeRuntime.waitUntil(runPlan(jobId, userId));

    return new Response(JSON.stringify({ ok: true, backgrounded: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("stage5 error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
