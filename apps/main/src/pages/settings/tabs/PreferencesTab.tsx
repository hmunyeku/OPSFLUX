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
import { Sun, Moon, Monitor, Loader2, ZoomIn, Table2 } from 'lucide-react'
import { usePageSize } from '@/hooks/usePageSize'
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
      toast({ title: 'Langue mise à jour', variant: 'success' })
    } catch {
      // Language is already applied locally even if API fails
      toast({ title: 'Attention', description: 'La langue a été appliquée localement mais n\'a pas pu être sauvegardée sur le serveur.', variant: 'warning' })
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
                className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                  i18n.language === opt.value
                    ? 'bg-primary/10 border-primary/40 text-primary shadow-sm'
                    : 'bg-background border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
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
  const { toast } = useToast()
  const { pageSize, setPageSize } = usePageSize()

  const handleChange = (value: number) => {
    setPageSize(value)
    toast({ title: `Affichage: ${value} lignes par page`, variant: 'success' })
  }

  return (
    <div className="mt-2 space-y-3">
      <div>
        <label className="gl-label flex items-center gap-1.5">
          <Table2 size={12} className="text-muted-foreground" />
          Lignes par page
        </label>
        <div className="flex items-center gap-2 mt-2">
          {PAGE_SIZE_OPTIONS.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => handleChange(size)}
              className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                pageSize === size
                  ? 'bg-primary/10 border-primary/40 text-primary shadow-sm'
                  : 'bg-background border-border text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {size}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Nombre de lignes affichees par defaut dans tous les tableaux de donnees.
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

  return (
    <div className="mt-2 space-y-4">
      <div>
        <label className="gl-label flex items-center gap-1.5">
          <ZoomIn size={12} className="text-muted-foreground" />
          {t('settings.ui_scale')}
        </label>
        <div className="flex items-center gap-3 mt-2">
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
          <span className="text-sm font-mono text-foreground w-12 text-right">
            {t('settings.ui_scale_value', { value: scale })}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('settings.ui_scale_description')}
        </p>
      </div>

      {!isDefault && (
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-all border bg-background border-border text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {t('settings.ui_scale_reset')}
        </button>
      )}
    </div>
  )
}
