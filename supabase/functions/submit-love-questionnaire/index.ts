import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const token = url.searchParams.get("token");
      if (!token) {
        return new Response(JSON.stringify({ error: "token required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: row } = await supabase
        .from("lead_love_responses")
        .select("id, lead_id, agent_id, token_expires_at, submitted_at")
        .eq("token", token)
        .maybeSingle();
      if (!row) {
        return new Response(JSON.stringify({ error: "Invalid link" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (new Date(row.token_expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "This link has expired. Please ask your agent to send a new one." }), {
          status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (row.submitted_at) {
        return new Response(JSON.stringify({ alreadySubmitted: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: lead } = await supabase
        .from("leads")
        .select("first_name, address, city, state, zip")
        .eq("id", row.lead_id)
        .maybeSingle();
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, full_name")
        .eq("id", row.agent_id)
        .maybeSingle();
      return new Response(JSON.stringify({
        firstName: lead?.first_name || "",
        propertyAddress: [lead?.address, lead?.city, lead?.state, lead?.zip].filter(Boolean).join(", "),
        agentName: profile?.full_name || profile?.first_name || "Your Agent",
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { token, responses } = body;
      if (!token || typeof token !== "string") {
        return new Response(JSON.stringify({ error: "token required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!Array.isArray(responses) || responses.length === 0) {
        return new Response(JSON.stringify({ error: "Please answer at least one question." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const cleaned = responses
        .map((r: any) => String(r ?? "").trim().slice(0, 1000))
        .filter((r: string) => r.length > 0);
      if (cleaned.length === 0) {
        return new Response(JSON.stringify({ error: "Please answer at least one question." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: row } = await supabase
        .from("lead_love_responses")
        .select("id, lead_id, agent_id, token_expires_at, submitted_at")
        .eq("token", token)
        .maybeSingle();
      if (!row) {
        return new Response(JSON.stringify({ error: "Invalid link" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (new Date(row.token_expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "This link has expired." }), {
          status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (row.submitted_at) {
        return new Response(JSON.stringify({ error: "This questionnaire has already been submitted." }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updErr } = await supabase
        .from("lead_love_responses")
        .update({ responses: cleaned, submitted_at: new Date().toISOString() })
        .eq("id", row.id);
      if (updErr) {
        return new Response(JSON.stringify({ error: updErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Notify the agent
      const { data: lead } = await supabase
        .from("leads")
        .select("first_name, last_name, address, city, state, zip")
        .eq("id", row.lead_id)
        .maybeSingle();
      const { data: profile } = await supabase
        .from("profiles")
        .select("preferred_email, email, first_name")
        .eq("id", row.agent_id)
        .maybeSingle();
      const agentEmail = profile?.preferred_email || profile?.email;
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

      if (agentEmail && RESEND_API_KEY) {
        const sellerName = `${lead?.first_name || ""} ${lead?.last_name || ""}`.trim() || "Your seller";
        const propertyAddress = [lead?.address, lead?.city, lead?.state, lead?.zip].filter(Boolean).join(", ");
        const list = cleaned.map((r, i) => `<li style="margin-bottom: 8px;"><strong>#${i + 1}:</strong> ${r.replace(/</g, "&lt;")}</li>`).join("");
        const subject = `${sellerName} shared what they love about ${propertyAddress || "their home"}`;
        const html = `
          <div style="font-family: Arial, sans-serif; font-size: 14px; color: #222; line-height: 1.5; max-width: 640px;">
            <p>Hi ${profile?.first_name || "there"},</p>
            <p><strong>${sellerName}</strong> just completed the "10 Things I Love" questionnaire for <strong>${propertyAddress || "their property"}</strong>. Their answers are below and are now available on the Seller Lead Detail page to feed the MLS description.</p>
            <ol>${list}</ol>
            <p>Thanks,<br/>Sell For 1 Percent</p>
          </div>
        `;
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
            body: JSON.stringify({
              from: "Sell For 1 Percent <notifications@resend.sellfor1percent.com>",
              to: [agentEmail],
              subject,
              html,
            }),
          });
        } catch (e) {
          console.error("Agent notify failed:", e);
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("submit-love-questionnaire error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
