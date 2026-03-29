/**
 * PaxLog page — PAX management, Avis de Sejour, Credentials, Compliance,
 * Signalements, Rotations.
 *
 * Static Panel: tab bar + DataTable per tab.
 * Dynamic Panel: create/detail forms with company/user pickers.
 * Each tab manages its own search via DataTable visual query bar.
 */
import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Users,
  Plus,
  Loader2,
  Trash2,
  ClipboardList,
  AlertTriangle,
  FileCheck2,
  Send,
  XCircle,
  CheckCircle2,
  Clock,
  Info,
  User,
  Building2,
  Search,
  X,
  Download,
  ThumbsUp,
  ThumbsDown,
  LayoutDashboard,
  Shield,
  RefreshCw,
  Percent,
  Link2,
  Briefcase,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { normalizeNames } from '@/lib/normalize'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { useDebounce } from '@/hooks/useDebounce'
import { usePageSize } from '@/hooks/usePageSize'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormGrid,
  FormSection,
  InlineEditableRow,
  ReadOnlyRow,
  PanelActionButton,
  DangerConfirmButton,
  TagSelector,
  PanelContentLayout,
  SectionColumns,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { TagManager } from '@/components/shared/TagManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { useUIStore } from '@/stores/uiStore'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import {
  usePaxProfiles,
  usePaxProfile,
  useCreatePaxProfile,
  useUpdatePaxProfile,
  usePaxCredentials,
  useCredentialTypes,
  useAdsList,
  useAds,
  useCreateAds,
  useSubmitAds,
  useCancelAds,
  useApproveAds,
  useRejectAds,
  useAdsPdf,
  useAdsPax,
  useAdsImputations,
  useDeleteImputation,
  useCreateExternalLink,
  usePaxIncidents,
  useCreatePaxIncident,
  useResolvePaxIncident,
  useRotationCycles,
  useCreateRotationCycle,
  useEndRotationCycle,
  useComplianceStats,
  useExpiringCredentials,
  useComplianceMatrix,
  useAvmList,
  useAvm,
  useCreateAvm,
  useSubmitAvm,
  useApproveAvm,
  useCancelAvm,
  useAddPaxToAdsV2,
  useRemovePaxFromAds,
  usePaxCandidates,
  useAddImputation,
} from '@/hooks/usePaxlog'
import { useTiers } from '@/hooks/useTiers'
import { useUsers } from '@/hooks/useUsers'
import { useAssetTree } from '@/hooks/useAssets'
import type { AssetTreeNode } from '@/types/api'
import { usePermission } from '@/hooks/usePermission'
import { useProjects } from '@/hooks/useProjets'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import type {
  PaxProfileSummary,
  AdsSummary,
  PaxIncident,
  PaxCredential,
  CredentialType,
  RotationCycle,
  ExpiringCredential,
  AdsImputation,
  AdsPax,
  ComplianceMatrixEntry,
  MissionNoticeSummary,
  MissionProgramRead,
  PaxCandidate,
} from '@/services/paxlogService'

// ── Constants ──────────────────────────────────────────────────

const PAX_TYPE_OPTIONS = [
  { value: 'internal', label: 'Interne' },
  { value: 'external', label: 'Externe' },
]

const PAX_STATUS_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'active', label: 'Actif' },
  { value: 'incomplete', label: 'Incomplet' },
  { value: 'suspended', label: 'Suspendu' },
  { value: 'archived', label: 'Archive' },
]

const ADS_STATUS_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'draft', label: 'Brouillon' },
  { value: 'submitted', label: 'Soumis' },
  { value: 'pending_compliance', label: 'Compliance' },
  { value: 'pending_validation', label: 'Validation' },
  { value: 'approved', label: 'Approuve' },
  { value: 'rejected', label: 'Rejete' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'completed', label: 'Termine' },
  { value: 'cancelled', label: 'Annule' },
]

const ADS_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  draft: { label: 'Brouillon', badge: 'gl-badge-neutral' },
  submitted: { label: 'Soumis', badge: 'gl-badge-info' },
  pending_compliance: { label: 'Compliance', badge: 'gl-badge-warning' },
  pending_validation: { label: 'Validation', badge: 'gl-badge-warning' },
  approved: { label: 'Approuve', badge: 'gl-badge-success' },
  rejected: { label: 'Rejete', badge: 'gl-badge-danger' },
  cancelled: { label: 'Annule', badge: 'gl-badge-neutral' },
  requires_review: { label: 'A revoir', badge: 'gl-badge-info' },
  in_progress: { label: 'En cours', badge: 'gl-badge-success' },
  completed: { label: 'Termine', badge: 'gl-badge-success' },
}

const VISIT_CATEGORY_OPTIONS = [
  { value: 'project_work', label: 'Projet' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'visit', label: 'Visite' },
  { value: 'permanent_ops', label: 'Operations permanentes' },
  { value: 'other', label: 'Autre' },
]

const SEVERITY_OPTIONS = [
  { value: 'info', label: 'Info', color: 'gl-badge-info' },
  { value: 'warning', label: 'Avertissement', color: 'gl-badge-warning' },
  { value: 'temp_ban', label: 'Ban temporaire', color: 'gl-badge-danger' },
  { value: 'permanent_ban', label: 'Ban permanent', color: 'gl-badge-danger' },
]

const ROTATION_STATUS_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'active', label: 'Actif' },
  { value: 'paused', label: 'En pause' },
  { value: 'completed', label: 'Termine' },
]

const ROTATION_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  active: { label: 'Actif', badge: 'gl-badge-success' },
  paused: { label: 'En pause', badge: 'gl-badge-warning' },
  completed: { label: 'Termine', badge: 'gl-badge-neutral' },
}

const AVM_STATUS_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'draft', label: 'Brouillon' },
  { value: 'in_preparation', label: 'En preparation' },
  { value: 'active', label: 'Active' },
  { value: 'ready', label: 'Prete' },
  { value: 'completed', label: 'Terminee' },
  { value: 'cancelled', label: 'Annulee' },
]

const AVM_STATUS_MAP: Record<string, { label: string; badge: string }> = {
  draft: { label: 'Brouillon', badge: 'gl-badge-neutral' },
  in_preparation: { label: 'En preparation', badge: 'gl-badge-warning' },
  active: { label: 'Active', badge: 'gl-badge-info' },
  ready: { label: 'Prete', badge: 'gl-badge-success' },
  completed: { label: 'Terminee', badge: 'gl-badge-success' },
  cancelled: { label: 'Annulee', badge: 'gl-badge-neutral' },
}

const AVM_MISSION_TYPE_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'vip', label: 'VIP' },
  { value: 'regulatory', label: 'Reglementaire' },
  { value: 'emergency', label: 'Urgence' },
]

const MAIN_TABS = [
  { id: 'dashboard' as const, label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'ads' as const, label: 'Avis de Sejour', icon: ClipboardList },
  { id: 'profiles' as const, label: 'Profils PAX', icon: Users },
  { id: 'compliance' as const, label: 'Compliance', icon: Shield },
  { id: 'signalements' as const, label: 'Signalements', icon: AlertTriangle },
  { id: 'rotations' as const, label: 'Rotations', icon: RefreshCw },
  { id: 'avm' as const, label: 'Missions (AVM)', icon: Briefcase },
]

type MainTabId = (typeof MAIN_TABS)[number]['id']

// ── Helpers ────────────────────────────────────────────────────

function StatusBadge({ status, map, className }: { status: string; map?: Record<string, { label: string; badge: string }>; className?: string }) {
  if (map) {
    const entry = map[status]
    return <span className={cn('gl-badge', entry?.badge || 'gl-badge-neutral', className)}>{entry?.label || status.replace(/_/g, ' ')}</span>
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

function SeverityBadge({ severity }: { severity: string }) {
  const opt = SEVERITY_OPTIONS.find((o) => o.value === severity)
  return <span className={cn('gl-badge', opt?.color || 'gl-badge-neutral')}>{opt?.label || severity}</span>
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateShort(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function CompletenessBar({ value }: { value: number }) {
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

function StatCard({ label, value, icon: Icon, accent }: {
  label: string
  value: string | number
  icon: typeof Users
  accent?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon size={13} />
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={cn('text-lg font-semibold tabular-nums', accent || 'text-foreground')}>{value}</p>
    </div>
  )
}

function daysUntil(dateStr: string): number {
  const now = new Date()
  const target = new Date(dateStr)
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function CountdownBadge({ days }: { days: number }) {
  const color = days <= 7 ? 'gl-badge-danger' : days <= 30 ? 'gl-badge-warning' : 'gl-badge-info'
  return <span className={cn('gl-badge', color)}>{days}j</span>
}

// ── Searchable Picker (reused for company & user selection) ───

function SearchablePicker<T extends { id: string }>({
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
              {isLoading && <div className="px-3 py-2 text-xs text-muted-foreground">Chargement...</div>}
              {!isLoading && items.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">Aucun resultat</div>
              )}
              {items.map((item) => (
                <button
                  key={item.id}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
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

// ═══════════════════════════════════════════════════════════════
// TAB 1: DASHBOARD
// ═══════════════════════════════════════════════════════════════

function DashboardTab() {
  const { data: adsData } = useAdsList({ page: 1, page_size: 10 })
  const { data: profilesData } = usePaxProfiles({ page: 1, page_size: 5 })
  const { data: complianceStats } = useComplianceStats()
  const { data: expiringCreds } = useExpiringCredentials(30)
  const { data: incidentsData } = usePaxIncidents({ page: 1, page_size: 5, active_only: true })

  const paxOnSite = profilesData?.total ?? 0
  const adsPending = useMemo(() => {
    if (!adsData?.items) return 0
    return adsData.items.filter((a) => ['submitted', 'pending_compliance', 'pending_validation'].includes(a.status)).length
  }, [adsData])
  const activeSignalements = incidentsData?.total ?? 0
  const complianceRate = complianceStats?.compliance_rate ?? 0

  // ADS by status for display
  const recentAds = adsData?.items ?? []
  const expiringList = expiringCreds?.slice(0, 8) ?? []

  const adsStatusCounts = useMemo(() => {
    if (!adsData?.items) return {} as Record<string, number>
    const counts: Record<string, number> = {}
    adsData.items.forEach((a) => { counts[a.status] = (counts[a.status] || 0) + 1 })
    return counts
  }, [adsData])

  return (
    <PanelContent>
      <div className="p-4 space-y-5">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="PAX enregistres" value={paxOnSite} icon={Users} />
          <StatCard label="AdS en attente" value={adsPending} icon={ClipboardList} accent={adsPending > 0 ? 'text-amber-600 dark:text-amber-400' : undefined} />
          <StatCard label="Signalements actifs" value={activeSignalements} icon={AlertTriangle} accent={activeSignalements > 0 ? 'text-destructive' : undefined} />
          <StatCard label="Taux compliance" value={`${complianceRate}%`} icon={Shield} accent={complianceRate >= 90 ? 'text-emerald-600 dark:text-emerald-400' : complianceRate >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-destructive'} />
        </div>

        {/* AdS by status visual */}
        <CollapsibleSection id="dash-ads-status" title="AdS par statut" defaultExpanded>
          <div className="flex flex-wrap gap-2">
            {Object.entries(adsStatusCounts).map(([status, count]) => {
              const entry = ADS_STATUS_MAP[status]
              return (
                <div key={status} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-background">
                  <span className={cn('gl-badge', entry?.badge || 'gl-badge-neutral')}>{entry?.label || status}</span>
                  <span className="text-sm font-semibold tabular-nums">{count}</span>
                </div>
              )
            })}
            {Object.keys(adsStatusCounts).length === 0 && (
              <p className="text-xs text-muted-foreground italic">Aucun AdS enregistre.</p>
            )}
          </div>
        </CollapsibleSection>

        {/* Recent AdS */}
        <CollapsibleSection id="dash-recent-ads" title="Derniers Avis de Sejour" defaultExpanded>
          {recentAds.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-2">Aucun AdS recent.</p>
          ) : (
            <div className="space-y-1">
              {recentAds.slice(0, 6).map((ads) => (
                <div key={ads.id} className="flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-accent/50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium font-mono text-foreground">{ads.reference}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {VISIT_CATEGORY_OPTIONS.find((o) => o.value === ads.visit_category)?.label || ads.visit_category}
                      {' — '}
                      {formatDate(ads.start_date)} → {formatDate(ads.end_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Users size={11} /> {ads.pax_count}
                    </span>
                    <StatusBadge status={ads.status} map={ADS_STATUS_MAP} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* Expiring credentials */}
        <CollapsibleSection id="dash-expiring-creds" title="Certifications expirant bientot" defaultExpanded>
          {expiringList.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-2">Aucune certification expirant dans les 30 jours.</p>
          ) : (
            <div className="space-y-1">
              {expiringList.map((cred) => (
                <div key={cred.id} className="flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-accent/50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">{cred.pax_last_name} {cred.pax_first_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {cred.credential_type_name}
                      {cred.pax_company_name && ` — ${cred.pax_company_name}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-muted-foreground">{formatDate(cred.expiry_date)}</span>
                    <CountdownBadge days={cred.days_remaining} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* Compliance stats */}
        {complianceStats && (
          <CollapsibleSection id="dash-compliance-stats" title="Statistiques compliance">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard label="Total PAX" value={complianceStats.total_pax} icon={Users} />
              <StatCard label="Conformes" value={complianceStats.compliant_pax} icon={CheckCircle2} accent="text-emerald-600 dark:text-emerald-400" />
              <StatCard label="Non conformes" value={complianceStats.non_compliant_pax} icon={XCircle} accent={complianceStats.non_compliant_pax > 0 ? 'text-destructive' : undefined} />
              <StatCard label="Expirant bientot" value={complianceStats.expiring_soon} icon={Clock} accent="text-amber-600 dark:text-amber-400" />
              <StatCard label="Expires" value={complianceStats.expired} icon={AlertTriangle} accent={complianceStats.expired > 0 ? 'text-destructive' : undefined} />
              <StatCard label="Taux compliance" value={`${complianceStats.compliance_rate}%`} icon={Percent} />
            </div>
          </CollapsibleSection>
        )}
      </div>
    </PanelContent>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB 2: AVIS DE SEJOUR (AdS)
// ═══════════════════════════════════════════════════════════════

function AdsTab({ openDetail }: { openDetail: (id: string) => void }) {
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState('')

  const { data, isLoading } = useAdsList({
    page,
    page_size: pageSize,
    status: statusFilter || undefined,
    search: debouncedSearch || undefined,
  })

  const items: AdsSummary[] = data?.items ?? []

  const stats = useMemo(() => {
    const pending = items.filter((a) => ['submitted', 'pending_compliance', 'pending_validation'].includes(a.status)).length
    const approved = items.filter((a) => a.status === 'approved').length
    const totalPax = items.reduce((sum, a) => sum + (a.pax_count ?? 0), 0)
    return { pending, approved, totalPax }
  }, [items])

  const adsColumns = useMemo<ColumnDef<AdsSummary, unknown>[]>(() => [
    {
      accessorKey: 'reference',
      header: 'Reference',
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="font-medium text-foreground font-mono text-xs">{row.original.reference}</span>
          {row.original.site_name && row.original.site_entry_asset_id && (
            <CrossModuleLink module="assets" id={row.original.site_entry_asset_id} label={row.original.site_name} showIcon={false} className="text-[10px] block truncate" />
          )}
          {row.original.site_name && !row.original.site_entry_asset_id && (
            <span className="text-[10px] text-muted-foreground block truncate">{row.original.site_name}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => (
        <span className={cn('gl-badge', row.original.type === 'team' ? 'gl-badge-info' : 'gl-badge-neutral')}>
          {row.original.type === 'individual' ? 'Individuel' : 'Equipe'}
        </span>
      ),
      size: 90,
    },
    {
      accessorKey: 'visit_category',
      header: 'Categorie',
      cell: ({ row }) => (
        <span className="gl-badge gl-badge-neutral">
          {VISIT_CATEGORY_OPTIONS.find((o) => o.value === row.original.visit_category)?.label || row.original.visit_category}
        </span>
      ),
    },
    {
      id: 'dates',
      header: 'Dates',
      cell: ({ row }) => <span className="text-muted-foreground text-xs tabular-nums">{formatDate(row.original.start_date)} → {formatDate(row.original.end_date)}</span>,
    },
    {
      accessorKey: 'requester_name',
      header: 'Demandeur',
      cell: ({ row }) => <span className="text-xs text-muted-foreground truncate block max-w-[120px]">{row.original.requester_name || '—'}</span>,
    },
    {
      accessorKey: 'pax_count',
      header: 'PAX',
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 text-xs"><Users size={11} className="text-muted-foreground" /> {row.original.pax_count}</span>
      ),
      size: 60,
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      cell: ({ row }) => <StatusBadge status={row.original.status} map={ADS_STATUS_MAP} />,
      size: 110,
    },
  ], [])

  return (
    <>
      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        <StatCard label="Total" value={data?.total ?? 0} icon={ClipboardList} />
        <StatCard label="En attente" value={stats.pending} icon={Clock} accent="text-amber-600 dark:text-amber-400" />
        <StatCard label="Approuves" value={stats.approved} icon={CheckCircle2} accent="text-emerald-600 dark:text-emerald-400" />
        <StatCard label="PAX total" value={stats.totalPax} icon={Users} />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {ADS_STATUS_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => { setStatusFilter(opt.value); setPage(1) }}
              className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap', statusFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {opt.label}
            </button>
          ))}
        </div>
        {data && <span className="text-xs text-muted-foreground ml-auto shrink-0">{data.total} avis</span>}
      </div>

      <PanelContent>
        <DataTable<AdsSummary>
          columns={adsColumns}
          data={items}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder="Rechercher par reference, categorie..."
          onRowClick={(row) => openDetail(row.id)}
          emptyIcon={ClipboardList}
          emptyTitle="Aucun avis de sejour"
          storageKey="paxlog-ads"
        />
      </PanelContent>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB 3: PROFILS PAX
// ═══════════════════════════════════════════════════════════════

function ProfilesTab({ openDetail }: { openDetail: (id: string) => void }) {
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const { hasPermission } = usePermission()
  const canImport = hasPermission('paxlog.import')
  const canExport = hasPermission('paxlog.export') || hasPermission('paxlog.profile.read')

  const { data, isLoading } = usePaxProfiles({
    page, page_size: pageSize,
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    type: typeFilter || undefined,
  })

  const profileColumns = useMemo<ColumnDef<PaxProfileSummary, unknown>[]>(() => [
    {
      id: 'name',
      header: 'Nom',
      accessorFn: (row) => `${row.last_name} ${row.first_name}`,
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.last_name} {row.original.first_name}</span>,
    },
    {
      accessorKey: 'company_name',
      header: 'Entreprise',
      cell: ({ row }) => row.original.company_id
        ? <CrossModuleLink module="tiers" id={row.original.company_id} label={row.original.company_name || row.original.company_id} showIcon={false} className="text-xs" />
        : row.original.company_name
          ? <span className="flex items-center gap-1 text-muted-foreground text-xs"><Building2 size={11} /> {row.original.company_name}</span>
          : <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => (
        <span className={cn('gl-badge', row.original.type === 'internal' ? 'gl-badge-info' : 'gl-badge-neutral')}>
          {row.original.type === 'internal' ? 'Interne' : 'Externe'}
        </span>
      ),
      size: 80,
    },
    {
      accessorKey: 'badge_number',
      header: 'Badge',
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.badge_number || '—'}</span>,
    },
    {
      accessorKey: 'profile_completeness',
      header: 'Completude',
      cell: ({ row }) => <CompletenessBar value={row.original.profile_completeness} />,
      size: 120,
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
      size: 90,
    },
  ], [])

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <div className="flex items-center gap-1">
          {PAX_STATUS_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => { setStatusFilter(opt.value); setPage(1) }}
              className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors', statusFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {opt.label}
            </button>
          ))}
          <span className="mx-1 h-3 w-px bg-border" />
          {PAX_TYPE_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => { setTypeFilter(typeFilter === opt.value ? '' : opt.value); setPage(1) }}
              className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors', typeFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {opt.label}
            </button>
          ))}
        </div>
        {data && <span className="text-xs text-muted-foreground ml-auto">{data.total} profils</span>}
      </div>

      <PanelContent>
        <DataTable<PaxProfileSummary>
          columns={profileColumns}
          data={data?.items ?? []}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder="Rechercher par nom, badge..."
          onRowClick={(row) => openDetail(row.id)}
          importExport={(canExport || canImport) ? {
            exportFormats: canExport ? ['csv', 'xlsx'] : undefined,
            advancedExport: true,
            importWizardTarget: canImport ? 'pax_profile' : undefined,
            filenamePrefix: 'pax-profiles',
          } : undefined}
          emptyIcon={Users}
          emptyTitle="Aucun profil PAX"
          storageKey="paxlog-profiles"
        />
      </PanelContent>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB 4: COMPLIANCE
// ═══════════════════════════════════════════════════════════════

function ComplianceTab() {
  const { data: complianceStats } = useComplianceStats()
  const { data: expiringCreds, isLoading: expiringLoading } = useExpiringCredentials(90)
  const { data: matrix, isLoading: matrixLoading } = useComplianceMatrix()
  const { data: credentialTypes } = useCredentialTypes()
  const [search, setSearch] = useState('')

  // Build credential type lookup
  const credTypeMap = useMemo(() => {
    const m: Record<string, CredentialType> = {}
    credentialTypes?.forEach((ct) => { m[ct.id] = ct })
    return m
  }, [credentialTypes])

  // Filter expiring creds
  const filteredExpiring = useMemo(() => {
    if (!expiringCreds) return []
    if (!search) return expiringCreds
    const q = search.toLowerCase()
    return expiringCreds.filter((c) =>
      c.pax_last_name.toLowerCase().includes(q) ||
      c.pax_first_name.toLowerCase().includes(q) ||
      c.credential_type_name.toLowerCase().includes(q) ||
      (c.pax_company_name || '').toLowerCase().includes(q)
    )
  }, [expiringCreds, search])

  const expiringColumns = useMemo<ColumnDef<ExpiringCredential, unknown>[]>(() => [
    {
      id: 'pax',
      header: 'PAX',
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="font-medium text-foreground block">{row.original.pax_last_name} {row.original.pax_first_name}</span>
          {row.original.pax_company_name && (
            <span className="text-[10px] text-muted-foreground block truncate">{row.original.pax_company_name}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'credential_type_name',
      header: 'Certification',
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="text-foreground text-xs">{row.original.credential_type_name}</span>
          <span className="text-[10px] text-muted-foreground block">{row.original.credential_type_category}</span>
        </div>
      ),
    },
    {
      accessorKey: 'expiry_date',
      header: 'Expiration',
      cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums">{formatDate(row.original.expiry_date)}</span>,
      size: 100,
    },
    {
      id: 'countdown',
      header: 'Delai',
      cell: ({ row }) => <CountdownBadge days={row.original.days_remaining} />,
      size: 70,
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
      size: 90,
    },
  ], [])

  const matrixColumns = useMemo<ColumnDef<ComplianceMatrixEntry, unknown>[]>(() => [
    {
      accessorKey: 'asset_id',
      header: 'Asset',
      cell: ({ row }) => <span className="text-xs font-mono text-foreground truncate block max-w-[180px]">{row.original.asset_id}</span>,
    },
    {
      accessorKey: 'credential_type_id',
      header: 'Certification requise',
      cell: ({ row }) => {
        const ct = credTypeMap[row.original.credential_type_id]
        return <span className="text-xs text-foreground">{ct?.name || row.original.credential_type_id}</span>
      },
    },
    {
      accessorKey: 'scope',
      header: 'Portee',
      cell: ({ row }) => {
        const labels: Record<string, string> = { all_visitors: 'Tous', contractors_only: 'Sous-traitants', permanent_staff_only: 'Staff permanent' }
        return <span className="gl-badge gl-badge-neutral">{labels[row.original.scope] || row.original.scope}</span>
      },
      size: 120,
    },
    {
      accessorKey: 'mandatory',
      header: 'Obligatoire',
      cell: ({ row }) => row.original.mandatory
        ? <CheckCircle2 size={14} className="text-green-600" />
        : <span className="text-muted-foreground text-xs">Non</span>,
      size: 80,
    },
    {
      accessorKey: 'defined_by',
      header: 'Defini par',
      cell: ({ row }) => <span className="gl-badge gl-badge-neutral">{row.original.defined_by === 'hse_central' ? 'HSE Central' : 'Site'}</span>,
      size: 100,
    },
  ], [credTypeMap])

  return (
    <PanelContent>
      <div className="p-4 space-y-5">
        {/* Stats */}
        {complianceStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Taux compliance" value={`${complianceStats.compliance_rate}%`} icon={Shield} accent={complianceStats.compliance_rate >= 90 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'} />
            <StatCard label="Conformes" value={complianceStats.compliant_pax} icon={CheckCircle2} accent="text-emerald-600 dark:text-emerald-400" />
            <StatCard label="Non conformes" value={complianceStats.non_compliant_pax} icon={XCircle} accent={complianceStats.non_compliant_pax > 0 ? 'text-destructive' : undefined} />
            <StatCard label="Expirant bientot" value={complianceStats.expiring_soon} icon={Clock} accent="text-amber-600 dark:text-amber-400" />
          </div>
        )}

        {/* Expiring credentials table */}
        <CollapsibleSection id="comp-expiring" title={`Certifications expirant sous 90j (${filteredExpiring.length})`} defaultExpanded>
          <DataTable<ExpiringCredential>
            columns={expiringColumns}
            data={filteredExpiring}
            isLoading={expiringLoading}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Rechercher par PAX, certification..."
            emptyIcon={FileCheck2}
            emptyTitle="Aucune certification expirant bientot"
            storageKey="paxlog-expiring"
          />
        </CollapsibleSection>

        {/* Compliance matrix */}
        <CollapsibleSection id="comp-matrix" title={`Matrice de compliance (${matrix?.length ?? 0})`}>
          <DataTable<ComplianceMatrixEntry>
            columns={matrixColumns}
            data={matrix ?? []}
            isLoading={matrixLoading}
            emptyIcon={Shield}
            emptyTitle="Aucune entree dans la matrice"
            storageKey="paxlog-compliance-matrix"
          />
        </CollapsibleSection>
      </div>
    </PanelContent>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB 5: SIGNALEMENTS
// ═══════════════════════════════════════════════════════════════

function SignalementsTab() {
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [severityFilter, setSeverityFilter] = useState('')
  const resolveIncident = useResolvePaxIncident()

  const { data, isLoading } = usePaxIncidents({
    page,
    page_size: pageSize,
    active_only: activeOnly,
    severity: severityFilter || undefined,
  })

  const filtered = useMemo(() => {
    if (!data?.items || !search) return data?.items || []
    const q = search.toLowerCase()
    return data.items.filter((i: PaxIncident) =>
      i.description.toLowerCase().includes(q) ||
      (i.pax_first_name || '').toLowerCase().includes(q) ||
      (i.pax_last_name || '').toLowerCase().includes(q)
    )
  }, [data?.items, search])

  const incidentColumns = useMemo<ColumnDef<PaxIncident, unknown>[]>(() => [
    {
      id: 'pax',
      header: 'PAX',
      cell: ({ row }) => {
        const pax = row.original
        if (pax.pax_first_name || pax.pax_last_name) {
          return <span className="text-xs font-medium text-foreground">{pax.pax_last_name} {pax.pax_first_name}</span>
        }
        return <span className="text-xs text-muted-foreground">—</span>
      },
    },
    {
      id: 'asset',
      header: 'Asset',
      cell: ({ row }) => row.original.asset_id
        ? <CrossModuleLink module="assets" id={row.original.asset_id} label={row.original.asset_name || row.original.asset_id} showIcon={false} className="text-xs" />
        : <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'severity',
      header: 'Severite',
      cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
      size: 120,
    },
    {
      accessorKey: 'incident_date',
      header: 'Date',
      cell: ({ row }) => <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">{formatDate(row.original.incident_date)}</span>,
      size: 100,
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => <span className="text-foreground max-w-[250px] truncate block text-xs">{row.original.description}</span>,
    },
    {
      id: 'resolved',
      header: 'Statut',
      cell: ({ row }) => row.original.resolved_at
        ? <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle2 size={12} /> Resolu</span>
        : <span className="inline-flex items-center gap-1 text-xs text-amber-500"><Clock size={12} /> Actif</span>,
      size: 80,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => !row.original.resolved_at ? (
        <button
          className="gl-button-sm gl-button-default text-xs"
          onClick={(e) => { e.stopPropagation(); resolveIncident.mutate({ id: row.original.id, payload: {} }) }}
          disabled={resolveIncident.isPending}
        >
          Resoudre
        </button>
      ) : null,
      size: 80,
    },
  ], [resolveIncident])

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <button onClick={() => setActiveOnly(!activeOnly)}
          className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors', activeOnly ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          Actifs uniquement
        </button>
        <span className="mx-1 h-3 w-px bg-border" />
        {SEVERITY_OPTIONS.map((opt) => (
          <button key={opt.value} onClick={() => { setSeverityFilter(severityFilter === opt.value ? '' : opt.value); setPage(1) }}
            className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap', severityFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            {opt.label}
          </button>
        ))}
        {data && <span className="text-xs text-muted-foreground ml-auto">{data.total} signalements</span>}
      </div>

      <PanelContent>
        <DataTable<PaxIncident>
          columns={incidentColumns}
          data={filtered}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder="Rechercher par PAX, description..."
          emptyIcon={AlertTriangle}
          emptyTitle="Aucun signalement"
          storageKey="paxlog-signalements"
        />
      </PanelContent>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB 6: ROTATIONS
// ═══════════════════════════════════════════════════════════════

function RotationsTab() {
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const endCycle = useEndRotationCycle()

  const { data, isLoading } = useRotationCycles({
    page,
    page_size: pageSize,
    status: statusFilter || undefined,
  })

  const filtered = useMemo(() => {
    if (!data?.items || !search) return data?.items || []
    const q = search.toLowerCase()
    return data.items.filter((r: RotationCycle) =>
      (r.pax_first_name || '').toLowerCase().includes(q) ||
      (r.pax_last_name || '').toLowerCase().includes(q) ||
      (r.site_name || '').toLowerCase().includes(q)
    )
  }, [data?.items, search])

  const rotationColumns = useMemo<ColumnDef<RotationCycle, unknown>[]>(() => [
    {
      id: 'pax',
      header: 'PAX',
      cell: ({ row }) => (
        <span className="font-medium text-foreground text-xs">
          {row.original.pax_last_name} {row.original.pax_first_name}
        </span>
      ),
    },
    {
      id: 'site',
      header: 'Site',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.site_name || '—'}</span>,
    },
    {
      id: 'cycle',
      header: 'Cycle',
      cell: ({ row }) => (
        <span className="text-xs text-foreground tabular-nums">
          {row.original.days_on}j on / {row.original.days_off}j off
        </span>
      ),
      size: 110,
    },
    {
      accessorKey: 'start_date',
      header: 'Debut',
      cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums">{formatDateShort(row.original.start_date)}</span>,
      size: 100,
    },
    {
      id: 'next_rotation',
      header: 'Prochaine rotation',
      cell: ({ row }) => {
        if (!row.original.next_rotation_date) return <span className="text-muted-foreground text-xs">—</span>
        const days = daysUntil(row.original.next_rotation_date)
        return (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground tabular-nums">{formatDateShort(row.original.next_rotation_date)}</span>
            {days >= 0 && <CountdownBadge days={days} />}
          </div>
        )
      },
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      cell: ({ row }) => <StatusBadge status={row.original.status} map={ROTATION_STATUS_MAP} />,
      size: 90,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => row.original.status === 'active' ? (
        <button
          className="gl-button-sm gl-button-default text-xs"
          onClick={(e) => { e.stopPropagation(); endCycle.mutate(row.original.id) }}
          disabled={endCycle.isPending}
        >
          Terminer
        </button>
      ) : null,
      size: 80,
    },
  ], [endCycle])

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <div className="flex items-center gap-1">
          {ROTATION_STATUS_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => { setStatusFilter(opt.value); setPage(1) }}
              className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap', statusFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {opt.label}
            </button>
          ))}
        </div>
        {data && <span className="text-xs text-muted-foreground ml-auto">{data.total} rotations</span>}
      </div>

      <PanelContent>
        <DataTable<RotationCycle>
          columns={rotationColumns}
          data={filtered}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder="Rechercher par PAX, site..."
          emptyIcon={RefreshCw}
          emptyTitle="Aucun cycle de rotation"
          storageKey="paxlog-rotations"
        />
      </PanelContent>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// DYNAMIC PANELS
// ═══════════════════════════════════════════════════════════════

// ── Create PAX Profile Panel ──────────────────────────────────

function CreateProfilePanel() {
  const { t } = useTranslation()
  const createProfile = useCreatePaxProfile()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)

  const [form, setForm] = useState({
    type: 'external' as 'internal' | 'external',
    first_name: '',
    last_name: '',
    birth_date: null as string | null,
    nationality: null as string | null,
    badge_number: null as string | null,
    company_id: null as string | null,
    user_id: null as string | null,
  })

  const [companySearch, setCompanySearch] = useState('')
  const { data: tiersData, isLoading: tiersLoading } = useTiers({
    page: 1, page_size: 20, search: companySearch || undefined,
  })

  const [userSearch, setUserSearch] = useState('')
  const { data: usersData, isLoading: usersLoading } = useUsers({
    page: 1, page_size: 20, search: userSearch || undefined,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createProfile.mutateAsync(normalizeNames({
      type: form.type,
      first_name: form.first_name,
      last_name: form.last_name,
      birth_date: form.birth_date || undefined,
      nationality: form.nationality || undefined,
      badge_number: form.badge_number || undefined,
      company_id: form.type === 'external' ? form.company_id || undefined : undefined,
      user_id: form.type === 'internal' ? form.user_id || undefined : undefined,
    }))
    closeDynamicPanel()
  }

  const handleUserSelect = (user: { id: string; first_name: string; last_name: string; email: string }) => {
    setForm({
      ...form,
      user_id: user.id,
      first_name: form.first_name || user.first_name,
      last_name: form.last_name || user.last_name,
    })
  }

  return (
    <DynamicPanelShell
      title="Nouveau profil PAX"
      subtitle="PaxLog"
      icon={<Users size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createProfile.isPending}
            onClick={() => (document.getElementById('create-profile-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createProfile.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-profile-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
        <FormSection title="Type de profil">
          <TagSelector
            options={PAX_TYPE_OPTIONS}
            value={form.type}
            onChange={(v) => setForm({ ...form, type: v as 'internal' | 'external', company_id: null, user_id: null })}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            {form.type === 'internal'
              ? 'Personnel Perenco — lie a un compte utilisateur'
              : 'Sous-traitant / visiteur — lie a une entreprise (tier)'}
          </p>
        </FormSection>

        {form.type === 'external' && (
          <FormSection title="Entreprise">
            <SearchablePicker
              label="Entreprise (tier)"
              icon={<Building2 size={12} className="text-muted-foreground" />}
              items={tiersData?.items || []}
              isLoading={tiersLoading}
              searchValue={companySearch}
              onSearchChange={setCompanySearch}
              renderItem={(tier) => <><span className="font-semibold">{tier.code}</span> — {tier.name}</>}
              selectedId={form.company_id}
              onSelect={(tier) => setForm({ ...form, company_id: tier.id })}
              onClear={() => setForm({ ...form, company_id: null })}
              placeholder="Rechercher une entreprise..."
            />
          </FormSection>
        )}

        {form.type === 'internal' && (
          <FormSection title="Compte utilisateur">
            <SearchablePicker
              label="Utilisateur Perenco"
              icon={<User size={12} className="text-muted-foreground" />}
              items={usersData?.items || []}
              isLoading={usersLoading}
              searchValue={userSearch}
              onSearchChange={setUserSearch}
              renderItem={(u) => <>{u.first_name} {u.last_name} <span className="text-muted-foreground">({u.email})</span></>}
              selectedId={form.user_id}
              onSelect={handleUserSelect}
              onClear={() => setForm({ ...form, user_id: null })}
              placeholder="Rechercher un utilisateur..."
            />
          </FormSection>
        )}

        <FormSection title="Identite">
          <FormGrid>
            <DynamicPanelField label="Prenom" required>
              <input type="text" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Nom" required>
              <input type="text" required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        <FormSection title="Informations complementaires">
          <FormGrid>
            <DynamicPanelField label="Date de naissance">
              <input type="date" value={form.birth_date || ''} onChange={(e) => setForm({ ...form, birth_date: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Nationalite">
              <input type="text" value={form.nationality || ''} onChange={(e) => setForm({ ...form, nationality: e.target.value || null })} className={panelInputClass} placeholder="CM, FR..." />
            </DynamicPanelField>
            <DynamicPanelField label="N badge">
              <input type="text" value={form.badge_number || ''} onChange={(e) => setForm({ ...form, badge_number: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

// ── PAX Profile Detail Panel ──────────────────────────────────

function ProfileDetailPanel({ id }: { id: string }) {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data: profile, isLoading } = usePaxProfile(id)
  const updateProfile = useUpdatePaxProfile()
  const { data: credentials } = usePaxCredentials(id)
  const { data: credentialTypes } = useCredentialTypes()

  const handleSave = useCallback((field: string, value: string) => {
    updateProfile.mutate({ id, payload: normalizeNames({ [field]: value }) })
  }, [id, updateProfile])

  const credTypeMap = useMemo(() => {
    const m: Record<string, CredentialType> = {}
    credentialTypes?.forEach((ct) => { m[ct.id] = ct })
    return m
  }, [credentialTypes])

  if (isLoading || !profile) {
    return (
      <DynamicPanelShell title="Chargement..." icon={<Users size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={`${profile.first_name} ${profile.last_name}`}
      subtitle={profile.badge_number || profile.type}
      icon={<User size={14} className="text-primary" />}
      actions={
        <DangerConfirmButton
          icon={<Trash2 size={12} />}
          onConfirm={() => { updateProfile.mutate({ id, payload: { status: 'archived' } }); closeDynamicPanel() }}
          confirmLabel="Archiver ?"
        >
          Archiver
        </DangerConfirmButton>
      }
    >
      <PanelContentLayout>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={profile.status} />
          <span className={cn('gl-badge', profile.type === 'internal' ? 'gl-badge-info' : 'gl-badge-neutral')}>
            {profile.type === 'internal' ? 'Interne' : 'Externe'}
          </span>
          <CompletenessBar value={profile.profile_completeness} />
        </div>

        {profile.company_name && (
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-muted/40 border border-border">
            <Building2 size={13} className="text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{profile.company_name}</p>
              <p className="text-[10px] text-muted-foreground">Entreprise liee</p>
            </div>
          </div>
        )}
        {profile.user_email && (
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-muted/40 border border-border">
            <User size={13} className="text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{profile.user_email}</p>
              <p className="text-[10px] text-muted-foreground">Compte utilisateur lie</p>
            </div>
          </div>
        )}

        <SectionColumns>
          <div className="@container space-y-5">
            <FormSection title="Identite">
              <InlineEditableRow label="Prenom" value={profile.first_name} onSave={(v) => handleSave('first_name', v)} />
              <InlineEditableRow label="Nom" value={profile.last_name} onSave={(v) => handleSave('last_name', v)} />
              <ReadOnlyRow label="Date de naissance" value={formatDate(profile.birth_date)} />
              <InlineEditableRow label="Nationalite" value={profile.nationality || ''} onSave={(v) => handleSave('nationality', v)} />
              <InlineEditableRow label="N badge" value={profile.badge_number || ''} onSave={(v) => handleSave('badge_number', v)} />
            </FormSection>

            {profile.synced_from_intranet && (
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-xs">
                <Info size={12} /> Profil synchronise depuis l'intranet — edition limitee
              </div>
            )}
          </div>

          <div className="@container space-y-5">
            <FormSection title={`Certifications (${credentials?.length || 0})`}>
              {!credentials || credentials.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 italic">Aucune certification enregistree.</p>
              ) : (
                <div className="space-y-1">
                  {credentials.map((cred: PaxCredential) => (
                    <div key={cred.id} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-accent/50 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{credTypeMap[cred.credential_type_id]?.name || 'Certification'}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Obtenu : {formatDate(cred.obtained_date)}
                          {cred.expiry_date && ` — Expire : ${formatDate(cred.expiry_date)}`}
                        </p>
                      </div>
                      <StatusBadge status={cred.status} />
                    </div>
                  ))}
                </div>
              )}
            </FormSection>

            <ReadOnlyRow label="Cree le" value={formatDate(profile.created_at)} />
          </div>
        </SectionColumns>

        <CollapsibleSection id="profile-tags-notes" title="Tags, notes & fichiers">
          <div className="space-y-3 p-3">
            <TagManager ownerType="pax_profile" ownerId={profile.id} compact />
            <AttachmentManager ownerType="pax_profile" ownerId={profile.id} compact />
            <NoteManager ownerType="pax_profile" ownerId={profile.id} compact />
          </div>
        </CollapsibleSection>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// ── Create AdS Panel ──────────────────────────────────────────

function CreateAdsPanel() {
  const { t } = useTranslation()
  const createAds = useCreateAds()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data: projects } = useProjects({ page: 1, page_size: 100 })

  const [form, setForm] = useState<{
    type: 'individual' | 'team'
    site_entry_asset_id: string
    visit_purpose: string
    visit_category: string
    start_date: string
    end_date: string
    project_id: string
  }>({
    type: 'individual',
    site_entry_asset_id: '',
    visit_purpose: '',
    visit_category: 'project_work',
    start_date: '',
    end_date: '',
    project_id: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      ...form,
      project_id: form.project_id || null,
    }
    await createAds.mutateAsync(payload)
    closeDynamicPanel()
  }

  return (
    <DynamicPanelShell
      title="Nouvel Avis de Sejour"
      subtitle="PaxLog"
      icon={<ClipboardList size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createAds.isPending}
            onClick={() => (document.getElementById('create-ads-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createAds.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-ads-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
        <FormSection title="Type et destination">
          <FormGrid>
            <DynamicPanelField label="Type">
              <TagSelector
                options={[{ value: 'individual', label: 'Individuel' }, { value: 'team', label: 'Équipe' }]}
                value={form.type}
                onChange={(v) => setForm({ ...form, type: v as 'individual' | 'team' })}
              />
            </DynamicPanelField>
            <DynamicPanelField label="Site d'entrée" required>
              <AssetPicker
                value={form.site_entry_asset_id || null}
                onChange={(id) => setForm({ ...form, site_entry_asset_id: id || '' })}
              />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        <FormSection title="Détails de la visite">
          <FormGrid>
            <DynamicPanelField label="Catégorie" required>
              <select value={form.visit_category} onChange={(e) => setForm({ ...form, visit_category: e.target.value })} className={panelInputClass}>
                {VISIT_CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label="Projet associé">
              <select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })} className={panelInputClass}>
                <option value="">— Aucun projet —</option>
                {(projects?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label="Dates" required>
              <DateRangePicker
                startDate={form.start_date || null}
                endDate={form.end_date || null}
                onStartChange={(v) => setForm({ ...form, start_date: v })}
                onEndChange={(v) => setForm({ ...form, end_date: v })}
                required
              />
            </DynamicPanelField>
          </FormGrid>
          <DynamicPanelField label="Objet de la visite" required>
            <textarea required value={form.visit_purpose} onChange={(e) => setForm({ ...form, visit_purpose: e.target.value })} className={cn(panelInputClass, 'min-h-[60px] resize-y')} placeholder="Décrire l'objet de la visite..." />
          </DynamicPanelField>
        </FormSection>

        <p className="text-xs text-muted-foreground italic">
          Les passagers et imputations peuvent être ajoutés après la création, via le panneau de détail.
        </p>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

// ── AdS Detail Panel ──────────────────────────────────────────

function AdsDetailPanel({ id }: { id: string }) {
  const { data: ads, isLoading } = useAds(id)
  const { data: adsPax } = useAdsPax(id)
  const { data: imputations } = useAdsImputations(id)
  const submitAds = useSubmitAds()
  const cancelAds = useCancelAds()
  const approveAds = useApproveAds()
  const rejectAds = useRejectAds()
  const downloadPdf = useAdsPdf()
  const createExtLink = useCreateExternalLink()
  const deleteImputation = useDeleteImputation()
  const addPaxV2 = useAddPaxToAdsV2()
  const removePax = useRemovePaxFromAds()
  const addImputation = useAddImputation()
  const { hasPermission } = usePermission()
  const { data: assetTree = [] } = useAssetTree()
  const { data: projects } = useProjects({ page: 1, page_size: 100 })

  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [paxSearch, setPaxSearch] = useState('')
  const [showPaxPicker, setShowPaxPicker] = useState(false)
  const debouncedPaxSearch = useDebounce(paxSearch, 300)
  const { data: paxCandidates } = usePaxCandidates(debouncedPaxSearch)
  const [showImputationForm, setShowImputationForm] = useState(false)
  const [impForm, setImpForm] = useState({ project_id: '', cost_center_id: '', percentage: 100 })

  // Resolve asset name from tree
  const resolveAssetName = useCallback((assetId: string | null | undefined): string | null => {
    if (!assetId || assetTree.length === 0) return null
    const find = (nodes: AssetTreeNode[]): AssetTreeNode | null => {
      for (const n of nodes) {
        if (n.id === assetId) return n
        const found = find(n.children)
        if (found) return found
      }
      return null
    }
    const asset = find(assetTree)
    return asset ? `${asset.name} (${asset.code})` : null
  }, [assetTree])

  // Imputation total — must be before early return to respect hooks order
  const imputationTotal = useMemo(() => {
    if (!imputations) return 0
    return imputations.reduce((sum, imp) => sum + imp.percentage, 0)
  }, [imputations])

  if (isLoading || !ads) {
    return (
      <DynamicPanelShell title="Chargement..." icon={<ClipboardList size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  const canSubmit = ads.status === 'draft'
  const canCancel = !['cancelled', 'completed', 'rejected'].includes(ads.status)
  const canApprove = ['submitted', 'pending_validation'].includes(ads.status) && hasPermission('paxlog.ads.approve')
  const canReject = ['submitted', 'pending_validation'].includes(ads.status) && hasPermission('paxlog.ads.approve')
  const canDownloadPdf = ['approved', 'in_progress', 'completed'].includes(ads.status)
  const canGenerateLink = ['approved', 'in_progress'].includes(ads.status)

  const handleReject = () => {
    rejectAds.mutate({ id, reason: rejectReason || undefined })
    setShowRejectForm(false)
    setRejectReason('')
  }

  const handleGenerateLink = () => {
    createExtLink.mutate({ adsId: id, payload: { expires_hours: 72, max_uses: 5 } })
  }

  return (
    <DynamicPanelShell
      title={ads.reference}
      subtitle={`AdS — ${VISIT_CATEGORY_OPTIONS.find((o) => o.value === ads.visit_category)?.label || ads.visit_category}`}
      icon={<ClipboardList size={14} className="text-primary" />}
      actions={
        <div className="flex items-center gap-1">
          {canGenerateLink && (
            <PanelActionButton variant="default" disabled={createExtLink.isPending} onClick={handleGenerateLink}>
              {createExtLink.isPending ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />} Lien externe
            </PanelActionButton>
          )}
          {canDownloadPdf && (
            <PanelActionButton variant="default" disabled={downloadPdf.isPending} onClick={() => downloadPdf.mutate(id)}>
              {downloadPdf.isPending ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} PDF
            </PanelActionButton>
          )}
          {canApprove && (
            <PanelActionButton variant="primary" disabled={approveAds.isPending} onClick={() => approveAds.mutate(id)}>
              <ThumbsUp size={12} /> Approuver
            </PanelActionButton>
          )}
          {canReject && !showRejectForm && (
            <PanelActionButton variant="default" onClick={() => setShowRejectForm(true)}>
              <ThumbsDown size={12} /> Rejeter
            </PanelActionButton>
          )}
          {canSubmit && (
            <PanelActionButton variant="primary" disabled={submitAds.isPending} onClick={() => submitAds.mutate(id)}>
              <Send size={12} /> Soumettre
            </PanelActionButton>
          )}
          {canCancel && (
            <DangerConfirmButton
              icon={<XCircle size={12} />}
              onConfirm={() => cancelAds.mutate(id)}
              confirmLabel="Annuler ?"
            >
              Annuler
            </DangerConfirmButton>
          )}
        </div>
      }
    >
      <div className="p-4 space-y-5">
        {/* Reject reason inline form */}
        {showRejectForm && (
          <div className="border border-red-300 rounded-lg bg-red-50 dark:bg-red-900/10 dark:border-red-800 p-3 space-y-2">
            <p className="text-xs font-semibold text-red-700 dark:text-red-400">Motif de rejet</p>
            <textarea
              className="gl-form-input text-xs min-h-[60px]"
              placeholder="Indiquez le motif du rejet (optionnel)..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <button className="gl-button-sm gl-button-danger" disabled={rejectAds.isPending} onClick={handleReject}>
                {rejectAds.isPending ? <Loader2 size={12} className="animate-spin" /> : <ThumbsDown size={12} />}
                Confirmer le rejet
              </button>
              <button className="gl-button-sm gl-button-default" onClick={() => setShowRejectForm(false)}>Annuler</button>
            </div>
          </div>
        )}

        {/* Status badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={ads.status} map={ADS_STATUS_MAP} />
          <span className={cn('gl-badge', ads.type === 'team' ? 'gl-badge-info' : 'gl-badge-neutral')}>
            {ads.type === 'individual' ? 'Individuel' : 'Equipe'}
          </span>
          {ads.cross_company_flag && <span className="gl-badge gl-badge-warning">Cross-company</span>}
        </div>

        {/* Visit details */}
        <CollapsibleSection id="ads-visit" title="Visite" defaultExpanded>
          <div className="space-y-1">
            <ReadOnlyRow label="Objet" value={ads.visit_purpose} />
            <ReadOnlyRow label="Categorie" value={VISIT_CATEGORY_OPTIONS.find((o) => o.value === ads.visit_category)?.label || ads.visit_category} />
            <ReadOnlyRow label="Site" value={
              ads.site_entry_asset_id ? (
                <CrossModuleLink module="assets" id={ads.site_entry_asset_id} label={resolveAssetName(ads.site_entry_asset_id) || ads.site_name || ads.site_entry_asset_id} mode="navigate" />
              ) : (ads.site_name || '—')
            } />
            <ReadOnlyRow label="Dates" value={`${formatDate(ads.start_date)} → ${formatDate(ads.end_date)}`} />
            {ads.requester_name && <ReadOnlyRow label="Demandeur" value={ads.requester_name} />}
            {ads.project_id && (
              <ReadOnlyRow label="Projet" value={
                <CrossModuleLink module="projets" id={ads.project_id} label={ads.project_name || ads.project_id} mode="navigate" />
              } />
            )}
          </div>
        </CollapsibleSection>

        {/* Transport */}
        {(ads.outbound_transport_mode || ads.return_transport_mode) && (
          <CollapsibleSection id="ads-transport" title="Transport" defaultExpanded>
            <div className="space-y-1">
              {ads.outbound_transport_mode && <ReadOnlyRow label="Aller" value={ads.outbound_transport_mode} />}
              {ads.return_transport_mode && <ReadOnlyRow label="Retour" value={ads.return_transport_mode} />}
            </div>
          </CollapsibleSection>
        )}

        {/* PAX list with compliance status + add/remove */}
        <CollapsibleSection id="ads-pax" title={`Passagers (${adsPax?.length || 0})`} defaultExpanded>
          {/* PAX Search & Add — only for draft/review status */}
          {ads && ['draft', 'requires_review'].includes(ads.status) && (
            <div className="mb-3">
              {!showPaxPicker ? (
                <button
                  className="gl-button-sm gl-button-confirm w-full"
                  onClick={() => setShowPaxPicker(true)}
                >
                  <Plus size={12} /> Ajouter un passager
                </button>
              ) : (
                <div className="space-y-2 p-2 rounded-md border border-border bg-card">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        className={cn(panelInputClass, 'pl-7')}
                        placeholder="Rechercher un utilisateur, contact, profil PAX..."
                        value={paxSearch}
                        onChange={(e) => setPaxSearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <button className="p-1 text-muted-foreground hover:text-foreground" onClick={() => { setShowPaxPicker(false); setPaxSearch('') }}>
                      <X size={14} />
                    </button>
                  </div>
                  {paxCandidates && paxCandidates.length > 0 && (
                    <div className="max-h-[200px] overflow-y-auto space-y-0.5">
                      {paxCandidates.map((c: PaxCandidate) => {
                        // Check if already in AdS
                        const alreadyAdded = adsPax?.some((ap: AdsPax) =>
                          (c.user_id && ap.user_id === c.user_id) || (c.contact_id && ap.contact_id === c.contact_id)
                        )
                        return (
                          <button
                            key={`${c.source}-${c.id}`}
                            disabled={alreadyAdded || addPaxV2.isPending}
                            className={cn(
                              'w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left transition-colors',
                              alreadyAdded ? 'opacity-40 cursor-not-allowed' : 'hover:bg-accent/60 cursor-pointer',
                            )}
                            onClick={() => {
                              const body = c.source === 'user'
                                ? { user_id: c.user_id! }
                                : { contact_id: c.contact_id! }
                              addPaxV2.mutate({ adsId: id, body }, {
                                onSuccess: () => setPaxSearch(''),
                              })
                            }}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{c.last_name} {c.first_name}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {c.source === 'pax_profile' ? `Profil PAX${c.badge ? ` • ${c.badge}` : ''}` :
                                  c.source === 'user' ? `Utilisateur${c.email ? ` • ${c.email}` : ''}` :
                                    `Contact${c.position ? ` • ${c.position}` : ''}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={cn('gl-badge text-[9px]', c.type === 'internal' ? 'gl-badge-info' : 'gl-badge-neutral')}>
                                {c.type === 'internal' ? 'Int.' : 'Ext.'}
                              </span>
                              {alreadyAdded ? (
                                <CheckCircle2 size={12} className="text-green-500" />
                              ) : (
                                <Plus size={12} className="text-primary" />
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {paxSearch.length >= 1 && paxCandidates && paxCandidates.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2 italic">Aucun résultat pour « {paxSearch} »</p>
                  )}
                </div>
              )}
            </div>
          )}

          {!adsPax || adsPax.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 italic">Aucun passager. Ajoutez des PAX pour pouvoir soumettre l'AdS.</p>
          ) : (
            <div className="space-y-1">
              {adsPax.map((ap: AdsPax) => (
                <div key={ap.id} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-accent/50 text-xs group">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      {(ap.user_id || ap.contact_id) ? (
                        <CrossModuleLink module="paxlog" id={(ap.user_id || ap.contact_id)!} subtype="profile"
                          label={`${ap.pax_last_name ?? ''} ${ap.pax_first_name ?? ''}`.trim()} showIcon={false} />
                      ) : (
                        <>{ap.pax_last_name ?? ''} {ap.pax_first_name ?? ''}</>
                      )}
                    </p>
                    {ap.pax_badge && <p className="text-[10px] text-muted-foreground">Badge: {ap.pax_badge}</p>}
                    {ap.pax_company_name && <p className="text-[10px] text-muted-foreground">{ap.pax_company_name}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {ap.compliant === true && <CheckCircle2 size={13} className="text-green-600" />}
                    {ap.compliant === false && <XCircle size={13} className="text-red-500" />}
                    <span className={cn('gl-badge', ap.pax_type === 'internal' ? 'gl-badge-info' : 'gl-badge-neutral')}>
                      {ap.pax_type === 'internal' ? 'Int.' : 'Ext.'}
                    </span>
                    <StatusBadge status={ap.status} />
                    {/* Remove button — visible only with paxlog.ads.update permission */}
                    {(ap.user_id || ap.contact_id) && hasPermission('paxlog.ads.update') && (
                      <button
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        onClick={() => removePax.mutate({ adsId: id, entryId: ap.id })}
                        title="Retirer ce passager"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* Cost Imputations */}
        <CollapsibleSection id="ads-imputations" title={`Imputations (${imputations?.length || 0})`} defaultExpanded>
          {/* Add imputation form */}
          {ads && ['draft', 'requires_review'].includes(ads.status) && (
            <div className="mb-3">
              {!showImputationForm ? (
                <button className="gl-button-sm gl-button-confirm w-full" onClick={() => setShowImputationForm(true)}>
                  <Plus size={12} /> Ajouter une imputation
                </button>
              ) : (
                <div className="space-y-2 p-2 rounded-md border border-border bg-card">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground">Projet</label>
                      <select className={panelInputClass} value={impForm.project_id} onChange={(e) => setImpForm({ ...impForm, project_id: e.target.value })}>
                        <option value="">— Projet —</option>
                        {(projects?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground">Centre de coût</label>
                      <input className={panelInputClass} value={impForm.cost_center_id} onChange={(e) => setImpForm({ ...impForm, cost_center_id: e.target.value })} placeholder="ID centre de coût" />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground">%</label>
                      <input type="number" className={panelInputClass} value={impForm.percentage} onChange={(e) => setImpForm({ ...impForm, percentage: Number(e.target.value) })} min={1} max={100} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    <button className="gl-button-sm" onClick={() => setShowImputationForm(false)}>Annuler</button>
                    <button
                      className="gl-button-sm gl-button-confirm"
                      disabled={!impForm.project_id || !impForm.cost_center_id || addImputation.isPending}
                      onClick={() => {
                        addImputation.mutate({ adsId: id, payload: impForm }, {
                          onSuccess: () => { setShowImputationForm(false); setImpForm({ project_id: '', cost_center_id: '', percentage: 100 }) },
                        })
                      }}
                    >
                      {addImputation.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Ajouter'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!imputations || imputations.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 italic">Aucune imputation de coût.</p>
          ) : (
            <div className="space-y-1">
              {/* Imputation table header */}
              <div className="grid grid-cols-4 gap-2 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <span>Projet</span>
                <span>Centre de cout</span>
                <span className="text-right">%</span>
                <span></span>
              </div>
              {imputations.map((imp: AdsImputation) => (
                <div key={imp.id} className="grid grid-cols-4 gap-2 px-2 py-1.5 rounded hover:bg-accent/50 text-xs items-center">
                  <span className="truncate">{imp.project_id
                    ? <CrossModuleLink module="projets" id={imp.project_id} label={imp.project_name || imp.project_id} showIcon={false} className="text-xs" />
                    : <span className="text-foreground">{imp.project_name || '--'}</span>
                  }</span>
                  <span className="text-muted-foreground truncate">{imp.cost_center_name || imp.cost_center_id}</span>
                  <span className="text-foreground text-right tabular-nums font-medium">{imp.percentage}%</span>
                  <div className="flex justify-end">
                    {ads.status === 'draft' && (
                      <button
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteImputation.mutate({ adsId: id, imputationId: imp.id })}
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {/* Total row */}
              <div className="grid grid-cols-4 gap-2 px-2 py-1.5 border-t border-border text-xs">
                <span className="font-semibold text-foreground col-span-2">Total</span>
                <span className={cn('text-right tabular-nums font-semibold', imputationTotal === 100 ? 'text-green-600' : 'text-destructive')}>
                  {imputationTotal}%
                </span>
                <span></span>
              </div>
              {imputationTotal !== 100 && (
                <p className="text-[10px] text-destructive px-2">Le total des imputations doit etre egal a 100%.</p>
              )}
            </div>
          )}
        </CollapsibleSection>

        {/* Workflow timeline */}
        <CollapsibleSection id="ads-history" title="Historique">
          <div className="space-y-1">
            <ReadOnlyRow label="Cree le" value={formatDate(ads.created_at)} />
            {ads.submitted_at && <ReadOnlyRow label="Soumis le" value={formatDate(ads.submitted_at)} />}
            {ads.approved_at && (
              <div className="flex items-center gap-1.5 px-2 py-1">
                <CheckCircle2 size={12} className="text-green-600 shrink-0" />
                <span className="text-xs text-green-700 dark:text-green-400 font-medium">Approuve le {formatDate(ads.approved_at)}</span>
              </div>
            )}
            {ads.rejected_at && (
              <div className="px-2 py-1 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <XCircle size={12} className="text-red-600 shrink-0" />
                  <span className="text-xs text-red-700 dark:text-red-400 font-medium">Rejete le {formatDate(ads.rejected_at)}</span>
                </div>
                {ads.rejection_reason && <p className="text-xs text-muted-foreground pl-5">{ads.rejection_reason}</p>}
              </div>
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="ads-tags-notes" title="Tags, notes & fichiers">
          <div className="space-y-3 p-3">
            <TagManager ownerType="ads" ownerId={ads.id} compact />
            <AttachmentManager ownerType="ads" ownerId={ads.id} compact />
            <NoteManager ownerType="ads" ownerId={ads.id} compact />
          </div>
        </CollapsibleSection>
      </div>
    </DynamicPanelShell>
  )
}

// ── Create Incident Panel ─────────────────────────────────────

function CreateIncidentPanel() {
  const { t } = useTranslation()
  const createIncident = useCreatePaxIncident()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)

  const [paxSearch, setPaxSearch] = useState('')
  const { data: paxData, isLoading: paxLoading } = usePaxProfiles({ page: 1, page_size: 20, search: paxSearch || undefined })

  const [form, setForm] = useState<{
    severity: 'info' | 'warning' | 'temp_ban' | 'permanent_ban'
    description: string
    incident_date: string
    user_id: string | null
    contact_id: string | null
    pax_display: string | null
    ban_start_date: string | null
    ban_end_date: string | null
  }>({
    severity: 'warning',
    description: '',
    incident_date: new Date().toISOString().split('T')[0],
    user_id: null,
    contact_id: null,
    pax_display: null,
    ban_start_date: null,
    ban_end_date: null,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createIncident.mutateAsync({
      severity: form.severity,
      description: form.description,
      incident_date: form.incident_date,
      user_id: form.user_id || null,
      contact_id: form.contact_id || null,
      ban_start_date: form.ban_start_date || null,
      ban_end_date: form.ban_end_date || null,
    })
    closeDynamicPanel()
  }

  const showBanDates = form.severity === 'temp_ban' || form.severity === 'permanent_ban'

  return (
    <DynamicPanelShell
      title="Nouveau signalement"
      subtitle="PaxLog — Signalements"
      icon={<AlertTriangle size={14} className="text-destructive" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createIncident.isPending}
            onClick={() => (document.getElementById('create-incident-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createIncident.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-incident-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
        <FormSection title="Severite">
          <TagSelector
            options={SEVERITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={form.severity}
            onChange={(v) => setForm({ ...form, severity: v as typeof form.severity })}
          />
        </FormSection>

        <FormSection title="PAX concerne">
          <SearchablePicker
            label="Profil PAX"
            icon={<User size={12} className="text-muted-foreground" />}
            items={paxData?.items || []}
            isLoading={paxLoading}
            searchValue={paxSearch}
            onSearchChange={setPaxSearch}
            renderItem={(p) => <>{p.last_name} {p.first_name} {p.company_name ? <span className="text-muted-foreground">— {p.company_name}</span> : ''}</>}
            selectedId={form.user_id || form.contact_id}
            onSelect={(p) => {
              const isUser = p.pax_source === 'user' || p.pax_type === 'internal'
              setForm({ ...form, user_id: isUser ? p.id : null, contact_id: isUser ? null : p.id, pax_display: `${p.last_name} ${p.first_name}` })
            }}
            onClear={() => setForm({ ...form, user_id: null, contact_id: null, pax_display: null })}
            placeholder="Rechercher un PAX..."
          />
        </FormSection>

        <FormSection title="Details">
          <DynamicPanelField label="Date de l'incident" required>
            <input type="date" required value={form.incident_date} onChange={(e) => setForm({ ...form, incident_date: e.target.value })} className={panelInputClass} />
          </DynamicPanelField>
          <DynamicPanelField label="Description" required>
            <textarea required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={cn(panelInputClass, 'min-h-[80px] resize-y')} placeholder="Decrire l'incident..." />
          </DynamicPanelField>
        </FormSection>

        {showBanDates && (
          <FormSection title="Periode de ban">
            {form.severity === 'temp_ban' ? (
              <DateRangePicker
                startDate={form.ban_start_date || null}
                endDate={form.ban_end_date || null}
                onStartChange={(v) => setForm({ ...form, ban_start_date: v || null })}
                onEndChange={(v) => setForm({ ...form, ban_end_date: v || null })}
                startLabel="Debut du ban"
                endLabel="Fin du ban"
              />
            ) : (
              <DynamicPanelField label="Debut du ban">
                <input type="date" value={form.ban_start_date || ''} onChange={(e) => setForm({ ...form, ban_start_date: e.target.value || null })} className={panelInputClass} />
              </DynamicPanelField>
            )}
          </FormSection>
        )}
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

// ── Create Rotation Panel ─────────────────────────────────────

function CreateRotationPanel() {
  const { t } = useTranslation()
  const createRotation = useCreateRotationCycle()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)

  const [paxSearch, setPaxSearch] = useState('')
  const { data: paxData, isLoading: paxLoading } = usePaxProfiles({ page: 1, page_size: 20, search: paxSearch || undefined })

  const [form, setForm] = useState({
    user_id: null as string | null,
    contact_id: null as string | null,
    site_asset_id: '',
    days_on: 28,
    days_off: 28,
    start_date: new Date().toISOString().split('T')[0],
    notes: '' as string,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.user_id && !form.contact_id) return
    await createRotation.mutateAsync({
      user_id: form.user_id,
      contact_id: form.contact_id,
      site_asset_id: form.site_asset_id,
      days_on: form.days_on,
      days_off: form.days_off,
      start_date: form.start_date,
      notes: form.notes || undefined,
    })
    closeDynamicPanel()
  }

  return (
    <DynamicPanelShell
      title="Nouveau cycle de rotation"
      subtitle="PaxLog — Rotations"
      icon={<RefreshCw size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createRotation.isPending || (!form.user_id && !form.contact_id)}
            onClick={() => (document.getElementById('create-rotation-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createRotation.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-rotation-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
        <FormSection title="PAX">
          <SearchablePicker
            label="Profil PAX"
            icon={<User size={12} className="text-muted-foreground" />}
            items={paxData?.items || []}
            isLoading={paxLoading}
            searchValue={paxSearch}
            onSearchChange={setPaxSearch}
            renderItem={(p) => <>{p.last_name} {p.first_name}</>}
            selectedId={form.user_id || form.contact_id}
            onSelect={(p) => {
              const isUser = p.pax_source === 'user' || p.pax_type === 'internal'
              setForm({ ...form, user_id: isUser ? p.id : null, contact_id: isUser ? null : p.id })
            }}
            onClear={() => setForm({ ...form, user_id: null, contact_id: null })}
            placeholder="Rechercher un PAX..."
          />
        </FormSection>

        <FormSection title="Site">
          <DynamicPanelField label="Site" required>
            <AssetPicker
              value={form.site_asset_id || null}
              onChange={(id) => setForm({ ...form, site_asset_id: id || '' })}
              label="Site"
            />
          </DynamicPanelField>
        </FormSection>

        <FormSection title="Cycle">
          <FormGrid>
            <DynamicPanelField label="Jours on" required>
              <input type="number" required min={1} value={form.days_on} onChange={(e) => setForm({ ...form, days_on: parseInt(e.target.value) || 28 })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Jours off" required>
              <input type="number" required min={1} value={form.days_off} onChange={(e) => setForm({ ...form, days_off: parseInt(e.target.value) || 28 })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <DynamicPanelField label="Date de debut" required>
            <input type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={panelInputClass} />
          </DynamicPanelField>
        </FormSection>

        <FormSection title="Notes">
          <DynamicPanelField label="Notes">
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={cn(panelInputClass, 'min-h-[60px] resize-y')} placeholder="Notes optionnelles..." />
          </DynamicPanelField>
        </FormSection>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}


// ═══════════════════════════════════════════════════════════════
// TAB 7: MISSIONS (AVM)
// ═══════════════════════════════════════════════════════════════

function AvmTab({ openDetail }: { openDetail: (id: string) => void }) {
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState('')

  const { data, isLoading } = useAvmList({
    page,
    page_size: pageSize,
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
  })

  const avmColumns = useMemo<ColumnDef<MissionNoticeSummary, unknown>[]>(() => [
    {
      accessorKey: 'reference',
      header: 'Reference',
      cell: ({ row }) => (
        <button className="font-medium text-primary hover:underline text-xs" onClick={() => openDetail(row.original.id)}>
          {row.original.reference}
        </button>
      ),
      size: 140,
    },
    {
      accessorKey: 'title',
      header: 'Titre',
      cell: ({ row }) => <span className="text-xs text-foreground truncate max-w-[200px] block">{row.original.title}</span>,
    },
    {
      id: 'creator',
      header: 'Createur',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.creator_name || '—'}</span>,
      size: 130,
    },
    {
      id: 'dates',
      header: 'Dates',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDateShort(row.original.planned_start_date)} {'—'} {formatDateShort(row.original.planned_end_date)}
        </span>
      ),
      size: 180,
    },
    {
      id: 'pax_count',
      header: 'PAX',
      cell: ({ row }) => <span className="text-xs text-foreground tabular-nums">{row.original.pax_count}</span>,
      size: 60,
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      cell: ({ row }) => <StatusBadge status={row.original.status} map={AVM_STATUS_MAP} />,
      size: 120,
    },
    {
      id: 'preparation',
      header: 'Preparation %',
      cell: ({ row }) => <CompletenessBar value={row.original.preparation_progress} />,
      size: 110,
    },
  ], [openDetail])

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <div className="flex items-center gap-1">
          {AVM_STATUS_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => { setStatusFilter(opt.value); setPage(1) }}
              className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap', statusFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {opt.label}
            </button>
          ))}
        </div>
        {data && <span className="text-xs text-muted-foreground ml-auto">{data.total} missions</span>}
      </div>

      <PanelContent>
        <DataTable<MissionNoticeSummary>
          columns={avmColumns}
          data={data?.items || []}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder="Rechercher par reference, titre..."
          emptyIcon={Briefcase}
          emptyTitle="Aucun avis de mission"
          onRowClick={(row) => openDetail(row.id)}
          storageKey="paxlog-avm"
        />
      </PanelContent>
    </>
  )
}


// ── Create AVM Panel ─────────────────────────────────────────

function CreateAvmPanel() {
  const { t } = useTranslation()
  const createAvm = useCreateAvm()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)

  const [form, setForm] = useState({
    title: '',
    description: '',
    planned_start_date: '',
    planned_end_date: '',
    mission_type: 'standard' as 'standard' | 'vip' | 'regulatory' | 'emergency',
    requires_badge: false,
    requires_epi: false,
    requires_visa: false,
    eligible_displacement_allowance: false,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createAvm.mutateAsync({
      title: form.title,
      description: form.description || undefined,
      planned_start_date: form.planned_start_date || undefined,
      planned_end_date: form.planned_end_date || undefined,
      mission_type: form.mission_type,
      requires_badge: form.requires_badge,
      requires_epi: form.requires_epi,
      requires_visa: form.requires_visa,
      eligible_displacement_allowance: form.eligible_displacement_allowance,
    })
    closeDynamicPanel()
  }

  return (
    <DynamicPanelShell
      title="Nouvel avis de mission"
      subtitle="PaxLog — Missions (AVM)"
      icon={<Briefcase size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createAvm.isPending || !form.title}
            onClick={() => (document.getElementById('create-avm-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createAvm.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-avm-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
        <FormSection title="Mission">
          <FormGrid>
            <DynamicPanelField label="Titre" required>
              <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={panelInputClass} placeholder="Ex: Mission E-LINE ESF1" />
            </DynamicPanelField>
            <DynamicPanelField label="Type de mission">
              <select value={form.mission_type} onChange={(e) => setForm({ ...form, mission_type: e.target.value as typeof form.mission_type })} className={panelInputClass}>
                {AVM_MISSION_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </DynamicPanelField>
          </FormGrid>
          <DynamicPanelField label="Description">
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={cn(panelInputClass, 'min-h-[60px] resize-y')} placeholder="Description de la mission..." />
          </DynamicPanelField>
        </FormSection>

        <FormSection title="Dates prévues">
          <DateRangePicker
            startDate={form.planned_start_date || null}
            endDate={form.planned_end_date || null}
            onStartChange={(v) => setForm({ ...form, planned_start_date: v })}
            onEndChange={(v) => setForm({ ...form, planned_end_date: v })}
            startLabel="Départ"
            endLabel="Retour"
          />
        </FormSection>

        <FormSection title="Indicateurs de préparation">
          <FormGrid>
            {[
              { key: 'requires_visa' as const, label: 'Visa requis' },
              { key: 'requires_badge' as const, label: 'Badge site requis' },
              { key: 'requires_epi' as const, label: 'EPI requis' },
              { key: 'eligible_displacement_allowance' as const, label: 'Indemnité de déplacement' },
            ].map((opt) => (
              <label key={opt.key} className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={form[opt.key]}
                  onChange={(e) => setForm({ ...form, [opt.key]: e.target.checked })}
                  className="rounded border-border"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </FormGrid>
        </FormSection>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}


// ── AVM Detail Panel ─────────────────────────────────────────

function AvmDetailPanel({ id }: { id?: string }) {
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const submitAvmMut = useSubmitAvm()
  const approveAvmMut = useApproveAvm()
  const cancelAvmMut = useCancelAvm()

  const { data: avm, isLoading } = useAvm(id || '')

  if (!id || isLoading) {
    return (
      <DynamicPanelShell title="Chargement..." icon={<Briefcase size={14} className="text-primary" />}>
        <PanelContent><div className="flex items-center justify-center p-8"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div></PanelContent>
      </DynamicPanelShell>
    )
  }
  if (!avm) {
    return (
      <DynamicPanelShell title="AVM introuvable" icon={<Briefcase size={14} className="text-primary" />}>
        <PanelContent><p className="p-4 text-sm text-muted-foreground">Avis de mission introuvable.</p></PanelContent>
      </DynamicPanelShell>
    )
  }

  const canSubmit = avm.status === 'draft'
  const canApprove = avm.status === 'in_preparation'
  const canCancel = !['completed', 'cancelled'].includes(avm.status)

  return (
    <DynamicPanelShell
      title={avm.reference}
      subtitle={avm.title}
      icon={<Briefcase size={14} className="text-primary" />}
      actions={
        <>
          {canSubmit && (
            <PanelActionButton
              variant="primary"
              disabled={submitAvmMut.isPending}
              onClick={() => submitAvmMut.mutate(avm.id)}
            >
              {submitAvmMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <><Send size={12} /> Soumettre</>}
            </PanelActionButton>
          )}
          {canApprove && (
            <PanelActionButton
              variant="primary"
              disabled={approveAvmMut.isPending}
              onClick={() => approveAvmMut.mutate(avm.id)}
            >
              {approveAvmMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <><CheckCircle2 size={12} /> Approuver</>}
            </PanelActionButton>
          )}
          {canCancel && (
            <PanelActionButton
              onClick={() => cancelAvmMut.mutate({ id: avm.id })}
              disabled={cancelAvmMut.isPending}
            >
              {cancelAvmMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <><XCircle size={12} /> Annuler</>}
            </PanelActionButton>
          )}
        </>
      }
    >
      <div className="p-4 space-y-5">
        {/* Info section */}
        <CollapsibleSection id="avm-info" title="Informations" defaultExpanded>
          <div className="space-y-2">
            <ReadOnlyRow label="Reference" value={avm.reference} />
            <ReadOnlyRow label="Titre" value={avm.title} />
            <ReadOnlyRow label="Statut" value={<StatusBadge status={avm.status} map={AVM_STATUS_MAP} />} />
            <ReadOnlyRow label="Type de mission" value={AVM_MISSION_TYPE_OPTIONS.find((o: { value: string; label: string }) => o.value === avm.mission_type)?.label || avm.mission_type} />
            <ReadOnlyRow label="Createur" value={avm.creator_name || '—'} />
            <ReadOnlyRow label="Dates prevues" value={`${formatDateShort(avm.planned_start_date)} — ${formatDateShort(avm.planned_end_date)}`} />
            {avm.description && <ReadOnlyRow label="Description" value={avm.description} />}
            {avm.cancellation_reason && <ReadOnlyRow label="Motif annulation" value={avm.cancellation_reason} />}
          </div>
        </CollapsibleSection>

        {/* Indicators */}
        <CollapsibleSection id="avm-indicators" title="Indicateurs de preparation" defaultExpanded>
          <div className="space-y-1">
            {[
              { flag: avm.requires_visa, label: 'Visa requis' },
              { flag: avm.requires_badge, label: 'Badge site requis' },
              { flag: avm.requires_epi, label: 'EPI requis' },
              { flag: avm.eligible_displacement_allowance, label: 'Indemnite de deplacement' },
            ].map((ind) => (
              <div key={ind.label} className="flex items-center gap-2 text-xs">
                <span className={cn('w-4 h-4 rounded flex items-center justify-center text-[10px]', ind.flag ? 'bg-green-100 dark:bg-green-900/30 text-green-700' : 'bg-muted text-muted-foreground')}>
                  {ind.flag ? '✓' : '–'}
                </span>
                <span className={ind.flag ? 'text-foreground' : 'text-muted-foreground'}>{ind.label}</span>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        {/* Preparation checklist */}
        <CollapsibleSection id="avm-preparation" title={`Preparation (${avm.preparation_progress}%)`} defaultExpanded>
          <div className="mb-2">
            <CompletenessBar value={avm.preparation_progress} />
          </div>
          {avm.preparation_tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Aucune tache de preparation. Soumettez l&apos;AVM pour generer la checklist.</p>
          ) : (
            <div className="space-y-1.5">
              {avm.preparation_tasks.map((task) => {
                const taskStatusColors: Record<string, string> = {
                  pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700',
                  in_progress: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700',
                  completed: 'bg-green-100 dark:bg-green-900/30 text-green-700',
                  cancelled: 'bg-muted text-muted-foreground',
                  blocked: 'bg-red-100 dark:bg-red-900/30 text-red-700',
                  na: 'bg-muted text-muted-foreground',
                }
                return (
                  <div key={task.id} className="flex items-center gap-2 text-xs">
                    <span className={cn('w-2 h-2 rounded-full shrink-0', task.status === 'completed' ? 'bg-green-500' : task.status === 'pending' ? 'bg-amber-500' : task.status === 'in_progress' ? 'bg-blue-500' : 'bg-muted-foreground')} />
                    <span className={cn('flex-1', task.status === 'cancelled' ? 'line-through text-muted-foreground' : 'text-foreground')}>{task.title}</span>
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', taskStatusColors[task.status] || 'bg-muted text-muted-foreground')}>
                      {task.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </CollapsibleSection>

        {/* Program lines */}
        <CollapsibleSection id="avm-programs" title={`Programme (${avm.programs.length} lignes)`} defaultExpanded>
          {avm.programs.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Aucune ligne de programme definie.</p>
          ) : (
            <div className="space-y-2">
              {avm.programs.map((prog: MissionProgramRead, idx: number) => (
                <div key={prog.id} className="rounded border border-border p-2.5 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-muted-foreground bg-muted rounded px-1.5 py-0.5">{idx + 1}</span>
                    <span className="text-xs font-medium text-foreground flex-1 truncate">{prog.activity_description}</span>
                    <span className="text-[10px] text-muted-foreground capitalize">{prog.activity_type}</span>
                  </div>
                  {prog.site_name && <div className="text-[11px] text-muted-foreground">Site : {prog.site_name}</div>}
                  {(prog.planned_start_date || prog.planned_end_date) && (
                    <div className="text-[11px] text-muted-foreground tabular-nums">{formatDateShort(prog.planned_start_date)} — {formatDateShort(prog.planned_end_date)}</div>
                  )}
                  {(prog.pax_entries?.length || 0) > 0 && <div className="text-[11px] text-muted-foreground">{prog.pax_entries.length} PAX</div>}
                  {prog.generated_ads_id && (
                    <button
                      className="text-[11px] text-primary hover:underline flex items-center gap-1"
                      onClick={() => openDynamicPanel({ type: 'detail', module: 'paxlog', id: prog.generated_ads_id!, meta: { subtype: 'ads' } })}
                    >
                      <Link2 size={10} /> AdS generee
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* Metadata */}
        <CollapsibleSection id="avm-metadata" title="Metadonnees">
          <div className="space-y-1">
            <ReadOnlyRow label="Cree le" value={formatDate(avm.created_at)} />
            <ReadOnlyRow label="Mis a jour le" value={formatDate(avm.updated_at)} />
          </div>
        </CollapsibleSection>
      </div>
    </DynamicPanelShell>
  )
}


// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════

export function PaxLogPage() {
  const [activeTab, setActiveTab] = useState<MainTabId>('dashboard')
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'paxlog'

  const handleCreate = useCallback(() => {
    if (activeTab === 'profiles') openDynamicPanel({ type: 'create', module: 'paxlog', meta: { subtype: 'profile' } })
    else if (activeTab === 'ads') openDynamicPanel({ type: 'create', module: 'paxlog', meta: { subtype: 'ads' } })
    else if (activeTab === 'signalements') openDynamicPanel({ type: 'create', module: 'paxlog', meta: { subtype: 'incident' } })
    else if (activeTab === 'rotations') openDynamicPanel({ type: 'create', module: 'paxlog', meta: { subtype: 'rotation' } })
    else if (activeTab === 'avm') openDynamicPanel({ type: 'create', module: 'paxlog', meta: { subtype: 'avm' } })
  }, [activeTab, openDynamicPanel])

  const handleOpenDetail = useCallback((id: string) => {
    if (activeTab === 'profiles') openDynamicPanel({ type: 'detail', module: 'paxlog', id, meta: { subtype: 'profile' } })
    else if (activeTab === 'ads') openDynamicPanel({ type: 'detail', module: 'paxlog', id, meta: { subtype: 'ads' } })
    else if (activeTab === 'avm') openDynamicPanel({ type: 'detail', module: 'paxlog', id, meta: { subtype: 'avm' } })
  }, [activeTab, openDynamicPanel])

  const createLabel = activeTab === 'profiles' ? 'Nouveau profil'
    : activeTab === 'ads' ? 'Nouvel AdS'
    : activeTab === 'signalements' ? 'Nouveau signalement'
    : activeTab === 'rotations' ? 'Nouvelle rotation'
    : activeTab === 'avm' ? 'Nouvelle mission'
    : ''
  const showCreate = ['profiles', 'ads', 'signalements', 'rotations', 'avm'].includes(activeTab)

  return (
    <div className="flex h-full">
      {!isFullPanel && (
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <PanelHeader icon={Users} title="PaxLog" subtitle="Gestion des passagers et avis de sejour">
            {showCreate && <ToolbarButton icon={Plus} label={createLabel} variant="primary" onClick={handleCreate} />}
          </PanelHeader>

          {/* Tab bar */}
          <div className="flex items-center gap-1 border-b border-border px-3.5 h-9 shrink-0 overflow-x-auto">
            {MAIN_TABS.map((tab) => {
              const Icon = tab.icon
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                    activeTab === tab.id ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                  )}>
                  <Icon size={12} />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {activeTab === 'dashboard' && <DashboardTab />}
          {activeTab === 'ads' && <AdsTab openDetail={handleOpenDetail} />}
          {activeTab === 'profiles' && <ProfilesTab openDetail={handleOpenDetail} />}
          {activeTab === 'compliance' && <ComplianceTab />}
          {activeTab === 'signalements' && <SignalementsTab />}
          {activeTab === 'rotations' && <RotationsTab />}
          {activeTab === 'avm' && <AvmTab openDetail={handleOpenDetail} />}
        </div>
      )}

      {/* Dynamic panels */}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'profile' && <CreateProfilePanel />}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'ads' && <CreateAdsPanel />}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'incident' && <CreateIncidentPanel />}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'rotation' && <CreateRotationPanel />}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'avm' && <CreateAvmPanel />}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'profile' && <ProfileDetailPanel id={dynamicPanel.id} />}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'ads' && <AdsDetailPanel id={dynamicPanel.id} />}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'avm' && <AvmDetailPanel id={dynamicPanel.id} />}
    </div>
  )
}

// ── Panel renderer registration ───────────────────────────────
registerPanelRenderer('paxlog', (view) => {
  if (view.type === 'create') {
    if (view.meta?.subtype === 'profile') return <CreateProfilePanel />
    if (view.meta?.subtype === 'ads') return <CreateAdsPanel />
    if (view.meta?.subtype === 'incident') return <CreateIncidentPanel />
    if (view.meta?.subtype === 'rotation') return <CreateRotationPanel />
    if (view.meta?.subtype === 'avm') return <CreateAvmPanel />
  }
  if (view.type === 'detail' && 'id' in view) {
    if (view.meta?.subtype === 'profile') return <ProfileDetailPanel id={view.id} />
    if (view.meta?.subtype === 'ads') return <AdsDetailPanel id={view.id} />
    if (view.meta?.subtype === 'avm') return <AvmDetailPanel id={view.id} />
  }
  return null
})
