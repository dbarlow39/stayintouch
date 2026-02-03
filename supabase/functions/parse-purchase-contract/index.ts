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

    const callLovableAI = async (prompt: string, model: string) => {
      const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
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
      return res;
    };

    const extractionPrompt = `You are an expert real estate contract analyzer. Extract the following fields from this purchase contract document and return them as a FLAT JSON object (not nested).

Extract these fields (return null if not found):

- offerPrice: The total purchase/offer price from paragraph 1 (number only, no commas or $). The number may be written numerically (e.g., 350000) or spelled out (e.g., "three hundred fifty thousand") or both - extract the numeric value.
- buyerAgentCommission: The buyer broker compensation percentage from paragraph 1.2 (number only, e.g., 3 for 3%). The number may be written numerically (1, 2, 3) or spelled out (one, two, three) or both - extract the numeric value. Default to 3 if not found.
- deposit: From section 12.1, the Earnest Money Deposit amount (number only, no $ or commas). Default to 0 if not found.
- depositCollection: From section 12.2, there are TWO sets of initial boxes separated by "OR". The structure reads: "Buyer [BOX1][BOX2] (insert initials here) shall deposit ... within 3 banking days of acceptance OR [BOX3][BOX4] (insert initials here) within 3 banking days of expiration of remedy period..."
  * FIRST SET (BOX1+BOX2, BEFORE "OR"): If these boxes have initials/marks → return "Within 3 Days of Acceptance"
  * SECOND SET (BOX3+BOX4, AFTER "OR"): If these boxes have initials/marks → return "Within 3 Days of Remedy Expiration"
  Return the EXACT phrase based on which set has initials/marks. Default to "Within 3 Days of Acceptance" if unclear.
- buyerAgentName: Buyer agent's full name from paragraph 18.1
- buyerAgentPhone: Buyer agent's cell phone number from paragraph 18.1
- buyerAgentEmail: Buyer agent's email address from paragraph 18.1
- buyerName1: First buyer's full name from paragraph 18.1
- buyerName2: Second buyer's full name from paragraph 18.1 (if applicable)
- streetAddress: Street address of the property from paragraph 4
- city: City from paragraph 4
- state: State (2-letter abbreviation) from paragraph 4
- zip: ZIP code from paragraph 4
- typeOfLoan: From section 3.2(b) "Loan Application". Look at line "a)" which spans TWO lines and reads: "make formal application for a (write in type of loan: Conventional, FHA, VA, USDA) _____ loan". The type of loan is HANDWRITTEN or TYPED on the blank line that appears AFTER the parenthetical instruction and BEFORE the word "loan". Common values: "conventional", "FHA", "VA", "USDA", "Cash". If blank or unreadable, default to "Conventional".
- loanAppTimeFrame: From section 3.2(b) "Loan Application", line "(i)" which reads "Within ___ calendar days, (if left blank, the number of calendar days shall be 7)...". Extract the handwritten/typed NUMBER from the blank line. If blank, return 7. This is the number of days for the buyer to submit a formal loan application.
- preApprovalDays: From section 3.2(a) "Lender Pre-Qualification". The clause reads: "Buyer [BOX1][BOX2] (insert initials here) has delivered OR [BOX3][BOX4] (insert initials here) shall deliver within ___ calendar days..."
  * FIRST SET (BOX1+BOX2, BEFORE "OR"): If these boxes have initials/marks → the pre-approval letter has been RECEIVED → return 0.
  * SECOND SET (BOX3+BOX4, AFTER "OR"): If these boxes have initials/marks → extract the number from the blank line after "within". If blank, return 2.
  Return the number of days (0 if received, or the number of days if pending). Default to 2 if unclear.
- loanCommitment: Loan commitment date or timeframe from paragraph 5 (3.2c)
- appraisalContingency: From section 3.2(d), find the appraisal contingency checkboxes. There are TWO checkboxes in the pattern "[ ] is [ ] is not contingent". Look carefully at WHICH box has a mark (X, ✓, filled, or any mark). If the FIRST checkbox (the one immediately before the word "is") has ANY mark in it, return true. If the SECOND checkbox (the one before "is not") has a mark, return false. The first box being checked means the buyer WANTS the appraisal contingency protection. CRITICAL: Examine both boxes carefully - only ONE should be marked. First box marked = true, second box marked = false.
- inspectionDays: Number of days for inspection from paragraph 7 (number only)
- closingDate: Closing date from paragraph 8 (YYYY-MM-DD format if possible)
- possession: Possession terms from paragraph 8 (15.3). If a specific date/time is given, use that. If the language says "at closing", "at time of closing", "upon closing", or similar, return that exact phrase instead of a date.
- respondToOfferBy: Deadline to respond to offer from paragraph 9 (16). Include BOTH the date AND time if specified (e.g., "2026-02-03 04:00 PM" or "February 3, 2026 at 4:00 PM"). This is critical for contract deadlines.
- homeWarranty: Home warranty amount from paragraph 10 (number only, 0 if none)
- homeWarrantyCompany: Name of home warranty company from paragraph 10
- appliances: List of included appliances/items from paragraph 11 (comma-separated text)
- remedyPeriodDays: Number of days for remedy period from paragraph 12 (number)
- listingAgentName: Listing agent's name
- listingAgentPhone: Listing agent's phone
- listingAgentEmail: Listing agent's email
- sellerPhone: Seller's phone number
- sellerEmail: Seller's email
- finalWalkThrough: Final walk-through date or terms

NOTE: Do NOT extract lender information (lenderName, lendingOfficer, lendingOfficerPhone, lendingOfficerEmail) - that comes from pre-approval letters, not contracts.

IMPORTANT: Return ONLY a FLAT JSON object with the field names listed above as top-level keys. Do NOT nest fields under paragraph headers. Example format:
{
  "offerPrice": 350000,
  "deposit": 5000,
  "buyerName1": "John Doe",
  ...
}

Use null for any field not found. Numbers should be plain numbers without formatting.`;

    console.log('Calling AI to extract contract fields...');

    const aiResponse = await callLovableAI(extractionPrompt, 'google/gemini-2.5-flash');

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

    // Second pass: Appraisal Contingency is frequently missed/misread.
    // Run a focused extraction using a higher-accuracy model and override the first-pass value.
    try {
      const appraisalPrompt = `You are validating ONE field in a real estate purchase contract.

TASK:
Determine the Appraisal Contingency value for section 3.2(d).

RULES:
- There are two checkboxes in the pattern: "[ ] is [ ] is not contingent" (or similar).
- If the FIRST checkbox (before the word "is") has ANY mark (X, ✓, filled, etc.), appraisalContingency = true.
- If the SECOND checkbox (before the words "is not") has ANY mark, appraisalContingency = false.
- Do NOT guess. If you cannot clearly see which box is marked, return null.

Return ONLY valid JSON:
{ "appraisalContingency": true | false | null }`;

      console.log('Calling AI (2nd pass) to extract appraisal contingency...');
      const appraisalRes = await callLovableAI(appraisalPrompt, 'google/gemini-2.5-pro');

      if (appraisalRes.ok) {
        const appraisalJson = await appraisalRes.json();
        const appraisalContent = appraisalJson.choices?.[0]?.message?.content;
        if (appraisalContent) {
          let jsonStr = String(appraisalContent).trim();
          if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
          else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
          if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);

          const parsed = JSON.parse(jsonStr.trim());
          const ac = parsed?.appraisalContingency;
          if (ac === true || ac === false) {
            extractedData.appraisalContingency = ac;
            console.log('Appraisal contingency overridden by 2nd pass:', ac);
          } else {
            console.log('2nd pass appraisal contingency returned null/invalid; keeping first pass value');
          }
        }
      } else {
        const t = await appraisalRes.text();
        console.error('2nd pass appraisal contingency AI error:', appraisalRes.status, t);
      }
    } catch (e) {
      console.error('2nd pass appraisal contingency extraction failed:', e);
      // Keep the first pass value
    }

    // Third pass: Pre-Approval Days 3.2(a) - complex checkbox logic
    try {
      const preApprovalPrompt = `You are validating ONE field in a real estate purchase contract.

TASK:
Determine the preApprovalDays value from section 3.2(a) "Lender Pre-Qualification".

VISUAL STRUCTURE (read left to right):
The clause reads: "Buyer [BOX1][BOX2] (insert initials here) has delivered OR [BOX3][BOX4] (insert initials here) shall deliver within ___ calendar days..."

- FIRST SET = BOX1 + BOX2 (immediately after the word "Buyer", BEFORE the word "OR")
- SECOND SET = BOX3 + BOX4 (AFTER the word "OR", before "shall deliver")
- DAYS FIELD = the handwritten/typed number in the blank line AFTER "within" and BEFORE "calendar days"

DECISION RULES:
1. If the FIRST SET (BOX1+BOX2) contains initials, handwriting, or any marks → return 0 (meaning "Received").
2. If the SECOND SET (BOX3+BOX4) contains initials, handwriting, or any marks → read the number in the DAYS FIELD and return that number. If the days field is blank or unreadable, return 2 (the contract default).
3. If BOTH sets appear marked or you cannot determine which is marked, return 2.

Return ONLY valid JSON:
{ "preApprovalDays": <number> }`;

      console.log('Calling AI (3rd pass) to extract preApprovalDays...');
      const preApprovalRes = await callLovableAI(preApprovalPrompt, 'google/gemini-2.5-pro');

      if (preApprovalRes.ok) {
        const preApprovalJson = await preApprovalRes.json();
        const preApprovalContent = preApprovalJson.choices?.[0]?.message?.content;
        if (preApprovalContent) {
          let jsonStr = String(preApprovalContent).trim();
          if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
          else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
          if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);

          const parsed = JSON.parse(jsonStr.trim());
          const days = parsed?.preApprovalDays;
          if (typeof days === 'number' && days >= 0) {
            extractedData.preApprovalDays = days;
            console.log('preApprovalDays overridden by 3rd pass:', days);
          } else {
            console.log('3rd pass preApprovalDays returned invalid; keeping first pass value');
          }
        }
      } else {
        const t = await preApprovalRes.text();
        console.error('3rd pass preApprovalDays AI error:', preApprovalRes.status, t);
      }
    } catch (e) {
      console.error('3rd pass preApprovalDays extraction failed:', e);
      // Keep the first pass value
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
