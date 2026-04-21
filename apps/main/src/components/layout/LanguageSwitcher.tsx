/**
 * LanguageSwitcher — Topbar language dropdown.
 *
 * Renders the current language as a 2-letter chip. Clicking opens
 * a dropdown with every language marked `active: true` in the
 * backend (fetched from `/api/v1/i18n/languages`). Previously the
 * topbar had a hardcoded fr↔en toggle which was wrong in two ways:
 *   - it assumed only two languages ever
 *   - it displayed whatever i18n.language returned, often
 *     "fr-FR" instead of "FR", showing the locale twice
 *
 * Rendering rule: if the logged-in user has `preferred_language`
 * set on their profile, the dropdown is hidden entirely — the
 * preference is applied at app start and there is no need to
 * offer another choice in the header. Admins can still change it
 * from the profile settings page.
 */
import { useQuery } from '@tanstack/react-query'
import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Check } from 'lucide-react'
import api from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { safeLocal } from '@/lib/safeStorage'

interface Language {
  code: string
  label: string
  english_label: string
  active: boolean
  rtl: boolean
  sort_order: number
}

function useEnabledLanguages() {
  return useQuery({
    queryKey: ['i18n', 'languages', 'active'],
    queryFn: async () => {
      const { data } = await api.get<Language[]>('/api/v1/i18n/languages', {
        params: { active_only: true },
      })
      return data
    },
    // Languages change rarely — keep in cache for the whole session.
    staleTime: 10 * 60_000,
  })
}

/** "fr-FR" → "fr" so the header shows "FR" not "FR-FR". */
function normalise(code: string): string {
  return (code || '').split(/[-_]/)[0].toLowerCase()
}

export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const { data: languages = [] } = useEnabledLanguages()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // If the user has a preferred language on their profile we apply
  // it silently at app start — no chip in the header needed.
  if (user?.language) return null

  // If only one language is active there is nothing to switch to.
  if (languages.length < 2) return null

  const current = normalise(i18n.language)

  const choose = (code: string) => {
    const n = normalise(code)
    i18n.changeLanguage(n)
    safeLocal.setItem('language', n)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative hidden sm:block">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'h-7 inline-flex items-center gap-1 rounded-lg px-1.5 text-xs font-medium uppercase',
          'text-muted-foreground hover:bg-chrome-hover hover:text-foreground transition-colors',
          open && 'bg-chrome-hover text-foreground',
        )}
        title={languages.find((l) => normalise(l.code) === current)?.label ?? current}
      >
        {current}
        <ChevronDown size={12} className={cn('transition-transform duration-150', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 min-w-[180px] rounded-xl bg-popover/95 backdrop-blur-md py-1 overflow-hidden border border-border/60 shadow-[0_10px_32px_-8px_rgba(0,0,0,0.25)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-150"
          style={{ zIndex: 'var(--z-dropdown)' }}
        >
          {languages
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((lang) => {
              const n = normalise(lang.code)
              const isCurrent = n === current
              return (
                <button
                  key={lang.code}
                  onClick={() => choose(lang.code)}
                  className={cn(
                    'group flex w-full items-center justify-between gap-3 px-3 py-2 text-sm rounded-md mx-1 transition-colors',
                    isCurrent
                      ? 'text-primary bg-primary/[0.08]'
                      : 'text-popover-foreground hover:bg-accent/60 hover:text-foreground',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="inline-block w-5 text-[10px] font-mono uppercase text-muted-foreground">
                      {n}
                    </span>
                    <span>{lang.label}</span>
                  </span>
                  {isCurrent && <Check size={14} className="text-primary shrink-0" />}
                </button>
              )
            })}
        </div>
      )}
    </div>
  )
}
