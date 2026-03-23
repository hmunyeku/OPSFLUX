/**
 * AddressManager — Reusable address management component.
 *
 * Embeddable anywhere: settings, tiers detail, asset detail, etc.
 * Fetches and displays addresses for a given owner (owner_type + owner_id).
 * Includes: list, create, edit, delete, geolocation, geocoding, map picker.
 *
 * Usage:
 *   <AddressManager ownerType="tier" ownerId={tier.id} />
 *   <AddressManager ownerType="user" ownerId={user.id} />
 *   <AddressManager ownerType="asset" ownerId={asset.id} />
 */
import { useState, useCallback } from 'react'
import {
  MapPin, Plus, Trash2, Pencil, Loader2, Star,
  LocateFixed, ChevronsUpDown, Map, Search,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAddresses, useDeleteAddress, useCreateAddress, useUpdateAddress } from '@/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'
import {
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { MapPickerModal, forwardGeocode } from '@/components/shared/MapPicker'
import { CountrySelect, COUNTRIES } from '@/components/shared/CountrySelect'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import type { Address, AddressCreate } from '@/types/api'

function countryNameToCode(name: string): string {
  const c = COUNTRIES.find((c) => c.name.toLowerCase() === name.toLowerCase())
  return c?.code ?? ''
}

function countryCodeToName(code: string): string {
  const c = COUNTRIES.find((c) => c.code === code)
  return c?.name ?? code
}

const LABEL_BADGE_STYLES: Record<string, string> = {
  home: 'gl-badge-success',
  office: 'gl-badge-info',
  site: 'gl-badge-info',
  headquarters: 'gl-badge-success',
  pickup: 'gl-badge-warning',
  postal: 'gl-badge-neutral',
  billing: 'gl-badge-neutral',
  delivery: 'gl-badge-warning',
  temporary: 'gl-badge-neutral',
  other: 'gl-badge-neutral',
}

const FALLBACK_LABEL_OPTIONS = [
  { value: 'home', label: 'Domicile' },
  { value: 'office', label: 'Bureau' },
  { value: 'site', label: 'Site' },
  { value: 'headquarters', label: 'Siège' },
  { value: 'pickup', label: 'Ramassage' },
  { value: 'other', label: 'Autre' },
]

function getLabelBadge(label: string, dictLabels?: Record<string, string>) {
  const displayText = dictLabels?.[label] ?? label
  const badgeClass = LABEL_BADGE_STYLES[label] ?? 'gl-badge-neutral'
  return { text: displayText, className: badgeClass }
}

function formatAddress(addr: Address) {
  const parts = [addr.address_line1]
  if (addr.address_line2) parts.push(addr.address_line2)
  return parts.join(', ')
}

function formatCityLine(addr: Address) {
  const parts: string[] = []
  if (addr.postal_code) parts.push(addr.postal_code)
  parts.push(addr.city)
  if (addr.state_province) parts.push(addr.state_province)
  parts.push(addr.country)
  return parts.join(', ')
}

// ── Inline Address Form ────────────────────────────────────

interface AddressFormProps {
  ownerType: string
  ownerId: string
  initial?: Address
  onClose: () => void
  labelOptions: { value: string; label: string }[]
}

function AddressForm({ ownerType, ownerId, initial, onClose, labelOptions }: AddressFormProps) {
  const { toast } = useToast()
  const createAddress = useCreateAddress()
  const updateAddress = useUpdateAddress()

  const [label, setLabel] = useState(initial?.label ?? labelOptions[0]?.value ?? 'home')
  const [addressLine1, setAddressLine1] = useState(initial?.address_line1 ?? '')
  const [addressLine2, setAddressLine2] = useState(initial?.address_line2 ?? '')
  const [city, setCity] = useState(initial?.city ?? '')
  const [stateProvince, setStateProvince] = useState(initial?.state_province ?? '')
  const [postalCode, setPostalCode] = useState(initial?.postal_code ?? '')
  const [country, setCountry] = useState(() => {
    if (initial?.country) return countryNameToCode(initial.country) || 'CM'
    return 'CM'
  })
  const [latitude, setLatitude] = useState(initial?.latitude != null ? String(initial.latitude) : '')
  const [longitude, setLongitude] = useState(initial?.longitude != null ? String(initial.longitude) : '')
  const [isDefault, setIsDefault] = useState(initial?.is_default ?? false)
  const [expanded, setExpanded] = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geocodeLoading, setGeocodeLoading] = useState(false)
  const [showMapPicker, setShowMapPicker] = useState(false)

  const isPending = createAddress.isPending || updateAddress.isPending
  const canSubmit = addressLine1.trim().length > 0 && city.trim().length > 0 && country.length > 0 && !isPending

  // Browser geolocation (GPS device position)
  const handleGeolocate = useCallback(() => {
    if (!navigator.geolocation) {
      toast({ title: 'Non supporté', description: 'La géolocalisation n\'est pas disponible sur cet appareil.', variant: 'warning' })
      return
    }
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(String(pos.coords.latitude))
        setLongitude(String(pos.coords.longitude))
        setGeoLoading(false)
        toast({ title: 'Position obtenue', variant: 'success' })
      },
      (err) => {
        setGeoLoading(false)
        toast({ title: 'Erreur GPS', description: err.message, variant: 'error' })
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }, [toast])

  // Forward geocoding: address text → GPS coordinates
  const handleGeocode = useCallback(async () => {
    const query = [addressLine1, city, stateProvince, postalCode, countryCodeToName(country)].filter(Boolean).join(', ')
    if (!query.trim()) {
      toast({ title: 'Adresse vide', description: 'Remplissez l\'adresse pour géocoder.', variant: 'warning' })
      return
    }
    setGeocodeLoading(true)
    try {
      const result = await forwardGeocode(query)
      if (result) {
        setLatitude(String(result.lat))
        setLongitude(String(result.lng))
        toast({ title: 'Coordonnées trouvées', variant: 'success' })
      } else {
        toast({ title: 'Introuvable', description: 'Aucune coordonnée trouvée pour cette adresse.', variant: 'warning' })
      }
    } catch {
      toast({ title: 'Erreur', description: 'Échec du géocodage.', variant: 'error' })
    } finally {
      setGeocodeLoading(false)
    }
  }, [addressLine1, city, stateProvince, postalCode, country, toast])

  // Map picker callback
  const handleMapSelect = useCallback((lat: number, lng: number) => {
    setLatitude(String(lat))
    setLongitude(String(lng))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const addressData = {
      label,
      address_line1: addressLine1.trim(),
      address_line2: addressLine2.trim() || null,
      city: city.trim(),
      state_province: stateProvince.trim() || null,
      postal_code: postalCode.trim() || null,
      country: countryCodeToName(country),
      latitude: latitude.trim() ? parseFloat(latitude) : null,
      longitude: longitude.trim() ? parseFloat(longitude) : null,
      is_default: isDefault,
    }

    try {
      if (initial) {
        await updateAddress.mutateAsync({ id: initial.id, payload: addressData })
        toast({ title: 'Adresse modifiée', variant: 'success' })
      } else {
        await createAddress.mutateAsync({
          owner_type: ownerType,
          owner_id: ownerId,
          ...addressData,
        } as AddressCreate)
        toast({ title: 'Adresse créée', variant: 'success' })
      }
      onClose()
    } catch {
      toast({ title: 'Erreur', description: 'Impossible d\'enregistrer l\'adresse.', variant: 'error' })
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="border border-border/60 rounded-lg bg-card p-3 space-y-2.5">
        {/* Row 1: Type + Default checkbox */}
        <div className="flex items-center gap-2">
          <select className="gl-form-select text-xs h-8 flex-1" value={label} onChange={(e) => setLabel(e.target.value)}>
            {labelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
            Par défaut
          </label>
        </div>

        {/* Row 2: Address + City on same line */}
        <div className="grid grid-cols-2 gap-2">
          <input type="text" required className={`${panelInputClass} !text-xs !h-8`} placeholder="Adresse *" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
          <input type="text" required className={`${panelInputClass} !text-xs !h-8`} placeholder="Ville *" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>

        {/* Row 3: Country */}
        <CountrySelect value={country} onChange={setCountry} />

        {/* Expand toggle for optional fields */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
        >
          <ChevronsUpDown size={12} />
          {expanded ? 'Moins d\'options' : 'Plus d\'options'}
        </button>

        {expanded && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input type="text" className={`${panelInputClass} !text-xs !h-8`} placeholder="Ligne 2 (bâtiment...)" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
              <input type="text" className={`${panelInputClass} !text-xs !h-8`} placeholder="État / Province" value={stateProvince} onChange={(e) => setStateProvince(e.target.value)} />
            </div>
            <input type="text" className={`${panelInputClass} !text-xs !h-8`} placeholder="Code postal" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />

            {/* GPS compact */}
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-2">
                <input type="number" step="any" className={`${panelInputClass} !text-xs !h-8`} placeholder="Latitude" value={latitude} onChange={(e) => setLatitude(e.target.value)} />
                <input type="number" step="any" className={`${panelInputClass} !text-xs !h-8`} placeholder="Longitude" value={longitude} onChange={(e) => setLongitude(e.target.value)} />
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <button type="button" onClick={handleGeolocate} disabled={geoLoading} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-primary bg-primary/10 hover:bg-primary/20 border border-primary/30 transition-all">
                  {geoLoading ? <Loader2 size={10} className="animate-spin" /> : <LocateFixed size={10} />} GPS
                </button>
                <button type="button" onClick={handleGeocode} disabled={geocodeLoading} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 dark:text-emerald-300 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 dark:border-emerald-700 transition-all">
                  {geocodeLoading ? <Loader2 size={10} className="animate-spin" /> : <Search size={10} />} Géocoder
                </button>
                <button type="button" onClick={() => setShowMapPicker(true)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 dark:text-amber-300 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 dark:border-amber-700 transition-all">
                  <Map size={10} /> Carte
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-1.5 pt-1">
          <button type="button" onClick={onClose} className="gl-button-sm gl-button-default text-xs">Annuler</button>
          <button type="submit" disabled={!canSubmit} className="gl-button-sm gl-button-confirm text-xs">
            {isPending ? <Loader2 size={10} className="animate-spin" /> : initial ? 'Enregistrer' : 'Ajouter'}
          </button>
        </div>
      </form>

      <MapPickerModal
        open={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        latitude={latitude ? parseFloat(latitude) : null}
        longitude={longitude ? parseFloat(longitude) : null}
        onSelect={handleMapSelect}
      />
    </>
  )
}

// ── Main AddressManager Component ──────────────────────────

interface AddressManagerProps {
  /** Object type: 'user', 'tier', 'asset', 'entity' */
  ownerType: string
  /** UUID of the owning object */
  ownerId: string | undefined
  /** Optional: restrict label options */
  labelOptions?: typeof FALLBACK_LABEL_OPTIONS
  /** Compact mode (for detail panels) */
  compact?: boolean
  /** If true, opens the add form immediately on mount */
  initialShowForm?: boolean
}

export function AddressManager({ ownerType, ownerId, compact, initialShowForm }: AddressManagerProps) {
  const { toast } = useToast()
  const { data, isLoading } = useAddresses(ownerType, ownerId)
  const deleteAddress = useDeleteAddress()
  const dictLabelOptions = useDictionaryOptions('address_type')
  const labelOptions = dictLabelOptions.length > 0 ? dictLabelOptions : FALLBACK_LABEL_OPTIONS
  const dictLabels: Record<string, string> = {}
  for (const o of labelOptions) dictLabels[o.value] = o.label

  const [showForm, setShowForm] = useState(initialShowForm ?? false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const addresses: Address[] = data ?? []

  const handleDelete = async (id: string) => {
    try {
      await deleteAddress.mutateAsync(id)
      setConfirmDeleteId(null)
      toast({ title: 'Adresse supprimée', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de supprimer l\'adresse.', variant: 'error' })
    }
  }

  if (!ownerId) return null

  return (
    <div className="space-y-3">
      {/* Header with add button */}
      {!compact && (
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Adresses</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gérez les adresses associées à cet enregistrement.
            </p>
          </div>
          {!showForm && !editingId && (
            <button
              className="gl-button-sm gl-button-confirm"
              onClick={() => setShowForm(true)}
            >
              <Plus size={12} />
              Ajouter
            </button>
          )}
        </div>
      )}

      {/* Compact mode: text link style (same as PhoneManager/ContactEmailManager) */}
      {compact && !showForm && !editingId && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
          >
            <Plus size={12} /> Ajouter une adresse
          </button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <AddressForm
          ownerType={ownerType}
          ownerId={ownerId}
          onClose={() => setShowForm(false)}
          labelOptions={labelOptions}
        />
      )}

      {/* Address grid */}
      {!isLoading && addresses.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {addresses.map((addr) => {
            const badge = getLabelBadge(addr.label, dictLabels)
            const isConfirming = confirmDeleteId === addr.id
            const isEditing = editingId === addr.id

            if (isEditing) {
              return (
                <div key={addr.id} className="col-span-full">
                  <AddressForm
                    ownerType={ownerType}
                    ownerId={ownerId}
                    initial={addr}
                    onClose={() => setEditingId(null)}
                    labelOptions={labelOptions}
                  />
                </div>
              )
            }

            return (
              <div
                key={addr.id}
                className={`border rounded-lg bg-card p-4 transition-colors ${
                  addr.is_default
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border/60'
                }`}
              >
                {/* Header: badges */}
                <div className="flex items-center gap-2 mb-3">
                  <MapPin size={16} className="text-muted-foreground shrink-0" />
                  <span className={`gl-badge ${badge.className}`}>{badge.text}</span>
                  {addr.is_default && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-primary/10 text-primary">
                      <Star size={9} /> Par défaut
                    </span>
                  )}
                </div>

                {/* Address content */}
                <div className="min-w-0 mb-3">
                  <p className="text-sm font-medium text-foreground truncate">{formatAddress(addr)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{formatCityLine(addr)}</p>
                  {(addr.latitude != null && addr.longitude != null) && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <LocateFixed size={11} className="text-primary/60 shrink-0" />
                      <span className="text-xs text-muted-foreground font-mono tabular-nums">
                        {addr.latitude.toFixed(6)}, {addr.longitude.toFixed(6)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 pt-2 border-t border-border/30">
                  <button
                    className="gl-button-sm gl-button-default"
                    onClick={() => setEditingId(addr.id)}
                    title="Modifier"
                  >
                    <Pencil size={11} /> Modifier
                  </button>

                  {isConfirming ? (
                    <div className="flex items-center gap-1 ml-auto">
                      <button className="gl-button-sm gl-button-danger" onClick={() => handleDelete(addr.id)} disabled={deleteAddress.isPending}>
                        Oui
                      </button>
                      <button className="gl-button-sm gl-button-default" onClick={() => setConfirmDeleteId(null)}>
                        Non
                      </button>
                    </div>
                  ) : (
                    <button
                      className="gl-button-sm gl-button-danger ml-auto"
                      onClick={() => setConfirmDeleteId(addr.id)}
                      title="Supprimer"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !showForm && addresses.length === 0 && (
        <EmptyState icon={MapPin} title="Aucune adresse" description="Aucune adresse enregistrée." size="compact" />
      )}
    </div>
  )
}
