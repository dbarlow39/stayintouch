import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, User, Phone, Mail, Calendar, MessageSquare, Home, Eye } from "lucide-react";
import PhoneCallTextLink from "@/components/PhoneCallTextLink";
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

  const isLoading = loadingClient || loadingFeedback;

  // Use only structured feedback from showing_feedback table
  const allFeedback = feedbackList.map(f => ({
      id: f.id,
      agentName: f.showing_agent_name,
      agentEmail: f.showing_agent_email,
      agentPhone: f.showing_agent_phone,
      date: f.showing_date,
      feedback: f.feedback,
      interestLevel: f.buyer_interest_level,
    })).sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateB - dateA;
  });

  // Use the extracted showings_to_date from the client record
  const totalShowings = client?.showings_to_date || 0;

  const formatPhoneLink = (phone: string | null) => {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 10) {
      return (
        <PhoneCallTextLink phone={phone} inline className="flex items-center gap-1">
          <Phone className="w-3 h-3" />
          {phone}
        </PhoneCallTextLink>
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
              {client.cell_phone && (
                <div>
                  <PhoneCallTextLink phone={client.cell_phone} inline className="text-sm flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {client.cell_phone}
                  </PhoneCallTextLink>
                </div>
              )}
              {client.email && (
                <div>
                  <a href={`mailto:${client.email}`} className="text-primary hover:underline text-sm flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    {client.email}
                  </a>
                </div>
              )}
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
                  className="border rounded-lg p-5 hover:bg-muted/50 transition-colors space-y-4"
                >
                  {/* Header with Agent and Date */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="font-semibold text-base">
                          {item.agentName || "Unknown Agent"}
                        </span>
                        {item.interestLevel && (
                          <Badge 
                            variant="outline" 
                            className={
                              item.interestLevel.toLowerCase().includes('very') ? 'border-green-500 text-green-700 bg-green-50' :
                              item.interestLevel.toLowerCase().includes('somewhat') ? 'border-yellow-500 text-yellow-700 bg-yellow-50' :
                              item.interestLevel.toLowerCase().includes('not') ? 'border-red-500 text-red-700 bg-red-50' :
                              'border-muted-foreground'
                            }
                          >
                            {item.interestLevel}
                          </Badge>
                        )}
                      </div>
                      {/* Agent Contact Info */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm ml-6">
                        {item.agentPhone && formatPhoneLink(item.agentPhone)}
                        {item.agentEmail && formatEmailLink(item.agentEmail)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      {item.date ? format(new Date(item.date), "MMM d, yyyy 'at' h:mm a") : "No date"}
                    </div>
                  </div>
                  
                  {/* Feedback Content */}
                  <div className="text-sm leading-relaxed whitespace-pre-line pl-6 border-l-2 border-muted">
                    {item.feedback || "No feedback text available."}
                  </div>
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