/**
 * Profile settings tab — user avatar, name, language, HR identity, travel, health, PPE.
 *
 * GitLab Pajamas pattern:
 * - Large avatar with initials fallback + upload on hover
 * - Sticky section headers (gl-heading-2)
 * - Labels 14px/600, inputs constrained to 640px max
 * - API-backed: PATCH /api/v1/profile, POST /api/v1/profile/avatar
 */
import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/authStore'
import { useUpdateProfile, useUploadAvatar } from '@/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'
import { Camera, Loader2, Pencil, Check, Plus, Download, Trash2 } from 'lucide-react'
import api from '@/lib/api'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { ImageEditor } from '@/components/shared/ImageEditor'
import { MobilePairingCard } from '@/components/shared/MobilePairingCard'

import { PhoneManager } from '@/components/shared/PhoneManager'
import { EmergencyContactManager } from '@/components/shared/EmergencyContactManager'
import { MedicalCheckManager } from '@/components/shared/MedicalCheckManager'
import { PassportManager } from '@/components/shared/PassportManager'
import { VisaManager } from '@/components/shared/VisaManager'

import { DrivingLicenseManager } from '@/components/shared/DrivingLicenseManager'
import { UserLanguageManager } from '@/components/shared/UserLanguageManager'
import { VaccineManager } from '@/components/shared/VaccineManager'
import { HealthConditionsChecklist } from '@/components/shared/HealthConditionsChecklist'
import { ReferentielManager } from '@/components/shared/ReferentielManager'
import { DefaultImputationSettingEditor } from '@/components/shared/DefaultImputationSettingEditor'
import { EmailsTab } from './EmailsTab'
import { AddressesTab } from './AddressesTab'
import { useDictionaryOptions, useDictionaryColumnOptions } from '@/hooks/useDictionary'
import { useJobPositions, useComplianceCheck } from '@/hooks/useConformite'
import type { ProfileUpdate } from '@/types/api'

const FALLBACK_GENDER = [
  { value: 'M', label: 'Homme' },
  { value: 'F', label: 'Femme' },
  { value: 'X', label: 'Autre' },
]

/** Searchable combobox for dictionary-driven fields */
function DictCombobox({ value, options, onChange, placeholder }: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    o.value.toLowerCase().includes(search.toLowerCase())
  )
  const selectedLabel = options.find((o) => o.value === value)?.label || value

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="gl-form-input text-left w-full flex items-center justify-between"
      >
        <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
          {value ? selectedLabel : (placeholder || '— Sélectionner —')}
        </span>
        <svg className="h-4 w-4 text-muted-foreground shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg max-h-52 overflow-hidden">
          <div className="p-1.5 border-b border-border">
            <input
              type="text"
              className="w-full bg-transparent text-sm px-2 py-1 outline-none placeholder:text-muted-foreground"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-40">
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
              onClick={() => { onChange(''); setOpen(false); setSearch('') }}
            >
              — Aucun —
            </button>
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent ${o.value === value ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'}`}
                onClick={() => { onChange(o.value); setOpen(false); setSearch('') }}
              >
                {o.label}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">Aucun résultat</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function ProfileTab() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const updateProfile = useUpdateProfile()
  const uploadAvatar = useUploadAvatar()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Add trigger refs for sub-model managers
  const addPhoneRef = useRef<(() => void) | null>(null)
  const addEmergencyRef = useRef<(() => void) | null>(null)
  const addPassportRef = useRef<(() => void) | null>(null)
  const addVisaRef = useRef<(() => void) | null>(null)

  const addMedicalRef = useRef<(() => void) | null>(null)
  const addVaccineRef = useRef<(() => void) | null>(null)
  const addLanguageRef = useRef<(() => void) | null>(null)
  const addLicenseRef = useRef<(() => void) | null>(null)

  // Dictionary hooks
  const dictGender = useDictionaryOptions('gender')
  const dictNationality = useDictionaryColumnOptions('nationality', 'nationality')
  const dictCountry = useDictionaryColumnOptions('nationality', 'country')
  const dictAirport = useDictionaryOptions('airport')
  const dictClothingSize = useDictionaryOptions('clothing_size')
  const dictShoeSize = useDictionaryOptions('shoe_size')
  const { data: jobPositionsData } = useJobPositions({ page_size: 200 })
  const jobPositionOptions = (jobPositionsData?.items ?? []).map(jp => ({ value: jp.id, label: `${jp.code} — ${jp.name}` }))

  // Compliance check for current user (always, rules target_type=all apply to everyone)
  const { data: complianceCheck, isLoading: complianceLoading } = useComplianceCheck(
    user ? 'user' : undefined,
    user?.id,
  )

  const genderOptions = dictGender.length > 0 ? dictGender : FALLBACK_GENDER

  const [form, setForm] = useState<ProfileUpdate>({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    language: user?.language || 'fr',
    // HR Identity
    passport_name: user?.passport_name || '',
    gender: user?.gender || '',
    nationality: user?.nationality || '',
    birth_country: user?.birth_country || '',
    birth_date: user?.birth_date || '',
    birth_city: user?.birth_city || '',
    // Travel
    contractual_airport: user?.contractual_airport || '',
    nearest_airport: user?.nearest_airport || '',
    nearest_station: user?.nearest_station || '',
    loyalty_program: user?.loyalty_program || '',
    // Body / PPE
    height: user?.height ?? null,
    weight: user?.weight ?? null,
    ppe_clothing_size: user?.ppe_clothing_size || '',
    ppe_clothing_size_bottom: user?.ppe_clothing_size_bottom || '',
    ppe_shoe_size: user?.ppe_shoe_size || '',
    // Misc
    // Job position
    job_position_id: user?.job_position_id || '',
  })

  // Sync form when user data refreshes
  useEffect(() => {
    if (user) {
      setForm({
        first_name: user.first_name,
        last_name: user.last_name,
        language: user.language,
        passport_name: user.passport_name || '',
        gender: user.gender || '',
        nationality: user.nationality || '',
        birth_country: user.birth_country || '',
        birth_date: user.birth_date || '',
        birth_city: user.birth_city || '',
        contractual_airport: user.contractual_airport || '',
        nearest_airport: user.nearest_airport || '',
        nearest_station: user.nearest_station || '',
        loyalty_program: user.loyalty_program || '',
        height: user.height ?? null,
        weight: user.weight ?? null,
        ppe_clothing_size: user.ppe_clothing_size || '',
        ppe_clothing_size_bottom: user.ppe_clothing_size_bottom || '',
        ppe_shoe_size: user.ppe_shoe_size || '',
        job_position_id: user.job_position_id || '',
      })
    }
  }, [user])

  const initials = user ? (`${user.first_name?.charAt(0) ?? ''}${user.last_name?.charAt(0) ?? ''}`.toUpperCase() || '?') : '?'

  // Compare form vs user to detect dirty state
  const isDirty = user ? (
    form.first_name !== user.first_name ||
    form.last_name !== user.last_name ||
    form.language !== user.language ||
    form.passport_name !== (user.passport_name || '') ||
    form.gender !== (user.gender || '') ||
    form.nationality !== (user.nationality || '') ||
    form.birth_country !== (user.birth_country || '') ||
    form.birth_date !== (user.birth_date || '') ||
    form.birth_city !== (user.birth_city || '') ||
    form.contractual_airport !== (user.contractual_airport || '') ||
    form.nearest_airport !== (user.nearest_airport || '') ||
    form.nearest_station !== (user.nearest_station || '') ||
    form.loyalty_program !== (user.loyalty_program || '') ||
    form.height !== (user.height ?? null) ||
    form.weight !== (user.weight ?? null) ||
    form.ppe_clothing_size !== (user.ppe_clothing_size || '') ||
    form.ppe_clothing_size_bottom !== (user.ppe_clothing_size_bottom || '') ||
    form.ppe_shoe_size !== (user.ppe_shoe_size || '') ||
    false
    // job_position_id, gender, nationality, birth_country are auto-saved — excluded from dirty check
  ) : false

  const handleSubmit = async () => {
    try {
      // Build payload — only send changed fields, convert empty strings to null for optional fields
      const payload: ProfileUpdate = {}
      if (form.first_name !== user?.first_name) payload.first_name = form.first_name
      if (form.last_name !== user?.last_name) payload.last_name = form.last_name
      if (form.language !== user?.language) payload.language = form.language
      // HR fields — send null for empty strings
      const optStr = (val: string | undefined | null) => val ? val : null
      if (form.passport_name !== (user?.passport_name || '')) payload.passport_name = optStr(form.passport_name as string)
      if (form.gender !== (user?.gender || '')) payload.gender = optStr(form.gender as string)
      if (form.nationality !== (user?.nationality || '')) payload.nationality = optStr(form.nationality as string)
      if (form.birth_country !== (user?.birth_country || '')) payload.birth_country = optStr(form.birth_country as string)
      if (form.birth_date !== (user?.birth_date || '')) payload.birth_date = optStr(form.birth_date as string)
      if (form.birth_city !== (user?.birth_city || '')) payload.birth_city = optStr(form.birth_city as string)
      if (form.contractual_airport !== (user?.contractual_airport || '')) payload.contractual_airport = optStr(form.contractual_airport as string)
      if (form.nearest_airport !== (user?.nearest_airport || '')) payload.nearest_airport = optStr(form.nearest_airport as string)
      if (form.nearest_station !== (user?.nearest_station || '')) payload.nearest_station = optStr(form.nearest_station as string)
      if (form.loyalty_program !== (user?.loyalty_program || '')) payload.loyalty_program = optStr(form.loyalty_program as string)
      if (form.height !== (user?.height ?? null)) payload.height = form.height
      if (form.weight !== (user?.weight ?? null)) payload.weight = form.weight
      if (form.ppe_clothing_size !== (user?.ppe_clothing_size || '')) payload.ppe_clothing_size = optStr(form.ppe_clothing_size as string)
      if (form.ppe_clothing_size_bottom !== (user?.ppe_clothing_size_bottom || '')) payload.ppe_clothing_size_bottom = optStr(form.ppe_clothing_size_bottom as string)
      if (form.ppe_shoe_size !== (user?.ppe_shoe_size || '')) payload.ppe_shoe_size = optStr(form.ppe_shoe_size as string)
      if (form.job_position_id !== (user?.job_position_id || '')) payload.job_position_id = (form.job_position_id as string) || null

      await updateProfile.mutateAsync(payload)
      toast({ title: t('settings.toast.profile.updated'), description: t('settings.toast.profile.updated_desc'), variant: 'success' })
    } catch {
      toast({ title: t('settings.toast.error'), description: t('settings.toast.profile.update_error'), variant: 'error' })
    }
  }

  const handleCancel = () => {
    if (user) {
      setForm({
        first_name: user.first_name,
        last_name: user.last_name,
        language: user.language,
        passport_name: user.passport_name || '',
        gender: user.gender || '',
        nationality: user.nationality || '',
        birth_country: user.birth_country || '',
        birth_date: user.birth_date || '',
        birth_city: user.birth_city || '',
        contractual_airport: user.contractual_airport || '',
        nearest_airport: user.nearest_airport || '',
        nearest_station: user.nearest_station || '',
        loyalty_program: user.loyalty_program || '',
        height: user.height ?? null,
        weight: user.weight ?? null,
        ppe_clothing_size: user.ppe_clothing_size || '',
        ppe_clothing_size_bottom: user.ppe_clothing_size_bottom || '',
        ppe_shoe_size: user.ppe_shoe_size || '',
        job_position_id: user.job_position_id || '',
      })
    }
  }

  const [editorSrc, setEditorSrc] = useState<string | null>(null)

  const { data: gdprExports = [], isLoading: gdprExportsLoading } = useQuery({
    queryKey: ['gdpr', 'my-exports'],
    queryFn: async () => {
      const { data } = await api.get('/api/v1/gdpr/my-exports')
      return data as Array<{
        filename: string
        created_at: string
        size_bytes: number
      }>
    },
  })

  const handleDownloadGdprExport = async (filename: string) => {
    try {
      const response = await api.get(`/api/v1/gdpr/download-export/${filename}`, {
        responseType: 'blob',
      })
      const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(blobUrl)
    } catch {
      toast({ title: t('settings.toast.error'), description: t('settings.toast.profile.export_download_error'), variant: 'error' })
    }
  }

  const handleDeleteGdprExport = async (filename: string) => {
    try {
      await api.delete(`/api/v1/gdpr/my-exports/${filename}`)
      queryClient.invalidateQueries({ queryKey: ['gdpr', 'my-exports'] })
      toast({ title: t('settings.toast.profile.export_deleted'), description: t('settings.toast.profile.export_deleted_desc'), variant: 'success' })
    } catch {
      toast({ title: t('settings.toast.error'), description: t('settings.toast.profile.export_delete_error'), variant: 'error' })
    }
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const validTypes = ['image/png', 'image/jpeg', 'image/webp']
    if (!validTypes.includes(file.type)) {
      toast({ title: t('settings.toast.profile.avatar_invalid_format'), description: t('settings.toast.profile.avatar_invalid_format_desc'), variant: 'error' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: t('settings.toast.profile.avatar_too_large'), description: t('settings.toast.profile.avatar_too_large_desc'), variant: 'error' })
      return
    }
    const url = URL.createObjectURL(file)
    setEditorSrc(url)
    e.target.value = ''
  }

  const handleEditorSave = async (blob: Blob) => {
    setEditorSrc(null)
    try {
      const file = new File([blob], 'avatar.png', { type: 'image/png' })
      await uploadAvatar.mutateAsync(file)
      toast({ title: t('settings.toast.profile.avatar_updated'), variant: 'success' })
    } catch {
      toast({ title: t('settings.toast.error'), description: t('settings.toast.profile.avatar_upload_error'), variant: 'error' })
    }
  }

  const updateField = (field: keyof ProfileUpdate, value: string | number | null) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  /** Auto-save a single field immediately (no save bar needed). */
  const autoSaveField = async (field: keyof ProfileUpdate, value: string | number | null) => {
    const previousValue = form[field]
    setForm((prev) => ({ ...prev, [field]: value }))
    try {
      const optStr = (v: string | number | null) => (typeof v === 'string' && v === '') ? null : v
      await updateProfile.mutateAsync({ [field]: optStr(value) })
    } catch (err: any) {
      // Revert on failure
      setForm((prev) => ({ ...prev, [field]: previousValue }))
      toast({ title: t('settings.toast.error'), description: err?.response?.data?.detail || t('settings.toast.profile.save_error'), variant: 'error' })
    }
  }

  return (
    <>
      {/* Section: Profil — avatar + nom inline editable + compliance */}
      <div className="flex items-start gap-5 mb-4">
        <div className="relative group shrink-0">
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt={`${user.first_name} ${user.last_name}`} className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">{initials}</div>
          )}
          <button
            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            title="Changer l'avatar"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadAvatar.isPending}
          >
            {uploadAvatar.isPending ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
          </button>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleAvatarChange} />
        </div>
        <div className="flex-1 min-w-0">
          <InlineNameEditor
            firstName={form.first_name || ''}
            lastName={form.last_name || ''}
            onFirstNameChange={(v) => updateField('first_name', v)}
            onLastNameChange={(v) => updateField('last_name', v)}
          />
          <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
        </div>
      </div>

      {/* Compliance status — full block under avatar */}
      {!complianceLoading && complianceCheck && (
        <div className="mb-4 rounded-lg border border-border bg-muted/20 p-3">
          <h4 className="text-xs font-semibold text-muted-foreground mb-2">Statut de conformité</h4>
          <div className="space-y-2">
            {complianceCheck.account_verified === false && (
              <div className="flex items-center gap-2 text-xs py-1.5 px-2.5 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-400">
                <span className="font-bold shrink-0">{'\u26A0'}</span>
                <span>Compte non vérifié — veuillez vérifier votre email ou téléphone pour être déclaré conforme.</span>
              </div>
            )}
            {(complianceCheck.total_unverified ?? 0) > 0 && (
              <div className="flex items-center gap-2 text-xs py-1.5 px-2.5 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-400">
                <span className="font-bold shrink-0">{'\u23F3'}</span>
                <span>{complianceCheck.total_unverified} enregistrement(s) en attente de validation.</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-foreground">
                    {complianceCheck.total_valid}/{complianceCheck.total_required} exigences satisfaites
                  </span>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold text-white ${complianceCheck.is_compliant ? 'bg-emerald-600' : 'bg-amber-600'}`}>
                    {complianceCheck.is_compliant ? 'Conforme' : 'Non conforme'}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${complianceCheck.is_compliant ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ width: `${complianceCheck.total_required > 0 ? Math.round((complianceCheck.total_valid / complianceCheck.total_required) * 100) : 0}%` }}
                  />
                </div>
              </div>
            </div>
            {Array.isArray(complianceCheck.details) && complianceCheck.details.length > 0 && (
              <div className="space-y-1 mt-2">
                {complianceCheck.details.map((detail, idx) => {
                  const d = detail as Record<string, unknown>
                  const cStatus = d.status as string
                  const statusIcon = cStatus === 'valid' || cStatus === 'exempted' ? '\u2713' : cStatus === 'expired' ? '\u26A0' : cStatus === 'unverified' ? '\u23F3' : '\u2717'
                  const statusColor = cStatus === 'valid' || cStatus === 'exempted' ? 'text-emerald-600' : cStatus === 'expired' ? 'text-amber-600' : cStatus === 'unverified' ? 'text-blue-500' : 'text-red-500'
                  const statusLabel = cStatus === 'valid' ? 'Valide' : cStatus === 'exempted' ? 'Exempté' : cStatus === 'expired' ? 'Expiré' : cStatus === 'unverified' ? 'En attente' : 'Manquant'
                  return (
                    <div key={idx} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-background/60">
                      <span className={`font-bold ${statusColor} shrink-0`}>{statusIcon}</span>
                      <span className="flex-1 text-foreground truncate">{(d.type_name as string) || (d.compliance_type_id as string)}</span>
                      <span className={`text-[10px] font-medium ${statusColor} shrink-0`}>{statusLabel}</span>
                    </div>
                  )
                })}
              </div>
            )}
            {complianceCheck.total_required === 0 && (
              <p className="text-xs text-muted-foreground">Aucune exigence de conformité applicable.</p>
            )}
          </div>
        </div>
      )}

      {/* Section: HR Identity — right after avatar */}
      <CollapsibleSection
        id="hr-identity"
        title="Identité"
        description="Informations d'identité utilisées pour les documents de voyage et administratifs."
        storageKey="settings.profile.collapse"
        showSeparator={false}
      >
        <div className="mt-2 space-y-4 max-w-[640px]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="gl-label">Nom passeport</label>
              <input type="text" className="gl-form-input" value={form.passport_name || ''} onChange={(e) => updateField('passport_name', e.target.value)} placeholder="NOM Prénom (tel qu'inscrit sur le passeport)" />
            </div>
            <div>
              <label className="gl-label">Genre</label>
              <select className="gl-form-input" value={form.gender || ''} onChange={(e) => autoSaveField('gender', e.target.value)}>
                <option value="">— Sélectionner —</option>
                {genderOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="gl-label">Nationalité</label>
              {dictNationality.length > 0 ? (
                <DictCombobox value={form.nationality as string || ''} options={dictNationality} onChange={(v) => autoSaveField('nationality', v)} placeholder="Rechercher une nationalité..." />
              ) : (
                <input type="text" className="gl-form-input" value={form.nationality || ''} onChange={(e) => updateField('nationality', e.target.value)} placeholder="ex: FR, GB, US" />
              )}
            </div>
            <div>
              <label className="gl-label">Date de naissance</label>
              <input type="date" className="gl-form-input" value={form.birth_date || ''} onChange={(e) => updateField('birth_date', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="gl-label">Ville de naissance</label>
              <input type="text" className="gl-form-input" value={form.birth_city || ''} onChange={(e) => updateField('birth_city', e.target.value)} />
            </div>
            <div>
              <label className="gl-label">Pays de naissance</label>
              {dictCountry.length > 0 ? (
                <DictCombobox value={form.birth_country as string || ''} options={dictCountry} onChange={(v) => autoSaveField('birth_country', v)} placeholder="Rechercher un pays..." />
              ) : (
                <input type="text" className="gl-form-input" value={form.birth_country || ''} onChange={(e) => updateField('birth_country', e.target.value)} placeholder="ex: FR, GB, US" />
              )}
            </div>
          </div>
          <div>
            <label className="gl-label">Poste / Fonction</label>
            {jobPositionOptions.length > 0 ? (
              <DictCombobox value={form.job_position_id as string || ''} options={jobPositionOptions} onChange={(v) => autoSaveField('job_position_id', v)} placeholder="Sélectionner un poste..." />
            ) : (
              <p className="text-xs text-muted-foreground py-2">Aucun poste défini (Conformité &gt; Fiches de poste)</p>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* Section: Coordonnées */}
      <EmailsTab />

      <CollapsibleSection
        id="user-phones"
        title="Téléphones"
        description="Vos numéros de téléphone : mobile, bureau, domicile."
        storageKey="settings.phones.collapse"
        defaultExpanded={false}
        headerAction={
          <button onClick={() => addPhoneRef.current?.()} className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-primary transition-colors" title="Ajouter">
            <Plus size={14} />
          </button>
        }
      >
        <div className="mt-2">
          <PhoneManager ownerType="user" ownerId={user?.id} hideAddButton onAddRef={(fn) => { addPhoneRef.current = fn }} />
        </div>
      </CollapsibleSection>

      <AddressesTab />

      <MobilePairingCard />

      <CollapsibleSection
        id="user-emergency-contacts"
        title="Contacts d'urgence"
        description="Personnes à contacter en cas d'urgence lors de vos missions."
        storageKey="settings.emergency.collapse"
        defaultExpanded={false}
        headerAction={
          <button onClick={() => addEmergencyRef.current?.()} className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-primary transition-colors" title="Ajouter">
            <Plus size={14} />
          </button>
        }
      >
        <div className="mt-2">
          {user?.id && <EmergencyContactManager userId={user.id} hideAddButton onAddRef={(fn) => { addEmergencyRef.current = fn }} />}
        </div>
      </CollapsibleSection>

      {/* Section: Documents administratifs */}
      <CollapsibleSection
        id="legal-docs"
        title="Documents administratifs"
        description="Passeports, visas, sécurité sociale — gérés via sous-modèles."
        storageKey="settings.profile.collapse"
        showSeparator={false}
      >
        <div className="mt-2 space-y-4">
          {user?.id && (
            <>
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <h4 className="text-xs font-semibold text-muted-foreground">Passeports</h4>
                  <button onClick={() => addPassportRef.current?.()} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors" title="Ajouter un passeport">
                    <Plus size={12} />
                  </button>
                </div>
                <PassportManager userId={user.id} hideAddButton onAddRef={(fn) => { addPassportRef.current = fn }} />
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <h4 className="text-xs font-semibold text-muted-foreground">Visas</h4>
                  <button onClick={() => addVisaRef.current?.()} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors" title="Ajouter un visa">
                    <Plus size={12} />
                  </button>
                </div>
                <VisaManager userId={user.id} hideAddButton onAddRef={(fn) => { addVisaRef.current = fn }} />
              </div>
            </>
          )}
        </div>
      </CollapsibleSection>

      {/* Section: Travel & Transport */}
      <CollapsibleSection
        id="default-imputation"
        title={t('settings.default_imputation.user_section_title')}
        description={t('settings.default_imputation.user_section_description')}
        storageKey="settings.profile.collapse"
        showSeparator={false}
      >
        <div className="mt-2">
          <DefaultImputationSettingEditor
            scope="user"
            title={t('settings.default_imputation.user_card_title')}
            description={t('settings.default_imputation.user_card_description')}
            hint={t('settings.default_imputation.user_card_hint')}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="travel"
        title="Voyage & Transport"
        description="Préférences de voyage pour la planification des missions."
        storageKey="settings.profile.collapse"
        showSeparator={false}
      >
        <div className="mt-2 space-y-4 max-w-[640px]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="gl-label">Aéroport contractuel</label>
              {dictAirport.length > 0 ? (
                <DictCombobox value={form.contractual_airport as string || ''} options={dictAirport} onChange={(v) => updateField('contractual_airport', v)} placeholder="Rechercher un aéroport..." />
              ) : (
                <input type="text" className="gl-form-input" value={form.contractual_airport || ''} onChange={(e) => updateField('contractual_airport', e.target.value)} placeholder="ex: CDG, LHR" />
              )}
            </div>
            <div>
              <label className="gl-label">Aéroport le plus proche</label>
              {dictAirport.length > 0 ? (
                <DictCombobox value={form.nearest_airport as string || ''} options={dictAirport} onChange={(v) => updateField('nearest_airport', v)} placeholder="Rechercher un aéroport..." />
              ) : (
                <input type="text" className="gl-form-input" value={form.nearest_airport || ''} onChange={(e) => updateField('nearest_airport', e.target.value)} placeholder="ex: ORY, LTN" />
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="gl-label">Gare la plus proche</label>
              <input type="text" className="gl-form-input" value={form.nearest_station || ''} onChange={(e) => updateField('nearest_station', e.target.value)} />
            </div>
            <div>
              <label className="gl-label">Programme de fidélité</label>
              <input type="text" className="gl-form-input" value={form.loyalty_program || ''} onChange={(e) => updateField('loyalty_program', e.target.value)} placeholder="ex: Flying Blue 12345678" />
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Section: Health & Medical */}
      <CollapsibleSection
        id="health"
        title="Santé & Médical"
        description="Visites médicales, vaccins et conditions de santé."
        storageKey="settings.profile.collapse"
        showSeparator={false}
      >
        <div className="mt-2 space-y-4">
          {user?.id && (
            <>
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <h4 className="text-xs font-semibold text-muted-foreground">Visites médicales</h4>
                  <button onClick={() => addMedicalRef.current?.()} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors" title="Ajouter une visite">
                    <Plus size={12} />
                  </button>
                </div>
                <MedicalCheckManager ownerType="user" ownerId={user.id} hideAddButton onAddRef={(fn) => { addMedicalRef.current = fn }} />
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <h4 className="text-xs font-semibold text-muted-foreground">Vaccins</h4>
                  <button onClick={() => addVaccineRef.current?.()} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors" title="Ajouter un vaccin">
                    <Plus size={12} />
                  </button>
                </div>
                <VaccineManager userId={user.id} hideAddButton onAddRef={(fn) => { addVaccineRef.current = fn }} />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">Conditions de santé</h4>
                <HealthConditionsChecklist userId={user.id} />
              </div>
            </>
          )}
        </div>
      </CollapsibleSection>

      {/* Section: Body Measurements / PPE */}
      <CollapsibleSection
        id="ppe"
        title="Mensurations & EPI"
        description="Informations pour la commande d'équipements de protection individuelle."
        storageKey="settings.profile.collapse"
        showSeparator={false}
      >
        <div className="mt-2 space-y-4 max-w-[640px]">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className="gl-label">Taille (cm)</label>
              <input type="number" className="gl-form-input" value={form.height ?? ''} onChange={(e) => updateField('height', e.target.value ? parseInt(e.target.value) : null)} placeholder="175" />
            </div>
            <div>
              <label className="gl-label">Poids (kg)</label>
              <input type="number" step="0.1" className="gl-form-input" value={form.weight ?? ''} onChange={(e) => updateField('weight', e.target.value ? parseFloat(e.target.value) : null)} placeholder="75" />
            </div>
            <div>
              <label className="gl-label">Pointure</label>
              {dictShoeSize.length > 0 ? (
                <select className="gl-form-input" value={form.ppe_shoe_size || ''} onChange={(e) => updateField('ppe_shoe_size', e.target.value)}>
                  <option value="">— Sélectionner —</option>
                  {dictShoeSize.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input type="text" className="gl-form-input" value={form.ppe_shoe_size || ''} onChange={(e) => updateField('ppe_shoe_size', e.target.value)} placeholder="42" />
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="gl-label">Taille vêtement (haut)</label>
              {dictClothingSize.length > 0 ? (
                <select className="gl-form-input" value={form.ppe_clothing_size || ''} onChange={(e) => updateField('ppe_clothing_size', e.target.value)}>
                  <option value="">— Sélectionner —</option>
                  {dictClothingSize.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input type="text" className="gl-form-input" value={form.ppe_clothing_size || ''} onChange={(e) => updateField('ppe_clothing_size', e.target.value)} placeholder="M, L, XL..." />
              )}
            </div>
            <div>
              <label className="gl-label">Taille vêtement (bas)</label>
              {dictClothingSize.length > 0 ? (
                <select className="gl-form-input" value={form.ppe_clothing_size_bottom || ''} onChange={(e) => updateField('ppe_clothing_size_bottom', e.target.value)}>
                  <option value="">— Sélectionner —</option>
                  {dictClothingSize.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input type="text" className="gl-form-input" value={form.ppe_clothing_size_bottom || ''} onChange={(e) => updateField('ppe_clothing_size_bottom', e.target.value)} placeholder="40, 42, 44..." />
              )}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Section: Compétences */}
      <CollapsibleSection
        id="skills"
        title="Compétences"
        description="Langues parlées et permis de conduire."
        storageKey="settings.profile.collapse"
        showSeparator={false}
      >
        <div className="mt-2 space-y-4">
          {user?.id && (
            <>
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <h4 className="text-xs font-semibold text-muted-foreground">Langues</h4>
                  <button onClick={() => addLanguageRef.current?.()} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors" title="Ajouter une langue">
                    <Plus size={12} />
                  </button>
                </div>
                <UserLanguageManager userId={user.id} hideAddButton onAddRef={(fn) => { addLanguageRef.current = fn }} />
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <h4 className="text-xs font-semibold text-muted-foreground">Permis de conduire</h4>
                  <button onClick={() => addLicenseRef.current?.()} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors" title="Ajouter un permis">
                    <Plus size={12} />
                  </button>
                </div>
                <DrivingLicenseManager userId={user.id} hideAddButton onAddRef={(fn) => { addLicenseRef.current = fn }} />
              </div>
            </>
          )}
        </div>
      </CollapsibleSection>

      {/* Section: Référentiels & Conformité */}
      <CollapsibleSection
        id="referentiels"
        title="Référentiels & Conformité"
        description="Formations, certifications, habilitations, audits — suivi de conformité."
        storageKey="settings.profile.collapse"
        showSeparator={false}
      >
        <div className="mt-2">
          {user?.id && <ReferentielManager ownerType="user" ownerId={user.id} />}
        </div>
      </CollapsibleSection>


      {/* Section: Comptes liés (SSO) */}
      <CollapsibleSection
        id="sso-accounts"
        title="Comptes liés"
        description="Associez vos comptes Google, Microsoft ou autre pour vous connecter facilement."
        storageKey="settings.profile.collapse"
        showSeparator={false}
      >
        <div className="mt-2">
          <LinkedSSOAccounts />
        </div>
      </CollapsibleSection>

      {/* RGPD — Mes données personnelles */}
      <CollapsibleSection
        id="gdpr-personal"
        title="Mes donnees personnelles (RGPD)"
        description="Exercez vos droits sur vos donnees personnelles conformement au RGPD."
        storageKey="settings.profile.collapse"
        showSeparator={false}
      >
        <div className="mt-3 space-y-3">
          <div className="flex items-start gap-4 p-3 rounded-lg border border-border bg-muted/20">
            <Download size={16} className="text-primary mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Exporter mes donnees</p>
              <p className="text-xs text-muted-foreground mt-0.5">Demander un export de vos donnees personnelles (Art. 15 & 20). Vous recevrez une notification et un email quand l'export sera pret.</p>
            </div>
            <button
              className="gl-button-sm gl-button-default shrink-0"
              onClick={async () => {
                try {
                  await api.post('/api/v1/gdpr/request-export')
                  queryClient.invalidateQueries({ queryKey: ['gdpr', 'my-exports'] })
                  toast({ title: t('settings.toast.profile.export_requested'), description: t('settings.toast.profile.export_requested_desc'), variant: 'success' })
                } catch { /* toast handled by interceptor */ }
              }}
            >
              <Download size={12} /> Demander l'export
            </button>
          </div>

          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-sm font-medium text-foreground">Exports prêts</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Quand un export est terminé, il apparaît ici avec son bouton de téléchargement.
            </p>
            <div className="mt-3 space-y-2">
              {gdprExportsLoading ? (
                <div className="text-xs text-muted-foreground">Chargement des exports…</div>
              ) : gdprExports.length === 0 ? (
                <div className="text-xs text-muted-foreground">Aucun export prêt pour le moment.</div>
              ) : (
                gdprExports.map((item) => (
                  <div key={item.filename} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-foreground">{item.filename}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {new Date(item.created_at).toLocaleString('fr-FR')} • {(item.size_bytes / 1024).toFixed(1)} Ko
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDownloadGdprExport(item.filename)}
                        className="gl-button-sm gl-button-default"
                      >
                        <Download size={12} /> Télécharger
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteGdprExport(item.filename)}
                        className="gl-button-sm gl-button-default text-red-600 hover:text-red-700"
                        title="Supprimer cet export"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex items-start gap-4 p-3 rounded-lg border border-red-500/30 bg-red-500/5">
            <Trash2 size={16} className="text-red-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Supprimer mon compte</p>
              <p className="text-xs text-muted-foreground mt-0.5">Anonymiser definitivement votre compte et supprimer vos donnees personnelles (Art. 17). Cette action est irreversible.</p>
            </div>
            <button
              className="gl-button-sm bg-red-600 text-white hover:bg-red-700 shrink-0"
              onClick={async () => {
                const confirmation = prompt("Tapez 'SUPPRIMER MON COMPTE' pour confirmer :")
                if (confirmation !== 'SUPPRIMER MON COMPTE') return
                try {
                  await api.post('/api/v1/gdpr/anonymize-my-account', { confirmation, reason: 'Demande utilisateur' })
                  localStorage.clear()
                  window.location.href = '/login'
                } catch { /* toast handled by interceptor */ }
              }}
            >
              <Trash2 size={12} /> Supprimer
            </button>
          </div>
        </div>
      </CollapsibleSection>

      {/* Floating save bar — only visible when there are unsaved changes */}
      {isDirty && (
        <div className="sticky bottom-0 z-30 -mx-6 px-6 py-3 bg-card/95 backdrop-blur border-t border-border shadow-lg flex items-center gap-3">
          <div className="flex-1 text-xs text-muted-foreground">Modifications non enregistrées</div>
          <button className="gl-button-sm gl-button-default" onClick={handleCancel}>Annuler</button>
          <button className="gl-button-sm gl-button-confirm" onClick={handleSubmit} disabled={updateProfile.isPending}>
            {updateProfile.isPending && <Loader2 size={12} className="animate-spin mr-1" />}
            Enregistrer
          </button>
        </div>
      )}

      {/* Image editor modal for avatar crop/rotate */}
      <ImageEditor
        open={!!editorSrc}
        imageSrc={editorSrc || ''}
        onSave={handleEditorSave}
        onClose={() => { setEditorSrc(null) }}
        aspectRatio={1}
        outputFormat="image/png"
      />
    </>
  )
}


// ─── Linked SSO Accounts ─────────────────────────────────────────────────────

const SSO_PROVIDER_META: Record<string, { name: string; color: string; icon: string }> = {
  google_oauth: { name: 'Google', color: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800', icon: 'G' },
  azure_ad: { name: 'Microsoft', color: 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800', icon: 'M' },
  okta: { name: 'Okta', color: 'bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800', icon: 'O' },
  keycloak: { name: 'Keycloak', color: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-800', icon: 'K' },
}

// ─── Inline Name Editor ──────────────────────────────────────────────────────

function InlineNameEditor({ firstName, lastName, onFirstNameChange, onLastNameChange }: {
  firstName: string; lastName: string
  onFirstNameChange: (v: string) => void; onLastNameChange: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="text"
          className="gl-form-input h-8 text-sm w-32"
          value={firstName}
          onChange={(e) => onFirstNameChange(e.target.value)}
          placeholder="Prénom"
          autoFocus
        />
        <input
          type="text"
          className="gl-form-input h-8 text-sm w-32"
          value={lastName}
          onChange={(e) => onLastNameChange(e.target.value)}
          placeholder="Nom"
        />
        <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground p-1">
          <Check size={14} />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-center gap-1.5 text-left"
    >
      <span className="text-base font-semibold text-foreground">{firstName} {lastName}</span>
      <Pencil size={12} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  )
}


function LinkedSSOAccounts() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [linked, setLinked] = useState<Array<{ id: string; provider: string; email: string | null; display_name: string | null; linked_at: string | null }>>([])
  const [available, setAvailable] = useState<Array<{ id: string; name: string; icon: string }>>([])
  const [loading, setLoading] = useState(true)
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const { default: api } = await import('@/lib/api')
        const [linkedRes, availableRes] = await Promise.all([
          api.get('/api/v1/auth/sso/linked-providers'),
          api.get('/api/v1/auth/sso/providers'),
        ])
        setLinked(linkedRes.data)
        setAvailable(availableRes.data)
      } catch {
        // SSO not configured — ignore
      } finally {
        setLoading(false)
      }
    }
    load()

    // Check URL for SSO link result
    const params = new URLSearchParams(window.location.search)
    const ssoLink = params.get('sso_link')
    if (ssoLink === 'success') {
      toast({ title: t('settings.toast.profile.sso_linked'), variant: 'success' })
      window.history.replaceState({}, '', window.location.pathname + window.location.hash)
    } else if (ssoLink === 'already_linked') {
      toast({ title: t('settings.toast.profile.sso_already_linked'), variant: 'warning' })
      window.history.replaceState({}, '', window.location.pathname + window.location.hash)
    } else if (ssoLink === 'error') {
      toast({ title: t('settings.toast.profile.sso_link_error'), variant: 'error' })
      window.history.replaceState({}, '', window.location.pathname + window.location.hash)
    }
  }, [toast])

  const handleLink = async (providerId: string) => {
    try {
      const { default: api } = await import('@/lib/api')
      const res = await api.get(`/api/v1/auth/sso/link?provider=${providerId}`)
      window.location.href = res.data.authorize_url
    } catch {
      toast({ title: t('settings.toast.error'), description: t('settings.toast.profile.sso_start_error'), variant: 'error' })
    }
  }

  const handleUnlink = async (linkId: string) => {
    try {
      const { default: api } = await import('@/lib/api')
      await api.delete(`/api/v1/auth/sso/linked-providers/${linkId}`)
      setLinked((prev) => prev.filter((p) => p.id !== linkId))
      setUnlinkingId(null)
      toast({ title: t('settings.toast.profile.sso_unlinked'), variant: 'success' })
    } catch {
      toast({ title: t('settings.toast.error'), variant: 'error' })
    }
  }

  if (loading) return <div className="flex items-center justify-center py-4"><Loader2 size={14} className="animate-spin text-muted-foreground" /></div>
  if (available.length === 0) return <p className="text-xs text-muted-foreground">Aucun fournisseur SSO configuré par l'administrateur.</p>

  const linkedProviderIds = new Set(linked.map((l) => l.provider))

  return (
    <div className="space-y-3">
      {/* Linked accounts */}
      {linked.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {linked.map((l) => {
            const meta = SSO_PROVIDER_META[l.provider] ?? { name: l.provider, color: 'bg-gray-50 text-gray-600 border-gray-200', icon: '?' }
            return (
              <div key={l.id} className={`flex items-center gap-3 py-2.5 px-3 rounded-lg border ${meta.color} group`}>
                <div className="h-8 w-8 rounded-full bg-white dark:bg-gray-800 border border-border/40 flex items-center justify-center text-sm font-bold shrink-0">
                  {meta.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{meta.name}</p>
                  <p className="text-xs opacity-70 truncate">{l.email || l.display_name}</p>
                </div>
                {unlinkingId === l.id ? (
                  <div className="flex items-center gap-1 shrink-0 text-xs">
                    <button onClick={() => handleUnlink(l.id)} className="px-2 py-0.5 rounded bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400">Oui</button>
                    <button onClick={() => setUnlinkingId(null)} className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400">Non</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setUnlinkingId(l.id)}
                    className="text-[10px] text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  >
                    Dissocier
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Available to link */}
      {available.filter((a) => !linkedProviderIds.has(a.id)).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {available.filter((a) => !linkedProviderIds.has(a.id)).map((a) => {
            const meta = SSO_PROVIDER_META[a.id] ?? { name: a.name, color: 'bg-gray-50 text-gray-600 border-gray-200', icon: '?' }
            return (
              <button
                key={a.id}
                onClick={() => handleLink(a.id)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/60 bg-card hover:bg-accent/50 hover:border-border text-sm font-medium transition-all"
              >
                <span className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">{meta.icon}</span>
                Lier {meta.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
