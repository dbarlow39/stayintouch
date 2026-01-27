import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { format, parse } from "date-fns";
import { cn } from "@/lib/utils";

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

interface ClientEditFormProps {
  client: Client;
  onSuccess: () => void;
  onCancel: () => void;
}

const formatPhoneNumber = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 3) {
    return digits;
  } else if (digits.length <= 6) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  } else {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }
};

const ClientEditForm = ({ client, onSuccess, onCancel }: ClientEditFormProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    first_name: client.first_name || "",
    last_name: client.last_name || "",
    email: client.email || "",
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

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const submitData: any = { ...data };
      if (submitData.price && submitData.price !== '') {
        submitData.price = parseFloat(submitData.price);
      } else {
        submitData.price = null;
      }
      const { error } = await supabase.from("clients").update(submitData).eq("id", client.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["clients-count"] });
      queryClient.invalidateQueries({ queryKey: ["active-clients-count"] });
      toast.success("Client updated successfully");
      onSuccess();
    },
    onError: (error: any) => {
      const message = error?.message || '';
      if (message.includes('invalid input syntax for type numeric')) {
        toast.error("Invalid number format. Please check Price field.");
      } else {
        toast.error(`Failed to update client: ${message || 'Unknown error'}`);
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  return (
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

      <div className="flex gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={updateMutation.isPending}>
          {updateMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
};

export default ClientEditForm;
