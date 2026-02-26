import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Save, FileText, FolderOpen, Plus, Trash2, Loader2 } from "lucide-react";
import { inspectionSections } from "@/data/inspectionData";
import { InspectionSection } from "./residential/InspectionSection";
import { AudioRecorder } from "./residential/AudioRecorder";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateInspectionPDF } from "@/utils/inspectionPdfGenerator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface Inspection {
  id: string;
  property_address: string;
  created_at: string;
  updated_at: string;
}

const MAPBOX_API_KEY = 'pk.eyJ1IjoiZGJhcmxvdzM5IiwiYSI6ImNtaHY3bGppZjA4YjAybHBxMTFpcXc4cjUifQ.FR_LuIGPTri475ANOVKxFw';

const ResidentialWorkSheetTab = () => {
  const { user } = useAuth();
  const [view, setView] = useState<"list" | "form">("list");
  const [saving, setSaving] = useState(false);
  const [currentInspectionId, setCurrentInspectionId] = useState<string | null>(null);
  const [inspectionData, setInspectionData] = useState<Record<string, any>>({});
  const [photos, setPhotos] = useState<Record<string, string[]>>({});
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Auto-save refs
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inspectionDataRef = useRef(inspectionData);
  const photosRef = useRef(photos);
  const currentInspectionIdRef = useRef(currentInspectionId);

  useEffect(() => { inspectionDataRef.current = inspectionData; }, [inspectionData]);
  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => { currentInspectionIdRef.current = currentInspectionId; }, [currentInspectionId]);

  useEffect(() => {
    if (user) loadInspections();
  }, [user]);

  // Auto-save every 10 minutes when in form view
  useEffect(() => {
    if (!user || view !== "form") return;
    autoSaveRef.current = setInterval(async () => {
      if (!user) return;
      try {
        const data = inspectionDataRef.current;
        const inspId = currentInspectionIdRef.current;
        const basePayload = { user_id: user.id, property_address: data["property-info"]?.address || "Untitled Property", inspection_data: data };
        if (inspId) {
          await supabase.from("inspections").update(basePayload).eq("id", inspId);
        } else {
          const { data: inserted, error } = await supabase.from("inspections").insert(basePayload).select("id").single();
          if (!error && inserted) { setCurrentInspectionId(inserted.id); }
        }
        toast.success("Auto-saved successfully");
      } catch { toast.error("Auto-save failed"); }
    }, 10 * 60 * 1000);
    return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current); };
  }, [user, view]);

  const loadInspections = async () => {
    try {
      const { data, error } = await supabase.from("inspections").select("id, property_address, created_at, updated_at").order("updated_at", { ascending: false });
      if (error) throw error;
      setInspections(data || []);
    } catch (error: any) {
      toast.error(`Failed to load work sheets: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLoad = async (id: string) => {
    setLoadingId(id);
    try {
      const { data, error } = await supabase.from("inspections").select("inspection_data, photos").eq("id", id).single();
      if (error) throw error;
      setInspectionData((data.inspection_data as Record<string, any>) || {});
      setPhotos((data.photos as Record<string, string[]>) || {});
      setCurrentInspectionId(id);
      setView("form");
      toast.success("Work sheet loaded!");
    } catch (error: any) {
      toast.error(`Failed to load: ${error.message}`);
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from("inspections").delete().eq("id", deleteId);
      if (error) throw error;
      setInspections(prev => prev.filter(i => i.id !== deleteId));
      toast.success("Work sheet deleted");
      setDeleteId(null);
    } catch (error: any) {
      toast.error(`Failed to delete: ${error.message}`);
    }
  };

  const handleNewInspection = () => {
    setInspectionData({});
    setPhotos({});
    setCurrentInspectionId(null);
    setView("form");
  };

  const handleFieldChange = (sectionId: string, fieldId: string, value: any) => {
    setInspectionData(prev => ({ ...prev, [sectionId]: { ...prev[sectionId], [fieldId]: value } }));
  };

  const handleAddressSelect = useCallback(async (fullAddress: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('get-property-info', { body: { address: fullAddress } });
      if (error) { toast.error("Could not fetch property details."); return; }
      const storiesMap: Record<string, string> = { '1': 'Ranch', '2': '2 Story', '1.5': 'Cape Cod', '3': '3 Level', '4': '4 Level', '5': '5 Level' };
      const propertyStyle = data.stories ? storiesMap[data.stories] || '' : '';
      setInspectionData(prev => ({
        ...prev,
        'property-info': { ...prev['property-info'], name: data.ownerName || '', address: data.address || fullAddress, city: data.city || '', zip: data.zipCode || '', yearBuilt: data.yearBuilt || '', bedrooms: data.bedrooms || '', bathrooms: data.bathrooms || '', sqft: data.sqft || '', style: propertyStyle },
      }));
      if (data.ownerName) toast.success("Property details loaded!");
      else toast.info("Address found but no additional details available");
    } catch { toast.error("Failed to fetch property details"); }
  }, []);

  const handlePhotosChange = (sectionId: string, newPhotos: string[]) => {
    setPhotos(prev => ({ ...prev, [sectionId]: newPhotos }));
  };

  const uploadNewPhotos = async (sectionPhotos: Record<string, string[]>, userId: string): Promise<Record<string, string[]>> => {
    const result: Record<string, string[]> = {};
    for (const [sectionId, photoList] of Object.entries(sectionPhotos)) {
      const processed: string[] = [];
      for (const photo of photoList) {
        if (photo.startsWith("data:")) {
          try {
            const res = await fetch(photo);
            const blob = await res.blob();
            const fileName = `${userId}/${Date.now()}_${crypto.randomUUID()}.jpg`;
            const { error } = await supabase.storage.from("inspection-photos").upload(fileName, blob, { contentType: "image/jpeg" });
            if (error) throw error;
            const { data: urlData } = supabase.storage.from("inspection-photos").getPublicUrl(fileName);
            processed.push(urlData.publicUrl);
          } catch { processed.push(photo); }
        } else { processed.push(photo); }
      }
      result[sectionId] = processed;
    }
    return result;
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const basePayload = { user_id: user.id, property_address: inspectionData["property-info"]?.address || "Untitled Property", inspection_data: inspectionData };
      let inspectionId = currentInspectionId;
      if (inspectionId) {
        const { error } = await supabase.from("inspections").update(basePayload).eq("id", inspectionId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("inspections").insert(basePayload).select("id").single();
        if (error) throw error;
        inspectionId = data.id;
        setCurrentInspectionId(inspectionId);
      }
      const hasNewPhotos = Object.values(photos).some(arr => arr.some(p => p.startsWith("data:")));
      if (hasNewPhotos) {
        const processedPhotos = await uploadNewPhotos(photos, user.id);
        setPhotos(processedPhotos);
        await supabase.from("inspections").update({ photos: processedPhotos }).eq("id", inspectionId);
      }
      toast.success("Work sheet saved successfully!");
    } catch (error: any) {
      toast.error(`Failed to save: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleExportPDF = () => {
    try { generateInspectionPDF(inspectionData, photos); toast.success("PDF downloaded!"); }
    catch (error: any) { toast.error(`Failed to generate PDF: ${error.message}`); }
  };

  const totalFields = inspectionSections.reduce((acc, section) => acc + section.fields.length, 0);
  const completedFields = inspectionSections.reduce((acc, section) => {
    const sectionData = inspectionData[section.id] || {};
    return acc + section.fields.filter(field => {
      const value = sectionData[field.id];
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== '';
    }).length;
  }, 0);
  const overallProgress = totalFields > 0 ? (completedFields / totalFields) * 100 : 0;

  // List view
  if (view === "list") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">My Work Sheets</h2>
            <p className="text-muted-foreground">View and manage your saved residential work sheets</p>
          </div>
          <Button onClick={handleNewInspection}><Plus className="mr-2 h-4 w-4" />New Work Sheet</Button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : inspections.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No work sheets yet</h3>
            <p className="text-muted-foreground text-center mb-4">Start your first work sheet to see it here</p>
            <Button onClick={handleNewInspection}><Plus className="mr-2 h-4 w-4" />Create First Work Sheet</Button>
          </CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {inspections.map(inspection => (
              <Card key={inspection.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-start justify-between">
                    <span className="truncate pr-2">{inspection.property_address}</span>
                    <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                  </CardTitle>
                  <CardDescription>
                    <div>Created: {new Date(inspection.created_at).toLocaleDateString()}</div>
                    <div>Updated: {new Date(inspection.updated_at).toLocaleDateString()}</div>
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Button className="flex-1" onClick={() => handleLoad(inspection.id)} disabled={loadingId === inspection.id}>
                    {loadingId === inspection.id ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading...</> : "Load"}
                  </Button>
                  <Button variant="destructive" size="icon" onClick={() => setDeleteId(inspection.id)}><Trash2 className="h-4 w-4" /></Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Work Sheet?</AlertDialogTitle>
              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // Form view
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Button variant="outline" size="sm" onClick={() => { setView("list"); loadInspections(); }}>
          <FolderOpen className="mr-2 h-4 w-4" />My Work Sheets
        </Button>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Overall Progress</h2>
          <span className="text-sm font-medium text-muted-foreground">{completedFields}/{totalFields} fields</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-300" style={{ width: `${overallProgress}%` }} />
        </div>
      </div>

      <div className="space-y-4">
        {inspectionSections.map((section, index) => (
          <div key={section.id}>
            <InspectionSection
              title={section.title}
              sectionId={section.id}
              fields={section.fields.map(field => ({ ...field, value: inspectionData[section.id]?.[field.id] }))}
              onFieldChange={(fieldId, value) => handleFieldChange(section.id, fieldId, value)}
              onPhotosChange={(newPhotos) => handlePhotosChange(section.id, newPhotos)}
              photos={photos[section.id] || []}
              defaultExpanded={index === 0}
              mapboxApiKey={MAPBOX_API_KEY}
              onAddressSelect={section.id === 'property-info' ? handleAddressSelect : undefined}
            />
            {section.id === 'property-info' && user && (
              <div className="mt-4">
                <AudioRecorder inspectionId={currentInspectionId || undefined} userId={user.id} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="sticky bottom-0 mt-6 flex gap-3 border-t bg-background/95 py-4 backdrop-blur-sm">
        <Button onClick={handleSave} className="flex-1" size="lg" disabled={saving}>
          <Save className="mr-2 h-4 w-4" />{saving ? "Saving..." : "Save to Database"}
        </Button>
        <Button onClick={handleExportPDF} variant="outline" size="lg">
          <FileText className="mr-2 h-4 w-4" />Export PDF
        </Button>
      </div>
    </div>
  );
};

export default ResidentialWorkSheetTab;
