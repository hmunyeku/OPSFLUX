/**
 * CrossModuleLink — clickable link that navigates to another module's detail.
 *
 * Two modes:
 *  1. "panel" (default) — opens the target in the DynamicPanel (stays on current page)
 *  2. "navigate" — navigates to the target module's page via router
 *
 * Renders as a styled inline link with an optional icon.
 * On hover (300ms delay), fetches a compact preview from the API and shows
 * a rich popover card with object summary (name, code, type, status, date).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ExternalLink,
  Building2,
  Cog,
  FolderKanban,
  CalendarDays,
  Users,
  ShieldCheck,
  UserCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import api from '@/lib/api'

// ── Constants ────────────────────────────────────────────────────────────────

// Display labels for tooltips
const MODULE_LABELS: Record<string, string> = {
  assets: 'Assets',
  tiers: 'Tiers',
  projets: 'Projets',
  planner: 'Planner',
  paxlog: 'PaxLog',
  conformite: 'Conformite',
  travelwiz: 'TravelWiz',
  workflow: 'Workflow',
  'report-editor': 'Report Editor',
  'pid-pfd': 'PID/PFD',
}

// Route map for each module
const MODULE_ROUTES: Record<string, string> = {
  assets: '/assets',
  tiers: '/tiers',
  projets: '/projets',
  planner: '/planner',
  paxlog: '/paxlog',
  conformite: '/conformite',
  travelwiz: '/travelwiz',
  workflow: '/workflow',
  'report-editor': '/report-editor',
  'pid-pfd': '/pid-pfd',
}

// Module icon mapping
const MODULE_ICONS: Record<string, typeof Building2> = {
  tiers: Building2,
  assets: Cog,
  projets: FolderKanban,
  planner: CalendarDays,
  paxlog: Users,
  conformite: ShieldCheck,
  users: UserCircle,
}

// Modules that support the preview API
const PREVIEW_MODULES = new Set([
  'tiers',
  'assets',
  'projets',
  'planner',
  'paxlog',
  'conformite',
  'users',
])

// Status display config (label + color)
const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  active: { label: 'Actif', color: 'bg-emerald-500' },
  actif: { label: 'Actif', color: 'bg-emerald-500' },
  operational: { label: 'Operationnel', color: 'bg-emerald-500' },
  valid: { label: 'Valide', color: 'bg-emerald-500' },
  completed: { label: 'Termine', color: 'bg-emerald-500' },
  draft: { label: 'Brouillon', color: 'bg-zinc-400' },
  planned: { label: 'Planifie', color: 'bg-blue-500' },
  in_progress: { label: 'En cours', color: 'bg-amber-500' },
  on_hold: { label: 'En pause', color: 'bg-orange-500' },
  submitted: { label: 'Soumis', color: 'bg-blue-400' },
  validated: { label: 'Valide', color: 'bg-emerald-500' },
  rejected: { label: 'Rejete', color: 'bg-red-500' },
  cancelled: { label: 'Annule', color: 'bg-zinc-500' },
  expired: { label: 'Expire', color: 'bg-red-400' },
  pending: { label: 'En attente', color: 'bg-amber-400' },
  inactif: { label: 'Inactif', color: 'bg-zinc-400' },
  inactive: { label: 'Inactif', color: 'bg-zinc-400' },
  suspended: { label: 'Suspendu', color: 'bg-orange-500' },
  incomplete: { label: 'Incomplet', color: 'bg-amber-400' },
  'archive': { label: 'Archive', color: 'bg-zinc-500' },
  'bloque': { label: 'Bloque', color: 'bg-red-500' },
}

// ── Preview API ──────────────────────────────────────────────────────────────

interface PreviewData {
  id: string
  code: string | null
  name: string
  type: string | null
  status: string | null
  created_at: string | null
  extra: Record<string, unknown> | null
}

async function fetchPreview(module: string, id: string): Promise<PreviewData> {
  const res = await api.get<PreviewData>(`/api/v1/preview/${module}/${id}`)
  return res.data
}

function usePreview(module: string, id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['preview', module, id],
    queryFn: () => fetchPreview(module, id),
    enabled,
    staleTime: 5 * 60_000, // 5 minutes
    gcTime: 10 * 60_000,   // 10 minutes
    retry: false,
  })
}

// ── Helper: format date ──────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return iso
  }
}

// ── Component ────────────────────────────────────────────────────────────────

interface CrossModuleLinkProps {
  /** Target module slug (e.g., 'projets', 'planner', 'assets') */
  module: string
  /** Record ID to open */
  id: string
  /** Display label */
  label: string
  /** Optional subtype for polymorphic modules (e.g., 'ads', 'activity') */
  subtype?: string
  /** Navigation mode: 'panel' opens in DynamicPanel, 'navigate' changes route */
  mode?: 'panel' | 'navigate'
  /** Show external link icon */
  showIcon?: boolean
  /** Additional CSS classes */
  className?: string
  /** Mono font style for codes/references */
  mono?: boolean
}

export function CrossModuleLink({
  module,
  id,
  label,
  subtype,
  mode = 'panel',
  showIcon = true,
  className,
  mono = false,
}: CrossModuleLinkProps) {
  const navigate = useNavigate()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  // ── Hover state ──────────────────────────────────────────────
  const [showPopover, setShowPopover] = useState(false)
  const [fetchEnabled, setFetchEnabled] = useState(false)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const supportsPreview = PREVIEW_MODULES.has(module)

  const { data: preview, isLoading, isError } = usePreview(module, id, fetchEnabled && supportsPreview)

  const handleMouseEnter = useCallback(() => {
    // Clear any pending leave timer
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
    // Start hover delay (300ms)
    hoverTimerRef.current = setTimeout(() => {
      setShowPopover(true)
      setFetchEnabled(true)
    }, 300)
  }, [])

  const handleMouseLeave = useCallback(() => {
    // Clear hover timer if we leave before 300ms
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    // Grace period before hiding (100ms)
    leaveTimerRef.current = setTimeout(() => {
      setShowPopover(false)
    }, 100)
  }, [])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    }
  }, [])

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Hide popover on click
      setShowPopover(false)

      if (mode === 'navigate') {
        const route = MODULE_ROUTES[module]
        if (route) {
          navigate(route)
          // Also open the detail panel after navigation
          setTimeout(() => {
            openDynamicPanel({
              type: 'detail',
              module,
              id,
              meta: subtype ? { subtype } : undefined,
            })
          }, 100)
        }
      } else {
        openDynamicPanel({
          type: 'detail',
          module,
          id,
          meta: subtype ? { subtype } : undefined,
        })
      }
    },
    [module, id, subtype, mode, navigate, openDynamicPanel],
  )

  if (!id || !label) return null

  const moduleLabel = MODULE_LABELS[module] ?? module
  const ModuleIcon = MODULE_ICONS[module] ?? ExternalLink

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={handleClick}
        className={cn(
          'group/cml relative inline-flex items-center gap-1 text-primary hover:text-primary/80 hover:underline underline-offset-2 transition-colors text-left',
          mono && 'font-mono',
          className,
        )}
      >
        <span className="truncate">{label}</span>
        {showIcon && <ExternalLink size={10} className="shrink-0 opacity-60" />}
      </button>

      {/* Rich hover popover */}
      {showPopover && supportsPreview && (
        <div
          ref={popoverRef}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className={cn(
            'absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2',
            'animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-150',
          )}
        >
          {/* Arrow */}
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-popover border-b border-r border-border" />

          <div className="w-64 rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
            {isLoading ? (
              <PreviewSkeleton />
            ) : isError || !preview ? (
              <FallbackTooltip label={label} moduleLabel={moduleLabel} />
            ) : (
              <PreviewCard preview={preview} ModuleIcon={ModuleIcon} />
            )}
          </div>
        </div>
      )}

      {/* Fallback: simple CSS tooltip for modules without preview support */}
      {!supportsPreview && (
        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-md bg-popover border border-border shadow-lg text-[10px] leading-tight whitespace-nowrap opacity-0 scale-95 group-hover/cml:opacity-100 group-hover/cml:scale-100 transition-all duration-150 z-50">
          <span className="font-semibold text-popover-foreground block">{label}</span>
          <span className="text-muted-foreground">Ouvrir dans {moduleLabel}</span>
        </span>
      )}
    </span>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function PreviewSkeleton() {
  return (
    <div className="p-3 space-y-2.5">
      {/* Name line */}
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-muted animate-pulse shrink-0" />
        <div className="h-4 w-32 rounded bg-muted animate-pulse" />
      </div>
      {/* Code */}
      <div className="h-3 w-28 rounded bg-muted animate-pulse" />
      {/* Type */}
      <div className="h-3 w-24 rounded bg-muted animate-pulse" />
      {/* Status */}
      <div className="h-3 w-20 rounded bg-muted animate-pulse" />
      {/* Date */}
      <div className="h-3 w-24 rounded bg-muted animate-pulse" />
    </div>
  )
}

function FallbackTooltip({ label, moduleLabel }: { label: string; moduleLabel: string }) {
  return (
    <div className="px-3 py-2">
      <div className="font-semibold text-xs text-popover-foreground">{label}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">Ouvrir dans {moduleLabel}</div>
    </div>
  )
}

function PreviewCard({
  preview,
  ModuleIcon,
}: {
  preview: PreviewData
  ModuleIcon: typeof Building2
}) {
  const statusInfo = preview.status ? STATUS_DISPLAY[preview.status] : null

  return (
    <div className="p-3 space-y-1.5">
      {/* Header: icon + name */}
      <div className="flex items-start gap-2">
        <ModuleIcon size={16} className="shrink-0 text-muted-foreground mt-0.5" />
        <span className="text-xs font-semibold text-popover-foreground leading-snug line-clamp-2">
          {preview.name}
        </span>
      </div>

      {/* Code */}
      {preview.code && (
        <div className="text-[11px] text-muted-foreground pl-6">
          <span className="text-muted-foreground/70">Code:</span>{' '}
          <span className="font-mono">{preview.code}</span>
        </div>
      )}

      {/* Type */}
      {preview.type && (
        <div className="text-[11px] text-muted-foreground pl-6">
          <span className="text-muted-foreground/70">Type:</span>{' '}
          <span className="capitalize">{preview.type}</span>
        </div>
      )}

      {/* Status */}
      {preview.status && (
        <div className="text-[11px] text-muted-foreground pl-6 flex items-center gap-1.5">
          <span className="text-muted-foreground/70">Statut:</span>
          <span className={cn('inline-block w-1.5 h-1.5 rounded-full', statusInfo?.color ?? 'bg-zinc-400')} />
          <span>{statusInfo?.label ?? preview.status}</span>
        </div>
      )}

      {/* Created date */}
      {preview.created_at && (
        <div className="text-[11px] text-muted-foreground pl-6">
          <span className="text-muted-foreground/70">Cree le:</span>{' '}
          {formatDate(preview.created_at)}
        </div>
      )}
    </div>
  )
}
