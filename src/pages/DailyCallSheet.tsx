import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { ArrowLeft, CalendarIcon, Save, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_ROWS = 10;

interface CallEntry {
  id?: string;
  row_number: number;
  name: string;
  phone: string;
  notes: string;
  action: string;
}

const makeEntries = (count: number): CallEntry[] =>
  Array.from({ length: count }, (_, i) => ({
    row_number: i + 1,
    name: "",
    phone: "",
    notes: "",
    action: "",
  }));

const DailyCallSheet = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [entries, setEntries] = useState<CallEntry[]>(makeEntries(DEFAULT_ROWS));
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  // Fetch the agent's profile name
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, first_name, last_name")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch sheet for selected date
  const { data: sheetData, isLoading } = useQuery({
    queryKey: ["daily-call-sheet", user?.id, dateStr],
    queryFn: async () => {
      const { data: sheet, error: sheetError } = await supabase
        .from("daily_call_sheets")
        .select("id")
        .eq("agent_id", user!.id)
        .eq("sheet_date", dateStr)
        .maybeSingle();
      if (sheetError) throw sheetError;

      if (!sheet) return { sheet: null, entries: [] };

      const { data: entryData, error: entryError } = await supabase
        .from("daily_call_entries")
        .select("*")
        .eq("sheet_id", sheet.id)
        .order("row_number");
      if (entryError) throw entryError;

      return { sheet, entries: entryData || [] };
    },
    enabled: !!user?.id,
  });

  // Fetch dates that have sheets for calendar highlighting
  const { data: sheetDates } = useQuery({
    queryKey: ["daily-call-sheet-dates", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_call_sheets")
        .select("sheet_date")
        .eq("agent_id", user!.id);
      if (error) throw error;
      return (data || []).map((d: { sheet_date: string }) => d.sheet_date);
    },
    enabled: !!user?.id,
  });

  // Populate entries when sheet data loads
  useEffect(() => {
    if (!sheetData) return;
    if (sheetData.sheet) {
      setSheetId(sheetData.sheet.id);
      const maxRow = Math.max(
        DEFAULT_ROWS,
        ...sheetData.entries.map((e: CallEntry) => e.row_number)
      );
      const base = makeEntries(maxRow);
      const merged = base.map((empty) => {
        const existing = sheetData.entries.find(
          (e: CallEntry) => e.row_number === empty.row_number
        );
        return existing
          ? { ...empty, id: existing.id, name: existing.name || "", phone: existing.phone || "", notes: existing.notes || "", action: existing.action || "" }
          : empty;
      });
      setEntries(merged);
    } else {
      setSheetId(null);
      setEntries(makeEntries(DEFAULT_ROWS));
    }
    setHasChanges(false);
  }, [sheetData]);

  const updateEntry = useCallback((rowNumber: number, field: keyof CallEntry, value: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.row_number === rowNumber ? { ...e, [field]: value } : e))
    );
    setHasChanges(true);
  }, []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      let currentSheetId = sheetId;

      // Create sheet if it doesn't exist
      if (!currentSheetId) {
        const { data: newSheet, error: createError } = await supabase
          .from("daily_call_sheets")
          .insert({ agent_id: user!.id, sheet_date: dateStr })
          .select("id")
          .single();
        if (createError) throw createError;
        currentSheetId = newSheet.id;
      }

      // Upsert entries (only non-empty rows)
      const nonEmptyEntries = entries.filter(
        (e) => e.name || e.phone || e.notes || e.action
      );

      if (nonEmptyEntries.length > 0) {
        const upsertData = nonEmptyEntries.map((e) => ({
          sheet_id: currentSheetId!,
          row_number: e.row_number,
          name: e.name,
          phone: e.phone,
          notes: e.notes,
          action: e.action,
        }));

        const { error: upsertError } = await supabase
          .from("daily_call_entries")
          .upsert(upsertData, { onConflict: "sheet_id,row_number" });
        if (upsertError) throw upsertError;
      }

      // Delete emptied rows that previously existed
      const emptyExistingIds = entries
        .filter((e) => e.id && !e.name && !e.phone && !e.notes && !e.action)
        .map((e) => e.id!);

      if (emptyExistingIds.length > 0) {
        const { error: deleteError } = await supabase
          .from("daily_call_entries")
          .delete()
          .in("id", emptyExistingIds);
        if (deleteError) throw deleteError;
      }

      return currentSheetId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-call-sheet"] });
      queryClient.invalidateQueries({ queryKey: ["daily-call-sheet-dates"] });
      toast({ title: "Call sheet saved" });
      setHasChanges(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error saving call sheet", description: error.message, variant: "destructive" });
    },
  });

  const navigateDay = (direction: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + direction);
    setSelectedDate(newDate);
  };

  const agentName = profile?.full_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Agent";

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Buyer Leads
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!hasChanges || saveMutation.isPending}>
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </div>

        {/* Title & Info */}
        <div className="border rounded-lg p-6 bg-card">
          <h1 className="text-2xl font-bold text-center mb-4">Daily Call Sheet</h1>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm">
              <span className="text-muted-foreground">Agent: </span>
              <span className="font-medium">{agentName}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => navigateDay(-1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="min-w-[180px]">
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    {format(selectedDate, "MMMM d, yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="center">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => d && setSelectedDate(d)}
                    className="p-3 pointer-events-auto"
                    modifiers={{
                      hasSheet: (sheetDates || []).map((d: string) => parseISO(d)),
                    }}
                    modifiersClassNames={{
                      hasSheet: "bg-primary/20 font-bold",
                    }}
                  />
                </PopoverContent>
              </Popover>
              <Button variant="outline" size="icon" onClick={() => navigateDay(1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Call Sheet Table */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading call sheet...</div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead className="w-[22%]">Name</TableHead>
                  <TableHead className="w-[20%]">Phone</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-[18%]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.row_number}>
                    <TableCell className="text-center font-medium text-muted-foreground">
                      {entry.row_number}
                    </TableCell>
                    <TableCell>
                      <Input
                        value={entry.name}
                        onChange={(e) => updateEntry(entry.row_number, "name", e.target.value)}
                        className="h-8"
                        placeholder="Contact name"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={entry.phone}
                        onChange={(e) => updateEntry(entry.row_number, "phone", e.target.value)}
                        className="h-8"
                        placeholder="Phone number"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={entry.notes}
                        onChange={(e) => updateEntry(entry.row_number, "notes", e.target.value)}
                        className="h-8"
                        placeholder="Notes"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={entry.action}
                        onChange={(e) => updateEntry(entry.row_number, "action", e.target.value)}
                        className="h-8"
                        placeholder="Action taken"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-center p-3 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const currentMax = entries.length;
                  const newRows = makeEntries(currentMax + ADD_INCREMENT).slice(currentMax);
                  setEntries((prev) => [...prev, ...newRows]);
                  setHasChanges(true);
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add {ADD_INCREMENT} More Rows
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyCallSheet;
