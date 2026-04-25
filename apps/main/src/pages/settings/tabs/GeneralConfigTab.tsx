/**
 * General Configuration tab — entity-level settings.
 *
 * Settings stored in DB via /api/v1/settings (scope=entity).
 * Includes: language, timezone, date format, map center, email branding.
 *
 * Sections are collapsible with deep-link support:
 *   #langue-region, #cartographie, #emails-config
 */
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Crosshair, MapPin, Upload, Image as ImageIcon } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
import api from '@/lib/api'
import { useToast, TOAST_POSITIONS } from '@/components/ui/Toast'
import { TagSelector } from '@/components/layout/DynamicPanel'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { MapPickerModal } from '@/components/shared/MapPicker'
import { useSaveScopedSetting, useScopedSettingsMap } from '@/hooks/useSettings'

// ── Setting Row component ──
function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-3 border-b border-border/50 last:border-0">
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function GeneralConfigTab() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { data: settings, isLoading } = useScopedSettingsMap('entity')
  const mutation = useSaveScopedSetting('entity')

  const save = useCallback((key: string, value: unknown) => {
    mutation.mutate(
      { key, value },
      {
        onSuccess: () => {
          toast({ title: t('settings.toast.general.setting_saved'), variant: 'success' })
        },
        onError: () => {
          toast({ title: t('settings.toast.error'), description: t('settings.toast.general.setting_save_error'), variant: 'error' })
        },
      },
    )
  }, [mutation, toast])

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('path', 'branding')
      const { data } = await api.post('/api/v1/admin/fs/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return `/static/${data.path || `branding/${file.name}`}`
    },
    onSuccess: () => {
      toast({ title: t('settings.toast.general.logo_uploaded'), variant: 'success' })
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  const s = settings ?? {}
  return (
    <>
      {/* ── Langue & Région ── */}
      <CollapsibleSection
        id="langue-region"
        title={t('settings.langue_region')}
        description="Paramètres régionaux pour cette entité. Affecte tous les utilisateurs de l'entité."
        storageKey="settings.general-config.collapse"
      >
        <div className="mt-2 space-y-0">
          <SettingRow label={t('settings.langue_par_defaut')} description="Langue de l'interface pour les nouveaux utilisateurs.">
            <TagSelector
              options={[
                { value: 'fr', label: 'Français' },
                { value: 'en', label: 'English' },
              ]}
              value={(s['core.default_language'] as string) ?? 'fr'}
              onChange={(v) => save('core.default_language', v)}
            />
          </SettingRow>

          <SettingRow label="Fuseau horaire" description="Fuseau horaire de l'entité. Utilisé pour les dates, crons et planifications.">
            <select
              className="gl-form-select text-sm"
              value={(s['core.timezone'] as string) ?? 'Africa/Douala'}
              onChange={(e) => save('core.timezone', e.target.value)}
            >
              <option value="Africa/Douala">Africa/Douala (WAT)</option>
              <option value="Africa/Lagos">Africa/Lagos (WAT)</option>
              <option value="Africa/Libreville">Africa/Libreville (WAT)</option>
              <option value="Europe/Paris">Europe/Paris (CET)</option>
              <option value="Europe/London">Europe/London (GMT)</option>
              <option value="America/New_York">America/New_York (EST)</option>
              <option value="UTC">UTC</option>
            </select>
          </SettingRow>

          <SettingRow label={t('export.date_format')} description="Format d'affichage des dates dans toute l'application.">
            <TagSelector
              options={[
                { value: 'dd/MM/yyyy', label: 'dd/MM/yyyy' },
                { value: 'MM/dd/yyyy', label: 'MM/dd/yyyy' },
                { value: 'yyyy-MM-dd', label: 'yyyy-MM-dd' },
              ]}
              value={(s['core.date_format'] as string) ?? 'dd/MM/yyyy'}
              onChange={(v) => save('core.date_format', v)}
            />
          </SettingRow>
        </div>
      </CollapsibleSection>

      {/* ── Tableaux de données ── */}
      <CollapsibleSection
        id="datatable-config"
        title={t('settings.tableaux_de_donnees')}
        description={t('settings.nombre_de_lignes_par_page_par_defaut_pou')}
        storageKey="settings.general-config.collapse"
      >
        <div className="mt-2 space-y-0">
          <SettingRow label="Lignes par page" description={t('settings.nombre_de_lignes_affichees_par_defaut_da')}>
            <select
              className="gl-form-select text-sm"
              value={(s['datatable.page_size'] as number) ?? 25}
              onChange={(e) => save('datatable.page_size', Number(e.target.value))}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>{n} lignes</option>
              ))}
            </select>
          </SettingRow>

          <SettingRow label="Maximum lignes par page" description={t('settings.limite_maximale_que_les_utilisateurs_peu')}>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={50}
                max={5000}
                step={50}
                className="gl-form-input w-24 text-sm text-right font-mono"
                defaultValue={(s['datatable.max_page_size'] as number) ?? 500}
                onBlur={(e) => {
                  const val = Math.max(50, Math.min(5000, Math.round(Number(e.target.value) || 500)))
                  save('datatable.max_page_size', val)
                }}
              />
              <span className="text-xs text-muted-foreground">lignes</span>
            </div>
          </SettingRow>
        </div>
      </CollapsibleSection>

      {/* ── Cartographie ── */}
      <CollapsibleSection
        id="cartographie"
        title="Cartographie"
        description={t('settings.position_par_defaut_de_la_carte_cliquez')}
        storageKey="settings.general-config.collapse"
      >
        <CartographySection settings={s} save={save} />
      </CollapsibleSection>

      {/* ── Notifications ── */}
      <CollapsibleSection
        id="notifications-config"
        title="Notifications"
        description={t('settings.parametres_par_defaut_des_notifications')}
        storageKey="settings.general-config.collapse"
      >
        <div className="mt-2 space-y-0">
          <SettingRow label={t('settings.position_par_defaut')} description="Position d'affichage des notifications toast à l'écran.">
            <select
              className="gl-form-select text-sm"
              value={(s['core.toast_position'] as string) ?? 'bottom-right'}
              onChange={(e) => save('core.toast_position', e.target.value)}
            >
              {TOAST_POSITIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </SettingRow>

          <SettingRow label={t('settings.duree_par_defaut')} description="Durée d'affichage des notifications (en secondes). Min 1s, max 30s.">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={30}
                step={0.5}
                className="gl-form-input w-20 text-sm text-right font-mono"
                defaultValue={((s['core.toast_duration'] as number) ?? 4000) / 1000}
                onBlur={(e) => {
                  const val = Math.max(1, Math.min(30, parseFloat(e.target.value) || 4))
                  save('core.toast_duration', Math.round(val * 1000))
                }}
              />
              <span className="text-xs text-muted-foreground">secondes</span>
            </div>
          </SettingRow>

          <SettingRow label={t('settings.opacite_par_defaut')} description={t('settings.opacite_des_notifications_toast_10_a_100')}>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={10}
                max={100}
                step={5}
                className="gl-form-input w-20 text-sm text-right font-mono"
                defaultValue={(s['core.toast_opacity'] as number) ?? 100}
                onBlur={(e) => {
                  const val = Math.max(10, Math.min(100, Math.round(parseFloat(e.target.value) || 100)))
                  save('core.toast_opacity', val)
                }}
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </SettingRow>
        </div>
      </CollapsibleSection>

      {/* ── Emails ── */}
      <CollapsibleSection
        id="emails-config"
        title="Emails"
        description="Personnalisation de l'apparence des emails envoyés par OpsFlux."
        storageKey="settings.general-config.collapse"
      >
        <div className="mt-2 space-y-0">
          <SettingRow label="Logo email" description="Logo affiché dans l'en-tête des emails envoyés par OpsFlux.">
            <EmailLogoUpload
              currentUrl={(s['core.email_header_logo_url'] as string) ?? '/static/logo-opsflux.png'}
              onSave={(url) => save('core.email_header_logo_url', url)}
              uploadMutation={uploadMutation}
            />
          </SettingRow>

          <SettingRow label={t('settings.texte_de_pied_de_page')} description={t('settings.texte_affiche_en_bas_de_chaque_email')}>
            <input
              type="text"
              className="gl-form-input w-48 text-sm"
              defaultValue={(s['core.email_footer_text'] as string) ?? 'OpsFlux'}
              onBlur={(e) => save('core.email_footer_text', e.target.value)}
            />
          </SettingRow>

          <SettingRow label="Couleur d'accent" description={t('settings.couleur_principale_des_boutons_et_liens')}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-8 w-8 rounded border border-border cursor-pointer"
                defaultValue={(s['core.email_accent_color'] as string) ?? '#1a56db'}
                onBlur={(e) => save('core.email_accent_color', e.target.value)}
              />
              <span className="text-xs text-muted-foreground font-mono">
                {(s['core.email_accent_color'] as string) ?? '#1a56db'}
              </span>
            </div>
          </SettingRow>
        </div>
      </CollapsibleSection>

      {/* ── Cartographie ── (niche: only for tenants using map features) */}
      <CollapsibleSection
        id="cartographie"
        title="Cartographie"
        description={t('settings.position_par_defaut_de_la_carte_cliquez')}
        storageKey="settings.general-config.collapse"
        showSeparator={false}
      >
        <CartographySection settings={s} save={save} />
      </CollapsibleSection>
    </>
  )
}

// ── Email Logo Upload component ────────────────────────
function EmailLogoUpload({
  currentUrl,
  onSave,
  uploadMutation,
}: {
  currentUrl: string
  onSave: (url: string) => void
  uploadMutation: UseMutationResult<string, unknown, File, unknown>
}) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState(currentUrl)
  const apiBase = import.meta.env.VITE_API_URL || ''

  const resolvedUrl = preview.startsWith('/') ? `${apiBase}${preview}` : preview

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const uploadedPath = await uploadMutation.mutateAsync(file)
      setPreview(uploadedPath)
      onSave(uploadedPath)
    } catch {
      // fallback: keep current
    }
    e.target.value = ''
  }

  return (
    <div className="flex items-center gap-3">
      {/* Thumbnail preview */}
      <div className="h-10 w-24 rounded border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
        {preview ? (
          <img src={resolvedUrl} alt="Logo" className="h-full w-full object-contain p-1" onError={() => setPreview('')} />
        ) : (
          <ImageIcon size={16} className="text-muted-foreground/40" />
        )}
      </div>

      {/* Upload button */}
      <button
        className="gl-button-sm gl-button-default items-center gap-1.5"
        onClick={() => fileRef.current?.click()}
        disabled={uploadMutation.isPending}
      >
        {uploadMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
        Charger
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />

      {/* URL input */}
      <input
        type="text"
        className="gl-form-input w-48 text-xs"
        placeholder={t('settings.ou_saisir_une_url')}
        defaultValue={currentUrl}
        onBlur={(e) => {
          if (e.target.value !== preview) {
            setPreview(e.target.value)
            onSave(e.target.value)
          }
        }}
      />
    </div>
  )
}

// ── Cartography sub-section with MapPicker modal ──────
function CartographySection({
  settings: s,
  save,
}: {
  settings: Record<string, unknown>
  save: (key: string, value: unknown) => void
}) {
  const { t } = useTranslation()
  const currentLat = (s['core.map_default_lat'] as number) ?? 3.848
  const currentLng = (s['core.map_default_lng'] as number) ?? 9.54
  const currentZoom = (s['core.map_default_zoom'] as number) ?? 8

  const [lat, setLat] = useState(currentLat)
  const [lng, setLng] = useState(currentLng)
  const [zoom, setZoom] = useState(currentZoom)
  const [dirty, setDirty] = useState(false)
  const [showMap, setShowMap] = useState(false)

  const handleMapSelect = useCallback((newLat: number, newLng: number) => {
    setLat(newLat)
    setLng(newLng)
    setDirty(true)
  }, [])

  const handleSave = useCallback(() => {
    save('core.map_default_lat', lat)
    save('core.map_default_lng', lng)
    save('core.map_default_zoom', zoom)
    setDirty(false)
  }, [lat, lng, zoom, save])

  const handleGeolocate = useCallback(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude)
        setLng(pos.coords.longitude)
        setDirty(true)
      },
      () => { /* silently ignore denied permission */ },
    )
  }, [])

  return (
    <div className="mt-2 space-y-4">
      {/* Coordinates + zoom row */}
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Latitude</label>
          <input
            type="number"
            step="any"
            className="gl-form-input w-36 text-sm font-mono"
            value={lat}
            onChange={(e) => { setLat(parseFloat(e.target.value) || 0); setDirty(true) }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Longitude</label>
          <input
            type="number"
            step="any"
            className="gl-form-input w-36 text-sm font-mono"
            value={lng}
            onChange={(e) => { setLng(parseFloat(e.target.value) || 0); setDirty(true) }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Zoom (1-18)</label>
          <input
            type="number"
            min={1}
            max={18}
            className="gl-form-input w-20 text-sm"
            value={zoom}
            onChange={(e) => { setZoom(parseInt(e.target.value) || 8); setDirty(true) }}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setShowMap(true)}
          className="gl-button-sm gl-button-default"
        >
          <MapPin size={12} />
          Choisir sur la carte
        </button>
        <button
          type="button"
          onClick={handleGeolocate}
          className="gl-button-sm gl-button-default"
          title={t('settings.utiliser_ma_position')}
        >
          <Crosshair size={12} />
          Ma position
        </button>
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          className="gl-button gl-button-confirm"
          onClick={handleSave}
          disabled={!dirty}
        >
          Enregistrer la position
        </button>
        {dirty && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            Modifications non enregistrées
          </span>
        )}
      </div>

      {/* MapPicker modal — mount only when open */}
      {showMap && (
        <MapPickerModal
          open
          onClose={() => setShowMap(false)}
          latitude={lat}
          longitude={lng}
          onSelect={handleMapSelect}
        />
      )}
    </div>
  )
}
