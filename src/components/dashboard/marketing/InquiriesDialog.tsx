import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Inbox, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ListingInquiry {
  id: string;
  created_at: string;
  property_street: string | null;
  mls_id: string | null;
  listing_agent_name: string | null;
  listing_agent_email: string | null;
  inquirer_name: string;
  inquirer_phone: string | null;
  inquirer_email: string | null;
  requested_date: string | null;
  inquirer_ip: string | null;
}

interface InquiriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const InquiriesDialog = ({ open, onOpenChange }: InquiriesDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [inquiries, setInquiries] = useState<ListingInquiry[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('listing_inquiries' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      setInquiries((data as unknown as ListingInquiry[]) || []);
    } catch (err: any) {
      console.error('Failed to load inquiries', err);
      toast.error('Could not load inquiries (admin access required).');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Inbox className="w-5 h-5 text-primary" />
            Listing Inquiries
            <span className="text-sm font-normal text-muted-foreground">({inquiries.length})</span>
            <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="ml-auto">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-auto flex-1">
          {loading && inquiries.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : inquiries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No inquiries yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background border-b border-border">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Submitted</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Property</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Listing Agent</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Name</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Phone</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Email</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Requested</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">IP</th>
                </tr>
              </thead>
              <tbody>
                {inquiries.map((inq) => (
                  <tr key={inq.id} className="border-b border-border/50 hover:bg-muted/40">
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {new Date(inq.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">{inq.property_street || '—'}</td>
                    <td className="px-3 py-2">{inq.listing_agent_name || '—'}</td>
                    <td className="px-3 py-2 font-medium">{inq.inquirer_name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {inq.inquirer_phone ? (
                        <a href={`tel:${inq.inquirer_phone}`} className="text-primary hover:underline">
                          {inq.inquirer_phone}
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {inq.inquirer_email ? (
                        <a href={`mailto:${inq.inquirer_email}`} className="text-primary hover:underline">
                          {inq.inquirer_email}
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{inq.requested_date || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{inq.inquirer_ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InquiriesDialog;
