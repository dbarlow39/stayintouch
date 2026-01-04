import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { FileUp, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface InventoryClient {
  mls_id: string;
  street_number: string;
  street_name: string;
  city: string;
  status: string;
  price: number | null;
  agent: string;
  showings_to_date: number | null;
  days_on_market: number | null;
  first_name: string;
  last_name: string;
  selected?: boolean;
}

interface InventoryImportDialogProps {
  trigger?: React.ReactNode;
}

export function InventoryImportDialog({ trigger }: InventoryImportDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'complete'>('upload');
  const [parsedClients, setParsedClients] = useState<InventoryClient[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importStats, setImportStats] = useState({ imported: 0, updated: 0, errors: 0 });
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const resetState = () => {
    setStep('upload');
    setParsedClients([]);
    setSelectedIds(new Set());
    setImportStats({ imported: 0, updated: 0, errors: 0 });
    setIsParsing(false);
    setIsImporting(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if PDF
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error("Please upload a PDF file");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 20MB.");
      return;
    }

    setIsParsing(true);

    try {
      // Read file as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Extract base64 data from data URL
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // For now, we'll use a simpler approach - parse markdown content that was already parsed
      // In a real implementation, you'd send the PDF to a parsing service
      toast.info("Processing PDF file...");
      
      // Read as text to try direct parsing (works for text-based content)
      const text = await file.text();
      
      // Check if it's a text file disguised as PDF or has readable content
      if (text.includes('|') && (text.includes('Address') || text.includes('MLS'))) {
        // Direct markdown content - parse it
        const { data, error } = await supabase.functions.invoke('parse-inventory-pdf', {
          body: { markdown_content: text }
        });

        if (error) throw error;

        if (data.success && data.data.length > 0) {
          setParsedClients(data.data);
          // Select all by default
          setSelectedIds(new Set(data.data.map((_: InventoryClient, i: number) => i.toString())));
          setStep('preview');
          toast.success(`Found ${data.data.length} listings`);
        } else {
          toast.error("No listings found in the file");
        }
      } else {
        // For actual PDFs, we need to use a PDF parsing service
        // Since we have the parsed content from the document parser, let's work with that
        toast.error("Please use the document parser to convert PDF to text first, or paste the markdown content directly.");
      }
    } catch (error) {
      console.error('Error parsing file:', error);
      toast.error("Failed to parse file");
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handlePasteMarkdown = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        toast.error("Clipboard is empty");
        return;
      }
      
      setIsParsing(true);
      
      const { data, error } = await supabase.functions.invoke('parse-inventory-pdf', {
        body: { markdown_content: text }
      });

      if (error) throw error;

      if (data.success && data.data.length > 0) {
        setParsedClients(data.data);
        setSelectedIds(new Set(data.data.map((_: InventoryClient, i: number) => i.toString())));
        setStep('preview');
        toast.success(`Found ${data.data.length} listings`);
      } else {
        toast.error("No listings found in the pasted content");
      }
    } catch (error) {
      console.error('Error parsing clipboard:', error);
      toast.error("Failed to parse clipboard content");
    } finally {
      setIsParsing(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === parsedClients.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(parsedClients.map((_, i) => i.toString())));
    }
  };

  const toggleSelect = (index: number) => {
    const newSet = new Set(selectedIds);
    const key = index.toString();
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setSelectedIds(newSet);
  };

  const handleImport = async () => {
    if (selectedIds.size === 0) {
      toast.error("Please select at least one listing to import");
      return;
    }

    setIsImporting(true);
    setStep('importing');

    const selectedClients = parsedClients.filter((_, i) => selectedIds.has(i.toString()));
    let imported = 0;
    let updated = 0;
    let errors = 0;

    try {
      // Process in batches
      const batchSize = 50;
      
      for (let i = 0; i < selectedClients.length; i += batchSize) {
        const batch = selectedClients.slice(i, i + batchSize);
        
        for (const client of batch) {
          try {
            // Check if MLS ID already exists
            if (client.mls_id) {
              const { data: existing } = await supabase
                .from('clients')
                .select('id')
                .eq('agent_id', user!.id)
                .eq('mls_id', client.mls_id)
                .maybeSingle();

              if (existing) {
                // Update existing record
                const { error } = await supabase
                  .from('clients')
                  .update({
                    status: client.status,
                    price: client.price,
                    showings_to_date: client.showings_to_date,
                    days_on_market: client.days_on_market,
                    agent: client.agent,
                    street_number: client.street_number,
                    street_name: client.street_name,
                    city: client.city,
                  })
                  .eq('id', existing.id);

                if (error) throw error;
                updated++;
                continue;
              }
            }

            // Insert new record
            const { error } = await supabase
              .from('clients')
              .insert({
                agent_id: user!.id,
                mls_id: client.mls_id,
                street_number: client.street_number,
                street_name: client.street_name,
                city: client.city,
                status: client.status,
                price: client.price,
                agent: client.agent,
                showings_to_date: client.showings_to_date,
                days_on_market: client.days_on_market,
                first_name: client.first_name || null,
                last_name: client.last_name || null,
              });

            if (error) throw error;
            imported++;
          } catch (error) {
            console.error('Error importing client:', client, error);
            errors++;
          }
        }
      }

      setImportStats({ imported, updated, errors });
      setStep('complete');
      
      // Refresh clients list
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['clients-count'] });
      
      if (errors === 0) {
        toast.success(`Successfully imported ${imported} new and updated ${updated} existing listings`);
      } else {
        toast.warning(`Imported ${imported} new, updated ${updated}, with ${errors} errors`);
      }
    } catch (error) {
      console.error('Import failed:', error);
      toast.error("Import failed");
      setStep('preview');
    } finally {
      setIsImporting(false);
    }
  };

  const formatPrice = (price: number | null) => {
    if (!price) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(price);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetState();
    }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <FileUp className="w-4 h-4 mr-2" />
            Import Inventory
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Import MLS Inventory Report</DialogTitle>
          <DialogDescription>
            Import listings from ShowingTime or MLS inventory reports
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Upload your MLS inventory report PDF or paste the parsed markdown content from the report.
              </AlertDescription>
            </Alert>

            <div className="flex flex-col gap-4 py-8">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md"
                className="hidden"
                onChange={handleFileUpload}
              />
              
              <div className="flex gap-4 justify-center">
                <Button 
                  variant="outline" 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isParsing}
                  className="h-24 w-48 flex-col gap-2"
                >
                  {isParsing ? (
                    <Loader2 className="h-8 w-8 animate-spin" />
                  ) : (
                    <FileUp className="h-8 w-8" />
                  )}
                  <span>Upload PDF/Text File</span>
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={handlePasteMarkdown}
                  disabled={isParsing}
                  className="h-24 w-48 flex-col gap-2"
                >
                  <FileUp className="h-8 w-8" />
                  <span>Paste from Clipboard</span>
                </Button>
              </div>
              
              <p className="text-sm text-muted-foreground text-center">
                Supports inventory reports with columns: MLS ID, Address, City, Status, Price, Agent, Showings, Days on Market
              </p>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                {selectedIds.size} of {parsedClients.length} listings selected
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep('upload')}>
                  Back
                </Button>
                <Button size="sm" onClick={toggleSelectAll}>
                  {selectedIds.size === parsedClients.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[400px] border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox 
                        checked={selectedIds.size === parsedClients.length && parsedClients.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>MLS ID</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Showings</TableHead>
                    <TableHead>DOM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedClients.map((client, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Checkbox 
                          checked={selectedIds.has(index.toString())}
                          onCheckedChange={() => toggleSelect(index)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{client.mls_id}</TableCell>
                      <TableCell>{client.street_number} {client.street_name}</TableCell>
                      <TableCell>{client.city}</TableCell>
                      <TableCell>{client.status}</TableCell>
                      <TableCell>{formatPrice(client.price)}</TableCell>
                      <TableCell>{client.showings_to_date ?? '-'}</TableCell>
                      <TableCell>{client.days_on_market ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleImport} disabled={selectedIds.size === 0}>
                Import {selectedIds.size} Listings
              </Button>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-lg font-medium">Importing listings...</p>
            <p className="text-sm text-muted-foreground">Please wait while we process your inventory data</p>
          </div>
        )}

        {step === 'complete' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-lg font-medium">Import Complete!</p>
            <div className="text-sm text-muted-foreground space-y-1 text-center">
              <p><strong>{importStats.imported}</strong> new listings imported</p>
              <p><strong>{importStats.updated}</strong> existing listings updated</p>
              {importStats.errors > 0 && (
                <p className="text-destructive"><strong>{importStats.errors}</strong> errors occurred</p>
              )}
            </div>
            <Button onClick={() => setOpen(false)} className="mt-4">Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
