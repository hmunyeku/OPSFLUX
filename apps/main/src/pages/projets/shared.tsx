/**
 * Projets — shared constants, types, and small helper components.
 *
 * Pure restructure of ProjetsPage.tsx — no behavior changes.
 */
import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  Sun, Cloud, CloudRain, CloudLightning, X, Download,
  Circle, CircleDot, CheckCircle2, CircleSlash, Clock,
} from 'lucide-react'
import type { DependencyType } from '@/types/api'

// -- Constants ----------------------------------------------------------------

export const PROJECT_STATUS_VALUES = ['draft', 'planned', 'active', 'on_hold', 'completed', 'cancelled'] as const
export const PROJECT_PRIORITY_VALUES = ['low', 'medium', 'high', 'critical'] as const
export const PROJECT_WEATHER_VALUES = ['sunny', 'cloudy', 'rainy', 'stormy'] as const
export const PROJECT_TASK_STATUS_VALUES = ['todo', 'in_progress', 'review', 'done', 'cancelled'] as const
export const PROJECT_MEMBER_ROLE_VALUES = ['manager', 'member', 'reviewer', 'stakeholder'] as const
export const PROJECT_DELIVERABLE_STATUS_VALUES = ['pending', 'in_progress', 'delivered', 'accepted', 'rejected'] as const

export const PROJECT_STATUS_LABELS_FALLBACK: Record<string, string> = {
  draft: 'Brouillon',
  planned: 'Planifié',
  active: 'Actif',
  on_hold: 'Suspendu',
  completed: 'Terminé',
  cancelled: 'Annulé',
}

export const PROJECT_PRIORITY_LABELS_FALLBACK: Record<string, string> = {
  low: 'Basse',
  medium: 'Moyenne',
  high: 'Haute',
  critical: 'Critique',
}

export const PROJECT_WEATHER_LABELS_FALLBACK: Record<string, string> = {
  sunny: 'Ensoleillé',
  cloudy: 'Nuageux',
  rainy: 'Pluvieux',
  stormy: 'Orageux',
}

export const WEATHER_ICON_MAP = {
  sunny: Sun,
  cloudy: Cloud,
  rainy: CloudRain,
  stormy: CloudLightning,
} as const

export const TASK_STATUS_META: Record<string, { icon: typeof Circle; color: string }> = {
  todo: { icon: Circle, color: 'text-muted-foreground' },
  in_progress: { icon: CircleDot, color: 'text-primary' },
  review: { icon: Clock, color: 'text-yellow-500' },
  done: { icon: CheckCircle2, color: 'text-green-500' },
  cancelled: { icon: CircleSlash, color: 'text-red-500' },
}

export const PROJECT_TASK_STATUS_LABELS_FALLBACK: Record<string, string> = {
  todo: 'À faire',
  in_progress: 'En cours',
  review: 'Revue',
  done: 'Terminée',
  cancelled: 'Annulée',
}

export const PROJECT_MEMBER_ROLE_LABELS_FALLBACK: Record<string, string> = {
  manager: 'Chef de projet',
  member: 'Membre',
  reviewer: 'Réviseur',
  stakeholder: 'Partie prenante',
}

export const DEPENDENCY_TYPE_LABELS: Record<DependencyType, string> = {
  finish_to_start: 'FS — Fin → Début',
  start_to_start: 'SS — Début → Début',
  finish_to_finish: 'FF — Fin → Fin',
  start_to_finish: 'SF — Début → Fin',
}

export const PROJECT_DELIVERABLE_STATUS_LABELS_FALLBACK: Record<string, string> = {
  pending: 'En attente',
  in_progress: 'En cours',
  delivered: 'Livré',
  accepted: 'Accepté',
  rejected: 'Rejeté',
}

export const DELIVERABLE_STATUS_COLOR_MAP: Record<string, string> = {
  pending: 'text-muted-foreground',
  in_progress: 'text-primary',
  delivered: 'text-blue-500',
  accepted: 'text-green-500',
  rejected: 'text-red-500',
}

export type SubTab = 'deps' | 'deliverables' | 'actions' | 'history'
export type ViewTab = 'dashboard' | 'projets' | 'tableur' | 'kanban' | 'planning'

// Dismissible warning banner shown on Gouti-imported projects. The
// dismissal is persisted in localStorage so the same user sees it at
// most once per browser — if the warning still applies, a Resync Gouti
// button in the panel header remains the authoritative action.
const GOUTI_BANNER_DISMISSED_KEY = 'opsflux:gouti-project-banner-dismissed'

export function GoutiProjectBanner() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(GOUTI_BANNER_DISMISSED_KEY) === '1'
    } catch {
      return false
    }
  })
  if (dismissed) return null
  const handleDismiss = () => {
    try {
      localStorage.setItem(GOUTI_BANNER_DISMISSED_KEY, '1')
    } catch { /* ignore quota/privacy mode errors */ }
    setDismissed(true)
    // Cross-device persistence via user preferences.
    void (async () => {
      try {
        const api = (await import('@/lib/api')).default
        await api.patch('/api/v1/users/me/preferences', {
          banners_dismissed: { [GOUTI_BANNER_DISMISSED_KEY]: true },
        })
      } catch { /* localStorage fallback */ }
    })()
  }
  return (
    <div className="flex items-start gap-2 p-2 rounded-md border border-orange-500/30 bg-orange-500/5 text-[11px] text-orange-700">
      <Download size={12} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        <div className="font-medium flex items-center gap-1.5">
          Projet importé de Gouti <GoutiBadge />
        </div>
        <div className="text-orange-600/80 mt-0.5">
          Les modifications locales seront écrasées au prochain "Resync Gouti".
          Pour un contrôle total, modifier le projet dans Gouti puis relancer la sync.
        </div>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="p-0.5 rounded hover:bg-orange-500/20 text-orange-700 shrink-0"
        aria-label="Masquer ce bandeau"
        title="Masquer (votre préférence est sauvegardée)"
      >
        <X size={12} />
      </button>
    </div>
  )
}

// Small badge shown on projects imported from Gouti so users can
// distinguish them from OpsFlux-native projects at a glance.
export function GoutiBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-semibold uppercase tracking-wide bg-orange-500/10 text-orange-600 border border-orange-500/20',
        className,
      )}
      title="Projet importé depuis Gouti"
    >
      <Download size={8} /> Gouti
    </span>
  )
}

export function buildDictionaryOptions(labels: Record<string, string>, values: readonly string[]) {
  return values.map((value) => ({ value, label: labels[value] ?? value }))
}

export function WeatherIcon({ weather, size = 14 }: { weather: string; size?: number }) {
  const Icon = WEATHER_ICON_MAP[weather as keyof typeof WEATHER_ICON_MAP]
  if (!Icon) return null
  const color = weather === 'sunny' ? 'text-yellow-500' : weather === 'cloudy' ? 'text-gray-400' : weather === 'rainy' ? 'text-blue-400' : 'text-red-500'
  return <Icon size={size} className={color} />
}

// -- Inline Picker Field (read mode + double-click → rich picker) ----

/**
 * Shows a value as plain text (read mode). On double-click, replaces it
 * with a rich picker component (AssetPicker, user <select>, etc.).
 * When the picker fires a selection, the parent saves and we return to
 * read mode via the `onDone` callback passed to `renderPicker`.
 *
 * Visual layout: matches InlineEditableRow / ReadOnlyRow exactly so
 * pickers (Chef de projet, Site/Installation, etc.) align with the rest
 * of the detail-panel rows — uppercase label on the left at fixed width
 * (CSS var --opsflux-label-w), value chip on subtle bg-muted/30 on the
 * right. April 2026 design system.
 */
export function InlinePickerField({
  label,
  displayValue,
  renderPicker,
}: {
  label: string
  /** Display string when not editing. Pass empty string / '--' / '—' to
   *  show the muted em-dash placeholder instead of the literal text. */
  displayValue: string
  renderPicker: (onDone: () => void) => React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const editorRef = useRef<HTMLDivElement | null>(null)

  // Click anywhere outside the editor closes it. Without this, openers
  // like AssetPicker/UserPicker (which render as a button + popover but
  // don't auto-close on outside click of the wrapping field) trap the
  // user in edit mode and visually clash with neighbouring rows.
  useEffect(() => {
    if (!editing) return
    const onDoc = (e: MouseEvent) => {
      const el = editorRef.current
      if (el && !el.contains(e.target as Node)) setEditing(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setEditing(false) }
    // Use mousedown so we close before the picker mounts a fresh
    // popover on the next click.
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [editing])

  // Treat common empty-marker strings as "no value" so the muted
  // em-dash is shown consistently across the form.
  const isBlank = !displayValue || /^[\s\-—–]*$/.test(displayValue)

  if (editing) {
    return (
      <div
        ref={editorRef}
        className="flex flex-col gap-1 py-1.5 border-b border-border/20 sm:flex-row sm:items-start sm:gap-3"
      >
        <span
          className="text-[10px] text-muted-foreground shrink-0 font-semibold uppercase tracking-wider sm:text-xs sm:font-medium sm:tracking-wide sm:pt-1"
          style={{ width: 'var(--opsflux-label-w, 8rem)' } as React.CSSProperties}
        >
          {label}
        </span>
        <div className="flex-1 min-w-0">
          {renderPicker(() => setEditing(false))}
        </div>
      </div>
    )
  }

  return (
    <div
      className="group flex flex-col gap-1 py-1.5 border-b border-border/20 last:border-0 sm:flex-row sm:items-start sm:gap-3"
      title="Cliquez pour modifier"
    >
      <span
        className="text-[10px] text-muted-foreground shrink-0 font-semibold uppercase tracking-wider sm:text-xs sm:font-medium sm:tracking-wide sm:pt-1"
        style={{ width: 'var(--opsflux-label-w, 8rem)' } as React.CSSProperties}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex-1 min-w-0 text-left text-sm text-foreground bg-muted/30 hover:bg-muted/60 hover:ring-1 hover:ring-primary/20 cursor-pointer rounded-md px-2.5 py-1.5 transition-colors break-words [overflow-wrap:anywhere]"
      >
        {isBlank ? <span className="text-muted-foreground/60">—</span> : displayValue}
      </button>
    </div>
  )
}

// -- Task Status Cycle (click to advance) ------------------------------------

export function TaskStatusIcon({ status, size = 13, className }: { status: string; size?: number; className?: string }) {
  const meta = TASK_STATUS_META[status]
  if (!meta) return <Circle size={size} className={cn('text-muted-foreground', className)} />
  const Icon = meta.icon
  return <Icon size={size} className={cn(meta.color, className)} />
}

export function nextTaskStatus(current: string): string {
  const cycle = ['todo', 'in_progress', 'review', 'done']
  const idx = cycle.indexOf(current)
  if (idx === -1) return 'todo'
  return cycle[(idx + 1) % cycle.length]
}
