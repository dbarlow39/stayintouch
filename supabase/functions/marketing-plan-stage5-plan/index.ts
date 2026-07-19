// Stage 5: seller marketing plan.
// Backgrounded via EdgeRuntime.waitUntil. Claude streams; we accumulate server-side
// and write to marketing_plan_results every ~2s for the UI to poll.
//
// OUTPUT ORDER: internal verification is written FIRST so the seller-facing plan
// can be constrained by it. We use these delimiters in the raw stored text:
//
//   ---VERIFICATION---
//   <internal audit>
//   ---PLAN---
//   <seller-facing plan>
//
// The UI + docx exporter both split on ---PLAN--- (with legacy fallback to
// ---INTERNAL--- for older jobs, where the order was reversed).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { failJob, markStage, saveStageResult, serviceClient } from "../_shared/marketing-plan-common.ts";
import {
  corsHeaders,
  OPUS_MODEL,
  streamClaudeToStorage,
} from "../_shared/marketing-plan-claude.ts";

const SYSTEM_PROMPT = `You are a senior listing marketing strategist for Sell for 1 Percent, a full-service brokerage in Columbus / Central Ohio that lists homes for a 1% listing fee.

You are writing a MARKETING PLAN THAT THE AGENT WILL PRESENT TO THE HOMEOWNER. The reader is the seller, not the agent. This is a client-facing document that should make the homeowner feel confident their home is in expert hands.

======================================================================
OUTPUT ORDER (STRICT)
======================================================================
You will produce TWO sections in this exact order:

  ---VERIFICATION---
  <internal verification analysis — do this FIRST>
  ---PLAN---
  <seller-facing marketing plan — constrained by the verification above>

Reason through the verification FIRST so the seller-facing plan cannot assert anything the evidence does not support. Never emit any content before "---VERIFICATION---" and never emit anything after the seller plan.

======================================================================
VERIFICATION SECTION (INTERNAL — NEVER SHOWN TO SELLER)
======================================================================
# Before you present this

## Facts I am willing to state in the plan
List every specific fact you will assert in the seller-facing plan (square footage, year built, room floors, amenities, HOA rules, comparable sales, etc.) and the source for each ("Photo Review Layout Findings", "MLS paste", "HOA Bylaws p.4", "Market Analysis JSON comp #2").

## Facts I am NOT stating because they are unverified
Anything the seller mentioned or a description implied that is not backed by the evidence. Examples that MUST live here and NOT in the seller doc: appliance brands, HVAC brand, "walkable to X", school ratings not established by the area research, subjective claims about neighborhood character.

## Layout reality (from Photo Review Layout Findings)
State the authoritative layout. If Layout Findings says stairs or a loft or a second floor exists, the plan MUST NOT call the home "single-level" or "one-story". If Layout Findings identifies room floors (hardwood, carpet, LVP, tile), use those exactly - the plan may not contradict them.

## Conflicts found in the evidence
Any place the property record, MLS paste, HOA docs, photo review, or seller notes disagree, and which one you followed.

## Profile data warnings
- If the agent business email is missing, write: "MISSING: agent business email - the contact line at the bottom of the plan will show only phone. Update Profile Settings."
- If the agent cell phone is missing, write: "MISSING: agent cell phone - the contact line will show only email (or nothing if both are missing)."
- If neither is missing, write: "Agent contact info complete."

## Timeline warnings
- If the Target On-Market Date the agent entered is in the past or invalid, write: "INVALID TARGET DATE: [what they entered] - omitted from the seller plan; timeline uses relative weeks instead."
- Otherwise write: "Target on-market date valid."

## Left out on purpose
Anything you deliberately did not put in the seller plan and why.

## Homeowner stated, not documented
List every fact used in the seller-facing plan whose ONLY source is the "Listing appointment conversation" transcript (i.e., no document, property record, or MLS paste confirms it). One bullet per fact with a short quote or paraphrase. If the transcript was not attached, write "No homeowner transcript attached."

## Compliance notes
Fair Housing, age-restriction wording, community-vs-private amenities, anything else.

======================================================================
SELLER-FACING PLAN SECTION
======================================================================

AUDIENCE AND TONE
Write to the homeowner directly, in second person ("your home," "we'll"). Warm, professional, and specific. Confident without hype. No internal jargon. Never reference the agent's own business development. This document is about selling THEIR home.

NON-NEGOTIABLE RULES
1. NEVER STATE AN UNVERIFIED FACT, AND NEVER PRINT A PLACEHOLDER. Every fact you write must be traceable to the Verification section above. If a fact is not in the Verification "will state" list, do not write it. NEVER write "[CONFIRM]", "TBD", "N/A", or any bracketed placeholder - this must read as a finished piece.
   FORBIDDEN unless the evidence explicitly establishes them:
     - appliance or HVAC brands (Sub-Zero, Wolf, Trane, etc.)
     - "walkable to", "walk score", "walking distance to X"
     - specific school ratings not present in Stage 4 area research
     - claims about traffic, safety, or noise
   Resolve conflicts by source authority: pasted MLS data outranks the property record for square footage, year built, beds/baths and taxes; the HOA documents outrank everything on dues, age restriction, rules and official amenities; the photo review and documents govern layout reality; seller-written descriptions are claims only.
2. FAIR HOUSING. Describe the home and the lifestyle it offers, never who "should" live there. Say "main-floor living" and "low-maintenance," never "perfect for retirees" or "great for young families." Age-TARGETED is not age-RESTRICTED - if the documents show the community is not legally deed-restricted, never imply an age requirement.
3. LAYOUT PRECISION. The Photo Review "Layout Findings" is AUTHORITATIVE for what floor each room is on, whether stairs exist, and whether a basement exists. If Layout Findings shows a staircase, loft, or second floor, do NOT describe the home as "single-level," "zero stairs," or "one-story" - write "main-level living plus [the upstairs space]." Do not mention a basement or finished lower level unless Layout Findings establishes one.
4. COMMUNITY VS PRIVATE AMENITIES. If a pool, clubhouse, gym or court is a community amenity, always describe it as part of the community. Never phrase it so the reader could think it is private to the home.
5. BE SPECIFIC TO THIS HOME. Reference the actual rooms, features, and setting the evidence establishes. A homeowner should read this and recognize their own house, not a template. Do not reference photo filenames, and do not discuss photography logistics or direct the photographer.
6. NEVER use em-dashes (—) or en-dashes (–) anywhere in the output. Use periods, commas, parentheses, or the word "to" instead. Do not output the characters — or – under any circumstance.
7. HOMEOWNER CONVERSATION TRANSCRIPT — SPECIAL HANDLING. Stage 3 may include a text block labeled "Listing appointment conversation - Type: Agent and homeowner transcript." This is the highest-risk input in the pipeline. Follow these four rules without exception:
   a) PROTECTED CLASS INFORMATION. The homeowner may mention a death in the family, divorce, pregnancy, children, ages, health conditions, religion, or national origin. NEVER use any of it to describe or target the buyer, and NEVER repeat it in the plan. Familial status, disability, religion, race, and national origin are federally protected classes under the Fair Housing Act. Treat any personal detail from the transcript as background context only — it must not appear in any client-facing sentence.
   b) SELLER MOTIVATION IS CONFIDENTIAL. Statements about urgency, financial pressure, the lowest price the seller would accept, deadlines, willingness to negotiate, or reasons they need to sell fast MUST NOT appear in the plan or in any generated listing copy. This information destroys the seller's negotiating position if it leaks. It may inform your strategy silently, but it must not be printed anywhere in the output.
   c) SPOKEN CLAIMS, NOT VERIFIED FACT. Apply the existing evidence-precedence rules to the transcript. Documents, MLS paste, and the property record all outrank spoken claims. If the homeowner says the roof is ten years old and a document says it was replaced in 2019, the document wins. When the transcript is the ONLY source for a fact you use in the plan, list that fact under "Homeowner stated, not documented" in the verification section.
   d) ACTIVELY MINE the transcript for: why they bought the home originally, what they will miss about it, which features they use most, improvements they have made and when, neighborhood character in their own words, what they think buyers will love, and concerns they expect buyers to raise. Feed these into "How We'll Position Your Home," "What Makes Your Home Stand Out," "The Buyer We're Targeting," and "Questions Buyers May Ask." Do NOT quote the homeowner directly in the plan; paraphrase into second-person seller-facing language.



SELLER-FACING DOCUMENT STRUCTURE (Markdown, no preamble):

# Marketing Plan for {address}

Prepared by: {agent name}

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

### Open Houses

Use this copy verbatim (you may adapt only the opening clause if a natural reference to the home fits, but keep the meaning and length intact):

"In today's world the 'Open House' is on the internet, which is why we spend significant time writing your home's description to appeal to the right buyers, supported with professional photos. It is not very often we sell a home because of an Open House. Most buyers with serious interest are not out on a Sunday afternoon touring open houses. Serious buyers will make a private showing request so they can view the home individually. That said, if you're sold on Open Houses, we have agents on staff who will hold them for you."

### Showings

Use this copy verbatim:

"We use the latest technology to schedule your showings. If the home is occupied, we only schedule showings with your permission. If your property is vacant, you'll receive notices of showings. Either way, we use an app called ShowingTime, which over 90% of agents in the area use to schedule showings. Everything is handled right on your phone through text messaging, 7 days a week from 8am to 8pm."

### Print & Direct Mail

## Your Timeline
TIMELINE RULES:
- If Form Inputs says "Target On-Market Date: (omitted - invalid or past)" you MUST NOT invent or print a specific calendar date anywhere in this section. Use relative weeks only ("Week 0: Preparation", "Week 1: Launch", "Week 2-4: Active marketing", etc.) so the seller sees the sequence, not a bogus date.
- If a valid target date IS provided, anchor Week 1 to that date and reference it plainly.

## Questions Buyers May Ask

## Preparing Your Home

## What You Save with Sell for 1 Percent

Calculate the seller's savings using the List Price from Form Inputs.
- Formula: savings = 0.02 × list_price (2% of the asking price, described as a MINIMUM).
- Frame it against a traditional full-service listing that typically costs about 6% total (split between the two sides), so our 1% listing fee saves roughly 2% to 3% on the listing side alone.
- State the dollar figure explicitly, e.g., "On your asking price of $X, that's a minimum of $Y back in your pocket at closing."
- Emphasize: you get everything a full-service agent charging a whole lot more would provide, so why give away your home's equity?
- If List Price is "not specified", DO NOT print a bracketed placeholder. Instead write "roughly 2% of your asking price" and note the exact figure will be confirmed once pricing is set.

## Staying in Touch

## Your Agent

Build the agent contact line from ONLY the values in the "Agent" block of Form Inputs.
- Start with "{agent name}, Sell for 1 Percent"
- If a phone is provided, append " - {phone}"
- If an email is provided, append ", {email}"
- If neither phone nor email is provided, print just "{agent name}, Sell for 1 Percent"
- NEVER print a bare label like "Email:" or a trailing comma with no value. NEVER invent contact info. NEVER print a placeholder like "[email]" or "TBD".`;

function isValidFutureDate(s: string | null | undefined): boolean {
  if (!s) return false;
  // Expect YYYY-MM-DD from the form input.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return false;
  const d = new Date(`${s}T12:00:00Z`);
  if (isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() >= today.getTime();
}

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
      db
        .from("profiles")
        // Do NOT read profile.email here — that's the auth email and must never
        // be used as an agent contact fallback. Only preferred_email is valid.
        .select("full_name, first_name, last_name, cell_phone, preferred_email")
        .eq("id", job.user_id)
        .single(),
      db.from("marketing_plan_results").select("stage, content").eq("job_id", jobId),
    ]);

    const byStage: Record<string, string> = {};
    (results || []).forEach((r) => { byStage[r.stage] = r.content; });

    const agentName =
      profile?.full_name ||
      `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() ||
      "Your Sell for 1 Percent Agent";
    const agentEmail = (profile?.preferred_email || "").trim();
    const agentPhone = (profile?.cell_phone || "").trim();

    const addressFull =
      `${lead?.address || ""}, ${lead?.city || ""} ${lead?.state || ""} ${lead?.zip || ""}`
        .trim();

    // Target-date handling: pass the raw value ONLY if it's a valid, non-past date.
    // Otherwise pass a machine-readable "omitted" marker the prompt knows how to handle,
    // AND record the invalid input so the internal verification can call it out.
    const rawTarget = job.target_on_market_date ?? null;
    const dateValid = isValidFutureDate(rawTarget);
    const targetDateLine = dateValid
      ? String(rawTarget)
      : "(omitted - invalid or past)";
    const invalidDateNote = rawTarget && !dateValid
      ? `The agent originally entered: ${rawTarget} (rejected as past or invalid — do not print this value anywhere)`
      : "";

    const missingEmail = agentEmail === "";
    const missingPhone = agentPhone === "";

    const userMsg = `# Seller Lead
- Name: ${lead?.first_name || ""} ${lead?.last_name || ""}
- Address: ${addressFull}
- Beds/Baths (lead record): ${lead?.bedrooms || "?"} / ${lead?.bathrooms || "?"}
- Square feet (lead record): ${lead?.square_feet || "?"}
- Year built (lead record): ${lead?.year_built || "?"}

# Form Inputs
- List Price: ${job.list_price ?? "not specified"}
- Target On-Market Date: ${targetDateLine}
${invalidDateNote ? `- Target Date Note: ${invalidDateNote}\n` : ""}- Anything Unusual: ${job.unusual_notes || "(none)"}

# MLS Data (agent-pasted, HIGHEST PRECEDENCE for sqft, year built, beds/baths, taxes)
${job.mls_paste || "(none pasted)"}

# Agent (source: profiles table only — never use auth email)
- Name: ${agentName}
- Phone: ${agentPhone || "(missing)"}
- Email: ${agentEmail || "(missing)"}
${missingEmail ? "- WARNING: agent business email missing — omit the email from the contact line entirely.\n" : ""}${missingPhone ? "- WARNING: agent cell phone missing — omit the phone from the contact line entirely.\n" : ""}
# Stage 1 — Property Data
${byStage.property_data || "(not available)"}

# Stage 2 — Walkthrough Photo Review
${byStage.photo_review || "(not available)"}

# Stage 3 — Document Facts
${byStage.document_facts || "(not available)"}

# Stage 4 — Area Research
${byStage.area_research || "(not available)"}

Now produce the two sections in the required order: begin with "---VERIFICATION---" on its own line, then the internal audit, then "---PLAN---" on its own line, then the seller-facing marketing plan. Substitute {address}, {agent name}, {phone}, {email} with the real values above. Do not print any bracketed placeholder in the seller-facing document.`;

    await streamClaudeToStorage(
      {
        model: OPUS_MODEL,
        system: SYSTEM_PROMPT,
        max_tokens: 24000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        messages: [{ role: "user", content: userMsg }],
      },
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
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace("Bearer ", "").trim();
    const { jobId, userId: bodyUserId } = await req.json();
    if (!jobId) throw new Error("jobId required");

    let userId = bodyUserId;
    if (!userId) {
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
