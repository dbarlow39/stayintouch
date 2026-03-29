import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a professional real estate analyst for The Barlow Group at SellFor1Percent.com. You are reviewing documents uploaded by a listing agent to prepare a Seller Market Analysis for a home that is NOT currently listed for sale. This is a pre-listing analysis — use future-tense language like "when you list" rather than referring to the home as currently listed.

Your job in this conversation is to:
1. Briefly acknowledge what documents you received and summarize key data points you extracted
2. Ask clarifying questions about anything unclear, missing, or that would help you produce a better analysis

Things you might ask about:
- Specific upgrades or renovations not mentioned in the documents (kitchen remodel year, new HVAC, roof age, etc.)
- Finished basement details if not clear from inspection worksheet
- Whether certain items convey with the property (appliances, fixtures)

- Any known issues or disclosures
- Neighborhood context (HOA, school district preferences, lot backing)
- If a Zestimate seems off, ask about bed/bath configuration above-grade vs basement
- Any recent offers or feedback from showings

Keep your questions focused and practical. Ask 2-4 questions at a time, not overwhelming lists. Be conversational and professional.

IMPORTANT: Do NOT suggest pricing, price ranges, or bracket recommendations during this Q&A phase. Your job here is ONLY to gather information. Pricing analysis happens in the final generation step.

When the agent says they're ready to generate or have answered enough questions, respond with exactly: "READY_TO_GENERATE" (nothing else). This signals the system to proceed with the full analysis.

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

    // Build Anthropic messages array
    const anthropicMessages: any[] = [];

    // If documents are provided (first call), build document context as first user message
    if (documents && Array.isArray(documents) && documents.length > 0) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const userContent: any[] = [];
      userContent.push({ type: "text", text: "I've uploaded the following documents for review:\n" });

      for (const doc of documents) {
        // Handle database-sourced inspection data (inline JSON)
        if (doc.inspectionData) {
          console.log(`Using inline inspection data for ${doc.name}`);
          const inspectionText = JSON.stringify(doc.inspectionData, null, 2);
          userContent.push({
            type: "text",
            text: `[Document: ${doc.name}]\n${inspectionText}`,
          });

          // Include inspection photos if provided
          if (doc.inspectionPhotos && typeof doc.inspectionPhotos === "object") {
            const sectionNames: Record<string, string> = {
              'exterior': 'Exterior', 'living-room': 'Living Room', 'home-office': 'Home Office',
              'dining-room': 'Dining Room', 'kitchen': 'Kitchen', 'family-room': 'Family Room',
              'fireplaces': 'Fireplace', 'master-bedroom': 'Master Bedroom', 'bedroom-2': 'Bedroom 2',
              'bedroom-3': 'Bedroom 3', 'bedroom-4': 'Bedroom 4', 'basement': 'Basement', 'backyard': 'Backyard',
            };
            let photoCount = 0;
            for (const [sectionId, photos] of Object.entries(doc.inspectionPhotos)) {
              if (!Array.isArray(photos)) continue;
              const label = sectionNames[sectionId] || sectionId;
              for (const photoUrl of photos) {
                if (typeof photoUrl !== "string" || !photoUrl.startsWith("http")) continue;
                userContent.push({ type: "text", text: `[Inspection Photo: ${label}]` });
                userContent.push({ type: "image", source: { type: "url", url: photoUrl } });
                photoCount++;
                if (photoCount >= 20) break; // Cap total photos sent
              }
              if (photoCount >= 20) break;
            }
            console.log(`Included ${photoCount} inspection photos for AI review`);
          }

          continue;
        }

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
          // PDFs and images - use signed URLs so Claude can read them
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

    // Add conversation history
    if (messages && Array.isArray(messages)) {
      for (const msg of messages) {
        // Skip the first user message if we already added document context
        if (documents && documents.length > 0 && anthropicMessages.length === 1 && msg.role === "user" && anthropicMessages[0]?.role === "user") {
          // Merge this message content into the existing user message
          const existing = anthropicMessages[0].content;
          if (Array.isArray(existing)) {
            existing.push({ type: "text", text: msg.content });
          }
          continue;
        }
        anthropicMessages.push({ role: msg.role, content: msg.content });
      }
    }

    // Ensure messages alternate user/assistant (Anthropic requirement)
    // If we have no messages, the document context serves as the first user message
    if (anthropicMessages.length === 0) {
      throw new Error("No messages or documents provided");
    }

    console.log(`Sending ${anthropicMessages.length} messages to Claude for market analysis chat`);

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
        system: SYSTEM_PROMPT,
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

    // Transform Anthropic SSE stream to OpenAI-compatible SSE format
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
              // Convert to OpenAI format
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
    console.error("market-analysis-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
