import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { filePath } = await req.json();
    
    if (!filePath) {
      return new Response(JSON.stringify({ error: 'File path is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Parsing purchase contract:', filePath);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Download the file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('deal-documents')
      .download(filePath);

    if (downloadError) {
      console.error('Download error:', downloadError);
      return new Response(JSON.stringify({ error: 'Failed to download file' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Convert file to base64 for AI processing (chunked to avoid stack overflow)
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binaryString = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      binaryString += String.fromCharCode(...chunk);
    }
    const base64Content = btoa(binaryString);
    const mimeType = fileData.type || 'application/pdf';

    // Use Lovable AI to extract contract fields
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const extractionPrompt = `You are an expert real estate contract analyzer. Extract the following fields from this purchase contract document and return them as a FLAT JSON object (not nested).

Extract these fields (return null if not found):

- offerPrice: The total purchase/offer price from paragraph 1 (number only, no commas or $)
- deposit: The earnest money deposit amount from paragraph 2 (number only)
- depositCollection: When/how the deposit is collected from paragraph 2 (text description)
- buyerAgentName: Buyer agent's full name from paragraph 18.1
- buyerAgentPhone: Buyer agent's cell phone number from paragraph 18.1
- buyerAgentEmail: Buyer agent's email address from paragraph 18.1
- buyerName1: First buyer's full name from paragraph 18.1
- buyerName2: Second buyer's full name from paragraph 18.1 (if applicable)
- streetAddress: Street address of the property from paragraph 4
- city: City from paragraph 4
- state: State (2-letter abbreviation) from paragraph 4
- zip: ZIP code from paragraph 4
- typeOfLoan: Type of loan (Conventional, FHA, VA, Cash, etc.) from paragraph 5
- lenderName: Name of the lending institution from paragraph 5
- lendingOfficer: Loan officer name from paragraph 5
- lendingOfficerPhone: Loan officer phone from paragraph 5
- lendingOfficerEmail: Loan officer email from paragraph 5
- preApprovalDays: Days for pre-approval from paragraph 5 (number)
- loanAppTimeFrame: Timeframe for loan application from paragraph 5
- loanCommitment: Loan commitment date or timeframe from paragraph 5
- appraisalContingency: Is there an appraisal contingency from paragraph 6? (true/false)
- inspectionDays: Number of days for inspection from paragraph 7 (number only)
- closingDate: Closing date from paragraph 8 (YYYY-MM-DD format if possible)
- possession: Possession terms from paragraph 8 (e.g., "at closing", "30 days after closing")
- respondToOfferBy: Deadline to respond to offer from paragraph 9
- homeWarranty: Home warranty amount from paragraph 10 (number only, 0 if none)
- homeWarrantyCompany: Name of home warranty company from paragraph 10
- appliances: List of included appliances/items from paragraph 11 (comma-separated text)
- remedyPeriodDays: Number of days for remedy period from paragraph 12 (number)
- listingAgentName: Listing agent's name
- listingAgentPhone: Listing agent's phone
- listingAgentEmail: Listing agent's email
- sellerPhone: Seller's phone number
- sellerEmail: Seller's email
- inContract: Date contract was executed/signed (YYYY-MM-DD format if possible)
- finalWalkThrough: Final walk-through date or terms

IMPORTANT: Return ONLY a FLAT JSON object with the field names listed above as top-level keys. Do NOT nest fields under paragraph headers. Example format:
{
  "offerPrice": 350000,
  "deposit": 5000,
  "buyerName1": "John Doe",
  ...
}

Use null for any field not found. Numbers should be plain numbers without formatting.`;

    console.log('Calling AI to extract contract fields...');

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: extractionPrompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Content}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add credits.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      return new Response(JSON.stringify({ error: 'AI processing failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(JSON.stringify({ error: 'No response from AI' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('AI response:', content);

    // Parse the JSON from AI response
    let extractedData;
    try {
      // Remove markdown code blocks if present
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }
      extractedData = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      console.error('Raw content:', content);
      return new Response(JSON.stringify({ 
        error: 'Failed to parse contract data',
        rawContent: content 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Extracted contract data:', extractedData);

    return new Response(JSON.stringify({ 
      success: true, 
      data: extractedData 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error parsing contract:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
