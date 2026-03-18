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
  DynamicPanelField,
  FormSection,
  TagSelector,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { MapPickerModal, forwardGeocode } from '@/components/shared/MapPicker'
import type { Address, AddressCreate } from '@/types/api'

const labelConfig: Record<string, { text: string; className: string }> = {
  domicile: { text: 'Domicile', className: 'gl-badge-success' },
  travail: { text: 'Travail', className: 'gl-badge-info' },
  ramassage: { text: 'Ramassage', className: 'gl-badge-warning' },
  site: { text: 'Site', className: 'gl-badge-info' },
  siege: { text: 'Siège', className: 'gl-badge-success' },
  autre: { text: 'Autre', className: 'gl-badge-neutral' },
}

const LABEL_OPTIONS = [
  { value: 'domicile', label: 'Domicile' },
  { value: 'travail', label: 'Travail' },
  { value: 'site', label: 'Site' },
  { value: 'siege', label: 'Siège' },
  { value: 'ramassage', label: 'Ramassage' },
  { value: 'autre', label: 'Autre' },
]

function getLabelBadge(label: string) {
  return labelConfig[label.toLowerCase()] ?? labelConfig.autre
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
}

function AddressForm({ ownerType, ownerId, initial, onClose }: AddressFormProps) {
  const { toast } = useToast()
  const createAddress = useCreateAddress()
  const updateAddress = useUpdateAddress()

  const [label, setLabel] = useState(initial?.label ?? 'domicile')
  const [addressLine1, setAddressLine1] = useState(initial?.address_line1 ?? '')
  const [addressLine2, setAddressLine2] = useState(initial?.address_line2 ?? '')
  const [city, setCity] = useState(initial?.city ?? '')
  const [stateProvince, setStateProvince] = useState(initial?.state_province ?? '')
  const [postalCode, setPostalCode] = useState(initial?.postal_code ?? '')
  const [country, setCountry] = useState(initial?.country ?? 'Cameroun')
  const [latitude, setLatitude] = useState(initial?.latitude != null ? String(initial.latitude) : '')
  const [longitude, setLongitude] = useState(initial?.longitude != null ? String(initial.longitude) : '')
  const [isDefault, setIsDefault] = useState(initial?.is_default ?? false)
  const [expanded, setExpanded] = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geocodeLoading, setGeocodeLoading] = useState(false)
  const [showMapPicker, setShowMapPicker] = useState(false)

  const isPending = createAddress.isPending || updateAddress.isPending
  const canSubmit = addressLine1.trim().length > 0 && city.trim().length > 0 && country.trim().length > 0 && !isPending

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
    const query = [addressLine1, city, stateProvince, postalCode, country].filter(Boolean).join(', ')
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
      country: country.trim(),
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
      <form onSubmit={handleSubmit} className="border border-border/60 rounded-lg bg-card p-4 space-y-4">
        <FormSection title="Type d'adresse">
          <TagSelector
            options={LABEL_OPTIONS}
            value={label}
            onChange={setLabel}
          />
        </FormSection>

        <div className="space-y-3">
          <DynamicPanelField label="Adresse ligne 1" required>
            <input type="text" required className={panelInputClass} placeholder="Numéro et nom de rue" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
          </DynamicPanelField>

          <DynamicPanelField label="Ville" required>
            <input type="text" required className={panelInputClass} placeholder="Ex: Douala" value={city} onChange={(e) => setCity(e.target.value)} />
          </DynamicPanelField>

          <DynamicPanelField label="Pays" required>
            <input type="text" required className={panelInputClass} placeholder="Cameroun" value={country} onChange={(e) => setCountry(e.target.value)} />
          </DynamicPanelField>
        </div>

        {/* Expand toggle for optional fields */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
        >
          <ChevronsUpDown size={14} />
          {expanded ? 'Moins d\'options' : 'Plus d\'options'}
        </button>

        {expanded && (
          <div className="space-y-3">
            <DynamicPanelField label="Adresse ligne 2">
              <input type="text" className={panelInputClass} placeholder="Bâtiment, étage..." value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
            </DynamicPanelField>

            <DynamicPanelField label="État / Province">
              <input type="text" className={panelInputClass} placeholder="Région (optionnel)" value={stateProvince} onChange={(e) => setStateProvince(e.target.value)} />
            </DynamicPanelField>

            <DynamicPanelField label="Code postal">
              <input type="text" className={panelInputClass} placeholder="Code postal (optionnel)" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
            </DynamicPanelField>

            {/* GPS with geolocation + geocoding + map picker */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="gl-label-sm">Coordonnées GPS</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input type="number" step="any" className={panelInputClass} placeholder="Latitude" value={latitude} onChange={(e) => setLatitude(e.target.value)} />
                <input type="number" step="any" className={panelInputClass} placeholder="Longitude" value={longitude} onChange={(e) => setLongitude(e.target.value)} />
              </div>

              {/* Action buttons row */}
              <div className="flex flex-wrap items-center gap-1.5">
                {/* GPS device position */}
                <button
                  type="button"
                  onClick={handleGeolocate}
                  disabled={geoLoading}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 border border-primary/30 transition-all"
                >
                  {geoLoading ? <Loader2 size={12} className="animate-spin" /> : <LocateFixed size={12} />}
                  Ma position
                </button>

                {/* Geocode address → coords */}
                <button
                  type="button"
                  onClick={handleGeocode}
                  disabled={geocodeLoading}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 dark:text-emerald-300 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 dark:border-emerald-700 transition-all"
                >
                  {geocodeLoading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                  Géocoder l'adresse
                </button>

                {/* Pick on map */}
                <button
                  type="button"
                  onClick={() => setShowMapPicker(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 dark:text-amber-300 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 dark:border-amber-700 transition-all"
                >
                  <Map size={12} />
                  Choisir sur la carte
                </button>
              </div>

              <p className="text-xs text-muted-foreground">
                <strong>Ma position</strong> : GPS de votre appareil. <strong>Géocoder</strong> : convertit l'adresse saisie en coordonnées. <strong>Carte</strong> : choisissez un point manuellement.
              </p>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="h-4 w-4 accent-primary mt-0.5" />
              <div>
                <span className="text-sm font-medium text-foreground">Adresse par défaut</span>
                <p className="text-xs text-muted-foreground">Sera utilisée comme adresse principale.</p>
              </div>
            </label>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="gl-button-sm gl-button-default">Annuler</button>
          <button type="submit" disabled={!canSubmit} className="gl-button-sm gl-button-confirm">
            {isPending ? <Loader2 size={12} className="animate-spin" /> : initial ? 'Enregistrer' : 'Ajouter'}
          </button>
        </div>
      </form>

      {/* Map Picker Modal */}
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
  labelOptions?: typeof LABEL_OPTIONS
  /** Compact mode (for detail panels) */
  compact?: boolean
  /** If true, opens the add form immediately on mount */
  initialShowForm?: boolean
}

export function AddressManager({ ownerType, ownerId, compact, initialShowForm }: AddressManagerProps) {
  const { toast } = useToast()
  const { data, isLoading } = useAddresses(ownerType, ownerId)
  const deleteAddress = useDeleteAddress()

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
        />
      )}

      {/* Address list */}
      {!isLoading && addresses.map((addr) => {
        const badge = getLabelBadge(addr.label)
        const isConfirming = confirmDeleteId === addr.id
        const isEditing = editingId === addr.id

        if (isEditing) {
          return (
            <AddressForm
              key={addr.id}
              ownerType={ownerType}
              ownerId={ownerId}
              initial={addr}
              onClose={() => setEditingId(null)}
            />
          )
        }

        return (
          <div key={addr.id} className="border border-border/60 rounded-lg bg-card px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <MapPin size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`gl-badge ${badge.className}`}>{badge.text}</span>
                    {addr.is_default && (
                      <span className="gl-badge gl-badge-success flex items-center gap-1">
                        <Star size={10} />
                        Par défaut
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-foreground">{formatAddress(addr)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatCityLine(addr)}</p>
                  {(addr.latitude != null && addr.longitude != null) && (
                    <p className="text-xs text-muted-foreground/70 mt-1 font-mono">
                      {addr.latitude.toFixed(6)}, {addr.longitude.toFixed(6)}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  className="gl-button-sm gl-button-default"
                  onClick={() => setEditingId(addr.id)}
                  title="Modifier"
                >
                  <Pencil size={12} />
                </button>

                {isConfirming ? (
                  <div className="flex items-center gap-1">
                    <button className="gl-button-sm gl-button-danger" onClick={() => handleDelete(addr.id)} disabled={deleteAddress.isPending}>
                      Oui
                    </button>
                    <button className="gl-button-sm gl-button-default" onClick={() => setConfirmDeleteId(null)}>
                      Non
                    </button>
                  </div>
                ) : (
                  <button
                    className="gl-button-sm gl-button-danger"
                    onClick={() => setConfirmDeleteId(addr.id)}
                    title="Supprimer"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {/* Empty state */}
      {!isLoading && !showForm && addresses.length === 0 && (
        <EmptyState icon={MapPin} title="Aucune adresse" description="Aucune adresse enregistrée." size="compact" />
      )}
    </div>
  )
}
