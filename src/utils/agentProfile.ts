import { supabase } from "@/integrations/supabase/client";
import type { MarketAnalysisAgentProfile } from "@/utils/marketAnalysisDocx";

/**
 * Fetches the logged-in agent's identity fields for use in generated
 * documents / emails. Returns null if no user is signed in or the query
 * fails - callers should treat null as "omit the byline / contact line"
 * rather than falling back to another agent's identity.
 */
export async function fetchCurrentAgentProfile(): Promise<MarketAnalysisAgentProfile | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select("full_name, first_name, last_name, cell_phone, preferred_email, email")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      console.warn("fetchCurrentAgentProfile:", error.message);
      return null;
    }
    return (data as MarketAnalysisAgentProfile) || null;
  } catch (e) {
    console.warn("fetchCurrentAgentProfile failed:", e);
    return null;
  }
}
