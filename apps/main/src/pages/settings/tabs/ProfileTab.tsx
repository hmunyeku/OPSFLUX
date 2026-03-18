/**
 * Profile settings tab — user avatar, name, language.
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

export function ProfileTab() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const { toast } = useToast()
  const updateProfile = useUpdateProfile()
  const uploadAvatar = useUploadAvatar()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    language: user?.language || 'fr',
  })

  // Sync form when user data refreshes (e.g. after fetchUser)
  useEffect(() => {
    if (user) {
      setForm({ first_name: user.first_name, last_name: user.last_name, language: user.language })
    }
  }, [user])

  const initials = user ? `${user.first_name[0]}${user.last_name[0]}` : '?'

  const isDirty =
    form.first_name !== (user?.first_name || '') ||
    form.last_name !== (user?.last_name || '') ||
    form.language !== (user?.language || 'fr')

  const handleSubmit = async () => {
    try {
      await updateProfile.mutateAsync(form)
      toast({ title: 'Profil mis à jour', description: 'Vos informations ont été enregistrées.', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de mettre à jour le profil.', variant: 'error' })
    }
  }

  const handleCancel = () => {
    if (user) {
      setForm({ first_name: user.first_name, last_name: user.last_name, language: user.language })
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
    // Open image editor with preview
    const url = URL.createObjectURL(file)
    setEditorSrc(url)
    // Reset input so re-selecting the same file triggers onChange
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
            <input type="text" className="gl-form-input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          </div>
          <div>
            <label className="gl-label">{t('users.last_name')}</label>
            <input type="text" className="gl-form-input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
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
                onClick={() => setForm({ ...form, language: opt.value })}
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

        <div className="flex items-center gap-3 mt-6">
          <button className="gl-button gl-button-confirm" onClick={handleSubmit} disabled={!isDirty || updateProfile.isPending}>
            {updateProfile.isPending && <Loader2 size={14} className="animate-spin mr-1" />}
            Mettre à jour le profil
          </button>
          <button className="gl-button gl-button-default" onClick={handleCancel} disabled={!isDirty}>Annuler</button>
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
