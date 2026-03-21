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
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/authStore'
import { useUpdateProfile, useUploadAvatar } from '@/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'
import { Camera, Loader2 } from 'lucide-react'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { ImageEditor } from '@/components/shared/ImageEditor'
import { PhoneManager } from '@/components/shared/PhoneManager'
import { EmergencyContactManager } from '@/components/shared/EmergencyContactManager'
import { EmailsTab } from './EmailsTab'
import { AddressesTab } from './AddressesTab'
import type { ProfileUpdate } from '@/types/api'

const GENDER_OPTIONS = [
  { value: 'M', label: 'Homme' },
  { value: 'F', label: 'Femme' },
  { value: 'X', label: 'Autre' },
]

export function ProfileTab() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const { toast } = useToast()
  const updateProfile = useUpdateProfile()
  const uploadAvatar = useUploadAvatar()
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    // Health / Medical
    last_medical_check: user?.last_medical_check || '',
    last_international_medical_check: user?.last_international_medical_check || '',
    last_subsidiary_medical_check: user?.last_subsidiary_medical_check || '',
    // Body / PPE
    height: user?.height ?? null,
    weight: user?.weight ?? null,
    ppe_clothing_size: user?.ppe_clothing_size || '',
    ppe_clothing_size_bottom: user?.ppe_clothing_size_bottom || '',
    ppe_shoe_size: user?.ppe_shoe_size || '',
    // Misc
    retirement_date: user?.retirement_date || '',
    vantage_number: user?.vantage_number || '',
    extension_number: user?.extension_number || '',
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
        last_medical_check: user.last_medical_check || '',
        last_international_medical_check: user.last_international_medical_check || '',
        last_subsidiary_medical_check: user.last_subsidiary_medical_check || '',
        height: user.height ?? null,
        weight: user.weight ?? null,
        ppe_clothing_size: user.ppe_clothing_size || '',
        ppe_clothing_size_bottom: user.ppe_clothing_size_bottom || '',
        ppe_shoe_size: user.ppe_shoe_size || '',
        retirement_date: user.retirement_date || '',
        vantage_number: user.vantage_number || '',
        extension_number: user.extension_number || '',
      })
    }
  }, [user])

  const initials = user ? `${user.first_name[0]}${user.last_name[0]}` : '?'

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
    form.last_medical_check !== (user.last_medical_check || '') ||
    form.last_international_medical_check !== (user.last_international_medical_check || '') ||
    form.last_subsidiary_medical_check !== (user.last_subsidiary_medical_check || '') ||
    form.height !== (user.height ?? null) ||
    form.weight !== (user.weight ?? null) ||
    form.ppe_clothing_size !== (user.ppe_clothing_size || '') ||
    form.ppe_clothing_size_bottom !== (user.ppe_clothing_size_bottom || '') ||
    form.ppe_shoe_size !== (user.ppe_shoe_size || '') ||
    form.retirement_date !== (user.retirement_date || '') ||
    form.vantage_number !== (user.vantage_number || '') ||
    form.extension_number !== (user.extension_number || '')
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
      if (form.last_medical_check !== (user?.last_medical_check || '')) payload.last_medical_check = optStr(form.last_medical_check as string)
      if (form.last_international_medical_check !== (user?.last_international_medical_check || '')) payload.last_international_medical_check = optStr(form.last_international_medical_check as string)
      if (form.last_subsidiary_medical_check !== (user?.last_subsidiary_medical_check || '')) payload.last_subsidiary_medical_check = optStr(form.last_subsidiary_medical_check as string)
      if (form.height !== (user?.height ?? null)) payload.height = form.height
      if (form.weight !== (user?.weight ?? null)) payload.weight = form.weight
      if (form.ppe_clothing_size !== (user?.ppe_clothing_size || '')) payload.ppe_clothing_size = optStr(form.ppe_clothing_size as string)
      if (form.ppe_clothing_size_bottom !== (user?.ppe_clothing_size_bottom || '')) payload.ppe_clothing_size_bottom = optStr(form.ppe_clothing_size_bottom as string)
      if (form.ppe_shoe_size !== (user?.ppe_shoe_size || '')) payload.ppe_shoe_size = optStr(form.ppe_shoe_size as string)
      if (form.retirement_date !== (user?.retirement_date || '')) payload.retirement_date = optStr(form.retirement_date as string)
      if (form.vantage_number !== (user?.vantage_number || '')) payload.vantage_number = optStr(form.vantage_number as string)
      if (form.extension_number !== (user?.extension_number || '')) payload.extension_number = optStr(form.extension_number as string)

      await updateProfile.mutateAsync(payload)
      toast({ title: 'Profil mis à jour', description: 'Vos informations ont été enregistrées.', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de mettre à jour le profil.', variant: 'error' })
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
        last_medical_check: user.last_medical_check || '',
        last_international_medical_check: user.last_international_medical_check || '',
        last_subsidiary_medical_check: user.last_subsidiary_medical_check || '',
        height: user.height ?? null,
        weight: user.weight ?? null,
        ppe_clothing_size: user.ppe_clothing_size || '',
        ppe_clothing_size_bottom: user.ppe_clothing_size_bottom || '',
        ppe_shoe_size: user.ppe_shoe_size || '',
        retirement_date: user.retirement_date || '',
        vantage_number: user.vantage_number || '',
        extension_number: user.extension_number || '',
      })
    }
  }

  const [editorSrc, setEditorSrc] = useState<string | null>(null)

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const validTypes = ['image/png', 'image/jpeg', 'image/webp']
    if (!validTypes.includes(file.type)) {
      toast({ title: 'Format invalide', description: 'Seuls les formats PNG, JPG et WebP sont acceptés.', variant: 'error' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Fichier trop volumineux', description: 'La taille maximale est de 5 Mo.', variant: 'error' })
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
      toast({ title: 'Avatar mis à jour', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', description: "Impossible de téléverser l'avatar.", variant: 'error' })
    }
  }

  const updateField = (field: keyof ProfileUpdate, value: string | number | null) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <>
      {/* Section: Avatar */}
      <CollapsibleSection
        id="avatar"
        title="Avatar"
        description="Votre photo de profil est visible par les autres utilisateurs."
        storageKey="settings.profile.collapse"
      >
        <div className="mt-2 flex items-center gap-5">
          <div className="relative group">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt={`${user.first_name} ${user.last_name}`} className="h-20 w-20 rounded-full object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-semibold text-primary-foreground">{initials}</div>
            )}
            <button
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              title="Changer l'avatar"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadAvatar.isPending}
            >
              {uploadAvatar.isPending ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleAvatarChange} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{user?.first_name} {user?.last_name}</p>
            <p className="text-sm text-muted-foreground">@{user?.email?.split('@')[0]}</p>
            <button className="mt-2 gl-button-sm gl-button-default" onClick={() => fileInputRef.current?.click()} disabled={uploadAvatar.isPending}>
              Changer l'avatar
            </button>
          </div>
        </div>
      </CollapsibleSection>

      {/* Section: Main settings */}
      <CollapsibleSection
        id="main-settings"
        title="Paramètres principaux"
        description="Ces informations apparaissent sur votre profil."
        storageKey="settings.profile.collapse"
        showSeparator={false}
      >
        <div className="mt-2 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-[640px]">
          <div>
            <label className="gl-label">{t('users.first_name')}</label>
            <input type="text" className="gl-form-input" value={form.first_name || ''} onChange={(e) => updateField('first_name', e.target.value)} />
          </div>
          <div>
            <label className="gl-label">{t('users.last_name')}</label>
            <input type="text" className="gl-form-input" value={form.last_name || ''} onChange={(e) => updateField('last_name', e.target.value)} />
          </div>
        </div>

        <div>
          <label className="gl-label">Email</label>
          <input type="email" className="gl-form-input max-w-sm" value={user?.email || ''} disabled />
          <p className="mt-1 text-sm text-muted-foreground">
            L'adresse email est gérée dans l'onglet <span className="text-primary">Emails</span>.
          </p>
        </div>

        <div>
          <label className="gl-label">{t('settings.language')}</label>
          <div className="flex gap-2 mt-2">
            {[
              { value: 'fr', label: 'Français' },
              { value: 'en', label: 'English' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateField('language', opt.value)}
                className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                  form.language === opt.value
                    ? 'bg-primary/10 border-primary/40 text-primary shadow-sm'
                    : 'bg-background border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">La langue de l'interface pour votre compte.</p>
        </div>
      </div>
      </CollapsibleSection>

      {/* Section: HR Identity */}
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
              <select className="gl-form-input" value={form.gender || ''} onChange={(e) => updateField('gender', e.target.value)}>
                <option value="">— Sélectionner —</option>
                {GENDER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="gl-label">Nationalité</label>
              <input type="text" className="gl-form-input" value={form.nationality || ''} onChange={(e) => updateField('nationality', e.target.value)} placeholder="ex: FR, GB, US" />
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
              <input type="text" className="gl-form-input" value={form.birth_country || ''} onChange={(e) => updateField('birth_country', e.target.value)} placeholder="ex: FR, GB, US" />
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Section: Travel & Transport */}
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
              <input type="text" className="gl-form-input" value={form.contractual_airport || ''} onChange={(e) => updateField('contractual_airport', e.target.value)} placeholder="ex: CDG, LHR" />
            </div>
            <div>
              <label className="gl-label">Aéroport le plus proche</label>
              <input type="text" className="gl-form-input" value={form.nearest_airport || ''} onChange={(e) => updateField('nearest_airport', e.target.value)} placeholder="ex: ORY, LTN" />
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
        description="Dates des dernières visites médicales obligatoires."
        storageKey="settings.profile.collapse"
        showSeparator={false}
      >
        <div className="mt-2 space-y-4 max-w-[640px]">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="gl-label">Visite médicale</label>
              <input type="date" className="gl-form-input" value={form.last_medical_check || ''} onChange={(e) => updateField('last_medical_check', e.target.value)} />
            </div>
            <div>
              <label className="gl-label">Visite internationale</label>
              <input type="date" className="gl-form-input" value={form.last_international_medical_check || ''} onChange={(e) => updateField('last_international_medical_check', e.target.value)} />
            </div>
            <div>
              <label className="gl-label">Visite filiale</label>
              <input type="date" className="gl-form-input" value={form.last_subsidiary_medical_check || ''} onChange={(e) => updateField('last_subsidiary_medical_check', e.target.value)} />
            </div>
          </div>
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
              <input type="text" className="gl-form-input" value={form.ppe_shoe_size || ''} onChange={(e) => updateField('ppe_shoe_size', e.target.value)} placeholder="42" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="gl-label">Taille vêtement (haut)</label>
              <input type="text" className="gl-form-input" value={form.ppe_clothing_size || ''} onChange={(e) => updateField('ppe_clothing_size', e.target.value)} placeholder="M, L, XL..." />
            </div>
            <div>
              <label className="gl-label">Taille vêtement (bas)</label>
              <input type="text" className="gl-form-input" value={form.ppe_clothing_size_bottom || ''} onChange={(e) => updateField('ppe_clothing_size_bottom', e.target.value)} placeholder="40, 42, 44..." />
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Section: Misc */}
      <CollapsibleSection
        id="misc-hr"
        title="Divers"
        description="Informations complémentaires RH."
        storageKey="settings.profile.collapse"
        showSeparator={false}
      >
        <div className="mt-2 space-y-4 max-w-[640px]">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="gl-label">Date de retraite</label>
              <input type="date" className="gl-form-input" value={form.retirement_date || ''} onChange={(e) => updateField('retirement_date', e.target.value)} />
            </div>
            <div>
              <label className="gl-label">N° Vantage</label>
              <input type="text" className="gl-form-input" value={form.vantage_number || ''} onChange={(e) => updateField('vantage_number', e.target.value)} />
            </div>
            <div>
              <label className="gl-label">N° poste</label>
              <input type="text" className="gl-form-input" value={form.extension_number || ''} onChange={(e) => updateField('extension_number', e.target.value)} />
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Save / Cancel bar (sticky for all profile fields above) */}
      <div className="flex items-center gap-3 py-4 border-t border-border mt-2">
        <button className="gl-button gl-button-confirm" onClick={handleSubmit} disabled={!isDirty || updateProfile.isPending}>
          {updateProfile.isPending && <Loader2 size={14} className="animate-spin mr-1" />}
          Mettre à jour le profil
        </button>
        <button className="gl-button gl-button-default" onClick={handleCancel} disabled={!isDirty}>Annuler</button>
      </div>

      {/* Emails section */}
      <EmailsTab />

      {/* Phones section */}
      <CollapsibleSection
        id="user-phones"
        title="Téléphones"
        description="Vos numéros de téléphone : mobile, bureau, domicile."
        storageKey="settings.phones.collapse"
        showSeparator={false}
      >
        <div className="mt-2">
          <PhoneManager ownerType="user" ownerId={user?.id} />
        </div>
      </CollapsibleSection>

      {/* Addresses section */}
      <AddressesTab />

      {/* Emergency contacts section */}
      <CollapsibleSection
        id="user-emergency-contacts"
        title="Contacts d'urgence"
        description="Personnes à contacter en cas d'urgence lors de vos missions."
        storageKey="settings.emergency.collapse"
        showSeparator={false}
      >
        <div className="mt-2">
          {user?.id && <EmergencyContactManager userId={user.id} />}
        </div>
      </CollapsibleSection>

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
