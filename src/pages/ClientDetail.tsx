import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { openEmailClient } from "@/utils/emailClientUtils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle as AlertTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  User,
  FileText,
  Pencil,
  MessageSquare,
  Mail,
  X,
  Save,
  BarChart3,
  CheckCircle,
  ArrowLeft,
  LogOut,
  Settings,
  Package,
  TrendingUp,
  ClipboardList,
} from "lucide-react";
import PhoneCallTextLink from "@/components/PhoneCallTextLink";
import logo from "@/assets/logo.jpg";
import ClientFeedbackPage from "@/components/dashboard/ClientFeedbackPage";
import ClientCommunicationsView from "@/components/dashboard/ClientCommunicationsView";
import ClientEditForm from "@/components/dashboard/ClientEditForm";
import ClientAnalysisView from "@/components/dashboard/weeklyUpdate/ClientAnalysisView";
import ResidentialWorkSheetTab from "@/components/dashboard/ResidentialWorkSheetTab";
import MarketAnalysisTab from "@/components/dashboard/sellerLead/MarketAnalysisTab";

interface ClientNote {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

type TabView = "details" | "edit" | "notes" | "communications" | "feedback" | "stats" | "pre-listing" | "market-analysis" | "residential-work-sheet";

const ClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading, signOut } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabView>("details");
  const [newNote, setNewNote] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [showMarkSoldDialog, setShowMarkSoldDialog] = useState(false);

  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (redirectTimerRef.current) {
      clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
    if (!authLoading && !user) {
      redirectTimerRef.current = setTimeout(() => navigate("/auth"), 2000);
    }
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, [authLoading, user, navigate]);

  const { data: client, isLoading, error } = useQuery({
    queryKey: ["client-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!user,
  });

  const { data: notes = [], isLoading: notesLoading } = useQuery({
    queryKey: ["client-notes", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_notes")
        .select("*")
        .eq("client_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ClientNote[];
    },
    enabled: !!id && !!user,
  });

  // Best-effort lookup of the source seller-lead row for this client.
  // Powers the Residential Work Sheet and Market Analysis tabs (both require leads.id).
  const { data: linkedLead } = useQuery({
    queryKey: ["client-linked-lead", id, user?.id],
    queryFn: async () => {
      if (!client || !user) return null;
      const fullAddress = [client.street_number, client.street_name]
        .filter(Boolean)
        .join(" ")
        .trim();

      let query = supabase
        .from("leads")
        .select("*")
        .eq("agent_id", user.id)
        .eq("lead_type", "seller");

      if (fullAddress) {
        query = query.ilike("address", `%${fullAddress}%`);
      } else {
        query = query
          .ilike("first_name", client.first_name || "")
          .ilike("last_name", client.last_name || "");
      }

      const { data, error } = await query.limit(1).maybeSingle();
      if (error) {
        console.warn("Linked lead lookup failed:", error.message);
        return null;
      }
      return data;
    },
    enabled: !!client && !!user,
  });

  const addNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase.from("client_notes").insert({
        client_id: id!,
        agent_id: user!.id,
        content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-notes", id] });
      setNewNote("");
      toast.success("Note added");
    },
    onError: () => toast.error("Failed to add note"),
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ noteId, content }: { noteId: string; content: string }) => {
      const { error } = await supabase
        .from("client_notes")
        .update({ content })
        .eq("id", noteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-notes", id] });
      setEditingNoteId(null);
      setEditingContent("");
      toast.success("Note updated");
    },
    onError: () => toast.error("Failed to update note"),
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

  const handleBackToClients = () => navigate("/dashboard?tab=clients");

  const renderPhoneLink = (phone: string | undefined | null) => {
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
            <PhoneCallTextLink phone={phoneNumber} inline>
              {phoneNumber}
            </PhoneCallTextLink>
            {parts[1]}
          </p>
        );
      }
      return (
        <PhoneCallTextLink phone={phoneNumber} inline className="text-base block">
          {phone}
        </PhoneCallTextLink>
      );
    }
    return <p className="text-base">{phone}</p>;
  };

  const Header = () => (
    <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <img src={logo} alt="Sell for 1 Percent" className="h-12 w-auto" />
          <div>
            <h1 className="text-xl font-bold">My Real Estate Office</h1>
            <p className="text-xs text-muted-foreground">Real Estate CRM</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/account")}>
            <Settings className="w-4 h-4 mr-2" />
            Account
          </Button>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>
    </header>
  );

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-32 text-muted-foreground">
          Loading client...
        </div>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-16 flex flex-col items-center gap-4">
          <p className="text-muted-foreground">Client not found.</p>
          <Button variant="outline" onClick={handleBackToClients}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Clients
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-6">
        {/* Page title bar */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={handleBackToClients}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Clients
            </Button>
            <div>
              <h2 className="text-2xl font-bold leading-tight">
                {client.first_name} {client.last_name}
              </h2>
              {client.street_name && (
                <p className="text-sm text-muted-foreground">
                  {[client.street_number, client.street_name].filter(Boolean).join(" ")}
                </p>
              )}
            </div>
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-[14rem_1fr]">
            {/* Sidebar */}
            <aside className="bg-muted/30 border-b md:border-b-0 md:border-r p-2 md:p-3">
              <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
                {[
                  { id: "details" as TabView, label: "Details", icon: User },
                  { id: "edit" as TabView, label: "Edit Client", icon: Pencil },
                  { id: "notes" as TabView, label: "Notes", icon: FileText },
                  { id: "communications" as TabView, label: "Communications", icon: Mail },
                  { id: "feedback" as TabView, label: "Feedback", icon: MessageSquare },
                  { id: "stats" as TabView, label: "Stats", icon: BarChart3 },
                ].map(({ id: tabId, label, icon: Icon }) => (
                  <button
                    key={tabId}
                    onClick={() => setActiveTab(tabId)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap md:w-full ${
                      activeTab === tabId
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
                <button
                  onClick={() => setShowMarkSoldDialog(true)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium hover:bg-muted text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap md:w-full"
                >
                  <CheckCircle className="h-4 w-4" />
                  Mark as Sold
                </button>
              </nav>
            </aside>

            {/* Main content */}
            <div className="p-6">
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
                          <button
                            type="button"
                            onClick={() => openEmailClient(client.email!)}
                            className="text-base text-primary hover:underline break-all block text-left"
                          >
                            {client.email}
                          </button>
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

              {activeTab === "edit" && (
                <ClientEditForm
                  client={client as any}
                  onSuccess={() => {
                    setActiveTab("details");
                    queryClient.invalidateQueries({ queryKey: ["client-detail", id] });
                    queryClient.invalidateQueries({ queryKey: ["clients"] });
                  }}
                  onCancel={() => setActiveTab("details")}
                />
              )}

              {activeTab === "notes" && (
                <div className="space-y-6">
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

                  <div className="space-y-4">
                    <h3 className="font-semibold">Notes History ({notes.length})</h3>
                    {notesLoading ? (
                      <div className="text-center py-4 text-muted-foreground">Loading notes...</div>
                    ) : notes.length === 0 ? (
                      <div className="text-center py-8 border border-dashed rounded-lg">
                        <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-muted-foreground">No notes yet</p>
                        <p className="text-sm text-muted-foreground">Add your first note above</p>
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
                                  <Button size="sm" variant="outline" onClick={handleCancelEdit}>
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
                                      <span className="ml-2">
                                        (edited {format(new Date(note.updated_at), "MMM d, yyyy")})
                                      </span>
                                    )}
                                  </p>
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => handleEditNote(note)}>
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

              {activeTab === "communications" && (
                <ClientCommunicationsView clientEmail={client.email} />
              )}

              {activeTab === "feedback" && (
                <ClientFeedbackPage clientId={client.id} onBack={() => setActiveTab("details")} />
              )}

              {activeTab === "stats" && (
                <ClientAnalysisView
                  client={{
                    id: client.id,
                    first_name: client.first_name,
                    last_name: client.last_name,
                    email: client.email || null,
                    street_number: client.street_number || null,
                    street_name: client.street_name || null,
                    city: client.city || null,
                    state: client.state || null,
                    zip: client.zip || null,
                    zillow_link: client.zillow_link || null,
                    status: client.status || null,
                    showings_to_date: client.showings_to_date || null,
                    mls_id: client.mls_id || null,
                    days_on_market: client.days_on_market || null,
                    price: client.price || null,
                  }}
                  onBack={() => setActiveTab("details")}
                />
              )}
            </div>
          </div>
        </Card>
      </main>

      <AlertDialog open={showMarkSoldDialog} onOpenChange={setShowMarkSoldDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertTitle>Mark as Sold?</AlertTitle>
            <AlertDialogDescription>
              This will change the client's status to "Sold" and remove them from the active clients list. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  const { error } = await supabase
                    .from("clients")
                    .update({ status: "S" })
                    .eq("id", client.id);
                  if (error) throw error;

                  await supabase
                    .from("estimated_net_properties")
                    .update({ deal_status: "closed" })
                    .eq("client_id", client.id);

                  toast.success("Client marked as sold");
                  queryClient.invalidateQueries({ queryKey: ["clients"] });
                  queryClient.invalidateQueries({ queryKey: ["active-clients-count"] });
                  queryClient.invalidateQueries({ queryKey: ["clients-count"] });
                  queryClient.invalidateQueries({ queryKey: ["estimated-net-properties"] });
                  handleBackToClients();
                } catch (error: any) {
                  toast.error("Failed to mark as sold: " + error.message);
                }
              }}
            >
              Mark as Sold
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ClientDetail;
