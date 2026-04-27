import { useState } from 'react'
import { LayoutDashboard, ClipboardList, Clock, Users, Shield, AlertTriangle, RefreshCw, Briefcase, X, Search, Building2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { useTiers } from '@/hooks/useTiers'
import { DynamicPanelField, panelInputClass } from '@/components/layout/DynamicPanel'
import type { AdsPax } from '@/services/paxlogService'

// ── Constants ──────────────────────────────────────────────────

export const PAX_STATUS_LABELS_FALLBACK: Record<string, string> = {
  active: 'Actif',
  incomplete: 'Incomplet',
  suspended: 'Suspendu',
  archived: 'Archivé',
}

export const ADS_STATUS_LABELS_FALLBACK: Record<string, string> = {
  draft: 'Brouillon',
  submitted: 'Soumis',
  pending_project_review: 'Revue projet',
  pending_compliance: 'En conformité',
  pending_validation: 'En validation',
  pending_arbitration: 'En arbitrage',
  pending_initiator_review: 'Revue initiateur',
  approved: 'Approuvé',
  rejected: 'Rejeté',
  cancelled: 'Annulé',
  requires_review: 'À revoir',
  in_progress: 'En cours',
  completed: 'Terminé',
}

export const ADS_STATUS_BADGES: Record<string, string> = {
  draft: 'gl-badge-neutral',
  submitted: 'gl-badge-info',
  pending_project_review: 'gl-badge-warning',
  pending_compliance: 'gl-badge-warning',
  pending_validation: 'gl-badge-warning',
  pending_arbitration: 'gl-badge-warning',
  pending_initiator_review: 'gl-badge-warning',
  approved: 'gl-badge-success',
  rejected: 'gl-badge-danger',
  cancelled: 'gl-badge-neutral',
  requires_review: 'gl-badge-info',
  in_progress: 'gl-badge-success',
  completed: 'gl-badge-success',
}

export const SEVERITY_COLOR_MAP: Record<string, string> = {
  info: 'gl-badge-info',
  warning: 'gl-badge-warning',
  site_ban: 'gl-badge-danger',
  temp_ban: 'gl-badge-danger',
  permanent_ban: 'gl-badge-danger',
}

export const ROTATION_STATUS_LABELS_FALLBACK: Record<string, string> = {
  active: 'Actif',
  paused: 'Suspendu',
  completed: 'Terminé',
}

export const ROTATION_STATUS_BADGES: Record<string, string> = {
  active: 'gl-badge-success',
  paused: 'gl-badge-warning',
  completed: 'gl-badge-neutral',
}

export const AVM_STATUS_LABELS_FALLBACK: Record<string, string> = {
  draft: 'Brouillon',
  in_preparation: 'En préparation',
  active: 'Active',
  ready: 'Prête',
  completed: 'Terminée',
  cancelled: 'Annulée',
}

export const AVM_STATUS_BADGES: Record<string, string> = {
  draft: 'gl-badge-neutral',
  in_preparation: 'gl-badge-warning',
  active: 'gl-badge-info',
  ready: 'gl-badge-success',
  completed: 'gl-badge-success',
  cancelled: 'gl-badge-neutral',
}

export const ALL_TABS = [
  { id: 'dashboard' as const, labelKey: 'common.tab_dashboard', icon: LayoutDashboard },
  { id: 'ads' as const, labelKey: 'paxlog.tabs.ads', icon: ClipboardList },
  { id: 'waitlist' as const, labelKey: 'paxlog.tabs.waitlist', icon: Clock },
  { id: 'profiles' as const, labelKey: 'paxlog.tabs.profiles', icon: Users },
  { id: 'compliance' as const, labelKey: 'paxlog.tabs.compliance', icon: Shield },
  { id: 'signalements' as const, labelKey: 'paxlog.tabs.signalements', icon: AlertTriangle },
  { id: 'rotations' as const, labelKey: 'paxlog.tabs.rotations', icon: RefreshCw },
  { id: 'avm' as const, labelKey: 'paxlog.tabs.avm', icon: Briefcase },
]

export type MainTabId = (typeof ALL_TABS)[number]['id']

// ── Helpers ────────────────────────────────────────────────────

export function StatusBadge({ status, map, labels, badges, className }: { status: string; map?: Record<string, { labelKey: string; badge: string }>; labels?: Record<string, string>; badges?: Record<string, string>; className?: string }) {
  const { t } = useTranslation()
  if (labels) {
    return <span className={cn('gl-badge', badges?.[status] || 'gl-badge-neutral', className)}>{labels[status] ?? status.replace(/_/g, ' ')}</span>
  }
  if (map) {
    const entry = map[status]
    return <span className={cn('gl-badge', entry?.badge || 'gl-badge-neutral', className)}>{entry ? t(entry.labelKey) : status.replace(/_/g, ' ')}</span>
  }
  const colorMap: Record<string, string> = {
    active: 'gl-badge-success', draft: 'gl-badge-neutral', submitted: 'gl-badge-info',
    approved: 'gl-badge-success', rejected: 'gl-badge-danger', in_progress: 'gl-badge-warning',
    completed: 'gl-badge-success', cancelled: 'gl-badge-neutral', incomplete: 'gl-badge-warning',
    suspended: 'gl-badge-danger', archived: 'gl-badge-neutral', valid: 'gl-badge-success',
    expired: 'gl-badge-danger', pending_validation: 'gl-badge-warning',
    pending_compliance: 'gl-badge-warning', requires_review: 'gl-badge-info',
  }
  return <span className={cn('gl-badge', colorMap[status] || 'gl-badge-neutral', className)}>{status.replace(/_/g, ' ')}</span>
}

export function buildStatusFilterOptions(labels: Record<string, string>, values: string[], allLabel: string) {
  return [
    { value: '', label: allLabel },
    ...values.map((value) => ({ value, label: labels[value] ?? value })),
  ]
}

export function SeverityBadge({ severity }: { severity: string }) {
  const severityLabels = useDictionaryLabels('pax_incident_severity')
  return (
    <span className={cn('gl-badge', SEVERITY_COLOR_MAP[severity] || 'gl-badge-neutral')}>
      {severityLabels[severity] || severity}
    </span>
  )
}

export function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateTime(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateShort(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function CompletenessBar({ value }: { value: number }) {
  const color = value >= 80 ? 'bg-green-500' : value >= 50 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground">{value}%</span>
    </div>
  )
}

// Tiny inline sparkline — renders an area chart in ~60×18 px. Stroke
// inherits the StatCard accent (defaults to primary).
function Sparkline({ values, accent }: { values: number[]; accent?: string }) {
  const W = 64, H = 18
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = Math.max(1, max - min)
  const step = W / Math.max(1, values.length - 1)
  const pts = values.map((v, i) => [i * step, H - 2 - ((v - min) / range) * (H - 4)] as const)
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${W},${H} L0,${H} Z`
  const tone = accent?.includes('red') || accent?.includes('destructive') ? '#ef4444'
    : accent?.includes('amber') || accent?.includes('yellow') ? '#f59e0b'
    : accent?.includes('emerald') || accent?.includes('green') ? '#10b981'
    : accent?.includes('blue') ? '#3b82f6'
    : accent?.includes('violet') || accent?.includes('purple') ? '#8b5cf6'
    : 'hsl(var(--primary))'
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 ml-auto">
      <path d={area} fill={tone} fillOpacity={0.15} />
      <path d={line} fill="none" stroke={tone} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * StatCard — single-line KPI card matching the Planner pattern.
 *
 * - Inline layout: [icon] LABEL ─ sparkline ─ VALUE
 * - When `onClick` is set the card becomes a button that drives a
 *   filter; the parent passes `active` to highlight the chosen state.
 * - Each card is its own `@container/kpi` so the sparkline auto-hides
 *   on narrow widths (e.g. when the right panel docks at 380px).
 * - Width is controlled by the parent grid; the card snaps on
 *   horizontal-scroll lists (mobile strip → desktop grid via the
 *   parent's `@container/stats` query).
 */
export function StatCard({ label, value, icon: Icon, accent, sparkline, onClick, active }: {
  label: string
  value: string | number
  icon: typeof Users
  accent?: string
  /** Optional 8-week sparkline values (≥2 numbers). Skipped when
   *  not provided or all zero. */
  sparkline?: number[]
  /** Click → filter activation. */
  onClick?: () => void
  /** Highlight when the card's filter is currently active. */
  active?: boolean
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        '@container/kpi group relative flex items-center gap-2 rounded-lg border bg-gradient-to-br from-background to-background/60 px-3 py-1.5 overflow-hidden transition-all text-left shrink-0 snap-start w-[160px] @md/stats:w-full',
        onClick && 'cursor-pointer hover:border-primary/50 hover:shadow-sm',
        active ? 'border-primary/60 ring-1 ring-primary/30 bg-primary/5' : 'border-border/70 hover:border-border',
      )}
    >
      <div className={cn(
        'absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b',
        accent?.includes('red') || accent?.includes('destructive') ? 'from-red-500/80 to-red-400/40'
        : accent?.includes('amber') || accent?.includes('yellow')  ? 'from-amber-500/80 to-amber-400/40'
        : accent?.includes('emerald') || accent?.includes('green') ? 'from-emerald-500/80 to-emerald-400/40'
        : accent?.includes('violet') || accent?.includes('purple') ? 'from-violet-500/80 to-violet-400/40'
        : 'from-primary/80 to-highlight/40',
      )} />
      <Icon size={13} className="text-muted-foreground shrink-0 ml-0.5" />
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground truncate">{label}</span>
      <span className="flex-1" />
      {sparkline && sparkline.length >= 2 && sparkline.some(v => v > 0) && (
        <span className="hidden @[180px]/kpi:inline-flex shrink-0">
          <Sparkline values={sparkline} accent={accent} />
        </span>
      )}
      <span className={cn(
        'text-lg font-bold tabular-nums tracking-tight leading-none',
        accent || 'text-foreground',
      )}>
        {value}
      </span>
    </Tag>
  )
}

export function daysUntil(dateStr: string): number {
  const now = new Date()
  const target = new Date(dateStr)
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

export function CountdownBadge({ days }: { days: number }) {
  const color = days <= 7 ? 'gl-badge-danger' : days <= 30 ? 'gl-badge-warning' : 'gl-badge-info'
  return <span className={cn('gl-badge', color)}>{days}j</span>
}

// ── Searchable Picker (reused for company & user selection) ───

export function SearchablePicker<T extends { id: string }>({
  label,
  icon,
  items,
  isLoading,
  searchValue,
  onSearchChange,
  renderItem,
  selectedId,
  onSelect,
  onClear,
  placeholder,
}: {
  label: string
  icon: React.ReactNode
  items: T[]
  isLoading: boolean
  searchValue: string
  onSearchChange: (v: string) => void
  renderItem: (item: T) => React.ReactNode
  selectedId: string | null
  onSelect: (item: T) => void
  onClear: () => void
  placeholder: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const selected = selectedId ? items.find((i) => i.id === selectedId) : null

  return (
    <DynamicPanelField label={label}>
      {selected ? (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded border border-border bg-muted/30">
          {icon}
          <span className="text-xs font-medium flex-1 truncate">{renderItem(selected)}</span>
          <button onClick={() => { onClear(); setOpen(false) }} className="text-muted-foreground hover:text-foreground">
            <X size={12} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchValue}
              onChange={(e) => { onSearchChange(e.target.value); setOpen(true) }}
              onFocus={() => setOpen(true)}
              className={cn(panelInputClass, 'pl-7')}
              placeholder={placeholder}
            />
          </div>
          {open && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-40 overflow-y-auto">
              {isLoading && <div className="px-3 py-2 text-xs text-muted-foreground">{t('common.loading')}</div>}
              {!isLoading && items.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">{t('common.no_results')}</div>
              )}
              {items.map((item) => (
                <button
                  key={item.id}
                  className="gl-button gl-button-sm gl-button-default w-full text-left"
                  onClick={() => { onSelect(item); setOpen(false) }}
                >
                  {renderItem(item)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </DynamicPanelField>
  )
}

export type AllowedCompanySelection = {
  id: string
  code?: string | null
  name: string
}

export type ExternalRecipientOption = {
  key: string
  user_id: string | null
  contact_id: string | null
  label: string
  contactSummary: string
}

export function buildExternalRecipientOptions(adsPax: AdsPax[] | undefined, unknownLabel: string): ExternalRecipientOption[] {
  const options = (adsPax ?? [])
    .map((entry) => {
      const email = entry.pax_email?.trim() || ''
      const phone = entry.pax_phone?.trim() || ''
      if (!email && !phone) return null
      return {
        key: entry.user_id ? `user:${entry.user_id}` : `contact:${entry.contact_id}`,
        user_id: entry.user_id,
        contact_id: entry.contact_id,
        label: `${entry.pax_first_name || ''} ${entry.pax_last_name || ''}`.trim() || unknownLabel,
        contactSummary: [email, phone].filter(Boolean).join(' • '),
      }
    })
  return options.filter((entry): entry is ExternalRecipientOption => entry !== null)
}

export function AllowedCompaniesPicker({
  value,
  onChange,
  searchValue,
  onSearchChange,
  disabled = false,
  chipVariant = 'muted',
}: {
  value: AllowedCompanySelection[]
  onChange: React.Dispatch<React.SetStateAction<AllowedCompanySelection[]>>
  searchValue: string
  onSearchChange: (value: string) => void
  disabled?: boolean
  chipVariant?: 'muted' | 'background'
}) {
  const { t } = useTranslation()
  const { data: tiersData, isLoading: tiersLoading } = useTiers({ page: 1, page_size: 20, search: searchValue || undefined })

  return (
    <div className="space-y-3">
      <SearchablePicker
        label={t('paxlog.create_ads.fields.allowed_companies')}
        icon={<Building2 size={12} className="text-muted-foreground" />}
        items={tiersData?.items || []}
        isLoading={tiersLoading}
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        renderItem={(tier) => <><span className="font-semibold">{tier.code}</span> — {tier.name}</>}
        selectedId={null}
        onSelect={(tier) => {
          onChange((current) => current.some((item) => item.id === tier.id)
            ? current
            : [...current, { id: tier.id, code: tier.code, name: tier.name }])
          onSearchChange('')
        }}
        onClear={() => onSearchChange('')}
        placeholder={t('paxlog.search_company')}
      />
      <p className="text-[10px] text-muted-foreground">{t('paxlog.create_ads.allowed_companies_help')}</p>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((company) => (
            <span
              key={company.id}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs',
                chipVariant === 'background' ? 'bg-background' : 'bg-muted/30',
              )}
            >
              <span className="font-medium">{company.code ? `${company.code} — ` : ''}{company.name}</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => onChange((current) => current.filter((item) => item.id !== company.id))}
                disabled={disabled}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
