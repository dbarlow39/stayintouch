import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SellerPhotoUpload } from "./SellerPhotoUpload";

interface Field {
  id: string;
  label: string;
  type: "text" | "radio" | "checkbox" | "select" | "number" | "textarea";
  options?: string[];
  value?: string | boolean | string[];
  rows?: number;
}

interface SellerSectionProps {
  title: string;
  sectionId: string;
  fields: Field[];
  onFieldChange: (fieldId: string, value: any) => void;
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
  uploadPhoto: (dataUrl: string) => Promise<string>;
  maxPhotos?: number;
}

export const SellerSection = ({
  title, sectionId, fields, onFieldChange, photos, onPhotosChange, uploadPhoto, maxPhotos = 3,
}: SellerSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const renderField = (field: Field) => {
    switch (field.type) {
      case "radio":
        return (
          <div key={field.id} className="space-y-2">
            <Label className="text-sm font-medium">{field.label}</Label>
            <RadioGroup
              value={(field.value as string) || ""}
              onValueChange={(value) => onFieldChange(field.id, value)}
              className="flex flex-wrap gap-4"
            >
              {field.options?.map((option) => (
                <div key={option} className="flex items-center space-x-2">
                  <RadioGroupItem value={option} id={`${sectionId}-${field.id}-${option}`} />
                  <Label htmlFor={`${sectionId}-${field.id}-${option}`} className="cursor-pointer font-normal">{option}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        );
      case "checkbox":
        return (
          <div key={field.id} className="space-y-2">
            <Label className="text-sm font-medium">{field.label}</Label>
            <div className="flex flex-wrap gap-3">
              {field.options?.map((option) => (
                <div key={option} className="flex items-center space-x-2">
                  <Checkbox
                    id={`${sectionId}-${field.id}-${option}`}
                    checked={((field.value as string[]) || []).includes(option)}
                    onCheckedChange={(checked) => {
                      const current = (field.value as string[]) || [];
                      onFieldChange(field.id, checked ? [...current, option] : current.filter((v) => v !== option));
                    }}
                  />
                  <Label htmlFor={`${sectionId}-${field.id}-${option}`} className="cursor-pointer font-normal">{option}</Label>
                </div>
              ))}
            </div>
          </div>
        );
      case "textarea":
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={`${sectionId}-${field.id}`} className="text-sm font-medium">{field.label}</Label>
            <Textarea
              id={`${sectionId}-${field.id}`}
              value={(field.value as string) || ""}
              onChange={(e) => onFieldChange(field.id, e.target.value)}
              rows={field.rows || 3}
            />
          </div>
        );
      default:
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={`${sectionId}-${field.id}`} className="text-sm font-medium">{field.label}</Label>
            <Input
              id={`${sectionId}-${field.id}`}
              type={field.type === "number" ? "number" : "text"}
              value={(field.value as string) || ""}
              onChange={(e) => onFieldChange(field.id, e.target.value)}
            />
          </div>
        );
    }
  };

  const completed = fields.filter((f) => (Array.isArray(f.value) ? f.value.length > 0 : f.value !== undefined && f.value !== "")).length;
  const progress = fields.length > 0 ? (completed / fields.length) * 100 : 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="cursor-pointer bg-muted/30 py-4" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-[#9B111E] transition-all" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-xs text-muted-foreground">
                {completed}/{fields.length} answered • {photos.length}/{maxPhotos} photos
              </span>
            </div>
          </div>
          {isExpanded ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-4 pt-4">
          {fields.map((field) => renderField(field))}
          <SellerPhotoUpload
            photos={photos}
            onPhotosChange={onPhotosChange}
            uploadPhoto={uploadPhoto}
            maxPhotos={maxPhotos}
          />
        </CardContent>
      )}
    </Card>
  );
};
