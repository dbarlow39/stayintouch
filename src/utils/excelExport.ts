import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

const SKIP = new Set(["id", "agent_id", "user_id"]);
const label = (k: string) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Downloads all of the signed-in agent's rows from a table as an Excel file. */
export async function downloadTableAsExcel(
  table: "clients" | "leads",
  fileName: string,
  sheetName: string,
  extra?: (q: any) => any,
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    let q: any = supabase.from(table).select("*").eq("agent_id", user.id).range(from, from + 999);
    if (extra) q = extra(q);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const out = rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (SKIP.has(k)) continue;
      o[label(k)] = v !== null && typeof v === "object" ? JSON.stringify(v) : v;
    }
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(out);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${fileName}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  return out.length;
}
