/**
 * WidgetCard — Container for an individual dashboard widget.
 *
 * Renders a card with header (title, refresh, actions) and content area.
 * Content is delegated to WidgetRenderer which picks the right sub-component
 * based on widget.type (kpi, chart, table, map, text).
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveWidgetTitle } from '@/lib/widgetI18n'
import L from 'leaflet'
import {
  GripVertical,
  RefreshCw,
  X,
  Loader2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Table2,
  MapPin,
  Type,
  Gauge,
  Maximize2,
  Minimize2,
  TableProperties,
  Zap,
  Clock,
  LayoutGrid,
  Download,
  Calendar,
  Users,
  Shield,
  ShieldAlert,
  Package,
  Bell,
  Plane,
  Building2,
  Database,
  Briefcase,
  Activity,
  ListChecks,
  GanttChart,
  PieChart,
  Layers,
  FileText,
  CheckCircle2,
  UserCheck,
  AlertCircle,
  ClipboardList,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import { cn } from '@/lib/utils'
import { useWidgetData } from '@/hooks/useDashboard'
import { useUserPreferences } from '@/hooks/useUserPreferences'
import { PerspectiveWidget } from './widgets/PerspectiveWidget'
import type { PerspectiveConfig } from './widgets/PerspectiveWidget'
import { QuickAccessWidget } from './widgets/QuickAccessWidget'
import { ClockWidget } from './widgets/ClockWidget'
import type { DashboardWidget } from '@/services/dashboardService'
import { EChartsWidget } from '@/components/charts/EChartsWidget'
import ReactECharts from 'echarts-for-react'
import { useDashboardFilters } from './DashboardFilterContext'




// ── Common label translations (enum values → French) ────────────
// Centralised mapping so all charts/tables display translated labels
const LABEL_FR: Record<string, string> = {
  // Statuses
  open: 'Ouvert', closed: 'Fermé', resolved: 'Résolu', pending: 'En attente',
  active: 'Actif', inactive: 'Inactif', archived: 'Archivé',
  draft: 'Brouillon', planned: 'Planifié', cancelled: 'Annulé',
  todo: 'À faire', in_progress: 'En cours', review: 'Revue', done: 'Terminé',
  valid: 'Valide', expired: 'Expiré', non_compliant: 'Non conforme',
  approved: 'Approuvé', rejected: 'Rejeté', submitted: 'Soumis',
  validated: 'Validé', completed: 'Terminé',
  // Cargo / logistics statuses
  registered: 'Enregistré', ready: 'Prêt', ready_for_loading: 'Prêt au chargement',
  loaded: 'Chargé', in_transit: 'En transit', delivered: 'Livré',
  delivered_intermediate: 'Livré (escale)', delivered_final: 'Livré (final)',
  return_declared: 'Retour déclaré', return_in_transit: 'Retour en transit',
  returned: 'Retourné', reintegrated: 'Réintégré', scrapped: 'Mis au rebut',
  damaged: 'Endommagé', missing: 'Manquant',
  // Voyage statuses
  scheduled: 'Planifié', boarding: 'Embarquement', departed: 'Parti', arrived: 'Arrivé',
  // PaxLog AdS statuses
  pending_project_review: 'Revue projet', pending_compliance: 'En conformité',
  pending_validation: 'En validation', pending_initiator_review: 'Revue initiateur',
  requires_review: 'À revoir',
  // Priorities
  low: 'Basse', medium: 'Moyenne', high: 'Haute', critical: 'Critique',
  // Types
  client: 'Client', supplier: 'Fournisseur', subcontractor: 'Sous-traitant',
  partner: 'Partenaire', prospect: 'Prospect',
  bug: 'Bug', improvement: 'Amélioration', question: 'Question', feature: 'Fonctionnalité',
  // Weather
  sunny: 'Ensoleillé', cloudy: 'Nuageux', rainy: 'Pluvieux', stormy: 'Orageux',
  // Boolean / misc
  true: 'Oui', false: 'Non', yes: 'Oui', no: 'Non', oui: 'Oui', non: 'Non',
  unknown: 'Inconnu', inconnu: 'Inconnu', n_a: 'N/A', none: '—',
  male: 'Homme', female: 'Femme',
  internal: 'Interne', external: 'Externe',
  // KPI detail keys (project/task/compliance context)
  total: 'Total', avg_progress: 'Avancement moy.', total_budget: 'Budget total',
  tasks_in_progress: 'Tâches en cours', tasks_overdue: 'Tâches en retard',
  tasks_critical: 'Tâches critiques', tasks_done: 'Tâches terminées',
  compliant: 'Conformes', non_compliant_count: 'Non conformes',
  expiring_soon: 'Expirant bientôt', total_active: 'Actifs total',
  overdue: 'En retard', on_time: 'À l\'heure', ahead: 'En avance',
  pending_count: 'En attente', open_count: 'Ouverts',
  mfa_enabled: 'MFA actif', mfa_disabled: 'MFA inactif',
  total_users: 'Utilisateurs', active_users: 'Actifs',
  helice: 'Hélicoptère', bateau: 'Bateau', vehicule: 'Véhicule',
  helicopter: 'Hélicoptère', boat: 'Bateau', vehicle: 'Véhicule',
  offshore: 'Offshore', onshore: 'Onshore',
  // Users KPI details
  online: 'En ligne',
  // Asset KPI details
  fields: 'Champs', sites: 'Sites', installations: 'Installations',
  equipment: 'Équipements', pipelines: 'Pipelines',
  // Tiers KPI details
  clients: 'Clients', suppliers: 'Fournisseurs', subcontractors: 'Sous-traitants',
  contacts: 'Contacts', partners: 'Partenaires',
  // Papyrus KPI details
  in_review: 'En revue', revisions: 'Révisions',
  forms: 'Formulaires', links: 'Liens actifs',
  pending_submissions: 'Soumissions', failed_dispatches: 'Envois échoués',
  // Planner KPI details
  total_pax: 'PAX total',
  // PackLog KPI details
  active_requests: 'Demandes actives', blocked_requests: 'Demandes bloquées',
  cargo_count: 'Colis', total_weight_kg: 'Poids (kg)',
  in_motion: 'En transit', incidents: 'Incidents',
  active_articles: 'Articles actifs', hazmat_articles: 'HAZMAT',
}

/** Translate a raw label to French if a mapping exists */
function tLabel(raw: string): string {
  const key = raw.toLowerCase().replace(/[\s-]+/g, '_')
  return LABEL_FR[key] || raw
}

/** Translate labels in chart data arrays (xField values) */
function translateChartData(data: Record<string, unknown>[], xField: string): Record<string, unknown>[] {
  return data.map(row => {
    const val = row[xField]
    if (typeof val === 'string') {
      return { ...row, [xField]: tLabel(val) }
    }
    return row
  })
}

// ── Widget Type Icon ────────────────────────────────────────────

export function WidgetTypeIcon({ type, className }: { type: string; className?: string }) {
  const cls = cn('h-4 w-4', className)
  switch (type) {
    case 'kpi': return <Gauge className={cls} />
    case 'chart': return <BarChart3 className={cls} />
    case 'table': return <Table2 className={cls} />
    case 'map': return <MapPin className={cls} />
    case 'text': return <Type className={cls} />
    case 'perspective': return <TableProperties className={cls} />
    case 'quick_access': return <Zap className={cls} />
    case 'clock': return <Clock className={cls} />
    case 'group': return <LayoutGrid className={cls} />
    default: return <BarChart3 className={cls} />
  }
}

// ── Main WidgetCard ─────────────────────────────────────────────

interface WidgetCardProps {
  widget: DashboardWidget
  mode: 'view' | 'edit'
  onRemove?: () => void
  onUpdate?: (widget: DashboardWidget) => void
  /** Drag handle props (className for react-grid-layout drag handle) */
  dragHandleProps?: Record<string, unknown>
  /** Badge count for notifications (e.g., alerts, pending items) */
  badge?: number
}

export function WidgetCard({ widget, mode, onRemove, dragHandleProps, badge: _badge }: WidgetCardProps) {
  const { t } = useTranslation()
  const displayTitle = resolveWidgetTitle(widget, t)
  const { filterParams } = useDashboardFilters()
  // Use config.widget_id (provider ID) for data fetching, fallback to widget.id
  const dataWidgetId = (widget.config?.widget_id as string) || widget.id
  const { data, error, refetch, isLoading } = useWidgetData(
    dataWidgetId,
    widget.type,
    widget.config,
    filterParams,
  )

  // Fullscreen persisted in user preferences
  const { getPref, setPref } = useUserPreferences()
  const prefKey = `widget_fullscreen_${widget.id}`
  const [fullscreen, setFullscreenLocal] = useState(() => String(getPref(prefKey, '')) === 'true')
  const setFullscreen = (val: boolean) => {
    setFullscreenLocal(val)
    setPref(prefKey, val ? 'true' : '')
  }

  // Auto-refresh: read interval from widget.config.refresh_interval (seconds)
  const refreshInterval = (widget.config?.refresh_interval as number) || 0
  useEffect(() => {
    if (refreshInterval <= 0) return
    const timer = setInterval(() => refetch(), refreshInterval * 1000)
    return () => clearInterval(timer)
  }, [refreshInterval, refetch])

  // Export widget as image
  const cardRef = useRef<HTMLDivElement>(null)
  const handleExport = useCallback(async () => {
    const el = cardRef.current
    if (!el) return
    try {
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(el, { backgroundColor: null, scale: 2 })
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `${widget.title.replace(/[^a-zA-Z0-9]/g, '_')}.png`
      a.click()
    } catch { /* silent */ }
  }, [widget.title])

  const widgetContent = (
    <>
      {error ? (
        <WidgetError error={error} onRetry={() => refetch()} />
      ) : isLoading && !data ? (
        <WidgetSkeleton type={widget.type} />
      ) : (
        <WidgetRenderer widget={widget} data={Array.isArray(data?.data) ? data.data : data?.data ? [data.data] : []} meta={data?.meta ?? (typeof data?.data === 'object' && !Array.isArray(data?.data) ? data.data as Record<string, unknown> : undefined)} />
      )}
    </>
  )

  // headerBar removed — modern card uses inline compact header

  // Visual customization from config
  const bgColor = (widget.config?.bg_color as string) || ''
  const accentColor = (widget.config?.accent_color as string) || ''
  const hideHeader = (widget.config?.hide_header as boolean) || false
  const hasBgColor = !!bgColor
  const cssVars = {
    ...(accentColor ? { '--widget-accent': accentColor } : {}),
    ...(bgColor ? { backgroundColor: bgColor, color: '#fff' } : {}),
  } as React.CSSProperties

  // ── Widget card shell — professional Elastic-UI style ──
  if (!fullscreen) {
    return (
      <div
        ref={cardRef}
        className={cn(
          'group relative flex flex-col h-full rounded-xl overflow-hidden',
          'border transition-all duration-200',
          // Glassy gradient background + layered shadow for depth. Hover
          // lifts + intensifies primary-tinted shadow (aligns with the
          // StatCard / HomePage vocabulary introduced this sprint).
          !hasBgColor && 'bg-gradient-to-br from-card to-card/70 border-border/70 shadow-[0_1px_3px_0_rgb(0,0,0,0.06)] hover:shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.18)] hover:border-border',
          hasBgColor && 'border-transparent shadow-md',
        )}
        style={{ ...cssVars, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
      >
        {/* 2px accent strip on top — only when the widget isn't already
            saturated with a background colour (hasBgColor). Keeps the
            visual language consistent with StatCards. */}
        {!hasBgColor && (
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary/70 via-primary/30 to-highlight/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          />
        )}
        {/* Header — uppercase label + divider + hover toolbar */}
        <div className={cn(
          'flex items-center px-3 py-1.5 gap-2 shrink-0 border-b',
          !hasBgColor ? 'border-border/60' : 'border-white/10',
          hideHeader && mode !== 'edit' ? 'opacity-0 group-hover:opacity-100 transition-opacity' : 'opacity-100',
        )}>
          {mode === 'edit' && (
            <div {...(dragHandleProps || {})} className="cursor-grab active:cursor-grabbing shrink-0">
              <GripVertical className="h-3 w-3 text-muted-foreground/30" />
            </div>
          )}
          <span className={cn(
            'text-[10.5px] font-semibold tracking-[0.07em] uppercase truncate flex-1 font-display',
            hasBgColor ? 'text-white/80' : 'text-muted-foreground',
          )}>
            {displayTitle}
          </span>
          {/* Toolbar — readable at rest (60% opacity), full on
              hover. Icons bumped from 10px → 13px so they actually
              render inside their 20px button without needing the
              user to hover to find them. Removed `.gl-button` on
              Download/Remove — its 32/40px target was being
              force-collapsed to 20px which was clipping the icon
              to invisibility. */}
          <div className={cn(
            'flex items-center gap-0.5 transition-opacity',
            mode !== 'edit' ? 'opacity-60 group-hover:opacity-100' : 'opacity-90',
          )}>
            <button onClick={() => refetch()} className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-black/6 dark:hover:bg-white/10 transition-colors" title={t('common.refresh')}>
              <RefreshCw className={cn('h-3 w-3', hasBgColor ? 'text-white/80' : 'text-muted-foreground', isLoading && 'animate-spin')} />
            </button>
            <button onClick={handleExport} className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-black/6 dark:hover:bg-white/10 transition-colors" title={t('common.export')}>
              <Download className={cn('h-3 w-3', hasBgColor ? 'text-white/80' : 'text-muted-foreground')} />
            </button>
            <button onClick={() => setFullscreen(true)} className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-black/6 dark:hover:bg-white/10 transition-colors" title={t('common.fullscreen')}>
              <Maximize2 className={cn('h-3 w-3', hasBgColor ? 'text-white/80' : 'text-muted-foreground')} />
            </button>
            {mode === 'edit' && onRemove && (
              <button onClick={onRemove} className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-destructive/10 transition-colors" title={t('common.delete')}>
                <X className="h-3 w-3 text-destructive/80" />
              </button>
            )}
          </div>
        </div>
        {/* Content — table widgets are edge-to-edge, others have padding */}
        <div
          className={cn(
            'flex-1 min-h-0',
            (widget.type === 'table' || widget.type === 'perspective') ? 'overflow-hidden' : 'p-3',
          )}
          style={accentColor ? { '--widget-accent': accentColor } as React.CSSProperties : undefined}
        >
          {widgetContent}
        </div>
      </div>
    )
  }

  // Fullscreen overlay — modern modal
  return (
    <>
      <div className="flex flex-col h-full rounded-xl bg-card border border-border/50 shadow-sm overflow-hidden opacity-30" />
      <div className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm flex items-center justify-center p-8">
        <div className="w-full max-w-6xl h-full max-h-[90vh] bg-card rounded-2xl shadow-2xl border flex flex-col overflow-hidden">
          <div className="flex items-center h-12 px-5 border-b shrink-0">
            <WidgetTypeIcon type={widget.type} className="h-4 w-4 text-primary mr-2" />
            <span className="text-sm font-semibold flex-1 font-display tracking-tight">{displayTitle}</span>
            <button onClick={() => refetch()} className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-muted transition-colors mr-1">
              <RefreshCw className={cn('h-3.5 w-3.5 text-muted-foreground', isLoading && 'animate-spin')} />
            </button>
            <button onClick={() => setFullscreen(false)} className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
              <Minimize2 className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
          <div
            className={cn(
              'flex-1 min-h-0',
              (widget.type === 'table' || widget.type === 'perspective') ? 'overflow-hidden' : 'p-5',
            )}
            style={accentColor ? { '--widget-accent': accentColor } as React.CSSProperties : undefined}
          >
            {widgetContent}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Error State ─────────────────────────────────────────────────

function WidgetError({ onRetry }: { error?: unknown; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
      <AlertTriangle className="h-5 w-5 text-destructive" />
      <p className="text-xs text-muted-foreground">Erreur de chargement</p>
      <button
        onClick={onRetry}
        className="text-xs text-primary hover:underline"
      >
        Réessayer
      </button>
    </div>
  )
}

// ── Loading Skeleton ────────────────────────────────────────────

function WidgetSkeleton({ type }: { type: string }) {
  // Skeleton shimmer style
  const shimmer = 'animate-pulse rounded bg-muted/60'

  if (type === 'kpi') {
    return (
      <div className="flex flex-col h-full gap-3 p-1">
        <div className="flex items-start gap-3">
          <div className={cn(shimmer, 'h-10 w-10 rounded-lg shrink-0')} />
          <div className="flex-1 space-y-2">
            <div className={cn(shimmer, 'h-8 w-24')} />
            <div className={cn(shimmer, 'h-3 w-16')} />
          </div>
          <div className={cn(shimmer, 'h-10 w-20 rounded-md')} />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-auto">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={cn(shimmer, 'h-8 rounded-md')} />
          ))}
        </div>
      </div>
    )
  }

  if (type === 'table') {
    return (
      <div className="flex flex-col h-full">
        <div className={cn(shimmer, 'h-8 w-full rounded-none shrink-0')} />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2 border-b border-border/20">
            <div className={cn(shimmer, 'h-3 w-16')} />
            <div className={cn(shimmer, 'h-3 flex-1')} />
            <div className={cn(shimmer, 'h-5 w-14 rounded-full')} />
          </div>
        ))}
      </div>
    )
  }

  // Chart / default — centered spinner + bar skeleton
  return (
    <div className="flex flex-col items-center justify-end h-full gap-1 pb-4">
      <div className="flex items-end gap-1.5 h-3/4 w-full px-4">
        {[0.4, 0.7, 0.55, 0.9, 0.65, 0.8, 0.5].map((h, i) => (
          <div key={i} className={cn(shimmer, 'flex-1 rounded-sm')} style={{ height: `${h * 100}%` }} />
        ))}
      </div>
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40 mt-2" />
    </div>
  )
}

// ── Widget Renderer (type switch) ───────────────────────────────

function WidgetRenderer({
  widget,
  data,
  meta,
}: {
  widget: DashboardWidget
  data: unknown[]
  meta?: Record<string, unknown>
}) {
  const rendererWidgetId = (widget.config?.widget_id as string) || widget.id
  switch (widget.type) {
    case 'kpi':
      return <KPIWidget widgetId={rendererWidgetId} config={widget.config} data={data} meta={meta} />
    case 'chart':
      return <ChartWidget widgetId={widget.id} config={widget.config} data={data} />
    case 'table':
      // If the widget config has chart_type, it's a chart stored with the wrong type — route to ChartWidget
      if (widget.config?.chart_type) {
        return <ChartWidget widgetId={widget.id} config={widget.config} data={data} />
      }
      return <TableWidget widgetId={widget.id} config={widget.config} data={data} />
    case 'map':
      return <MapWidget config={widget.config} data={data} />
    case 'text':
      return <TextWidget config={widget.config} data={data} />
    case 'perspective':
      return (
        <PerspectiveWidget
          data={data as Record<string, unknown>[]}
          config={widget.config as PerspectiveConfig}
        />
      )
    case 'quick_access':
      return <QuickAccessWidget config={widget.config} data={data} />
    case 'clock':
      return <ClockWidget config={widget.config} />
    case 'group':
      return <GroupWidget config={widget.config} />
    default:
      return (
        <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
          Type de widget inconnu : {widget.type}
        </div>
      )
  }
}

// ── KPI Widget — Kyubit-level card ─────────────────────────────
//
// Layout: [Icon circle] [Value block]     [Sparkline area]
//                        Big number
//                        Delta + comparison
//         [Label below]

// Icon color presets — Elastic UI style: light tinted bg + colored icon
const KPI_ICON_COLORS: Record<string, { bg: string; fg: string }> = {
  blue:   { bg: 'bg-blue-100 dark:bg-blue-500/20 ring-1 ring-inset ring-blue-200 dark:ring-blue-500/30',       fg: 'text-blue-600 dark:text-blue-400' },
  green:  { bg: 'bg-emerald-100 dark:bg-emerald-500/20 ring-1 ring-inset ring-emerald-200 dark:ring-emerald-500/30', fg: 'text-emerald-600 dark:text-emerald-400' },
  red:    { bg: 'bg-red-100 dark:bg-red-500/20 ring-1 ring-inset ring-red-200 dark:ring-red-500/30',           fg: 'text-red-600 dark:text-red-400' },
  orange: { bg: 'bg-orange-100 dark:bg-orange-500/20 ring-1 ring-inset ring-orange-200 dark:ring-orange-500/30', fg: 'text-orange-600 dark:text-orange-400' },
  yellow: { bg: 'bg-yellow-100 dark:bg-yellow-500/20 ring-1 ring-inset ring-yellow-200 dark:ring-yellow-500/30', fg: 'text-yellow-700 dark:text-yellow-400' },
  violet: { bg: 'bg-violet-100 dark:bg-violet-500/20 ring-1 ring-inset ring-violet-200 dark:ring-violet-500/30', fg: 'text-violet-600 dark:text-violet-400' },
  cyan:   { bg: 'bg-cyan-100 dark:bg-cyan-500/20 ring-1 ring-inset ring-cyan-200 dark:ring-cyan-500/30',       fg: 'text-cyan-600 dark:text-cyan-400' },
  pink:   { bg: 'bg-pink-100 dark:bg-pink-500/20 ring-1 ring-inset ring-pink-200 dark:ring-pink-500/30',       fg: 'text-pink-600 dark:text-pink-400' },
  slate:  { bg: 'bg-slate-100 dark:bg-slate-700/50 ring-1 ring-inset ring-slate-200 dark:ring-slate-600/50',   fg: 'text-slate-600 dark:text-slate-400' },
  // aliases
  amber:  { bg: 'bg-yellow-100 dark:bg-yellow-500/20 ring-1 ring-inset ring-yellow-200 dark:ring-yellow-500/30', fg: 'text-yellow-700 dark:text-yellow-400' },
  indigo: { bg: 'bg-indigo-100 dark:bg-indigo-500/20 ring-1 ring-inset ring-indigo-200 dark:ring-indigo-500/30', fg: 'text-indigo-600 dark:text-indigo-400' },
  teal:   { bg: 'bg-teal-100 dark:bg-teal-500/20 ring-1 ring-inset ring-teal-200 dark:ring-teal-500/30',       fg: 'text-teal-600 dark:text-teal-400' },
}

// Semantic icon map — widget_id → Lucide icon
// Used so each KPI shows a meaningful icon instead of generic Gauge
const WIDGET_ICON_MAP: Record<string, React.ElementType> = {
  // Home / cross-module KPIs
  pax_on_site: Users,
  kpi_fleet: Plane,
  pickup_progress: Zap,
  weather_sites: Activity,
  fleet_map: MapPin,
  // Alerts / Signals
  alerts_urgent: Bell,
  signalements_actifs: AlertCircle,
  // Planner
  planner_overview: Calendar,
  planner_conflicts_kpi: AlertTriangle,
  planner_by_type: PieChart,
  planner_by_status: BarChart3,
  planner_pax_by_site: Users,
  capacity_heatmap: Activity,
  planner_gantt_mini: GanttChart,
  planner_workload_chart: BarChart3,
  // Compliance / Conformité
  compliance_expiry: ShieldAlert,
  compliance_kpi: Shield,
  compliance_rate: CheckCircle2,
  conformite_kpis: Shield,
  conformite_urgency: ShieldAlert,
  conformite_by_status: BarChart3,
  conformite_by_category: BarChart3,
  conformite_matrix: Layers,
  conformite_trend: Activity,
  // PaxLog / ADS
  pax_ads_pending: Clock,
  ads_pending: Clock,
  my_ads: UserCheck,
  trips_today: Plane,
  paxlog_compliance_rate: Shield,
  paxlog_incidents: AlertTriangle,
  paxlog_ads_by_status: BarChart3,
  paxlog_expiring_credentials: ShieldAlert,
  // PackLog / Cargo
  cargo_pending: Package,
  packlog_overview: Package,
  packlog_requests: Package,
  packlog_cargo: Package,
  packlog_requests_by_status: BarChart3,
  packlog_cargo_by_status: BarChart3,
  packlog_tracking: Activity,
  packlog_alerts: Bell,
  packlog_catalog_overview: Database,
  // Projects
  projets_kpis: Briefcase,
  project_status: Briefcase,
  projets_deadlines: Calendar,
  projets_top_volume: BarChart3,
  projets_weather: Activity,
  // Assets
  assets_overview: Database,
  assets_kpi: Database,
  assets_equipment_by_class: BarChart3,
  assets_by_status: BarChart3,
  assets_sites_by_type: BarChart3,
  assets_map: MapPin,
  // Tiers / Contacts
  tiers_overview: Building2,
  tiers_kpi: Building2,
  tiers_by_type: PieChart,
  tiers_recent: Building2,
  contacts_kpi: Building2,
  // Users
  users_overview: Users,
  users_mfa_stats: Shield,
  users_by_role: BarChart3,
  users_by_group: BarChart3,
  users_recent_activity: Activity,
  users_orphans: AlertTriangle,
  // Support
  support_overview: AlertCircle,
  support_by_status: BarChart3,
  support_by_priority: BarChart3,
  support_by_type: PieChart,
  support_trend: Activity,
  support_tickets_recent: AlertCircle,
  // Papyrus docs
  papyrus_overview: FileText,
  papyrus_recent_documents: FileText,
  papyrus_by_status: BarChart3,
  papyrus_by_type: PieChart,
  papyrus_forms_overview: ListChecks,
  // Workflow
  workflow_overview: Zap,
  workflow_by_definition: BarChart3,
  workflow_pending: Clock,
  // MOCtrack — Management of Change
  moc_overview: ClipboardList,
  moc_awaiting_validation: Clock,
  moc_by_status: PieChart,
  moc_by_site: BarChart3,
  moc_by_priority: BarChart3,
  moc_by_manager: Users,
  moc_promotion_ratio: CheckCircle2,
  moc_recent: ClipboardList,
}

// Semantic color map — widget_id → color preset key
// Governs the tinted icon badge background/foreground on KPI cards
const WIDGET_COLOR_MAP: Record<string, string> = {
  // Alerts / urgent → red
  alerts_urgent: 'red', signalements_actifs: 'red', paxlog_incidents: 'red',
  conformite_urgency: 'red', conformite_urgency_kpi: 'red', support_overview: 'red',
  // Compliance / certification → orange
  compliance_expiry: 'orange', paxlog_expiring_credentials: 'orange',
  conformite_kpis: 'orange', users_orphans: 'orange', workflow_pending: 'orange',
  // PAX / People → violet
  pax_on_site: 'violet', users_overview: 'violet', pax_ads_pending: 'violet',
  planner_pax_by_site: 'violet', tiers_overview: 'violet',
  // Compliance rate / MFA / shield → green
  paxlog_compliance_rate: 'green', users_mfa_stats: 'green',
  compliance_rate: 'green', conformite_by_status: 'green',
  // Fleet / transport → blue (default)
  kpi_fleet: 'blue', trips_today: 'blue', fleet_map: 'blue', planner_overview: 'blue',
  // ADS / clock items → cyan
  ads_pending: 'cyan', my_ads: 'cyan', planner_conflicts_kpi: 'cyan',
  // Cargo / packages → yellow
  packlog_overview: 'yellow', cargo_pending: 'yellow', packlog_catalog_overview: 'yellow',
  // Projects / workflow → green
  projets_kpis: 'green', project_status: 'green', workflow_overview: 'green',
  papyrus_overview: 'green', papyrus_forms_overview: 'green',
  // Assets → slate
  assets_overview: 'slate',
  // pickup / quick KPIs → pink
  pickup_progress: 'pink',
  // MOCtrack — blue for overview, orange for backlog/attente,
  // violet for people-oriented, green for promotion success
  moc_overview: 'blue',
  moc_awaiting_validation: 'orange',
  moc_by_manager: 'violet',
  moc_promotion_ratio: 'green',
}

function KPIWidget({
  widgetId,
  config,
  data,
  meta,
}: {
  widgetId?: string
  config: Record<string, unknown>
  data: unknown[]
  meta?: Record<string, unknown>
}) {
  const valueField = (config.value_field as string) || 'value'
  const labelField = (config.label as string) || (meta?.label as string) || ''
  const trend = (meta?.trend as number) ?? (config.trend as number) ?? null
  const comparison = (meta?.comparison as string) || (config.comparison as string) || ''
  const rawUnit = (config.unit as string) || (meta?.unit as string) || ''
  // Auto-detect percent format when unit is "%" to show e.g. "65.0%" instead of "65 %"
  const format = (config.format as string) || (rawUnit === '%' ? 'percent' : 'number')
  const unit = rawUnit === '%' && format === 'percent' ? '' : rawUnit
  // Color: explicit config → semantic map → fallback blue
  const iconColor = (config.icon_color as string) || (widgetId ? WIDGET_COLOR_MAP[widgetId] : '') || 'blue'
  const iconPreset = KPI_ICON_COLORS[iconColor] || KPI_ICON_COLORS.blue
  const IconComp = (widgetId ? WIDGET_ICON_MAP[widgetId] : null) || Gauge

  // Extract value
  const rawValue = data?.[0]
    ? (data[0] as Record<string, unknown>)[valueField]
    : meta?.value
  const numValue = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue ?? '0'))

  // Format display value
  let displayValue: string
  if (format === 'currency') {
    displayValue = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 }).format(numValue)
  } else if (format === 'percent') {
    displayValue = `${numValue.toFixed(1)}%`
  } else if (numValue >= 1_000_000) {
    displayValue = `${(numValue / 1_000_000).toFixed(1)}M`
  } else if (numValue >= 10_000) {
    displayValue = `${(numValue / 1_000).toFixed(1)}k`
  } else {
    displayValue = new Intl.NumberFormat('fr-FR').format(numValue)
  }

  // Trend
  const trendUp = trend !== null && trend > 0
  const trendDown = trend !== null && trend < 0
  const TrendIcon = trend === null ? null : trendUp ? TrendingUp : trendDown ? TrendingDown : Minus
  const trendColor = trend === null ? 'text-muted-foreground' : trendUp ? 'text-emerald-600' : trendDown ? 'text-red-500' : 'text-muted-foreground'

  // Sparkline: use real data from meta/config, else generate a subtle pattern
  // If value is 0, use a flat line so we don't imply false activity
  const rawSparkline = (meta?.sparkline as number[]) || (config.sparkline as number[]) || null
  const sparklineData = rawSparkline || (() => {
    if (numValue === 0) return Array(8).fill(0)
    const base = Math.max(numValue, 1)
    const seed = (numValue * 7 + 13) % 19 + 2
    return Array.from({ length: 8 }, (_, i) => {
      const wave = Math.sin(i * 0.9 + seed) * base * 0.25
      return Math.max(0, Math.round(base * 0.8 + wave + i * base * 0.03))
    })
  })()
  const sparklineColor = trend === null ? '#3b82f6' : trendUp ? '#10b981' : trendDown ? '#ef4444' : '#94a3b8'

  // Details
  const details = (meta?.details || config.details) as Record<string, unknown> | undefined

  const hasDetails = details && Object.keys(details).length > 0

  return (
    <div className="flex flex-col h-full">
      {/* ── Top section: icon + value + trend (shrink-0) ── */}
      <div className="flex items-start gap-3 shrink-0">
        {/* Icon badge — slightly larger (40px) with a layered look
            (ring + subtle gradient) so it reads as a first-class
            visual element next to the big KPI number instead of a
            tiny decorative chip. */}
        <div className={cn(
          'h-10 w-10 rounded-lg flex items-center justify-center shrink-0',
          'bg-gradient-to-br from-white/40 to-transparent dark:from-white/[0.04]',
          iconPreset.bg,
        )}>
          <IconComp className={cn('h-[18px] w-[18px]', iconPreset.fg)} />
        </div>
        {/* Value + trend */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[1.875rem] font-bold tracking-[-0.04em] leading-none text-foreground tabular-nums">
              {displayValue}
            </span>
            {unit && <span className="text-xs text-muted-foreground/70 font-medium">{unit}</span>}
          </div>
          {trend !== null && (
            <div className="flex items-center gap-1.5 mt-1">
              {TrendIcon && <TrendIcon className={cn('h-3.5 w-3.5', trendColor)} />}
              <span className={cn('text-xs font-semibold', trendColor)}>
                {trendUp ? '+' : ''}{trend}%
              </span>
              {comparison && <span className="text-[11px] text-muted-foreground ml-1">{comparison}</span>}
            </div>
          )}
          {!trend && comparison && (
            <span className="text-[11px] text-muted-foreground mt-0.5 block">{comparison}</span>
          )}
        </div>
      </div>

      {/* Label */}
      {labelField && (
        <span className="text-[11px] text-muted-foreground/70 font-medium uppercase tracking-wider mt-0.5 shrink-0">
          {labelField}
        </span>
      )}

      {/* ── Middle: sparkline fills available space, capped at 128px ── */}
      {sparklineData && sparklineData.length > 1 && (
        <div className="flex-1 min-h-0 max-h-28 py-1">
          <KPISparkline data={sparklineData} color={sparklineColor} />
        </div>
      )}

      {/* ── Bottom: detail stat grid ── */}
      {hasDetails && (
        <div className={cn(
          'shrink-0 grid gap-x-2 gap-y-1',
          Object.keys(details!).length <= 4 ? 'grid-cols-2' : 'grid-cols-3',
        )}>
          {Object.entries(details!).slice(0, 9).map(([k, v]) => {
            const label = tLabel(k)
            const n = typeof v === 'number' ? v : parseFloat(String(v))
            // Smart formatting based on key semantics
            let val: string
            if (/progress|rate|pct|percent/i.test(k)) {
              val = `${isNaN(n) ? 0 : n.toFixed(1)}%`
            } else if (/budget|amount|montant/i.test(k)) {
              val = n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(Math.round(n))
            } else if (typeof v === 'number' && !Number.isInteger(v)) {
              val = n.toFixed(1)
            } else {
              val = String(v)
            }
            const isGood = /compliant|active|done|valid|completed|on_time|ahead/i.test(k)
            const isBad = /overdue|expired|critical|cancelled|non_compliant|expiring/i.test(k)
            const valColor = isGood
              ? 'text-emerald-600 dark:text-emerald-400'
              : isBad ? 'text-red-500 dark:text-red-400'
              : 'text-foreground'
            return (
              <div key={k} className="flex items-center justify-between gap-1 px-1.5 py-1 rounded bg-muted/40 hover:bg-muted/60 transition-colors min-w-0">
                <span className="text-[9.5px] font-medium text-muted-foreground truncate">{label}</span>
                <span className={cn('text-[11px] font-bold tabular-nums shrink-0', valColor)}>{val}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── KPI Sparkline (mini area chart) ────────────────────────────

function KPISparkline({ data, color }: { data: number[]; color: string }) {
  const option = useMemo(() => ({
    grid: { top: 0, right: 0, bottom: 0, left: 0 },
    xAxis: { type: 'category' as const, show: false, data: data.map((_, i) => i) },
    yAxis: { type: 'value' as const, show: false, min: Math.min(...data) * 0.9, max: Math.max(...data) * 1.05 },
    series: [{
      type: 'line' as const,
      data,
      smooth: true,
      symbol: 'none',
      lineStyle: { width: 2, color },
      areaStyle: { color: { type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: color + '40' }, { offset: 1, color: color + '05' }] } },
    }],
    tooltip: { show: false },
    animation: false,
  }), [data, color])

  return <ReactECharts option={option} style={{ height: '100%', width: '100%', touchAction: 'pan-y' }} opts={{ renderer: 'svg' }} />
}

// ── Group Widget — Container for mini-KPI tiles ────────────────

interface GroupChild {
  title: string
  value: number | string
  format?: string
  unit?: string
  trend?: number | null
  sparkline?: number[]
  icon?: string
  color?: string
}

function GroupWidget({ config }: { config: Record<string, unknown> }) {
  const layout = (config.layout as string) || '2x2'
  const children = (config.children as GroupChild[]) || []

  // Parse layout → grid classes
  const gridClass = layout === '1x4' ? 'grid-cols-4'
    : layout === '4x1' ? 'grid-cols-1'
    : layout === '3x1' ? 'grid-cols-3'
    : layout === '1x3' ? 'grid-cols-1'
    : 'grid-cols-2' // 2x2 default

  if (!children.length) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground/40">
        <LayoutGrid className="h-5 w-5 mr-2 opacity-30" />
        Configurer les KPIs enfants
      </div>
    )
  }

  return (
    <div className={cn('grid gap-2 h-full', gridClass)}>
      {children.map((child, idx) => (
        <GroupChildTile key={idx} child={child} />
      ))}
    </div>
  )
}

function GroupChildTile({ child }: { child: GroupChild }) {
  const { title, value, format, unit, trend, sparkline, color } = child

  // Format value
  const numValue = typeof value === 'number' ? value : parseFloat(String(value ?? '0'))
  let displayValue: string
  if (format === 'currency') {
    displayValue = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 }).format(numValue)
  } else if (format === 'percent') {
    displayValue = `${numValue.toFixed(1)}%`
  } else if (numValue >= 1_000_000) {
    displayValue = `${(numValue / 1_000_000).toFixed(1)}M`
  } else if (numValue >= 10_000) {
    displayValue = `${(numValue / 1_000).toFixed(1)}k`
  } else {
    displayValue = typeof value === 'string' ? value : new Intl.NumberFormat('fr-FR').format(numValue)
  }

  const trendColor = trend == null ? '' : trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-red-500' : 'text-muted-foreground'
  const TrendIcon = trend == null ? null : trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus
  const accentColor = color || 'hsl(var(--primary))'
  const sparkColor = trend == null ? '#3b82f6' : trend > 0 ? '#22c55e' : trend < 0 ? '#ef4444' : '#94a3b8'

  return (
    <div className="flex flex-col justify-between rounded-lg bg-muted/30 dark:bg-muted/10 border border-border/30 px-3 py-2 min-h-0 overflow-hidden">
      {/* Title */}
      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide truncate">{title}</span>
      {/* Value row */}
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="text-xl font-extrabold tracking-tight leading-none" style={{ color: accentColor }}>
          {displayValue}
        </span>
        {unit && <span className="text-[10px] text-muted-foreground/60">{unit}</span>}
      </div>
      {/* Trend + sparkline */}
      <div className="flex items-center justify-between mt-1 min-h-[16px]">
        {trend != null ? (
          <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-semibold', trendColor)}>
            {TrendIcon && <TrendIcon className="h-2.5 w-2.5" />}
            {trend > 0 ? '+' : ''}{trend}%
          </span>
        ) : <span />}
        {sparkline && sparkline.length > 1 && (
          <div className="h-4 w-12">
            <KPISparkline data={sparkline} color={sparkColor} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Chart Widget ────────────────────────────────────────────────

function ChartWidget({
  widgetId,
  config,
  data,
}: {
  widgetId: string
  config: Record<string, unknown>
  data: unknown[]
}) {
  const { toggleFilter } = useDashboardFilters()
  const chartType = (config.chart_type as string) || 'bar'
  const xField = (config.x_field as string) || 'name'
  const yFields = (config.y_fields as string[]) || ['value']
  const stacked = config.stacked === true
  const crossFilterEnabled = config.cross_filter !== false

  // Provider may return {data: [...], series: [...]} or a flat array
  const firstItem = data?.[0] as Record<string, unknown> | undefined
  const chartData = (firstItem && Array.isArray(firstItem.data))
    ? (firstItem.data as Record<string, unknown>[])
    : (data as Record<string, unknown>[])

  // Extract series names from provider series config (e.g. [{name: "AdS", type: "bar"}])
  const providerSeries = (firstItem && Array.isArray(firstItem.series))
    ? (firstItem.series as { name?: string; type?: string }[])
    : null
  const getSeriesName = (fieldKey: string, idx: number): string =>
    providerSeries?.[idx]?.name || fieldKey.replace(/_/g, ' ')

  // Map legacy chart_type values to EChartsWidget types
  const validTypes = ['bar', 'line', 'area', 'pie', 'scatter', 'radar', 'heatmap', 'gauge', 'treemap'] as const
  type ChartType = typeof validTypes[number]
  const resolvedType: ChartType = validTypes.includes(chartType as ChartType)
    ? (chartType as ChartType)
    : 'bar'

  // Cross-filter: click on chart element → toggle filter
  const handleChartClick = useCallback((params: Record<string, unknown>) => {
    if (!crossFilterEnabled) return
    const name = params.name as string
    if (name) {
      toggleFilter({ field: xField, value: name, source: widgetId, label: xField.replace(/_/g, ' ') })
    }
  }, [crossFilterEnabled, xField, widgetId, toggleFilter])

  // Translate enum labels in chart data (open→Ouvert, supplier→Fournisseur, etc.)
  const translatedData = useMemo(() => translateChartData(chartData, xField), [chartData, xField])

  // Gantt chart — custom renderer
  if (chartType === 'gantt') {
    return <GanttWidget data={chartData} />
  }

  // Empty state
  if (!chartData.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <BarChart3 className="h-8 w-8 text-muted-foreground/20" />
        <span className="text-xs text-muted-foreground/40">Aucune donnée</span>
      </div>
    )
  }

  // Build seriesNames from provider series config (e.g. [{name: "AdS"}])
  const resolvedSeriesNames = yFields.map((_, i) => getSeriesName(yFields[i], i))

  return (
    <EChartsWidget
      chartType={resolvedType}
      data={translatedData}
      xField={xField}
      yFields={yFields}
      seriesNames={resolvedSeriesNames}
      stacked={stacked}
      height="100%"
      onChartClick={handleChartClick}
    />
  )
}

// ── Gantt Widget — Horizontal timeline chart ────────────────────

const GANTT_STATUS_COLORS: Record<string, string> = {
  draft: '#94a3b8',
  submitted: '#6366f1',
  validated: '#8b5cf6',
  in_progress: '#3b82f6',
  completed: '#22c55e',
  done: '#22c55e',
  cancelled: '#ef4444',
  planned: '#f59e0b',
}

function GanttWidget({ data }: { data: unknown[] }) {
  const activities = (data as Record<string, unknown>[])
    .filter((a) => a.start_date || a.end_date)
    .slice(0, 14)

  const isDark = document.documentElement.classList.contains('dark')

  const option = useMemo(() => {
    if (!activities.length) return {}
    const now = Date.now()
    const toMs = (d: unknown) => d ? new Date(d as string).getTime() : null
    const startTimes = activities.map((a) => toMs(a.start_date)).filter(Boolean) as number[]
    const endTimes = activities.map((a) => toMs(a.end_date)).filter(Boolean) as number[]
    const minDate = Math.min(...startTimes, now - 86400000 * 5)
    const maxDate = Math.max(...endTimes, now + 86400000 * 14)

    // Build reversed for display (last = top)
    const reversed = [...activities].reverse()
    const categories = reversed.map((a) =>
      String(a.title || a.asset_name || 'Activité').slice(0, 26)
    )

    const seriesData = reversed.map((a, idx) => {
      const start = toMs(a.start_date) || now
      const end = toMs(a.end_date) || start + 86400000 * 7
      const status = String(a.status || 'draft').toLowerCase()
      const progress = typeof a.progress === 'number' ? Math.min(100, Math.max(0, a.progress)) : 0
      const type = String(a.activity_type || a.type || '').toLowerCase()
      return {
        name: String(a.title || ''),
        value: [start, end, idx, progress, start] as [number, number, number, number, number],
        status,
        itemStyle: { color: GANTT_STATUS_COLORS[status] || '#3b82f6' },
        activityType: type,
      }
    })

    const textColor = isDark ? '#94a3b8' : '#64748b'
    const gridColor = isDark ? '#1e293b' : '#f1f5f9'
    const axisColor = isDark ? '#334155' : '#e2e8f0'
    const todayColor = '#ef4444'

    return {
      tooltip: {
        trigger: 'item' as const,
        formatter: (params: { name: string; value: [number, number, number, number]; data: { status: string; activityType: string } }) => {
          const [start, end, , progress] = params.value
          const fmt = (ts: number) => new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })
          const dur = Math.ceil((end - start) / 86400000)
          const statusLabel: Record<string, string> = {
            draft: 'Brouillon', submitted: 'Soumis', validated: 'Validé',
            in_progress: 'En cours', completed: 'Terminé', done: 'Terminé',
            cancelled: 'Annulé', planned: 'Planifié',
          }
          const st = statusLabel[params.data?.status] || params.data?.status || ''
          return [
            `<div style="font-size:12px;font-weight:600;margin-bottom:4px">${params.name}</div>`,
            `<div style="font-size:11px;color:#94a3b8">${fmt(start)} → ${fmt(end)} <b style="color:#64748b">(${dur}j)</b></div>`,
            st ? `<div style="font-size:11px;margin-top:3px">Statut : <b>${st}</b></div>` : '',
            progress > 0 ? `<div style="font-size:11px">Avancement : <b>${progress}%</b></div>` : '',
          ].filter(Boolean).join('')
        },
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        textStyle: { color: isDark ? '#e2e8f0' : '#1e293b', fontSize: 12 },
        extraCssText: 'box-shadow:0 4px 16px rgba(0,0,0,0.12);border-radius:8px;padding:10px 12px',
      },
      grid: { top: 4, right: 10, bottom: 22, left: 0, containLabel: true },
      xAxis: {
        type: 'time' as const,
        min: minDate,
        max: maxDate,
        axisLabel: {
          fontSize: 10,
          color: textColor,
          formatter: (v: number) => {
            const d = new Date(v)
            const day = d.getDate()
            if (day === 1 || day === 15) {
              return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
            }
            return day === 8 || day === 22 ? `${day}` : ''
          },
        },
        splitLine: {
          show: true,
          lineStyle: { color: gridColor, type: 'solid' as const, width: 1 },
        },
        axisLine: { lineStyle: { color: axisColor } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'category' as const,
        data: categories,
        axisLabel: {
          fontSize: 9,
          color: textColor,
          width: 110,
          overflow: 'truncate' as const,
          rich: {},
          lineHeight: 14,
        },
        axisTick: { show: false },
        axisLine: { show: false },
        splitLine: {
          show: true,
          lineStyle: { color: gridColor, type: 'solid' as const, width: 1, opacity: 0.6 },
        },
      },
      series: [
        // Main bars
        {
          type: 'custom' as const,
          z: 2,
          renderItem: (
            _params: unknown,
            api: {
              value: (idx: number) => number
              coord: (arr: number[]) => number[]
              size: (arr: number[]) => number[]
              style: () => object
            },
          ) => {
            const start = api.value(0)
            const end = api.value(1)
            const catIdx = api.value(2)
            const progress = api.value(3) / 100
            const startCoord = api.coord([start, catIdx])
            const endCoord = api.coord([end, catIdx])
            const cellH = Math.abs(api.size([0, 1])[1])
            const barH = Math.min(10, Math.max(5, cellH * 0.38))
            const x = Math.min(startCoord[0], endCoord[0])
            const totalW = Math.max(4, Math.abs(endCoord[0] - startCoord[0]))
            const progressW = Math.max(0, totalW * progress)
            const y = startCoord[1] - barH / 2
            const style = api.style() as Record<string, unknown>
            const barColor = style.fill as string || '#3b82f6'
            const pct = Math.round(progress * 100)

            return {
              type: 'group',
              children: [
                // Background track (subtle, full width)
                {
                  type: 'rect',
                  shape: { x, y, width: totalW, height: barH, r: 3 },
                  style: { fill: barColor, opacity: 0.18 },
                  z2: 1,
                },
                // Progress fill
                ...(progress > 0 ? [
                  {
                    type: 'rect',
                    shape: { x, y: y + 0.5, width: Math.max(barH * 1.2, progressW), height: barH - 1, r: 2.5 },
                    style: { fill: barColor, opacity: 0.88 },
                    z2: 2,
                  },
                  // Progress % label (only when bar is wide enough)
                  ...(totalW > 38 && pct > 0 ? [{
                    type: 'text' as const,
                    style: {
                      text: `${pct}%`,
                      x: x + Math.min(progressW, totalW) - 2,
                      y: startCoord[1],
                      textAlign: 'right' as const,
                      textVerticalAlign: 'middle' as const,
                      fontSize: 6.5,
                      fill: '#fff',
                      fontWeight: 'bold' as const,
                    },
                    z2: 3,
                  }] : []),
                ] : [
                  // No progress: full opaque pill
                  {
                    type: 'rect',
                    shape: { x, y: y + 0.5, width: totalW, height: barH - 1, r: 2.5 },
                    style: { fill: barColor, opacity: 0.72 },
                    z2: 2,
                  },
                ]),
              ],
            }
          },
          encode: { x: [0, 1], y: 2 },
          data: seriesData,
        },
        // Today line
        {
          type: 'line' as const,
          z: 10,
          markLine: {
            symbol: ['none', 'none'],
            silent: true,
            data: [{ xAxis: now }],
            lineStyle: { color: todayColor, width: 1.5, type: 'solid' as const, opacity: 0.8 },
            label: {
              show: true,
              position: 'insideStartTop' as const,
              formatter: "Auj.",
              fontSize: 9,
              color: todayColor,
              fontWeight: 'bold' as const,
              distance: 2,
            },
          },
          data: [],
        },
      ],
      animation: false,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(activities), isDark])

  if (!activities.length) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-xs text-muted-foreground/50">
        <GanttChart className="h-4 w-4" />
        Aucune activité planifiée
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <ReactECharts option={option} style={{ height: '100%', width: '100%', touchAction: 'pan-y' }} opts={{ renderer: 'svg' }} />
      {/* Status legend — ultra-compact */}
      <div className="flex items-center gap-2 flex-wrap px-1 pb-0.5 shrink-0 border-t border-border/40 pt-0.5 mt-0.5">
        {([['in_progress', 'En cours'], ['completed', 'Terminé'], ['planned', 'Planifié'], ['draft', 'Brouillon']] as [string, string][]).map(([k, l]) => (
          <span key={k} className="flex items-center gap-1 text-[8.5px] text-muted-foreground/70">
            <span className="inline-block h-1.5 w-2.5 rounded-[2px]" style={{ backgroundColor: GANTT_STATUS_COLORS[k] || '#94a3b8', opacity: 0.82 }} />
            {l}
          </span>
        ))}
        <span className="flex items-center gap-1 text-[8.5px] text-red-400/80 ml-auto">
          <span className="inline-block h-2.5 w-px bg-red-400" />Auj.
        </span>
      </div>
    </div>
  )
}

// ── Table Widget ────────────────────────────────────────────────

function TableWidget({
  widgetId,
  config,
  data: rawData,
}: {
  widgetId: string
  config: Record<string, unknown>
  data: unknown[]
}) {
  const { toggleFilter, isFilterActive } = useDashboardFilters()
  const crossFilterEnabled = config.cross_filter !== false

  // Provider may return {columns, rows} or a flat array of row objects
  const providerData = rawData?.[0] as Record<string, unknown> | undefined
  const hasProviderShape = providerData && Array.isArray(providerData.rows)
  const columns = hasProviderShape
    ? (providerData.columns as { key: string; label: string }[]) || []
    : (config.columns as { key: string; label: string }[]) || []
  const rows = hasProviderShape
    ? (providerData.rows as Record<string, unknown>[])
    : (rawData as Record<string, unknown>[])
  const pageSize = (config.page_size as number) || 10
  const [page, setPage] = useState(0)
  // Sort state
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Hidden columns from config
  const hiddenColumns = (config.hidden_columns as string[]) || []

  // Auto-label map — translates raw DB keys to readable French labels
  const AUTO_LABELS: Record<string, string> = {
    id: 'ID', name: 'Nom', title: 'Titre', status: 'Statut', type: 'Type',
    priority: 'Priorité', progress: 'Avancement', created_at: 'Créé le',
    updated_at: 'Mis à jour', start_date: 'Début', end_date: 'Fin',
    due_date: 'Échéance', date: 'Date', reference: 'Référence',
    code: 'Code', description: 'Description', category: 'Catégorie',
    site: 'Site', location: 'Lieu', asset_name: 'Asset', project: 'Projet',
    count: 'Nb', value: 'Valeur', amount: 'Montant', quantity: 'Qté',
    pax: 'PAX', entity: 'Entité', email: 'Email', phone: 'Tél',
    first_name: 'Prénom', last_name: 'Nom', full_name: 'Nom complet',
    requester: 'Demandeur', assignee: 'Responsable', owner: 'Propriétaire',
    role: 'Rôle', department: 'Département', comment: 'Commentaire',
    expires_at: 'Expiré le', issued_at: 'Émis le',
    flight: 'Vol', origin: 'Origine', destination: 'Destination',
    weight: 'Poids', volume: 'Volume', tracking: 'Suivi',
    // Extra common keys from providers
    label: 'Libellé', unit: 'Unité', trend: 'Tendance',
    vector_name: 'Vecteur', vector_type: 'Type vecteur',
    departure_base: 'Base départ', arrival_base: 'Base arrivée',
    scheduled_departure: 'Départ prévu', scheduled_arrival: 'Arrivée prévue',
    actual_departure: 'Départ réel', actual_arrival: 'Arrivée réelle',
    pax_name: 'PAX', badge_number: 'Badge', credential_name: 'Certification',
    days_remaining: 'Jours restants', expiry_date: 'Expiration',
    tracking_code: 'Tracking', weight_kg: 'Poids (kg)',
    user_name: 'Utilisateur', entity_name: 'Entité', module_name: 'Module',
    last_login: 'Dernière connexion', role_name: 'Rôle',
    completion_rate: '% Terminé', avg_duration: 'Durée moy.',
    pax_count: 'Nb PAX', cargo_count: 'Nb colis', vector_count: 'Nb vecteurs',
    site_name: 'Site', asset_type: 'Type asset', serial_number: 'N° série',
    manufacturer: 'Fabricant', model: 'Modèle',
  }
  const autoLabel = (key: string) =>
    AUTO_LABELS[key] ?? AUTO_LABELS[key.replace(/_id$/, '').replace(/_/g, ' ')] ??
    key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  // Auto-detect columns from first row if not configured
  const allColumns = columns.length > 0
    ? columns
    : rows.length > 0
      ? Object.keys(rows[0]).slice(0, 12).map((key) => ({ key, label: autoLabel(key) }))
      : []

  // Store available column keys in config for the settings panel column picker
  const availableColKeys = allColumns.map((c) => c.key)
  const prevAvailable = (config._available_columns as string[]) || []
  useEffect(() => {
    if (availableColKeys.length > 0 && JSON.stringify(availableColKeys) !== JSON.stringify(prevAvailable)) {
      // Silently patch config — this is read-only metadata for the settings panel
      ;(config as Record<string, unknown>)._available_columns = availableColKeys
    }
  }, [availableColKeys, prevAvailable, config])

  // Apply column visibility filter
  const effectiveColumns = hiddenColumns.length > 0
    ? allColumns.filter((c) => !hiddenColumns.includes(c.key))
    : allColumns

  // Click handler for cross-filtering
  const handleCellClick = (key: string, value: unknown) => {
    if (!crossFilterEnabled || value == null) return
    toggleFilter({ field: key, value, source: widgetId, label: key.replace(/_/g, ' ') })
  }

  // ── Smart cell rendering ──

  // Status badge colors — comprehensive mapping for all OpsFlux statuses
  const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    // Neutral / draft
    draft: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' },
    brouillon: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' },
    todo: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' },
    // Planned / scheduled
    planned: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
    planifie: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
    scheduled: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
    // Active / in-progress
    active: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
    in_progress: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
    boarding: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
    departed: { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-300' },
    in_transit: { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-300' },
    // Pending / waiting
    pending: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300' },
    submitted: { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-300' },
    review: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300' },
    pending_validation: { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-300' },
    pending_compliance: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300' },
    pending_project_review: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300' },
    pending_initiator_review: { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-700 dark:text-violet-300' },
    pending_arbitration: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' },
    requires_review: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
    pending_validation_: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
    // Ready / prepared
    ready: { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-700 dark:text-teal-300' },
    ready_for_loading: { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-700 dark:text-teal-300' },
    // Approved / validated
    approved: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
    validated: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
    valid: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
    // Completed / done
    completed: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
    done: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
    arrived: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
    delivered: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
    delivered_final: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
    reintegrated: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
    // Halted / hold
    suspended: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300' },
    on_hold: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300' },
    // Negative / cancelled / expired
    cancelled: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' },
    rejected: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' },
    expired: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' },
    non_compliant: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' },
    missing: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' },
    damaged: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' },
    scrapped: { bg: 'bg-slate-200 dark:bg-slate-700', text: 'text-slate-500 dark:text-slate-400' },
    archived: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-500 dark:text-slate-400' },
    // Cargo transit states
    loaded: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
    returned: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' },
    registered: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' },
  }

  const PRIORITY_COLORS: Record<string, string> = {
    low: 'text-emerald-600', medium: 'text-amber-600', high: 'text-orange-600', critical: 'text-red-600',
  }

  const isStatusCol = (key: string) => /status|statut/i.test(key)
  const isPriorityCol = (key: string) => /priority|priorite|priorité/i.test(key)
  const isProgressCol = (key: string) => /progress|pct|avancement|%/i.test(key)
  const isDateCol = (key: string) => /date|echeance|échéance|deadline|start|end|debut|fin|created|updated|_at$|login|connexion|expire|expir/i.test(key)
  const isRefCol = (key: string, colIdx: number) => colIdx === 0 || /code|ref|reference|id$/i.test(key)
  const isNumericCol = (key: string) => /count|nb|nombre|pax|weight|volume|amount|montant|value|valeur|qty|quantite|quantité|score|rate|taux|pct|percent|progress/i.test(key)

  // Toggle sort on a column — reset page on sort change
  const handleSort = (key: string) => {
    if (sortField === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(key)
      setSortDir('asc')
    }
    setPage(0)
  }

  // Apply sort to rows
  const sortedRows = useMemo(() => {
    if (!sortField) return rows
    return [...rows].sort((a, b) => {
      const av = a[sortField]
      const bv = b[sortField]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      // Numeric comparison if both parse as numbers
      const an = parseFloat(String(av))
      const bn = parseFloat(String(bv))
      if (!isNaN(an) && !isNaN(bn)) {
        return sortDir === 'asc' ? an - bn : bn - an
      }
      // String comparison
      const as_ = String(av).toLowerCase()
      const bs_ = String(bv).toLowerCase()
      return sortDir === 'asc' ? as_.localeCompare(bs_) : bs_.localeCompare(as_)
    })
  }, [rows, sortField, sortDir])

  const renderCell = (value: unknown, key: string, colIdx: number) => {
    if (value == null) return <span className="text-muted-foreground/30">—</span>
    // Guard against objects — extract a display string instead of [object Object]
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>
      const s = obj.name ?? obj.label ?? obj.code ?? obj.title ?? obj.value ?? obj.id
      if (s != null) return renderCell(s, key, colIdx)
      // Last resort: show JSON
      try { return <span className="text-[10px] text-muted-foreground font-mono">{JSON.stringify(value)}</span> } catch { return <span className="text-muted-foreground/30">—</span> }
    }
    const s = String(value)

    // Days remaining — urgency coloring
    if (/days_remaining|jours_restants/i.test(key)) {
      const n = parseInt(s)
      if (!isNaN(n)) {
        const urgent = n <= 7
        const warning = n <= 14
        const cls = urgent
          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
          : warning
            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
            : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
        return <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold tabular-nums', cls)}>{n}j</span>
      }
    }

    // Status badge
    if (isStatusCol(key)) {
      const normalized = s.toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z_]/g, '')
      const colors = STATUS_COLORS[normalized] || STATUS_COLORS.draft
      return <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold', colors?.bg, colors?.text)}>{tLabel(s)}</span>
    }

    // Priority with color
    if (isPriorityCol(key)) {
      const color = PRIORITY_COLORS[s.toLowerCase()] || ''
      return <span className={cn('font-semibold text-[10px] uppercase', color)}>{tLabel(s)}</span>
    }

    // Progress circle
    if (isProgressCol(key)) {
      const n = parseInt(s) || 0
      const color = n >= 70 ? '#22c55e' : n >= 30 ? '#f59e0b' : n < 1 ? '#d1d5db' : '#ef4444'
      return (
        <div className="flex items-center gap-1.5">
          <svg width="20" height="20" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="8" fill="none" stroke="#e5e7eb" strokeWidth="2.5" />
            <circle cx="10" cy="10" r="8" fill="none" stroke={color} strokeWidth="2.5"
              strokeDasharray={`${n * 0.502} 50.2`} strokeLinecap="round" transform="rotate(-90 10 10)" />
          </svg>
          <span className="text-[10px] font-bold" style={{ color }}>{n}%</span>
        </div>
      )
    }

    // Weather icons (English + French DB values)
    if (/weather|meteo|météo/i.test(key)) {
      const icons: Record<string, string> = {
        sunny: '☀️', cloudy: '⛅', rainy: '🌧️', stormy: '⛈️',
        ensoleill_: '☀️', nuageux: '⛅', pluvieux: '🌧️', orageux: '⛈️',
      }
      const normalized = s.toLowerCase().replace(/[^a-z0-9_]/g, '_')
      return <span title={tLabel(s)}>{icons[normalized] || icons[s.toLowerCase()] || tLabel(s)}</span>
    }

    // Trend icons
    if (/trend|tendance/i.test(key)) {
      const icons: Record<string, string> = { up: '📈', down: '📉', stable: '➡️', improving: '📈', degrading: '📉' }
      return <span title={s}>{icons[s.toLowerCase()] || '➡️'}</span>
    }

    // Criticality indicator
    if (/criticality|criticite|criticit/i.test(key)) {
      const n = parseInt(s) || 0
      const colors = ['#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444']
      const color = colors[Math.min(n, colors.length - 1)] || '#94a3b8'
      return (
        <div className="flex items-center gap-1" title={`Criticité ${n}/5`}>
          <div className="w-2.5 h-5 rounded-sm border border-border/40 overflow-hidden flex flex-col-reverse">
            <div style={{ height: `${n * 20}%`, backgroundColor: color }} className="rounded-sm" />
          </div>
          <span className="text-[10px] font-medium" style={{ color }}>{n}</span>
        </div>
      )
    }

    // Date formatting — explicit date columns OR any ISO datetime string
    const looksLikeIsoDate = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/.test(s)
    if ((isDateCol(key) || looksLikeIsoDate) && looksLikeIsoDate) {
      try {
        const d = new Date(s)
        if (!isNaN(d.getTime())) {
          const hasTime = s.includes('T')
          const formatted = hasTime
            ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
          return <span title={s}>{formatted}</span>
        }
      } catch { /* */ }
    }

    // Reference / code — first column or ref-like columns — bold + primary color
    if (isRefCol(key, colIdx)) {
      return <span className="font-semibold text-primary cursor-pointer hover:underline">{s}</span>
    }

    return <span>{s.length > 45 ? s.slice(0, 45) + '…' : s}</span>
  }

  if (!rows.length || !effectiveColumns.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
        <Table2 className="h-8 w-8 text-muted-foreground/15" />
        <span className="text-xs text-muted-foreground/40">Aucune donnée disponible</span>
      </div>
    )
  }

  const totalPages = Math.ceil(sortedRows.length / pageSize)
  const pagedRows = sortedRows.slice(page * pageSize, (page + 1) * pageSize)

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead className="sticky top-0 z-[1] bg-muted/60 backdrop-blur-sm">
            <tr>
              {effectiveColumns.map((col) => {
                const isSorted = sortField === col.key
                const isNum = isNumericCol(col.key)
                return (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={cn(
                      'px-3 py-2 font-semibold text-[10px] uppercase tracking-[0.06em] whitespace-nowrap',
                      'border-b border-border/60 cursor-pointer select-none transition-colors',
                      'first:pl-4 last:pr-4',
                      isNum ? 'text-right' : 'text-left',
                      isSorted ? 'text-foreground/80' : 'text-muted-foreground/60 hover:text-muted-foreground',
                    )}
                  >
                    <span className={cn('inline-flex items-center gap-1', isNum && 'flex-row-reverse')}>
                      {col.label}
                      {isSorted ? (
                        sortDir === 'asc'
                          ? <ChevronUp className="h-3 w-3 text-primary shrink-0" />
                          : <ChevronDown className="h-3 w-3 text-primary shrink-0" />
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-25 shrink-0" />
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row, rowIdx) => (
              <tr key={rowIdx} className={cn(
                'group transition-colors hover:bg-primary/[0.04]',
                rowIdx % 2 === 1 && 'bg-muted/[0.18]',
              )}>
                {effectiveColumns.map((col, colIdx) => {
                  const cellValue = row[col.key]
                  const isActive = isFilterActive(col.key, cellValue)
                  const isNum = isNumericCol(col.key)
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        // `overflow-hidden text-ellipsis` on top of the
                        // existing whitespace-nowrap + max-width ensures
                        // long cell content (e.g. verbose task names)
                        // truncates inside its own column instead of
                        // spilling into the next column and colliding
                        // with the date beside it.
                        'px-3 py-1.5 overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px] border-b border-border/10',
                        'first:pl-4 last:pr-4',
                        isNum ? 'text-right tabular-nums' : 'text-left',
                        crossFilterEnabled && 'cursor-pointer',
                        isActive && 'bg-primary/10',
                      )}
                      title={typeof cellValue === 'string' || typeof cellValue === 'number' ? String(cellValue) : undefined}
                      onClick={() => handleCellClick(col.key, cellValue)}
                    >
                      {renderCell(cellValue, col.key, colIdx)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Footer: entry count + optional sort indicator + pagination */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-border/40 shrink-0 bg-muted/20">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground/60 font-medium tabular-nums">
            {sortedRows.length} {sortedRows.length === 1 ? 'entrée' : 'entrées'}
          </span>
          {sortField && (
            <span className="text-[10px] text-primary/60 font-medium">
              ↕ {effectiveColumns.find((c) => c.key === sortField)?.label}
            </span>
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-muted disabled:opacity-30 text-[10px] text-muted-foreground"
            >
              ‹
            </button>
            {(() => {
              const pages: (number | 'ellipsis')[] = []
              if (totalPages <= 5) {
                for (let i = 0; i < totalPages; i++) pages.push(i)
              } else {
                pages.push(0)
                if (page > 2) pages.push('ellipsis')
                for (let i = Math.max(1, page - 1); i <= Math.min(totalPages - 2, page + 1); i++) pages.push(i)
                if (page < totalPages - 3) pages.push('ellipsis')
                pages.push(totalPages - 1)
              }
              return pages.map((p, idx) =>
                p === 'ellipsis' ? (
                  <span key={`e${idx}`} className="text-[10px] px-0.5 text-muted-foreground/40">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={cn(
                      'h-5 min-w-[20px] px-1 rounded text-[10px] transition-colors',
                      p === page
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {(p as number) + 1}
                  </button>
                ),
              )
            })()}
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-muted disabled:opacity-30 text-[10px] text-muted-foreground"
            >
              ›
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Map Widget (Vanilla Leaflet) ────────────────────────────────

// Fix Leaflet default marker icon issue
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

import { useMapSettings, getTileUrl, getTileAttribution } from '@/hooks/useMapSettings'

interface MapWidgetProps {
  config: Record<string, unknown>
  data: unknown[]
}

function MapWidget({ config, data }: MapWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileRef = useRef<L.TileLayer | null>(null)
  const markersRef = useRef<L.Marker[]>([])
  const { data: mapSettings } = useMapSettings()

  const isFleetMap = config.fleet_map === true

  const provider = mapSettings?.provider || 'openstreetmap'
  const apiKey = provider === 'google_maps' ? mapSettings?.googleKey || '' : mapSettings?.mapboxToken || ''
  const style = mapSettings?.style || 'standard'
  const tileUrl = getTileUrl(provider, apiKey, style)
  const attribution = getTileAttribution(provider)

  // Extract positions — support both flat array {latitude,longitude} and
  // provider-wrapped {markers:[{lat,lng,...}]} formats
  const rawItems = data as Record<string, unknown>[]
  const flatItems: Record<string, unknown>[] =
    rawItems.length === 1 && Array.isArray((rawItems[0] as Record<string, unknown>)?.markers)
      ? ((rawItems[0] as Record<string, unknown>).markers as Record<string, unknown>[])
      : rawItems

  const positions = flatItems
    .filter((d) => (d.latitude != null && d.longitude != null) || (d.lat != null && d.lng != null))
    .map((d) => ({
      lat: Number(d.latitude ?? d.lat),
      lng: Number(d.longitude ?? d.lng),
      name: String(d.name || d.label || d.vector_name || d.code || ''),
      type: String(d.type || d.transport_mode || ''),
      pax: d.pax_count != null ? Number(d.pax_count) : null,
      color: (d.color as string) || undefined,
    }))

  // Init map
  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    const map = L.map(container, {
      center: [mapSettings?.defaultLat ?? 3.848, mapSettings?.defaultLng ?? 9.687],
      zoom: mapSettings?.defaultZoom ?? 6,
      zoomControl: false,
      attributionControl: false,
    })
    const tile = L.tileLayer(tileUrl, { attribution })
    tile.addTo(map)
    tileRef.current = tile
    mapRef.current = map

    requestAnimationFrame(() => {
      try {
        if (mapRef.current && map.getContainer()?.parentNode) map.invalidateSize()
      } catch { /* container removed before rAF fired */ }
    })

    return () => {
      map.remove()
      mapRef.current = null
      markersRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Swap tile layer when provider/style changes
  useEffect(() => {
    if (!mapRef.current) return
    if (tileRef.current) tileRef.current.remove()
    const newTile = L.tileLayer(tileUrl, { attribution })
    newTile.addTo(mapRef.current)
    tileRef.current = newTile
  }, [tileUrl, attribution])

  // Update markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Clear old markers
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    if (positions.length === 0) return

    for (const pos of positions) {
      // Use colored circle icon when position has a color (asset registry markers)
      const icon = pos.color
        ? L.divIcon({
            className: '',
            html: `<div style="width:12px;height:12px;border-radius:50%;background:${pos.color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6],
          })
        : undefined
      const marker = L.marker([pos.lat, pos.lng], icon ? { icon } : undefined)
        .addTo(map)
        .bindPopup(`<div style="font-size:12px;"><b>${pos.name}</b>${pos.type ? `<br/><span style="opacity:.65">${pos.type}</span>` : ''}${pos.pax != null ? `<br/>PAX: ${pos.pax}` : ''}</div>`)
      markersRef.current.push(marker)
    }

    const bounds = L.latLngBounds(positions.map((p) => [p.lat, p.lng] as [number, number]))
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20], maxZoom: 12 })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(positions), isFleetMap])

  if (positions.length === 0) {
    const msg = flatItems.length > 0 ? 'Coordonnées manquantes' : 'Aucune position'
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1 text-center">
        <MapPin className="h-6 w-6 text-muted-foreground/30" />
        <p className="text-[10px] text-muted-foreground">{msg}</p>
      </div>
    )
  }

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
}

// ── Text Widget ─────────────────────────────────────────────────

function TextWidget({
  config,
  data,
}: {
  config: Record<string, unknown>
  data: unknown[]
}) {
  const content = (config.content as string)
    || (data?.[0] as Record<string, unknown>)?.content as string
    || ''

  if (!content) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        Aucun contenu
      </div>
    )
  }

  // Parse inline markdown: **bold**, *italic*, `code`, [link](url)
  const renderInline = (text: string) => {
    const parts: React.ReactNode[] = []
    let remaining = text
    let keyIdx = 0
    const rx = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g
    let lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = rx.exec(remaining)) !== null) {
      if (match.index > lastIndex) parts.push(remaining.slice(lastIndex, match.index))
      if (match[2]) parts.push(<strong key={keyIdx++} className="font-semibold">{match[2]}</strong>)
      else if (match[3]) parts.push(<em key={keyIdx++} className="italic">{match[3]}</em>)
      else if (match[4]) parts.push(<code key={keyIdx++} className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">{match[4]}</code>)
      else if (match[5] && match[6]) parts.push(<a key={keyIdx++} href={match[6]} target="_blank" rel="noopener noreferrer" className="text-primary underline">{match[5]}</a>)
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < remaining.length) parts.push(remaining.slice(lastIndex))
    return parts.length > 0 ? parts : text
  }

  // Split into lines and render blocks
  const lines = content.split('\n')

  return (
    <div className="h-full overflow-auto prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed">
      {lines.map((line, i) => {
        // Code block (``` fenced)
        if (line.startsWith('```')) {
          // Collect lines until closing ```
          const codeLines: string[] = []
          let j = i + 1
          while (j < lines.length && !lines[j].startsWith('```')) {
            codeLines.push(lines[j])
            j++
          }
          if (codeLines.length > 0) {
            return (
              <pre key={i} className="bg-muted/50 border border-border/30 rounded-md p-2 text-[10px] font-mono overflow-x-auto my-1.5">
                {codeLines.join('\n')}
              </pre>
            )
          }
          return null // skip closing ```
        }
        // Skip lines inside code blocks (rendered by opening ```)
        if (i > 0) {
          let inBlock = false
          for (let k = 0; k < i; k++) {
            if (lines[k].startsWith('```')) inBlock = !inBlock
          }
          if (inBlock) return null
        }
        // Headings
        if (line.startsWith('### ')) return <h4 key={i} className="text-sm font-semibold mt-2 mb-1">{renderInline(line.slice(4))}</h4>
        if (line.startsWith('## ')) return <h3 key={i} className="text-sm font-bold mt-2 mb-1">{renderInline(line.slice(3))}</h3>
        if (line.startsWith('# ')) return <h2 key={i} className="text-base font-bold mt-2 mb-1">{renderInline(line.slice(2))}</h2>
        // Horizontal rule
        if (/^-{3,}$/.test(line.trim())) return <hr key={i} className="border-border/40 my-2" />
        // Numbered list
        if (/^\d+\.\s/.test(line)) {
          const text = line.replace(/^\d+\.\s/, '')
          return (
            <div key={i} className="flex gap-1.5 ml-2">
              <span className="text-muted-foreground shrink-0 w-3 text-right">{line.match(/^\d+/)?.[0]}.</span>
              <span>{renderInline(text)}</span>
            </div>
          )
        }
        // Bullet list
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={i} className="flex gap-1.5 ml-2">
              <span className="text-muted-foreground shrink-0">&bull;</span>
              <span>{renderInline(line.slice(2))}</span>
            </div>
          )
        }
        // Blockquote
        if (line.startsWith('> ')) {
          return <blockquote key={i} className="border-l-2 border-primary/40 pl-2 text-muted-foreground italic my-1">{renderInline(line.slice(2))}</blockquote>
        }
        // Table row (| col | col |)
        if (line.includes('|') && line.trim().startsWith('|')) {
          // Check if separator row
          if (/^\|[\s:-]+\|/.test(line.trim())) return null // skip separator
          const cells = line.split('|').filter(Boolean).map((c) => c.trim())
          // Detect if header (next line is separator)
          const nextLine = lines[i + 1]?.trim() || ''
          const isHeader = /^\|[\s:-]+\|/.test(nextLine)
          const Tag = isHeader ? 'th' : 'td'
          return (
            <div key={i} className="flex">
              {cells.map((cell, ci) => (
                <Tag key={ci} className={cn(
                  'px-2 py-1 border border-border/30 text-[10px]',
                  isHeader ? 'font-bold bg-muted/30' : '',
                )} style={{ minWidth: '60px' }}>
                  {renderInline(cell)}
                </Tag>
              ))}
            </div>
          )
        }
        // Empty line
        if (line.trim() === '') return <div key={i} className="h-2" />
        // Regular paragraph
        return <p key={i} className="mb-1">{renderInline(line)}</p>
      })}
    </div>
  )
}
