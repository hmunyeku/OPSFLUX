/**
 * Step 1 — Admin profile (name, language, avatar).
 *
 * Hits PATCH /api/v1/profile via profileService.update on save. Avatar
 * upload is wired separately via profileService.uploadAvatar.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { User, Loader2, UploadCloud, Check } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { profileService } from '@/services/settingsService'
import { useToast } from '@/components/ui/Toast'
import { panelInputClass } from '@/components/layout/DynamicPanel'

export interface Step1Value {
  first_name: string
  last_name: string
  language: string
}

interface Props {
  value: Step1Value
  onChange: (v: Partial<Step1Value>) => void
}

export function Step1Profile({ value, onChange }: Props) {
  const { t } = useTranslation()
  const { user, fetchUser } = useAuthStore()
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [savedOnce, setSavedOnce] = useState(false)

  // Pre-fill from current user on mount, only if the draft is empty —
  // we don't want to clobber a partially-typed name on re-mount.
  useEffect(() => {
    if (user && !value.first_name && !value.last_name) {
      onChange({
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        language: user.language || 'fr',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const handleSave = async () => {
    if (!value.first_name.trim() || !value.last_name.trim()) {
      toast({ title: t('onboarding.step1.error_required'), variant: 'error' })
      return
    }
    setSaving(true)
    try {
      await profileService.update({
        first_name: value.first_name,
        last_name: value.last_name,
        language: value.language,
      })
      await fetchUser()
      setSavedOnce(true)
      toast({ title: t('onboarding.step1.saved'), variant: 'success' })
    } catch {
      toast({ title: t('common.failed'), variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarChange = async (file: File) => {
    setAvatarUploading(true)
    try {
      await profileService.uploadAvatar(file)
      await fetchUser()
      toast({ title: t('onboarding.step1.avatar_saved'), variant: 'success' })
    } catch {
      toast({ title: t('common.failed'), variant: 'error' })
    } finally {
      setAvatarUploading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <User size={16} className="text-primary" />
          {t('onboarding.step1.title')}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">{t('onboarding.step1.subtitle')}</p>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-muted overflow-hidden flex items-center justify-center shrink-0 border border-border">
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <User size={28} className="text-muted-foreground" />
          )}
        </div>
        <label className="btn btn-sm btn-secondary cursor-pointer">
          {avatarUploading ? <Loader2 size={12} className="animate-spin" /> : <UploadCloud size={12} />}
          {t('onboarding.step1.avatar_upload')}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            disabled={avatarUploading}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleAvatarChange(f)
            }}
          />
        </label>
      </div>

      {/* Form fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="gl-label-sm" htmlFor="ob-first-name">
            {t('onboarding.step1.first_name')}
            <span className="text-destructive ml-0.5">*</span>
          </label>
          <input
            id="ob-first-name"
            className={panelInputClass}
            value={value.first_name}
            onChange={(e) => onChange({ first_name: e.target.value })}
            placeholder={t('onboarding.step1.first_name_ph')}
            autoComplete="given-name"
          />
        </div>
        <div>
          <label className="gl-label-sm" htmlFor="ob-last-name">
            {t('onboarding.step1.last_name')}
            <span className="text-destructive ml-0.5">*</span>
          </label>
          <input
            id="ob-last-name"
            className={panelInputClass}
            value={value.last_name}
            onChange={(e) => onChange({ last_name: e.target.value })}
            placeholder={t('onboarding.step1.last_name_ph')}
            autoComplete="family-name"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="gl-label-sm" htmlFor="ob-email">
            {t('onboarding.step1.email')}
          </label>
          <input
            id="ob-email"
            className={panelInputClass}
            value={user?.email || ''}
            disabled
            readOnly
          />
          <p className="text-[11px] text-muted-foreground mt-1">{t('onboarding.step1.email_help')}</p>
        </div>
        <div>
          <label className="gl-label-sm" htmlFor="ob-language">
            {t('onboarding.step1.language')}
          </label>
          <select
            id="ob-language"
            className={panelInputClass}
            value={value.language}
            onChange={(e) => onChange({ language: e.target.value })}
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-sm btn-primary"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {t('onboarding.step1.save')}
        </button>
        {savedOnce && !saving && (
          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
            <Check size={12} />
            {t('onboarding.step1.saved')}
          </span>
        )}
      </div>
    </div>
  )
}
