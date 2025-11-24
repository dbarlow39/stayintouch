import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Send, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

const SMSTab = () => {
  const { toast } = useToast();
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    message_template: "",
    scheduled_for: "",
  });

  const { data: smsLogs } = useQuery({
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">SMS Campaigns</h3>
          <p className="text-sm text-muted-foreground">Manage SMS communication with your clients</p>
        </div>
        <Dialog open={campaignOpen} onOpenChange={setCampaignOpen}>
          <DialogTrigger asChild>
            <Button>
              <MessageSquare className="w-4 h-4 mr-2" />
              New Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create SMS Campaign</DialogTitle>
            </DialogHeader>
            <form className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Campaign Name *</Label>
                <Input
                  id="name"
                  placeholder="Monthly Market Update"
                  value={campaignForm.name}
                  onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message Template *</Label>
                <Textarea
                  id="message"
                  rows={4}
                  placeholder="Hi {first_name}, here's your monthly market update..."
                  value={campaignForm.message_template}
                  onChange={(e) => setCampaignForm({ ...campaignForm, message_template: e.target.value })}
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
                <Button 
                  type="button"
                  onClick={() => {
                    toast({ 
                      title: "SMS Integration Required", 
                      description: "Configure Twilio integration to send SMS campaigns",
                      variant: "default"
                    });
                  }}
                >
                  Save Campaign
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm font-semibold mb-3">Recent Campaigns</h4>
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
                        <Badge variant="outline">{campaign.status}</Badge>
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
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {smsLogs.slice(0, 10).map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">{log.phone}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.status}</Badge>
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

      <div className="border rounded-lg p-6 bg-muted/30">
        <h4 className="font-semibold mb-2">SMS Integration Setup</h4>
        <p className="text-sm text-muted-foreground mb-4">
          To send SMS campaigns, you'll need to integrate with a SMS service provider like Twilio.
          This allows you to send automated property updates, appointment reminders, and marketing messages.
        </p>
        <Button variant="outline" onClick={() => toast({ title: "Coming Soon", description: "SMS integration setup will be available soon" })}>
          Configure SMS Provider
        </Button>
      </div>
    </div>
  );
};

export default SMSTab;
