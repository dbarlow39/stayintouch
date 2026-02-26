export interface InspectionSection {
  id: string;
  title: string;
  fields: InspectionField[];
  photos: Photo[];
}

export interface InspectionField {
  id: string;
  label: string;
  type: 'text' | 'radio' | 'checkbox' | 'select' | 'number' | 'textarea';
  value?: string | boolean | string[];
  options?: string[];
  rows?: number;
}

export interface Photo {
  id: string;
  url: string;
  timestamp: number;
  description?: string;
}

export interface InspectionData {
  propertyInfo: Record<string, string>;
  sections: InspectionSection[];
  timestamp: number;
}
