/**
 * WidgetCard — Container for an individual dashboard widget.
 *
 * Renders a card with header (title, refresh, actions) and content area.
 * Content is delegated to WidgetRenderer which picks the right sub-component
 * based on widget.type (kpi, chart, table, map, text).
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
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
  male: 'Homme', female: 'Femme',
  internal: 'Interne', external: 'Externe',
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
  useTranslation() // keep hook call for consistency
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
          'group flex flex-col h-full rounded-xl overflow-hidden',
          'border transition-all duration-200',
          !hasBgColor && 'bg-card border-border shadow-[0_1px_3px_0_rgb(0,0,0,0.06)] hover:shadow-[0_4px_16px_0_rgb(0,0,0,0.09)] hover:border-primary/25',
          hasBgColor && 'border-transparent shadow-md',
        )}
        style={{ ...cssVars, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
      >
        {/* Header — uppercase label + divider + hover toolbar */}
        <div className={cn(
          'flex items-center px-4 py-2.5 gap-2 shrink-0 border-b',
          !hasBgColor ? 'border-border/60' : 'border-white/10',
          hideHeader && mode !== 'edit' ? 'opacity-0 group-hover:opacity-100 transition-opacity' : 'opacity-100',
        )}>
          {mode === 'edit' && (
            <div {...(dragHandleProps || {})} className="cursor-grab active:cursor-grabbing shrink-0">
              <GripVertical className="h-3 w-3 text-muted-foreground/30" />
            </div>
          )}
          <span className={cn(
            'text-[10.5px] font-semibold tracking-[0.07em] uppercase truncate flex-1',
            hasBgColor ? 'text-white/80' : 'text-muted-foreground',
          )}>
            {widget.title}
          </span>
          {/* Toolbar — always faintly visible, full opacity on hover */}
          <div className={cn(
            'flex items-center gap-0.5 transition-opacity',
            mode !== 'edit' ? 'opacity-20 group-hover:opacity-100' : 'opacity-80',
          )}>
            <button onClick={() => refetch()} className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-black/6 dark:hover:bg-white/10 transition-colors" title="Actualiser">
              <RefreshCw className={cn('h-3 w-3', hasBgColor ? 'text-white/70' : 'text-muted-foreground', isLoading && 'animate-spin')} />
            </button>
            <button onClick={handleExport} className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-black/6 dark:hover:bg-white/10 transition-colors" title="Exporter">
              <Download className={cn('h-3 w-3', hasBgColor ? 'text-white/70' : 'text-muted-foreground')} />
            </button>
            <button onClick={() => setFullscreen(true)} className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-black/6 dark:hover:bg-white/10 transition-colors" title="Plein écran">
              <Maximize2 className={cn('h-3 w-3', hasBgColor ? 'text-white/70' : 'text-muted-foreground')} />
            </button>
            {mode === 'edit' && onRemove && (
              <button onClick={onRemove} className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-destructive/10 transition-colors" title="Supprimer">
                <X className="h-3 w-3 text-destructive/60" />
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
            <span className="text-sm font-semibold flex-1">{widget.title}</span>
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

// Icon color presets — mapped from config.icon_color or accent
const KPI_ICON_COLORS: Record<string, { bg: string; fg: string }> = {
  blue:   { bg: 'bg-blue-500',   fg: 'text-white' },
  green:  { bg: 'bg-emerald-500', fg: 'text-white' },
  red:    { bg: 'bg-red-500',    fg: 'text-white' },
  orange: { bg: 'bg-orange-400', fg: 'text-white' },
  yellow: { bg: 'bg-yellow-400', fg: 'text-yellow-900' },
  violet: { bg: 'bg-violet-500', fg: 'text-white' },
  cyan:   { bg: 'bg-cyan-500',   fg: 'text-white' },
  pink:   { bg: 'bg-pink-500',   fg: 'text-white' },
  slate:  { bg: 'bg-slate-500',  fg: 'text-white' },
}

// Semantic icon map — widget_id → Lucide icon
// Used so each KPI shows a meaningful icon instead of generic Gauge
const WIDGET_ICON_MAP: Record<string, React.ElementType> = {
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
  conformite_urgency: ShieldAlert,
  conformite_by_status: BarChart3,
  conformite_matrix: Layers,
  conformite_trend: Activity,
  // PaxLog / ADS
  pax_ads_pending: Clock,
  ads_pending: Clock,
  my_ads: UserCheck,
  trips_today: Plane,
  // PackLog / Cargo
  cargo_pending: Package,
  packlog_requests: Package,
  packlog_cargo: Package,
  packlog_requests_by_status: BarChart3,
  packlog_cargo_by_status: BarChart3,
  // Projects
  projets_kpis: Briefcase,
  project_status: Briefcase,
  projets_deadlines: Calendar,
  projets_top_volume: BarChart3,
  // Assets
  assets_overview: Database,
  assets_kpi: Database,
  // Tiers / Contacts
  tiers_kpi: Building2,
  contacts_kpi: Building2,
  // Alerts / Signals
  alerts_urgent: Bell,
  signalements_actifs: AlertCircle,
  // Papyrus docs
  papyrus_overview: FileText,
  papyrus_recent_documents: FileText,
  papyrus_by_status: BarChart3,
  papyrus_by_type: PieChart,
  papyrus_forms_overview: ListChecks,
  // Support
  support_overview: AlertCircle,
  support_by_priority: BarChart3,
  // Compliance rate
  compliance_rate: CheckCircle2,
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
  const labelField = (config.label as string) || ''
  const trend = (meta?.trend as number) ?? (config.trend as number) ?? null
  const comparison = (meta?.comparison as string) || (config.comparison as string) || ''
  const format = (config.format as string) || 'number'
  const unit = (config.unit as string) || ''
  const iconColor = (config.icon_color as string) || 'blue'
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

  // Sparkline: use data from meta/config, or always generate a pattern
  const rawSparkline = (meta?.sparkline as number[]) || (config.sparkline as number[]) || null
  const sparklineData = rawSparkline || (() => {
    // Always generate sparkline — even for 0 values, show a subtle variation
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

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Top row: icon + value + sparkline */}
      <div className="flex items-start gap-3 flex-1">
        {/* Icon square */}
        <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center shrink-0', iconPreset.bg)}>
          <IconComp className={cn('h-5 w-5', iconPreset.fg)} />
        </div>

        {/* Value block */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[2rem] font-bold tracking-[-0.04em] leading-none text-foreground tabular-nums">
              {displayValue}
            </span>
            {unit && <span className="text-xs text-muted-foreground/70 font-medium">{unit}</span>}
          </div>
          {/* Delta row */}
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

        {/* Mini sparkline (right side) */}
        {sparklineData && sparklineData.length > 1 && (
          <div className="w-20 h-10 shrink-0 self-center">
            <KPISparkline data={sparklineData} color={sparklineColor} />
          </div>
        )}
      </div>

      {/* Label */}
      {labelField && (
        <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{labelField}</span>
      )}

      {/* Detail stat grid */}
      {details && Object.keys(details).length > 0 && (
        <div className="mt-1 pt-3 border-t border-border/40 grid grid-cols-2 gap-x-3 gap-y-1.5">
          {Object.entries(details).slice(0, 6).map(([k, v]) => {
            const label = tLabel(k)
            const val = String(v)
            const isGood = /compliant|active|done|valid/.test(k)
            const isBad = /overdue|expired|critical|cancelled/.test(k)
            const valColor = isGood ? 'text-emerald-600 dark:text-emerald-400'
              : isBad ? 'text-red-500 dark:text-red-400'
              : 'text-foreground'
            return (
              <div key={k} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors min-w-0">
                <span className="text-[11px] font-medium text-muted-foreground truncate">{label}</span>
                <span className={cn('text-[13px] font-bold tabular-nums shrink-0', valColor)}>{val}</span>
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

  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'svg' }} />
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

  return (
    <EChartsWidget
      chartType={resolvedType}
      data={translatedData}
      xField={xField}
      yFields={yFields}
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
    .slice(0, 18)

  const option = useMemo(() => {
    if (!activities.length) return {}
    const now = Date.now()
    const toMs = (d: unknown) => d ? new Date(d as string).getTime() : null
    const startTimes = activities.map((a) => toMs(a.start_date)).filter(Boolean) as number[]
    const endTimes = activities.map((a) => toMs(a.end_date)).filter(Boolean) as number[]
    const minDate = Math.min(...startTimes, now - 86400000 * 3)
    const maxDate = Math.max(...endTimes, now + 86400000 * 14)

    const categories = [...activities].reverse().map((a) =>
      String(a.title || a.asset_name || 'Activité').slice(0, 28)
    )

    const seriesData = [...activities].reverse().map((a, idx) => {
      const start = toMs(a.start_date) || now
      const end = toMs(a.end_date) || start + 86400000 * 7
      const status = String(a.status || 'draft').toLowerCase()
      return {
        name: String(a.title || ''),
        value: [start, end, idx] as [number, number, number],
        itemStyle: { color: GANTT_STATUS_COLORS[status] || '#3b82f6' },
      }
    })

    return {
      tooltip: {
        formatter: (params: { name: string; value: [number, number, number] }) => {
          const [start, end] = params.value
          const fmt = (ts: number) => new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
          return `<b>${params.name}</b><br/>${fmt(start)} → ${fmt(end)}`
        },
      },
      grid: { top: 8, right: 16, bottom: 30, left: 0, containLabel: true },
      xAxis: {
        type: 'time' as const,
        min: minDate,
        max: maxDate,
        axisLabel: {
          fontSize: 10,
          color: '#94a3b8',
          formatter: (v: number) =>
            new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
        },
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
        axisLine: { lineStyle: { color: '#e2e8f0' } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'category' as const,
        data: categories,
        axisLabel: { fontSize: 10, color: '#64748b', width: 110, overflow: 'truncate' as const },
        axisTick: { show: false },
        axisLine: { show: false },
        splitLine: { show: false },
      },
      series: [
        {
          type: 'custom' as const,
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
            const startCoord = api.coord([start, catIdx])
            const endCoord = api.coord([end, catIdx])
            const cellH = Math.abs(api.size([0, 1])[1])
            const barH = Math.min(18, Math.max(8, cellH * 0.55))
            const x = Math.min(startCoord[0], endCoord[0])
            const width = Math.max(4, Math.abs(endCoord[0] - startCoord[0]))
            return {
              type: 'rect',
              shape: { x, y: startCoord[1] - barH / 2, width, height: barH, r: 3 },
              style: { ...(api.style() as object), opacity: 0.88 },
              emphasis: { style: { opacity: 1, shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.15)' } },
            }
          },
          encode: { x: [0, 1], y: 2 },
          data: seriesData,
        },
      ],
      animation: false,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(activities)])

  if (!activities.length) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-xs text-muted-foreground/50">
        <GanttChart className="h-4 w-4" />
        Aucune activité planifiée
      </div>
    )
  }

  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'svg' }} />
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
    expires_at: 'Expire le', issued_at: 'Émis le',
    flight: 'Vol', origin: 'Origine', destination: 'Destination',
    weight: 'Poids', volume: 'Volume', tracking: 'Suivi',
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

  // Status badge colors
  const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    draft: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' },
    brouillon: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' },
    planned: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
    planifie: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
    active: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
    in_progress: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
    todo: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' },
    completed: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
    done: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
    cancelled: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' },
    suspended: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300' },
    on_hold: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300' },
    review: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300' },
    submitted: { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-300' },
  }

  const PRIORITY_COLORS: Record<string, string> = {
    low: 'text-emerald-600', medium: 'text-amber-600', high: 'text-orange-600', critical: 'text-red-600',
  }

  const isStatusCol = (key: string) => /status|statut/i.test(key)
  const isPriorityCol = (key: string) => /priority|priorite|priorité/i.test(key)
  const isProgressCol = (key: string) => /progress|pct|avancement|%/i.test(key)
  const isDateCol = (key: string) => /date|echeance|échéance|deadline|start|end|debut|fin|created|updated|_at$|login|connexion|expire|expir/i.test(key)
  const isRefCol = (key: string, colIdx: number) => colIdx === 0 || /code|ref|reference|id$/i.test(key)

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

    // Status badge
    if (isStatusCol(key)) {
      const colors = STATUS_COLORS[s.toLowerCase().replace(/[^a-z_]/g, '_')] || STATUS_COLORS.draft
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

    // Weather icons
    if (/weather|meteo|météo/i.test(key)) {
      const icons: Record<string, string> = { sunny: '☀️', cloudy: '⛅', rainy: '🌧️', stormy: '⛈️' }
      return <span title={s}>{icons[s.toLowerCase()] || s}</span>
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
        <div className="flex items-center gap-1" title={`Criticite ${n}/5`}>
          <div className="w-2.5 h-5 rounded-sm border border-border/40 overflow-hidden flex flex-col-reverse">
            <div style={{ height: `${Math.max(20, n * 20)}%`, backgroundColor: color }} className="rounded-sm" />
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
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground/40">
        Aucune donnée disponible
      </div>
    )
  }

  const totalPages = Math.ceil(rows.length / pageSize)
  const pagedRows = rows.slice(page * pageSize, (page + 1) * pageSize)

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead className="sticky top-0 z-[1] bg-muted/50 backdrop-blur-sm">
            <tr>
              {effectiveColumns.map((col) => (
                <th
                  key={col.key}
                  className="text-left px-3 py-1.5 font-semibold text-[10px] uppercase tracking-[0.06em] whitespace-nowrap text-muted-foreground/70 border-b border-border/60 first:pl-4"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row, rowIdx) => (
              <tr key={rowIdx} className={cn(
                'group transition-colors hover:bg-primary/[0.035]',
                rowIdx % 2 === 1 && 'bg-muted/[0.15]',
              )}>
                {effectiveColumns.map((col, colIdx) => {
                  const cellValue = row[col.key]
                  const isActive = isFilterActive(col.key, cellValue)
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        'px-3 py-1.5 whitespace-nowrap max-w-[180px] border-b border-border/15',
                        'first:pl-4 last:pr-4',
                        crossFilterEnabled && 'cursor-pointer',
                        isActive && 'bg-primary/10',
                      )}
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
      {/* Unified footer — count + optional pagination */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-border/40 shrink-0 bg-muted/20">
        <span className="text-[10px] text-muted-foreground/60 font-medium tabular-nums">
          {rows.length} {rows.length === 1 ? 'entrée' : 'entrées'}
        </span>
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

  // Extract positions from data
  const positions = (data as Record<string, unknown>[])
    .filter((d) => d.latitude != null && d.longitude != null)
    .map((d) => ({
      lat: Number(d.latitude),
      lng: Number(d.longitude),
      name: String(d.name || d.vector_name || d.code || ''),
      type: String(d.type || d.transport_mode || ''),
      pax: d.pax_count != null ? Number(d.pax_count) : null,
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
      const marker = L.marker([pos.lat, pos.lng])
        .addTo(map)
        .bindPopup(`<div style="font-size:12px;"><b>${pos.name}</b>${pos.type ? `<br/>${pos.type}` : ''}${pos.pax != null ? `<br/>PAX: ${pos.pax}` : ''}</div>`)
      markersRef.current.push(marker)
    }

    const bounds = L.latLngBounds(positions.map((p) => [p.lat, p.lng] as [number, number]))
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20], maxZoom: 12 })
    }
  }, [positions.length, isFleetMap])

  if (positions.length === 0 && data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1 text-center">
        <MapPin className="h-6 w-6 text-muted-foreground/30" />
        <p className="text-[10px] text-muted-foreground">Aucune position</p>
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
