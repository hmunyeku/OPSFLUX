"use client";

/**
 * Location Picker Component
 * Sélecteur de point de ramassage avec carte et géolocalisation
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MapPin, Navigation, Search } from "lucide-react";
import { Card } from "@/components/ui/card";

export interface Location {
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  description?: string;
}

interface LocationPickerProps {
  value?: Location;
  onChange: (location: Location) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

// Points de ramassage prédéfinis
const PREDEFINED_LOCATIONS: Location[] = [
  {
    name: "Aéroport International de Port-Gentil",
    address: "Port-Gentil, Gabon",
    latitude: -0.7116,
    longitude: 8.7547,
    description: "Terminal principal",
  },
  {
    name: "Base Héliport TotalEnergies",
    address: "Port-Gentil, Gabon",
    latitude: -0.7200,
    longitude: 8.7600,
    description: "Héliport offshore",
  },
  {
    name: "Quai d'embarquement Port-Gentil",
    address: "Port-Gentil, Gabon",
    latitude: -0.7150,
    longitude: 8.7520,
    description: "Embarquement maritime",
  },
  {
    name: "Hôtel Residence",
    address: "Centre-ville, Port-Gentil",
    latitude: -0.7190,
    longitude: 8.7580,
    description: "Point de rendez-vous",
  },
];

export function LocationPicker({
  value,
  onChange,
  label = "Point de ramassage",
  placeholder = "Sélectionner un point de ramassage",
  disabled = false,
}: LocationPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customLocation, setCustomLocation] = useState("");

  const filteredLocations = PREDEFINED_LOCATIONS.filter((loc) =>
    loc.name.toLowerCase().includes(search.toLowerCase()) ||
    loc.address?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelectLocation = (location: Location) => {
    onChange(location);
    setOpen(false);
  };

  const handleUseCurrentLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location: Location = {
            name: "Ma position actuelle",
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            address: `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`,
          };
          onChange(location);
          setOpen(false);
        },
        (error) => {
          console.error("Erreur de géolocalisation:", error);
          alert("Impossible d'obtenir votre position. Vérifiez les autorisations.");
        }
      );
    } else {
      alert("La géolocalisation n'est pas supportée par votre navigateur.");
    }
  };

  const handleCustomLocation = () => {
    if (customLocation.trim()) {
      const location: Location = {
        name: customLocation,
        address: customLocation,
      };
      onChange(location);
      setCustomLocation("");
      setOpen(false);
    }
  };

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-start"
            disabled={disabled}
          >
            <MapPin className="mr-2 h-4 w-4" />
            {value ? (
              <span className="truncate">{value.name}</span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sélectionner un point de ramassage</DialogTitle>
            <DialogDescription>
              Choisissez un point prédéfini, utilisez votre position actuelle ou saisissez une adresse personnalisée
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Géolocalisation */}
            <Card className="p-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleUseCurrentLocation}
              >
                <Navigation className="mr-2 h-4 w-4" />
                Utiliser ma position actuelle
              </Button>
            </Card>

            {/* Recherche */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un point de ramassage..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Points prédéfinis */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              <Label className="text-xs text-muted-foreground">Points prédéfinis</Label>
              {filteredLocations.map((location) => (
                <Card
                  key={location.name}
                  className={`p-3 cursor-pointer transition-colors hover:bg-accent ${
                    value?.name === location.name ? "border-primary bg-accent" : ""
                  }`}
                  onClick={() => handleSelectLocation(location)}
                >
                  <div className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 text-primary mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{location.name}</div>
                      {location.address && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {location.address}
                        </div>
                      )}
                      {location.description && (
                        <div className="text-xs text-muted-foreground">
                          {location.description}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Adresse personnalisée */}
            <Card className="p-4">
              <Label className="text-xs text-muted-foreground mb-2 block">
                Ou saisissez une adresse personnalisée
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Ex: Hôtel Mandji, Port-Gentil"
                  value={customLocation}
                  onChange={(e) => setCustomLocation(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCustomLocation();
                    }
                  }}
                />
                <Button onClick={handleCustomLocation} disabled={!customLocation.trim()}>
                  Ajouter
                </Button>
              </div>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* Affichage de la localisation sélectionnée */}
      {value && value.address && (
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {value.address}
        </div>
      )}
    </div>
  );
}
