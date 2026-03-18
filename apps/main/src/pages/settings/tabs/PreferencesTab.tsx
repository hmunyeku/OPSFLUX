/**
 * Preferences tab — theme, language, display options, notifications.
 *
 * Theme and language are stored locally (localStorage) for instant effect.
 * Language preference is also synced to the backend via profile update.
 * Toast settings (position + duration) are stored in localStorage.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useThemeStore } from '@/stores/themeStore'
import { useUpdateProfile } from '@/hooks/useSettings'
import {
  useToast,
  TOAST_POSITIONS,
  getToastPosition,
  setToastPosition,
  getToastDuration,
  setToastDuration,
  getToastOpacity,
  setToastOpacity,
  type ToastPosition,
} from '@/components/ui/Toast'
import { Sun, Moon, Monitor, Loader2, Bell } from 'lucide-react'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'

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

      <CollapsibleSection id="language-pref" title="Langue" description="Définissez la langue de l'interface utilisateur." storageKey="settings.preferences.collapse">
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

      <CollapsibleSection
        id="notifications-display"
        title="Notifications"
        description="Position et durée des notifications toast. Ces réglages sont personnels et remplacent les valeurs par défaut de l'administrateur."
        storageKey="settings.preferences.collapse"
        showSeparator={false}
      >
        <ToastSettingsSection />
      </CollapsibleSection>
    </>
  )
}

// ── Toast configuration section ────────────────────────────
function ToastSettingsSection() {
  const { toast } = useToast()
  const [position, setPosition] = useState<ToastPosition>(getToastPosition)
  const [duration, setDuration] = useState(getToastDuration)
  const [opacity, setOpacity] = useState(getToastOpacity)

  const handlePositionChange = (pos: ToastPosition) => {
    setPosition(pos)
    setToastPosition(pos)
    toast({ title: 'Position mise à jour', description: `Les notifications s'afficheront en ${TOAST_POSITIONS.find(p => p.value === pos)?.label?.toLowerCase()}.`, variant: 'success' })
  }

  const handleDurationChange = (ms: number) => {
    setDuration(ms)
    setToastDuration(ms)
  }

  const handleDurationCommit = () => {
    toast({ title: `Durée : ${(duration / 1000).toFixed(1)}s`, description: 'La durée a été mise à jour.', variant: 'success' })
  }

  const handleOpacityChange = (val: number) => {
    setOpacity(val)
    setToastOpacity(val)
  }

  const handleOpacityCommit = () => {
    toast({ title: `Opacité : ${opacity}%`, description: 'L\'opacité a été mise à jour.', variant: 'success' })
  }

  return (
    <div className="mt-2 space-y-4">
      {/* Position grid */}
      <div>
        <label className="gl-label flex items-center gap-1.5">
          <Bell size={12} className="text-muted-foreground" />
          Position des notifications
        </label>
        <div className="grid grid-cols-3 gap-1.5 mt-2 max-w-xs">
          {TOAST_POSITIONS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => handlePositionChange(p.value)}
              className={`px-2 py-1.5 rounded-md text-xs font-medium transition-all border ${
                position === p.value
                  ? 'bg-primary/10 border-primary/40 text-primary shadow-sm'
                  : 'bg-background border-border text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Cliquez pour changer. Un toast de confirmation s'affichera à la nouvelle position.
        </p>
      </div>

      {/* Duration slider */}
      <div>
        <label className="gl-label">Durée d'affichage</label>
        <div className="flex items-center gap-3 mt-2">
          <input
            type="range"
            min={1000}
            max={15000}
            step={500}
            value={duration}
            onChange={(e) => handleDurationChange(parseInt(e.target.value))}
            onMouseUp={handleDurationCommit}
            onTouchEnd={handleDurationCommit}
            className="flex-1 h-1.5 accent-primary cursor-pointer"
          />
          <span className="text-sm font-mono text-foreground w-12 text-right">
            {(duration / 1000).toFixed(1)}s
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Durée avant disparition automatique (1s à 15s).
        </p>
      </div>

      {/* Opacity slider */}
      <div>
        <label className="gl-label">Opacité</label>
        <div className="flex items-center gap-3 mt-2">
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={opacity}
            onChange={(e) => handleOpacityChange(parseInt(e.target.value))}
            onMouseUp={handleOpacityCommit}
            onTouchEnd={handleOpacityCommit}
            className="flex-1 h-1.5 accent-primary cursor-pointer"
          />
          <span className="text-sm font-mono text-foreground w-12 text-right">
            {opacity}%
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Transparence des notifications (10% à 100%).
        </p>
      </div>
    </div>
  )
}
