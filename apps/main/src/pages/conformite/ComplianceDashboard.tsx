/**
 * Compliance Dashboard KPI tab — stat cards, category breakdown, expiration lists.
 */
import React from 'react'
import {
  ShieldCheck, AlertTriangle, Clock, XCircle, TrendingUp,
  FileCheck, CalendarClock, Loader2,
} from 'lucide-react'
import { useComplianceKPIs } from '@/hooks/useConformite'
import type { ComplianceDashboardKPIs } from '@/services/conformiteService'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/i18n'

// ── Stat Card ─────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: number | string
  icon: React.ElementType
  color: string // tailwind text-color class
  bgColor: string // tailwind bg-color class
  subtitle?: string
}

function StatCard({ label, value, icon: Icon, color, bgColor, subtitle }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', bgColor)}>
        <Icon size={20} className={color} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className={cn('text-xl font-semibold tabular-nums', color)}>{value}</p>
        {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  )
}

// ── Category Bar ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  formation: 'Formations',
  certification: 'Certifications',
  habilitation: 'Habilitations',
  audit: 'Audits',
  medical: 'Medical',
  epi: 'EPI',
}

function CategoryBreakdown({ data }: { data: ComplianceDashboardKPIs['by_category'] }) {
  if (data.length === 0) {
    return (
      <div className="text-center text-muted-foreground text-sm py-8">
        Aucune donnée par catégorie
      </div>
    )
  }

  const maxTotal = Math.max(...data.map(d => d.total), 1)

  return (
    <div className="space-y-3">
      {data.map(cat => {
        const barWidth = Math.max((cat.total / maxTotal) * 100, 4)
        const validPct = cat.total > 0 ? Math.round((cat.valid / cat.total) * 100) : 0
        return (
          <div key={cat.category} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">
                {CATEGORY_LABELS[cat.category] ?? cat.category}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {cat.valid}/{cat.total} conforme ({validPct}%)
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full flex rounded-full overflow-hidden" style={{ width: `${barWidth}%` }}>
                {cat.valid > 0 && (
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${(cat.valid / cat.total) * 100}%` }}
                  />
                )}
                {cat.expired > 0 && (
                  <div
                    className="h-full bg-red-500"
                    style={{ width: `${(cat.expired / cat.total) * 100}%` }}
                  />
                )}
                {cat.pending > 0 && (
                  <div
                    className="h-full bg-amber-400"
                    style={{ width: `${(cat.pending / cat.total) * 100}%` }}
                  />
                )}
              </div>
            </div>
          </div>
        )
      })}

      {/* Legend */}
      <div className="flex items-center gap-4 pt-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Valide</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Expiré</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> En attente</span>
      </div>
    </div>
  )
}

// ── Expiration List ───────────────────────────────────────────────────────

interface ExpirationItem {
  id: string
  type_name: string
  owner_type: string
  expired_at?: string | null
  expires_at?: string | null
  days_overdue?: number
  days_remaining?: number
}

function ExpirationList({ items, variant }: { items: ExpirationItem[]; variant: 'recent' | 'upcoming' }) {
  if (items.length === 0) {
    return (
      <div className="text-center text-muted-foreground text-sm py-6">
        {variant === 'recent' ? 'Aucune expiration récente' : 'Aucune expiration à venir'}
      </div>
    )
  }

  return (
    <div className="divide-y divide-border">
      {items.map(item => {
        const dateStr = variant === 'recent' ? item.expired_at : item.expires_at
        const formatted = dateStr ? formatDate(dateStr) : '--'
        const days = variant === 'recent' ? item.days_overdue : item.days_remaining
        const daysLabel = variant === 'recent'
          ? `${days}j de retard`
          : `${days}j restants`
        const daysColor = variant === 'recent'
          ? 'text-red-500'
          : (days !== undefined && days <= 7 ? 'text-orange-500' : 'text-muted-foreground')

        return (
          <div key={item.id} className="flex items-center justify-between py-2 px-1 text-xs">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground truncate">{item.type_name}</p>
              <p className="text-muted-foreground">{item.owner_type}</p>
            </div>
            <div className="text-right shrink-0 ml-3">
              <p className="text-muted-foreground tabular-nums">{formatted}</p>
              <p className={cn('tabular-nums', daysColor)}>{daysLabel}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main Dashboard Component ──────────────────────────────────────────────

export function ComplianceDashboard() {
  const { data, isLoading, error } = useComplianceKPIs()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
        Erreur lors du chargement des indicateurs
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── KPI Stat Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total enregistrements"
          value={data.total_records}
          icon={FileCheck}
          color="text-foreground"
          bgColor="bg-muted"
        />
        <StatCard
          label="Valides"
          value={data.valid_count}
          icon={ShieldCheck}
          color="text-emerald-600"
          bgColor="bg-emerald-500/10"
        />
        <StatCard
          label="Expirés"
          value={data.expired_count}
          icon={XCircle}
          color="text-red-600"
          bgColor="bg-red-500/10"
        />
        <StatCard
          label="En attente"
          value={data.pending_count}
          icon={Clock}
          color="text-amber-600"
          bgColor="bg-amber-500/10"
        />
        <StatCard
          label="Expirent bientôt"
          value={data.expiring_soon_count}
          icon={AlertTriangle}
          color="text-orange-600"
          bgColor="bg-orange-500/10"
          subtitle="sous 30 jours"
        />
        <StatCard
          label="Taux de conformité"
          value={`${data.compliance_rate}%`}
          icon={TrendingUp}
          color={data.compliance_rate >= 80 ? 'text-emerald-600' : data.compliance_rate >= 50 ? 'text-amber-600' : 'text-red-600'}
          bgColor={data.compliance_rate >= 80 ? 'bg-emerald-500/10' : data.compliance_rate >= 50 ? 'bg-amber-500/10' : 'bg-red-500/10'}
        />
      </div>

      {/* ── Category Breakdown + Expiration Lists ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Category breakdown */}
        <div className="lg:col-span-1 rounded-lg border border-border bg-card p-4 shadow-sm">
          <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <ShieldCheck size={14} className="text-muted-foreground" />
            Conformité par catégorie
          </h3>
          <CategoryBreakdown data={data.by_category} />
        </div>

        {/* Recent expirations */}
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <XCircle size={14} className="text-red-500" />
            Expirations récentes
          </h3>
          <ExpirationList items={data.recent_expirations} variant="recent" />
        </div>

        {/* Upcoming expirations */}
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <CalendarClock size={14} className="text-orange-500" />
            Expirations a venir
          </h3>
          <ExpirationList items={data.upcoming_expirations} variant="upcoming" />
        </div>
      </div>
    </div>
  )
}
