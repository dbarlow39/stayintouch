// Central definitions of the DAG gates. Kept here so every stage/worker/sweeper
// uses exactly the same required-stage list — a mismatch would deadlock the job.

export const AREA_TOPICS = [
  "schools",
  "recreation",
  "convenience",
  "commute",
  "community",
  "demographics",
  "market",
] as const;

export const AREA_STAGE_KEYS = AREA_TOPICS.map((t) => `area_${t}`);

// Stage 4 dispatcher runs once Stage 1 and Stage 3 have written their rows.
export const STAGE4_REQUIRED = ["property_data", "document_facts"];

// After all evidence is in, the CONFLICTS detector runs (agent checklist).
// Same required rows as Stage 5 used to gate on — Stage 5 no longer auto-runs.
export const STAGE5_REQUIRED = [
  "property_data",
  "photo_review",
  "document_facts",
  ...AREA_STAGE_KEYS,
];

// Human-readable labels for stall banners and progress lists.
export const STAGE_LABELS: Record<string, string> = {
  property_data: "Property record (Estated)",
  photo_review: "Walkthrough photo review",
  document_facts: "Document facts (HOA/disclosures)",
  area_schools: "Area research: Schools",
  area_recreation: "Area research: Recreation",
  area_convenience: "Area research: Convenience",
  area_commute: "Area research: Commute",
  area_community: "Area research: Community",
  area_demographics: "Area research: Demographics",
  area_market: "Area research: Market",
  conflicts: "Conflict detection (agent review)",
  marketing_plan: "Marketing plan",
};
