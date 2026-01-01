import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Unauthorized: Missing authorization header');
    }
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Use getUser() without token parameter - it will use the Authorization header
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError || !user) {
      console.error('Authentication error:', authError);
      throw new Error('Unauthorized: Invalid token');
    }

    const requestBody = await req.json();
    
    // Support both 'to' and 'client_email' parameter names
    const client_email = requestBody.client_email || requestBody.to;
    const { 
      client_id,
      subject,
      body,
      market_data_id,
      zillow_views,
      zillow_saves,
      zillow_days
    } = requestBody;

    if (!client_email) {
      throw new Error('Client email is required');
    }

    // Fetch agent's profile to get their name for the "from" field
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('first_name, last_name, preferred_email')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('Error fetching agent profile:', profileError);
    }

    // Build the "from" name using agent's profile
    const agentName = profile?.first_name && profile?.last_name 
      ? `${profile.first_name} ${profile.last_name}`
      : profile?.first_name || 'Stay in Touch';

    console.log('Sending email to:', client_email, 'from:', agentName);

    // Convert plain text body to HTML with proper formatting
    const htmlBody = body
      .split('\n\n')
      .map((paragraph: string) => `<p style="margin-bottom: 16px; line-height: 1.6;">${paragraph.replace(/\n/g, '<br>')}</p>`)
      .join('');

    // Use agent's name in the from field with verified subdomain
    const fromEmail = `${agentName} via Stay in Touch <updates@resend.sellfor1percent.com>`;
    
    // Build email options with reply-to for agent responses
    const emailOptions: any = {
      from: fromEmail,
      to: [client_email],
      subject: subject,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Georgia, 'Times New Roman', serif; font-size: 16px; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          ${htmlBody}
        </body>
        </html>
      `,
    };

    // Add reply-to if agent has a preferred email
    if (profile?.preferred_email) {
      emailOptions.reply_to = profile.preferred_email;
    }

    const emailResponse = await resend.emails.send(emailOptions);

    console.log('Email sent successfully:', emailResponse);

    // Log the sent email
    const { error: logError } = await supabaseClient
      .from('weekly_email_logs')
      .insert({
        agent_id: user.id,
        client_id,
        market_data_id,
        subject,
        body,
        zillow_views,
        zillow_saves,
        zillow_days
      });

    if (logError) {
      console.error('Error logging email:', logError);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message_id: emailResponse.data?.id 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error sending email:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
