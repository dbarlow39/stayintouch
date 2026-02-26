import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PhotoUpload } from "./PhotoUpload";
import { MapboxAddressInput } from "./MapboxAddressInput";
import { HandwritingCanvas } from "./HandwritingCanvas";

interface Field {
  id: string;
  label: string;
  type: 'text' | 'radio' | 'checkbox' | 'select' | 'number' | 'textarea';
  options?: string[];
  value?: string | boolean | string[];
  rows?: number;
}

interface InspectionSectionProps {
  title: string;
  fields: Field[];
  sectionId: string;
  onFieldChange: (fieldId: string, value: any) => void;
  onPhotosChange: (photos: string[]) => void;
  photos: string[];
  defaultExpanded?: boolean;
  mapboxApiKey?: string;
  onAddressSelect?: (address: string) => void;
}

export const InspectionSection = ({
  title, fields, sectionId, onFieldChange, onPhotosChange, photos,
  defaultExpanded = false, mapboxApiKey = "", onAddressSelect,
}: InspectionSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const renderField = (field: Field, index: number) => {
    if (sectionId === 'property-info' && field.id === 'address') {
      return (
        <div key={field.id} className="space-y-2">
          <Label htmlFor={field.id} className="text-sm font-medium text-foreground">{field.label}</Label>
          <MapboxAddressInput id={field.id} value={field.value as string || ''} onChange={(value) => onFieldChange(field.id, value)} onAddressSelect={onAddressSelect} apiKey={mapboxApiKey} />
        </div>
      );
    }

    if (sectionId === 'property-info' && field.id === 'city') {
      const zipField = fields.find(f => f.id === 'zip');
      return (
        <div key="city-zip" className="flex gap-3">
          <div className="flex-[2] space-y-2">
            <Label htmlFor={field.id} className="text-sm font-medium text-foreground">{field.label}</Label>
            <Input id={field.id} type="text" value={field.value as string} onChange={(e) => onFieldChange(field.id, e.target.value)} className="w-full" />
          </div>
          {zipField && (
            <div className="flex-1 space-y-2">
              <Label htmlFor={zipField.id} className="text-sm font-medium text-foreground">{zipField.label}</Label>
              <Input id={zipField.id} type="text" value={zipField.value as string} onChange={(e) => onFieldChange(zipField.id, e.target.value)} className="w-full" />
            </div>
          )}
        </div>
      );
    }

    if (sectionId === 'property-info' && field.id === 'phone') {
      const emailField = fields.find(f => f.id === 'email');
      return (
        <div key="phone-email" className="flex gap-3">
          <div className="flex-1 space-y-2">
            <Label htmlFor={field.id} className="text-sm font-medium text-foreground">{field.label}</Label>
            <Input id={field.id} type="text" value={field.value as string} onChange={(e) => onFieldChange(field.id, e.target.value)} className="w-full" />
          </div>
          {emailField && (
            <div className="flex-1 space-y-2">
              <Label htmlFor={emailField.id} className="text-sm font-medium text-foreground">{emailField.label}</Label>
              <Input id={emailField.id} type="email" value={emailField.value as string} onChange={(e) => onFieldChange(emailField.id, e.target.value)} className="w-full" />
            </div>
          )}
        </div>
      );
    }

    if (sectionId === 'property-info' && field.id === 'bedrooms') {
      const bathroomsField = fields.find(f => f.id === 'bathrooms');
      const sqftField = fields.find(f => f.id === 'sqft');
      const yearBuiltField = fields.find(f => f.id === 'yearBuilt');
      return (
        <div key="property-details" className="flex gap-3">
          <div className="flex-1 space-y-2">
            <Label htmlFor={field.id} className="text-sm font-medium text-foreground">{field.label}</Label>
            <Input id={field.id} type="number" value={field.value as string} onChange={(e) => onFieldChange(field.id, e.target.value)} className="w-full" />
          </div>
          {bathroomsField && <div className="flex-1 space-y-2"><Label htmlFor={bathroomsField.id} className="text-sm font-medium text-foreground">{bathroomsField.label}</Label><Input id={bathroomsField.id} type="number" value={bathroomsField.value as string} onChange={(e) => onFieldChange(bathroomsField.id, e.target.value)} className="w-full" /></div>}
          {sqftField && <div className="flex-1 space-y-2"><Label htmlFor={sqftField.id} className="text-sm font-medium text-foreground">{sqftField.label}</Label><Input id={sqftField.id} type="number" value={sqftField.value as string} onChange={(e) => onFieldChange(sqftField.id, e.target.value)} className="w-full" /></div>}
          {yearBuiltField && <div className="flex-1 space-y-2"><Label htmlFor={yearBuiltField.id} className="text-sm font-medium text-foreground">{yearBuiltField.label}</Label><Input id={yearBuiltField.id} type="number" value={yearBuiltField.value as string} onChange={(e) => onFieldChange(yearBuiltField.id, e.target.value)} className="w-full" /></div>}
        </div>
      );
    }

    if (sectionId === 'property-info' && ['zip', 'email', 'bathrooms', 'sqft', 'yearBuilt'].includes(field.id)) return null;

    if (sectionId === 'fireplaces' && field.id !== 'notes' && (field.id.startsWith('fp1-') || field.id.startsWith('fp2-') || field.id.startsWith('fp3-') || field.id.startsWith('wb-'))) return null;

    switch (field.type) {
      case 'radio':
        return (
          <div key={field.id} className="space-y-2">
            <Label className="text-sm font-medium text-foreground">{field.label}</Label>
            <RadioGroup value={field.value as string || ""} onValueChange={(value) => onFieldChange(field.id, value)} className="flex gap-4">
              {field.options?.map((option) => (
                <div key={option} className="flex items-center space-x-2">
                  <RadioGroupItem value={option} id={`${field.id}-${option}`} />
                  <Label htmlFor={`${field.id}-${option}`} className="cursor-pointer font-normal">{option}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        );
      case 'checkbox':
        return (
          <div key={field.id} className="space-y-2">
            <Label className="text-sm font-medium text-foreground">{field.label}</Label>
            <div className="flex flex-wrap gap-3">
              {field.options?.map((option) => (
                <div key={option} className="flex items-center space-x-2">
                  <Checkbox id={`${field.id}-${option}`} checked={(field.value as string[] || []).includes(option)}
                    onCheckedChange={(checked) => {
                      const currentValues = (field.value as string[]) || [];
                      const newValues = checked ? [...currentValues, option] : currentValues.filter((v) => v !== option);
                      onFieldChange(field.id, newValues);
                    }} />
                  <Label htmlFor={`${field.id}-${option}`} className="cursor-pointer font-normal">{option}</Label>
                </div>
              ))}
            </div>
          </div>
        );
      case 'text':
      case 'number':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id} className="text-sm font-medium text-foreground">{field.label}</Label>
            <div className="flex gap-2">
              <Input id={field.id} type={field.type} value={field.value as string} onChange={(e) => onFieldChange(field.id, e.target.value)} className="flex-1" />
              {field.type === 'text' && <HandwritingCanvas existingText={field.value as string || ''} onTextExtracted={(text) => onFieldChange(field.id, text)} />}
            </div>
          </div>
        );
      case 'textarea':
        return (
          <div key={field.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={field.id} className="text-sm font-medium text-foreground">{field.label}</Label>
              <HandwritingCanvas existingText={field.value as string || ''} onTextExtracted={(text) => onFieldChange(field.id, text)} />
            </div>
            <Textarea id={field.id} value={field.value as string} onChange={(e) => onFieldChange(field.id, e.target.value)} rows={field.rows || 3} className="w-full" placeholder="Enter any additional notes, observations, or concerns..." />
          </div>
        );
      default:
        return null;
    }
  };

  const renderFireplaceGroup = (prefix: string, title: string) => {
    const locationField = fields.find(f => f.id === `${prefix}-location`);
    const woodField = fields.find(f => f.id === `${prefix}-wood`);
    const gasStarterField = fields.find(f => f.id === `${prefix}-gas-starter`);
    const gasLogsField = fields.find(f => f.id === `${prefix}-gas-logs`);
    if (!locationField) return null;
    return (
      <div key={prefix} className="space-y-2 border-b border-border/50 pb-4 last:border-b-0">
        <Label className="text-sm font-semibold text-foreground">{title}</Label>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Location:</span>
            {locationField.options?.map((option) => (
              <div key={option} className="flex items-center space-x-1">
                <Checkbox id={`${locationField.id}-${option}`} checked={(locationField.value as string[] || []).includes(option)}
                  onCheckedChange={(checked) => {
                    const currentValues = (locationField.value as string[]) || [];
                    const newValues = checked ? [...currentValues, option] : currentValues.filter((v) => v !== option);
                    onFieldChange(locationField.id, newValues);
                  }} />
                <Label htmlFor={`${locationField.id}-${option}`} className="cursor-pointer text-xs font-normal">{option}</Label>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          {[woodField, gasStarterField, gasLogsField].filter(Boolean).map((f) => f && (
            <div key={f.id} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{f.label}:</span>
              <RadioGroup value={f.value as string || ""} onValueChange={(value) => onFieldChange(f.id, value)} className="flex gap-2">
                {f.options?.map((option) => (
                  <div key={option} className="flex items-center space-x-1">
                    <RadioGroupItem value={option} id={`${f.id}-${option}`} />
                    <Label htmlFor={`${f.id}-${option}`} className="cursor-pointer text-xs font-normal">{option}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderFireplacesSection = () => {
    const notesField = fields.find(f => f.id === 'notes');
    return (
      <>
        {renderFireplaceGroup('fp1', 'Fireplace 1')}
        {renderFireplaceGroup('fp2', 'Fireplace 2')}
        {renderFireplaceGroup('fp3', 'Fireplace 3')}
        {renderFireplaceGroup('wb', 'Wood Burner')}
        {notesField && renderField(notesField, 0)}
      </>
    );
  };

  const completedFields = fields.filter((f) => {
    if (Array.isArray(f.value)) return f.value.length > 0;
    return f.value !== undefined && f.value !== '';
  }).length;

  const minPhotos = 3;
  const progress = (completedFields / fields.length) * 100;

  return (
    <Card className="overflow-hidden shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="cursor-pointer bg-gradient-to-r from-muted/30 to-muted/10 py-4" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <CardTitle className="text-base font-semibold text-foreground">{title}</CardTitle>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-xs font-medium text-muted-foreground">{completedFields}/{fields.length} fields • {photos.length}/{minPhotos} photos</span>
            </div>
          </div>
          {isExpanded ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-4 pt-4">
          {sectionId === 'fireplaces' ? renderFireplacesSection() : fields.map((field, index) => renderField(field, index))}
          <PhotoUpload sectionId={sectionId} onPhotosChange={onPhotosChange} photos={photos} minPhotos={minPhotos} />
        </CardContent>
      )}
    </Card>
  );
};
