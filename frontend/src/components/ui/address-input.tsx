"use client"

import { useState, useEffect, useRef } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { MapPin, Search, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface AddressType {
  id: string
  code: string
  name: string
  icon?: string
  color?: string
}

export interface AddressData {
  address_type_id: string
  label?: string
  street_line1: string
  street_line2?: string
  city: string
  state?: string
  postal_code: string
  country: string
  latitude?: number
  longitude?: number
  place_id?: string
  formatted_address?: string
  phone?: string
  email?: string
  notes?: string
  is_default: boolean
}

interface AddressInputProps {
  value?: AddressData
  onChange?: (address: AddressData) => void
  addressTypes: AddressType[]
  required?: boolean
  className?: string
  googleMapsApiKey?: string
}

export function AddressInput({
  value,
  onChange,
  addressTypes,
  required = false,
  className,
  googleMapsApiKey,
}: AddressInputProps) {
  const [addressData, setAddressData] = useState<AddressData>(
    value || {
      address_type_id: "",
      street_line1: "",
      street_line2: "",
      city: "",
      state: "",
      postal_code: "",
      country: "FR",
      phone: "",
      email: "",
      notes: "",
      is_default: false,
    }
  )
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (value) {
      setAddressData(value)
    }
  }, [value])

  // Initialize Google Places Autocomplete
  useEffect(() => {
    if (typeof window !== "undefined" && window.google && googleMapsApiKey && inputRef.current) {
      const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ["address"],
        fields: ["address_components", "formatted_address", "geometry", "place_id"],
      })

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace()
        if (place.geometry && place.geometry.location) {
          handlePlaceSelected(place)
        }
      })

      autocompleteRef.current = autocomplete
    }
  }, [googleMapsApiKey])

  const handlePlaceSelected = (place: google.maps.places.PlaceResult) => {
    const addressComponents = place.address_components || []

    let street_number = ""
    let route = ""
    let city = ""
    let state = ""
    let postal_code = ""
    let country = ""

    addressComponents.forEach((component) => {
      const types = component.types
      if (types.includes("street_number")) {
        street_number = component.long_name
      }
      if (types.includes("route")) {
        route = component.long_name
      }
      if (types.includes("locality")) {
        city = component.long_name
      }
      if (types.includes("administrative_area_level_1")) {
        state = component.long_name
      }
      if (types.includes("postal_code")) {
        postal_code = component.long_name
      }
      if (types.includes("country")) {
        country = component.short_name
      }
    })

    const newData: AddressData = {
      ...addressData,
      street_line1: `${street_number} ${route}`.trim(),
      city,
      state,
      postal_code,
      country,
      latitude: place.geometry?.location?.lat(),
      longitude: place.geometry?.location?.lng(),
      place_id: place.place_id,
      formatted_address: place.formatted_address,
    }

    setAddressData(newData)
    if (onChange) {
      onChange(newData)
    }
  }

  const handleFieldChange = (field: keyof AddressData, value: any) => {
    const newData = { ...addressData, [field]: value }
    setAddressData(newData)
    if (onChange) {
      onChange(newData)
    }
  }

  const handleGeocode = async () => {
    if (!window.google) {
      return
    }

    setIsGeocoding(true)
    const geocoder = new window.google.maps.Geocoder()
    const address = `${addressData.street_line1}, ${addressData.city}, ${addressData.postal_code}, ${addressData.country}`

    geocoder.geocode({ address }, (results, status) => {
      setIsGeocoding(false)
      if (status === "OK" && results && results[0]) {
        const location = results[0].geometry.location
        handleFieldChange("latitude", location.lat())
        handleFieldChange("longitude", location.lng())
        handleFieldChange("place_id", results[0].place_id)
        handleFieldChange("formatted_address", results[0].formatted_address)
      }
    })
  }

  return (
    <Card className={cn("", className)}>
      <CardContent className="pt-6 space-y-4">
        {/* Type d'adresse */}
        <div className="space-y-2">
          <Label htmlFor="address-type">
            Type d'adresse {required && <span className="text-destructive">*</span>}
          </Label>
          <Select
            value={addressData.address_type_id}
            onValueChange={(value) => handleFieldChange("address_type_id", value)}
          >
            <SelectTrigger id="address-type">
              <SelectValue placeholder="Sélectionner un type" />
            </SelectTrigger>
            <SelectContent>
              {addressTypes.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Label personnalisé */}
        <div className="space-y-2">
          <Label htmlFor="label">Label (optionnel)</Label>
          <Input
            id="label"
            placeholder="Ex: Bureau principal, Domicile..."
            value={addressData.label || ""}
            onChange={(e) => handleFieldChange("label", e.target.value)}
          />
        </div>

        {/* Adresse ligne 1 avec autocomplete */}
        <div className="space-y-2">
          <Label htmlFor="street1">
            Adresse {required && <span className="text-destructive">*</span>}
          </Label>
          <div className="relative">
            <Input
              ref={inputRef}
              id="street1"
              placeholder="Numéro et nom de rue"
              value={addressData.street_line1}
              onChange={(e) => handleFieldChange("street_line1", e.target.value)}
              required={required}
            />
            {isGeocoding && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Adresse ligne 2 */}
        <div className="space-y-2">
          <Label htmlFor="street2">Complément d'adresse</Label>
          <Input
            id="street2"
            placeholder="Bâtiment, étage, appartement..."
            value={addressData.street_line2 || ""}
            onChange={(e) => handleFieldChange("street_line2", e.target.value)}
          />
        </div>

        {/* Ville et Code postal */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="postal-code">
              Code postal {required && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id="postal-code"
              placeholder="75001"
              value={addressData.postal_code}
              onChange={(e) => handleFieldChange("postal_code", e.target.value)}
              required={required}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">
              Ville {required && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id="city"
              placeholder="Paris"
              value={addressData.city}
              onChange={(e) => handleFieldChange("city", e.target.value)}
              required={required}
            />
          </div>
        </div>

        {/* Région et Pays */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="state">Région/État</Label>
            <Input
              id="state"
              placeholder="Île-de-France"
              value={addressData.state || ""}
              onChange={(e) => handleFieldChange("state", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="country">
              Pays {required && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id="country"
              placeholder="FR"
              value={addressData.country}
              onChange={(e) => handleFieldChange("country", e.target.value)}
              required={required}
              maxLength={2}
            />
          </div>
        </div>

        {/* Contact */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Téléphone</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+33 1 23 45 67 89"
              value={addressData.phone || ""}
              onChange={(e) => handleFieldChange("phone", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="contact@example.com"
              value={addressData.email || ""}
              onChange={(e) => handleFieldChange("email", e.target.value)}
            />
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">Notes / Instructions</Label>
          <Textarea
            id="notes"
            placeholder="Instructions de livraison, code d'accès..."
            value={addressData.notes || ""}
            onChange={(e) => handleFieldChange("notes", e.target.value)}
            rows={3}
          />
        </div>

        {/* Géolocalisation */}
        {addressData.street_line1 && addressData.city && (
          <div className="flex items-center gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGeocode}
              disabled={isGeocoding || !window.google}
              className="gap-2"
            >
              {isGeocoding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MapPin className="h-4 w-4" />
              )}
              Géolocaliser
            </Button>
            {addressData.latitude && addressData.longitude && (
              <span className="text-xs text-muted-foreground">
                📍 {addressData.latitude.toFixed(6)}, {addressData.longitude.toFixed(6)}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
