// Commission split defaults by agent.
// Only Jaysen Barlow and Jaime Barlow are on a brokerage split (40/60).
// Every other agent keeps 100% of the commission; brokerage takes 0%.
export function splitsForAgent(agentName: string | null | undefined): {
  company: string;
  agent: string;
} {
  const name = (agentName || "").toLowerCase().trim();
  const isBarlowPrincipal =
    name.includes("barlow") && (name.includes("jaysen") || name.includes("jaime"));

  return isBarlowPrincipal
    ? { company: "40", agent: "60" }
    : { company: "0", agent: "100" };
}
