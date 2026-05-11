/**
 * ShellModeToggle — Phase 1C
 *
 * Segmented control for switching the current module between Atlas and
 * Operator shell modes. Drop into the Topbar between the breadcrumb and
 * the right-hand actions cluster.
 *
 * Renders nothing if:
 *   - no current module slug (e.g. on /home, /settings landing)
 *   - the current module isn't listed in MODULE_DEFAULTS
 *
 * Visual style follows Pajamas++ .segmented (defined in styles/pajamas-pp.css).
 */
import { useTranslation } from 'react-i18next'
import { LayoutGrid, Zap, RotateCcw, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useShellMode, MODULE_DEFAULTS, type ShellMode } from '@/hooks/useShellMode'

interface ShellModeToggleProps {
  moduleSlug: string | undefined
  /** Show "default" badge + reset button when the user hasn't overridden. Default: true */
  showDefaultHint?: boolean
  className?: string
}

export function ShellModeToggle({ moduleSlug, showDefaultHint = true, className }: ShellModeToggleProps) {
  const { t } = useTranslation()
  const { mode, setMode, reset, isModuleDefault, isSaving, error } = useShellMode(moduleSlug)

  if (!moduleSlug || !(moduleSlug in MODULE_DEFAULTS)) return null

  const opts: Array<{ value: ShellMode; label: string; Icon: typeof LayoutGrid }> = [
    { value: 'atlas',    label: t('shell.atlas',    'Atlas'),    Icon: LayoutGrid },
    { value: 'operator', label: t('shell.operator', 'Operator'), Icon: Zap },
  ]

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="segmented"
        role="radiogroup"
        aria-label={t('shell.mode_aria', 'Mode d\u2019affichage du module')}
      >
        {opts.map(({ value, label, Icon }) => {
          const active = mode === value
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              className={cn('segmented-item', active && 'is-active')}
              onClick={() => setMode(value)}
              disabled={isSaving}
              title={t(`shell.${value}_desc`, value === 'atlas'
                ? 'Vue dense pour exploration et listes'
                : 'Vue centr\u00e9e action pour ex\u00e9cution')}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{label}</span>
            </button>
          )
        })}
      </div>

      {showDefaultHint && isModuleDefault && (
        <span className="chip" title={t('shell.default_hint', 'Pr\u00e9f\u00e9rence par d\u00e9faut du module')}>
          {t('shell.default', 'd\u00e9faut')}
        </span>
      )}
      {showDefaultHint && !isModuleDefault && (
        <button
          type="button"
          className="nav-item"
          style={{ width: 'auto', height: 24, padding: '0 8px', fontSize: 11.5 }}
          onClick={reset}
          title={t('shell.reset', 'R\u00e9tablir le d\u00e9faut du module')}
        >
          <RotateCcw className="w-3 h-3" aria-hidden="true" />
        </button>
      )}

      {error && (
        <span
          className="chip chip-warn"
          title={error.message}
          aria-live="polite"
        >
          <AlertTriangle className="w-3 h-3" aria-hidden="true" />
          {t('shell.save_error', 'sync')}
        </span>
      )}
    </div>
  )
}
