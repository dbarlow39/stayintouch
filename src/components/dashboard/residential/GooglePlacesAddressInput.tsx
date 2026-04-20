import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

interface GooglePlacesAddressInputProps {
  value: string;
  onChange: (value: string) => void;
  onAddressSelect?: (fullAddress: string) => void;
  apiKey: string;
  id: string;
}

declare global {
  interface Window {
    google?: any;
    __googleMapsLoaderPromise?: Promise<void>;
  }
}

const loadGoogleMaps = (apiKey: string): Promise<void> => {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.google?.maps?.places) return Promise.resolve();
  if (window.__googleMapsLoaderPromise) return window.__googleMapsLoaderPromise;

  window.__googleMapsLoaderPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-google-maps-loader]");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Google Maps script failed to load")));
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMapsLoader = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps script failed to load"));
    document.head.appendChild(script);
  });

  return window.__googleMapsLoaderPromise;
};

export const GooglePlacesAddressInput = ({
  value,
  onChange,
  onAddressSelect,
  apiKey,
  id,
}: GooglePlacesAddressInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!apiKey || !inputRef.current) return;
    let cancelled = false;

    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !inputRef.current || !window.google?.maps?.places) return;

        const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
          types: ["address"],
          componentRestrictions: { country: ["us"] },
          fields: ["formatted_address", "address_components"],
        });

        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          const fullAddress = place?.formatted_address || inputRef.current?.value || "";
          // Stash place on window so callers can read parsed components without changing this component's API
          if (typeof window !== "undefined") {
            (window as any).__lastGooglePlace = place || null;
          }
          if (fullAddress) {
            onChange(fullAddress);
            onAddressSelect?.(fullAddress);
          }
        });

        autocompleteRef.current = autocomplete;
        setReady(true);
      })
      .catch((err) => {
        console.error("Google Maps load error:", err);
      });

    return () => {
      cancelled = true;
      if (autocompleteRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [apiKey]);

  return (
    <Input
      ref={inputRef}
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={ready ? "Start typing an address..." : "Property Address"}
      className="w-full"
      autoComplete="off"
    />
  );
};
