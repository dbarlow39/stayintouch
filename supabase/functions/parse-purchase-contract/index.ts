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

    // Convert file to base64 for AI processing
    const arrayBuffer = await fileData.arrayBuffer();
    const base64Content = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const mimeType = fileData.type || 'application/pdf';

    // Use Lovable AI to extract contract fields
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const extractionPrompt = `You are an expert real estate contract analyzer. Extract the following fields from this purchase contract document. The contract typically has numbered paragraphs that correspond to specific terms.

Look for and extract these fields (return null if not found):

PARAGRAPH 1 - PURCHASE PRICE:
- offerPrice: The total purchase/offer price (number only, no commas or $)

PARAGRAPH 2 - EARNEST MONEY/DEPOSIT:
- deposit: The earnest money deposit amount (number only)
- depositCollection: When/how the deposit is collected (text description)

PARAGRAPH 3 - BUYER INFORMATION:
- buyerName1: First buyer's full name
- buyerName2: Second buyer's full name (if applicable)

PARAGRAPH 4 - PROPERTY ADDRESS:
- streetAddress: Street address of the property
- city: City
- state: State (2-letter abbreviation)
- zip: ZIP code

PARAGRAPH 5 - FINANCING/LOAN:
- typeOfLoan: Type of loan (Conventional, FHA, VA, Cash, etc.)
- lenderName: Name of the lending institution
- lendingOfficer: Loan officer name
- lendingOfficerPhone: Loan officer phone
- lendingOfficerEmail: Loan officer email
- preApprovalDays: Days for pre-approval (number)
- loanAppTimeFrame: Timeframe for loan application
- loanCommitment: Loan commitment date or timeframe

PARAGRAPH 6 - APPRAISAL:
- appraisalContingency: Is there an appraisal contingency? (true/false)

PARAGRAPH 7 - INSPECTION:
- inspectionDays: Number of days for inspection (number only)

PARAGRAPH 8 - CLOSING:
- closingDate: Closing date (YYYY-MM-DD format if possible)
- possession: Possession terms (e.g., "at closing", "30 days after closing")

PARAGRAPH 9 - RESPONSE DEADLINE:
- respondToOfferBy: Deadline to respond to offer

PARAGRAPH 10 - HOME WARRANTY:
- homeWarranty: Home warranty amount (number only, 0 if none)
- homeWarrantyCompany: Name of home warranty company

PARAGRAPH 11 - APPLIANCES/INCLUSIONS:
- appliances: List of included appliances/items (comma-separated text)

PARAGRAPH 12 - REMEDY PERIOD:
- remedyPeriodDays: Number of days for remedy period (number)

AGENT INFORMATION (usually at the end):
- listingAgentName: Listing agent's name
- listingAgentPhone: Listing agent's phone
- listingAgentEmail: Listing agent's email

SELLER INFORMATION:
- sellerPhone: Seller's phone number
- sellerEmail: Seller's email

OTHER DATES:
- inContract: Date contract was executed/signed
- finalWalkThrough: Final walk-through date or terms

Return ONLY a valid JSON object with these exact field names. Use null for any field not found in the document. Numbers should be plain numbers without formatting.`;

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
