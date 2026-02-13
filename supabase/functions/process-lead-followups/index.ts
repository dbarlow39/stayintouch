import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, leadId, messageId, useAI = true } = await req.json();

    // Get pending messages that are due
    if (action === "process_pending") {
      const now = new Date().toISOString();
      
      const { data: pendingMessages, error: fetchError } = await supabase
        .from("scheduled_messages")
        .select(`
          *,
          lead_sequence_enrollments!inner(
            id,
            current_step,
            sequence_id,
            lead_id
          )
        `)
        .eq("status", "pending")
        .lte("scheduled_for", now)
        .limit(50);

      if (fetchError) throw fetchError;

      const results = [];
      for (const msg of pendingMessages || []) {
        try {
          // Get lead details
          const { data: lead, error: leadError } = await supabase
            .from("leads")
            .select("*")
            .eq("id", msg.lead_id)
            .single();

          if (leadError || !lead) {
            await supabase
              .from("scheduled_messages")
              .update({ status: "failed", error_message: "Lead not found" })
              .eq("id", msg.id);
            continue;
          }

          // Get agent profile (includes signature line in bio field)
          const { data: agent } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", msg.agent_id)
            .single();

          // Build signature from agent's bio/signature line
          let agentSignature = '';
          if (agent?.bio) {
            const isHtml = /<[a-z][\s\S]*>/i.test(agent.bio);
            agentSignature = isHtml ? agent.bio : agent.bio.replace(/\n/g, '<br>');
          }

          // Personalize the message
          let messageContent = msg.message_content || "";
          messageContent = messageContent
            .replace(/{first_name}/g, lead.first_name || "")
            .replace(/{last_name}/g, lead.last_name || "")
            .replace(/{email}/g, lead.email || "")
            .replace(/{phone}/g, lead.phone || "");

          // AI enhancement if enabled
          if (msg.ai_enhanced && useAI) {
            const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
            if (LOVABLE_API_KEY) {
              const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${LOVABLE_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "google/gemini-2.5-flash",
                  messages: [
                    {
                      role: "system",
                      content: `You are a professional real estate agent assistant. Enhance the following message to make it more personal, warm, and engaging while keeping the same intent and approximate length. The message is for a potential home seller lead. Keep the tone professional but friendly. Do not add any new facts or claims - just improve the language and flow.`,
                    },
                    { role: "user", content: messageContent },
                  ],
                }),
              });

              if (aiResponse.ok) {
                const aiData = await aiResponse.json();
                messageContent = aiData.choices?.[0]?.message?.content || messageContent;
              }
            }
          }

          // For now, just mark as sent (actual sending would integrate with Resend/Twilio)
          // In production, this would call the actual email/SMS sending service
          
          await supabase
            .from("scheduled_messages")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              message_content: messageContent,
            })
            .eq("id", msg.id);

          // Update enrollment to next step
          const enrollment = msg.lead_sequence_enrollments;
          const { data: nextStep } = await supabase
            .from("sequence_steps")
            .select("*")
            .eq("sequence_id", enrollment.sequence_id)
            .eq("step_order", enrollment.current_step + 2)
            .single();

          if (nextStep) {
            // Schedule next message
            const nextSendAt = new Date();
            nextSendAt.setDate(nextSendAt.getDate() + nextStep.delay_days);

            await supabase
              .from("lead_sequence_enrollments")
              .update({
                current_step: enrollment.current_step + 1,
                next_send_at: nextSendAt.toISOString(),
              })
              .eq("id", enrollment.id);
          } else {
            // Sequence complete
            await supabase
              .from("lead_sequence_enrollments")
              .update({
                status: "completed",
                current_step: enrollment.current_step + 1,
                completed_at: new Date().toISOString(),
                next_send_at: null,
              })
              .eq("id", enrollment.id);
          }

          results.push({ id: msg.id, status: "sent" });
        } catch (err) {
          await supabase
            .from("scheduled_messages")
            .update({ status: "failed", error_message: String(err) })
            .eq("id", msg.id);
          results.push({ id: msg.id, status: "failed", error: String(err) });
        }
      }

      return new Response(JSON.stringify({ processed: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Schedule messages for a newly enrolled lead
    if (action === "schedule_for_lead" && leadId) {
      // Get active enrollments for this lead
      const { data: enrollments, error: enrollError } = await supabase
        .from("lead_sequence_enrollments")
        .select(`
          *,
          follow_up_sequences!inner(
            id,
            agent_id,
            sequence_steps(*)
          )
        `)
        .eq("lead_id", leadId)
        .eq("status", "active");

      if (enrollError) throw enrollError;

      const scheduled = [];
      for (const enrollment of enrollments || []) {
        const steps = enrollment.follow_up_sequences.sequence_steps || [];
        const agentId = enrollment.follow_up_sequences.agent_id;

        for (const step of steps) {
          if (step.step_order <= enrollment.current_step) continue;

          const scheduledFor = new Date();
          scheduledFor.setDate(scheduledFor.getDate() + step.delay_days);

          const channels = step.channel === "both" ? ["email", "sms"] : [step.channel];

          for (const channel of channels) {
            const { data: existing } = await supabase
              .from("scheduled_messages")
              .select("id")
              .eq("enrollment_id", enrollment.id)
              .eq("step_id", step.id)
              .eq("channel", channel)
              .single();

            if (!existing) {
              await supabase.from("scheduled_messages").insert({
                enrollment_id: enrollment.id,
                step_id: step.id,
                lead_id: leadId,
                agent_id: agentId,
                channel,
                scheduled_for: scheduledFor.toISOString(),
                subject: step.subject,
                message_content: step.message_template,
                ai_enhanced: step.use_ai_enhancement,
              });
              scheduled.push({ step_id: step.id, channel });
            }
          }
        }
      }

      return new Response(JSON.stringify({ scheduled }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Preview a message with AI enhancement
    if (action === "preview_message" && messageId) {
      const { data: msg, error: msgError } = await supabase
        .from("scheduled_messages")
        .select(`*, leads(*)`)
        .eq("id", messageId)
        .single();

      if (msgError || !msg) {
        return new Response(JSON.stringify({ error: "Message not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let content = msg.message_content || "";
      const lead = msg.leads;

      content = content
        .replace(/{first_name}/g, lead?.first_name || "[First Name]")
        .replace(/{last_name}/g, lead?.last_name || "[Last Name]")
        .replace(/{email}/g, lead?.email || "[Email]")
        .replace(/{phone}/g, lead?.phone || "[Phone]");

      if (msg.ai_enhanced && useAI) {
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        if (LOVABLE_API_KEY) {
          const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                {
                  role: "system",
                  content: `You are a professional real estate agent assistant. Enhance the following message to make it more personal, warm, and engaging while keeping the same intent and approximate length. Keep the tone professional but friendly.`,
                },
                { role: "user", content },
              ],
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            content = aiData.choices?.[0]?.message?.content || content;
          }
        }
      }

      return new Response(JSON.stringify({ preview: content, original: msg.message_content }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
