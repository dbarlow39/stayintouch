import { useEffect, useRef } from "react";
import MapboxGeocoder from "@mapbox/mapbox-gl-geocoder";
import "@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css";
import { Input } from "@/components/ui/input";

interface MapboxAddressInputProps {
  value: string;
  onChange: (value: string) => void;
  onAddressSelect?: (fullAddress: string) => void;
  apiKey: string;
  id: string;
}

export const MapboxAddressInput = ({ value, onChange, onAddressSelect, apiKey, id }: MapboxAddressInputProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const geocoderRef = useRef<MapboxGeocoder | null>(null);

  useEffect(() => {
    if (!containerRef.current || !apiKey) return;
    if (geocoderRef.current) {
      geocoderRef.current.clear();
      const geocoderElement = containerRef.current.querySelector('.mapboxgl-ctrl-geocoder');
      if (geocoderElement) geocoderElement.remove();
    }
    const geocoder = new MapboxGeocoder({ accessToken: apiKey, types: 'address', placeholder: 'Enter property address' });
    geocoder.addTo(containerRef.current);
    geocoderRef.current = geocoder;
    if (value) geocoder.setInput(value);
    geocoder.on('result', (e) => {
      const fullAddress = e.result.place_name;
      onChange(fullAddress);
      if (onAddressSelect) onAddressSelect(fullAddress);
    });
    geocoder.on('clear', () => onChange(''));
    return () => { if (geocoderRef.current) geocoderRef.current.clear(); };
  }, [apiKey, id, onAddressSelect]);

  useEffect(() => {
    const geocoderInput = containerRef.current?.querySelector('.mapboxgl-ctrl-geocoder input') as HTMLInputElement;
    if (geocoderInput && geocoderInput.value !== value) geocoderInput.value = value;
  }, [value]);

  if (!apiKey) {
    return <Input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Property Address" className="w-full" />;
  }

  return (
    <div ref={containerRef} className="mapbox-geocoder-container w-full">
      <style>{`
        .mapboxgl-ctrl-geocoder { width: 100%; max-width: none; box-shadow: none; font-family: inherit; }
        .mapboxgl-ctrl-geocoder input { height: 2.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; border-radius: 0.375rem; border: 1px solid hsl(var(--input)); background-color: hsl(var(--background)); color: hsl(var(--foreground)); }
        .mapboxgl-ctrl-geocoder input:focus { outline: none; border-color: hsl(var(--ring)); box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2); }
        .mapboxgl-ctrl-geocoder .suggestions { background-color: hsl(var(--popover)); border: 1px solid hsl(var(--border)); border-radius: 0.375rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); margin-top: 0.25rem; }
        .mapboxgl-ctrl-geocoder .suggestions > li > a { color: hsl(var(--popover-foreground)); padding: 0.5rem 0.75rem; }
        .mapboxgl-ctrl-geocoder .suggestions > .active > a, .mapboxgl-ctrl-geocoder .suggestions > li > a:hover { background-color: hsl(var(--accent)); color: hsl(var(--accent-foreground)); }
        .mapboxgl-ctrl-geocoder .geocoder-icon { display: none; }
      `}</style>
    </div>
  );
};
