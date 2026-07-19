
# Hard-gate proposal — awaiting approve

No model IDs will change. No files touched outside those listed.

---

## PART 1 — Stage 4 parallel fan-out

### File 1 — `supabase/functions/_shared/marketing-plan-common.ts`
Add one helper:
- `incrementAreaCompleted(db, jobId, expected) => { newCount, isLast }` — calls a new SQL RPC `mp_increment_area_completed(job_id, expected)` that runs `UPDATE marketing_plan_jobs SET current_batch = coalesce(current_batch,0) + 1 WHERE id = $1 RETURNING current_batch`, then returns whether the returned count equals `expected`. Uses the existing `current_batch` int column on `marketing_plan_jobs` — no schema change needed.

**Why:** Atomic increment via SQL RETURNING prevents two workers from both thinking they're last. `current_batch` is unused today.

### File 2 — new migration
Create SQL function `mp_increment_area_completed(p_job_id uuid) returns int` that runs the update above and returns the new count. `SECURITY DEFINER`, `SET search_path = public`, granted to `service_role` only. Also add column `expected_area_count int` to `marketing_plan_jobs` (nullable) so the dispatcher can record the fan-out count for the sweeper.

**Why:** One row-level atomic write is the only correct primitive for last-writer detection with N concurrent workers.

### File 3 — `supabase/functions/marketing-plan-stage4-area/index.ts` — REWRITE as dispatcher only
- Remove all Claude/web_search code and the `SYSTEM_PROMPT`.
- New behavior:
  1. `markStage(db, jobId, "area_research", "running")`
  2. Load lead + Stage 1 property + Stage 3 document facts, extract NEIGHBORHOOD SNAPSHOT (existing `extractSnapshot` moves into the worker).
  3. Reset `current_batch = 0`, set `expected_area_count = 7`.
  4. Fire seven fire-and-forget POSTs to `marketing-plan-stage4-worker` with `{ jobId, topic, context }` for each of the seven topics.
  5. Kick off a fire-and-forget POST to `marketing-plan-stage4-sweeper` (scheduled with a 4-minute internal delay via `setTimeout` inside its own waitUntil) — see File 5.
  6. Return `{ ok: true, dispatched: 7 }` immediately.

**Why:** Each worker gets its own ~150s edge wall clock. Total elapsed becomes the slowest single worker.

### File 4 — NEW `supabase/functions/marketing-plan-stage4-worker/index.ts`
One function, parameterized by `topic ∈ {schools, recreation, convenience, commute, community, demographics, market}`.

- Per-topic system prompt built from a shared preamble (SOURCE QUALITY / BE SPECIFIC OR SAY NOTHING / DATE EVERY FIGURE / STAY IN YOUR LANE — verbatim from your message) + a topic-specific instruction block matching the seven-topic list you provided (demographics explicitly excludes age distribution).
- `callClaude` args: `max_tokens: 2500`, `thinking: { type: "adaptive" }`, `output_config: { effort: "high" }`, `maxPauseTurnRetries: 2`, `tools: [{ web_search, max_uses: 3 }, { web_fetch, max_uses: 2 }]`.
- User message includes: address, city, state, ZIP, subdivision, NEIGHBORHOOD SNAPSHOT passthrough (do-not-re-research directive preserved verbatim).
- Wall clock: `deadlineMs: 110_000` via `Promise.race`.
- **Guaranteed-write completion**: single `finally` block writes the result row (`stage: "area_${topic}"`). On success writes the Markdown; on timeout writes `> Research unavailable for ${topic} (hit 110s deadline).`; on exception writes `> Research unavailable for ${topic}: ${message}`.
- After the write, call `mp_increment_area_completed(jobId)`. If returned count === `expected_area_count`, advance job to `ready_for_plan` and invoke `marketing-plan-stage5-plan`. This branch runs at most once across all workers because only one increment returns the target value.
- Backgrounded via `EdgeRuntime.waitUntil`.

**Why:** Guaranteed row write + atomic increment = counter always reaches expected_count in the happy path. Only one worker satisfies the equality condition and triggers Stage 5.

### File 5 — NEW `supabase/functions/marketing-plan-stage4-sweeper/index.ts`
Backstop for a worker that dies without hitting its `finally`.
- Backgrounded. Sleeps 240s via `setTimeout` inside `EdgeRuntime.waitUntil`.
- After sleep: reload job. If `current_stage === "area_research"` and `status !== "complete"`, read every existing `area_*` row, for any of the seven missing topics write a `> Research unavailable for ${topic} (sweeper backstop)` row, then advance job to `ready_for_plan` and invoke Stage 5.
- Idempotent: uses `.upsert(..., { onConflict: "job_id,stage" })`, so if the last worker already advanced the job the sweeper's writes are no-ops and it won't re-invoke Stage 5 (it checks stage first).

**Why:** Guarantees the pipeline always advances even if a worker instance dies mid-execution.

### File 6 — `supabase/functions/marketing-plan-stage5-plan/index.ts` — read the seven topic rows
Replace the single `# Stage 4 — Area Research\n${byStage.area_research}` block with a section that concatenates all `area_*` rows in fixed order (schools, recreation, convenience, commute, community, demographics, market), each under a `## <Topic Title>` heading with the row content beneath. If a specific topic row is missing, print the topic heading with `> Research unavailable for this topic.` The existing honest-disclosure behavior in the prompt continues to name missing topics.

**Why:** Stage 5 consumes all seven independently instead of relying on a single monolithic Stage 4 output.

### File 7 — `src/components/dashboard/sellerLead/MarketingPlanTab.tsx` — UI counter
- Stages array unchanged; label for `area_research` becomes dynamic: fetch the count of `area_*` rows in the existing results query and render `"4. Area research (${n} of 7 complete)"` while stage is running, `"4. Area research (${n} of 7)"` once complete.
- Remove the current "hit 100-second server deadline" stall messaging and the manual "Skip area research" / "Retry" buttons — no longer applicable because the pipeline self-completes.

**Why:** Single visible step with a live count matches how the fan-out actually works.

---

## PART 2 — Three Stage 5 fixes

### Fix A — Equipment and systems rule (contradicted humidifier / brand hallucination)
`marketing-plan-stage5-plan/index.ts` — append a new rule 10 to the NON-NEGOTIABLE RULES block, verbatim from your message ("EQUIPMENT AND SYSTEMS. Before stating anything about heating, cooling…").

### Fix B — Offsetting-advantage check on objection handlers (missed privacy call-out)
`marketing-plan-stage5-plan/index.ts` — append rule 11, verbatim ("Before writing the objections section, review the document evidence for any stated advantage that offsets or contradicts an objection…"). Also add a one-line evidence-mining directive to task item 4 telling Stage 5 to explicitly scan Stage 3 for lot privacy, sight lines, what the property backs to, recent replacements (carpet, roof), warranty coverage — and to promote any documented advantage to a positive selling point rather than an objection handler.

### Fix C — "Prepared by: {agent}" prints twice in the docx
`marketing-plan-export-docx/index.ts` — update `stripLeadingH1` to also strip a following "Prepared by:" line (and blank lines around it) so the plan body's byline is removed and only the header table's byline remains. New regex:
```
md
  .replace(/^\s*#\s+Marketing Plan for[^\n]*\n+/i, "")
  .replace(/^\s*Prepared by:[^\n]*\n+/i, "")
```

**Why:** The prompt still needs to print the byline in the plan body for the on-screen preview (which does not have the header table). Stripping it only in the docx path fixes the duplication without changing on-screen behavior.

---

## Risk

Medium-high. Stage 4 architecture is fully replaced. Mitigations:
- Legacy `area_research` row is no longer produced, but Stage 5 tolerates missing topics by design.
- Sweeper guarantees pipeline advances.
- Atomic RPC prevents last-writer race.
- Docx byline change is preview-safe.
- No model IDs, no other stages touched, no schema-breaking changes (only additive column + additive RPC).

Reply **approve** to apply, or name any item to drop or modify.
