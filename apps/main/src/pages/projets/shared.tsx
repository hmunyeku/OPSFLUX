/**
 * Projets — shared constants, types, and small helper components.
 *
 * Pure restructure of ProjetsPage.tsx — no behavior changes.
 */
import { useState } from 'react'
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
 */
export function InlinePickerField({
  label,
  displayValue,
  renderPicker,
}: {
  label: string
  displayValue: string
  renderPicker: (onDone: () => void) => React.ReactNode
}) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <div>
        <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-0.5">{label}</label>
        {renderPicker(() => setEditing(false))}
      </div>
    )
  }

  return (
    <div
      className="group cursor-pointer"
      onDoubleClick={() => setEditing(true)}
      title="Double-cliquez pour modifier"
    >
      <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-0.5">{label}</label>
      <span className="text-sm text-foreground group-hover:text-primary transition-colors">
        {displayValue}
      </span>
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
