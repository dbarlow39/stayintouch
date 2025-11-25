import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Upload, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { z } from "zod";

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  notes?: string;
  status?: string;
  mls_id?: string;
  street_number?: string;
  street_name?: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: number;
  home_phone?: string;
  cell_phone?: string;
  listing_date?: string;
  cbs?: string;
  showing_type?: string;
  lock_box?: string;
  combo?: string;
  location?: string;
  special_instructions?: string;
  agent?: string;
}

const clientSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(100, "First name too long"),
  last_name: z.string().trim().min(1, "Last name is required").max(100, "Last name too long"),
  email: z.string().trim().email("Invalid email").max(255, "Email too long"),
  phone: z.string().trim().max(20, "Phone too long").optional().or(z.literal("")),
  notes: z.string().trim().max(1000, "Notes too long").optional().or(z.literal("")),
  status: z.string().trim().max(50).optional().or(z.literal("")),
  mls_id: z.string().trim().max(100).optional().or(z.literal("")),
  street_number: z.string().trim().max(50).optional().or(z.literal("")),
  street_name: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  state: z.string().trim().max(50).optional().or(z.literal("")),
  zip: z.string().trim().max(20).optional().or(z.literal("")),
  price: z.coerce.number().positive().optional().or(z.literal("")),
  home_phone: z.string().trim().max(20).optional().or(z.literal("")),
  cell_phone: z.string().trim().max(20).optional().or(z.literal("")),
  listing_date: z.string().trim().optional().or(z.literal("")),
  cbs: z.string().trim().max(100).optional().or(z.literal("")),
  showing_type: z.string().trim().max(100).optional().or(z.literal("")),
  lock_box: z.string().trim().max(100).optional().or(z.literal("")),
  combo: z.string().trim().max(100).optional().or(z.literal("")),
  location: z.string().trim().max(500).optional().or(z.literal("")),
  special_instructions: z.string().trim().max(1000).optional().or(z.literal("")),
  agent: z.string().trim().max(100).optional().or(z.literal("")),
});

const ClientsTab = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [csvMappingOpen, setCsvMappingOpen] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    notes: "",
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Client[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("clients").insert({
        ...data,
        agent_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client added successfully");
      setOpen(false);
      resetForm();
    },
    onError: () => {
      toast.error("Failed to add client");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase.from("clients").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client updated successfully");
      setOpen(false);
      resetForm();
    },
    onError: () => {
      toast.error("Failed to update client");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client deleted successfully");
    },
    onError: () => {
      toast.error("Failed to delete client");
    },
  });

  const resetForm = () => {
    setFormData({
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      notes: "",
    });
    setEditingClient(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingClient) {
      updateMutation.mutate({ id: editingClient.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setFormData({
      first_name: client.first_name,
      last_name: client.last_name,
      email: client.email,
      phone: client.phone || "",
      notes: client.notes || "",
    });
    setOpen(true);
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const rows = text.split('\n').filter(row => row.trim());
        
        if (rows.length < 2) {
          toast.error("CSV file must have at least a header row and one data row.");
          return;
        }

        // Parse headers and data
        const headers = parseCSVLine(rows[0]).map(h => h.trim());
        const dataRows = rows.slice(1).map(row => parseCSVLine(row));
        
        setCsvHeaders(headers);
        setCsvData(dataRows);
        
        // Auto-map your specific column names
        const autoMapping: Record<string, string> = {};
        headers.forEach(header => {
          const trimmed = header.trim();
          // Map exact CSV headers to database columns
          if (trimmed === 'status') autoMapping[header] = 'status';
          else if (trimmed === 'mls id') autoMapping[header] = 'mls_id';
          else if (trimmed === 'First Name') autoMapping[header] = 'first_name';
          else if (trimmed === 'Last Name') autoMapping[header] = 'last_name';
          else if (trimmed === 'Street #') autoMapping[header] = 'street_number';
          else if (trimmed === 'Street Name') autoMapping[header] = 'street_name';
          else if (trimmed === 'City') autoMapping[header] = 'city';
          else if (trimmed === 'State') autoMapping[header] = 'state';
          else if (trimmed === 'Zip') autoMapping[header] = 'zip';
          else if (trimmed === 'Price') autoMapping[header] = 'price';
          else if (trimmed === 'email') autoMapping[header] = 'email';
          else if (trimmed === 'Home #') autoMapping[header] = 'home_phone';
          else if (trimmed === 'Cell #') autoMapping[header] = 'cell_phone';
          else if (trimmed === 'Listing Date') autoMapping[header] = 'listing_date';
          else if (trimmed === 'cbs') autoMapping[header] = 'cbs';
          else if (trimmed === 'showing type') autoMapping[header] = 'showing_type';
          else if (trimmed === 'lock box') autoMapping[header] = 'lock_box';
          else if (trimmed === 'combo') autoMapping[header] = 'combo';
          else if (trimmed === 'location') autoMapping[header] = 'location';
          else if (trimmed === 'special instructions') autoMapping[header] = 'special_instructions';
          else if (trimmed === 'agent') autoMapping[header] = 'agent';
        });
        
        setColumnMapping(autoMapping);
        setCsvMappingOpen(true);
      } catch (error) {
        toast.error("Failed to parse CSV file.");
      }
    };
    
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    try {
      const validClients: any[] = [];
      const errors: string[] = [];

      csvData.forEach((row, index) => {
        const rawClient: any = {};
        
        csvHeaders.forEach((header, colIndex) => {
          const dbField = columnMapping[header];
          if (dbField && row[colIndex]) {
            rawClient[dbField] = row[colIndex].replace(/^["']|["']$/g, '').trim();
          }
        });

        // Validate with zod schema
        const validation = clientSchema.safeParse(rawClient);
        if (validation.success) {
          validClients.push({ ...validation.data, agent_id: user!.id });
        } else {
          const errorField = validation.error.errors[0].path[0];
          const errorMsg = validation.error.errors[0].message;
          errors.push(`Row ${index + 2} - ${errorField}: ${errorMsg}`);
        }
      });

      if (validClients.length === 0) {
        toast.error(`No valid clients found. ${errors.slice(0, 2).join('; ')}`);
        return;
      }

      // Import to database
      const { error } = await supabase.from("clients").insert(validClients);
      
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setCsvMappingOpen(false);
      
      if (errors.length > 0) {
        toast.success(`Imported ${validClients.length} clients. ${errors.length} rows had errors.`);
      } else {
        toast.success(`Successfully imported ${validClients.length} clients`);
      }
    } catch (error) {
      toast.error("Failed to import clients.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Client Management</h3>
          <p className="text-sm text-muted-foreground">Add and manage your client contacts</p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleCSVImport}
            className="hidden"
          />
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4 mr-2" />
            Import CSV
          </Button>
          <Dialog open={open} onOpenChange={(isOpen) => {
            setOpen(isOpen);
            if (!isOpen) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Client
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingClient ? "Edit Client" : "Add New Client"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">First Name</Label>
                    <Input
                      id="first_name"
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last_name">Last Name</Label>
                    <Input
                      id="last_name"
                      value={formData.last_name}
                      onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone (Optional)</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingClient ? "Update Client" : "Add Client"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* CSV Mapping Dialog */}
      <Dialog open={csvMappingOpen} onOpenChange={setCsvMappingOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Map CSV Columns to Database Fields</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Match your CSV columns to the database fields. Required fields: First Name, Last Name, Email
            </p>
            
            <div className="space-y-3">
              {csvHeaders.map((header) => (
                <div key={header} className="grid grid-cols-3 gap-4 items-center">
                  <Label className="font-medium">{header}</Label>
                  <select
                    value={columnMapping[header] || ""}
                    onChange={(e) => setColumnMapping({ ...columnMapping, [header]: e.target.value })}
                    className="col-span-2 flex h-10 w-full rounded-md border border-input bg-white dark:bg-gray-800 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer z-50"
                  >
                    <option value="" className="bg-white dark:bg-gray-800 text-foreground">-- Don't Import --</option>
                    <option value="first_name" className="bg-white dark:bg-gray-800 text-foreground">First Name</option>
                    <option value="last_name" className="bg-white dark:bg-gray-800 text-foreground">Last Name</option>
                    <option value="email" className="bg-white dark:bg-gray-800 text-foreground">Email</option>
                    <option value="phone" className="bg-white dark:bg-gray-800 text-foreground">Phone</option>
                    <option value="notes" className="bg-white dark:bg-gray-800 text-foreground">Notes</option>
                    <option value="status" className="bg-white dark:bg-gray-800 text-foreground">Status</option>
                    <option value="mls_id" className="bg-white dark:bg-gray-800 text-foreground">MLS ID</option>
                    <option value="street_number" className="bg-white dark:bg-gray-800 text-foreground">Street #</option>
                    <option value="street_name" className="bg-white dark:bg-gray-800 text-foreground">Street Name</option>
                    <option value="city" className="bg-white dark:bg-gray-800 text-foreground">City</option>
                    <option value="state" className="bg-white dark:bg-gray-800 text-foreground">State</option>
                    <option value="zip" className="bg-white dark:bg-gray-800 text-foreground">Zip</option>
                    <option value="price" className="bg-white dark:bg-gray-800 text-foreground">Price</option>
                    <option value="home_phone" className="bg-white dark:bg-gray-800 text-foreground">Home Phone</option>
                    <option value="cell_phone" className="bg-white dark:bg-gray-800 text-foreground">Cell Phone</option>
                    <option value="listing_date" className="bg-white dark:bg-gray-800 text-foreground">Listing Date</option>
                    <option value="cbs" className="bg-white dark:bg-gray-800 text-foreground">CBS</option>
                    <option value="showing_type" className="bg-white dark:bg-gray-800 text-foreground">Showing Type</option>
                    <option value="lock_box" className="bg-white dark:bg-gray-800 text-foreground">Lock Box</option>
                    <option value="combo" className="bg-white dark:bg-gray-800 text-foreground">Combo</option>
                    <option value="location" className="bg-white dark:bg-gray-800 text-foreground">Location</option>
                    <option value="special_instructions" className="bg-white dark:bg-gray-800 text-foreground">Special Instructions</option>
                    <option value="agent" className="bg-white dark:bg-gray-800 text-foreground">Agent</option>
                  </select>
                </div>
              ))}
            </div>

            <div className="border rounded-lg p-4 bg-muted/50">
              <h4 className="font-medium mb-2">Preview (first 3 rows):</h4>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {csvHeaders.map(header => (
                        <TableHead key={header}>{header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvData.slice(0, 3).map((row, idx) => (
                      <TableRow key={idx}>
                        {row.map((cell, cellIdx) => (
                          <TableCell key={cellIdx}>{cell}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCsvMappingOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmImport}>
                Import {csvData.length} Clients
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading clients...</div>
      ) : clients.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <p className="text-muted-foreground mb-2">No clients yet</p>
          <p className="text-sm text-muted-foreground">Add your first client to get started</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>MLS ID</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">
                    {client.first_name} {client.last_name}
                  </TableCell>
                  <TableCell>
                    <select
                      value={(client.status || "").toUpperCase()}
                      onChange={async (e) => {
                        const newStatus = e.target.value;
                        console.log('Updating status from', client.status, 'to', newStatus, 'for client', client.id);
                        try {
                          const { error } = await supabase
                            .from("clients")
                            .update({ status: newStatus })
                            .eq("id", client.id);
                          if (error) throw error;
                          queryClient.invalidateQueries({ queryKey: ["clients"] });
                          toast.success(`Status updated to ${newStatus}`);
                        } catch (error) {
                          console.error('Status update error:', error);
                          toast.error("Failed to update status");
                        }
                      }}
                      className="h-8 w-20 rounded-md border border-input bg-white dark:bg-gray-800 px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                    >
                      <option value="" className="bg-white dark:bg-gray-800 text-foreground">—</option>
                      <option value="A" className="bg-white dark:bg-gray-800 text-foreground">A</option>
                      <option value="C" className="bg-white dark:bg-gray-800 text-foreground">C</option>
                      <option value="E" className="bg-white dark:bg-gray-800 text-foreground">E</option>
                      <option value="W" className="bg-white dark:bg-gray-800 text-foreground">W</option>
                      <option value="T" className="bg-white dark:bg-gray-800 text-foreground">T</option>
                    </select>
                  </TableCell>
                  <TableCell>
                    {client.street_number || client.street_name || client.city ? (
                      <div className="text-sm">
                        {client.street_number} {client.street_name}
                        {client.city && <div className="text-muted-foreground">{client.city}, {client.state}</div>}
                      </div>
                    ) : "—"}
                  </TableCell>
                  <TableCell>{client.email}</TableCell>
                  <TableCell>{client.cell_phone || client.phone || client.home_phone || "—"}</TableCell>
                  <TableCell>{client.mls_id || "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(client)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this client?")) {
                            deleteMutation.mutate(client.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default ClientsTab;
