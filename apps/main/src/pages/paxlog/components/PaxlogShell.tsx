/**
 * paxlog/components/PaxlogShell.tsx — Pajamas++ shell shared by all paxlog tabs.
 *
 * Reuses existing infra:
 *   - <PanelContent> from '@/components/layout/PanelHeader'
 *   - <DataTable> from '@/components/ui/DataTable/DataTable'
 *   - existing hooks (usePaxlog, useDictionaryLabels, …)
 *
 * Provides:
 *   - <PaxlogStatRail>     — inline stat rail (V1 — list pages)
 *   - <PaxlogToolbar>      — search + filter chips + segmented + actions
 *   - <PaxlogBulkBar>      — appears when a selection is active
 *   - <PaxlogDetailHeader> — sticky header for detail panels (ref + meta + actions)
 *   - <PaxlogStepper>      — workflow stepper for ADS / AVM
 *
 * All components consume the existing tokens (--primary, --warning, --danger, …)
 * so dark/light theming is automatic.
 */
import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { X, type LucideIcon } from 'lucide-react'

// ── Stat Rail (V1) — replaces 4-column StatCard grid ─────────────────────────

export interface StatRailItem {
  id: string
  label: string
  value: ReactNode
  icon: LucideIcon
  /** danger | warning | success | undefined (= neutral) */
  tone?: 'danger' | 'warning' | 'success'
  /** 8-week trend, optional. */
  spark?: number[]
  /** Becomes a filter button. */
  onClick?: () => void
  active?: boolean
}

export function PaxlogStatRail({ items }: { items: StatRailItem[] }) {
  return (
    <div className="paxlog-stat-rail">
      {items.map((it) => {
        const Tag = it.onClick ? 'button' : 'div'
        const Icon = it.icon
        return (
          <Tag
            key={it.id}
            type={it.onClick ? 'button' : undefined}
            onClick={it.onClick}
            className={cn('paxlog-stat-rail__item', it.active && 'is-active')}
            data-tone={it.tone}
          >
            <Icon size={13} className="paxlog-stat-rail__ico" />
            <div className="paxlog-stat-rail__col">
              <span className="paxlog-stat-rail__label">{it.label}</span>
              <span className="paxlog-stat-rail__value">{it.value}</span>
            </div>
            {it.spark && it.spark.length >= 2 && it.spark.some((v) => v > 0) && (
              <Spark values={it.spark} tone={it.tone} />
            )}
          </Tag>
        )
      })}
    </div>
  )
}

function Spark({ values, tone }: { values: number[]; tone?: string }) {
  const W = 48, H = 14
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = Math.max(1, max - min)
  const step = W / Math.max(1, values.length - 1)
  const pts = values.map((v, i) => [i * step, H - 2 - ((v - min) / range) * (H - 4)] as const)
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const stroke = tone === 'danger' ? 'hsl(var(--destructive))'
    : tone === 'warning' ? 'hsl(var(--warning))'
    : tone === 'success' ? 'hsl(var(--success))'
    : 'hsl(var(--primary))'
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="paxlog-stat-rail__spark">
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.2} />
    </svg>
  )
}

// ── Toolbar ──────────────────────────────────────────────────────────────────

export interface FilterChip { id: string; label: ReactNode; count?: number; active?: boolean; onClick?: () => void }

export function PaxlogToolbar({
  searchValue, onSearchChange, searchPlaceholder,
  chips, segmented, right,
}: {
  searchValue: string
  onSearchChange: (v: string) => void
  searchPlaceholder?: string
  chips?: FilterChip[]
  segmented?: { id: string; label: ReactNode; active?: boolean; onClick?: () => void }[]
  right?: ReactNode
}) {
  return (
    <div className="paxlog-toolbar">
      <label className="paxlog-toolbar__search">
        <SearchIcon />
        <input
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
        />
        <kbd>⌘K</kbd>
      </label>
      {segmented && (
        <div className="paxlog-toolbar__seg">
          {segmented.map((s) => (
            <button
              key={s.id}
              type="button"
              className={cn(s.active && 'is-active')}
              onClick={s.onClick}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      {chips?.map((c) => (
        <button
          key={c.id}
          type="button"
          className={cn('paxlog-toolbar__chip', c.active && 'is-active')}
          onClick={c.onClick}
        >
          {c.label}
          {c.count != null && <strong>{c.count}</strong>}
        </button>
      ))}
      {right && <div className="paxlog-toolbar__right">{right}</div>}
    </div>
  )
}

function SearchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

// ── Bulk bar ────────────────────────────────────────────────────────────────

export function PaxlogBulkBar({
  count, onClear, children,
}: { count: number; onClear: () => void; children: ReactNode }) {
  if (count === 0) return null
  return (
    <div className="paxlog-bulkbar">
      <strong>{count} sélectionné{count > 1 ? 's' : ''}</strong>
      <div className="paxlog-bulkbar__actions">{children}</div>
      <button type="button" onClick={onClear} className="paxlog-bulkbar__close" aria-label="Effacer la sélection">
        <X size={12} />
      </button>
    </div>
  )
}

// ── Detail header ───────────────────────────────────────────────────────────

export function PaxlogDetailHeader({
  reference, title, chips, meta, actions,
}: {
  reference: string
  title: string
  chips?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="paxlog-detail-head">
      <div className="paxlog-detail-head__row">
        <div className="paxlog-detail-head__text">
          <h2 className="paxlog-detail-head__title">
            <span className="paxlog-detail-head__ref">{reference}</span>
            <span className="paxlog-detail-head__name">{title}</span>
            {chips}
          </h2>
          {meta && <div className="paxlog-detail-head__meta">{meta}</div>}
        </div>
        <div className="paxlog-detail-head__actions">{actions}</div>
      </div>
    </header>
  )
}

// ── Stepper ─────────────────────────────────────────────────────────────────

export interface StepperStep { id: string; label: string; state: 'done' | 'current' | 'pending' }

export function PaxlogStepper({ steps }: { steps: StepperStep[] }) {
  return (
    <div className="paxlog-stepper">
      {steps.map((s, i) => (
        <span key={s.id} className="paxlog-stepper__chain">
          <span className={cn('paxlog-stepper__step', `is-${s.state}`)}>
            <span className="paxlog-stepper__dot">{s.state === 'done' ? '✓' : s.state === 'current' ? '●' : ''}</span>
            <span>{s.label}</span>
          </span>
          {i < steps.length - 1 && <span className={cn('paxlog-stepper__sep', s.state === 'done' && 'is-done')} />}
        </span>
      ))}
    </div>
  )
}

// ── Detail KPI strip (cstrip) ───────────────────────────────────────────────

export function PaxlogStateStrip({ items }: { items: { label: string; value: ReactNode; tone?: 'danger' | 'warning' | 'success' }[] }) {
  return (
    <div className="paxlog-cstrip">
      {items.map((it) => (
        <div key={it.label} className="paxlog-cstrip__item">
          <div className="paxlog-cstrip__num" data-tone={it.tone}>{it.value}</div>
          <div className="paxlog-cstrip__label">{it.label}</div>
        </div>
      ))}
    </div>
  )
}

// ── Page header (used above each list tab to align with the new pattern) ─────

export function PaxlogPageHeader({
  title, count, subtitle, actions,
}: { title: string; count?: number; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="paxlog-pagehead">
      <div className="paxlog-pagehead__text">
        <h1 className="paxlog-pagehead__title">
          {title}
          {count != null && <span className="paxlog-pagehead__count">{count.toLocaleString('fr-FR')}</span>}
        </h1>
        {subtitle && <div className="paxlog-pagehead__sub">{subtitle}</div>}
      </div>
      {actions && <div className="paxlog-pagehead__actions">{actions}</div>}
    </header>
  )
}

export const _PaxlogShellTypes = {
  // Re-exported for downstream tabs that need the shape.
}
