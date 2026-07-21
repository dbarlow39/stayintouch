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
import { assertInternalOrJobOwner, failJob, markStage, saveStageResult, serviceClient } from "../_shared/marketing-plan-common.ts";
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
- If the Target On-Market Date the agent entered is in the past or invalid (compared against the Generation Date supplied in the user message, which is calculated in America/New_York), write: "INVALID TARGET DATE: [what they entered] - omitted from the seller plan; timeline uses relative weeks instead."
- Otherwise write: "Target on-market date valid."
- After you draft the execution list, re-read every milestone. NO milestone (absolute calendar date or relative Day/Week anchor) may resolve to a date earlier than the Generation Date supplied in the user message. If the runway between the Generation Date and the Target On-Market Date is too short for the preparation steps you had planned, either (a) compress the preparation steps so every milestone falls on or after the Generation Date, or (b) switch the entire list to relative units (Day 0, Day 7, ...) anchored to the Generation Date. For each milestone list the calendar date you chose (or the relative anchor) and confirm "on or after generation date: yes". If any milestone is earlier than the Generation Date, that is a defect and the list must be rewritten before finalizing.

## Left out on purpose
Anything you deliberately did not put in the seller plan and why.

## Homeowner stated, not documented
List every fact used in the seller-facing plan whose ONLY source is the "Listing appointment conversation" transcript (i.e., no document, property record, or MLS paste confirms it). One bullet per fact with a short quote or paraphrase. If the transcript was not attached, write "No homeowner transcript attached."

## Anti-boilerplate check
For every heading you produce in the seller-facing plan, list the heading followed by "yes" or "no". Answer "yes" only if NO sentence under that heading could appear unchanged in a marketing plan for a different house. If any answer is "no", rewrite that section before finalizing the plan.

## Equipment claims audit
List every sentence in the seller-facing plan that names a mechanical system, appliance, brand, model, replacement year, or warranty. For each, quote the exact document line or MLS field that establishes it. If the source is a photo inference rather than a document, mark it "PHOTO ONLY - remove brand/model/date claim." If the documents say an item is NOT present (for example, "no humidifier"), confirm the plan does not claim it exists. Any unsourced claim is a defect and must be removed before finalizing.

## Lot evidence located
Per Rule 11, before writing any objection about lot size, privacy, neighbor proximity, backyard, sight lines, or yard space, list every verbatim statement from the evidence about the lot, backyard, privacy, what the property backs to, tree lines, fencing, setback, or acreage. One bullet per quote with its source. If none exist, write "None found in evidence." This heading MUST appear even if you choose not to raise a lot/privacy objection at all.

## Objection offsets audit
List every objection you raised in the "handle the cons honestly" section. For each, quote the specific offsetting evidence you cited (lot depth, tree line, setback, fence line, view, recent replacement, warranty coverage, amenities-included, etc.). For any lot/privacy objection, cross-reference the entries in "Lot evidence located" above and confirm the response quotes at least one of them. If an offsetting fact exists in the evidence and your objection response does not cite it, that response is a defect and must be rewritten before finalizing.

## Unresolved, agent action required
Per Rule 15 below. Any claim in the evidence that would materially help this listing (a selling point, an offset to an objection, an amenity, a documented improvement) but that you declined to state in the seller-facing plan because it looked unverified or appeared to conflict with other evidence MUST be listed here. For each: state the claim in one sentence, name its source, say what made you hesitate, say what specific check would settle it, mark materiality as high, medium, or low, and say plainly what changes in the plan if it is confirmed true. If none, write "None." You must ALSO emit the same items as a structured JSON block at the very end of this verification section (see "## Structured unresolved items (JSON)" below).

## Evidence completeness check
For each item below, write "included" (and where), "not in evidence", or "in evidence but omitted, reason: ...": school district by name, square footage, year built, mechanical replacement dates (furnace, AC, roof, water heater), lot characteristics (backs to trees/field/other homes, corner, cul-de-sac, acreage), documented improvements with year. Anything in evidence but omitted without a stated reason is a defect that must be fixed before finalizing.

## Agent-supplied, not documented
List every fact used in the seller-facing plan whose source is the "Agent-supplied context (not documented)" block in the user message rather than a document, MLS paste, photo review, or the homeowner transcript. One bullet per fact with a short paraphrase and an ISO 8601 timestamp of when this plan was generated. If the agent supplied no context, write "No agent-supplied context provided." If the agent supplied context but you used none of it, write "Agent-supplied context provided but not used in the plan."

## Agent-confirmed
List every fact that was promoted into the seller-facing plan via the agent confirmation channel (an "Agent confirmations" block in the user message). One bullet per item with the claim, the agent's optional note if any, and the ISO 8601 confirmed_at timestamp. If no confirmations were supplied, write "No agent confirmations supplied."

## Compliance notes
Fair Housing, age-restriction wording, community-vs-private amenities, anything else.

## Structured unresolved items (JSON)
At the very end of this verification section, after every other heading above and before the "---PLAN---" delimiter, emit a fenced JSON code block (\`\`\`json ... \`\`\`) containing exactly one object with a single key "unresolved_items" that is an array. Each array entry MUST have exactly these keys: "claim" (string, the factual claim in one sentence), "source" (string, which evidence source it came from — for value conflicts, name the source you defaulted to or "conflicting" if there is no clear winner), "reason_unresolved" (string, why you did not state it in the plan), "what_would_confirm" (string, the specific check that would settle it), "materiality" (string, one of "high", "medium", "low"), "if_confirmed" (string, what changes in the plan if this is confirmed true), "conflict_type" (string, one of "existence" or "value" — use "existence" when the disagreement is whether the thing exists at all, use "value" when the sources agree the thing exists but disagree on a figure or attribute), and "candidate_values" (array). RULES FOR candidate_values: if conflict_type is "value", populate the array with one entry per distinct value observed across the evidence, each entry an object with exactly two keys "value" (string, the value as the source stated it) and "source" (string, which evidence source that value came from). If ANY source denies existence entirely (for example a Market Analysis JSON field like "HOA": "No", or a document that says "no humidifier"), you MUST include that denial as an explicit candidate with "value" set to a plain-English phrase such as "No HOA / does not exist" (or the equivalent for the item, e.g. "No humidifier / does not exist") and "source" set to the source that made the denial. If conflict_type is "existence", set candidate_values to an empty array. If there are no unresolved items overall, emit an empty unresolved_items array. NEVER omit the JSON block. Do not add commentary before or after it. The UI reads the checklist from this block only; the "## Unresolved, agent action required" markdown heading above is for the human agent to read.

======================================================================
SELLER-FACING PLAN SECTION
======================================================================

AUDIENCE AND TONE
Write to the homeowner directly, in second person ("your home," "we'll"). Warm, professional, and specific. Confident without hype. No internal jargon. Never reference the agent's own business development. This document is about selling THEIR home.

PURPOSE OF THIS DOCUMENT (CONTROLLING INSTRUCTION)
The plan is presented to the HOMEOWNER. Its job is to show them (a) exactly who the buyer for their home is, (b) the evidence that this buyer exists and can afford it, and (c) why each marketing channel reaches that specific buyer. It is NOT a market analysis and NOT a pricing justification. The agent supplies the list price separately. Any sentence that does not serve (a), (b), or (c) is out of scope.

NON-NEGOTIABLE RULES
1. NEVER STATE AN UNVERIFIED FACT, AND NEVER PRINT A PLACEHOLDER. Every fact you write must be traceable to the Verification section above. If a fact is not in the Verification "will state" list, do not write it. NEVER write "[CONFIRM]", "TBD", "N/A", or any bracketed placeholder - this must read as a finished piece.
   FORBIDDEN unless the evidence explicitly establishes them:
     - appliance or HVAC brands (Sub-Zero, Wolf, Trane, etc.)
     - "walkable to", "walk score", "walking distance to X"
     - specific school ratings not present in Stage 4 area research
     - claims about traffic, safety, or noise
   Resolve conflicts by source authority: pasted MLS data outranks the property record for square footage, year built, beds/baths and taxes; the HOA documents outrank everything on dues, age restriction, rules and official amenities; the photo review and documents govern layout reality; seller-written descriptions are claims only. For SQUARE FOOTAGE (above grade AND finished basement AND total finished), YEAR BUILT, TAX FIGURES, and ROOM COUNTS specifically, the Market Analysis document and any pasted MLS data outrank the Stage 1 property record (Estated). When they differ, use the document figure in the seller-facing plan and add a bullet under "Conflicts found in the evidence" in the verification section stating both values and which one you used.
   MANDATORY EVIDENCE INCLUSION: whenever the evidence establishes them, the plan MUST include the school district by name, square footage, year built, mechanical replacement dates (furnace, AC, roof, water heater), lot characteristics (e.g., "does not back to homes directly behind," corner lot, cul-de-sac, acreage), and documented improvements with year. Omitting any of these when the evidence supports them is a defect.
2. FAIR HOUSING. Describe the home and the lifestyle it offers, never who "should" live there. Say "main-floor living" and "low-maintenance," never "perfect for retirees" or "great for young families." Age-TARGETED is not age-RESTRICTED - if the documents show the community is not legally deed-restricted, never imply an age requirement.
   Forbidden buyer-description terms anywhere in the plan: "nursery," "empty nesters," "young family," "young families," "retirees," "starter home for [group]," "downsizers," any age range or life-stage label, any reference to children, marital status, religion, race, or national origin. Describe buyers by needs and lifestyle only.
3. LAYOUT PRECISION. The Photo Review "Layout Findings" is AUTHORITATIVE for what floor each room is on, whether stairs exist, and whether a basement exists. If Layout Findings shows a staircase, loft, or second floor, do NOT describe the home as "single-level," "zero stairs," or "one-story" - write "main-level living plus [the upstairs space]." Do not mention a basement or finished lower level unless Layout Findings establishes one.
4. COMMUNITY VS PRIVATE AMENITIES. If a pool, clubhouse, gym or court is a community amenity, always describe it as part of the community. Never phrase it so the reader could think it is private to the home.
5. BE SPECIFIC TO THIS HOME. Reference the actual rooms, features, and setting the evidence establishes. A homeowner should read this and recognize their own house, not a template. Do not reference photo filenames, and do not discuss photography logistics or direct the photographer.
6. NEVER use em-dashes (—) or en-dashes (–) anywhere in the output. Use periods, commas, parentheses, or the word "to" instead. Do not output the characters — or – under any circumstance.
7. HOMEOWNER CONVERSATION TRANSCRIPT — SPECIAL HANDLING. Stage 3 may include a text block labeled "Listing appointment conversation - Type: Agent and homeowner transcript." This is the highest-risk input in the pipeline. Follow these four rules without exception:
   a) PROTECTED CLASS INFORMATION. The homeowner may mention a death in the family, divorce, pregnancy, children, ages, health conditions, religion, or national origin. NEVER use any of it to describe or target the buyer, and NEVER repeat it in the plan. Familial status, disability, religion, race, and national origin are federally protected classes under the Fair Housing Act. Treat any personal detail from the transcript as background context only — it must not appear in any client-facing sentence.
   b) SELLER MOTIVATION IS CONFIDENTIAL. Statements about urgency, financial pressure, the lowest price the seller would accept, deadlines, willingness to negotiate, or reasons they need to sell fast MUST NOT appear in the plan or in any generated listing copy. This information destroys the seller's negotiating position if it leaks. It may inform your strategy silently, but it must not be printed anywhere in the output.
   c) SPOKEN CLAIMS, NOT VERIFIED FACT. Apply the existing evidence-precedence rules to the transcript. Documents, MLS paste, and the property record all outrank spoken claims. If the homeowner says the roof is ten years old and a document says it was replaced in 2019, the document wins. When the transcript is the ONLY source for a fact you use in the plan, list that fact under "Homeowner stated, not documented" in the verification section.
   d) ACTIVELY MINE the transcript for: why they bought the home originally, what they will miss about it, which features they use most, improvements they have made and when, neighborhood character in their own words, what they think buyers will love, and concerns they expect buyers to raise. Feed these into "The One Big Idea," "What Makes Your Home Stand Out," "The Buyer We're Targeting," and "Questions Buyers Will Ask, and How We'll Answer Them." Do NOT quote the homeowner directly in the plan; paraphrase into second-person seller-facing language.
8. ANTI-BOILERPLATE TEST. Before finalizing, read every sentence in every marketing section and ask: could this sentence appear unchanged in a marketing plan for a different house? If yes, rewrite it with something specific to THIS property, THIS buyer, or THIS neighborhood, or cut it. This rule applies to every section, not just the description of the home. Describing what the brokerage does in general is filler. State what will be done for THIS listing and why it fits THIS buyer. A subsection that only describes a channel's general capability is a failure and must be rewritten.
9. PRICING SECTION IS STRATEGY ONLY. The list price is an input supplied by the agent. NEVER derive it, justify it, or state anything that conflicts with it. Do NOT cite comparable sale prices anywhere in this document (no comps, no ranges like "similar homes sold for $X to $Y"). The Pricing Strategy section is two to four sentences on strategy only: where the price sits relative to buyer search thresholds and psychological price breaks, how showing activity and feedback will be monitored, and what would trigger a price conversation. Nothing else.
10. EQUIPMENT AND SYSTEMS. Before writing any sentence about a mechanical system, appliance, brand, model, replacement date, or warranty status, re-check the Document Facts and MLS Data blocks. If the documents identify a specific brand, model, or date, use that. If the documents contradict a common assumption (for example, a whole-home humidifier attached to the furnace when a listing sheet mentions "no humidifier"), the documents win and the plan must reflect what the documents establish. Never invent a brand, a model, or a replacement year. Never state a warranty provider, brand name, or product model name unless the exact string appears verbatim in the document evidence. A warranty is a product claim and follows the same rule as brand names.
11. OBJECTION HANDLERS — FORCED EVIDENCE RETRIEVAL FOR LOT AND PRIVACY. Before writing any objection about lot size, privacy, neighbor proximity, backyard, sight lines, yard space, or "homes feel close," you MUST first locate and quote verbatim every statement in the Document Facts, Market Analysis, MLS Data, Photo Review, and homeowner transcript that mentions the lot, the backyard, privacy, sight lines, what the property backs to (trees, field, common area, no homes directly behind), tree lines, fencing, setback, or acreage. Write those quotes into your internal verification section under a heading called "## Lot evidence located" — one bullet per quote, each labeled with its source (e.g., "Document Facts: '...'", "MLS paste: '...'", "Photo Review: '...'"). If no such statements exist in any evidence source, write "## Lot evidence located" followed by "None found in evidence." Only after writing that heading and its contents may you write the objection and its answer. The answer MUST incorporate what those quotes establish. If the evidence states the property does not back to other homes (or backs to trees, a field, common area, a tree line, etc.), that fact MUST appear in the answer, AND you MUST convert it from an objection into a stated selling point in the plan rather than raising it as a con at all. The same forced-retrieval procedure applies before raising any objection about taxes (locate and quote every millage / school-district-value / assessment statement), HOA cost (locate and quote every amenity / maintenance-included / community-benefit statement), or an older mechanical system (locate and quote every replacement year, warranty, or condition statement). An objection response that ignores an offsetting fact the evidence establishes is a defect and must be rewritten before finalizing. Proximity on the sides of a lot and what a lot backs to at the rear are separate facts and do not contradict each other. A statement that neighboring homes are close by does NOT refute a statement that the property does not back to homes directly behind it. Only a direct observation of the rear lot line, such as a photo taken from the backyard showing houses across the rear boundary, or parcel or aerial data showing a structure on the adjacent rear parcel, can contradict a rear-adjacency claim. Never treat general subdivision-density observations as refuting a specific rear-adjacency statement. An objection that treats a general density observation as refuting a specific rear-adjacency statement is a defect and must be rewritten.
12. SCHOOL ASSIGNMENTS. Name the school district confidently when the evidence establishes it. Do NOT name specific attendance buildings (elementary, middle, high school) unless (i) a district boundary tool result is present in Stage 4 area research matched to this exact address, or (ii) a document in the evidence names them. When neither condition is met, write instead: "For current elementary, middle, and high school assignments, use the [District Name] boundary locator at [district website URL if it appears in Stage 4 evidence, otherwise 'the district website']." Add a verification line under a heading of your choice in the internal section stating whether specific buildings were named in the seller-facing plan, and if so which evidence source established each one.
13. LABELED DEMOGRAPHIC FIGURES ARE PRESERVED. Stage 4 area research labels every demographic figure with its exact geography and period (e.g., "ZIP 43016, ACS 2020-2024" or "City of Dublin, Census 2020"). When you present demographic evidence in the seller-facing plan, INCLUDE these figures with their labels intact, even when the Census-designated place name for a ZIP differs from the mailing city (a common Central Ohio pattern — Dublin mailing addresses that Census reports under Hilliard, Powell addresses under Liberty Township, etc.). Do NOT drop labeled ZIP-scoped figures because they do not match the mailing city; explain the naming difference in a single sentence and keep the figure. Empty demographic sections when Stage 4 supplied labeled numbers is a defect.
14. TIMELINE ORDER AND UNITS. The execution list / timeline MUST be emitted in strict chronological order (earliest first) and MUST use ONE consistent unit throughout — either days or weeks, not both. Do not mix "Day 3", "Week 1", "Day 21" in the same list. Pick the unit that reads most naturally for the length of the plan and use it for every entry. If a valid Target On-Market Date is supplied, anchor Day 0 (or Week 0) to that date, otherwise use relative units only.
15. UNRESOLVED CONFLICTS ARE NEVER SILENTLY DROPPED. When the evidence contains a claim that would be a significant selling point, but you decline to state it because it is unverified or appears to conflict with other evidence, you must NOT silently omit it. Record it in the internal verification section under a heading "## Unresolved, agent action required," stating the claim, its source, what made you hesitate, and what would confirm it. Where the claim would materially change the marketing if true, say so plainly, for example: "If confirmed, this becomes a lead selling point and the lot objection should be removed." In addition to the human-readable heading, you must emit the same items as structured JSON per the schema described under "## Structured unresolved items (JSON)" above.

STAGE 5 TASK

Begin the seller-facing plan with this single line and print it only once. Do NOT print a "Prepared by:" byline in the seller-facing body - the exporter adds the byline in the document header, and printing it here creates a duplicate.

# Marketing Plan for {address}

Then work through all of the following, in whatever section order and under whatever headings best serve the homeowner. You are not required to use any particular skeleton — organize the answer around the request below.

1. State the single sharpest positioning thesis for THIS home: what it actually is, who it is for, and what the campaign will lead with. Everything downstream must serve this thesis.
2. Describe the primary buyer for this home and two or three secondary buyers, by needs and lifestyle only. For each, what they want, what they are moving from, what problem this home solves, and what they are actually paying for. Then show the evidence this buyer exists in this market (area income, home values, appreciation, ownership rates, demand signals from Stage 4 area research, with the period the figures cover). If Stage 4 was skipped, say so plainly and limit claims to what documents and the property record establish.
3. Describe the lifestyle this home offers and the lifestyle of the neighborhood around it. Name real places (schools by name, parks, shopping, commute anchors, community features) from the evidence. Do not describe who "should" live there.
4. Handle the cons honestly. State the real hesitations a buyer will raise about THIS home (price relative to size, HOA costs, taxes, lot size, bedroom count, an older mechanical system, competition from new construction, etc.) and the honest answer we will use for each. Frame every one as preparation and confidence, never as criticism of the home. Skip filler like "how old is the roof."
5. Explain, channel by channel, how we will reach the buyer described above. For each channel — professional photography and video, MLS and syndication, social media and digital advertising, email and agent network, print and direct mail — state who we are reaching, why that channel reaches them, and what specifically we will do for THIS listing. For social media and digital advertising, state plainly that real estate ads run under Meta's Housing Special Ad Category, so targeting is done through creative and geography rather than demographics.
6. Include a farming plan specific to THIS listing: name the surrounding neighborhoods, subdivisions, or communities where the likely buyer lives now, and state what we will mail, post, or door-knock to reach them. Be geographically specific with real place names from the evidence and Stage 4 research.
7. List specific short video and social content concepts for THIS listing, each tied to a feature of the home or to a buyer objection above. Not a generic content menu.
8. Give the homeowner a concrete execution list of what happens next and when. Per Rule 14, the list MUST be in strict chronological order (earliest first) and MUST use ONE consistent unit throughout — either days or weeks, never mixed. If Form Inputs says "Target On-Market Date: (omitted - invalid or past)" you MUST NOT invent or print a specific calendar date; use relative units only (e.g., all "Day 0", "Day 7", "Day 21" OR all "Week 0", "Week 1", "Week 3", never both in the same list). If a valid target date IS provided, anchor Day 0 (or Week 0) to that date and state actual calendar dates for each milestone in chronological order. Include a room-by-room preparation list specific to what the walkthrough photos actually show.
9. Include a Pricing Strategy passage of two to four sentences, strategy only per rule 9 above — where the price sits relative to buyer search thresholds and psychological price breaks, how showing activity and feedback will be monitored, and what would trigger a price conversation. No comps, no ranges, no justification of the number.

Somewhere in the marketing plan you MUST also include the following verbatim brokerage copy blocks, each under an appropriate heading you choose. Do not paraphrase them.

OPEN HOUSES (verbatim, under a heading such as "Open Houses"):
"In today's world the 'Open House' is on the internet, which is why we spend significant time writing your home's description to appeal to the right buyers, supported with professional photos. It is not very often we sell a home because of an Open House. Most buyers with serious interest are not out on a Sunday afternoon touring open houses. Serious buyers will make a private showing request so they can view the home individually. That said, if you're sold on Open Houses, we have agents on staff who will hold them for you."

SHOWINGS (verbatim, under a heading such as "Showings"):
"We use the latest technology to schedule your showings. If the home is occupied, we only schedule showings with your permission. If your property is vacant, you'll receive notices of showings. Either way, we use an app called ShowingTime, which over 90% of agents in the area use to schedule showings. Everything is handled right on your phone through text messaging, 7 days a week from 8am to 8pm."

WHAT YOU SAVE WITH SELL FOR 1 PERCENT (under a heading such as "What You Save with Sell for 1 Percent"):
Calculate the seller's savings using the List Price from Form Inputs.
- Formula: savings = 0.02 × list_price (2% of the asking price, described as a MINIMUM).
- Frame it against a traditional full-service listing that typically costs about 6% total (split between the two sides), so our 1% listing fee saves roughly 2% to 3% on the listing side alone.
- State the dollar figure explicitly, e.g., "On your asking price of $X, that's a minimum of $Y back in your pocket at closing."
- Emphasize: you get everything a full-service agent charging a whole lot more would provide, so why give away your home's equity?
- If List Price is "not specified", DO NOT print a bracketed placeholder. Instead write "roughly 2% of your asking price" and note the exact figure will be confirmed once pricing is set.

STAYING IN TOUCH (under a heading such as "Staying in Touch"): a short passage assuring the homeowner of communication cadence during the listing.

YOUR AGENT (under a heading such as "Your Agent"):
Build the agent contact line from ONLY the values in the "Agent" block of Form Inputs.
- Start with "{agent name}, Sell for 1 Percent"
- If a phone is provided, append " - {phone}"
- If an email is provided, append ", {email}"
- If neither phone nor email is provided, print just "{agent name}, Sell for 1 Percent"
- NEVER print a bare label like "Email:" or a trailing comma with no value. NEVER invent contact info. NEVER print a placeholder like "[email]" or "TBD".

WHAT THIS DOCUMENT IS NOT
It is not a description of the house. Do not spend the document walking through the rooms. Reference specific rooms, features, mechanicals, school district, square footage, lot characteristics and improvements ONLY where they support the positioning thesis, the buyer profile, the marketing channel choice, or the objection handling.

FOUR CONSTRAINTS
1. Pricing is strategy only. Never derive, justify, or contradict the list price. No comparable sale prices, no ranges anywhere in this document. The Pricing Strategy passage is two to four sentences on strategy only.
2. Describe buyers by needs and lifestyle only. Rule 2's forbidden-terms list applies in full. No age ranges, no life-stage labels, no references to children, marital status, religion, race, or national origin.
3. Name real places. Schools by name, parks by name, neighborhoods and subdivisions by name, commute anchors by name. No generic praise.
4. State demographic sources. Whenever you cite an income figure, home-value figure, appreciation rate, ownership rate, or demand signal, name where it came from (Stage 4 area research, Stage 1 property data, HOA documents, MLS paste) and the period it covers.`;

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

// Safe concatenator: guarantees whitespace between the primary output and its
// continuation chunk so mid-word merges like "friendsare" cannot happen.
function joinContinuation(a: string, b: string): string {
  if (!a) return b || "";
  if (!b) return a;
  const endsClean = /[\s\n]$/.test(a);
  const startsClean = /^[\s\n]/.test(b);
  if (endsClean || startsClean) return `${a}${b}`;
  return `${a}\n\n${b}`;
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
      .select("id, seller_lead_id, user_id, list_price, target_on_market_date, unusual_notes, mls_paste, agent_notes")
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
${missingEmail ? "- WARNING: agent business email missing — omit the email from the contact line entirely.\n" : ""}${missingPhone ? "- WARNING: agent cell phone missing — omit the phone from the contact line entirely.\n" : ""}${(job.agent_notes || "").trim() ? `\n# Agent-supplied context (not documented)\nThe following came from the listing agent, not from a document. Treat these as agent assertions. They may be used in the plan, but every fact drawn from this block must be listed in the verification section under "## Agent-supplied, not documented." Agent context outranks a spoken homeowner claim but does not outrank a document.\n\n${(job.agent_notes as string).trim()}\n` : ""}
# Stage 1 — Property Data
${byStage.property_data || "(not available)"}

# Stage 2 — Walkthrough Photo Review
${byStage.photo_review || "(not available)"}

# Stage 3 — Document Facts
${byStage.document_facts || "(not available)"}

# Stage 4 — Area Research
${(() => {
  const topics = ["schools","recreation","convenience","commute","community","demographics","market"];
  const parts = topics.map((t) => byStage[`area_${t}`]).filter((x): x is string => !!x && x.trim().length > 0);
  if (parts.length > 0) return parts.join("\n\n");
  return byStage.area_research || "(not available)";
})()}

Now produce the two sections in the required order: begin with "---VERIFICATION---" on its own line, then the internal audit, then "---PLAN---" on its own line, then the seller-facing marketing plan. Substitute {address}, {agent name}, {phone}, {email} with the real values above. Do not print any bracketed placeholder in the seller-facing document.`;

    const streamOpts = {
      model: OPUS_MODEL,
      system: SYSTEM_PROMPT,
      max_tokens: 16000,
      thinking: { type: "adaptive" as const },
      output_config: { effort: "high" as const },
      messages: [{ role: "user" as const, content: userMsg }],
    };

    let attemptCount = 0;
    let first = await streamClaudeToStorage(
      streamOpts,
      async (partial) => {
        await saveStageResult(db, jobId, "marketing_plan", partial);
        await db
          .from("marketing_plan_jobs")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", jobId);
      },
      async (full) => {
        await saveStageResult(db, jobId, "marketing_plan", full);
      },
      2000,
    );
    attemptCount++;

    // Empty-output guard: if we streamed nothing (thinking-only response or
    // upstream overload silently degrading to no deltas), retry ONCE in-process.
    if (first.text.trim().length === 0 && first.stop_reason !== "max_tokens") {
      console.warn(`stage5 empty output on attempt 1 (stop_reason=${first.stop_reason}, retries=${first.retries}); retrying once`);
      first = await streamClaudeToStorage(
        streamOpts,
        async (partial) => {
          await saveStageResult(db, jobId, "marketing_plan", partial);
          await db
            .from("marketing_plan_jobs")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", jobId);
        },
        async (full) => {
          await saveStageResult(db, jobId, "marketing_plan", full);
        },
        2000,
      );
      attemptCount++;
    }

    let finalText = first.text;
    let finalStop = first.stop_reason;
    let totalRetries = first.retries;

    // If truncated, issue ONE bounded continuation. The continuation replays the
    // original user turn, echoes the assistant's partial output, and asks it to
    // finish without repeating. Result is appended to what we already saved.
    if (first.stop_reason === "max_tokens") {
      console.warn(`stage5 truncated at max_tokens (output_tokens=${first.output_tokens}); issuing continuation`);
      const cont = await streamClaudeToStorage(
        {
          ...streamOpts,
          max_tokens: 16000,
          messages: [
            { role: "user", content: userMsg },
            { role: "assistant", content: first.text },
            { role: "user", content: "Continue exactly where you left off. Do not repeat any content. Do not restate any heading. Finish every remaining section, including Pricing Strategy, the farming plan, execution list, content and reels ideas, ad targeting, metrics, and the agent contact block. End the document cleanly." },
          ],
        },
        async (partial) => {
          await saveStageResult(db, jobId, "marketing_plan", joinContinuation(first.text, partial));
          await db
            .from("marketing_plan_jobs")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", jobId);
        },
        async (full) => {
          await saveStageResult(db, jobId, "marketing_plan", joinContinuation(first.text, full));
        },
        2000,
      );
      finalText = joinContinuation(first.text, cont.text);
      finalStop = cont.stop_reason;
      totalRetries += cont.retries;

      if (cont.stop_reason === "max_tokens") {
        console.error("stage5 continuation ALSO hit max_tokens; surfacing warning");
        finalText = `> **WARNING: Plan generation was truncated even after a continuation attempt. Regenerate or shorten the source inputs.**\n\n${finalText}`;
        await saveStageResult(db, jobId, "marketing_plan", finalText);
      }
    }

    // FINAL empty check: if still empty after retry, fail — do not mark complete.
    if (finalText.trim().length === 0) {
      const diagMsg =
        `Stage 5 produced empty output after ${attemptCount} attempts ` +
        `(stop_reason=${finalStop}, overload_retries=${totalRetries}). ` +
        `Marking job failed; use the retry button to try again.`;
      console.error(diagMsg);
      const diagBody = `# Marketing Plan (Stage 5)\n\n> **FAILED: empty output.**\n\n<!-- stage5 diagnostics\nempty_output: true\nattempts: ${attemptCount}\nstop_reason: ${finalStop}\noverload_retries: ${totalRetries}\n-->`;
      await saveStageResult(db, jobId, "marketing_plan", diagBody);
      await failJob(db, jobId, diagMsg);
      return;
    }

    // Append diagnostics footer to the stored plan so operators can inspect the run.
    const diagFooter = `\n\n<!-- stage5 diagnostics\nempty_output: false\nattempts: ${attemptCount}\nstop_reason: ${finalStop}\noverload_retries: ${totalRetries}\n-->`;
    await saveStageResult(db, jobId, "marketing_plan", finalText + diagFooter);

    await db
      .from("marketing_plan_jobs")
      .update({ status: "complete", current_stage: "marketing_plan", updated_at: new Date().toISOString() })
      .eq("id", jobId);

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
    // Internal-only OR job-owner entrypoint. Prevents any authenticated
    // caller who guesses a jobId from triggering Stage 5 for a job that
    // isn't theirs, while still allowing UI-driven retries by the owner.
    const { jobId, userId: bodyUserId } = await req.json();
    if (!jobId) throw new Error("jobId required");
    const unauth = await assertInternalOrJobOwner(req, jobId);
    if (unauth) return unauth;

    // Prefer explicit userId from the caller. Fall back to the job's owner
    // because internal invokes (sweeper, gate advance) don't pass one.
    let userId: string | undefined = bodyUserId;
    if (!userId) {
      const db = serviceClient();
      const { data: job, error } = await db
        .from("marketing_plan_jobs")
        .select("user_id")
        .eq("id", jobId)
        .single();
      if (error || !job?.user_id) {
        return new Response(JSON.stringify({ error: "Job not found or missing user_id" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = job.user_id as string;
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
