import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    let { recipientEmail, agentName, propertyAddress, paperworkReceived, checkReceived, fromName } = body;
    const closingId = body.closing_id || body.closingId;

    // If invoked with just closing_id (e.g. by DB trigger on auto-import), resolve fields from DB.
    if (closingId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: closing, error: cErr } = await supabase
        .from("closings")
        .select("agent_id, agent_name, property_address, paperwork_status")
        .eq("id", closingId)
        .maybeSingle();
      if (cErr || !closing) {
        console.error("Closing lookup failed:", cErr);
        return new Response(JSON.stringify({ error: "Closing not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("preferred_email, email, first_name, full_name")
        .eq("id", closing.agent_id)
        .maybeSingle();

      recipientEmail = recipientEmail || profile?.preferred_email || profile?.email;
      agentName = agentName || profile?.first_name || profile?.full_name || closing.agent_name;
      propertyAddress = propertyAddress || closing.property_address;
      paperworkReceived = paperworkReceived ?? (closing.paperwork_status === "received");
      fromName = fromName || "Sell For 1 Percent";

      if (!recipientEmail) {
        console.warn(`No recipient email for agent ${closing.agent_id}; skipping.`);
        return new Response(JSON.stringify({ skipped: "no recipient email" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!recipientEmail || (!paperworkReceived && !checkReceived)) {
      return new Response(JSON.stringify({ error: "Missing recipient or nothing to notify" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items: string[] = [];
    if (paperworkReceived) items.push("closing paperwork");
    if (checkReceived) items.push("your closing check");
    const itemsText = items.join(" and ");

    const subject = `We've received ${items.map(i => i.replace("your ", "")).join(" and ")}${propertyAddress ? ` — ${propertyAddress}` : ""}`;

    const greeting = agentName ? `Hi ${agentName.split(" ")[0]},` : "Hi,";
    const html = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #222; line-height: 1.5;">
        <p>${greeting}</p>
        <p>This is a quick note to let you know we have received ${itemsText}${propertyAddress ? ` for <strong>${propertyAddress}</strong>` : ""}.</p>
        <p>We'll follow up if anything else is needed.</p>
        <p>Thanks,<br/>${fromName || "The Office"}</p>
      </div>
    `;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Sell For 1 Percent <notifications@resend.sellfor1percent.com>",
        to: [recipientEmail],
        subject,
        html,
      }),
    });

    const result = await resp.json();
    if (!resp.ok) {
      console.error("Resend error:", result);
      return new Response(JSON.stringify({ error: result }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-closing-notification error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
