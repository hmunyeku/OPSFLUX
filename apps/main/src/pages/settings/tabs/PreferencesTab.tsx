/**
 * Preferences tab — theme, language, display options.
 *
 * Theme and language are stored locally (localStorage) for instant effect.
 * Language preference is also synced to the backend via profile update.
 *
 * Note: Toast/notification display settings have been moved to the Notifications tab.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useThemeStore } from '@/stores/themeStore'
import { useUpdateProfile } from '@/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'
import { Sun, Moon, Monitor, Loader2, ZoomIn, Table2, X } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { usePageSize, useMaxPageSize } from '@/hooks/usePageSize'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import {
  getUIScale,
  setUIScale,
  resetUIScale,
  MIN_SCALE,
  MAX_SCALE,
  STEP,
  DEFAULT_SCALE,
} from '@/lib/uiScale'

export function PreferencesTab() {
  const { t, i18n } = useTranslation()
  const { toast } = useToast()
  const { theme, setTheme } = useThemeStore()
  const updateProfile = useUpdateProfile()

  const themes = [
    { value: 'light' as const, label: t('settings.light'), icon: Sun },
    { value: 'dark' as const, label: t('settings.dark'), icon: Moon },
    { value: 'system' as const, label: t('settings.system'), icon: Monitor },
  ]

  const handleLanguageChange = async (lang: string) => {
    i18n.changeLanguage(lang)
    localStorage.setItem('language', lang)
    try {
      await updateProfile.mutateAsync({ language: lang })
      toast({ title: t('settings.toast.preferences.language_updated'), variant: 'success' })
    } catch {
      // Language is already applied locally even if API fails
      toast({ title: t('settings.toast.error'), description: t('settings.toast.preferences.language_local_warning'), variant: 'warning' })
    }
  }

  return (
    <>
      <CollapsibleSection
        id="ui-scale"
        title={t('settings.ui_scale')}
        description={t('settings.ui_scale_description')}
        storageKey="settings.preferences.collapse"
      >
        <UIScaleSection />
      </CollapsibleSection>

      <CollapsibleSection
        id="datatable"
        title="Tableaux de données"
        description="Nombre de lignes par page dans les tableaux."
        storageKey="settings.preferences.collapse"
      >
        <PageSizeSection />
      </CollapsibleSection>

      <CollapsibleSection id="theme" title="Mode" description="Choisissez un mode d'affichage." storageKey="settings.preferences.collapse">
        <div className="mt-2 space-y-2">
          {themes.map(({ value, label, icon: Icon }) => (
            <label key={value} className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="theme"
                checked={theme === value}
                onChange={() => setTheme(value)}
                className="h-4 w-4 accent-primary"
              />
              <Icon size={16} className="text-muted-foreground" />
              <span className="text-sm text-foreground">{label}</span>
            </label>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="messaging-channel"
        title="Canal de messagerie"
        description="Choisissez comment recevoir les notifications, codes de vérification et alertes."
        storageKey="settings.preferences.collapse"
      >
        <MessagingChannelSection />
      </CollapsibleSection>

      <CollapsibleSection id="language-pref" title="Langue" description="Définissez la langue de l'interface utilisateur." storageKey="settings.preferences.collapse" showSeparator={false}>
        <div className="mt-2">
          <label className="gl-label">Langue préférée</label>
          <div className="flex items-center gap-2 mt-2">
            {[
              { value: 'fr', label: 'Français' },
              { value: 'en', label: 'English' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleLanguageChange(opt.value)}
                disabled={updateProfile.isPending}
                className={i18n.language === opt.value ? 'gl-button-sm gl-button-primary' : 'gl-button-sm gl-button-default'}
              >
                {opt.label}
              </button>
            ))}
            {updateProfile.isPending && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            L'interface sera affichée dans cette langue.
          </p>
        </div>
      </CollapsibleSection>
    </>
  )
}

// ── Page Size configuration section ──────────────────────────────
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

function PageSizeSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { pageSize, setPageSize } = usePageSize()
  const maxPageSize = useMaxPageSize()
  const [customValue, setCustomValue] = useState('')
  const [showCustom, setShowCustom] = useState(!PAGE_SIZE_OPTIONS.includes(pageSize))

  const handleChange = (value: number) => {
    setPageSize(value)
    setShowCustom(false)
    setCustomValue('')
    toast({ title: t('settings.toast.preferences.page_size', { value }), variant: 'success' })
  }

  const handleCustomSubmit = () => {
    const num = parseInt(customValue)
    if (!num || num < 1) return
    if (num > maxPageSize) {
      toast({ title: t('settings.toast.preferences.page_size_max', { max: maxPageSize }), variant: 'warning' })
      return
    }
    setPageSize(num)
    toast({ title: t('settings.toast.preferences.page_size', { value: num }), variant: 'success' })
  }

  return (
    <div className="mt-2 space-y-3">
      <div>
        <label className="gl-label flex items-center gap-1.5">
          <Table2 size={12} className="text-muted-foreground" />
          Lignes par page
        </label>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {PAGE_SIZE_OPTIONS.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => handleChange(size)}
              className={pageSize === size && !showCustom ? 'gl-button-sm gl-button-primary' : 'gl-button-sm gl-button-default'}
            >
              {size}
            </button>
          ))}
          {/* Custom value input */}
          {showCustom || !PAGE_SIZE_OPTIONS.includes(pageSize) ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={customValue || (!PAGE_SIZE_OPTIONS.includes(pageSize) ? String(pageSize) : '')}
                onChange={(e) => setCustomValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCustomSubmit() }}
                placeholder="Custom"
                min={1}
                max={maxPageSize}
                className="gl-form-input w-20 h-8 text-sm text-center"
                autoFocus
              />
              <button onClick={handleCustomSubmit} className="gl-button-sm gl-button-confirm h-8 px-2">OK</button>
              {PAGE_SIZE_OPTIONS.includes(pageSize) && (
                <button onClick={() => setShowCustom(false)} className="gl-button-sm gl-button-default h-8 px-2">
                  <X size={11} />
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCustom(true)}
              className="gl-button-sm gl-button-default"
            >
              Autre...
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Nombre de lignes affichées par défaut dans tous les tableaux. Maximum : {maxPageSize}.
        </p>
      </div>
    </div>
  )
}

// ── UI Scale configuration section ─────────────────────────────
function UIScaleSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [scale, setScale] = useState(getUIScale)

  const handleScaleChange = (value: number) => {
    setScale(value)
    setUIScale(value)
  }

  const handleScaleCommit = () => {
    toast({
      title: t('settings.ui_scale_value', { value: scale }),
      description: t('settings.ui_scale_description'),
      variant: 'success',
    })
  }

  const handleReset = () => {
    resetUIScale()
    setScale(DEFAULT_SCALE)
    toast({
      title: t('settings.ui_scale_value', { value: DEFAULT_SCALE }),
      description: t('settings.ui_scale_reset'),
      variant: 'success',
    })
  }

  const isDefault = scale === DEFAULT_SCALE

  // Preset buttons for quick selection
  const presets = [80, 90, 100, 110, 120, 130]

  return (
    <div className="mt-2 space-y-4">
      <div>
        <label className="gl-label flex items-center gap-1.5">
          <ZoomIn size={12} className="text-muted-foreground" />
          {t('settings.ui_scale')}
        </label>

        {/* Preset buttons */}
        <div className="flex items-center gap-2 mt-2">
          {presets.map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => { handleScaleChange(val); handleScaleCommit() }}
              className={`inline-flex items-center px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                scale === val
                  ? 'bg-primary/10 border-primary/40 text-primary shadow-sm'
                  : 'bg-background border-border text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {val}%{val === DEFAULT_SCALE ? ` (${t('common.default')})` : ''}
            </button>
          ))}
        </div>

        {/* Slider for fine-tuning */}
        <div className="flex items-center gap-3 mt-3">
          <span className="text-xs text-muted-foreground w-8 text-right">{MIN_SCALE}%</span>
          <input
            type="range"
            min={MIN_SCALE}
            max={MAX_SCALE}
            step={STEP}
            value={scale}
            onChange={(e) => handleScaleChange(parseInt(e.target.value))}
            onMouseUp={handleScaleCommit}
            onTouchEnd={handleScaleCommit}
            className="flex-1 h-1.5 accent-primary cursor-pointer"
          />
          <span className="text-xs text-muted-foreground w-8">{MAX_SCALE}%</span>
        </div>

        <p className="mt-1 text-xs text-muted-foreground">
          {t('settings.ui_scale_description')} — {t('settings.ui_scale_value', { value: scale })}
        </p>
      </div>

      {!isDefault && (
        <button
          type="button"
          onClick={handleReset}
          className="gl-button-sm gl-button-default"
        >
          {t('settings.ui_scale_reset')} ({DEFAULT_SCALE}%)
        </button>
      )}
    </div>
  )
}

// ── Messaging channel preference ────────────────────────────

const CHANNEL_OPTIONS = [
  { value: 'auto', label: 'Automatique', description: 'Selon la configuration admin' },
  { value: 'whatsapp', label: 'WhatsApp', description: 'Messages WhatsApp si disponible' },
  { value: 'sms', label: 'SMS', description: 'SMS classique (Twilio, OVH, Vonage)' },
  { value: 'email', label: 'Email', description: 'Notifications par email uniquement' },
]

function MessagingChannelSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const updateProfile = useUpdateProfile()
  const user = useAuthStore((s) => s.user)
  const currentChannel = user?.preferred_messaging_channel || 'auto'

  const handleChange = async (value: string) => {
    try {
      await updateProfile.mutateAsync({ preferred_messaging_channel: value })
      toast({ title: t('settings.toast.preferences.channel_updated'), variant: 'success' })
    } catch {
      toast({ title: t('settings.toast.error'), variant: 'error' })
    }
  }

  return (
    <div className="mt-2 space-y-2">
      {CHANNEL_OPTIONS.map((opt) => (
        <label key={opt.value} className="flex items-start gap-3 cursor-pointer py-1">
          <input
            type="radio"
            name="messaging-channel"
            checked={currentChannel === opt.value}
            onChange={() => handleChange(opt.value)}
            disabled={updateProfile.isPending}
            className="h-4 w-4 accent-primary mt-0.5"
          />
          <div>
            <span className="text-sm font-medium text-foreground">{opt.label}</span>
            <p className="text-xs text-muted-foreground">{opt.description}</p>
          </div>
        </label>
      ))}
      {updateProfile.isPending && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
      <p className="text-xs text-muted-foreground mt-1">
        Ce choix détermine le canal utilisé pour les codes de vérification (OTP), notifications et alertes.
        Le canal « Automatique » utilise la configuration définie par l'administrateur.
      </p>
    </div>
  )
}
