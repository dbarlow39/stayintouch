import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { PropertyData } from "@/types/estimatedNet";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  List,
  DollarSign,
  ClipboardList,
  Mail,
  Calendar,
  FileText,
  Edit,
  Bell,
  StickyNote,
  Plus,
} from "lucide-react";

interface PropertyNotesViewProps {
  propertyData: PropertyData;
  propertyId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
  onNavigate: (view: string) => void;
}

interface ParsedNote {
  timestamp: string;
  content: string;
}

const parseNotes = (rawNotes: string): ParsedNote[] => {
  if (!rawNotes.trim()) return [];

  // Split by timestamp pattern [MM/DD/YYYY, HH:MM AM/PM]
  const parts = rawNotes.split(/(?=\[[\d\/]+,?\s*[\d:]+\s*[AP]M\])/i);

  const notes: ParsedNote[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^\[([\d\/]+,?\s*[\d:]+\s*[AP]M)\]\s*([\s\S]*)/i);
    if (match) {
      notes.push({
        timestamp: match[1],
        content: match[2].trim(),
      });
    } else {
      // Note without a timestamp (legacy)
      notes.push({
        timestamp: "",
        content: trimmed,
      });
    }
  }

  return notes;
};

const PropertyNotesView = ({
  propertyData,
  propertyId,
  onBack,
  onEdit,
  onNavigate,
}: PropertyNotesViewProps) => {
  const { toast } = useToast();
  const [newNote, setNewNote] = useState("");
  const [allNotes, setAllNotes] = useState(propertyData.notes || "");
  const [saving, setSaving] = useState(false);

  // Reload notes from DB on mount
  useEffect(() => {
    const loadNotes = async () => {
      const { data } = await supabase
        .from("estimated_net_properties")
        .select("notes")
        .eq("id", propertyId)
        .single();
      if (data) setAllNotes(data.notes || "");
    };
    loadNotes();
  }, [propertyId]);

  const parsedNotes = parseNotes(allNotes);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;

    setSaving(true);
    const now = new Date();
    const timestamp = now.toLocaleString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const entry = `[${timestamp}]\n${newNote.trim()}`;
    const updatedNotes = allNotes ? `${entry}\n\n${allNotes}` : entry;

    const { error } = await supabase
      .from("estimated_net_properties")
      .update({ notes: updatedNotes })
      .eq("id", propertyId);

    if (error) {
      toast({ title: "Error saving note", description: error.message, variant: "destructive" });
    } else {
      setAllNotes(updatedNotes);
      setNewNote("");
      toast({ title: "Note added", description: `Saved at ${timestamp}` });
    }
    setSaving(false);
  };

  const navigationItems = [
    { label: "Edit Property", icon: Edit, onClick: () => onEdit(propertyId) },
    { label: "Closing Costs", icon: DollarSign, onClick: () => onNavigate("results") },
    { label: "Offer Summary", icon: List, onClick: () => onNavigate("offer-summary") },
    { label: "Offer Letter", icon: Mail, onClick: () => onNavigate("offer-letter") },
    { label: "Important Dates Letter", icon: Calendar, onClick: () => onNavigate("important-dates") },
    { label: "Title Letter", icon: Mail, onClick: () => onNavigate("title-letter") },
    { label: "Agent Letter", icon: Mail, onClick: () => onNavigate("agent-letter") },
    { label: "Notices", icon: Bell, onClick: () => onNavigate("notices") },
    { label: "Notes", icon: StickyNote, onClick: () => {}, active: true },
  ];

  return (
    <div className="flex w-full min-h-[600px]">
      <aside className="w-56 p-3 border-r bg-card shrink-0">
        <div className="space-y-1">
          {navigationItems.map((item, idx) => (
            <Button
              key={idx}
              variant={item.active ? "secondary" : "ghost"}
              className="w-full justify-start text-left h-auto py-2 px-3"
              onClick={item.onClick}
              type="button"
            >
              <item.icon className="mr-2 h-4 w-4 shrink-0" />
              <span className="text-sm">{item.label}</span>
            </Button>
          ))}
        </div>
      </aside>

      <div className="flex-1 py-4 px-6 overflow-auto">
        <div className="max-w-3xl">
          <div className="mb-6">
            <Button variant="ghost" size="sm" onClick={onBack} className="mb-2">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <h2 className="text-2xl font-bold text-foreground">
              Notes — {propertyData.streetAddress}
            </h2>
            <p className="text-muted-foreground">
              {propertyData.city}, {propertyData.state} {propertyData.zip}
            </p>
          </div>

          {/* Add New Note */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Add New Note
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Type your note here..."
                rows={4}
                className="mb-3"
              />
              <Button onClick={handleAddNote} disabled={saving || !newNote.trim()}>
                {saving ? "Saving..." : "Save Note"}
              </Button>
            </CardContent>
          </Card>

          {/* Previous Notes */}
          <h3 className="text-lg font-semibold text-foreground mb-3">
            Previous Notes ({parsedNotes.length})
          </h3>

          {parsedNotes.length === 0 ? (
            <Card className="p-6">
              <p className="text-muted-foreground text-center">No notes yet. Add your first note above.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {parsedNotes.map((note, idx) => (
                <Card key={idx} className="p-4">
                  {note.timestamp && (
                    <p className="text-xs text-muted-foreground mb-1 font-medium">
                      {note.timestamp}
                    </p>
                  )}
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {note.content || "(empty note)"}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PropertyNotesView;
