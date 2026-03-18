import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a professional real estate analyst for The Barlow Group at SellFor1Percent.com. You are reviewing documents uploaded by a listing agent to prepare a Seller Market Analysis.

Your job in this conversation is to:
1. Briefly acknowledge what documents you received and summarize key data points you extracted
2. Ask clarifying questions about anything unclear, missing, or that would help you produce a better analysis

Things you might ask about:
- Specific upgrades or renovations not mentioned in the documents (kitchen remodel year, new HVAC, roof age, etc.)
- Finished basement details if not clear from inspection worksheet
- Whether certain items convey with the property (appliances, fixtures)
- Seller's timeline or motivation (flexible closing, quick sale, etc.)
- Any known issues or disclosures
- Neighborhood context (HOA, school district preferences, lot backing)
- If a Zestimate seems off, ask about bed/bath configuration above-grade vs basement
- Any recent offers or feedback from showings

Keep your questions focused and practical. Ask 2-4 questions at a time, not overwhelming lists. Be conversational and professional.

When the agent says they're ready to generate or have answered enough questions, respond with exactly: "READY_TO_GENERATE" (nothing else). This signals the system to proceed with the full analysis.

If the agent provides additional notes or context, acknowledge it and ask follow-up questions if needed.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, documents, agentNotes } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build the initial context from documents (only for the first message)
    const chatMessages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    // If documents are provided (first call), build document context
    if (documents && Array.isArray(documents) && documents.length > 0) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      let docSummary = "I've uploaded the following documents for review:\n\n";

      for (const doc of documents) {
        if (!doc.filePath) continue;

        const mimeType = doc.mimeType || "application/pdf";

        if (mimeType.includes("wordprocessingml") || doc.filePath.endsWith(".docx")) {
          const { data: fileData, error: downloadError } = await supabase.storage
            .from("market-analysis-docs")
            .download(doc.filePath);

          if (downloadError) {
            console.error(`Failed to download ${doc.name}:`, downloadError);
            docSummary += `- ${doc.name}: (failed to read)\n`;
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
              docSummary += `--- ${doc.name} ---\n${textContent}\n\n`;
            }
          } catch (e) {
            console.error(`Failed to parse docx ${doc.name}:`, e);
            docSummary += `- ${doc.name}: (failed to parse)\n`;
          }
        } else {
          // For PDFs and images, create signed URL and mention it
          const { data: signedUrlData } = await supabase.storage
            .from("market-analysis-docs")
            .createSignedUrl(doc.filePath, 600);

          if (signedUrlData?.signedUrl) {
            // For text-based models, we describe the document
            docSummary += `- ${doc.name}: [${mimeType} document uploaded]\n`;
          }
        }
      }

      if (agentNotes && agentNotes.trim()) {
        docSummary += `\n--- Agent Notes ---\n${agentNotes.trim()}\n`;
      }

      // Add the document context as the first user message
      chatMessages.push({ role: "user", content: docSummary });
    }

    // Add conversation history
    if (messages && Array.isArray(messages)) {
      chatMessages.push(...messages.filter((_: any, i: number) => {
        // If we added document context, skip the first user message from history (it's the doc context)
        if (documents && documents.length > 0 && i === 0) return false;
        return true;
      }));
    }

    // If no conversation messages beyond documents, this is the initial call
    if (!messages || messages.length === 0) {
      // The doc summary is already added as user message
    }

    console.log(`Sending ${chatMessages.length} messages to Lovable AI for market analysis chat`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: chatMessages,
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
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
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
