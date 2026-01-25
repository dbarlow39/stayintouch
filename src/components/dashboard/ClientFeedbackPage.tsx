import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, User, Phone, Mail, Calendar, MessageSquare, Home, Eye } from "lucide-react";
import { format } from "date-fns";
import logo from "@/assets/logo.jpg";

interface ClientFeedbackPageProps {
  clientId: string;
  onBack: () => void;
}

interface Client {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  cell_phone: string | null;
  home_phone: string | null;
  street_number: string | null;
  street_name: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  mls_id: string | null;
  status: string | null;
  price: number | null;
  showings_to_date: number | null;
  listing_date: string | null;
}

interface ShowingFeedback {
  id: string;
  showing_agent_name: string | null;
  showing_agent_email: string | null;
  showing_agent_phone: string | null;
  showing_date: string | null;
  feedback: string | null;
  buyer_interest_level: string | null;
  created_at: string;
}

const ClientFeedbackPage = ({ clientId, onBack }: ClientFeedbackPageProps) => {
  // Fetch client details
  const { data: client, isLoading: loadingClient } = useQuery({
    queryKey: ["client-detail", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single();
      if (error) throw error;
      return data as Client;
    },
  });

  // Fetch showing feedback for this client
  const { data: feedbackList = [], isLoading: loadingFeedback } = useQuery({
    queryKey: ["client-feedback", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("showing_feedback")
        .select("*")
        .eq("client_id", clientId)
        .order("showing_date", { ascending: false });
      if (error) throw error;
      return data as ShowingFeedback[];
    },
  });

  // Also fetch ShowingTime emails for this client to show as feedback sources
  const { data: emailLogs = [], isLoading: loadingEmails } = useQuery({
    queryKey: ["client-showingtime-emails", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_email_logs")
        .select("*")
        .eq("client_id", clientId)
        .contains("labels", ["ShowingTime"])
        .order("received_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const isLoading = loadingClient || loadingFeedback || loadingEmails;

  // Parse agent info from email snippets
  const parseAgentFromEmail = (subject: string, snippet: string): { name: string | null; phone: string | null; email: string | null } => {
    const result = { name: null as string | null, phone: null as string | null, email: null as string | null };
    
    // Try to extract agent name patterns
    const namePatterns = [
      /(?:from|by|agent)[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
      /([A-Z][a-z]+\s+[A-Z][a-z]+)\s+(?:showed|viewed|feedback)/i,
    ];
    for (const pattern of namePatterns) {
      const match = snippet.match(pattern);
      if (match) {
        result.name = match[1];
        break;
      }
    }

    // Try to extract phone
    const phoneMatch = snippet.match(/(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
    if (phoneMatch) {
      result.phone = phoneMatch[1];
    }

    // Try to extract email
    const emailMatch = snippet.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      result.email = emailMatch[1];
    }

    return result;
  };

  // Combine structured feedback with email-based feedback
  const allFeedback = [
    ...feedbackList.map(f => ({
      id: f.id,
      type: "structured" as const,
      agentName: f.showing_agent_name,
      agentEmail: f.showing_agent_email,
      agentPhone: f.showing_agent_phone,
      date: f.showing_date,
      feedback: f.feedback,
      interestLevel: f.buyer_interest_level,
    })),
    ...emailLogs.map(e => {
      const parsed = parseAgentFromEmail(e.subject || "", e.snippet || "");
      return {
        id: e.id,
        type: "email" as const,
        agentName: parsed.name,
        agentEmail: parsed.email,
        agentPhone: parsed.phone,
        date: e.received_at,
        feedback: e.snippet,
        interestLevel: null,
        subject: e.subject,
      };
    }),
  ].sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateB - dateA;
  });

  const totalShowings = client?.showings_to_date ?? allFeedback.length;

  const formatPhoneLink = (phone: string | null) => {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 10) {
      return (
        <a href={`tel:${digits}`} className="text-primary hover:underline flex items-center gap-1">
          <Phone className="w-3 h-3" />
          {phone}
        </a>
      );
    }
    return <span>{phone}</span>;
  };

  const formatEmailLink = (email: string | null) => {
    if (!email) return null;
    return (
      <a href={`mailto:${email}`} className="text-primary hover:underline flex items-center gap-1">
        <Mail className="w-3 h-3" />
        {email}
      </a>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={onBack} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Clients
        </Button>
        <p className="text-muted-foreground">Client not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Clients
        </Button>
        <img src={logo} alt="Sell for 1 Percent" className="h-10 w-auto" />
      </div>

      {/* Client Information Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Home className="w-5 h-5" />
            Client & Property Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-semibold text-muted-foreground">Client Name</Label>
                <p className="text-lg font-medium">
                  {[client.first_name, client.last_name].filter(Boolean).join(' ') || "—"}
                </p>
              </div>
              <div>
                <Label className="text-sm font-semibold text-muted-foreground">Property Address</Label>
                <p className="text-base">
                  {[client.street_number, client.street_name].filter(Boolean).join(' ') || "—"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {[client.city, [client.state, client.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                </p>
              </div>
              <div className="flex gap-4">
                <div>
                  <Label className="text-sm font-semibold text-muted-foreground">MLS ID</Label>
                  <p className="text-base">{client.mls_id || "—"}</p>
                </div>
                <div>
                  <Label className="text-sm font-semibold text-muted-foreground">Status</Label>
                  <Badge variant={client.status === "A" ? "default" : "secondary"}>
                    {client.status || "—"}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-semibold text-muted-foreground">Price</Label>
                <p className="text-lg font-medium">
                  {client.price ? `$${client.price.toLocaleString()}` : "—"}
                </p>
              </div>
              <div>
                <Label className="text-sm font-semibold text-muted-foreground">Listing Date</Label>
                <p className="text-base">{client.listing_date || "—"}</p>
              </div>
              <div className="flex gap-4">
                {client.email && (
                  <a href={`mailto:${client.email}`} className="text-primary hover:underline text-sm flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    {client.email}
                  </a>
                )}
                {client.cell_phone && (
                  <a href={`tel:${client.cell_phone.replace(/\D/g, '')}`} className="text-primary hover:underline text-sm flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {client.cell_phone}
                  </a>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Showings Summary Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Showing Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-8">
            <div className="text-center">
              <p className="text-4xl font-bold text-primary">{totalShowings}</p>
              <p className="text-sm text-muted-foreground">Total Showings</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold text-primary">{allFeedback.length}</p>
              <p className="text-sm text-muted-foreground">Feedback Received</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feedback List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Showing Feedback ({allFeedback.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allFeedback.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No showing feedback received yet for this property.
            </p>
          ) : (
            <div className="space-y-4">
              {allFeedback.map((item) => (
                <div 
                  key={item.id} 
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">
                        {item.agentName || "Unknown Agent"}
                      </span>
                      {item.interestLevel && (
                        <Badge variant="outline" className="ml-2">
                          {item.interestLevel}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      {item.date ? format(new Date(item.date), "MMM d, yyyy 'at' h:mm a") : "No date"}
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-4 mb-3 text-sm">
                    {item.agentPhone && formatPhoneLink(item.agentPhone)}
                    {item.agentEmail && formatEmailLink(item.agentEmail)}
                  </div>

                  {'subject' in item && item.subject && (
                    <p className="text-sm font-medium text-muted-foreground mb-1">
                      {item.subject}
                    </p>
                  )}
                  
                  <p className="text-sm leading-relaxed">
                    {item.feedback || "No feedback text available."}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ClientFeedbackPage;