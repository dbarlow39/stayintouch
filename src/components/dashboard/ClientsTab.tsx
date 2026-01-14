import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Upload, Pencil, Trash2, Filter, CalendarIcon, FileUp } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { z } from "zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parse } from "date-fns";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.jpg";
import { InventoryImportDialog } from "./InventoryImportDialog";

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
  zillow_link?: string;
  showings_to_date?: number;
  days_on_market?: number;
}

const clientSchema = z.object({
  first_name: z.string().trim().max(100).optional().or(z.literal("")).or(z.null()),
  last_name: z.string().trim().max(100).optional().or(z.literal("")).or(z.null()),
  email: z.string().trim().max(500).optional().or(z.literal("")).or(z.null()),
  phone: z.string().trim().max(100).optional().or(z.literal("")).or(z.null()),
  notes: z.string().trim().max(1000).optional().or(z.literal("")).or(z.null()),
  status: z.string().trim().max(50).optional().or(z.literal("")).or(z.null()),
  mls_id: z.string().trim().max(100).optional().or(z.literal("")).or(z.null()),
  street_number: z.string().trim().max(50).optional().or(z.literal("")).or(z.null()),
  street_name: z.string().trim().max(200).optional().or(z.literal("")).or(z.null()),
  city: z.string().trim().max(100).optional().or(z.literal("")).or(z.null()),
  state: z.string().trim().max(50).optional().or(z.literal("")).or(z.null()),
  zip: z.string().trim().max(20).optional().or(z.literal("")).or(z.null()),
  price: z.union([z.number(), z.string(), z.null()]).optional(),
  home_phone: z.string().trim().max(100).optional().or(z.literal("")).or(z.null()),
  cell_phone: z.string().trim().max(200).optional().or(z.literal("")).or(z.null()),
  listing_date: z.string().trim().optional().or(z.literal("")).or(z.null()),
  cbs: z.string().trim().max(100).optional().or(z.literal("")).or(z.null()),
  showing_type: z.string().trim().max(100).optional().or(z.literal("")).or(z.null()),
  lock_box: z.string().trim().max(100).optional().or(z.literal("")).or(z.null()),
  combo: z.string().trim().max(100).optional().or(z.literal("")).or(z.null()),
  location: z.string().trim().max(500).optional().or(z.literal("")).or(z.null()),
  special_instructions: z.string().trim().max(1000).optional().or(z.literal("")).or(z.null()),
  agent: z.string().trim().max(100).optional().or(z.literal("")).or(z.null()),
  zillow_link: z.string().trim().max(500).optional().or(z.literal("")).or(z.null()),
});

// Format phone number with dashes (XXX-XXX-XXXX)
const formatPhoneNumber = (value: string): string => {
  // Remove all non-digits
  const digits = value.replace(/\D/g, '');
  
  // Format based on length
  if (digits.length <= 3) {
    return digits;
  } else if (digits.length <= 6) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  } else {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }
};

const ClientsTab = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [csvMappingOpen, setCsvMappingOpen] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<string>("A");
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    notes: "",
    status: "",
    street_number: "",
    street_name: "",
    city: "",
    state: "",
    zip: "",
    price: "",
    cell_phone: "",
    home_phone: "",
    mls_id: "",
    listing_date: "",
    cbs: "4991270",
    showing_type: "",
    lock_box: "",
    combo: "",
    location: "Front Door",
    special_instructions: "",
    agent: "",
    zillow_link: "",
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("clients")
        .select("*");
      
      if (statusFilter !== "all") {
        query = query.ilike("status", statusFilter);
      }
      
      query = query.order("street_name", { ascending: true, nullsFirst: false });
      
      const { data, error } = await query;
      if (error) throw error;
      return data as Client[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const submitData: any = {
        ...data,
        agent_id: user!.id,
      };
      
      // Convert price to number if it exists, otherwise set to null
      if (submitData.price && submitData.price !== '') {
        submitData.price = parseFloat(submitData.price);
      } else {
        submitData.price = null;
      }
      
      const { error } = await supabase.from("clients").insert(submitData);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["clients-count"] });
      queryClient.invalidateQueries({ queryKey: ["active-clients-count"] });
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
      const submitData: any = { ...data };
      
      // Convert price to number if it exists, otherwise set to null
      if (submitData.price && submitData.price !== '') {
        submitData.price = parseFloat(submitData.price);
      } else {
        submitData.price = null;
      }
      
      const { error } = await supabase.from("clients").update(submitData).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["clients-count"] });
      queryClient.invalidateQueries({ queryKey: ["active-clients-count"] });
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
      queryClient.invalidateQueries({ queryKey: ["clients-count"] });
      queryClient.invalidateQueries({ queryKey: ["active-clients-count"] });
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
      status: "",
      street_number: "",
      street_name: "",
      city: "",
      state: "",
      zip: "",
      price: "",
      cell_phone: "",
      home_phone: "",
      mls_id: "",
      listing_date: "",
      cbs: "4991270",
      showing_type: "",
      lock_box: "",
      combo: "",
      location: "Front Door",
      special_instructions: "",
      agent: "",
      zillow_link: "",
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
      status: client.status || "",
      street_number: client.street_number || "",
      street_name: client.street_name || "",
      city: client.city || "",
      state: client.state || "",
      zip: client.zip || "",
      price: client.price?.toString() || "",
      cell_phone: client.cell_phone || "",
      home_phone: client.home_phone || "",
      mls_id: client.mls_id || "",
      listing_date: client.listing_date || "",
      cbs: client.cbs || "",
      showing_type: client.showing_type || "",
      lock_box: client.lock_box || "",
      combo: client.combo || "",
      location: client.location || "",
      special_instructions: client.special_instructions || "",
      agent: client.agent || "",
      zillow_link: client.zillow_link || "",
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

      console.log('Starting CSV import, total rows:', csvData.length);

      csvData.forEach((row, index) => {
        const rawClient: any = {};
        
        csvHeaders.forEach((header, colIndex) => {
          const dbField = columnMapping[header];
          if (dbField && row[colIndex]) {
            let value = row[colIndex].replace(/^["']|["']$/g, '').trim();
            
            // Handle price conversion
            if (dbField === 'price' && value) {
              // Remove currency symbols and commas
              value = value.replace(/[$,]/g, '');
              // Convert to number if valid
              const numValue = parseFloat(value);
              rawClient[dbField] = !isNaN(numValue) ? numValue : null;
            } else {
              rawClient[dbField] = value || null;
            }
          }
        });

        // Skip completely empty rows
        const hasAnyData = Object.values(rawClient).some(v => v && String(v).trim() !== '');
        if (!hasAnyData) {
          console.log(`Row ${index + 2} skipped - completely empty`);
          return;
        }

        // Validate with zod schema
        const validation = clientSchema.safeParse(rawClient);
        if (validation.success) {
          validClients.push({ ...validation.data, agent_id: user!.id });
        } else {
          const allErrors = validation.error.errors.map(e => `${e.path[0]}: ${e.message}`).join(', ');
          errors.push(`Row ${index + 2} - ${allErrors}`);
          console.log(`Row ${index + 2} validation failed:`, allErrors, 'Data:', rawClient);
        }
      });

      console.log('Valid clients:', validClients.length, 'Errors:', errors.length);

      if (validClients.length === 0) {
        const errorSummary = errors.slice(0, 5).join('\n');
        toast.error(`No valid clients found. First errors:\n${errorSummary}`, { duration: 10000 });
        console.log('All errors:', errors);
        return;
      }

      // Import to database in batches to avoid timeout
      const batchSize = 100;
      let imported = 0;
      
      for (let i = 0; i < validClients.length; i += batchSize) {
        const batch = validClients.slice(i, i + batchSize);
        const { error } = await supabase.from("clients").insert(batch);
        if (error) {
          console.error('Batch import error:', error);
          throw error;
        }
        imported += batch.length;
        console.log(`Imported batch ${i / batchSize + 1}, total: ${imported}/${validClients.length}`);
      }
      
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["clients-count"] });
      queryClient.invalidateQueries({ queryKey: ["active-clients-count"] });
      setCsvMappingOpen(false);
      
      if (errors.length > 0) {
        toast.success(`Imported ${validClients.length} clients. ${errors.length} rows had validation errors.`, { duration: 8000 });
        console.log('Import complete with errors:', errors);
      } else {
        toast.success(`Successfully imported ${validClients.length} clients!`);
      }
    } catch (error) {
      console.error('Import failed:', error);
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      toast.error(`Failed to import clients: ${errorMessage}`, { duration: 10000 });
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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="all">All Clients</SelectItem>
              <SelectItem value="A">Active</SelectItem>
              <SelectItem value="C">Closed</SelectItem>
              <SelectItem value="E">Expired</SelectItem>
              <SelectItem value="W">Withdrawn</SelectItem>
              <SelectItem value="T">Temp Off Market</SelectItem>
            </SelectContent>
          </Select>
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
          <InventoryImportDialog 
            trigger={
              <Button variant="outline" size="sm">
                <FileUp className="w-4 h-4 mr-2" />
                Import Inventory
              </Button>
            }
          />
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
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingClient ? "Edit Client" : "Add New Client"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        <SelectItem value="A">Active (A)</SelectItem>
                        <SelectItem value="C">Closed (C)</SelectItem>
                        <SelectItem value="E">Expired (E)</SelectItem>
                        <SelectItem value="W">Withdrawn (W)</SelectItem>
                        <SelectItem value="T">Temp Off Market (T)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mls_id">MLS ID</Label>
                    <Input
                      id="mls_id"
                      value={formData.mls_id}
                      onChange={(e) => setFormData({ ...formData, mls_id: e.target.value })}
                    />
                  </div>
                </div>
                
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">Contact Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="first_name">First Name</Label>
                      <Input
                        id="first_name"
                        value={formData.first_name}
                        onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="last_name">Last Name</Label>
                      <Input
                        id="last_name"
                        value={formData.last_name}
                        onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2 mt-4">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="text"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@example.com or email1@example.com, email2@example.com"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="space-y-2">
                      <Label htmlFor="home_phone">Home Phone</Label>
                      <Input
                        id="home_phone"
                        type="tel"
                        value={formData.home_phone}
                        onChange={(e) => setFormData({ ...formData, home_phone: formatPhoneNumber(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cell_phone">Cell Phone</Label>
                      <Input
                        id="cell_phone"
                        type="tel"
                        value={formData.cell_phone}
                        onChange={(e) => setFormData({ ...formData, cell_phone: formatPhoneNumber(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">Property Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="street_number">Street #</Label>
                      <Input
                        id="street_number"
                        value={formData.street_number}
                        onChange={(e) => setFormData({ ...formData, street_number: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="street_name">Street Name</Label>
                      <Input
                        id="street_name"
                        value={formData.street_name}
                        onChange={(e) => setFormData({ ...formData, street_name: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">State</Label>
                      <Input
                        id="state"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="zip">Zip</Label>
                      <Input
                        id="zip"
                        value={formData.zip}
                        onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="space-y-2">
                      <Label htmlFor="price">Price</Label>
                      <Input
                        id="price"
                        type="number"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="listing_date">Listing Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !formData.listing_date && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {formData.listing_date ? formData.listing_date : <span>Pick a date</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={formData.listing_date ? parse(formData.listing_date, "MM/dd/yyyy", new Date()) : undefined}
                            onSelect={(date) => setFormData({ ...formData, listing_date: date ? format(date, "MM/dd/yyyy") : "" })}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">Showing Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="showing_type">Showing Type</Label>
                      <Select
                        value={formData.showing_type}
                        onValueChange={(value) => setFormData({ ...formData, showing_type: value })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select showing type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Go and Show">Go and Show</SelectItem>
                          <SelectItem value="Courtesy Call">Courtesy Call</SelectItem>
                          <SelectItem value="Confirmation Needed">Confirmation Needed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cbs">CBS</Label>
                      <Input
                        id="cbs"
                        value={formData.cbs}
                        onChange={(e) => setFormData({ ...formData, cbs: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="space-y-2">
                      <Label htmlFor="lock_box">Lock Box Type</Label>
                      <Select
                        value={formData.lock_box}
                        onValueChange={(value) => setFormData({ ...formData, lock_box: value })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select lock box type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Supra">Supra</SelectItem>
                          <SelectItem value="Combination">Combination</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="combo">Combo</Label>
                      <Input
                        id="combo"
                        value={formData.combo}
                        onChange={(e) => setFormData({ ...formData, combo: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2 mt-4">
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2 mt-4">
                    <Label htmlFor="zillow_link">Zillow Link</Label>
                    <Input
                      id="zillow_link"
                      value={formData.zillow_link}
                      onChange={(e) => setFormData({ ...formData, zillow_link: e.target.value })}
                    />
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="agent">Agent</Label>
                    <Select
                      value={formData.agent}
                      onValueChange={(value) => setFormData({ ...formData, agent: value })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select agent" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Dave Barlow">Dave Barlow</SelectItem>
                        <SelectItem value="Jaysen Barlow">Jaysen Barlow</SelectItem>
                        <SelectItem value="Jaime Barlow">Jaime Barlow</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 mt-4">
                    <Label htmlFor="special_instructions">Special Instructions</Label>
                    <Textarea
                      id="special_instructions"
                      value={formData.special_instructions}
                      onChange={(e) => setFormData({ ...formData, special_instructions: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2 mt-4">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                    />
                  </div>
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
        <div className="border border-border rounded-lg overflow-auto max-h-[600px]">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="w-20">Status</TableHead>
                <TableHead>First Name</TableHead>
                <TableHead>Last Name</TableHead>
                <TableHead>Street #</TableHead>
                <TableHead>Street Name</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Cell #</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow 
                  key={client.id}
                  onClick={() => setViewingClient(client)}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell>
                    <select
                      value={(client.status || "").toUpperCase()}
                      onChange={async (e) => {
                        const newStatus = e.target.value;
                        try {
                          const { error } = await supabase
                            .from("clients")
                            .update({ status: newStatus })
                            .eq("id", client.id);
                          if (error) throw error;
                          queryClient.invalidateQueries({ queryKey: ["clients"] });
                          queryClient.invalidateQueries({ queryKey: ["clients-count"] });
                          queryClient.invalidateQueries({ queryKey: ["active-clients-count"] });
                          toast.success(`Status updated to ${newStatus}`);
                        } catch (error) {
                          console.error('Status update error:', error);
                          toast.error("Failed to update status");
                        }
                      }}
                      className="h-8 w-16 rounded-md border border-input bg-white dark:bg-gray-800 px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                    >
                      <option value="" className="bg-white dark:bg-gray-800 text-foreground">—</option>
                      <option value="A" className="bg-white dark:bg-gray-800 text-foreground">A</option>
                      <option value="C" className="bg-white dark:bg-gray-800 text-foreground">C</option>
                      <option value="E" className="bg-white dark:bg-gray-800 text-foreground">E</option>
                      <option value="W" className="bg-white dark:bg-gray-800 text-foreground">W</option>
                      <option value="T" className="bg-white dark:bg-gray-800 text-foreground">T</option>
                    </select>
                  </TableCell>
                  <TableCell>{client.first_name || "—"}</TableCell>
                  <TableCell>{client.last_name || "—"}</TableCell>
                  <TableCell>{client.street_number || "—"}</TableCell>
                  <TableCell>{client.street_name || "—"}</TableCell>
                  <TableCell>{client.price ? `$${client.price}` : "—"}</TableCell>
                  <TableCell>
                    {client.cell_phone ? (
                      (() => {
                        const phoneMatch = client.cell_phone.match(/[\d\s\-\(\)\.]+/);
                        const hasLetters = /[a-zA-Z]/.test(client.cell_phone);
                        const hasDigits = /\d/.test(client.cell_phone);
                        
                        if (hasDigits && phoneMatch) {
                          const phoneNumber = phoneMatch[0].trim();
                          if (hasLetters) {
                            // Has both name and number - split them
                            const parts = client.cell_phone.split(phoneNumber);
                            return (
                              <span>
                                {parts[0]}
                                <a 
                                  href={`tel:${phoneNumber}`}
                                  className="text-primary hover:underline"
                                >
                                  {phoneNumber}
                                </a>
                                {parts[1]}
                              </span>
                            );
                          } else {
                            // Only number - make it all clickable
                            return (
                              <a 
                                href={`tel:${phoneNumber}`}
                                className="text-primary hover:underline"
                              >
                                {client.cell_phone}
                              </a>
                            );
                          }
                        }
                        return <span>{client.cell_phone}</span>;
                      })()
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {client.email ? (
                      <a 
                        href={`mailto:${client.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-primary hover:underline"
                      >
                        {client.email}
                      </a>
                    ) : "—"}
                  </TableCell>
                  <TableCell>{client.cell_phone || "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(client);
                        }}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
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

      {/* Client Detail View Dialog */}
      <Dialog open={!!viewingClient} onOpenChange={() => setViewingClient(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center space-x-3 mb-2">
              <img src={logo} alt="Sell for 1 Percent" className="h-10 w-auto" />
              <DialogTitle>Client Details</DialogTitle>
            </div>
          </DialogHeader>
          {viewingClient && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-semibold text-muted-foreground">Status</Label>
                  <p className="text-base">{viewingClient.status?.toUpperCase() || "—"}</p>
                </div>
                <div>
                  <Label className="text-sm font-semibold text-muted-foreground">MLS ID</Label>
                  <p className="text-base">{viewingClient.mls_id || "—"}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Contact Information</h3>
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-semibold text-muted-foreground">Name</Label>
                    <p className="text-base">{[viewingClient.first_name, viewingClient.last_name].filter(Boolean).join(' ') || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-muted-foreground">Email</Label>
                    {viewingClient.email ? (
                      <a 
                        href={`mailto:${viewingClient.email}`}
                        className="text-base text-primary hover:underline break-all block"
                      >
                        {viewingClient.email}
                      </a>
                    ) : (
                      <p className="text-base">—</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-semibold text-muted-foreground">Home Phone</Label>
                      {viewingClient.home_phone ? (
                        (() => {
                          const phoneMatch = viewingClient.home_phone.match(/[\d\s\-\(\)\.]+/);
                          const hasLetters = /[a-zA-Z]/.test(viewingClient.home_phone);
                          const hasDigits = /\d/.test(viewingClient.home_phone);
                          
                          if (hasDigits && phoneMatch) {
                            const phoneNumber = phoneMatch[0].trim();
                            if (hasLetters) {
                              const parts = viewingClient.home_phone.split(phoneNumber);
                              return (
                                <p className="text-base">
                                  {parts[0]}
                                  <a 
                                    href={`tel:${phoneNumber}`}
                                    className="text-primary hover:underline"
                                  >
                                    {phoneNumber}
                                  </a>
                                  {parts[1]}
                                </p>
                              );
                            } else {
                              return (
                                <a 
                                  href={`tel:${phoneNumber}`}
                                  className="text-base text-primary hover:underline block"
                                >
                                  {viewingClient.home_phone}
                                </a>
                              );
                            }
                          }
                          return <p className="text-base">{viewingClient.home_phone}</p>;
                        })()
                      ) : (
                        <p className="text-base">—</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-muted-foreground">Cell Phone</Label>
                      {viewingClient.cell_phone ? (
                        (() => {
                          const phoneMatch = viewingClient.cell_phone.match(/[\d\s\-\(\)\.]+/);
                          const hasLetters = /[a-zA-Z]/.test(viewingClient.cell_phone);
                          const hasDigits = /\d/.test(viewingClient.cell_phone);
                          
                          if (hasDigits && phoneMatch) {
                            const phoneNumber = phoneMatch[0].trim();
                            if (hasLetters) {
                              const parts = viewingClient.cell_phone.split(phoneNumber);
                              return (
                                <p className="text-base">
                                  {parts[0]}
                                  <a 
                                    href={`tel:${phoneNumber}`}
                                    className="text-primary hover:underline"
                                  >
                                    {phoneNumber}
                                  </a>
                                  {parts[1]}
                                </p>
                              );
                            } else {
                              return (
                                <a 
                                  href={`tel:${phoneNumber}`}
                                  className="text-base text-primary hover:underline block"
                                >
                                  {viewingClient.cell_phone}
                                </a>
                              );
                            }
                          }
                          return <p className="text-base">{viewingClient.cell_phone}</p>;
                        })()
                      ) : (
                        <p className="text-base">—</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Property Information</h3>
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-semibold text-muted-foreground">Address</Label>
                    <p className="text-base">{[viewingClient.street_number, viewingClient.street_name].filter(Boolean).join(' ') || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-muted-foreground">City, State Zip</Label>
                    <p className="text-base">{[viewingClient.city, [viewingClient.state, viewingClient.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ') || "—"}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-semibold text-muted-foreground">Price</Label>
                      <p className="text-base">{viewingClient.price ? `$${viewingClient.price}` : "—"}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-muted-foreground">Listing Date</Label>
                      <p className="text-base">{viewingClient.listing_date || "—"}</p>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-muted-foreground">CBS</Label>
                    <p className="text-base">{viewingClient.cbs || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-muted-foreground">Zillow Link</Label>
                    {viewingClient.zillow_link ? (
                      <a 
                        href={viewingClient.zillow_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-base text-primary hover:underline break-all block"
                      >
                        {viewingClient.zillow_link}
                      </a>
                    ) : (
                      <p className="text-base">—</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Showing Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-semibold text-muted-foreground">Showing Type</Label>
                    <p className="text-base">{viewingClient.showing_type || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-muted-foreground">Lock Box</Label>
                    <p className="text-base">{viewingClient.lock_box || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-muted-foreground">Combo</Label>
                    <p className="text-base">{viewingClient.combo || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-muted-foreground">Location</Label>
                    <p className="text-base">{viewingClient.location || "—"}</p>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-sm font-semibold text-muted-foreground">Special Instructions</Label>
                    <p className="text-base">{viewingClient.special_instructions || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-muted-foreground">Agent</Label>
                    <p className="text-base">{viewingClient.agent || "—"}</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t pt-4">
                <Button variant="outline" onClick={() => setViewingClient(null)}>
                  Close
                </Button>
                <Button onClick={() => {
                  setViewingClient(null);
                  handleEdit(viewingClient);
                }}>
                  Edit Client
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientsTab;
