// Stage 4 WORKER. Invoked once per topic by the dispatcher. Runs one focused
// Claude turn against web_search / web_fetch, writes exactly one result row
// on every code path, atomically increments the completion counter, and if
// it's the last worker advances the job to Stage 5.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  assertInternalCaller,
  incrementAreaCompleted,
  saveStageResult,
  serviceClient,
} from "../_shared/marketing-plan-common.ts";
import {
  callClaude,
  corsHeaders,
  OPUS_MODEL,
} from "../_shared/marketing-plan-claude.ts";

type Topic =
  | "schools"
  | "recreation"
  | "convenience"
  | "commute"
  | "community"
  | "demographics"
  | "market";

const TOPIC_TITLES: Record<Topic, string> = {
  schools: "Schools",
  recreation: "Recreation & Outdoors",
  convenience: "Everyday Convenience",
  commute: "Commute & Access",
  community: "The Community",
  demographics: "Demographics",
  market: "Market Context",
};

const SHARED_PREAMBLE = `You are researching ONE topic about a specific property for a marketing plan. Cite a source for every factual claim.

SOURCE QUALITY. Prefer authoritative primary sources over aggregators. For schools, the district's own site and the state report card. For taxes and parcel data, the county auditor. For population and income, Census or ACS. For market data, the local MLS or board of Realtors. Use Zillow, Niche, and similar sites only when a primary source is unavailable, and say when you have done so.

BE SPECIFIC OR SAY NOTHING. Name real places, real schools, real roads, and real distances. "Close to parks and shopping" is worthless. "Ballantrae Park is about a mile north, and the Tuttle Crossing corridor is roughly ten minutes east via I-270" is what we need. If you cannot establish a specific fact, say so plainly instead of writing filler.

DATE EVERY FIGURE. Give the year or period each number covers, and note that figures should be verified before publishing anything precise.

STAY IN YOUR LANE. Report only your assigned topic. Do not summarize the property, do not discuss the listing price, and do not write marketing copy. Another stage does that.

PRIMARY GEOGRAPHY. The user message names the subject property's exact CITY and ZIP. Those two values are the PRIMARY GEOGRAPHY for this research — every figure you report must be for that city or that ZIP unless you explicitly say otherwise. If a data source (Census, ACS, MLS board, auditor) publishes at a different geography (metro area, county, place name that differs from the mailing city, e.g. a Dublin ZIP that Census reports under Hilliard), label every figure with the exact geography it covers: "ZIP {zip}, ACS 2020-2024", "City of {city}, Census 2020", "Franklin County auditor 2024", etc. Never report a figure without naming the geography and period it covers. If the ZIP straddles multiple mailing cities, that is expected and the ZIP-scoped figure is still the one to report — do not suppress it because it does not match the mailing city.

The user message will include a NEIGHBORHOOD SNAPSHOT extracted from the seller's own documents. Those values (School District, Subdivision, Walkability Score, Crime Risk Score, Flood Zone) are AUTHORITATIVE — do NOT web-search for any of them, and do NOT contradict them. If your topic touches any of those values, repeat them with source "Neighborhood Snapshot (documents)".

You have ONE web search. Make it count. Write a single specific query for your assigned topic and this address, read the results, and report what you found. Fetch a page only if the search results are insufficient. Do not iterate or refine repeatedly. If one search does not establish a fact, report what you did find and note what is missing rather than searching again.`;

const TOPIC_INSTRUCTIONS: Record<Topic, string> = {
  schools:
    `TOPIC: SCHOOLS. Identify the school district and the specific assigned elementary, middle, and high schools for THIS address. Include ratings (state report card, and a secondary source like GreatSchools if useful) and general reputation. Return Markdown under a single "## Schools" heading.`,
  recreation:
    `TOPIC: RECREATION & OUTDOORS. Identify parks, trails, metro parks, golf courses, and outdoor amenities within a reasonable drive of the address. Give real names and distances/directions. Return Markdown under a single "## Recreation & Outdoors" heading.`,
  convenience:
    `TOPIC: EVERYDAY CONVENIENCE. Identify grocery, shopping, dining, pharmacy, and healthcare near the address. Give real names and distances. Return Markdown under a single "## Everyday Convenience" heading.`,
  commute:
    `TOPIC: COMMUTE & ACCESS. Identify highway access, drive times to downtown and to the primary regional airport, and the major nearby employment centers. Give real corridor names, distances, and typical drive times with the period they refer to. Return Markdown under a single "## Commute & Access" heading.`,
  community:
    `TOPIC: THE COMMUNITY. Describe the subdivision or community itself: when it was built and by whom, what defines it architecturally and socially, any homeowners association and amenities. If the Neighborhood Snapshot names a subdivision, use that as the starting point. Return Markdown under a single "## The Community" heading.`,
  demographics:
    `TOPIC: DEMOGRAPHICS. Report population, median household income for the CITY and for the ZIP, share of high-income households, education level, owner-occupancy rate, and the effective property tax rate with an annual dollar range on this home's approximate price band. Prefer Census / ACS / county auditor. Label every figure with its exact geography and period (e.g., "ZIP 43016, ACS 2020-2024", "City of Dublin, Census 2020"). If the ZIP's Census-designated place name differs from the mailing city, report the ZIP figure anyway and note the naming difference in one sentence — DO NOT drop the figure. DO NOT gather or report age distribution data of any kind. Return Markdown under a single "## Demographics" heading.`,
  market:
    `TOPIC: MARKET CONTEXT. Report median home value, appreciation trend, days on market, and current market conditions for this submarket (ZIP or subdivision). Prefer local MLS or board of Realtors data. Label every figure with the exact geography and period. Return Markdown under a single "## Market Context" heading.`,
};

// Safe concatenator: guarantees whitespace between two text chunks so mid-word
// merges like "friendsare" cannot happen when we glue a continuation onto its
// predecessor. Ensures at least a blank line between them if either side lacks
// terminal / leading whitespace.
function joinContinuation(a: string, b: string): string {
  if (!a) return b || "";
  if (!b) return a;
  const endsClean = /[\s\n]$/.test(a);
  const startsClean = /^[\s\n]/.test(b);
  if (endsClean || startsClean) return `${a}${b}`;
  return `${a}\n\n${b}`;
}

const DEADLINE_MS = 130_000;

async function runWorker(jobId: string, topic: Topic, context: any) {
  const db = serviceClient();
  const title = TOPIC_TITLES[topic];
  const stageKey = `area_${topic}`;
  const startedAt = Date.now();
  let content = `## ${title}\n\n> Research unavailable for this topic.`;
  let searchCount = 0;
  let fetchCount = 0;
  let completed = false;
  let emptyOutput = false;
  let hitDeadline = false;
  let stopReason = "unknown";
  let errorMsg = "";
  let overloadRetries = 0;

  try {
    const system = `${SHARED_PREAMBLE}\n\n${TOPIC_INSTRUCTIONS[topic]}`;
    const userMsg = `# Subject Property
Address: ${context?.address || "(unknown)"}, ${context?.city || "(unknown city)"} ${context?.state || ""} ${context?.zip || "(unknown ZIP)"}
Community / Subdivision: ${context?.subdivision || "unknown"}

PRIMARY GEOGRAPHY for this research: City = "${context?.city || "(unknown)"}", ZIP = "${context?.zip || "(unknown)"}". Every figure you report must be labeled with the exact geography and period it covers.

# NEIGHBORHOOD SNAPSHOT (authoritative — do NOT web-search these values)
${context?.snapshot || "(no snapshot available — proceed with normal research)"}`;

    const claudePromise = callClaude({
      model: OPUS_MODEL,
      system,
      max_tokens: 4000,
      output_config: { effort: "high" },
      maxPauseTurnRetries: 2,
      onPauseTurn: async () => {
        await db.from("marketing_plan_jobs")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", jobId);
      },
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 1 },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 1 },
      ],
      messages: [{ role: "user", content: userMsg }],
    });

    const timeoutPromise = new Promise<{ __timeout: true }>((resolve) =>
      setTimeout(() => resolve({ __timeout: true }), DEADLINE_MS)
    );

    const winner = await Promise.race([claudePromise, timeoutPromise]);

    if ((winner as any).__timeout) {
      hitDeadline = true;
      console.warn(`stage4-worker(${topic}) hit ${DEADLINE_MS}ms deadline`);
      claudePromise.catch(() => {});
      content = `## ${title}\n\n> **FAILED:** Research unavailable for ${title} (hit ${DEADLINE_MS / 1000}s worker deadline).`;
    } else {
      const res = winner as Awaited<typeof claudePromise>;
      stopReason = res.stop_reason || "unknown";
      overloadRetries += res.retries || 0;
      const blocks = res.blocks || [];
      for (const b of blocks) {
        if (b?.type === "server_tool_use") {
          if (b?.name === "web_search") searchCount++;
          else if (b?.name === "web_fetch") fetchCount++;
        }
      }
      let txt = (res.text || "").trim();

      // If the model was cut off mid-output, do ONE bounded no-tools retry to
      // let it finish the write-up. Research is already done at this point.
      if (stopReason === "max_tokens") {
        console.warn(`stage4-worker(${topic}) hit max_tokens; issuing continuation without tools`);
        try {
          const cont = await callClaude({
            model: OPUS_MODEL,
            system,
            max_tokens: 6000,
            thinking: { type: "adaptive" },
            output_config: { effort: "high" },
            maxPauseTurnRetries: 0,
            messages: [
              { role: "user", content: userMsg },
              { role: "assistant", content: txt },
              { role: "user", content: `Continue exactly where you left off under the "## ${title}" heading. Do not repeat any content. Do not restate the heading. Finish the section cleanly.` },
            ],
            tools: [],
          });
          const contTxt = (cont.text || "").trim();
          overloadRetries += cont.retries || 0;
          if (contTxt) txt = joinContinuation(txt, contTxt);
          stopReason = `max_tokens+continued(${cont.stop_reason})`;
        } catch (e) {
          console.error(`stage4-worker(${topic}) continuation failed:`, e);
        }
      }

      if (txt.length === 0) {
        emptyOutput = true;
        completed = false;
        content = `## ${title}\n\n> **FAILED:** empty output for ${title} (stop_reason=${stopReason}, overload_retries=${overloadRetries}). This topic was NOT researched — do not treat as a completed placeholder.`;
      } else {
        completed = true;
        content = txt;
      }
    }
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : "unknown";
    console.error(`stage4-worker(${topic}) error:`, errorMsg);
    content = `## ${title}\n\n> **FAILED:** ${title} — ${errorMsg}`;
  } finally {
    const elapsedMs = Date.now() - startedAt;
    // Append a diagnostics footer so partial waves show which topics ran long
    // and how their tool budget was actually spent.
    const diag = [
      "",
      "---",
      `<!-- stage4-worker diagnostics`,
      `topic: ${topic}`,
      `elapsed_ms: ${elapsedMs}`,
      `web_search_used: ${searchCount}`,
      `web_fetch_used: ${fetchCount}`,
      `completed: ${completed}`,
      `empty_output: ${emptyOutput}`,
      `hit_deadline: ${hitDeadline}`,
      `stop_reason: ${stopReason}`,
      `overload_retries: ${overloadRetries}`,
      `error: ${errorMsg || "none"}`,
      `-->`,
    ].join("\n");
    content = `${content}\n${diag}`;
    console.log(
      `stage4-worker(${topic}) done elapsed=${elapsedMs}ms searches=${searchCount} fetches=${fetchCount} completed=${completed} empty=${emptyOutput} deadline=${hitDeadline} stop=${stopReason} overload_retries=${overloadRetries}`,
    );


    // GUARANTEED WRITE — every code path lands here.
    try {
      await saveStageResult(db, jobId, stageKey, content);
    } catch (e) {
      console.error(`stage4-worker(${topic}) save failed:`, e);
    }
    // Atomic per-worker completion counter (drives the UI's N/7 label).
    try {
      const { data: job } = await db
        .from("marketing_plan_jobs")
        .select("expected_area_count")
        .eq("id", jobId)
        .single();
      const expected = (job as any)?.expected_area_count || 7;
      const { newCount } = await incrementAreaCompleted(db, jobId, expected);
      console.log(`stage4-worker(${topic}) counter -> ${newCount}/${expected}`);
    } catch (e) {
      console.error(`stage4-worker(${topic}) counter update failed:`, e);
    }
    // Try to advance the Stage 5 gate. checkGateAndAdvance is atomic — only
    // one worker will actually invoke Stage 5, even if several arrive at once.
    try {
      const { STAGE5_REQUIRED } = await import("../_shared/marketing-plan-gates.ts");
      const { checkGateAndAdvance } = await import("../_shared/marketing-plan-common.ts");
      await checkGateAndAdvance(db, jobId, STAGE5_REQUIRED, "marketing-plan-stage5-plan", "stage5_dispatch");
    } catch (e) {
      console.error(`stage4-worker(${topic}) gate5 advance failed:`, e);
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const unauth = assertInternalCaller(req);
  if (unauth) return unauth;
  const { jobId, topic, context } = await req.json();
  if (!jobId || !topic) {
    return new Response(JSON.stringify({ error: "jobId and topic required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  // @ts-ignore EdgeRuntime
  EdgeRuntime.waitUntil(runWorker(jobId, topic as Topic, context));
  return new Response(JSON.stringify({ ok: true, backgrounded: true, topic }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
