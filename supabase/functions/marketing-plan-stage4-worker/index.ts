// Stage 4 WORKER. Invoked once per topic by the dispatcher. Runs one focused
// Claude turn against web_search / web_fetch, writes exactly one result row
// on every code path, atomically increments the completion counter, and if
// it's the last worker advances the job to Stage 5.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
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

The user message will include a NEIGHBORHOOD SNAPSHOT extracted from the seller's own documents. Those values (School District, Subdivision, Walkability Score, Crime Risk Score, Flood Zone) are AUTHORITATIVE — do NOT web-search for any of them, and do NOT contradict them. If your topic touches any of those values, repeat them with source "Neighborhood Snapshot (documents)".`;

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
    `TOPIC: DEMOGRAPHICS. Report population, median household income for the city and for the ZIP, share of high-income households, education level, owner-occupancy rate, and the effective property tax rate with an annual dollar range on this home's approximate price band. Prefer Census / ACS / county auditor. DO NOT gather or report age distribution data of any kind. Return Markdown under a single "## Demographics" heading.`,
  market:
    `TOPIC: MARKET CONTEXT. Report median home value, appreciation trend, days on market, and current market conditions for this submarket (ZIP or subdivision). Prefer local MLS or board of Realtors data. Return Markdown under a single "## Market Context" heading.`,
};

const DEADLINE_MS = 110_000;

async function runWorker(jobId: string, topic: Topic, context: any) {
  const db = serviceClient();
  const title = TOPIC_TITLES[topic];
  const stageKey = `area_${topic}`;
  let content = `## ${title}\n\n> Research unavailable for this topic.`;

  try {
    const system = `${SHARED_PREAMBLE}\n\n${TOPIC_INSTRUCTIONS[topic]}`;
    const userMsg = `Address: ${context?.address || ""}, ${context?.city || ""} ${context?.state || ""} ${context?.zip || ""}
Community / Subdivision: ${context?.subdivision || "unknown"}

# NEIGHBORHOOD SNAPSHOT (authoritative — do NOT web-search these values)
${context?.snapshot || "(no snapshot available — proceed with normal research)"}`;

    const claudePromise = callClaude({
      model: OPUS_MODEL,
      system,
      max_tokens: 2500,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      maxPauseTurnRetries: 2,
      onPauseTurn: async () => {
        await db.from("marketing_plan_jobs")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", jobId);
      },
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 3 },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 2 },
      ],
      messages: [{ role: "user", content: userMsg }],
    });

    const timeoutPromise = new Promise<{ __timeout: true }>((resolve) =>
      setTimeout(() => resolve({ __timeout: true }), DEADLINE_MS)
    );

    const winner = await Promise.race([claudePromise, timeoutPromise]);

    if ((winner as any).__timeout) {
      console.warn(`stage4-worker(${topic}) hit ${DEADLINE_MS}ms deadline`);
      claudePromise.catch(() => {});
      content = `## ${title}\n\n> Research unavailable for ${title} (hit ${DEADLINE_MS / 1000}s worker deadline).`;
    } else {
      const res = winner as Awaited<typeof claudePromise>;
      const txt = (res.text || "").trim();
      content = txt.length > 0
        ? txt
        : `## ${title}\n\n> Research unavailable for ${title} (empty response).`;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error(`stage4-worker(${topic}) error:`, msg);
    content = `## ${title}\n\n> Research unavailable for ${title}: ${msg}`;
  } finally {
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
