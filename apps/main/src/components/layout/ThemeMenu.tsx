/**
 * ThemeMenu — Topbar dropdown with Light/Dark/System theme options.
 *
 * Replaces the simple toggle button with a proper 3-option menu.
 */
import { useState, useRef, useEffect } from 'react'
import { Sun, Moon, Monitor, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useThemeStore } from '@/stores/themeStore'
import { cn } from '@/lib/utils'

type ThemeValue = 'light' | 'dark' | 'system'

const THEME_OPTIONS: { value: ThemeValue; icon: typeof Sun; labelKey: string }[] = [
  { value: 'light', icon: Sun, labelKey: 'settings.theme_light' },
  { value: 'dark', icon: Moon, labelKey: 'settings.theme_dark' },
  { value: 'system', icon: Monitor, labelKey: 'settings.theme_system' },
]

export function ThemeMenu() {
  const { t } = useTranslation()
  const { theme, setTheme, resolvedTheme } = useThemeStore()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const CurrentIcon = resolvedTheme === 'dark' ? Moon : Sun

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1 h-7 px-1.5 rounded-lg text-muted-foreground hover:bg-chrome-hover hover:text-foreground transition-colors',
          open && 'bg-chrome-hover text-foreground',
        )}
        aria-label={t('settings.dark_mode')}
        title={t('settings.dark_mode')}
      >
        <CurrentIcon size={15} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-border/70 bg-popover/95 backdrop-blur-md shadow-xl shadow-black/5 py-1 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150"
          style={{ zIndex: 'var(--z-dropdown)' }}
        >
          {THEME_OPTIONS.map(({ value, icon: Icon, labelKey }) => (
            <button
              key={value}
              onClick={() => { setTheme(value); setOpen(false) }}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-1.5 text-xs transition-colors hover:bg-accent rounded-sm',
                theme === value && 'bg-primary/[0.08] font-medium',
              )}
            >
              <Icon size={13} className="shrink-0 text-muted-foreground" />
              <span className="flex-1 text-left">{t(labelKey)}</span>
              {theme === value && <Check size={12} className="shrink-0 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
