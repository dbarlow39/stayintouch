import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BUYER_CHAT_SYSTEM_PROMPT = `You are a professional real estate analyst for The Barlow Group at SellFor1Percent.com. You are reviewing documents uploaded by an agent to determine a fair purchase range for a property their buyer client is considering purchasing.

Your job in this conversation is to:
1. Briefly acknowledge what documents you received and summarize key data points you extracted (square footage, lot size, year built, condition notes, tax assessed value, etc.)
2. Ask clarifying questions ONLY about facts that directly affect the property's market value

Things you SHOULD ask about:
- Upgrades or renovations not mentioned in the documents (kitchen remodel year, new HVAC, roof age, windows, etc.)
- Finished vs unfinished basement details if not clear
- Whether certain items convey with the property (appliances, fixtures)
- Any known condition issues (foundation, roof, HVAC, plumbing, electrical)
- Lot specifics (backing, easements, flood zone) if not in the docs
- Recent comparable sales the agent is aware of that aren't in the uploaded docs

Things you must NEVER ask about:
- HOA fees or special assessments — they do not impact property valuation in our analysis
- School district — all comparable properties are in the same district, so it has no bearing on relative value
- The buyer's budget, pre-approval amount, or financing capacity - value is independent of what the buyer can afford
- The buyer's must-have features or preferences - if they're writing an offer, the property already meets their needs
- Whether the buyer has seen the property - assume yes, they are ready to write an offer
- Competing offers or other properties the buyer is considering - fair market value is not based on competition
- The buyer's timeline, urgency, or motivation
- Whether the buyer needs to sell a current home first

Keep your questions focused on PROPERTY FACTS that affect valuation. Ask 2-3 questions at a time. Be conversational and professional.

IMPORTANT: Do NOT suggest pricing, price ranges, or offer amounts during this Q&A phase. Your job here is ONLY to gather property condition and feature data. Pricing analysis happens in the final generation step.

When the agent says they're ready to generate or have answered enough questions, respond with exactly: "READY_TO_GENERATE" (nothing else).

If the agent provides additional notes or context, acknowledge it and ask follow-up questions if needed.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, documents, agentNotes } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    const anthropicMessages: any[] = [];

    if (documents && Array.isArray(documents) && documents.length > 0) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const userContent: any[] = [];
      userContent.push({ type: "text", text: "I've uploaded the following documents for a buyer market analysis:\n" });

      for (const doc of documents) {
        if (!doc.filePath) continue;

        const mimeType = doc.mimeType || "application/pdf";

        if (mimeType.includes("wordprocessingml") || doc.filePath.endsWith(".docx")) {
          const { data: fileData, error: downloadError } = await supabase.storage
            .from("market-analysis-docs")
            .download(doc.filePath);

          if (downloadError) {
            console.error(`Failed to download ${doc.name}:`, downloadError);
            userContent.push({ type: "text", text: `- ${doc.name}: (failed to read)\n` });
            continue;
          }

          try {
            const arrayBuffer = await fileData.arrayBuffer();
            const zip = await JSZip.loadAsync(arrayBuffer);
            const docXml = await zip.file("word/document.xml")?.async("string");
            if (docXml) {
              const textContent = docXml
                .replace(/<\/w:p>/g, "\n")
                .replace(/<w:br[^>]*\/>/g, "\n")
                .replace(/<w:tab[^>]*\/>/g, "\t")
                .replace(/<[^>]+>/g, "")
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, "'")
                .replace(/\n{3,}/g, "\n\n")
                .trim();
              userContent.push({
                type: "text",
                text: `[Document: ${doc.name}]\n${textContent}\n`,
              });
            }
          } catch (e) {
            console.error(`Failed to parse docx ${doc.name}:`, e);
            userContent.push({ type: "text", text: `- ${doc.name}: (failed to parse)\n` });
          }
        } else {
          const { data: signedUrlData, error: signedUrlError } = await supabase.storage
            .from("market-analysis-docs")
            .createSignedUrl(doc.filePath, 600);

          if (signedUrlError || !signedUrlData?.signedUrl) {
            console.error(`Failed to create signed URL for ${doc.name}:`, signedUrlError);
            continue;
          }

          if (mimeType.startsWith("image/")) {
            userContent.push({
              type: "image",
              source: { type: "url", url: signedUrlData.signedUrl },
            });
          } else {
            userContent.push({
              type: "document",
              source: { type: "url", url: signedUrlData.signedUrl },
            });
          }
        }
      }

      if (agentNotes && agentNotes.trim()) {
        userContent.push({
          type: "text",
          text: `\n--- Agent Notes ---\n${agentNotes.trim()}\n`,
        });
      }

      anthropicMessages.push({ role: "user", content: userContent });
    }

    if (messages && Array.isArray(messages)) {
      for (const msg of messages) {
        if (documents && documents.length > 0 && anthropicMessages.length === 1 && msg.role === "user" && anthropicMessages[0]?.role === "user") {
          const existing = anthropicMessages[0].content;
          if (Array.isArray(existing)) {
            existing.push({ type: "text", text: msg.content });
          }
          continue;
        }
        anthropicMessages.push({ role: msg.role, content: msg.content });
      }
    }

    if (anthropicMessages.length === 0) {
      throw new Error("No messages or documents provided");
    }

    console.log(`Sending ${anthropicMessages.length} messages to Claude for buyer market analysis chat`);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: BUYER_CHAT_SYSTEM_PROMPT,
        messages: anthropicMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("Claude API error:", response.status, t);
      return new Response(JSON.stringify({ error: "Claude API error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        const lines = text.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
              const openAiChunk = {
                choices: [{ delta: { content: event.delta.text } }],
              };
              controller.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify(openAiChunk)}\n\n`)
              );
            } else if (event.type === "message_stop") {
              controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            }
          } catch {
            // Skip unparseable lines
          }
        }
      },
    });

    const transformedBody = response.body!.pipeThrough(transformStream);

    return new Response(transformedBody, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("buyer-market-analysis-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
