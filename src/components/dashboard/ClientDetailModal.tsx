import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  User,
  FileText,
  Pencil,
  MessageSquare,
  X,
  Save,
} from "lucide-react";
import logo from "@/assets/logo.jpg";
import ClientFeedbackPage from "./ClientFeedbackPage";

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

interface ClientNote {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface ClientDetailModalProps {
  client: Client | null;
  open: boolean;
  onClose: () => void;
  onEdit: (client: Client) => void;
}

type TabView = "details" | "notes" | "feedback";

const ClientDetailModal = ({ client, open, onClose, onEdit }: ClientDetailModalProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabView>("details");
  const [newNote, setNewNote] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  // Fetch notes for this client
  const { data: notes = [], isLoading: notesLoading } = useQuery({
    queryKey: ["client-notes", client?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_notes")
        .select("*")
        .eq("client_id", client!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ClientNote[];
    },
    enabled: !!client && !!user,
  });

  // Add note mutation
  const addNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase.from("client_notes").insert({
        client_id: client!.id,
        agent_id: user!.id,
        content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-notes", client?.id] });
      setNewNote("");
      toast.success("Note added");
    },
    onError: () => {
      toast.error("Failed to add note");
    },
  });

  // Update note mutation
  const updateNoteMutation = useMutation({
    mutationFn: async ({ noteId, content }: { noteId: string; content: string }) => {
      const { error } = await supabase
        .from("client_notes")
        .update({ content })
        .eq("id", noteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-notes", client?.id] });
      setEditingNoteId(null);
      setEditingContent("");
      toast.success("Note updated");
    },
    onError: () => {
      toast.error("Failed to update note");
    },
  });
  const handleAddNote = () => {
    if (!newNote.trim()) {
      toast.error("Please enter a note");
      return;
    }
    addNoteMutation.mutate(newNote.trim());
  };

  const handleEditNote = (note: ClientNote) => {
    setEditingNoteId(note.id);
    setEditingContent(note.content);
  };

  const handleSaveEdit = () => {
    if (!editingContent.trim() || !editingNoteId) return;
    updateNoteMutation.mutate({ noteId: editingNoteId, content: editingContent.trim() });
  };

  const handleCancelEdit = () => {
    setEditingNoteId(null);
    setEditingContent("");
  };

  const renderPhoneLink = (phone: string | undefined) => {
    if (!phone) return <p className="text-base">—</p>;

    const phoneMatch = phone.match(/[\d\s\-\(\)\.]+/);
    const hasLetters = /[a-zA-Z]/.test(phone);
    const hasDigits = /\d/.test(phone);

    if (hasDigits && phoneMatch) {
      const phoneNumber = phoneMatch[0].trim();
      if (hasLetters) {
        const parts = phone.split(phoneNumber);
        return (
          <p className="text-base">
            {parts[0]}
            <a href={`tel:${phoneNumber}`} className="text-primary hover:underline">
              {phoneNumber}
            </a>
            {parts[1]}
          </p>
        );
      } else {
        return (
          <a href={`tel:${phoneNumber}`} className="text-base text-primary hover:underline block">
            {phone}
          </a>
        );
      }
    }
    return <p className="text-base">{phone}</p>;
  };

  if (!client) return null;

  const navItems = [
    { id: "details" as TabView, label: "Details", icon: User },
    { id: "notes" as TabView, label: "Notes", icon: FileText },
    { id: "feedback" as TabView, label: "Feedback", icon: MessageSquare },
  ];

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
        <div className="flex h-[80vh]">
          {/* Left Sidebar Navigation */}
          <div className="w-48 bg-muted/30 border-r flex flex-col">
            <div className="p-4 border-b">
              <img src={logo} alt="Sell for 1 Percent" className="h-8 w-auto" />
            </div>

            <nav className="flex-1 p-2 space-y-1">
              {/* Details */}
              <button
                onClick={() => setActiveTab("details")}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === "details"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <User className="h-4 w-4" />
                Details
              </button>

              {/* Edit Client */}
              <button
                onClick={() => {
                  onClose();
                  onEdit(client);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <Pencil className="h-4 w-4" />
                Edit Client
              </button>

              {/* Notes */}
              <button
                onClick={() => setActiveTab("notes")}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === "notes"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <FileText className="h-4 w-4" />
                Notes
              </button>

              {/* Feedback */}
              <button
                onClick={() => setActiveTab("feedback")}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === "feedback"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <MessageSquare className="h-4 w-4" />
                Feedback
              </button>

              {/* Close */}
              <button
                onClick={onClose}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
                Close
              </button>
            </nav>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <DialogHeader className="p-4 border-b">
              <DialogTitle>
                {client.first_name} {client.last_name}
                {client.street_name && (
                  <span className="text-muted-foreground font-normal ml-2">
                    — {client.street_number} {client.street_name}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>

            <ScrollArea className="flex-1 p-6">
              {activeTab === "details" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-semibold text-muted-foreground">Status</Label>
                      <p className="text-base">{client.status?.toUpperCase() || "—"}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-muted-foreground">MLS ID</Label>
                      <p className="text-base">{client.mls_id || "—"}</p>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-3">Contact Information</h3>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm font-semibold text-muted-foreground">Name</Label>
                        <p className="text-base">
                          {[client.first_name, client.last_name].filter(Boolean).join(" ") || "—"}
                        </p>
                      </div>
                      <div>
                        <Label className="text-sm font-semibold text-muted-foreground">Email</Label>
                        {client.email ? (
                          <a
                            href={`mailto:${client.email}`}
                            className="text-base text-primary hover:underline break-all block"
                          >
                            {client.email}
                          </a>
                        ) : (
                          <p className="text-base">—</p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm font-semibold text-muted-foreground">Home Phone</Label>
                          {renderPhoneLink(client.home_phone)}
                        </div>
                        <div>
                          <Label className="text-sm font-semibold text-muted-foreground">Cell Phone</Label>
                          {renderPhoneLink(client.cell_phone)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-3">Property Information</h3>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm font-semibold text-muted-foreground">Address</Label>
                        <p className="text-base">
                          {[client.street_number, client.street_name].filter(Boolean).join(" ") || "—"}
                        </p>
                      </div>
                      <div>
                        <Label className="text-sm font-semibold text-muted-foreground">City, State Zip</Label>
                        <p className="text-base">
                          {[client.city, [client.state, client.zip].filter(Boolean).join(" ")]
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm font-semibold text-muted-foreground">Price</Label>
                          <p className="text-base">{client.price ? `$${client.price}` : "—"}</p>
                        </div>
                        <div>
                          <Label className="text-sm font-semibold text-muted-foreground">Listing Date</Label>
                          <p className="text-base">{client.listing_date || "—"}</p>
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm font-semibold text-muted-foreground">CBS</Label>
                        <p className="text-base">{client.cbs || "—"}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-semibold text-muted-foreground">Zillow Link</Label>
                        {client.zillow_link ? (
                          <a
                            href={client.zillow_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-base text-primary hover:underline break-all block"
                          >
                            {client.zillow_link}
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
                        <p className="text-base">{client.showing_type || "—"}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-semibold text-muted-foreground">Lock Box</Label>
                        <p className="text-base">{client.lock_box || "—"}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-semibold text-muted-foreground">Combo</Label>
                        <p className="text-base">{client.combo || "—"}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-semibold text-muted-foreground">Location</Label>
                        <p className="text-base">{client.location || "—"}</p>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-sm font-semibold text-muted-foreground">
                          Special Instructions
                        </Label>
                        <p className="text-base">{client.special_instructions || "—"}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-semibold text-muted-foreground">Agent</Label>
                        <p className="text-base">{client.agent || "—"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "notes" && (
                <div className="space-y-6">
                  {/* Add New Note */}
                  <div className="space-y-3">
                    <h3 className="font-semibold">Add Note</h3>
                    <Textarea
                      placeholder="Write a note about this client or deal..."
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      rows={3}
                    />
                    <Button
                      onClick={handleAddNote}
                      disabled={addNoteMutation.isPending || !newNote.trim()}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Save Note
                    </Button>
                  </div>

                  <Separator />

                  {/* Notes List */}
                  <div className="space-y-4">
                    <h3 className="font-semibold">
                      Notes History ({notes.length})
                    </h3>

                    {notesLoading ? (
                      <div className="text-center py-4 text-muted-foreground">Loading notes...</div>
                    ) : notes.length === 0 ? (
                      <div className="text-center py-8 border border-dashed rounded-lg">
                        <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-muted-foreground">No notes yet</p>
                        <p className="text-sm text-muted-foreground">
                          Add your first note above
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {notes.map((note) => (
                          <div
                            key={note.id}
                            className="p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors"
                          >
                            {editingNoteId === note.id ? (
                              <div className="space-y-3">
                                <Textarea
                                  value={editingContent}
                                  onChange={(e) => setEditingContent(e.target.value)}
                                  rows={3}
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={handleSaveEdit}
                                    disabled={updateNoteMutation.isPending || !editingContent.trim()}
                                  >
                                    <Save className="mr-2 h-4 w-4" />
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleCancelEdit}
                                  >
                                    <X className="mr-2 h-4 w-4" />
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                                  <p className="text-xs text-muted-foreground mt-2">
                                    {format(new Date(note.created_at), "MMM d, yyyy 'at' h:mm a")}
                                    {note.updated_at !== note.created_at && (
                                      <span className="ml-2">(edited {format(new Date(note.updated_at), "MMM d, yyyy")})</span>
                                    )}
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditNote(note)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "feedback" && (
                <ClientFeedbackPage clientId={client.id} onBack={() => setActiveTab("details")} />
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ClientDetailModal;
