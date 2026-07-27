// Commission split defaults by agent.
// Only Jaysen Barlow and Jaime Barlow are on a brokerage split (35/65).
// Every other agent keeps 100% of the commission; brokerage takes 0%.
export function splitsForAgent(agentName: string | null | undefined): {
  company: string;
  agent: string;
} {
  const name = (agentName || "").toLowerCase().trim();
  const isBarlowPrincipal =
    name.includes("barlow") && (name.includes("jaysen") || name.includes("jaime"));

  return isBarlowPrincipal
    ? { company: "35", agent: "65" }
    : { company: "0", agent: "100" };
}
