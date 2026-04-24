import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_BASE_URL = "https://stayintouch.lovable.app";

interface PropertyRow {
  id: string;
  agent_id: string;
  name: string;
  street_address: string;
  in_contract: string | null;
  closing_date: string | null;
  inspection_days: number | null;
  loan_app_time_frame: string | null;
  loan_commitment: string | null;
  deposit_collection: string | null;
}

interface NoticeStatusRow {
  property_id: string;
  notice_type: string;
  completed: boolean;
}

interface ProfileRow {
  id: string;
  email: string;
  preferred_email: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
}

const parseLocalDate = (s: string | null): Date | null => {
  if (!s) return null;
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return null;
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
};

const addDays = (date: Date, days: number) => {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
};
const subDays = (date: Date, days: number) => addDays(date, -days);
const startOfDay = (date: Date) => {
  const r = new Date(date);
  r.setHours(0, 0, 0, 0);
  return r;
};
const diffDays = (a: Date, b: Date) =>
  Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000);
const fmtDate = (d: Date) => {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
};

const calculateNotices = (p: PropertyRow) => {
  const inContract = parseLocalDate(p.in_contract);
  const closing = parseLocalDate(p.closing_date);

  let depositDue: Date | null = null;
  if (p.deposit_collection && inContract) {
    const m = p.deposit_collection.match(/(\d+)\s*days?/i);
    if (m) depositDue = addDays(inContract, parseInt(m[1]));
  }
  const inspectionDue = inContract && p.inspection_days ? addDays(inContract, p.inspection_days) : null;
  const loanAppDue = inContract && p.loan_app_time_frame
    ? addDays(inContract, parseInt(p.loan_app_time_frame) || 7) : null;
  const titleDue = closing ? subDays(closing, 15) : null;
  const appraisalDue = closing ? subDays(closing, 14) : null;
  const loanApprovedDue = inContract && p.loan_commitment
    ? addDays(inContract, parseInt(p.loan_commitment) || 21) : null;
  const clearToCloseDue = closing ? subDays(closing, 4) : null;
  const hudDue = closing ? subDays(closing, 2) : null;

  return [
    { type: "deposit-received", label: "Deposit Received", dueDate: depositDue },
    { type: "home-inspection-scheduled", label: "Home Inspection Scheduled", dueDate: inspectionDue },
    { type: "loan-application", label: "Loan Application", dueDate: loanAppDue },
    { type: "title-commitment-received", label: "Title Commitment Received", dueDate: titleDue },
    { type: "appraisal-ordered", label: "Appraisal Ordered", dueDate: appraisalDue },
    { type: "loan-approved", label: "Loan Approved", dueDate: loanApprovedDue },
    { type: "clear-to-close", label: "Clear to Close", dueDate: clearToCloseDue },
    { type: "hud-settlement-statement", label: "HUD Settlement Statement", dueDate: hudDue },
    { type: "closed", label: "Closed", dueDate: closing },
  ];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    // Fetch all in-contract, non-closed properties
    const { data: properties, error: pErr } = await supabase
      .from("estimated_net_properties")
      .select("id, agent_id, name, street_address, in_contract, closing_date, inspection_days, loan_app_time_frame, loan_commitment, deposit_collection, deal_status")
      .not("in_contract", "is", null)
      .neq("deal_status", "closed");
    if (pErr) throw pErr;
    if (!properties || properties.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no properties" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const propertyIds = properties.map((p) => p.id);
    const { data: statuses } = await supabase
      .from("property_notice_status")
      .select("property_id, notice_type, completed")
      .in("property_id", propertyIds);
    const statusMap: Record<string, boolean> = {};
    (statuses as NoticeStatusRow[] | null || []).forEach((s) => {
      statusMap[`${s.property_id}:${s.notice_type}`] = s.completed;
    });

    const today = startOfDay(new Date());
    const cutoff = addDays(today, 3);

    // Build notices grouped by agent
    type NoticeItem = {
      propertyId: string;
      propertyName: string;
      propertyAddress: string;
      label: string;
      dueDate: Date;
    };
    const byAgent: Record<string, NoticeItem[]> = {};

    for (const p of properties as PropertyRow[]) {
      const notices = calculateNotices(p);
      for (const n of notices) {
        if (!n.dueDate) continue;
        if (statusMap[`${p.id}:${n.type}`]) continue;
        // overdue OR due within next 3 days (inclusive of cutoff day)
        if (n.dueDate.getTime() > addDays(cutoff, 1).getTime() - 1) continue;
        (byAgent[p.agent_id] ||= []).push({
          propertyId: p.id,
          propertyName: p.name,
          propertyAddress: p.street_address,
          label: n.label,
          dueDate: n.dueDate,
        });
      }
    }

    const agentIds = Object.keys(byAgent);
    if (agentIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no due notices" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, preferred_email, full_name, first_name, last_name")
      .in("id", agentIds);
    const profileMap: Record<string, ProfileRow> = {};
    (profiles as ProfileRow[] | null || []).forEach((p) => { profileMap[p.id] = p; });

    let sent = 0;
    const errors: string[] = [];

    for (const agentId of agentIds) {
      const items = byAgent[agentId].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
      const profile = profileMap[agentId];
      if (!profile) continue;
      const recipient = profile.preferred_email || profile.email;
      if (!recipient) continue;
      const agentName = profile.full_name
        || [profile.first_name, profile.last_name].filter(Boolean).join(" ")
        || "there";

      // Group by property for the email body
      const propMap: Record<string, { name: string; address: string; items: NoticeItem[] }> = {};
      for (const it of items) {
        if (!propMap[it.propertyId]) {
          propMap[it.propertyId] = { name: it.propertyName, address: it.propertyAddress, items: [] };
        }
        propMap[it.propertyId].items.push(it);
      }

      const propertySections = Object.entries(propMap).map(([pid, info]) => {
        const link = `${APP_BASE_URL}/dashboard?tab=deals&propertyId=${pid}`;
        const rows = info.items.map((it) => {
          const days = diffDays(it.dueDate, today);
          const overdue = days < 0;
          const badge = overdue
            ? `<span style="background:#fee2e2;color:#b91c1c;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;">${Math.abs(days)}d OVERDUE</span>`
            : days === 0
              ? `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;">Due Today</span>`
              : `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;">Due in ${days}d</span>`;
          return `<tr>
            <td style="padding:6px 12px 6px 0;color:#111;font-size:14px;">${it.label}</td>
            <td style="padding:6px 12px 6px 0;color:#555;font-size:13px;">${fmtDate(it.dueDate)}</td>
            <td style="padding:6px 0;">${badge}</td>
          </tr>`;
        }).join("");

        return `<div style="margin-bottom:24px;">
          <div style="margin-bottom:8px;">
            <a href="${link}" style="color:#1d4ed8;text-decoration:none;font-weight:600;font-size:15px;">${info.name}</a>
            ${info.address && info.address !== info.name ? `<div style="color:#666;font-size:13px;">${info.address}</div>` : ""}
          </div>
          <table style="border-collapse:collapse;width:100%;">${rows}</table>
        </div>`;
      }).join("");

      const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#111;max-width:640px;margin:0 auto;padding:20px;">
        <h2 style="margin:0 0 4px 0;">📋 Working Deals Notices Due</h2>
        <p style="color:#666;margin:0 0 20px 0;font-size:14px;">${fmtDate(today)} — ${items.length} notice${items.length === 1 ? "" : "s"} need attention</p>
        ${propertySections}
        <p style="margin-top:24px;color:#111;font-size:14px;">Thanks,<br>${agentName}</p>
      </body></html>`;

      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "Working Deals <noreply@sellfor1percent.com>",
          to: [recipient],
          subject: "📋 Working Deals Notices Due",
          html,
        }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        errors.push(`agent ${agentId}: ${resp.status} ${t}`);
      } else {
        sent++;
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-daily-notices-email error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
