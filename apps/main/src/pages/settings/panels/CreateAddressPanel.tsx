/**
 * Create / Edit Address panel — opens in DynamicPanelShell (right side).
 *
 * Uses the shared AddressManager inline form pattern.
 * Reads ownerType/ownerId from dynamic panel meta,
 * defaults to current user if not specified.
 */
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { MapPin, Loader2, LocateFixed } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { useAddresses, useCreateAddress, useUpdateAddress } from '@/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormSection,
  PanelActionButton,
  TagSelector,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { CountrySelect, COUNTRIES } from '@/components/shared/CountrySelect'
import type { AddressCreate } from '@/types/api'

function countryNameToCode(name: string): string {
  const c = COUNTRIES.find((c) => c.name.toLowerCase() === name.toLowerCase())
  return c?.code ?? ''
}

function countryCodeToName(code: string): string {
  const c = COUNTRIES.find((c) => c.code === code)
  return c?.name ?? code
}

const LABEL_OPTIONS = [
  { value: 'domicile', label: 'Domicile' },
  { value: 'travail', label: 'Travail' },
  { value: 'site', label: 'Site' },
  { value: 'siege', label: 'Siège' },
  { value: 'ramassage', label: 'Ramassage' },
  { value: 'autre', label: 'Autre' },
]

export function CreateAddressPanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const userId = useAuthStore((s) => s.user?.id)
  const createAddress = useCreateAddress()
  const updateAddress = useUpdateAddress()

  // Determine owner from panel meta, default to current user
  const ownerType = typeof dynamicPanel?.meta?.ownerType === 'string' ? dynamicPanel.meta.ownerType : 'user'
  const ownerId = typeof dynamicPanel?.meta?.ownerId === 'string' ? dynamicPanel.meta.ownerId : (userId ?? '')

  const isEdit = dynamicPanel?.type === 'edit'
  const editId = dynamicPanel?.type === 'edit' ? dynamicPanel.id : null
  const { data: addresses } = useAddresses(ownerType, (ownerId || undefined) as string | undefined)
  const editingAddress = isEdit && addresses ? addresses.find((a) => a.id === editId) : null

  const [label, setLabel] = useState('domicile')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [city, setCity] = useState('')
  const [stateProvince, setStateProvince] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [country, setCountry] = useState('CM')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)

  // Populate fields when editing
  useEffect(() => {
    if (editingAddress) {
      setLabel(editingAddress.label)
      setAddressLine1(editingAddress.address_line1)
      setAddressLine2(editingAddress.address_line2 ?? '')
      setCity(editingAddress.city)
      setStateProvince(editingAddress.state_province ?? '')
      setPostalCode(editingAddress.postal_code ?? '')
      setCountry(countryNameToCode(editingAddress.country) || 'CM')
      setLatitude(editingAddress.latitude != null ? String(editingAddress.latitude) : '')
      setLongitude(editingAddress.longitude != null ? String(editingAddress.longitude) : '')
      setIsDefault(editingAddress.is_default)
    }
  }, [editingAddress])

  const isPending = createAddress.isPending || updateAddress.isPending
  const canSubmit = addressLine1.trim().length > 0 && city.trim().length > 0 && country.length > 0 && !isPending

  const handleGeolocate = useCallback(() => {
    if (!navigator.geolocation) {
      toast({ title: t('settings.toast.addresses.geolocation_unsupported'), description: t('settings.toast.addresses.geolocation_unsupported_desc'), variant: 'warning' })
      return
    }
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(String(pos.coords.latitude))
        setLongitude(String(pos.coords.longitude))
        setGeoLoading(false)
        toast({ title: t('settings.toast.addresses.position_obtained'), variant: 'success' })
      },
      (err) => {
        setGeoLoading(false)
        toast({ title: t('settings.toast.addresses.gps_error'), description: err.message, variant: 'error' })
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }, [toast])

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
      if (isEdit && editId) {
        await updateAddress.mutateAsync({ id: editId, payload: addressData })
        toast({ title: t('settings.toast.addresses.updated'), variant: 'success' })
      } else {
        await createAddress.mutateAsync({
          owner_type: ownerType,
          owner_id: ownerId,
          ...addressData,
        } as AddressCreate)
        toast({ title: t('settings.toast.addresses.created'), variant: 'success' })
      }
      closeDynamicPanel()
    } catch {
      toast({ title: t('settings.toast.error'), description: t('settings.toast.addresses.save_error'), variant: 'error' })
    }
  }

  return (
    <DynamicPanelShell
      title={isEdit ? 'Modifier l\'adresse' : 'Nouvelle adresse'}
      icon={<MapPin size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>Annuler</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={!canSubmit}
            onClick={() => (document.getElementById('create-address-form') as HTMLFormElement | null)?.requestSubmit()}
          >
            {isPending ? <Loader2 size={12} className="animate-spin" /> : isEdit ? 'Enregistrer' : 'Créer l\'adresse'}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-address-form" onSubmit={handleSubmit} className="p-4 space-y-5">
        {/* Type — TagSelector instead of <select> */}
        <FormSection title="Type d'adresse">
          <TagSelector
            options={LABEL_OPTIONS}
            value={label}
            onChange={setLabel}
          />
        </FormSection>

        <FormSection title="Informations">
          <DynamicPanelField label="Adresse ligne 1" required>
            <input type="text" className={panelInputClass} placeholder="Numéro et nom de rue" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
          </DynamicPanelField>

          <DynamicPanelField label="Ville" required>
            <input type="text" className={panelInputClass} placeholder="Ex: Douala" value={city} onChange={(e) => setCity(e.target.value)} />
          </DynamicPanelField>

          <DynamicPanelField label="Pays" required>
            <CountrySelect value={country} onChange={setCountry} />
          </DynamicPanelField>
        </FormSection>

        <FormSection title="Détails supplémentaires" collapsible defaultExpanded={false} storageKey="panel.address.sections" id="address-details">
          <DynamicPanelField label="Adresse ligne 2">
            <input type="text" className={panelInputClass} placeholder="Appartement, bâtiment, étage (optionnel)" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
          </DynamicPanelField>

          <DynamicPanelField label="État / Province">
            <input type="text" className={panelInputClass} placeholder="Région ou province (optionnel)" value={stateProvince} onChange={(e) => setStateProvince(e.target.value)} />
          </DynamicPanelField>

          <DynamicPanelField label="Code postal">
            <input type="text" className={panelInputClass} placeholder="Code postal (optionnel)" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
          </DynamicPanelField>
        </FormSection>

        <FormSection title="Coordonnées GPS" collapsible defaultExpanded={false} storageKey="panel.address.sections" id="address-gps">
          <div className="flex items-center justify-between mb-2">
            <span className="gl-label-sm">Position</span>
            <button
              type="button"
              onClick={handleGeolocate}
              disabled={geoLoading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 border border-primary/30 transition-all"
            >
              {geoLoading ? <Loader2 size={12} className="animate-spin" /> : <LocateFixed size={12} />}
              Ma position
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <DynamicPanelField label="Latitude">
              <input type="number" step="any" className={panelInputClass} placeholder="Ex: 4.051056" value={latitude} onChange={(e) => setLatitude(e.target.value)} />
            </DynamicPanelField>
            <DynamicPanelField label="Longitude">
              <input type="number" step="any" className={panelInputClass} placeholder="Ex: 9.767869" value={longitude} onChange={(e) => setLongitude(e.target.value)} />
            </DynamicPanelField>
          </div>
          <p className="text-xs text-muted-foreground">
            Utilisez "Ma position" pour remplir automatiquement via le GPS de votre appareil.
          </p>
        </FormSection>

        <FormSection title="Options" collapsible defaultExpanded={false} storageKey="panel.address.sections" id="address-options">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="h-4 w-4 accent-primary mt-0.5" />
            <div>
              <span className="text-sm font-medium text-foreground">Adresse par défaut</span>
              <p className="text-xs text-muted-foreground">
                Cette adresse sera utilisée comme adresse principale dans les formulaires.
              </p>
            </div>
          </label>
        </FormSection>
      </form>
    </DynamicPanelShell>
  )
}
