import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Search, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

interface Client {
  id: string;
  first_name: string | null;
  last_name: string | null;
  street_number: string | null;
  street_name: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  cell_phone: string | null;
  home_phone: string | null;
  email: string | null;
  status: string | null;
  annual_taxes: number | null;
}

interface ClientSelectionViewProps {
  onSelectClient: (client: Client) => void;
  onNewClient: () => void;
  onCancel: () => void;
}

const ClientSelectionView = ({ onSelectClient, onNewClient, onCancel }: ClientSelectionViewProps) => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients-for-estimate", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(
          "id, first_name, last_name, street_number, street_name, city, state, zip, phone, cell_phone, home_phone, email, status, annual_taxes"
        )
        .eq("agent_id", user!.id)
        .ilike("status", "A")
        .order("street_name", { ascending: true });
      if (error) throw error;
      return data as Client[];
    },
    enabled: !!user,
  });

  const filteredClients = clients.filter((client) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const fullName = `${client.first_name || ""} ${client.last_name || ""}`.toLowerCase();
    const address = `${client.street_number || ""} ${client.street_name || ""}`.toLowerCase();
    return fullName.includes(query) || address.includes(query);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold">Select Client</h2>
          <p className="text-muted-foreground">Choose an existing client or create a new estimate</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button onClick={onNewClient} variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          New Client / Manual Entry
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : filteredClients.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <User className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {searchQuery ? "No clients found" : "No active clients"}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery 
                ? "Try a different search term or create a new estimate."
                : "Add clients or create a new estimate manually."}
            </p>
            <Button onClick={onNewClient}>
              <Plus className="mr-2 h-4 w-4" />
              Create New Estimate
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Contact</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.map((client) => (
                <TableRow
                  key={client.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onSelectClient(client)}
                >
                  <TableCell className="font-medium">
                    {client.first_name} {client.last_name}
                  </TableCell>
                  <TableCell>
                    {client.street_number} {client.street_name}
                  </TableCell>
                  <TableCell>{client.city}</TableCell>
                  <TableCell>
                    {client.phone || client.cell_phone || client.home_phone || client.email || "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
};

export default ClientSelectionView;
