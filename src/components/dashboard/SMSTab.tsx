import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Send, Calendar, Users, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

interface SMSLog {
  id: string;
  phone: string;
  message: string;
  status: string;
  sent_at: string;
}

interface SMSCampaign {
  id: string;
  name: string;
  message_template: string;
  scheduled_for: string | null;
  status: string;
  created_at: string;
}

interface Client {
  id: string;
  first_name: string | null;
  last_name: string | null;
  cell_phone: string | null;
  street_number: string | null;
  street_name: string | null;
}

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
}

const SMSTab = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [quickSMSOpen, setQuickSMSOpen] = useState(false);
  const [recipientType, setRecipientType] = useState<"client" | "lead" | "manual">("manual");
  const [selectedRecipientId, setSelectedRecipientId] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [smsMessage, setSmsMessage] = useState("");
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    message_template: "",
    scheduled_for: "",
  });

  const { data: smsLogs, refetch: refetchLogs } = useQuery({
    queryKey: ["sms-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sms_logs")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as SMSLog[];
    },
  });

  const { data: campaigns } = useQuery({
    queryKey: ["sms-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sms_campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SMSCampaign[];
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["clients-for-sms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, cell_phone, street_number, street_name")
        .not("cell_phone", "is", null)
        .order("last_name");
      if (error) throw error;
      return data as Client[];
    },
  });

  const { data: leads } = useQuery({
    queryKey: ["leads-for-sms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, first_name, last_name, phone")
        .not("phone", "is", null)
        .order("last_name");
      if (error) throw error;
      return data as Lead[];
    },
  });

  const sendSMS = useMutation({
    mutationFn: async ({ to, message, clientId, leadId }: { to: string; message: string; clientId?: string; leadId?: string }) => {
      const { data, error } = await supabase.functions.invoke("send-sms", {
        body: { to, message, clientId, leadId },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast({ title: "SMS Sent", description: "Your message was sent successfully" });
      setQuickSMSOpen(false);
      setSmsMessage("");
      setManualPhone("");
      setSelectedRecipientId("");
      refetchLogs();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send SMS", description: error.message, variant: "destructive" });
    },
  });

  const createCampaign = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase.from("sms_campaigns").insert({
        agent_id: user.id,
        name: campaignForm.name,
        message_template: campaignForm.message_template,
        scheduled_for: campaignForm.scheduled_for || null,
        status: campaignForm.scheduled_for ? "scheduled" : "draft",
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Campaign Created", description: "Your SMS campaign has been saved" });
      setCampaignOpen(false);
      setCampaignForm({ name: "", message_template: "", scheduled_for: "" });
      queryClient.invalidateQueries({ queryKey: ["sms-campaigns"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create campaign", description: error.message, variant: "destructive" });
    },
  });

  const handleSendQuickSMS = () => {
    let phoneNumber = "";
    let clientId: string | undefined;
    let leadId: string | undefined;

    if (recipientType === "manual") {
      phoneNumber = manualPhone;
    } else if (recipientType === "client" && selectedRecipientId) {
      const client = clients?.find(c => c.id === selectedRecipientId);
      phoneNumber = client?.cell_phone || "";
      clientId = client?.id;
    } else if (recipientType === "lead" && selectedRecipientId) {
      const lead = leads?.find(l => l.id === selectedRecipientId);
      phoneNumber = lead?.phone || "";
      leadId = lead?.id;
    }

    if (!phoneNumber) {
      toast({ title: "Missing phone number", description: "Please select a recipient or enter a phone number", variant: "destructive" });
      return;
    }
    if (!smsMessage.trim()) {
      toast({ title: "Missing message", description: "Please enter a message to send", variant: "destructive" });
      return;
    }

    sendSMS.mutate({ to: phoneNumber, message: smsMessage, clientId, leadId });
  };

  const getSelectedRecipientPhone = () => {
    if (recipientType === "client" && selectedRecipientId) {
      const client = clients?.find(c => c.id === selectedRecipientId);
      return client?.cell_phone || "";
    } else if (recipientType === "lead" && selectedRecipientId) {
      const lead = leads?.find(l => l.id === selectedRecipientId);
      return lead?.phone || "";
    }
    return manualPhone;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">SMS Messaging</h3>
          <p className="text-sm text-muted-foreground">Send texts to clients and leads</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={quickSMSOpen} onOpenChange={setQuickSMSOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Phone className="w-4 h-4 mr-2" />
                Quick Text
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Send Quick Text</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Send To</Label>
                  <Select value={recipientType} onValueChange={(v) => { setRecipientType(v as typeof recipientType); setSelectedRecipientId(""); }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Enter Phone Number</SelectItem>
                      <SelectItem value="client">Select Client</SelectItem>
                      <SelectItem value="lead">Select Lead</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {recipientType === "manual" && (
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      placeholder="(555) 123-4567"
                      value={manualPhone}
                      onChange={(e) => setManualPhone(e.target.value)}
                    />
                  </div>
                )}

                {recipientType === "client" && (
                  <div className="space-y-2">
                    <Label>Select Client</Label>
                    <Select value={selectedRecipientId} onValueChange={setSelectedRecipientId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a client" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients?.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.first_name} {client.last_name} - {client.cell_phone}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {recipientType === "lead" && (
                  <div className="space-y-2">
                    <Label>Select Lead</Label>
                    <Select value={selectedRecipientId} onValueChange={setSelectedRecipientId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a lead" />
                      </SelectTrigger>
                      <SelectContent>
                        {leads?.map((lead) => (
                          <SelectItem key={lead.id} value={lead.id}>
                            {lead.first_name} {lead.last_name} - {lead.phone}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    rows={3}
                    placeholder="Type your message..."
                    value={smsMessage}
                    onChange={(e) => setSmsMessage(e.target.value)}
                    maxLength={160}
                  />
                  <p className="text-xs text-muted-foreground text-right">{smsMessage.length}/160</p>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setQuickSMSOpen(false)}>Cancel</Button>
                  <Button onClick={handleSendQuickSMS} disabled={sendSMS.isPending}>
                    <Send className="w-4 h-4 mr-2" />
                    {sendSMS.isPending ? "Sending..." : "Send"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={campaignOpen} onOpenChange={setCampaignOpen}>
            <DialogTrigger asChild>
              <Button>
                <Users className="w-4 h-4 mr-2" />
                New Campaign
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create SMS Campaign</DialogTitle>
              </DialogHeader>
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); createCampaign.mutate(); }}>
                <div className="space-y-2">
                  <Label htmlFor="name">Campaign Name *</Label>
                  <Input
                    id="name"
                    placeholder="Monthly Market Update"
                    value={campaignForm.name}
                    onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="template">Message Template *</Label>
                  <Textarea
                    id="template"
                    rows={4}
                    placeholder="Hi {first_name}, here's your monthly market update..."
                    value={campaignForm.message_template}
                    onChange={(e) => setCampaignForm({ ...campaignForm, message_template: e.target.value })}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Use variables: {"{first_name}"}, {"{last_name}"}, {"{property_address}"}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scheduled">Schedule For (Optional)</Label>
                  <Input
                    id="scheduled"
                    type="datetime-local"
                    value={campaignForm.scheduled_for}
                    onChange={(e) => setCampaignForm({ ...campaignForm, scheduled_for: e.target.value })}
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setCampaignOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createCampaign.isPending}>
                    {createCampaign.isPending ? "Saving..." : "Save Campaign"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm font-semibold mb-3">Campaigns</h4>
          {!campaigns || campaigns.length === 0 ? (
            <div className="border rounded-lg p-8 text-center text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No SMS campaigns yet</p>
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Scheduled</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((campaign) => (
                    <TableRow key={campaign.id}>
                      <TableCell className="font-medium">{campaign.name}</TableCell>
                      <TableCell>
                        <Badge variant={campaign.status === "sent" ? "default" : "outline"}>
                          {campaign.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {campaign.scheduled_for 
                          ? new Date(campaign.scheduled_for).toLocaleDateString()
                          : "Not scheduled"
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-3">SMS History</h4>
          {!smsLogs || smsLogs.length === 0 ? (
            <div className="border rounded-lg p-8 text-center text-muted-foreground">
              <Send className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No SMS history yet</p>
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phone</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {smsLogs.slice(0, 10).map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">{log.phone}</TableCell>
                      <TableCell className="max-w-[150px] truncate text-sm">{log.message}</TableCell>
                      <TableCell>
                        <Badge variant={log.status === "sent" ? "default" : "outline"}>
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(log.sent_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SMSTab;
