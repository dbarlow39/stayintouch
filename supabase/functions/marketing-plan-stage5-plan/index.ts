// Stage 5: seller marketing plan. Streamed to the browser and persisted at end.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authUser, failJob, markStage, saveStageResult, serviceClient } from "../_shared/marketing-plan-common.ts";
import {
  corsHeaders,
  OPUS_MODEL,
  streamClaudeToBrowser,
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
    const { jobId } = await req.json();
    const db = serviceClient();

    const { data: job } = await db
      .from("marketing_plan_jobs")
      .select("id, seller_lead_id, user_id, list_price, target_on_market_date, unusual_notes, mls_paste")
      .eq("id", jobId)
      .single();
    if (!job || job.user_id !== auth.userId) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    await markStage(db, jobId, "marketing_plan", "running");

    return await streamClaudeToBrowser(
      {
        model: OPUS_MODEL,
        system: SYSTEM_PROMPT,
        max_tokens: 24000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        messages: [{ role: "user", content: userMsg }],
      },
      async (fullText) => {
        await saveStageResult(db, jobId, "marketing_plan", fullText);
        await db
          .from("marketing_plan_jobs")
          .update({ status: "complete", current_stage: "marketing_plan", updated_at: new Date().toISOString() })
          .eq("id", jobId);
      },
    );
  } catch (e) {
    console.error("stage5 error:", e);
    try {
      const db = serviceClient();
      const body = await req.clone().json().catch(() => ({}));
      if (body?.jobId) await failJob(db, body.jobId, `Stage 5 fatal: ${e instanceof Error ? e.message : "unknown"}`);
    } catch { /* ignore */ }
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
