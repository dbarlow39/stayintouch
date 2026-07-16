import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};


const PUBLIC_BASE = "https://10thingsilove.sellfor1percent.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const agentId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const leadId = body.lead_id || body.leadId;
    const mode = body.mode === "draft" ? "draft" : "send";
    if (!leadId || typeof leadId !== "string") {
      return new Response(JSON.stringify({ error: "lead_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: lead, error: lErr } = await supabase
      .from("leads")
      .select("id, agent_id, first_name, last_name, email, address, city, state, zip")
      .eq("id", leadId)
      .maybeSingle();
    if (lErr || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (lead.agent_id !== agentId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!lead.email) {
      return new Response(JSON.stringify({ error: "Lead has no email address" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("preferred_email, email, first_name, full_name")
      .eq("id", agentId)
      .maybeSingle();
    const agentName = profile?.full_name || profile?.first_name || "Your Agent";
    const agentBcc = profile?.preferred_email || profile?.email || null;

    // Expire any prior un-submitted rows for this lead so old links stop working.
    await supabase
      .from("lead_love_responses")
      .update({ token_expires_at: new Date().toISOString() })
      .eq("lead_id", leadId)
      .eq("agent_id", agentId)
      .is("submitted_at", null);

    // Always issue a fresh token on send/resend.
    const { data: inserted, error: insErr } = await supabase
      .from("lead_love_responses")
      .insert({ lead_id: leadId, agent_id: agentId, sent_at: new Date().toISOString() })
      .select("id, token")
      .single();
    if (insErr || !inserted) {
      return new Response(JSON.stringify({ error: insErr?.message || "Insert failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const tokenValue = inserted.token;
    const rowId = inserted.id;

    const link = `${PUBLIC_BASE}/love/${tokenValue}`;
    const firstName = lead.first_name || "there";
    const propertyAddress = [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(", ");

    const subject = `${firstName}, what do you love about your home?`;
    const html = `
      <div style="font-family: Arial, sans-serif; font-size: 15px; color: #222; line-height: 1.6; max-width: 600px;">
        <p>Hi ${firstName},</p>
        <p>As we get ready to list <strong>${propertyAddress || "your home"}</strong>, the most powerful thing we can do in the MLS description is capture the <em>emotional</em> reasons buyers should fall in love with it — the same reasons you fell in love with it.</p>
        <p>Would you take a few minutes to share the <strong>10 things you love most</strong> about your home? Anything counts — the morning light in the kitchen, the way the backyard feels in the fall, a specific upgrade that changed how you live there. The more personal, the better.</p>
        <p style="text-align: center; margin: 28px 0;">
          <a href="${link}" style="background: #9B111E; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Click to Share Your 10 Things</a>
        </p>
        <p style="margin-top: 24px;">Thank you — your answers go directly into the listing we'll craft for your home.</p>
        <p>${agentName}<br/>Sell For 1 Percent</p>
        <p style="color: #888; font-size: 12px; margin-top: 28px;">If the button doesn't work, copy and paste this link: ${link}</p>
      </div>
    `;

    if (mode === "draft") {
      return new Response(JSON.stringify({
        success: true, mode: "draft", link, subject, html, to: lead.email,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailPayload: any = {
      from: "Sell For 1 Percent <notifications@resend.sellfor1percent.com>",
      to: [lead.email],
      subject,
      html,
    };
    if (agentBcc) emailPayload.bcc = [agentBcc];

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify(emailPayload),
    });
    const result = await resp.json();
    if (!resp.ok) {
      console.error("Resend error:", result);
      return new Response(JSON.stringify({ error: result }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, link, id: result.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-love-questionnaire error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
