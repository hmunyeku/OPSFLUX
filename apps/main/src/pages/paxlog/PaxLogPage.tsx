/**
 * PaxLog page — PAX management, Avis de Sejour, Credentials, Compliance,
 * Signalements, Rotations.
 *
 * Static Panel: tab bar + DataTable per tab.
 * Dynamic Panel: create/detail forms with company/user pickers.
 * Each tab manages its own search via DataTable visual query bar.
 */
import { useState, useCallback, useMemo, useEffect } from 'react'
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
  LogOut,
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
  ArrowLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { normalizeNames } from '@/lib/normalize'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { paxlogService } from '@/services/paxlogService'
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
  DetailFieldGrid,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { TagManager } from '@/components/shared/TagManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { ModuleDashboard } from '@/components/dashboard/ModuleDashboard'
import { useToast } from '@/components/ui/Toast'
import { useUIStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import {
  usePaxProfiles,
  usePaxGroups,
  usePaxProfile,
  usePaxProfileSitePresenceHistory,
  useCreatePaxProfile,
  useUpdatePaxProfile,
  usePaxCredentials,
  useCredentialTypes,
  useAdsList,
  useAds,
  useCreateAds,
  useUpdateAds,
  useSubmitAds,
  useCancelAds,
  useStartAdsProgress,
  useApproveAds,
  useDecideAdsPax,
  useRejectAds,
  useRequestAdsStayChange,
  useRequestReviewAds,
  useResubmitAds,
  useCompleteAds,
  useManualDepartureAds,
  useAdsEvents,
  useAdsPdf,
  useAdsPax,
  useAdsImputationSuggestion,
  useAdsExternalLinks,
  useCreateExternalLink,
  usePaxIncidents,
  useCreatePaxIncident,
  useResolvePaxIncident,
  useRotationCycles,
  useCreateRotationCycle,
  useEndRotationCycle,
  useStayPrograms,
  useCreateStayProgram,
  useSubmitStayProgram,
  useApproveStayProgram,
  useComplianceStats,
  useExpiringCredentials,
  useComplianceMatrix,
  useAvmList,
  useAvm,
  useCreateAvm,
  useModifyAvm,
  useSubmitAvm,
  useApproveAvm,
  useCompleteAvm,
  useCancelAvm,
  useUpdateAvmPreparationTask,
  useUpdateAvmVisaFollowup,
  useUpdateAvmAllowanceRequest,
  useAddPaxToAdsV2,
  useRemovePaxFromAds,
  usePaxCandidates,
} from '@/hooks/usePaxlog'
import { useTiers } from '@/hooks/useTiers'
import { useUsers } from '@/hooks/useUsers'
import { useAssetTree } from '@/hooks/useAssets'
import type { AssetTreeNode } from '@/types/api'
import { usePermission } from '@/hooks/usePermission'
import { useDictionaryLabels, useDictionaryOptions } from '@/hooks/useDictionary'
import { useProjects } from '@/hooks/useProjets'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { ImputationManager } from '@/components/shared/ImputationManager'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { AdsExternalLinksAudit } from '@/pages/paxlog/components/AdsExternalLinksAudit'
import type {
  PaxProfileSummary,
  AdsSummary,
  AdsStayChangeRequest,
  PaxIncident,
  PaxCredential,
  CredentialType,
  RotationCycle,
  StayProgramCreate,
  ExpiringCredential,
  AdsPax,
  ComplianceMatrixEntry,
  MissionNoticeSummary,
  MissionNoticeModifyRequest,
  MissionPreparationTaskUpdate,
  MissionVisaFollowupUpdate,
  MissionAllowanceRequestUpdate,
  MissionProgramRead,
  PaxCandidate,
  PaxSitePresence,
} from '@/services/paxlogService'

// ── Constants ──────────────────────────────────────────────────

const PAX_STATUS_OPTIONS = [
  { value: '', labelKey: 'common.all' },
  { value: 'active', labelKey: 'paxlog.status.generic.active' },
  { value: 'incomplete', labelKey: 'paxlog.status.generic.incomplete' },
  { value: 'suspended', labelKey: 'paxlog.status.generic.suspended' },
  { value: 'archived', labelKey: 'paxlog.status.generic.archived' },
]

const ADS_STATUS_OPTIONS = [
  { value: '', labelKey: 'common.all' },
  { value: 'draft', labelKey: 'paxlog.status.ads.draft' },
  { value: 'submitted', labelKey: 'paxlog.status.ads.submitted' },
  { value: 'pending_compliance', labelKey: 'paxlog.status.ads.pending_compliance' },
  { value: 'pending_validation', labelKey: 'paxlog.status.ads.pending_validation' },
  { value: 'approved', labelKey: 'paxlog.status.ads.approved' },
  { value: 'rejected', labelKey: 'paxlog.status.ads.rejected' },
  { value: 'in_progress', labelKey: 'paxlog.status.ads.in_progress' },
  { value: 'completed', labelKey: 'paxlog.status.ads.completed' },
  { value: 'cancelled', labelKey: 'paxlog.status.ads.cancelled' },
]

const ADS_STATUS_MAP: Record<string, { labelKey: string; badge: string }> = {
  draft: { labelKey: 'paxlog.status.ads.draft', badge: 'gl-badge-neutral' },
  submitted: { labelKey: 'paxlog.status.ads.submitted', badge: 'gl-badge-info' },
  pending_compliance: { labelKey: 'paxlog.status.ads.pending_compliance', badge: 'gl-badge-warning' },
  pending_validation: { labelKey: 'paxlog.status.ads.pending_validation', badge: 'gl-badge-warning' },
  approved: { labelKey: 'paxlog.status.ads.approved', badge: 'gl-badge-success' },
  rejected: { labelKey: 'paxlog.status.ads.rejected', badge: 'gl-badge-danger' },
  cancelled: { labelKey: 'paxlog.status.ads.cancelled', badge: 'gl-badge-neutral' },
  requires_review: { labelKey: 'paxlog.status.ads.requires_review', badge: 'gl-badge-info' },
  in_progress: { labelKey: 'paxlog.status.ads.in_progress', badge: 'gl-badge-success' },
  completed: { labelKey: 'paxlog.status.ads.completed', badge: 'gl-badge-success' },
}

const SEVERITY_COLOR_MAP: Record<string, string> = {
  info: 'gl-badge-info',
  warning: 'gl-badge-warning',
  site_ban: 'gl-badge-danger',
  temp_ban: 'gl-badge-danger',
  permanent_ban: 'gl-badge-danger',
}

const ROTATION_STATUS_MAP: Record<string, { labelKey: string; badge: string }> = {
  active: { labelKey: 'paxlog.status.rotation.active', badge: 'gl-badge-success' },
  paused: { labelKey: 'paxlog.status.rotation.paused', badge: 'gl-badge-warning' },
  completed: { labelKey: 'paxlog.status.rotation.completed', badge: 'gl-badge-neutral' },
}

const AVM_STATUS_OPTIONS = [
  { value: '', labelKey: 'common.all' },
  { value: 'draft', labelKey: 'paxlog.status.avm.draft' },
  { value: 'in_preparation', labelKey: 'paxlog.status.avm.in_preparation' },
  { value: 'active', labelKey: 'paxlog.status.avm.active' },
  { value: 'ready', labelKey: 'paxlog.status.avm.ready' },
  { value: 'completed', labelKey: 'paxlog.status.avm.completed' },
  { value: 'cancelled', labelKey: 'paxlog.status.avm.cancelled' },
]

const AVM_STATUS_MAP: Record<string, { labelKey: string; badge: string }> = {
  draft: { labelKey: 'paxlog.status.avm.draft', badge: 'gl-badge-neutral' },
  in_preparation: { labelKey: 'paxlog.status.avm.in_preparation', badge: 'gl-badge-warning' },
  active: { labelKey: 'paxlog.status.avm.active', badge: 'gl-badge-info' },
  ready: { labelKey: 'paxlog.status.avm.ready', badge: 'gl-badge-success' },
  completed: { labelKey: 'paxlog.status.avm.completed', badge: 'gl-badge-success' },
  cancelled: { labelKey: 'paxlog.status.avm.cancelled', badge: 'gl-badge-neutral' },
}

const ALL_TABS = [
  { id: 'dashboard' as const, labelKey: 'paxlog.tabs.dashboard', icon: LayoutDashboard },
  { id: 'ads' as const, labelKey: 'paxlog.tabs.ads', icon: ClipboardList },
  { id: 'profiles' as const, labelKey: 'paxlog.tabs.profiles', icon: Users },
  { id: 'compliance' as const, labelKey: 'paxlog.tabs.compliance', icon: Shield },
  { id: 'signalements' as const, labelKey: 'paxlog.tabs.signalements', icon: AlertTriangle },
  { id: 'rotations' as const, labelKey: 'paxlog.tabs.rotations', icon: RefreshCw },
  { id: 'avm' as const, labelKey: 'paxlog.tabs.avm', icon: Briefcase },
]

type MainTabId = (typeof ALL_TABS)[number]['id']

// ── Helpers ────────────────────────────────────────────────────

function StatusBadge({ status, map, className }: { status: string; map?: Record<string, { labelKey: string; badge: string }>; className?: string }) {
  const { t } = useTranslation()
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

function SeverityBadge({ severity }: { severity: string }) {
  const severityLabels = useDictionaryLabels('pax_incident_severity')
  return (
    <span className={cn('gl-badge', SEVERITY_COLOR_MAP[severity] || 'gl-badge-neutral')}>
      {severityLabels[severity] || severity}
    </span>
  )
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateTime(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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

type AllowedCompanySelection = {
  id: string
  code?: string | null
  name: string
}

type ExternalRecipientOption = {
  key: string
  user_id: string | null
  contact_id: string | null
  label: string
  contactSummary: string
}

function buildExternalRecipientOptions(adsPax: AdsPax[] | undefined, unknownLabel: string): ExternalRecipientOption[] {
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

function AllowedCompaniesPicker({
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

// ═══════════════════════════════════════════════════════════════
// TAB 1: DASHBOARD
// ═══════════════════════════════════════════════════════════════

function DashboardTab() {
  const { t } = useTranslation()
  const { data: adsData } = useAdsList({ page: 1, page_size: 10 })
  const { data: profilesData } = usePaxProfiles({ page: 1, page_size: 5 })
  const { data: complianceStats } = useComplianceStats()
  const { data: expiringCreds } = useExpiringCredentials(30)
  const { data: incidentsData } = usePaxIncidents({ page: 1, page_size: 5, active_only: true })
  const visitCategoryLabels = useDictionaryLabels('visit_category')

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
          <StatCard label={t('paxlog.dashboard.kpi.registered_pax')} value={paxOnSite} icon={Users} />
          <StatCard label={t('paxlog.dashboard.kpi.pending_ads')} value={adsPending} icon={ClipboardList} accent={adsPending > 0 ? 'text-amber-600 dark:text-amber-400' : undefined} />
          <StatCard label={t('paxlog.dashboard.kpi.active_incidents')} value={activeSignalements} icon={AlertTriangle} accent={activeSignalements > 0 ? 'text-destructive' : undefined} />
          <StatCard label={t('paxlog.dashboard.kpi.compliance_rate')} value={`${complianceRate}%`} icon={Shield} accent={complianceRate >= 90 ? 'text-emerald-600 dark:text-emerald-400' : complianceRate >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-destructive'} />
        </div>

        {/* AdS by status visual */}
        <CollapsibleSection id="dash-ads-status" title={t('paxlog.dashboard.sections.ads_by_status')} defaultExpanded>
          <div className="flex flex-wrap gap-2">
            {Object.entries(adsStatusCounts).map(([status, count]) => {
              const entry = ADS_STATUS_MAP[status]
              return (
                <div key={status} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-background">
                  <span className={cn('gl-badge', entry?.badge || 'gl-badge-neutral')}>{entry ? t(entry.labelKey) : status}</span>
                  <span className="text-sm font-semibold tabular-nums">{count}</span>
                </div>
              )
            })}
            {Object.keys(adsStatusCounts).length === 0 && (
              <p className="text-xs text-muted-foreground italic">{t('paxlog.no_ads_registered')}</p>
            )}
          </div>
        </CollapsibleSection>

        {/* Recent AdS */}
        <CollapsibleSection id="dash-recent-ads" title={t('paxlog.dashboard.sections.recent_ads')} defaultExpanded>
          {recentAds.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-2">{t('paxlog.no_ads_recent')}</p>
          ) : (
            <div className="space-y-1">
              {recentAds.slice(0, 6).map((ads) => (
                <div key={ads.id} className="flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-accent/50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium font-mono text-foreground">{ads.reference}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {visitCategoryLabels[ads.visit_category] || ads.visit_category}
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
        <CollapsibleSection id="dash-expiring-creds" title={t('paxlog.dashboard.sections.expiring_credentials')} defaultExpanded>
          {expiringList.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-2">{t('paxlog.no_certification_expiring')}</p>
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
          <CollapsibleSection id="dash-compliance-stats" title={t('paxlog.dashboard.sections.compliance_stats')}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard label={t('paxlog.dashboard.kpi.total_pax')} value={complianceStats.total_pax} icon={Users} />
              <StatCard label={t('paxlog.dashboard.kpi.compliant')} value={complianceStats.compliant_pax} icon={CheckCircle2} accent="text-emerald-600 dark:text-emerald-400" />
              <StatCard label={t('paxlog.dashboard.kpi.non_compliant')} value={complianceStats.non_compliant_pax} icon={XCircle} accent={complianceStats.non_compliant_pax > 0 ? 'text-destructive' : undefined} />
              <StatCard label={t('paxlog.dashboard.kpi.expiring_soon')} value={complianceStats.expiring_soon} icon={Clock} accent="text-amber-600 dark:text-amber-400" />
              <StatCard label={t('paxlog.dashboard.kpi.expired')} value={complianceStats.expired} icon={AlertTriangle} accent={complianceStats.expired > 0 ? 'text-destructive' : undefined} />
              <StatCard label={t('paxlog.dashboard.kpi.compliance_rate')} value={`${complianceStats.compliance_rate}%`} icon={Percent} />
            </div>
          </CollapsibleSection>
        )}
      </div>
    </PanelContent>
  )
}

function RequesterHomeTab({
  onCreateAds,
  onCreateAvm,
  onOpenAds,
  onOpenAvm,
}: {
  onCreateAds: () => void
  onCreateAvm: () => void
  onOpenAds: (id: string) => void
  onOpenAvm: (id: string) => void
}) {
  const { t } = useTranslation()
  const { data: myAds, isLoading: adsLoading } = useAdsList({
    page: 1,
    page_size: 8,
    scope: 'my',
  })
  const { data: avmData, isLoading: avmLoading } = useAvmList({ page: 1, page_size: 6, scope: 'my' })

  const myAvm = avmData?.items ?? []

  const draftAds = (myAds?.items ?? []).filter((item) => item.status === 'draft').length
  const pendingAds = (myAds?.items ?? []).filter((item) => ['submitted', 'pending_compliance', 'pending_validation', 'requires_review'].includes(item.status)).length
  const activeAds = (myAds?.items ?? []).filter((item) => ['approved', 'in_progress'].includes(item.status)).length

  return (
    <PanelContent>
      <div className="p-4 space-y-5">
        <div className="rounded-xl border border-border bg-gradient-to-br from-primary/[0.08] via-background to-amber-500/[0.06] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t('paxlog.requester.eyebrow')}</p>
              <div>
                <h2 className="text-lg font-semibold text-foreground">{t('paxlog.requester.title')}</h2>
                <p className="text-sm text-muted-foreground">
                  {t('paxlog.requester.description')}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-95" onClick={onCreateAds}>
                <ClipboardList size={14} />
                {t('paxlog.new_ads')}
              </button>
              <button className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent" onClick={onCreateAvm}>
                <Briefcase size={14} />
                {t('paxlog.new_avm')}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={t('paxlog.requester.kpis.my_ads')} value={myAds?.total ?? 0} icon={ClipboardList} />
          <StatCard label={t('paxlog.requester.kpis.drafts')} value={draftAds} icon={Clock} accent={draftAds > 0 ? 'text-amber-600 dark:text-amber-400' : undefined} />
          <StatCard label={t('paxlog.requester.kpis.pending')} value={pendingAds} icon={Info} accent={pendingAds > 0 ? 'text-primary' : undefined} />
          <StatCard label={t('paxlog.requester.kpis.active_stays')} value={activeAds} icon={CheckCircle2} accent={activeAds > 0 ? 'text-emerald-600 dark:text-emerald-400' : undefined} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <CollapsibleSection id="requester-my-ads" title={t('paxlog.requester.sections.my_ads')} defaultExpanded>
            <div className="space-y-2">
              {adsLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
              {!adsLoading && (myAds?.items ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground italic">{t('paxlog.requester.empty.my_ads')}</p>
              )}
              {(myAds?.items ?? []).map((item) => (
                <button
                  key={item.id}
                  onClick={() => onOpenAds(item.id)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left hover:bg-accent"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-medium text-foreground">{item.reference}</p>
                      <p className="truncate text-sm text-foreground">{item.site_name || t('paxlog.common.site_not_specified')}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDateShort(item.start_date)} → {formatDateShort(item.end_date)} • {item.pax_count} PAX
                      </p>
                    </div>
                    <StatusBadge status={item.status} map={ADS_STATUS_MAP} className="shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          </CollapsibleSection>

          <div className="space-y-4">
            <CollapsibleSection id="requester-my-avm" title={t('paxlog.requester.sections.my_avm')} defaultExpanded>
              <div className="space-y-2">
                {avmLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
                {!avmLoading && myAvm.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">{t('paxlog.requester.empty.my_avm')}</p>
                )}
                {myAvm.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onOpenAvm(item.id)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left hover:bg-accent"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-medium text-foreground">{item.reference}</p>
                        <p className="truncate text-sm text-foreground">{item.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatDateShort(item.planned_start_date)} → {formatDateShort(item.planned_end_date)} • {item.pax_count} PAX
                        </p>
                      </div>
                      <StatusBadge status={item.status} map={AVM_STATUS_MAP} className="shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            </CollapsibleSection>

            <CollapsibleSection id="requester-guidance" title={t('paxlog.requester.sections.before_submit')}>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>{t('paxlog.requester.guidance.add_pax')}</p>
                <p>{t('paxlog.requester.guidance.use_avm')}</p>
                <p>{t('paxlog.requester.guidance.imputation_rule')}</p>
              </div>
            </CollapsibleSection>
          </div>
        </div>
      </div>
    </PanelContent>
  )
}

function ValidatorHomeTab({
  onOpenAds,
  onOpenAvm,
}: {
  onOpenAds: (id: string) => void
  onOpenAvm: (id: string) => void
}) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canSeeCompliance = hasPermission('paxlog.compliance.read')
  const { data: adsData, isLoading: adsLoading } = useAdsList({ page: 1, page_size: 12 })
  const { data: avmData, isLoading: avmLoading } = useAvmList({ page: 1, page_size: 8 })
  const { data: expiringCreds, isLoading: expiringLoading } = useExpiringCredentials(30)
  const visitCategoryLabels = useDictionaryLabels('visit_category')

  const adsItems = adsData?.items ?? []
  const avmItems = avmData?.items ?? []
  const adsToValidate = adsItems.filter((item) => ['submitted', 'pending_compliance', 'pending_validation', 'requires_review'].includes(item.status))
  const adsAwaitingApproval = adsItems.filter((item) => ['submitted', 'pending_validation'].includes(item.status))
  const adsAwaitingCompliance = adsItems.filter((item) => item.status === 'pending_compliance')
  const avmToArbitrate = avmItems.filter((item) => ['in_preparation', 'active', 'ready'].includes(item.status))
  const urgentCreds = (expiringCreds ?? []).filter((item) => item.days_remaining <= 7).slice(0, 6)

  return (
    <PanelContent>
      <div className="p-4 space-y-5">
        <div className="rounded-xl border border-border bg-gradient-to-br from-amber-500/[0.10] via-background to-primary/[0.08] p-4">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t('paxlog.validator.eyebrow')}</p>
            <h2 className="text-lg font-semibold text-foreground">{t('paxlog.validator.title')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('paxlog.validator.description')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={t('paxlog.validator.kpis.ads_to_review')} value={adsToValidate.length} icon={ClipboardList} accent={adsToValidate.length > 0 ? 'text-amber-600 dark:text-amber-400' : undefined} />
          <StatCard label={t('paxlog.validator.kpis.final_validation')} value={adsAwaitingApproval.length} icon={ThumbsUp} accent={adsAwaitingApproval.length > 0 ? 'text-primary' : undefined} />
          <StatCard label={t('paxlog.validator.kpis.compliance_review')} value={adsAwaitingCompliance.length} icon={Shield} accent={adsAwaitingCompliance.length > 0 ? 'text-destructive' : undefined} />
          <StatCard label={t('paxlog.validator.kpis.avm_to_arbitrate')} value={avmToArbitrate.length} icon={Briefcase} accent={avmToArbitrate.length > 0 ? 'text-emerald-600 dark:text-emerald-400' : undefined} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <CollapsibleSection id="validator-ads-queue" title={t('paxlog.validator.sections.ads_priority')} defaultExpanded>
            <div className="space-y-2">
              {adsLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
              {!adsLoading && adsToValidate.length === 0 && (
                <p className="text-xs text-muted-foreground italic">{t('paxlog.validator.empty.ads_priority')}</p>
              )}
              {adsToValidate.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onOpenAds(item.id)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left hover:bg-accent"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-xs font-medium text-foreground">{item.reference}</p>
                        <StatusBadge status={item.status} map={ADS_STATUS_MAP} className="shrink-0" />
                      </div>
                      <p className="truncate text-sm text-foreground">{item.site_name || t('paxlog.common.site_not_specified')}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {visitCategoryLabels[item.visit_category] || item.visit_category}
                        {' • '}
                        {formatDateShort(item.start_date)} → {formatDateShort(item.end_date)}
                        {' • '}
                        {item.pax_count} PAX
                      </p>
                      {item.requester_name && <p className="text-[11px] text-muted-foreground">{t('paxlog.validator.requester_label', { name: item.requester_name })}</p>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </CollapsibleSection>

          <div className="space-y-4">
            <CollapsibleSection id="validator-avm-queue" title={t('paxlog.validator.sections.avm_priority')} defaultExpanded>
              <div className="space-y-2">
                {avmLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
                {!avmLoading && avmToArbitrate.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">{t('paxlog.validator.empty.avm_priority')}</p>
                )}
                {avmToArbitrate.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onOpenAvm(item.id)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left hover:bg-accent"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-xs font-medium text-foreground">{item.reference}</p>
                          <StatusBadge status={item.status} map={AVM_STATUS_MAP} className="shrink-0" />
                        </div>
                        <p className="truncate text-sm text-foreground">{item.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatDateShort(item.planned_start_date)} → {formatDateShort(item.planned_end_date)}
                          {' • '}
                          {t('paxlog.validator.avm_planned_pax', { count: item.pax_quota })}
                          {' • '}
                          {t('paxlog.validator.preparation_progress', { progress: item.preparation_progress })}
                        </p>
                        {item.creator_name && <p className="text-[11px] text-muted-foreground">{t('paxlog.validator.creator_label', { name: item.creator_name })}</p>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </CollapsibleSection>

            {canSeeCompliance && (
              <CollapsibleSection id="validator-compliance-risks" title={t('paxlog.validator.sections.compliance_risks')}>
                <div className="space-y-2">
                  {expiringLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
                  {!expiringLoading && urgentCreds.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">{t('paxlog.validator.empty.compliance_risks')}</p>
                  )}
                  {urgentCreds.map((cred) => (
                    <div key={cred.id} className="rounded-lg border border-border bg-background px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{cred.pax_last_name} {cred.pax_first_name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {cred.credential_type_name}
                            {cred.pax_company_name ? ` • ${cred.pax_company_name}` : ''}
                          </p>
                        </div>
                        <CountdownBadge days={cred.days_remaining} />
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            <CollapsibleSection id="validator-guidance" title={t('paxlog.validator.sections.attention_points')}>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>{t('paxlog.validator.guidance.ads_priority')}</p>
                <p>{t('paxlog.validator.guidance.ads_imputation')}</p>
                <p>{t('paxlog.validator.guidance.avm_scope')}</p>
              </div>
            </CollapsibleSection>
          </div>
        </div>
      </div>
    </PanelContent>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB 2: AVIS DE SEJOUR (AdS)
// ═══════════════════════════════════════════════════════════════

function AdsTab({ openDetail, requesterOnly = false, validatorOnly = false }: { openDetail: (id: string) => void; requesterOnly?: boolean; validatorOnly?: boolean }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState(validatorOnly ? 'pending_validation' : '')
  const visitCategoryLabels = useDictionaryLabels('visit_category')

  const { data, isLoading } = useAdsList({
    page,
    page_size: pageSize,
    status: statusFilter || undefined,
    search: debouncedSearch || undefined,
    scope: requesterOnly ? 'my' : undefined,
  })

  const items: AdsSummary[] = data?.items ?? []

  const stats = useMemo(() => {
    const pending = items.filter((a) => ['submitted', 'pending_compliance', 'pending_validation'].includes(a.status)).length
    const review = items.filter((a) => ['requires_review', 'pending_compliance'].includes(a.status)).length
    const approved = items.filter((a) => a.status === 'approved').length
    const totalPax = items.reduce((sum, a) => sum + (a.pax_count ?? 0), 0)
    return { pending, review, approved, totalPax }
  }, [items])

  const adsColumns = useMemo<ColumnDef<AdsSummary, unknown>[]>(() => [
    {
      accessorKey: 'reference',
      header: t('paxlog.reference'),
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
      header: t('common.type'),
      cell: ({ row }) => (
        <span className={cn('gl-badge', row.original.type === 'team' ? 'gl-badge-info' : 'gl-badge-neutral')}>
          {row.original.type === 'individual' ? t('paxlog.create_ads.type.individual') : t('paxlog.create_ads.type.team')}
        </span>
      ),
      size: 90,
    },
    {
      accessorKey: 'visit_category',
      header: t('paxlog.visit_category'),
      cell: ({ row }) => (
        <span className="gl-badge gl-badge-neutral">
          {visitCategoryLabels[row.original.visit_category] || row.original.visit_category}
        </span>
      ),
    },
    {
      id: 'dates',
      header: t('paxlog.ads_detail.fields.dates'),
      cell: ({ row }) => <span className="text-muted-foreground text-xs tabular-nums">{formatDate(row.original.start_date)} → {formatDate(row.original.end_date)}</span>,
    },
    {
      accessorKey: 'requester_name',
      header: t('paxlog.ads_detail.fields.requester'),
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
      header: t('common.status'),
      cell: ({ row }) => <StatusBadge status={row.original.status} map={ADS_STATUS_MAP} />,
      size: 110,
    },
  ], [t, visitCategoryLabels])

  return (
    <>
      {validatorOnly && (
        <div className="px-4 py-3 border-b border-border bg-amber-500/[0.06]">
          <p className="text-xs text-muted-foreground">
            {t('paxlog.ads.validator_hint_prefix')} <span className="font-medium text-foreground">pending_validation</span>, {t('paxlog.ads.validator_hint_middle')} <span className="font-medium text-foreground">pending_compliance</span> {t('paxlog.ads.validator_hint_or')} <span className="font-medium text-foreground">requires_review</span>.
          </p>
        </div>
      )}
      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        <StatCard label={requesterOnly ? t('paxlog.ads.kpis.my_ads') : validatorOnly ? t('paxlog.ads.kpis.queue_ads') : t('common.total')} value={data?.total ?? 0} icon={ClipboardList} />
        <StatCard label={validatorOnly ? t('paxlog.ads.kpis.validation') : t('paxlog.ads.kpis.pending')} value={stats.pending} icon={Clock} accent="text-amber-600 dark:text-amber-400" />
        <StatCard label={validatorOnly ? t('paxlog.ads.kpis.review_gaps') : t('paxlog.ads.kpis.approved')} value={validatorOnly ? stats.review : stats.approved} icon={validatorOnly ? Shield : CheckCircle2} accent={validatorOnly ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'} />
        <StatCard label={t('paxlog.ads.kpis.total_pax')} value={stats.totalPax} icon={Users} />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {ADS_STATUS_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => { setStatusFilter(opt.value); setPage(1) }}
              className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap', statusFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
        {data && <span className="text-xs text-muted-foreground ml-auto shrink-0">{t('paxlog.ads.count', { count: data.total, scope: requesterOnly ? t('paxlog.ads.count_scope.requester') : validatorOnly ? t('paxlog.ads.count_scope.validator') : t('paxlog.ads.count_scope.default') })}</span>}
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
          searchPlaceholder={validatorOnly ? t('paxlog.ads.search.validator') : t('paxlog.ads.search.default')}
          onRowClick={(row) => openDetail(row.id)}
          emptyIcon={ClipboardList}
          emptyTitle={validatorOnly ? t('paxlog.ads.empty.validator') : t('paxlog.ads.empty.default')}
          storageKey="paxlog-ads"
        />
      </PanelContent>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB 3: PROFILS PAX
// ═══════════════════════════════════════════════════════════════

function ProfilesTab({ openDetail }: { openDetail: (id: string, meta?: Record<string, unknown>) => void }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const { hasPermission } = usePermission()
  const paxTypeOptions = useDictionaryOptions('pax_type')
  const paxTypeLabels = useDictionaryLabels('pax_type', { internal: t('paxlog.internal'), external: t('paxlog.external') })
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
      header: t('common.name'),
      accessorFn: (row) => `${row.last_name} ${row.first_name}`,
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.last_name} {row.original.first_name}</span>,
    },
    {
      accessorKey: 'company_name',
      header: t('tiers.title'),
      cell: ({ row }) => row.original.company_id
        ? <CrossModuleLink module="tiers" id={row.original.company_id} label={row.original.company_name || row.original.company_id} showIcon={false} className="text-xs" />
        : row.original.company_name
          ? <span className="flex items-center gap-1 text-muted-foreground text-xs"><Building2 size={11} /> {row.original.company_name}</span>
          : <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'pax_type',
      header: t('common.type'),
      cell: ({ row }) => (
        <span className={cn('gl-badge', row.original.pax_type === 'internal' ? 'gl-badge-info' : 'gl-badge-neutral')}>
          {paxTypeLabels[row.original.pax_type] || row.original.pax_type}
        </span>
      ),
      size: 80,
    },
    {
      accessorKey: 'badge_number',
      header: t('paxlog.badge_number'),
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.badge_number || '—'}</span>,
    },
    {
      accessorKey: 'active',
      header: t('common.status'),
      cell: ({ row }) => <StatusBadge status={row.original.active ? 'active' : 'inactive'} />,
      size: 90,
    },
  ], [paxTypeLabels, t])

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <div className="flex items-center gap-1">
          {PAX_STATUS_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => { setStatusFilter(opt.value); setPage(1) }}
              className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors', statusFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {t(opt.labelKey)}
            </button>
          ))}
          <span className="mx-1 h-3 w-px bg-border" />
          {paxTypeOptions.map((opt) => (
            <button key={opt.value} onClick={() => { setTypeFilter(typeFilter === opt.value ? '' : opt.value); setPage(1) }}
              className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors', typeFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {opt.label}
            </button>
          ))}
        </div>
        {data && <span className="text-xs text-muted-foreground ml-auto">{t('paxlog.profiles_count', { count: data.total })}</span>}
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
          searchPlaceholder={t('paxlog.search_profile')}
          onRowClick={(row) => openDetail(row.id, { pax_source: row.pax_source })}
          importExport={(canExport || canImport) ? {
            exportFormats: canExport ? ['csv', 'xlsx'] : undefined,
            advancedExport: true,
            importWizardTarget: canImport ? 'pax_profile' : undefined,
            filenamePrefix: 'pax-profiles',
          } : undefined}
          emptyIcon={Users}
          emptyTitle={t('paxlog.no_profile')}
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
  const { t } = useTranslation()
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
      header: t('paxlog.credentials'),
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="text-foreground text-xs">{row.original.credential_type_name}</span>
          <span className="text-[10px] text-muted-foreground block">{row.original.credential_type_category}</span>
        </div>
      ),
    },
    {
      accessorKey: 'expiry_date',
      header: t('paxlog.compliance_tab.expiry'),
      cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums">{formatDate(row.original.expiry_date)}</span>,
      size: 100,
    },
    {
      id: 'countdown',
      header: t('paxlog.compliance_tab.delay'),
      cell: ({ row }) => <CountdownBadge days={row.original.days_remaining} />,
      size: 70,
    },
    {
      accessorKey: 'status',
      header: t('common.status'),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
      size: 90,
    },
  ], [t])

  const matrixColumns = useMemo<ColumnDef<ComplianceMatrixEntry, unknown>[]>(() => [
    {
      accessorKey: 'asset_id',
      header: t('assets.title'),
      cell: ({ row }) => <span className="text-xs font-mono text-foreground truncate block max-w-[180px]">{row.original.asset_id}</span>,
    },
    {
      accessorKey: 'credential_type_id',
      header: t('paxlog.compliance_tab.required_credential'),
      cell: ({ row }) => {
        const ct = credTypeMap[row.original.credential_type_id]
        return <span className="text-xs text-foreground">{ct?.name || row.original.credential_type_id}</span>
      },
    },
    {
      accessorKey: 'scope',
      header: t('paxlog.compliance_tab.scope'),
      cell: ({ row }) => {
        const labels: Record<string, string> = {
          all_visitors: t('paxlog.compliance_tab.scope_values.all_visitors'),
          contractors_only: t('paxlog.compliance_tab.scope_values.contractors_only'),
          permanent_staff_only: t('paxlog.compliance_tab.scope_values.permanent_staff_only'),
        }
        return <span className="gl-badge gl-badge-neutral">{labels[row.original.scope] || row.original.scope}</span>
      },
      size: 120,
    },
    {
      accessorKey: 'mandatory',
      header: t('paxlog.compliance_tab.mandatory'),
      cell: ({ row }) => row.original.mandatory
        ? <CheckCircle2 size={14} className="text-green-600" />
        : <span className="text-muted-foreground text-xs">{t('common.no')}</span>,
      size: 80,
    },
    {
      accessorKey: 'defined_by',
      header: t('paxlog.compliance_tab.defined_by'),
      cell: ({ row }) => <span className="gl-badge gl-badge-neutral">{row.original.defined_by === 'hse_central' ? t('paxlog.compliance_tab.defined_by_values.hse_central') : t('paxlog.compliance_tab.defined_by_values.site')}</span>,
      size: 100,
    },
  ], [credTypeMap, t])

  return (
    <PanelContent>
      <div className="p-4 space-y-5">
        {/* Stats */}
        {complianceStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label={t('paxlog.compliance_tab.kpis.rate')} value={`${complianceStats.compliance_rate}%`} icon={Shield} accent={complianceStats.compliance_rate >= 90 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'} />
            <StatCard label={t('paxlog.compliance_tab.kpis.compliant')} value={complianceStats.compliant_pax} icon={CheckCircle2} accent="text-emerald-600 dark:text-emerald-400" />
            <StatCard label={t('paxlog.compliance_tab.kpis.non_compliant')} value={complianceStats.non_compliant_pax} icon={XCircle} accent={complianceStats.non_compliant_pax > 0 ? 'text-destructive' : undefined} />
            <StatCard label={t('paxlog.compliance_tab.kpis.expiring_soon')} value={complianceStats.expiring_soon} icon={Clock} accent="text-amber-600 dark:text-amber-400" />
          </div>
        )}

        {/* Expiring credentials table */}
        <CollapsibleSection id="comp-expiring" title={t('paxlog.compliance_tab.sections.expiring', { count: filteredExpiring.length })} defaultExpanded>
          <DataTable<ExpiringCredential>
            columns={expiringColumns}
            data={filteredExpiring}
            isLoading={expiringLoading}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder={t('paxlog.search_certification')}
            emptyIcon={FileCheck2}
            emptyTitle={t('paxlog.no_certification_expiring_soon')}
            storageKey="paxlog-expiring"
          />
        </CollapsibleSection>

        {/* Compliance matrix */}
        <CollapsibleSection id="comp-matrix" title={t('paxlog.compliance_tab.sections.matrix', { count: matrix?.length ?? 0 })}>
          <DataTable<ComplianceMatrixEntry>
            columns={matrixColumns}
            data={matrix ?? []}
            isLoading={matrixLoading}
            emptyIcon={Shield}
            emptyTitle={t('paxlog.no_compliance_entry')}
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
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [severityFilter, setSeverityFilter] = useState('')
  const severityOptions = useDictionaryOptions('pax_incident_severity')
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
        if (pax.group_name) {
          return <span className="text-xs font-medium text-foreground">{pax.group_name}</span>
        }
        if (pax.company_name) {
          return <span className="text-xs font-medium text-foreground">{pax.company_name}</span>
        }
        return <span className="text-xs text-muted-foreground">—</span>
      },
    },
    {
      id: 'asset',
      header: t('assets.title'),
      cell: ({ row }) => row.original.asset_id
        ? <CrossModuleLink module="assets" id={row.original.asset_id} label={row.original.asset_name || row.original.asset_id} showIcon={false} className="text-xs" />
        : <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'severity',
      header: t('paxlog.severity'),
      cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
      size: 120,
    },
    {
      accessorKey: 'incident_date',
      header: t('common.date'),
      cell: ({ row }) => <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">{formatDate(row.original.incident_date)}</span>,
      size: 100,
    },
    {
      accessorKey: 'description',
      header: t('common.description'),
      cell: ({ row }) => <span className="text-foreground max-w-[250px] truncate block text-xs">{row.original.description}</span>,
    },
    {
      id: 'resolved',
      header: t('common.status'),
      cell: ({ row }) => row.original.resolved_at
        ? <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle2 size={12} /> {t('paxlog.signalements.status.resolved')}</span>
        : <span className="inline-flex items-center gap-1 text-xs text-amber-500"><Clock size={12} /> {t('paxlog.signalements.status.active')}</span>,
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
          {t('paxlog.resolve')}
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
          {t('paxlog.signalements.active_only')}
        </button>
        <span className="mx-1 h-3 w-px bg-border" />
        {severityOptions.map((opt) => (
          <button key={opt.value} onClick={() => { setSeverityFilter(severityFilter === opt.value ? '' : opt.value); setPage(1) }}
            className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap', severityFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            {opt.label}
          </button>
        ))}
        {data && <span className="text-xs text-muted-foreground ml-auto">{t('paxlog.signalements.count', { count: data.total })}</span>}
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
          searchPlaceholder={t('paxlog.search_incident')}
          emptyIcon={AlertTriangle}
          emptyTitle={t('paxlog.no_incident')}
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
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const rotationStatusOptions = useDictionaryOptions('pax_rotation_status')
  const rotationStatusLabels = useDictionaryLabels('pax_rotation_status', {
    active: t('paxlog.status.rotation.active'),
    paused: t('paxlog.status.rotation.paused'),
    completed: t('paxlog.status.rotation.completed'),
  })
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
      (r.site_name || '').toLowerCase().includes(q) ||
      (r.company_name || '').toLowerCase().includes(q)
    )
  }, [data?.items, search])

  const rotationStatusFilterOptions = useMemo(
    () => [
      { value: '', label: t('common.all') },
      ...rotationStatusOptions.map((opt) => ({
        value: String(opt.value),
        label: rotationStatusLabels[String(opt.value)] || opt.label,
      })),
    ],
    [rotationStatusLabels, rotationStatusOptions, t],
  )

  const rotationColumns = useMemo<ColumnDef<RotationCycle, unknown>[]>(() => [
    {
      id: 'pax',
      header: t('paxlog.rotations_tab.columns.pax'),
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="font-medium text-foreground text-xs">
            {row.original.pax_last_name} {row.original.pax_first_name}
          </div>
          {row.original.company_name && (
            <div className="text-[11px] text-muted-foreground truncate">{row.original.company_name}</div>
          )}
        </div>
      ),
    },
    {
      id: 'site',
      header: t('assets.site'),
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.site_name || '—'}</span>,
    },
    {
      id: 'cycle',
      header: t('paxlog.rotations_tab.cycle'),
      cell: ({ row }) => (
        <span className="text-xs text-foreground tabular-nums">
          {row.original.days_on}j on / {row.original.days_off}j off
        </span>
      ),
      size: 110,
    },
    {
      accessorKey: 'start_date',
      header: t('paxlog.rotations_tab.start'),
      cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums">{formatDateShort(row.original.start_date)}</span>,
      size: 100,
    },
    {
      id: 'next_rotation',
      header: t('paxlog.rotations_tab.next_rotation'),
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
      header: t('common.status'),
      cell: ({ row }) => <StatusBadge status={row.original.status} map={ROTATION_STATUS_MAP} />,
      size: 90,
    },
    {
      id: 'compliance',
      header: t('paxlog.rotations_tab.columns.compliance'),
      cell: ({ row }) => {
        const count = row.original.compliance_issue_count ?? 0
        const preview = row.original.compliance_issue_preview ?? []
        if (count === 0) {
          return <span className="text-xs text-emerald-700">{t('paxlog.rotations_tab.compliance.clear')}</span>
        }
        return (
          <div className="min-w-0">
            <span className="gl-badge gl-badge-danger text-[11px]">
              {t('paxlog.rotations_tab.compliance.blocked', { count })}
            </span>
            {preview[0] && <div className="text-[11px] text-muted-foreground truncate mt-1">{preview[0]}</div>}
          </div>
        )
      },
      size: 180,
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
          {t('paxlog.rotations_tab.finish')}
        </button>
      ) : null,
      size: 80,
    },
  ], [endCycle, t])

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <div className="flex items-center gap-1">
          {rotationStatusFilterOptions.map((opt) => (
            <button key={opt.value} onClick={() => { setStatusFilter(opt.value); setPage(1) }}
              className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap', statusFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {opt.label}
            </button>
          ))}
        </div>
        {data && <span className="text-xs text-muted-foreground ml-auto">{t('paxlog.rotations_tab.count', { count: data.total })}</span>}
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
          searchPlaceholder={t('paxlog.search_rotation')}
          emptyIcon={RefreshCw}
          emptyTitle={t('paxlog.no_rotation')}
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
  const paxTypeOptions = useDictionaryOptions('pax_type')
  const paxTypeLabels = useDictionaryLabels('pax_type', { internal: t('paxlog.internal'), external: t('paxlog.external') })

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
      title={t('paxlog.profile_panel.create_title')}
      subtitle={t('paxlog.profile_panel.subtitle')}
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
        <FormSection title={t('paxlog.profile_panel.sections.profile_type')}>
          <TagSelector
            options={paxTypeOptions}
            value={form.type}
            onChange={(v) => setForm({ ...form, type: v as 'internal' | 'external', company_id: null, user_id: null })}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            {form.type === 'internal'
              ? t('paxlog.profile_panel.type_help.internal')
              : t('paxlog.profile_panel.type_help.external')}
          </p>
          <p className="text-[10px] text-muted-foreground">{paxTypeLabels[form.type] || form.type}</p>
        </FormSection>

        {form.type === 'external' && (
          <FormSection title={t('tiers.title')}>
            <SearchablePicker
              label={t('paxlog.profile_panel.fields.company')}
              icon={<Building2 size={12} className="text-muted-foreground" />}
              items={tiersData?.items || []}
              isLoading={tiersLoading}
              searchValue={companySearch}
              onSearchChange={setCompanySearch}
              renderItem={(tier) => <><span className="font-semibold">{tier.code}</span> — {tier.name}</>}
              selectedId={form.company_id}
              onSelect={(tier) => setForm({ ...form, company_id: tier.id })}
              onClear={() => setForm({ ...form, company_id: null })}
              placeholder={t('paxlog.search_company')}
            />
          </FormSection>
        )}

        {form.type === 'internal' && (
          <FormSection title={t('paxlog.profile_panel.sections.user_account')}>
            <SearchablePicker
              label={t('paxlog.profile_panel.fields.user')}
              icon={<User size={12} className="text-muted-foreground" />}
              items={usersData?.items || []}
              isLoading={usersLoading}
              searchValue={userSearch}
              onSearchChange={setUserSearch}
              renderItem={(u) => <>{u.first_name} {u.last_name} <span className="text-muted-foreground">({u.email})</span></>}
              selectedId={form.user_id}
              onSelect={handleUserSelect}
              onClear={() => setForm({ ...form, user_id: null })}
              placeholder={t('paxlog.search_user')}
            />
          </FormSection>
        )}

        <FormSection title={t('paxlog.profile_panel.sections.identity')}>
          <FormGrid>
            <DynamicPanelField label={t('paxlog.profile_panel.fields.first_name')} required>
              <input type="text" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.profile_panel.fields.last_name')} required>
              <input type="text" required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        <FormSection title={t('paxlog.profile_panel.sections.additional_info')}>
          <FormGrid>
            <DynamicPanelField label={t('paxlog.profile_panel.fields.birth_date')}>
              <input type="date" value={form.birth_date || ''} onChange={(e) => setForm({ ...form, birth_date: e.target.value || null })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.profile_panel.fields.nationality')}>
              <input type="text" value={form.nationality || ''} onChange={(e) => setForm({ ...form, nationality: e.target.value || null })} className={panelInputClass} placeholder={t('paxlog.profile_panel.placeholders.nationality')} />
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.profile_panel.fields.badge_number')}>
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

function ProfileDetailPanel({ id, paxSource, adsId }: { id: string; paxSource: 'user' | 'contact'; adsId?: string }) {
  const { t } = useTranslation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { data: profile, isLoading, isError, error } = usePaxProfile(id, paxSource)
  const updateProfile = useUpdatePaxProfile()
  const { data: credentials } = usePaxCredentials(id)
  const { data: sitePresenceHistory } = usePaxProfileSitePresenceHistory(id, profile?.pax_source)
  const { data: credentialTypes } = useCredentialTypes()
  const paxTypeLabels = useDictionaryLabels('pax_type', { internal: t('paxlog.internal'), external: t('paxlog.external') })

  const handleSave = useCallback((field: string, value: string) => {
    updateProfile.mutate({ id, payload: normalizeNames({ [field]: value }) })
  }, [id, updateProfile])

  const credTypeMap = useMemo(() => {
    const m: Record<string, CredentialType> = {}
    credentialTypes?.forEach((ct) => { m[ct.id] = ct })
    return m
  }, [credentialTypes])

  if (isLoading) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<Users size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  if (isError || !profile) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : t('common.error')
    return (
      <DynamicPanelShell title={t('paxlog.profile_panel.not_found_title')} icon={<Users size={14} className="text-primary" />}>
        <div className="py-10 px-4 space-y-2">
          <p className="text-sm font-medium text-foreground">{t('paxlog.profile_panel.not_found_message')}</p>
          <p className="text-xs text-muted-foreground">{message}</p>
        </div>
      </DynamicPanelShell>
    )
  }

  const profileOwnerType = profile.pax_source === 'contact' ? 'tier_contact' : 'user'

  return (
    <DynamicPanelShell
      title={`${profile.first_name} ${profile.last_name}`}
      subtitle={profile.badge_number || profile.pax_type}
      icon={<User size={14} className="text-primary" />}
      actions={
        <>
          {adsId && (
            <PanelActionButton
              onClick={() => openDynamicPanel({ type: 'detail', module: 'paxlog', id: adsId, meta: { subtype: 'ads' } })}
            >
              <ArrowLeft size={12} /> {t('paxlog.profile_panel.back_to_ads')}
            </PanelActionButton>
          )}
          <DangerConfirmButton
            icon={<Trash2 size={12} />}
            onConfirm={() => { updateProfile.mutate({ id, payload: { status: 'archived' } }); closeDynamicPanel() }}
            confirmLabel={t('paxlog.profile_panel.archive_confirm')}
          >
            {t('common.archive')}
          </DangerConfirmButton>
        </>
      }
    >
      <PanelContentLayout>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={profile.active ? 'active' : 'inactive'} />
          <span className={cn('gl-badge', profile.pax_type === 'internal' ? 'gl-badge-info' : 'gl-badge-neutral')}>
            {paxTypeLabels[profile.pax_type] || profile.pax_type}
          </span>
        </div>

        {profile.company_name && (
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-muted/40 border border-border">
            <Building2 size={13} className="text-muted-foreground shrink-0" />
            <div className="min-w-0">
              {profile.company_id ? (
                <CrossModuleLink module="tiers" id={profile.company_id} label={profile.company_name} showIcon={false} className="text-xs font-medium text-foreground truncate block" />
              ) : (
                <p className="text-xs font-medium text-foreground truncate">{profile.company_name}</p>
              )}
              <p className="text-[10px] text-muted-foreground">{t('paxlog.profile_panel.linked_company')}</p>
            </div>
          </div>
        )}
        {profile.email && (
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-muted/40 border border-border">
            <User size={13} className="text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{profile.email}</p>
              <p className="text-[10px] text-muted-foreground">{t('paxlog.profile_panel.linked_user')}</p>
            </div>
          </div>
        )}
        {profile.pax_source === 'contact' && profile.linked_user_id && (
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-muted/40 border border-border">
            <User size={13} className="text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <CrossModuleLink
                module="users"
                id={profile.linked_user_id}
                label={profile.linked_user_email || t('paxlog.profile_panel.external_user')}
                showIcon={false}
                className="text-xs font-medium text-foreground truncate block"
              />
              <p className="text-[10px] text-muted-foreground">
                {profile.linked_user_active === false
                  ? t('paxlog.profile_panel.promoted_external_user_inactive')
                  : t('paxlog.profile_panel.promoted_external_user')}
              </p>
            </div>
          </div>
        )}

        <SectionColumns>
          <div className="@container space-y-5">
            <FormSection title={t('paxlog.profile_panel.sections.identity')}>
              <InlineEditableRow label={t('paxlog.profile_panel.fields.first_name')} value={profile.first_name} onSave={(v) => handleSave('first_name', v)} />
              <InlineEditableRow label={t('paxlog.profile_panel.fields.last_name')} value={profile.last_name} onSave={(v) => handleSave('last_name', v)} />
              <ReadOnlyRow label={t('paxlog.profile_panel.fields.birth_date')} value={formatDate(profile.birth_date)} />
              <InlineEditableRow label={t('paxlog.profile_panel.fields.nationality')} value={profile.nationality || ''} onSave={(v) => handleSave('nationality', v)} />
              <InlineEditableRow label={t('paxlog.profile_panel.fields.badge_number')} value={profile.badge_number || ''} onSave={(v) => handleSave('badge_number', v)} />
            </FormSection>

            {profile.pax_source === 'user' && (
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 text-xs">
                <Info size={12} /> {t('paxlog.profile_panel.internal_user_profile')}
              </div>
            )}
            {profile.pax_source === 'contact' && (
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-xs">
                <Info size={12} />
                {profile.linked_user_id
                  ? t('paxlog.profile_panel.external_contact_promoted')
                  : t('paxlog.profile_panel.external_contact_profile')}
              </div>
            )}
          </div>

          <div className="@container space-y-5">
            <FormSection title={t('paxlog.profile_panel.credentials_title', { count: credentials?.length || 0 })}>
              {!credentials || credentials.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 italic">{t('paxlog.no_certification')}</p>
              ) : (
                <div className="space-y-1">
                  {credentials.map((cred: PaxCredential) => (
                    <div key={cred.id} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-accent/50 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{credTypeMap[cred.credential_type_id]?.name || t('paxlog.credentials')}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {t('paxlog.profile_panel.credential_obtained', { date: formatDate(cred.obtained_date) })}
                          {cred.expiry_date && ` — ${t('paxlog.profile_panel.credential_expires', { date: formatDate(cred.expiry_date) })}`}
                        </p>
                      </div>
                      <StatusBadge status={cred.status} />
                    </div>
                  ))}
                </div>
              )}
            </FormSection>

            <FormSection title={t('paxlog.profile_panel.site_presence_title', { count: sitePresenceHistory?.length || 0 })}>
              {!sitePresenceHistory || sitePresenceHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 italic">{t('paxlog.profile_panel.site_presence_empty')}</p>
              ) : (
                <div className="space-y-1">
                  {sitePresenceHistory.slice(0, 8).map((presence: PaxSitePresence) => (
                    <div key={presence.ads_id} className="rounded border border-border px-2 py-1.5 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">{presence.site_name || t('paxlog.profile_panel.unknown_site')}</span>
                        <StatusBadge status={presence.ads_status} />
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span>{presence.ads_reference}</span>
                        <span>{formatDate(presence.start_date)} — {formatDate(presence.end_date)}</span>
                      </div>
                      {(presence.boarding_status || presence.completed_at) && (
                        <div className="text-[10px] text-muted-foreground">
                          {presence.boarding_status
                            ? t('paxlog.profile_panel.boarding_status', { status: presence.boarding_status, date: formatDate(presence.boarded_at) })
                            : t('paxlog.profile_panel.completed_at', { date: formatDate(presence.completed_at) })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </FormSection>

            <ReadOnlyRow label={t('common.created_at')} value={formatDate(profile.created_at)} />
          </div>
        </SectionColumns>

        <CollapsibleSection id="profile-tags-notes" title={t('paxlog.ads_detail.sections.tags_notes_files')}>
          <div className="space-y-3 p-3">
            <TagManager ownerType={profileOwnerType} ownerId={profile.id} compact />
            <AttachmentManager ownerType={profileOwnerType} ownerId={profile.id} compact />
            <NoteManager ownerType={profileOwnerType} ownerId={profile.id} compact />
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
  const currentUser = useAuthStore((s) => s.user)
  const { data: projects } = useProjects({ page: 1, page_size: 100 })
  const { data: usersData } = useUsers({ page: 1, page_size: 200, active: true })
  const [companySearch, setCompanySearch] = useState('')
  const visitCategoryOptions = useDictionaryOptions('visit_category')
  const transportModeOptions = useDictionaryOptions('transport_mode')
  const [allowedCompanies, setAllowedCompanies] = useState<AllowedCompanySelection[]>([])

  const [form, setForm] = useState<{
    type: 'individual' | 'team'
    requester_id: string
    site_entry_asset_id: string
    visit_purpose: string
    visit_category: string
    start_date: string
    end_date: string
    project_id: string
    outbound_transport_mode: string
    return_transport_mode: string
  }>({
    type: 'individual',
    requester_id: currentUser?.id || '',
    site_entry_asset_id: '',
    visit_purpose: '',
    visit_category: '',
    start_date: '',
    end_date: '',
    project_id: '',
    outbound_transport_mode: '',
    return_transport_mode: '',
  })

  const adsChecklist = [
    { label: t('paxlog.create_ads.checklist.destination'), done: !!form.site_entry_asset_id },
    { label: t('paxlog.create_ads.checklist.category'), done: !!form.visit_category },
    { label: t('paxlog.create_ads.checklist.period'), done: !!form.start_date && !!form.end_date },
    { label: t('paxlog.create_ads.checklist.purpose'), done: form.visit_purpose.trim().length > 0 },
  ]
  const adsReady = adsChecklist.every((item) => item.done)
  const selectedVisitCategory = visitCategoryOptions.find((option) => option.value === form.visit_category)?.label || t('paxlog.create_ads.summary.undefined')
  const selectedProjectLabel = (projects?.items ?? []).find((project) => project.id === form.project_id)
  const selectedOutboundMode = transportModeOptions.find((option) => option.value === form.outbound_transport_mode)?.label || t('paxlog.create_ads.summary.to_define')
  const selectedReturnMode = transportModeOptions.find((option) => option.value === form.return_transport_mode)?.label || t('paxlog.create_ads.summary.to_define')
  const selectedAllowedCompaniesLabel = allowedCompanies.length > 0
    ? allowedCompanies.map((company) => company.name).join(', ')
    : t('common.none')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      ...form,
      requester_id: form.requester_id || null,
      project_id: form.project_id || null,
      allowed_company_ids: allowedCompanies.map((company) => company.id),
      visit_category: form.visit_category,
      outbound_transport_mode: form.outbound_transport_mode || null,
      return_transport_mode: form.return_transport_mode || null,
    }
    await createAds.mutateAsync(payload)
    closeDynamicPanel()
  }

  return (
    <DynamicPanelShell
      title={t('paxlog.create_ads.title')}
      subtitle={t('paxlog.create_ads.subtitle')}
      icon={<ClipboardList size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createAds.isPending || !adsReady}
            onClick={() => (document.getElementById('create-ads-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createAds.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-ads-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
        <FormSection title={t('paxlog.create_ads.sections.request')}>
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              {t('paxlog.create_ads.intro')}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {adsChecklist.map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-xs">
                  <span className={cn('inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]', item.done ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300')}>
                    {item.done ? '✓' : '•'}
                  </span>
                  <span className={item.done ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.create_ads.summary.format')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{form.type === 'individual' ? t('paxlog.create_ads.type.individual') : t('paxlog.create_ads.type.team')}</p>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.create_ads.summary.category')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{selectedVisitCategory}</p>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.create_ads.summary.project')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground truncate">{selectedProjectLabel ? `${selectedProjectLabel.code} — ${selectedProjectLabel.name}` : t('paxlog.create_ads.summary.bu_entity_imputation')}</p>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.create_ads.summary.transports')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground truncate">{selectedOutboundMode} / {selectedReturnMode}</p>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.create_ads.summary.allowed_companies')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground truncate">{selectedAllowedCompaniesLabel}</p>
            </div>
          </div>
        </FormSection>

        <FormSection title={t('paxlog.create_ads.sections.type_destination')}>
          <FormGrid>
            <DynamicPanelField label={t('common.type')}>
              <TagSelector
                options={[{ value: 'individual', label: t('paxlog.create_ads.type.individual') }, { value: 'team', label: t('paxlog.create_ads.type.team') }]}
                value={form.type}
                onChange={(v) => setForm({ ...form, type: v as 'individual' | 'team' })}
              />
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.create_ads.fields.entry_site')} required>
              <AssetPicker
                value={form.site_entry_asset_id || null}
                onChange={(id) => setForm({ ...form, site_entry_asset_id: id || '' })}
              />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        <FormSection title={t('paxlog.create_ads.sections.visit_details')}>
          <FormGrid>
            <DynamicPanelField label={t('paxlog.create_ads.fields.requester')} required>
              <select value={form.requester_id} onChange={(e) => setForm({ ...form, requester_id: e.target.value })} className={panelInputClass} required>
                <option value="">{t('paxlog.create_ads.select_option')}</option>
                {(usersData?.items ?? []).map((user) => <option key={user.id} value={user.id}>{user.first_name} {user.last_name}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.visit_category')} required>
              <select value={form.visit_category} onChange={(e) => setForm({ ...form, visit_category: e.target.value })} className={panelInputClass} required>
                <option value="">{t('paxlog.create_ads.select_option')}</option>
                {visitCategoryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.create_ads.fields.project')}>
              <select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })} className={panelInputClass}>
                <option value="">{t('paxlog.create_ads.no_project')}</option>
                {(projects?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.create_ads.fields.dates')} required>
              <DateRangePicker
                startDate={form.start_date || null}
                endDate={form.end_date || null}
                onStartChange={(v) => setForm({ ...form, start_date: v })}
                onEndChange={(v) => setForm({ ...form, end_date: v })}
                required
              />
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.create_ads.fields.outbound_transport')}>
              <select value={form.outbound_transport_mode} onChange={(e) => setForm({ ...form, outbound_transport_mode: e.target.value })} className={panelInputClass}>
                <option value="">{t('paxlog.create_ads.undefined_option')}</option>
                {transportModeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.create_ads.fields.return_transport')}>
              <select value={form.return_transport_mode} onChange={(e) => setForm({ ...form, return_transport_mode: e.target.value })} className={panelInputClass}>
                <option value="">{t('paxlog.create_ads.undefined_option')}</option>
                {transportModeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </DynamicPanelField>
          </FormGrid>
          <DynamicPanelField label={t('paxlog.visit_purpose')} required>
            <textarea required value={form.visit_purpose} onChange={(e) => setForm({ ...form, visit_purpose: e.target.value })} className={cn(panelInputClass, 'min-h-[60px] resize-y')} placeholder={t('paxlog.create_ads.placeholders.visit_purpose')} />
          </DynamicPanelField>
        </FormSection>

        <FormSection title={t('paxlog.create_ads.sections.allowed_companies')}>
          <AllowedCompaniesPicker
            value={allowedCompanies}
            onChange={setAllowedCompanies}
            searchValue={companySearch}
            onSearchChange={setCompanySearch}
          />
        </FormSection>

        <p className="text-xs text-muted-foreground italic">
          {t('paxlog.create_ads.footer_hint')}
        </p>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

// ── AdS Detail Panel ──────────────────────────────────────────

function AdsDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { data: ads, isLoading, isError, error } = useAds(id)
  const { data: adsPax } = useAdsPax(id)
  const { data: adsEvents } = useAdsEvents(id)
  const { data: externalLinks = [] } = useAdsExternalLinks(id)
  const { data: stayPrograms = [] } = useStayPrograms({ ads_id: id })
  const { data: imputationSuggestion } = useAdsImputationSuggestion(id)
  const submitAds = useSubmitAds()
  const cancelAds = useCancelAds()
  const startAdsProgress = useStartAdsProgress()
  const approveAds = useApproveAds()
  const decideAdsPax = useDecideAdsPax()
  const rejectAds = useRejectAds()
  const requestAdsStayChange = useRequestAdsStayChange()
  const requestReviewAds = useRequestReviewAds()
  const resubmitAds = useResubmitAds()
  const completeAds = useCompleteAds()
  const manualDepartureAds = useManualDepartureAds()
  const downloadPdf = useAdsPdf()
  const createExtLink = useCreateExternalLink()
  const createStayProgram = useCreateStayProgram()
  const submitStayProgram = useSubmitStayProgram()
  const approveStayProgram = useApproveStayProgram()
  const updateAds = useUpdateAds()
  const addPaxV2 = useAddPaxToAdsV2()
  const removePax = useRemovePaxFromAds()
  const { hasPermission } = usePermission()
  const currentUser = useAuthStore((s) => s.user)
  const { data: assetTree = [] } = useAssetTree()
  const visitCategoryLabels = useDictionaryLabels('visit_category')
  const transportModeLabels = useDictionaryLabels('transport_mode')

  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [reviewReason, setReviewReason] = useState('')
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [resubmitReason, setResubmitReason] = useState('')
  const [showResubmitForm, setShowResubmitForm] = useState(false)
  const [stayChangeReason, setStayChangeReason] = useState('')
  const [showStayChangeForm, setShowStayChangeForm] = useState(false)
  const [showExternalLinkForm, setShowExternalLinkForm] = useState(false)
  const [externalLinkRecipientKey, setExternalLinkRecipientKey] = useState('')
  const [manualDepartureReason, setManualDepartureReason] = useState('')
  const [showManualDepartureForm, setShowManualDepartureForm] = useState(false)
  const [proposedStartDate, setProposedStartDate] = useState('')
  const [proposedEndDate, setProposedEndDate] = useState('')
  const [proposedVisitPurpose, setProposedVisitPurpose] = useState('')
  const [paxSearch, setPaxSearch] = useState('')
  const [showPaxPicker, setShowPaxPicker] = useState(false)
  const [showStayProgramForm, setShowStayProgramForm] = useState(false)
  const [allowedCompanySearch, setAllowedCompanySearch] = useState('')
  const [allowedCompaniesDraft, setAllowedCompaniesDraft] = useState<AllowedCompanySelection[]>([])
  const [paxRejectEntryId, setPaxRejectEntryId] = useState<string | null>(null)
  const [paxRejectReason, setPaxRejectReason] = useState('')
  const [stayProgramTarget, setStayProgramTarget] = useState<{ user_id?: string | null; contact_id?: string | null }>({})
  const [stayMovements, setStayMovements] = useState<Array<{ effective_date: string; from_location: string; to_location: string; transport_mode: string; notes: string }>>([
    { effective_date: '', from_location: '', to_location: '', transport_mode: '', notes: '' },
  ])
  const debouncedPaxSearch = useDebounce(paxSearch, 300)
  const { data: paxCandidates } = usePaxCandidates(debouncedPaxSearch)

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

  useEffect(() => {
    if (!ads) return
    setProposedStartDate(ads.start_date)
    setProposedEndDate(ads.end_date)
    setProposedVisitPurpose(ads.visit_purpose)
    setAllowedCompaniesDraft((ads.allowed_company_ids ?? []).map((companyId, index) => ({
      id: companyId,
      name: ads.allowed_company_names?.[index] || companyId,
    })))
  }, [ads])

  const eligibleExternalRecipients = useMemo(
    () => buildExternalRecipientOptions(adsPax, t('common.unknown')),
    [adsPax, t],
  )

  const selectedExternalRecipient = useMemo(
    () => eligibleExternalRecipients.find((entry) => entry.key === externalLinkRecipientKey) || null,
    [eligibleExternalRecipients, externalLinkRecipientKey],
  )

  useEffect(() => {
    if (eligibleExternalRecipients.length === 1) {
      setExternalLinkRecipientKey(eligibleExternalRecipients[0].key)
      return
    }
    if (!eligibleExternalRecipients.some((entry) => entry.key === externalLinkRecipientKey)) {
      setExternalLinkRecipientKey(eligibleExternalRecipients[0]?.key || '')
    }
  }, [eligibleExternalRecipients, externalLinkRecipientKey])

  if (isLoading) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<ClipboardList size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  if (isError || !ads) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : t('common.error')
    return (
      <DynamicPanelShell title={t('paxlog.ads_detail.not_found_title')} icon={<ClipboardList size={14} className="text-primary" />}>
        <div className="py-10 px-4 space-y-2">
          <p className="text-sm font-medium text-foreground">{t('paxlog.ads_detail.not_found_message')}</p>
          <p className="text-xs text-muted-foreground">{message}</p>
        </div>
      </DynamicPanelShell>
    )
  }

  const compliantPaxCount = (adsPax ?? []).filter((entry) => entry.compliant === true).length
  const nonCompliantPaxCount = (adsPax ?? []).filter((entry) => entry.compliant === false).length
  const isProjectReviewer = !!ads.project_manager_id && ads.project_manager_id === currentUser?.id
  const isInitiatorReviewer = ads.status === 'pending_initiator_review' && ads.requester_id === currentUser?.id
  const canSubmit = ads.status === 'draft' && hasPermission('paxlog.ads.submit')
  const canCancel = !['cancelled', 'completed', 'rejected'].includes(ads.status) && hasPermission('paxlog.ads.cancel')
  const canApprove = (
    (['submitted', 'pending_validation'].includes(ads.status) && hasPermission('paxlog.ads.approve'))
    || (ads.status === 'pending_initiator_review' && (isInitiatorReviewer || hasPermission('paxlog.ads.approve')))
    || (ads.status === 'pending_project_review' && (isProjectReviewer || hasPermission('paxlog.ads.approve')))
  )
  const canReject = (
    (['submitted', 'pending_validation'].includes(ads.status) && hasPermission('paxlog.ads.approve'))
    || (ads.status === 'pending_initiator_review' && (isInitiatorReviewer || hasPermission('paxlog.ads.approve')))
    || (ads.status === 'pending_project_review' && (isProjectReviewer || hasPermission('paxlog.ads.approve')))
  )
  const canRequestReview = ['submitted', 'pending_compliance', 'pending_validation', 'approved', 'in_progress'].includes(ads.status) && hasPermission('paxlog.ads.approve')
  const canRequestStayChange =
    ['submitted', 'pending_compliance', 'pending_validation', 'approved', 'in_progress'].includes(ads.status)
    && hasPermission('paxlog.ads.update')
    && (ads.requester_id === currentUser?.id || hasPermission('paxlog.ads.approve'))
  const canResubmit = ads.status === 'requires_review' && hasPermission('paxlog.ads.submit')
  const canStartProgress = ads.status === 'approved' && hasPermission('paxlog.ads.approve')
  const canCompleteAds = ads.status === 'in_progress' && hasPermission('paxlog.ads.approve')
  const canDownloadPdf = ['approved', 'in_progress', 'completed'].includes(ads.status)
  const canGenerateLink = ['approved', 'in_progress'].includes(ads.status)
  const stayProgramsEnabled = ['approved', 'in_progress'].includes(ads.status)
  const canManageStayPrograms = stayProgramsEnabled && hasPermission('paxlog.stay.create')
  const canApproveStayPrograms = stayProgramsEnabled && hasPermission('paxlog.stay.approve')
  const canEditAllowedCompanies = ['draft', 'requires_review'].includes(ads.status) && hasPermission('paxlog.ads.update')
  const adsSubmissionChecklist = [
    { label: t('paxlog.ads_detail.checklist.destination'), done: !!ads.site_entry_asset_id },
    { label: t('paxlog.ads_detail.checklist.category'), done: !!ads.visit_category },
    { label: t('paxlog.ads_detail.checklist.dates'), done: !!ads.start_date && !!ads.end_date },
    { label: t('paxlog.ads_detail.checklist.purpose'), done: !!ads.visit_purpose },
    { label: t('paxlog.ads_detail.checklist.passenger'), done: (adsPax?.length ?? 0) > 0 },
  ]
  const formatEventValue = (value: unknown) => {
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (value === null || value === undefined) return '—'
    return JSON.stringify(value)
  }
  const getAvmChangeFieldLabel = (field: string) => {
    const fieldLabels: Record<string, string> = {
      title: t('common.title'),
      description: t('common.description'),
      planned_start_date: t('paxlog.create_avm.window.start'),
      planned_end_date: t('paxlog.create_avm.window.end'),
      mission_type: t('paxlog.mission_type'),
      pax_quota: t('paxlog.avm_detail.fields.planned_pax'),
      requires_badge: t('paxlog.requires_badge'),
      requires_epi: t('paxlog.requires_epi'),
      requires_visa: t('paxlog.requires_visa'),
      eligible_displacement_allowance: t('paxlog.displacement_allowance'),
    }
    return fieldLabels[field] || field
  }
  const adsTimeline = (adsEvents ?? []).slice(0, 8)
  const latestOperationalImpact = (adsEvents ?? []).find((event) => ['avm_modified_requires_review', 'avm_cancelled', 'planner_activity_modified_requires_review', 'planner_activity_cancelled', 'stay_change_requested'].includes(event.event_type))
  const getAdsEventLabel = (eventType: string) => {
    const eventLabels: Record<string, string> = {
      stay_change_requested: t('paxlog.ads_detail.history.events.stay_change_requested'),
      submitted_for_initiator_review: t('paxlog.ads_detail.history.events.submitted_for_initiator_review'),
      initiator_review_approved: t('paxlog.ads_detail.history.events.initiator_review_approved'),
      initiator_review_rejected: t('paxlog.ads_detail.history.events.initiator_review_rejected'),
      submitted_for_project_review: t('paxlog.ads_detail.history.events.submitted_for_project_review'),
      project_review_approved: t('paxlog.ads_detail.history.events.project_review_approved'),
      avm_modified_requires_review: t('paxlog.ads_detail.history.events.avm_modified_requires_review'),
      avm_cancelled: t('paxlog.ads_detail.history.events.avm_cancelled'),
      planner_activity_modified_requires_review: t('paxlog.ads_detail.history.events.planner_activity_modified_requires_review'),
      planner_activity_cancelled: t('paxlog.ads_detail.history.events.planner_activity_cancelled'),
      submitted: t('paxlog.ads_detail.history.events.submitted'),
      approved: t('paxlog.ads_detail.history.events.approved'),
      in_progress: t('paxlog.ads_detail.history.events.in_progress'),
      completed: t('paxlog.ads_detail.history.events.completed'),
      rejected: t('paxlog.ads_detail.history.events.rejected'),
      requires_review: t('paxlog.ads_detail.history.events.requires_review'),
      cancelled: t('paxlog.ads_detail.history.events.cancelled'),
      resubmitted: t('paxlog.ads_detail.history.events.resubmitted'),
      updated: t('paxlog.ads_detail.history.events.updated'),
      overdue_return_alert: t('paxlog.ads_detail.history.events.overdue_return_alert'),
    }
    return eventLabels[eventType] || eventType
  }
  const latestOperationalImpactMeta = latestOperationalImpact?.metadata_json as {
    changes?: Record<string, { from?: unknown; to?: unknown; before?: unknown; after?: unknown }>
    avm_id?: string
    avm_reference?: string
    planner_activity_id?: string
    planner_activity_title?: string
    change_kinds?: string[]
    primary_change_kind?: string
  } | null
  const adsReadyToSubmit = adsSubmissionChecklist.every((item) => item.done)
  const adsNextAction =
    ads.status === 'draft'
      ? (adsReadyToSubmit
        ? t('paxlog.ads_detail.next_action.draft_ready')
        : t('paxlog.ads_detail.next_action.draft_missing'))
      : ads.status === 'submitted'
        ? t('paxlog.ads_detail.next_action.submitted')
        : ads.status === 'pending_initiator_review'
          ? t('paxlog.ads_detail.next_action.pending_initiator_review')
        : ads.status === 'pending_compliance'
          ? t('paxlog.ads_detail.next_action.pending_compliance')
          : ads.status === 'pending_validation'
            ? t('paxlog.ads_detail.next_action.pending_validation')
            : ads.status === 'pending_project_review'
              ? t('paxlog.ads_detail.next_action.pending_project_review')
            : ads.status === 'requires_review'
              ? t('paxlog.ads_detail.next_action.requires_review')
            : ads.status === 'approved'
              ? t('paxlog.ads_detail.next_action.approved')
              : ads.status === 'in_progress'
                ? t('paxlog.ads_detail.next_action.in_progress')
                : ads.status === 'completed'
                  ? t('paxlog.ads_detail.next_action.completed')
                  : ads.status === 'rejected'
                    ? t('paxlog.ads_detail.next_action.rejected')
                    : t('paxlog.ads_detail.next_action.cancelled')
  const latestOperationalImpactChanges = latestOperationalImpactMeta?.changes
  const getExternalLinkEventLabel = (action: string) => {
    const labels: Record<string, string> = {
      public_access: t('paxlog.ads_detail.external_link.events.public_access'),
      authenticated_access: t('paxlog.ads_detail.external_link.events.authenticated_access'),
      otp_sent: t('paxlog.ads_detail.external_link.events.otp_sent'),
      otp_failed: t('paxlog.ads_detail.external_link.events.otp_failed'),
      otp_validated: t('paxlog.ads_detail.external_link.events.otp_validated'),
      otp_rate_limited: t('paxlog.ads_detail.external_link.events.otp_rate_limited'),
      otp_verify_rate_limited: t('paxlog.ads_detail.external_link.events.otp_verify_rate_limited'),
      otp_locked: t('paxlog.ads_detail.external_link.events.otp_locked'),
      session_invalid: t('paxlog.ads_detail.external_link.events.session_invalid'),
      session_expired: t('paxlog.ads_detail.external_link.events.session_expired'),
      session_context_mismatch: t('paxlog.ads_detail.external_link.events.session_context_mismatch'),
      session_ip_changed: t('paxlog.ads_detail.external_link.events.session_ip_changed'),
      public_access_rate_limited: t('paxlog.ads_detail.external_link.events.public_access_rate_limited'),
    }
    return labels[action] || action
  }
  const latestStayChangeKinds = latestOperationalImpactMeta?.change_kinds ?? (
    latestOperationalImpactMeta?.primary_change_kind ? [latestOperationalImpactMeta.primary_change_kind] : []
  )
  const getStayChangeKindLabel = (kind: string) => {
    const labels: Record<string, string> = {
      extension: t('paxlog.ads_detail.operational_impact.stay_change_kinds.extension'),
      early_return: t('paxlog.ads_detail.operational_impact.stay_change_kinds.early_return'),
      transport_change: t('paxlog.ads_detail.operational_impact.stay_change_kinds.transport_change'),
      window_change: t('paxlog.ads_detail.operational_impact.stay_change_kinds.window_change'),
      stay_change: t('paxlog.ads_detail.operational_impact.stay_change_kinds.stay_change'),
    }
    return labels[kind] || kind
  }

  const handleReject = () => {
    rejectAds.mutate({ id, reason: rejectReason || undefined })
    setShowRejectForm(false)
    setRejectReason('')
  }

  const handleRequestReview = () => {
    if (!reviewReason.trim()) return
    requestReviewAds.mutate(
      { id, reason: reviewReason.trim() },
      {
        onSuccess: () => {
          setShowReviewForm(false)
          setReviewReason('')
        },
      },
    )
  }

  const handleResubmit = () => {
    if (!resubmitReason.trim()) return
    resubmitAds.mutate(
      { id, reason: resubmitReason.trim() },
      {
        onSuccess: () => {
          setShowResubmitForm(false)
          setResubmitReason('')
        },
      },
    )
  }

  const handleRequestStayChange = () => {
    if (!stayChangeReason.trim()) return
    const payload: AdsStayChangeRequest = { reason: stayChangeReason.trim() }
    if (proposedStartDate && proposedStartDate !== ads.start_date) payload.start_date = proposedStartDate
    if (proposedEndDate && proposedEndDate !== ads.end_date) payload.end_date = proposedEndDate
    if (proposedVisitPurpose.trim() && proposedVisitPurpose.trim() !== ads.visit_purpose) payload.visit_purpose = proposedVisitPurpose.trim()

    requestAdsStayChange.mutate(
      { id, payload },
      {
        onSuccess: () => {
          setShowStayChangeForm(false)
          setStayChangeReason('')
        },
      },
    )
  }

  const handleManualDeparture = () => {
    if (!manualDepartureReason.trim()) return
    manualDepartureAds.mutate(
      { id, reason: manualDepartureReason.trim() },
      {
        onSuccess: () => {
          setShowManualDepartureForm(false)
          setManualDepartureReason('')
        },
      },
    )
  }

  const handleGenerateLink = (recipient?: { user_id: string | null; contact_id: string | null }) => {
    if (!recipient?.user_id && !recipient?.contact_id) {
      toast({
        title: t('paxlog.ads_detail.external_link.no_recipient'),
        variant: 'error',
      })
      return
    }
    const popup = window.open('', '_blank')
    if (popup) {
      popup.document.write(`<html><body style="font-family: sans-serif; padding: 16px;">${t('common.loading')}</body></html>`)
      popup.document.close()
    }
    createExtLink.mutate(
      {
        adsId: id,
        payload: {
          expires_hours: 72,
          max_uses: 5,
          otp_required: true,
          recipient_user_id: recipient.user_id,
          recipient_contact_id: recipient.contact_id,
        },
      },
      {
        onSuccess: (link) => {
          setShowExternalLinkForm(false)
          const url = paxlogService.resolveExternalLinkUrl(link)
          if (popup) popup.location.href = url
          else window.open(url, '_blank')
        },
        onError: () => {
          if (popup && !popup.closed) popup.close()
        },
      },
    )
  }

  const openExternalLinkFlow = () => {
    if (eligibleExternalRecipients.length === 0) {
      toast({
        title: t('paxlog.ads_detail.external_link.no_recipient'),
        variant: 'error',
      })
      return
    }
    if (eligibleExternalRecipients.length === 1) {
      handleGenerateLink(eligibleExternalRecipients[0])
      return
    }
    setShowExternalLinkForm(true)
  }

  const handleApprovePassenger = (entryId: string) => {
    decideAdsPax.mutate({ adsId: id, entryId, payload: { action: 'approve' } })
  }

  const handleRejectPassenger = () => {
    if (!paxRejectEntryId) return
    decideAdsPax.mutate(
      {
        adsId: id,
        entryId: paxRejectEntryId,
        payload: { action: 'reject', reason: paxRejectReason.trim() || null },
      },
      {
        onSuccess: () => {
          setPaxRejectEntryId(null)
          setPaxRejectReason('')
        },
      },
    )
  }

  const addStayMovement = () => {
    setStayMovements((prev) => [...prev, { effective_date: '', from_location: '', to_location: '', transport_mode: '', notes: '' }])
  }

  const updateStayMovement = (index: number, patch: Partial<(typeof stayMovements)[number]>) => {
    setStayMovements((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const removeStayMovement = (index: number) => {
    setStayMovements((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  const handleCreateStayProgram = () => {
    const movements = stayMovements
      .filter((row) => row.effective_date || row.from_location || row.to_location || row.transport_mode || row.notes)
      .map((row) => ({
        effective_date: row.effective_date || null,
        from_location: row.from_location || null,
        to_location: row.to_location || null,
        transport_mode: row.transport_mode || null,
        notes: row.notes || null,
      }))
    if ((!stayProgramTarget.user_id && !stayProgramTarget.contact_id) || movements.length === 0) return
    const payload: StayProgramCreate = {
      ads_id: id,
      user_id: stayProgramTarget.user_id || null,
      contact_id: stayProgramTarget.contact_id || null,
      movements,
    }
    createStayProgram.mutate(payload, {
      onSuccess: () => {
        setShowStayProgramForm(false)
        setStayProgramTarget({})
        setStayMovements([{ effective_date: '', from_location: '', to_location: '', transport_mode: '', notes: '' }])
      },
    })
  }

  return (
    <DynamicPanelShell
      title={ads.reference}
      subtitle={`${t('paxlog.ads_label')} — ${visitCategoryLabels[ads.visit_category] || ads.visit_category}`}
      icon={<ClipboardList size={14} className="text-primary" />}
      actions={
        <div className="flex items-center gap-1">
          {canGenerateLink && (
            <PanelActionButton variant="default" disabled={createExtLink.isPending} onClick={openExternalLinkFlow}>
              {createExtLink.isPending ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />} {t('paxlog.ads_detail.actions.external_link')}
            </PanelActionButton>
          )}
          {canDownloadPdf && (
            <PanelActionButton variant="default" disabled={downloadPdf.isPending} onClick={() => downloadPdf.mutate(id)}>
              {downloadPdf.isPending ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} PDF
            </PanelActionButton>
          )}
          {canApprove && (
            <PanelActionButton variant="primary" disabled={approveAds.isPending} onClick={() => approveAds.mutate(id)}>
              <ThumbsUp size={12} /> {t('common.validate')}
            </PanelActionButton>
          )}
          {canStartProgress && (
            <PanelActionButton variant="primary" disabled={startAdsProgress.isPending} onClick={() => startAdsProgress.mutate(id)}>
              {startAdsProgress.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} {t('paxlog.ads_detail.actions.start_progress')}
            </PanelActionButton>
          )}
          {canCompleteAds && (
            <PanelActionButton variant="default" onClick={() => setShowManualDepartureForm(true)}>
              <LogOut size={12} /> {t('paxlog.ads_detail.actions.manual_departure')}
            </PanelActionButton>
          )}
          {canCompleteAds && (
            <PanelActionButton variant="primary" disabled={completeAds.isPending} onClick={() => completeAds.mutate(id)}>
              {completeAds.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} {t('paxlog.ads_detail.actions.complete')}
            </PanelActionButton>
          )}
          {canReject && !showRejectForm && (
            <PanelActionButton variant="default" onClick={() => setShowRejectForm(true)}>
              <ThumbsDown size={12} /> {t('common.reject')}
            </PanelActionButton>
          )}
          {canRequestReview && !showReviewForm && (
            <PanelActionButton variant="default" onClick={() => setShowReviewForm(true)}>
              <RefreshCw size={12} /> {t('paxlog.ads_detail.actions.request_review')}
            </PanelActionButton>
          )}
          {canRequestStayChange && !showStayChangeForm && (
            <PanelActionButton variant="default" onClick={() => setShowStayChangeForm(true)}>
              <Clock size={12} /> {t('paxlog.ads_detail.actions.request_stay_change')}
            </PanelActionButton>
          )}
          {canSubmit && (
            <PanelActionButton variant="primary" disabled={submitAds.isPending} onClick={() => submitAds.mutate(id)}>
              <Send size={12} /> {t('common.submit')}
            </PanelActionButton>
          )}
          {canResubmit && !showResubmitForm && (
            <PanelActionButton variant="primary" onClick={() => setShowResubmitForm(true)}>
              <RefreshCw size={12} /> {t('paxlog.ads_detail.actions.resubmit')}
            </PanelActionButton>
          )}
          {canCancel && (
            <DangerConfirmButton
              icon={<XCircle size={12} />}
              onConfirm={() => cancelAds.mutate(id)}
              confirmLabel={t('paxlog.cancel_question')}
            >
              {t('common.cancel')}
            </DangerConfirmButton>
          )}
        </div>
      }
    >
      <div className="p-4 space-y-5">
        {showExternalLinkForm && (
          <div className="border border-primary/30 rounded-lg bg-primary/5 p-3 space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-primary">{t('paxlog.ads_detail.external_link.title')}</p>
              <p className="text-xs text-muted-foreground">{t('paxlog.ads_detail.external_link.description')}</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">{t('paxlog.ads_detail.external_link.recipient_label')}</label>
              <select
                value={externalLinkRecipientKey}
                onChange={(e) => setExternalLinkRecipientKey(e.target.value)}
                className={panelInputClass}
              >
                {eligibleExternalRecipients.map((recipient) => (
                  <option key={recipient.key} value={recipient.key}>
                    {recipient.label}{recipient.contactSummary ? ` — ${recipient.contactSummary}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">{t('paxlog.ads_detail.external_link.channel_hint')}</p>
            </div>
            <div className="flex items-center gap-2">
              <PanelActionButton
                variant="primary"
                disabled={createExtLink.isPending || !selectedExternalRecipient}
                onClick={() => selectedExternalRecipient && handleGenerateLink(selectedExternalRecipient)}
              >
                {createExtLink.isPending ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                {t('paxlog.ads_detail.external_link.confirm')}
              </PanelActionButton>
              <PanelActionButton onClick={() => setShowExternalLinkForm(false)}>{t('common.cancel')}</PanelActionButton>
            </div>
          </div>
        )}

        {/* Reject reason inline form */}
        {showRejectForm && (
          <div className="border border-red-300 rounded-lg bg-red-50 dark:bg-red-900/10 dark:border-red-800 p-3 space-y-2">
            <p className="text-xs font-semibold text-red-700 dark:text-red-400">{t('paxlog.ads_detail.reject.reason_title')}</p>
            <textarea
              className="gl-form-input text-xs min-h-[60px]"
              placeholder={t('paxlog.ads_detail.reject.placeholder')}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <button className="gl-button-sm gl-button-danger" disabled={rejectAds.isPending} onClick={handleReject}>
                {rejectAds.isPending ? <Loader2 size={12} className="animate-spin" /> : <ThumbsDown size={12} />}
                {t('paxlog.confirm_reject')}
              </button>
              <button className="gl-button-sm gl-button-default" onClick={() => setShowRejectForm(false)}>{t('common.cancel')}</button>
            </div>
          </div>
        )}

        {showReviewForm && (
          <div className="border border-amber-300 rounded-lg bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">{t('paxlog.ads_detail.request_review.reason_title')}</p>
            <textarea
              className="gl-form-input text-xs min-h-[60px]"
              placeholder={t('paxlog.ads_detail.request_review.placeholder')}
              value={reviewReason}
              onChange={(e) => setReviewReason(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <button className="gl-button-sm gl-button-default" disabled={requestReviewAds.isPending || !reviewReason.trim()} onClick={handleRequestReview}>
                {requestReviewAds.isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {t('paxlog.ads_detail.request_review.confirm')}
              </button>
              <button className="gl-button-sm gl-button-default" onClick={() => setShowReviewForm(false)}>{t('common.cancel')}</button>
            </div>
          </div>
        )}

        {showStayChangeForm && (
          <div className="border border-indigo-300 rounded-lg bg-indigo-50 dark:bg-indigo-900/10 dark:border-indigo-800 p-3 space-y-3">
            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">{t('paxlog.ads_detail.stay_change.title')}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t('paxlog.ads_detail.stay_change.start_date')}</label>
                <input type="date" className="gl-form-input text-xs" value={proposedStartDate} onChange={(e) => setProposedStartDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t('paxlog.ads_detail.stay_change.end_date')}</label>
                <input type="date" className="gl-form-input text-xs" value={proposedEndDate} onChange={(e) => setProposedEndDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('paxlog.ads_detail.stay_change.visit_purpose')}</label>
              <textarea
                className="gl-form-input text-xs min-h-[56px]"
                value={proposedVisitPurpose}
                onChange={(e) => setProposedVisitPurpose(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('paxlog.ads_detail.stay_change.reason')}</label>
              <textarea
                className="gl-form-input text-xs min-h-[60px]"
                placeholder={t('paxlog.ads_detail.stay_change.reason_placeholder')}
                value={stayChangeReason}
                onChange={(e) => setStayChangeReason(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                className="gl-button-sm gl-button-default"
                disabled={requestAdsStayChange.isPending || !stayChangeReason.trim()}
                onClick={handleRequestStayChange}
              >
                {requestAdsStayChange.isPending ? <Loader2 size={12} className="animate-spin" /> : <Clock size={12} />}
                {t('paxlog.ads_detail.stay_change.confirm')}
              </button>
              <button className="gl-button-sm gl-button-default" onClick={() => setShowStayChangeForm(false)}>{t('common.cancel')}</button>
            </div>
          </div>
        )}

        {showManualDepartureForm && (
          <div className="border border-sky-300 rounded-lg bg-sky-50 dark:bg-sky-900/10 dark:border-sky-800 p-3 space-y-2">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">{t('paxlog.ads_detail.manual_departure.title')}</p>
            <textarea
              className="gl-form-input text-xs min-h-[60px]"
              placeholder={t('paxlog.ads_detail.manual_departure.placeholder')}
              value={manualDepartureReason}
              onChange={(e) => setManualDepartureReason(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <button className="gl-button-sm gl-button-default" disabled={manualDepartureAds.isPending || !manualDepartureReason.trim()} onClick={handleManualDeparture}>
                {manualDepartureAds.isPending ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
                {t('paxlog.ads_detail.manual_departure.confirm')}
              </button>
              <button className="gl-button-sm gl-button-default" onClick={() => { setShowManualDepartureForm(false); setManualDepartureReason('') }}>{t('common.cancel')}</button>
            </div>
          </div>
        )}

        {showResubmitForm && (
          <div className="border border-sky-300 rounded-lg bg-sky-50 dark:bg-sky-900/10 dark:border-sky-800 p-3 space-y-2">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">{t('paxlog.ads_detail.resubmit.reason_title')}</p>
            <textarea
              className="gl-form-input text-xs min-h-[60px]"
              placeholder={t('paxlog.ads_detail.resubmit.placeholder')}
              value={resubmitReason}
              onChange={(e) => setResubmitReason(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <button className="gl-button-sm gl-button-confirm" disabled={resubmitAds.isPending || !resubmitReason.trim()} onClick={handleResubmit}>
                {resubmitAds.isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {t('paxlog.ads_detail.resubmit.confirm')}
              </button>
              <button className="gl-button-sm gl-button-default" onClick={() => setShowResubmitForm(false)}>{t('common.cancel')}</button>
            </div>
          </div>
        )}

        {/* Status badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={ads.status} map={ADS_STATUS_MAP} />
          <span className={cn('gl-badge', ads.type === 'team' ? 'gl-badge-info' : 'gl-badge-neutral')}>
            {ads.type === 'individual' ? t('paxlog.create_ads.type.individual') : t('paxlog.create_ads.type.team')}
          </span>
          {ads.cross_company_flag && <span className="gl-badge gl-badge-warning">{t('paxlog.ads_detail.cross_company')}</span>}
        </div>

        <CollapsibleSection
          id="ads-readiness"
          title={ads.status === 'draft' ? t('paxlog.ads_detail.readiness.title_draft', { status: adsReadyToSubmit ? t('paxlog.ads_detail.readiness.ready') : t('paxlog.ads_detail.readiness.to_complete') }) : t('paxlog.ads_detail.readiness.title_readonly')}
          defaultExpanded
        >
          <div className="space-y-3">
            {ads.status === 'draft' && (
              <div className="space-y-2">
                {adsSubmissionChecklist.map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-xs">
                    <span className={cn('inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]', item.done ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300')}>
                      {item.done ? '✓' : '•'}
                    </span>
                    <span className={item.done ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
                  </div>
                ))}
                <p className="pt-1 text-[11px] text-muted-foreground">
                  {t('paxlog.ads_detail.readiness.imputation_hint')}
                </p>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.ads_detail.kpis.passengers')}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{adsPax?.length ?? 0}</p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.ads_detail.kpis.compliant_pax')}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{compliantPaxCount}</p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.ads_detail.kpis.compliance_gaps')}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{nonCompliantPaxCount}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{adsNextAction}</p>
          </div>
        </CollapsibleSection>

        {/* Visit details + Transport — 2-column grid */}
        <CollapsibleSection id="ads-visit" title={t('paxlog.ads_detail.sections.visit_transport')} defaultExpanded>
          <DetailFieldGrid>
            <ReadOnlyRow label={t('paxlog.ads_detail.fields.purpose')} value={ads.visit_purpose} />
            <ReadOnlyRow label={t('paxlog.ads_detail.fields.category')} value={visitCategoryLabels[ads.visit_category] || ads.visit_category} />
            <ReadOnlyRow label={t('paxlog.ads_detail.fields.site')} value={
              ads.site_entry_asset_id ? (
                <CrossModuleLink module="assets" id={ads.site_entry_asset_id} label={resolveAssetName(ads.site_entry_asset_id) || ads.site_name || ads.site_entry_asset_id} mode="navigate" />
              ) : (ads.site_name || '—')
            } />
            <ReadOnlyRow label={t('paxlog.ads_detail.fields.dates')} value={`${formatDate(ads.start_date)} → ${formatDate(ads.end_date)}`} />
            {ads.requester_name && <ReadOnlyRow label={t('paxlog.ads_detail.fields.requester')} value={ads.requester_name} />}
            {ads.created_by_name && ads.created_by !== ads.requester_id && <ReadOnlyRow label={t('paxlog.ads_detail.fields.created_by')} value={ads.created_by_name} />}
            {(ads.allowed_company_names?.length ?? 0) > 0 && (
              <ReadOnlyRow label={t('paxlog.ads_detail.fields.allowed_companies')} value={ads.allowed_company_names?.join(', ') || '—'} />
            )}
            {ads.project_id && (
              <ReadOnlyRow label={t('paxlog.ads_detail.fields.project')} value={
                <CrossModuleLink module="projets" id={ads.project_id} label={ads.project_name || ads.project_id} mode="navigate" />
              } />
            )}
            {ads.outbound_transport_mode && <ReadOnlyRow label={t('paxlog.ads_detail.fields.outbound_transport')} value={transportModeLabels[ads.outbound_transport_mode] || ads.outbound_transport_mode} />}
            {ads.return_transport_mode && <ReadOnlyRow label={t('paxlog.ads_detail.fields.return_transport')} value={transportModeLabels[ads.return_transport_mode] || ads.return_transport_mode} />}
          </DetailFieldGrid>
          {canEditAllowedCompanies && (
            <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3 space-y-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-foreground">{t('paxlog.ads_detail.fields.allowed_companies')}</p>
              </div>
              <AllowedCompaniesPicker
                value={allowedCompaniesDraft}
                onChange={setAllowedCompaniesDraft}
                searchValue={allowedCompanySearch}
                onSearchChange={setAllowedCompanySearch}
                disabled={updateAds.isPending}
                chipVariant="background"
              />
              <div className="flex justify-end">
                <PanelActionButton
                  variant="primary"
                  disabled={updateAds.isPending}
                  onClick={() => updateAds.mutate({ id, payload: { allowed_company_ids: allowedCompaniesDraft.map((company) => company.id) } })}
                >
                  {updateAds.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.save')}
                </PanelActionButton>
              </div>
            </div>
          )}
        </CollapsibleSection>

        {(ads.origin_mission_notice_id || ads.origin_mission_program_id) && (
          <CollapsibleSection id="ads-origin-avm" title={t('paxlog.ads_detail.sections.origin_mission')} defaultExpanded>
            <DetailFieldGrid>
              {ads.origin_mission_notice_id && (
                <ReadOnlyRow
                  label={t('paxlog.ads_detail.fields.origin_avm')}
                  value={
                    <CrossModuleLink
                      module="paxlog"
                      id={ads.origin_mission_notice_id}
                      subtype="avm"
                      label={ads.origin_mission_notice_reference || ads.origin_mission_notice_title || ads.origin_mission_notice_id}
                      mode="navigate"
                    />
                  }
                />
              )}
              {ads.origin_mission_notice_title && (
                <ReadOnlyRow label={t('paxlog.ads_detail.fields.origin_mission_title')} value={ads.origin_mission_notice_title} />
              )}
              {ads.origin_mission_program_activity && (
                <ReadOnlyRow label={t('paxlog.ads_detail.fields.origin_program_activity')} value={ads.origin_mission_program_activity} />
              )}
            </DetailFieldGrid>
          </CollapsibleSection>
        )}

        {ads.planner_activity_id && (
          <CollapsibleSection id="ads-origin-planner" title={t('paxlog.ads_detail.sections.origin_planner')} defaultExpanded>
            <DetailFieldGrid>
              <ReadOnlyRow
                label={t('paxlog.ads_detail.fields.planner_activity')}
                value={
                  <CrossModuleLink
                    module="planner"
                    id={ads.planner_activity_id}
                    label={ads.planner_activity_title || ads.planner_activity_id}
                    mode="navigate"
                  />
                }
              />
              {ads.planner_activity_title && (
                <ReadOnlyRow label={t('paxlog.ads_detail.fields.planner_activity_title')} value={ads.planner_activity_title} />
              )}
              {ads.planner_activity_status && (
                <ReadOnlyRow label={t('paxlog.ads_detail.fields.planner_activity_status')} value={ads.planner_activity_status} />
              )}
            </DetailFieldGrid>
          </CollapsibleSection>
        )}

        {latestOperationalImpact && (
          <CollapsibleSection id="ads-operational-impact" title={t('paxlog.ads_detail.sections.operational_impact')} defaultExpanded>
            <div className="space-y-2 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-3 text-xs text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/20 dark:text-amber-50">
              <p className="font-medium">
                {latestOperationalImpact.event_type === 'stay_change_requested'
                  ? t('paxlog.ads_detail.operational_impact.stay_change')
                  : latestOperationalImpact.event_type === 'avm_cancelled'
                  ? t('paxlog.ads_detail.operational_impact.avm_cancelled')
                  : latestOperationalImpact.event_type === 'planner_activity_cancelled'
                    ? t('paxlog.ads_detail.operational_impact.planner_cancelled')
                    : latestOperationalImpact.event_type === 'planner_activity_modified_requires_review'
                      ? t('paxlog.ads_detail.operational_impact.planner_modified')
                      : t('paxlog.ads_detail.operational_impact.avm_modified')}
              </p>
              {!!latestOperationalImpact.reason && (
                <p className="text-amber-900/90 dark:text-amber-100/90">{latestOperationalImpact.reason}</p>
              )}
              {!!(latestOperationalImpact.metadata_json as { avm_id?: string; avm_reference?: string } | null)?.avm_id && (
                <p className="text-amber-900/90 dark:text-amber-100/90">
                  {t('paxlog.ads_detail.history.source_avm')}{' '}
                  <CrossModuleLink
                    module="paxlog"
                    id={(latestOperationalImpact.metadata_json as { avm_id?: string }).avm_id!}
                    subtype="avm"
                  label={(latestOperationalImpact.metadata_json as { avm_reference?: string }).avm_reference || (latestOperationalImpact.metadata_json as { avm_id?: string }).avm_id!}
                  mode="navigate"
                />
              </p>
              )}
              {!!(latestOperationalImpact.metadata_json as { planner_activity_title?: string } | null)?.planner_activity_title && (
                <p className="text-amber-900/90 dark:text-amber-100/90">
                  {t('paxlog.ads_detail.fields.planner_activity_title')}{' '}
                  {(latestOperationalImpact.metadata_json as { planner_activity_title?: string }).planner_activity_title}
                </p>
              )}
              {latestOperationalImpactChanges && (
                <div className="space-y-1">
                  <p className="font-medium">{t('paxlog.ads_detail.operational_impact.changed_fields')}</p>
                  {Object.entries(latestOperationalImpactChanges).map(([field, diff]) => (
                    <div key={field} className="text-[11px] text-amber-900/90 dark:text-amber-100/90">
                      <span className="font-medium">{getAvmChangeFieldLabel(field)}</span>: {formatEventValue(diff.from ?? diff.before)} → {formatEventValue(diff.to ?? diff.after)}
                    </div>
                  ))}
                </div>
              )}
              {latestOperationalImpact.event_type === 'stay_change_requested' && latestStayChangeKinds.length > 0 && (
                <div className="space-y-1">
                  <p className="font-medium">{t('paxlog.ads_detail.operational_impact.stay_change_types')}</p>
                  <div className="flex flex-wrap gap-2">
                    {latestStayChangeKinds.map((kind) => (
                      <span key={kind} className="gl-badge gl-badge-neutral">
                        {getStayChangeKindLabel(kind)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* PAX list with compliance status + add/remove */}
        <CollapsibleSection id="ads-pax" title={t('paxlog.ads_detail.sections.passengers', { count: adsPax?.length || 0 })} defaultExpanded>
          {/* PAX Search & Add — only for draft/review status */}
          {ads && ['draft', 'requires_review'].includes(ads.status) && (
            <div className="mb-3">
              {!showPaxPicker ? (
                <button
                  className="gl-button-sm gl-button-confirm w-full"
                  onClick={() => setShowPaxPicker(true)}
                >
                  <Plus size={12} /> {t('paxlog.ads_detail.actions.add_passenger')}
                </button>
              ) : (
                <div className="space-y-2 p-2 rounded-md border border-border bg-card">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        className={cn(panelInputClass, 'pl-7')}
                        placeholder={t('paxlog.ads_detail.search_pax_placeholder')}
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
                                {c.source === 'user'
                                  ? t('paxlog.ads_detail.pax_candidate.user', { email: c.email ? ` • ${c.email}` : '' })
                                  : t('paxlog.ads_detail.pax_candidate.contact', { position: c.position ? ` • ${c.position}` : '' })}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={cn('gl-badge text-[9px]', (c.pax_type || c.type) === 'internal' ? 'gl-badge-info' : 'gl-badge-neutral')}>
                                {(c.pax_type || c.type) === 'internal' ? t('paxlog.ads_detail.passenger_type.internal') : t('paxlog.ads_detail.passenger_type.external')}
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
                    <p className="text-xs text-muted-foreground text-center py-2 italic">{t('paxlog.ads_detail.empty.pax_search', { search: paxSearch })}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {!adsPax || adsPax.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 italic">{t('paxlog.ads_detail.empty.passengers')}</p>
          ) : (
            <div className="space-y-1">
              {adsPax.map((ap: AdsPax) => (
                <div key={ap.id} className="rounded px-2 py-1.5 hover:bg-accent/50 text-xs group">
                  {(() => {
                    const complianceSummary = (ap.compliance_summary ?? null) as null | {
                      compliant?: boolean
                      covered_layers?: string[]
                      verification_sequence?: string[]
                      issues_summary?: string
                      results?: Array<{
                        credential_type_name: string
                        status: string
                        message: string
                        layer?: string | null
                        layer_label?: string | null
                        blocking?: boolean
                      }>
                    }
                    const blockingResults = (complianceSummary?.results ?? []).filter((item) => item.blocking)
                    return (
                      <>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">
                        {(ap.user_id || ap.contact_id) ? (
                          <button
                            className="font-medium text-primary hover:underline text-left"
                            onClick={() =>
                              openDynamicPanel({
                                type: 'detail',
                                module: 'paxlog',
                                id: (ap.user_id || ap.contact_id)!,
                                meta: {
                                  subtype: 'profile',
                                  pax_source: (ap.pax_source || (ap.user_id ? 'user' : 'contact')),
                                  from_ads_id: id,
                                },
                              })
                            }
                          >
                            {`${ap.pax_last_name ?? ''} ${ap.pax_first_name ?? ''}`.trim()}
                          </button>
                        ) : (
                          <>{ap.pax_last_name ?? ''} {ap.pax_first_name ?? ''}</>
                        )}
                      </p>
                      {ap.pax_badge && <p className="text-[10px] text-muted-foreground">{t('paxlog.ads_detail.fields.badge', { value: ap.pax_badge })}</p>}
                      {ap.pax_company_name && <p className="text-[10px] text-muted-foreground">{ap.pax_company_name}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {ap.compliant === true && <CheckCircle2 size={13} className="text-green-600" />}
                      {ap.compliant === false && <XCircle size={13} className="text-red-500" />}
                      <span className={cn('gl-badge', ap.pax_type === 'internal' ? 'gl-badge-info' : 'gl-badge-neutral')}>
                        {ap.pax_type === 'internal' ? t('paxlog.ads_detail.passenger_type.internal') : t('paxlog.ads_detail.passenger_type.external')}
                      </span>
                      <StatusBadge status={ap.status} />
                      {canApprove && !['approved', 'rejected', 'no_show'].includes(ap.status) && (
                        <>
                          <button
                            className="p-1 rounded text-emerald-600 hover:bg-emerald-500/10 transition-colors"
                            onClick={() => handleApprovePassenger(ap.id)}
                            title={t('paxlog.ads_detail.actions.validate_passenger')}
                          >
                            <ThumbsUp size={12} />
                          </button>
                          <button
                            className="p-1 rounded text-amber-600 hover:bg-amber-500/10 transition-colors"
                            onClick={() => {
                              setPaxRejectEntryId(ap.id)
                              setPaxRejectReason('')
                            }}
                            title={t('paxlog.ads_detail.actions.reject_passenger')}
                          >
                            <ThumbsDown size={12} />
                          </button>
                        </>
                      )}
                      {(ap.user_id || ap.contact_id) && hasPermission('paxlog.ads.update') && (
                        <button
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          onClick={() => removePax.mutate({ adsId: id, entryId: ap.id })}
                          title={t('paxlog.ads_detail.actions.remove_passenger')}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  {complianceSummary && (
                    <div className="mt-2 space-y-1.5">
                      {(complianceSummary.verification_sequence ?? complianceSummary.covered_layers ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {(complianceSummary.verification_sequence ?? complianceSummary.covered_layers ?? []).map((layer) => (
                            <span key={`${ap.id}-${layer}`} className="gl-badge gl-badge-neutral">
                              {layer === 'site_requirements'
                                ? t('paxlog.ads_detail.compliance.layers.site_requirements')
                                : layer === 'job_profile'
                                  ? t('paxlog.ads_detail.compliance.layers.job_profile')
                                  : t('paxlog.ads_detail.compliance.layers.self_declaration')}
                            </span>
                          ))}
                        </div>
                      )}
                      {blockingResults.length > 0 ? (
                        <div className="rounded-md border border-amber-300/50 bg-amber-50/70 px-2 py-1.5 text-[11px] text-amber-900 dark:border-amber-700 dark:bg-amber-950/20 dark:text-amber-200">
                          <p className="font-semibold">{t('paxlog.ads_detail.compliance.blocking_title')}</p>
                          <div className="mt-1 space-y-1">
                            {blockingResults.map((item, index) => (
                              <p key={`${ap.id}-compliance-${index}`}>
                                <span className="font-medium">{item.layer_label || item.layer || 'Compliance'}</span>
                                {' - '}
                                {item.message}
                              </p>
                            ))}
                          </div>
                        </div>
                      ) : complianceSummary.compliant === true ? (
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                          {t('paxlog.ads_detail.compliance.compliant')}
                        </p>
                      ) : null}
                    </div>
                  )}
                  {paxRejectEntryId === ap.id && (
                    <div className="mt-2 rounded-md border border-border bg-card p-2 space-y-2">
                      <textarea
                        className="gl-form-input text-xs min-h-[56px]"
                        placeholder={t('paxlog.ads_detail.reject.passenger_placeholder')}
                        value={paxRejectReason}
                        onChange={(e) => setPaxRejectReason(e.target.value)}
                      />
                      <div className="flex items-center gap-2">
                        <button className="gl-button-sm gl-button-danger" disabled={decideAdsPax.isPending} onClick={handleRejectPassenger}>
                          {t('common.reject')}
                        </button>
                        <button
                          className="gl-button-sm gl-button-secondary"
                          onClick={() => {
                            setPaxRejectEntryId(null)
                            setPaxRejectReason('')
                          }}
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  )}
                      </>
                    )
                  })()}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* Cost Imputations */}
        <CollapsibleSection id="ads-imputations" title={t('paxlog.ads_detail.sections.imputations')} defaultExpanded>
          {imputationSuggestion && (
            <div className="mb-3 rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('paxlog.ads_detail.imputation.backend_suggestion')}</p>
              <p className="mt-1 text-xs text-foreground">
                {t('paxlog.ads_detail.imputation.project')}: <span className="font-medium">{imputationSuggestion.project_name || t('common.none')}</span>
                {' • '}
                {t('paxlog.ads_detail.imputation.cost_center')}: <span className="font-medium">{imputationSuggestion.cost_center_name || t('common.none')}</span>
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t('paxlog.ads_detail.imputation.sources', { project: imputationSuggestion.project_source, cost_center: imputationSuggestion.cost_center_source })}
              </p>
            </div>
          )}
          <ImputationManager
            ownerType="ads"
            ownerId={id}
            editable={!!ads && ['draft', 'requires_review'].includes(ads.status)}
            defaultProjectId={imputationSuggestion?.project_id || ads.project_id}
            defaultCostCenterId={imputationSuggestion?.cost_center_id || null}
          />
        </CollapsibleSection>

        <CollapsibleSection id="ads-stay-programs" title={t('paxlog.ads_detail.sections.stay_programs', { count: stayPrograms.length })} defaultExpanded>
          <div className="space-y-3 p-3">
            {canManageStayPrograms && !showStayProgramForm && (
              <PanelActionButton onClick={() => setShowStayProgramForm(true)}>
                <Plus size={12} /> {t('paxlog.ads_detail.stay_programs.create')}
              </PanelActionButton>
            )}

            {showStayProgramForm && (
              <div className="space-y-3 rounded-lg border border-border bg-card p-3">
                <DynamicPanelField label={t('paxlog.ads_detail.stay_programs.target_pax')}>
                  <select
                    value={stayProgramTarget.user_id || stayProgramTarget.contact_id || ''}
                    onChange={(e) => {
                      const selected = adsPax?.find((entry) => (entry.user_id || entry.contact_id) === e.target.value)
                      setStayProgramTarget({
                        user_id: selected?.user_id || null,
                        contact_id: selected?.contact_id || null,
                      })
                    }}
                    className={panelInputClass}
                  >
                    <option value="">{t('common.select')}</option>
                    {(adsPax || []).map((entry) => {
                      const value = entry.user_id || entry.contact_id || ''
                      const label = `${entry.pax_last_name || ''} ${entry.pax_first_name || ''}`.trim() || entry.pax_badge || value
                      return <option key={entry.id} value={value}>{label}</option>
                    })}
                  </select>
                </DynamicPanelField>

                {stayMovements.map((movement, index) => (
                  <div key={index} className="space-y-2 rounded-md border border-border/70 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-foreground">{t('paxlog.ads_detail.stay_programs.movement', { index: index + 1 })}</p>
                      {stayMovements.length > 1 && (
                        <button type="button" className="text-xs text-danger hover:underline" onClick={() => removeStayMovement(index)}>
                          {t('common.delete')}
                        </button>
                      )}
                    </div>
                    <FormGrid className="@\[900px\]:grid-cols-2">
                      <DynamicPanelField label={t('paxlog.ads_detail.stay_programs.fields.effective_date')}>
                        <input type="date" value={movement.effective_date} onChange={(e) => updateStayMovement(index, { effective_date: e.target.value })} className={panelInputClass} />
                      </DynamicPanelField>
                      <DynamicPanelField label={t('paxlog.ads_detail.stay_programs.fields.transport_mode')}>
                        <input value={movement.transport_mode} onChange={(e) => updateStayMovement(index, { transport_mode: e.target.value })} className={panelInputClass} />
                      </DynamicPanelField>
                      <DynamicPanelField label={t('paxlog.ads_detail.stay_programs.fields.from_location')}>
                        <input value={movement.from_location} onChange={(e) => updateStayMovement(index, { from_location: e.target.value })} className={panelInputClass} />
                      </DynamicPanelField>
                      <DynamicPanelField label={t('paxlog.ads_detail.stay_programs.fields.to_location')}>
                        <input value={movement.to_location} onChange={(e) => updateStayMovement(index, { to_location: e.target.value })} className={panelInputClass} />
                      </DynamicPanelField>
                    </FormGrid>
                    <DynamicPanelField label={t('common.notes')}>
                      <textarea value={movement.notes} onChange={(e) => updateStayMovement(index, { notes: e.target.value })} className={cn(panelInputClass, 'min-h-[56px] resize-y')} />
                    </DynamicPanelField>
                  </div>
                ))}

                <div className="flex items-center gap-2">
                  <PanelActionButton onClick={addStayMovement}>
                    <Plus size={12} /> {t('paxlog.ads_detail.stay_programs.add_movement')}
                  </PanelActionButton>
                  <PanelActionButton variant="primary" disabled={createStayProgram.isPending || (!stayProgramTarget.user_id && !stayProgramTarget.contact_id)} onClick={handleCreateStayProgram}>
                    {createStayProgram.isPending ? <Loader2 size={12} className="animate-spin" /> : <><Send size={12} /> {t('common.create')}</>}
                  </PanelActionButton>
                  <PanelActionButton onClick={() => setShowStayProgramForm(false)}>
                    <X size={12} /> {t('common.cancel')}
                  </PanelActionButton>
                </div>
              </div>
            )}

            {stayPrograms.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">{t('paxlog.ads_detail.stay_programs.empty')}</p>
            ) : (
              <div className="space-y-3">
                {stayPrograms.map((program) => {
                  const paxEntry = adsPax?.find((entry) =>
                    (program.user_id && entry.user_id === program.user_id) ||
                    (program.contact_id && entry.contact_id === program.contact_id),
                  )
                  const paxLabel = `${paxEntry?.pax_last_name || ''} ${paxEntry?.pax_first_name || ''}`.trim() || paxEntry?.pax_badge || t('paxlog.ads_detail.stay_programs.unknown_pax')
                  return (
                    <div key={program.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">{paxLabel}</p>
                          <p className="text-[11px] text-muted-foreground">{t('paxlog.ads_detail.stay_programs.created_at', { date: formatDate(program.created_at) })}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={program.status} map={{
                            draft: { labelKey: 'paxlog.status.ads.draft', badge: 'gl-badge-neutral' },
                            submitted: { labelKey: 'paxlog.status.ads.submitted', badge: 'gl-badge-info' },
                            approved: { labelKey: 'paxlog.status.ads.approved', badge: 'gl-badge-success' },
                            rejected: { labelKey: 'paxlog.status.ads.rejected', badge: 'gl-badge-danger' },
                          }} />
                          {program.status === 'draft' && canManageStayPrograms && (
                            <PanelActionButton onClick={() => submitStayProgram.mutate(program.id)} disabled={submitStayProgram.isPending}>
                              <Send size={12} /> {t('common.submit')}
                            </PanelActionButton>
                          )}
                          {program.status === 'submitted' && canApproveStayPrograms && (
                            <PanelActionButton variant="primary" onClick={() => approveStayProgram.mutate(program.id)} disabled={approveStayProgram.isPending}>
                              <CheckCircle2 size={12} /> {t('common.validate')}
                            </PanelActionButton>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        {program.movements.map((movement, movementIndex) => (
                          <div key={movementIndex} className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{t('paxlog.ads_detail.stay_programs.movement', { index: movementIndex + 1 })}</span>
                            {' • '}
                            {String(movement.effective_date || '—')}
                            {' • '}
                            {String(movement.from_location || '—')}
                            {' → '}
                            {String(movement.to_location || '—')}
                            {movement.transport_mode ? ` • ${String(movement.transport_mode)}` : ''}
                            {movement.notes ? ` • ${String(movement.notes)}` : ''}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* Workflow timeline */}
        <CollapsibleSection id="ads-history" title={t('common.history')}>
          <div className="space-y-1">
            <ReadOnlyRow label={t('paxlog.ads_detail.history.created_at')} value={formatDate(ads.created_at)} />
            {ads.submitted_at && <ReadOnlyRow label={t('paxlog.ads_detail.history.submitted_at')} value={formatDate(ads.submitted_at)} />}
            {ads.approved_at && (
              <div className="flex items-center gap-1.5 px-2 py-1">
                <CheckCircle2 size={12} className="text-green-600 shrink-0" />
                <span className="text-xs text-green-700 dark:text-green-400 font-medium">{t('paxlog.ads_detail.history.approved_at', { date: formatDate(ads.approved_at) })}</span>
              </div>
            )}
            {ads.rejected_at && (
              <div className="px-2 py-1 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <XCircle size={12} className="text-red-600 shrink-0" />
                  <span className="text-xs text-red-700 dark:text-red-400 font-medium">{t('paxlog.ads_detail.history.rejected_at', { date: formatDate(ads.rejected_at) })}</span>
                </div>
                {ads.rejection_reason && <p className="text-xs text-muted-foreground pl-5">{ads.rejection_reason}</p>}
              </div>
            )}
            {ads.status === 'requires_review' && ads.rejection_reason && (
              <div className="px-2 py-1 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <RefreshCw size={12} className="text-amber-600 shrink-0" />
                  <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">{t('paxlog.ads_detail.history.requires_review')}</span>
                </div>
                <p className="text-xs text-muted-foreground pl-5">{ads.rejection_reason}</p>
              </div>
            )}
            {adsTimeline.map((event) => {
              const metadata = event.metadata_json as {
                changes?: Record<string, { from?: unknown; to?: unknown; before?: unknown; after?: unknown }>
                avm_id?: string
                avm_reference?: string
              } | null
              const changes = metadata?.changes
              return (
                <div key={event.id} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-foreground">{getAdsEventLabel(event.event_type)}</span>
                    <span className="text-[11px] text-muted-foreground">{formatDate(event.recorded_at)}</span>
                  </div>
                  {event.reason && <p className="text-xs text-muted-foreground">{event.reason}</p>}
                  {metadata?.avm_id && (
                    <div className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">{t('paxlog.ads_detail.history.source_avm')}</span>{' '}
                      <CrossModuleLink
                        module="paxlog"
                        id={metadata.avm_id}
                        subtype="avm"
                        label={metadata.avm_reference || metadata.avm_id}
                        mode="navigate"
                      />
                    </div>
                  )}
                  {changes && (
                    <div className="space-y-1">
                      {Object.entries(changes).map(([field, diff]) => (
                        <div key={field} className="text-[11px] text-muted-foreground">
                          <span className="font-medium text-foreground">{getAvmChangeFieldLabel(field)}</span>: {formatEventValue(diff.from ?? diff.before)} → {formatEventValue(diff.to ?? diff.after)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            <AdsExternalLinksAudit
              externalLinks={externalLinks}
              formatDateTime={formatDateTime}
              getExternalLinkEventLabel={getExternalLinkEventLabel}
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="ads-tags-notes" title={t('paxlog.ads_detail.sections.tags_notes_files')}>
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
  const severityOptions = useDictionaryOptions('pax_incident_severity')
  const [targetScope, setTargetScope] = useState<'pax' | 'company' | 'group'>('pax')

  const [paxSearch, setPaxSearch] = useState('')
  const { data: paxData, isLoading: paxLoading } = usePaxProfiles({ page: 1, page_size: 20, search: paxSearch || undefined })
  const [companySearch, setCompanySearch] = useState('')
  const { data: tiersData, isLoading: tiersLoading } = useTiers({ page: 1, page_size: 20, search: companySearch || undefined })
  const [groupSearch, setGroupSearch] = useState('')

  const [form, setForm] = useState<{
    severity: 'info' | 'warning' | 'site_ban' | 'temp_ban' | 'permanent_ban'
    description: string
    incident_date: string
    user_id: string | null
    contact_id: string | null
    company_id: string | null
    pax_group_id: string | null
    pax_display: string | null
    company_display: string | null
    group_display: string | null
    asset_id: string | null
    ban_start_date: string | null
    ban_end_date: string | null
  }>({
    severity: 'warning',
    description: '',
    incident_date: new Date().toISOString().split('T')[0],
    user_id: null,
    contact_id: null,
    company_id: null,
    pax_group_id: null,
    pax_display: null,
    company_display: null,
    group_display: null,
    asset_id: null,
    ban_start_date: null,
    ban_end_date: null,
  })
  const { data: groupData, isLoading: groupLoading } = usePaxGroups({
    page: 1,
    page_size: 20,
    search: groupSearch || undefined,
    company_id: targetScope === 'group' ? form.company_id || undefined : undefined,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createIncident.mutateAsync({
      severity: form.severity,
      description: form.description,
      incident_date: form.incident_date,
      user_id: targetScope === 'pax' ? form.user_id || null : null,
      contact_id: targetScope === 'pax' ? form.contact_id || null : null,
      company_id: targetScope === 'company' ? form.company_id || null : null,
      pax_group_id: targetScope === 'group' ? form.pax_group_id || null : null,
      asset_id: form.asset_id || null,
      ban_start_date: form.ban_start_date || null,
      ban_end_date: form.ban_end_date || null,
    })
    closeDynamicPanel()
  }

  const showBanDates = form.severity === 'temp_ban' || form.severity === 'permanent_ban'
  const showAssetTarget = form.severity === 'site_ban'

  return (
    <DynamicPanelShell
      title={t('paxlog.incident_panel.create_title')}
      subtitle={t('paxlog.incident_panel.subtitle')}
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
        <FormSection title={t('paxlog.incident_panel.sections.severity')}>
          <TagSelector
            options={severityOptions}
            value={form.severity}
            onChange={(v) => setForm({ ...form, severity: v as typeof form.severity })}
          />
        </FormSection>

        <FormSection title={t('paxlog.incident_panel.sections.concerned_pax')}>
          <TagSelector
            options={[
              { value: 'pax', label: t('paxlog.incident_panel.target_scope.pax') },
              { value: 'company', label: t('paxlog.incident_panel.target_scope.company') },
              { value: 'group', label: t('paxlog.incident_panel.target_scope.group') },
            ]}
            value={targetScope}
            onChange={(v) => {
              const next = v as 'pax' | 'company' | 'group'
              setTargetScope(next)
              setForm((prev) => ({
                ...prev,
                user_id: null,
                contact_id: null,
                company_id: next === 'company' ? prev.company_id : prev.company_id,
                pax_group_id: null,
                pax_display: null,
                company_display: next === 'pax' ? null : prev.company_display,
                group_display: null,
              }))
            }}
          />

          {targetScope === 'pax' && (
            <SearchablePicker
              label={t('paxlog.incident_panel.fields.pax_profile')}
              icon={<User size={12} className="text-muted-foreground" />}
              items={paxData?.items || []}
              isLoading={paxLoading}
              searchValue={paxSearch}
              onSearchChange={setPaxSearch}
              renderItem={(p) => <>{p.last_name} {p.first_name} {p.company_name ? <span className="text-muted-foreground">— {p.company_name}</span> : ''}</>}
              selectedId={form.user_id || form.contact_id}
              onSelect={(p) => {
                const isUser = p.pax_source === 'user' || p.pax_type === 'internal'
                setForm({
                  ...form,
                  user_id: isUser ? p.id : null,
                  contact_id: isUser ? null : p.id,
                  company_id: null,
                  pax_group_id: null,
                  pax_display: `${p.last_name} ${p.first_name}`,
                  company_display: null,
                  group_display: null,
                })
              }}
              onClear={() => setForm({ ...form, user_id: null, contact_id: null, pax_display: null })}
              placeholder={t('paxlog.incident_panel.placeholders.search_pax')}
            />
          )}

          {targetScope === 'company' && (
            <SearchablePicker
              label={t('paxlog.incident_panel.fields.company')}
              icon={<Building2 size={12} className="text-muted-foreground" />}
              items={tiersData?.items || []}
              isLoading={tiersLoading}
              searchValue={companySearch}
              onSearchChange={setCompanySearch}
              renderItem={(tier) => <>{tier.name}</>}
              selectedId={form.company_id}
              onSelect={(tier) => setForm({
                ...form,
                user_id: null,
                contact_id: null,
                company_id: tier.id,
                pax_group_id: null,
                pax_display: null,
                company_display: tier.name,
                group_display: null,
              })}
              onClear={() => setForm({ ...form, company_id: null, company_display: null })}
              placeholder={t('paxlog.incident_panel.placeholders.search_company')}
            />
          )}

          {targetScope === 'group' && (
            <div className="space-y-3">
              <SearchablePicker
                label={t('paxlog.incident_panel.fields.company_filter')}
                icon={<Building2 size={12} className="text-muted-foreground" />}
                items={tiersData?.items || []}
                isLoading={tiersLoading}
                searchValue={companySearch}
                onSearchChange={setCompanySearch}
                renderItem={(tier) => <>{tier.name}</>}
                selectedId={form.company_id}
                onSelect={(tier) => setForm({ ...form, company_id: tier.id, company_display: tier.name, pax_group_id: null, group_display: null })}
                onClear={() => setForm({ ...form, company_id: null, company_display: null, pax_group_id: null, group_display: null })}
                placeholder={t('paxlog.incident_panel.placeholders.search_company')}
              />
              <SearchablePicker
                label={t('paxlog.incident_panel.fields.pax_group')}
                icon={<Users size={12} className="text-muted-foreground" />}
                items={groupData?.items || []}
                isLoading={groupLoading}
                searchValue={groupSearch}
                onSearchChange={setGroupSearch}
                renderItem={(group) => <>{group.name}{group.company_name ? <span className="text-muted-foreground"> — {group.company_name}</span> : ''}</>}
                selectedId={form.pax_group_id}
                onSelect={(group) => setForm({
                  ...form,
                  user_id: null,
                  contact_id: null,
                  company_id: group.company_id || form.company_id,
                  pax_group_id: group.id,
                  pax_display: null,
                  company_display: group.company_name || form.company_display,
                  group_display: group.name,
                })}
                onClear={() => setForm({ ...form, pax_group_id: null, group_display: null })}
                placeholder={t('paxlog.incident_panel.placeholders.search_group')}
              />
            </div>
          )}
        </FormSection>

        <FormSection title={t('paxlog.incident_panel.sections.details')}>
          <DynamicPanelField label={t('paxlog.incident_panel.fields.incident_date')} required>
            <input type="date" required value={form.incident_date} onChange={(e) => setForm({ ...form, incident_date: e.target.value })} className={panelInputClass} />
          </DynamicPanelField>
          {showAssetTarget && (
            <DynamicPanelField label={t('paxlog.incident_panel.fields.asset')} required>
              <AssetPicker
                value={form.asset_id}
                onChange={(id) => setForm({ ...form, asset_id: id || null })}
              />
            </DynamicPanelField>
          )}
          <DynamicPanelField label={t('common.description')} required>
            <textarea required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={cn(panelInputClass, 'min-h-[80px] resize-y')} placeholder={t('paxlog.incident_panel.placeholders.description')} />
          </DynamicPanelField>
        </FormSection>

        {showBanDates && (
          <FormSection title={t('paxlog.incident_panel.sections.ban_period')}>
            {form.severity === 'temp_ban' ? (
              <DateRangePicker
                startDate={form.ban_start_date || null}
                endDate={form.ban_end_date || null}
                onStartChange={(v) => setForm({ ...form, ban_start_date: v || null })}
                onEndChange={(v) => setForm({ ...form, ban_end_date: v || null })}
                startLabel={t('paxlog.incident_panel.fields.ban_start')}
                endLabel={t('paxlog.incident_panel.fields.ban_end')}
              />
            ) : (
              <DynamicPanelField label={t('paxlog.incident_panel.fields.ban_start')}>
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
      title={t('paxlog.rotation_panel.create_title')}
      subtitle={t('paxlog.rotation_panel.subtitle')}
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
            label={t('paxlog.rotation_panel.fields.pax_profile')}
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
            placeholder={t('paxlog.rotation_panel.placeholders.search_pax')}
          />
        </FormSection>

        <FormSection title={t('assets.site')}>
          <DynamicPanelField label={t('assets.site')} required>
            <AssetPicker
              value={form.site_asset_id || null}
              onChange={(id) => setForm({ ...form, site_asset_id: id || '' })}
              label={t('assets.site')}
            />
          </DynamicPanelField>
        </FormSection>

        <FormSection title={t('paxlog.rotation_panel.sections.cycle')}>
          <FormGrid>
            <DynamicPanelField label={t('paxlog.rotation_panel.fields.days_on')} required>
              <input type="number" required min={1} value={form.days_on} onChange={(e) => setForm({ ...form, days_on: parseInt(e.target.value) || 28 })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.rotation_panel.fields.days_off')} required>
              <input type="number" required min={1} value={form.days_off} onChange={(e) => setForm({ ...form, days_off: parseInt(e.target.value) || 28 })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <DynamicPanelField label={t('paxlog.rotation_panel.fields.start_date')} required>
            <input type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={panelInputClass} />
          </DynamicPanelField>
        </FormSection>

        <FormSection title={t('common.notes')}>
          <DynamicPanelField label={t('common.notes')}>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={cn(panelInputClass, 'min-h-[60px] resize-y')} placeholder={t('paxlog.rotation_panel.placeholders.notes')} />
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

function AvmTab({ openDetail, requesterOnly = false, validatorOnly = false }: { openDetail: (id: string) => void; requesterOnly?: boolean; validatorOnly?: boolean }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState(validatorOnly ? 'in_preparation' : '')
  const missionTypeLabels = useDictionaryLabels('mission_type')

  const { data, isLoading } = useAvmList({
    page,
    page_size: pageSize,
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    scope: requesterOnly ? 'my' : undefined,
  })
  const items = data?.items || []
  const avmStats = useMemo(() => {
    const toArbitrate = items.filter((item) => ['in_preparation', 'active', 'ready'].includes(item.status)).length
    const ready = items.filter((item) => item.status === 'ready').length
    const paxPlanned = items.reduce((sum, item) => sum + (item.pax_quota ?? 0), 0)
    return { toArbitrate, ready, paxPlanned }
  }, [items])

  const avmColumns = useMemo<ColumnDef<MissionNoticeSummary, unknown>[]>(() => [
    {
      accessorKey: 'reference',
      header: t('paxlog.reference'),
      cell: ({ row }) => (
        <button className="font-medium text-primary hover:underline text-xs" onClick={() => openDetail(row.original.id)}>
          {row.original.reference}
        </button>
      ),
      size: 140,
    },
    {
      accessorKey: 'title',
      header: t('common.title'),
      cell: ({ row }) => <span className="text-xs text-foreground truncate max-w-[200px] block">{row.original.title}</span>,
    },
    {
      id: 'creator',
      header: t('paxlog.avm_detail.fields.creator'),
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.creator_name || '—'}</span>,
      size: 130,
    },
    {
      id: 'dates',
      header: t('paxlog.avm_detail.fields.planned_dates'),
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDateShort(row.original.planned_start_date)} {'—'} {formatDateShort(row.original.planned_end_date)}
        </span>
      ),
      size: 180,
    },
    {
      accessorKey: 'mission_type',
      header: t('common.type'),
      cell: ({ row }) => <span className="gl-badge gl-badge-neutral">{missionTypeLabels[row.original.mission_type] || row.original.mission_type}</span>,
      size: 110,
    },
    {
      id: 'pax_count',
      header: 'PAX',
      cell: ({ row }) => <span className="text-xs text-foreground tabular-nums">{row.original.pax_count}</span>,
      size: 60,
    },
    {
      accessorKey: 'status',
      header: t('common.status'),
      cell: ({ row }) => <StatusBadge status={row.original.status} map={AVM_STATUS_MAP} />,
      size: 120,
    },
    {
      id: 'preparation',
      header: t('paxlog.avm_table.preparation_percent'),
      cell: ({ row }) => <CompletenessBar value={row.original.preparation_progress} />,
      size: 110,
    },
  ], [missionTypeLabels, openDetail, t])

  return (
    <>
      {validatorOnly && (
        <div className="px-4 py-3 border-b border-border bg-emerald-500/[0.06]">
          <p className="text-xs text-muted-foreground">
            {t('paxlog.avm.validator_hint_prefix')} <span className="font-medium text-foreground">in_preparation</span>, {t('paxlog.avm.validator_hint_middle')} <span className="font-medium text-foreground">ready</span> {t('paxlog.avm.validator_hint_suffix')}
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        <StatCard label={requesterOnly ? t('paxlog.avm.kpis.my_avm') : validatorOnly ? t('paxlog.avm.kpis.queue_avm') : t('common.total')} value={data?.total ?? 0} icon={Briefcase} />
        <StatCard label={validatorOnly ? t('paxlog.avm.kpis.to_arbitrate') : t('paxlog.avm.kpis.in_progress')} value={avmStats.toArbitrate} icon={Clock} accent="text-amber-600 dark:text-amber-400" />
        <StatCard label={t('paxlog.avm.kpis.ready')} value={avmStats.ready} icon={CheckCircle2} accent="text-emerald-600 dark:text-emerald-400" />
        <StatCard label={t('paxlog.avm.kpis.planned_pax')} value={avmStats.paxPlanned} icon={Users} />
      </div>
      <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
        <div className="flex items-center gap-1">
          {AVM_STATUS_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => { setStatusFilter(opt.value); setPage(1) }}
              className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap', statusFilter === opt.value ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
        {data && <span className="text-xs text-muted-foreground ml-auto">{t('paxlog.avm.count', { count: data.total, scope: requesterOnly ? t('paxlog.avm.count_scope.requester') : validatorOnly ? t('paxlog.avm.count_scope.validator') : t('paxlog.avm.count_scope.default') })}</span>}
      </div>

      <PanelContent>
        <DataTable<MissionNoticeSummary>
          columns={avmColumns}
          data={items}
          isLoading={isLoading}
          pagination={data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined}
          onPaginationChange={(p) => setPage(p)}
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          searchPlaceholder={validatorOnly ? t('paxlog.avm.search.validator') : t('paxlog.avm.search.default')}
          emptyIcon={Briefcase}
          emptyTitle={validatorOnly ? t('paxlog.avm.empty.validator') : t('paxlog.avm.empty.default')}
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
  const missionTypeOptions = useDictionaryOptions('mission_type')
  const missionActivityTypeOptions = useDictionaryOptions('mission_activity_type')
  const { data: projects } = useProjects({ page: 1, page_size: 100 })

  const [form, setForm] = useState({
    title: '',
    description: '',
    planned_start_date: '',
    planned_end_date: '',
    mission_type: '',
    pax_quota: 0,
    requires_badge: false,
    requires_epi: false,
    requires_visa: false,
    eligible_displacement_allowance: false,
    global_attachments_config: '',
    per_pax_attachments_config: '',
    programs: [
      {
        activity_description: '',
        activity_type: 'visit' as 'visit' | 'meeting' | 'inspection' | 'training' | 'handover' | 'other',
        site_asset_id: '',
        planned_start_date: '',
        planned_end_date: '',
        project_id: '',
        notes: '',
      },
    ],
  })

  const avmChecklist = [
    { label: t('paxlog.create_avm.checklist.title'), done: form.title.trim().length > 0 },
    { label: t('paxlog.create_avm.checklist.mission_type'), done: !!form.mission_type },
    { label: t('paxlog.create_avm.checklist.period'), done: !!form.planned_start_date && !!form.planned_end_date },
    { label: t('paxlog.create_avm.checklist.program_line'), done: form.programs.some((p) => p.activity_description.trim().length > 0) },
  ]
  const avmReady = avmChecklist.every((item) => item.done)
  const selectedMissionType = missionTypeOptions.find((option) => option.value === form.mission_type)?.label || t('paxlog.create_avm.summary.undefined')
  const describedPrograms = form.programs.filter((program) => program.activity_description.trim().length > 0)
  const programsWithSite = form.programs.filter((program) => !!program.site_asset_id).length
  const programsWithProject = form.programs.filter((program) => !!program.project_id).length

  const updateProgram = (index: number, patch: Partial<(typeof form.programs)[number]>) => {
    setForm((prev) => ({
      ...prev,
      programs: prev.programs.map((program, i) => (i === index ? { ...program, ...patch } : program)),
    }))
  }

  const addProgramLine = () => {
    setForm((prev) => ({
      ...prev,
      programs: [
        ...prev.programs,
        {
          activity_description: '',
          activity_type: 'visit',
          site_asset_id: '',
          planned_start_date: prev.planned_start_date,
          planned_end_date: prev.planned_end_date,
          project_id: '',
          notes: '',
        },
      ],
    }))
  }

  const removeProgramLine = (index: number) => {
    setForm((prev) => ({
      ...prev,
      programs: prev.programs.length === 1 ? prev.programs : prev.programs.filter((_, i) => i !== index),
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createAvm.mutateAsync({
      title: form.title,
      description: form.description || undefined,
      planned_start_date: form.planned_start_date || undefined,
      planned_end_date: form.planned_end_date || undefined,
      mission_type: (form.mission_type || undefined) as 'standard' | 'vip' | 'regulatory' | 'emergency' | undefined,
      pax_quota: form.pax_quota,
      requires_badge: form.requires_badge,
      requires_epi: form.requires_epi,
      requires_visa: form.requires_visa,
      eligible_displacement_allowance: form.eligible_displacement_allowance,
      global_attachments_config: form.global_attachments_config.split('\n').map((item) => item.trim()).filter(Boolean),
      per_pax_attachments_config: form.per_pax_attachments_config.split('\n').map((item) => item.trim()).filter(Boolean),
      programs: form.programs
        .filter((program) => program.activity_description.trim().length > 0)
        .map((program) => ({
          activity_description: program.activity_description,
          activity_type: program.activity_type,
          site_asset_id: program.site_asset_id || null,
          planned_start_date: program.planned_start_date || null,
          planned_end_date: program.planned_end_date || null,
          project_id: program.project_id || null,
          notes: program.notes || null,
        })),
    })
    closeDynamicPanel()
  }

  return (
    <DynamicPanelShell
      title={t('paxlog.create_avm.title')}
      subtitle={t('paxlog.create_avm.subtitle')}
      icon={<Briefcase size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createAvm.isPending || !avmReady}
            onClick={() => (document.getElementById('create-avm-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createAvm.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-avm-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
        <FormSection title={t('paxlog.create_avm.sections.preparation')}>
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              {t('paxlog.create_avm.intro')}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {avmChecklist.map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-xs">
                  <span className={cn('inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]', item.done ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300')}>
                    {item.done ? '✓' : '•'}
                  </span>
                  <span className={item.done ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.create_avm.summary.mission_type')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{selectedMissionType}</p>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.create_avm.summary.planned_pax')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{form.pax_quota}</p>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.create_avm.summary.described_lines')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{describedPrograms.length} / {form.programs.length}</p>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.create_avm.summary.sites_projects')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{t('paxlog.create_avm.summary.sites_projects_value', { sites: programsWithSite, projects: programsWithProject })}</p>
            </div>
          </div>
        </FormSection>

        <FormSection title={t('paxlog.create_avm.sections.mission')}>
          <FormGrid>
            <DynamicPanelField label={t('common.title')} required>
              <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={panelInputClass} placeholder={t('paxlog.create_avm.placeholders.title')} />
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.mission_type')}>
              <select value={form.mission_type} onChange={(e) => setForm({ ...form, mission_type: e.target.value as typeof form.mission_type })} className={panelInputClass}>
                <option value="">{t('paxlog.create_ads.select_option')}</option>
                {missionTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.create_avm.fields.planned_pax')}>
              <input type="number" min={0} value={form.pax_quota} onChange={(e) => setForm({ ...form, pax_quota: parseInt(e.target.value || '0', 10) || 0 })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <DynamicPanelField label={t('common.description')}>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={cn(panelInputClass, 'min-h-[60px] resize-y')} placeholder={t('paxlog.create_avm.placeholders.description')} />
          </DynamicPanelField>
        </FormSection>

        <FormSection title={t('paxlog.create_avm.sections.planned_dates')}>
          <DateRangePicker
            startDate={form.planned_start_date || null}
            endDate={form.planned_end_date || null}
            onStartChange={(v) => setForm((prev) => ({
              ...prev,
              planned_start_date: v,
              programs: prev.programs.map((program) => (
                program.planned_start_date ? program : { ...program, planned_start_date: v }
              )),
            }))}
            onEndChange={(v) => setForm((prev) => ({
              ...prev,
              planned_end_date: v,
              programs: prev.programs.map((program) => (
                program.planned_end_date ? program : { ...program, planned_end_date: v }
              )),
            }))}
            startLabel={t('paxlog.create_avm.fields.departure')}
            endLabel={t('paxlog.create_avm.fields.return')}
          />
          <p className="text-[11px] text-muted-foreground">
            {t('paxlog.create_avm.date_hint')}
          </p>
        </FormSection>

        <FormSection title={t('paxlog.create_avm.sections.preparation_indicators')}>
          <FormGrid>
            {[
              { key: 'requires_visa' as const, label: t('paxlog.requires_visa') },
              { key: 'requires_badge' as const, label: t('paxlog.requires_badge') },
              { key: 'requires_epi' as const, label: t('paxlog.requires_epi') },
              { key: 'eligible_displacement_allowance' as const, label: t('paxlog.displacement_allowance') },
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
          <FormGrid>
            <DynamicPanelField label={t('paxlog.create_avm.fields.global_documents')}>
              <textarea
                value={form.global_attachments_config}
                onChange={(e) => setForm({ ...form, global_attachments_config: e.target.value })}
                className={cn(panelInputClass, 'min-h-[72px] resize-y')}
                placeholder={t('paxlog.create_avm.fields.documents_placeholder')}
              />
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.create_avm.fields.per_pax_documents')}>
              <textarea
                value={form.per_pax_attachments_config}
                onChange={(e) => setForm({ ...form, per_pax_attachments_config: e.target.value })}
                className={cn(panelInputClass, 'min-h-[72px] resize-y')}
                placeholder={t('paxlog.create_avm.fields.documents_placeholder')}
              />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        <FormSection title={t('paxlog.create_avm.sections.initial_program')}>
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            {t('paxlog.create_avm.program_intro')}
          </div>
          <div className="space-y-3">
            {form.programs.map((program, index) => (
              <div key={index} className="rounded-lg border border-border p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-foreground">{t('paxlog.create_avm.program.line', { index: index + 1 })}</p>
                  {form.programs.length > 1 && (
                    <button type="button" className="text-xs text-destructive hover:underline" onClick={() => removeProgramLine(index)}>
                      {t('common.delete')}
                    </button>
                  )}
                </div>
                <FormGrid>
                  <DynamicPanelField label={t('paxlog.create_avm.program.activity')} required>
                    <input
                      type="text"
                      value={program.activity_description}
                      onChange={(e) => updateProgram(index, { activity_description: e.target.value })}
                      className={panelInputClass}
                      placeholder={t('paxlog.create_avm.program.placeholders.activity')}
                    />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('paxlog.create_avm.program.activity_type')}>
                    <select value={program.activity_type} onChange={(e) => updateProgram(index, { activity_type: e.target.value as typeof program.activity_type })} className={panelInputClass}>
                      {missionActivityTypeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </DynamicPanelField>
                  <DynamicPanelField label={t('assets.site')}>
                    <AssetPicker value={program.site_asset_id || null} onChange={(id) => updateProgram(index, { site_asset_id: id || '' })} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('paxlog.create_ads.fields.project')}>
                    <select value={program.project_id} onChange={(e) => updateProgram(index, { project_id: e.target.value })} className={panelInputClass}>
                      <option value="">{t('paxlog.create_ads.no_project')}</option>
                      {(projects?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                    </select>
                  </DynamicPanelField>
                  <DynamicPanelField label={t('paxlog.create_avm.program.line_dates')}>
                    <DateRangePicker
                      startDate={program.planned_start_date || null}
                      endDate={program.planned_end_date || null}
                      onStartChange={(v) => updateProgram(index, { planned_start_date: v })}
                      onEndChange={(v) => updateProgram(index, { planned_end_date: v })}
                      startLabel={t('paxlog.create_avm.program.start')}
                      endLabel={t('paxlog.create_avm.program.end')}
                    />
                  </DynamicPanelField>
                </FormGrid>
                <DynamicPanelField label={t('common.notes')}>
                  <textarea value={program.notes} onChange={(e) => updateProgram(index, { notes: e.target.value })} className={cn(panelInputClass, 'min-h-[56px] resize-y')} placeholder={t('paxlog.create_avm.program.placeholders.notes')} />
                </DynamicPanelField>
              </div>
            ))}
            <button type="button" className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent" onClick={addProgramLine}>
              <Plus size={13} />
              {t('paxlog.create_avm.program.add_line')}
            </button>
          </div>
        </FormSection>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}


// ── AVM Detail Panel ─────────────────────────────────────────

function AvmDetailPanel({ id }: { id?: string }) {
  const { t } = useTranslation()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const modifyAvmMut = useModifyAvm()
  const submitAvmMut = useSubmitAvm()
  const approveAvmMut = useApproveAvm()
  const completeAvmMut = useCompleteAvm()
  const cancelAvmMut = useCancelAvm()
  const updatePreparationTaskMut = useUpdateAvmPreparationTask()
  const updateVisaFollowupMut = useUpdateAvmVisaFollowup()
  const updateAllowanceRequestMut = useUpdateAvmAllowanceRequest()
  const { hasPermission } = usePermission()
  const missionTypeLabels = useDictionaryLabels('mission_type')
  const missionActivityTypeLabels = useDictionaryLabels('mission_activity_type')
  const preparationTaskTypeLabels = useDictionaryLabels('pax_preparation_task_type')
  const visaStatusLabels = useDictionaryLabels('pax_mission_visa_status')
  const allowanceStatusLabels = useDictionaryLabels('pax_mission_allowance_status')
  const visaTypeOptions = useDictionaryOptions('visa_type')
  const currencyOptions = useDictionaryOptions('currency')

  const { data: avm, isLoading, isError, error } = useAvm(id || '')
  const { data: avmUsers } = useUsers({ page: 1, page_size: 200, active: true })
  const [showModifyForm, setShowModifyForm] = useState(false)
  const [taskDrafts, setTaskDrafts] = useState<Record<string, MissionPreparationTaskUpdate>>({})
  const [visaDrafts, setVisaDrafts] = useState<Record<string, MissionVisaFollowupUpdate>>({})
  const [allowanceDrafts, setAllowanceDrafts] = useState<Record<string, MissionAllowanceRequestUpdate>>({})
  const [modifyForm, setModifyForm] = useState<MissionNoticeModifyRequest>({
    title: '',
    description: '',
    planned_start_date: '',
    planned_end_date: '',
    mission_type: undefined,
    pax_quota: 0,
    reason: '',
  })

  useEffect(() => {
    if (!avm) return
    setTaskDrafts(
      Object.fromEntries(
        avm.preparation_tasks.map((task) => [
          task.id,
          {
            status: task.status,
            assigned_to_user_id: task.assigned_to_user_id,
            due_date: task.due_date,
            notes: task.notes || '',
          },
        ]),
      ),
    )
    setVisaDrafts(
      Object.fromEntries(
        avm.visa_followups.map((item) => [
          item.id,
          {
            status: item.status,
            visa_type: item.visa_type || '',
            country: item.country || '',
            notes: item.notes || '',
          },
        ]),
      ),
    )
    setAllowanceDrafts(
      Object.fromEntries(
        avm.allowance_requests.map((item) => [
          item.id,
          {
            status: item.status,
            amount: item.amount ?? null,
            currency: item.currency || '',
            payment_reference: item.payment_reference || '',
            notes: item.notes || '',
          },
        ]),
      ),
    )
  }, [avm])

  if (!id || isLoading) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<Briefcase size={14} className="text-primary" />}>
        <PanelContent><div className="flex items-center justify-center p-8"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div></PanelContent>
      </DynamicPanelShell>
    )
  }
  if (isError || !avm) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : t('common.error')
    return (
      <DynamicPanelShell title={t('paxlog.avm_detail.not_found_title')} icon={<Briefcase size={14} className="text-primary" />}>
        <PanelContent>
          <div className="p-4 space-y-2">
            <p className="text-sm text-muted-foreground">{t('paxlog.avm_detail.not_found_message')}</p>
            <p className="text-xs text-muted-foreground">{message}</p>
          </div>
        </PanelContent>
      </DynamicPanelShell>
    )
  }

  const generatedAdsCount = avm.programs.filter((program) => !!program.generated_ads_id).length
  const generatedAdsReviewCount = avm.programs.filter((program) => program.generated_ads_status === 'requires_review').length
  const generatedAdsActiveCount = avm.programs.filter((program) => program.generated_ads_status && !['completed', 'cancelled', 'rejected'].includes(program.generated_ads_status)).length
  const programsWithSiteCount = avm.programs.filter((program) => !!program.site_asset_id).length
  const programsMissingGeneratedAdsCount = avm.programs.filter((program) => !!program.site_asset_id && !program.generated_ads_id).length
  const programsWithDatesCount = avm.programs.filter((program) => !!program.planned_start_date && !!program.planned_end_date).length
  const preparationBlockingTasks = avm.preparation_tasks.filter((task) => task.task_type !== 'ads_creation' && ['pending', 'in_progress', 'blocked'].includes(task.status))
  const avmReadinessChecklist = [
    { label: t('paxlog.avm_detail.checklist.scope'), done: avm.title.trim().length > 0 && !!avm.mission_type },
    { label: t('paxlog.avm_detail.checklist.window'), done: !!avm.planned_start_date && !!avm.planned_end_date },
    { label: t('paxlog.avm_detail.checklist.program'), done: avm.programs.length > 0 },
    { label: t('paxlog.avm_detail.checklist.sites'), done: avm.programs.length > 0 && programsWithSiteCount === avm.programs.length },
    { label: t('paxlog.avm_detail.checklist.detailed_dates'), done: avm.programs.length > 0 && programsWithDatesCount === avm.programs.length },
  ]
  const avmReadyToSubmit = avmReadinessChecklist.every((item) => item.done)
  const nextAction =
    avm.status === 'draft'
      ? (avmReadyToSubmit
        ? t('paxlog.avm_detail.next_action.draft_ready')
        : t('paxlog.avm_detail.next_action.draft_missing'))
      : avm.status === 'in_preparation'
        ? t('paxlog.avm_detail.next_action.in_preparation')
        : avm.status === 'active'
          ? t('paxlog.avm_detail.next_action.active')
          : avm.status === 'ready'
            ? t('paxlog.avm_detail.next_action.ready')
            : avm.status === 'completed'
              ? t('paxlog.avm_detail.next_action.completed')
              : t('paxlog.avm_detail.next_action.cancelled')

  const canSubmit = avm.status === 'draft' && hasPermission('paxlog.avm.submit')
  const canApprove = avm.status === 'ready' && hasPermission('paxlog.avm.approve') && avm.ready_for_approval
  const canComplete = avm.status === 'active' && hasPermission('paxlog.avm.complete') && generatedAdsActiveCount === 0 && programsMissingGeneratedAdsCount === 0
  const canCancel = !['completed', 'cancelled'].includes(avm.status) && hasPermission('paxlog.avm.cancel')
  const canRequestChange = ['active', 'in_preparation', 'ready'].includes(avm.status) && hasPermission('paxlog.avm.update')
  const canManagePreparation = ['in_preparation', 'ready', 'active'].includes(avm.status) && hasPermission('paxlog.avm.update')
  const avmUsersItems = avmUsers?.items ?? []
  const openModifyForm = () => {
    setModifyForm({
      title: avm.title,
      description: avm.description || '',
      planned_start_date: avm.planned_start_date || '',
      planned_end_date: avm.planned_end_date || '',
      mission_type: avm.mission_type,
      pax_quota: avm.pax_quota,
      requires_badge: avm.requires_badge,
      requires_epi: avm.requires_epi,
      requires_visa: avm.requires_visa,
      eligible_displacement_allowance: avm.eligible_displacement_allowance,
      reason: '',
    })
    setShowModifyForm(true)
  }

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
              {submitAvmMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <><Send size={12} /> {t('common.submit')}</>}
            </PanelActionButton>
          )}
          {canApprove && (
            <PanelActionButton
              variant="primary"
              disabled={approveAvmMut.isPending}
              onClick={() => approveAvmMut.mutate(avm.id)}
            >
              {approveAvmMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <><CheckCircle2 size={12} /> {t('common.validate')}</>}
            </PanelActionButton>
          )}
          {canComplete && (
            <PanelActionButton
              variant="primary"
              disabled={completeAvmMut.isPending}
              onClick={() => completeAvmMut.mutate(avm.id)}
            >
              {completeAvmMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <><FileCheck2 size={12} /> {t('common.complete')}</>}
            </PanelActionButton>
          )}
          {canCancel && (
            <PanelActionButton
              onClick={() => cancelAvmMut.mutate({ id: avm.id })}
              disabled={cancelAvmMut.isPending}
            >
              {cancelAvmMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <><XCircle size={12} /> {t('common.cancel')}</>}
            </PanelActionButton>
          )}
          {canRequestChange && (
            <PanelActionButton onClick={openModifyForm}>
              <RefreshCw size={12} /> {t('paxlog.avm_detail.actions.modify')}
            </PanelActionButton>
          )}
        </>
      }
    >
      <div className="p-4 space-y-5">
        {showModifyForm && (
          <CollapsibleSection id="avm-modify" title={t('paxlog.avm_detail.modify.title')} defaultExpanded>
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{t('paxlog.avm_detail.modify.help')}</p>
              <FormGrid className="@\[900px\]:grid-cols-2">
                <DynamicPanelField label={t('common.title')}>
                  <input
                    value={modifyForm.title || ''}
                    onChange={(e) => setModifyForm((prev) => ({ ...prev, title: e.target.value }))}
                    className={panelInputClass}
                  />
                </DynamicPanelField>
                <DynamicPanelField label={t('paxlog.mission_type')}>
                  <select
                    value={modifyForm.mission_type || ''}
                    onChange={(e) => setModifyForm((prev) => ({ ...prev, mission_type: e.target.value as MissionNoticeModifyRequest['mission_type'] }))}
                    className={panelInputClass}
                  >
                    <option value="">{t('common.select')}</option>
                    {Object.entries(missionTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </DynamicPanelField>
                <DynamicPanelField label={t('paxlog.avm_detail.fields.planned_dates')}>
                  <DateRangePicker
                    startDate={modifyForm.planned_start_date || null}
                    endDate={modifyForm.planned_end_date || null}
                    onStartChange={(v) => setModifyForm((prev) => ({ ...prev, planned_start_date: v || '' }))}
                    onEndChange={(v) => setModifyForm((prev) => ({ ...prev, planned_end_date: v || '' }))}
                    startLabel={t('paxlog.create_avm.window.start')}
                    endLabel={t('paxlog.create_avm.window.end')}
                  />
                </DynamicPanelField>
                <DynamicPanelField label={t('paxlog.avm_detail.fields.planned_pax')}>
                  <input
                    type="number"
                    min={0}
                    value={modifyForm.pax_quota ?? 0}
                    onChange={(e) => setModifyForm((prev) => ({ ...prev, pax_quota: Number(e.target.value || 0) }))}
                    className={panelInputClass}
                  />
                </DynamicPanelField>
              </FormGrid>
              <DynamicPanelField label={t('common.description')}>
                <textarea
                  value={modifyForm.description || ''}
                  onChange={(e) => setModifyForm((prev) => ({ ...prev, description: e.target.value }))}
                  className={cn(panelInputClass, 'min-h-[72px] resize-y')}
                />
              </DynamicPanelField>
              <DynamicPanelField label={t('paxlog.avm_detail.modify.reason')}>
                <textarea
                  value={modifyForm.reason}
                  onChange={(e) => setModifyForm((prev) => ({ ...prev, reason: e.target.value }))}
                  className={cn(panelInputClass, 'min-h-[72px] resize-y')}
                  placeholder={t('paxlog.avm_detail.modify.reason_placeholder')}
                />
              </DynamicPanelField>
              {modifyAvmMut.error && (
                <p className="text-xs text-danger">
                  {((modifyAvmMut.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail) || t('common.error')}
                </p>
              )}
              <div className="flex items-center gap-2">
                <PanelActionButton
                  variant="primary"
                  disabled={modifyAvmMut.isPending || !modifyForm.reason.trim()}
                  onClick={() =>
                    modifyAvmMut.mutate(
                      { id: avm.id, payload: modifyForm },
                      { onSuccess: () => setShowModifyForm(false) },
                    )
                  }
                >
                  {modifyAvmMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <><RefreshCw size={12} /> {t('paxlog.avm_detail.modify.submit')}</>}
                </PanelActionButton>
                <PanelActionButton onClick={() => setShowModifyForm(false)}>
                  <X size={12} /> {t('common.close')}
                </PanelActionButton>
              </div>
            </div>
          </CollapsibleSection>
        )}
        <CollapsibleSection id="avm-requester-readiness" title={t('paxlog.avm_detail.readiness.title', { status: avmReadyToSubmit ? t('paxlog.avm_detail.readiness.ready') : t('paxlog.avm_detail.readiness.to_complete') })} defaultExpanded>
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {avmReadinessChecklist.map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-xs">
                  <span className={cn('inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]', item.done ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300')}>
                    {item.done ? '✓' : '•'}
                  </span>
                  <span className={item.done ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
                </div>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.avm_detail.kpis.program_lines')}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{avm.programs.length}</p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.avm_detail.kpis.generated_ads')}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{generatedAdsCount}</p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.avm_detail.kpis.open_preparation')}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{avm.open_preparation_tasks}</p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.avm_detail.kpis.planned_pax')}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{avm.pax_quota}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{nextAction}</p>
          </div>
        </CollapsibleSection>

        {generatedAdsReviewCount > 0 && (
          <CollapsibleSection id="avm-impact-warning" title={t('paxlog.avm_detail.sections.operational_impacts')} defaultExpanded>
            <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/20 dark:text-amber-100">
              {t('paxlog.avm_detail.operational_impacts.generated_ads_review', { count: generatedAdsReviewCount })}
            </div>
          </CollapsibleSection>
        )}

        {avm.status === 'active' && (generatedAdsActiveCount > 0 || programsMissingGeneratedAdsCount > 0) && (
          <CollapsibleSection id="avm-completion-blockers" title={t('paxlog.avm_detail.sections.operational_impacts')} defaultExpanded>
            <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/20 dark:text-amber-100 space-y-1.5">
              {generatedAdsActiveCount > 0 && (
                <p>{t('paxlog.avm_detail.operational_impacts.completion_blockers_active_ads', { count: generatedAdsActiveCount })}</p>
              )}
              {programsMissingGeneratedAdsCount > 0 && (
                <p>{t('paxlog.avm_detail.operational_impacts.completion_blockers_missing_ads', { count: programsMissingGeneratedAdsCount })}</p>
              )}
            </div>
          </CollapsibleSection>
        )}

        {['in_preparation', 'ready'].includes(avm.status) && preparationBlockingTasks.length > 0 && (
          <CollapsibleSection id="avm-preparation-blockers" title={t('paxlog.avm_detail.sections.operational_impacts')} defaultExpanded>
            <div className="rounded-md border border-red-300/60 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-700/50 dark:bg-red-950/20 dark:text-red-100 space-y-1.5">
              <p>{t('paxlog.avm_detail.operational_impacts.preparation_blockers', { count: preparationBlockingTasks.length })}</p>
              <p className="text-red-800/90 dark:text-red-100/90">
                {t('paxlog.avm_detail.operational_impacts.preparation_blockers_list', { tasks: preparationBlockingTasks.map((task) => task.title).join(', ') })}
              </p>
            </div>
          </CollapsibleSection>
        )}

        {(avm.last_linked_ads_set_to_review || 0) > 0 && (
          <CollapsibleSection id="avm-last-impact" title={t('paxlog.avm_detail.sections.last_changes')} defaultExpanded>
            <div className="space-y-2 rounded-md border border-border bg-card px-3 py-2 text-xs">
              <p className="text-foreground">
                {t('paxlog.avm_detail.operational_impacts.last_modification_review_count', { count: avm.last_linked_ads_set_to_review || 0 })}
              </p>
              {(avm.last_linked_ads_references || []).length > 0 && (
                <p className="text-muted-foreground">
                  {t('paxlog.avm_detail.operational_impacts.impacted_ads', { refs: (avm.last_linked_ads_references || []).join(', ') })}
                </p>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* Info section */}
        <CollapsibleSection id="avm-info" title={t('paxlog.avm_detail.sections.information')} defaultExpanded>
          <div className="space-y-2">
            <ReadOnlyRow label={t('paxlog.reference')} value={avm.reference} />
            <ReadOnlyRow label={t('common.title')} value={avm.title} />
            <ReadOnlyRow label={t('common.status')} value={<StatusBadge status={avm.status} map={AVM_STATUS_MAP} />} />
            <ReadOnlyRow label={t('paxlog.mission_type')} value={missionTypeLabels[avm.mission_type] || avm.mission_type} />
            <ReadOnlyRow label={t('paxlog.avm_detail.fields.creator')} value={avm.creator_name || '—'} />
            <ReadOnlyRow label={t('paxlog.avm_detail.fields.planned_dates')} value={`${formatDateShort(avm.planned_start_date)} — ${formatDateShort(avm.planned_end_date)}`} />
            {avm.description && <ReadOnlyRow label={t('common.description')} value={avm.description} />}
            {avm.cancellation_reason && <ReadOnlyRow label={t('paxlog.avm_detail.fields.cancellation_reason')} value={avm.cancellation_reason} />}
            {avm.last_modification_reason && <ReadOnlyRow label={t('paxlog.avm_detail.fields.last_modification_reason')} value={avm.last_modification_reason} />}
            {avm.last_modified_by_name && <ReadOnlyRow label={t('paxlog.avm_detail.fields.last_modified_by')} value={avm.last_modified_by_name} />}
            {avm.last_modified_at && <ReadOnlyRow label={t('paxlog.avm_detail.fields.last_modified_at')} value={formatDate(avm.last_modified_at)} />}
          </div>
        </CollapsibleSection>

        {!!avm.last_modification_changes && Object.keys(avm.last_modification_changes).length > 0 && (
          <CollapsibleSection id="avm-last-changes" title={t('paxlog.avm_detail.sections.last_changes')} defaultExpanded>
            <div className="space-y-2">
              {(avm.last_modified_fields || []).map((field) => {
                const change = avm.last_modification_changes?.[field]
                return (
                  <div key={field} className="rounded-md border border-border bg-card px-3 py-2 text-xs">
                    <p className="font-medium text-foreground">{field}</p>
                    <p className="mt-1 text-muted-foreground">
                      {t('paxlog.avm_detail.change.before')}: {String(change?.before ?? '—')}
                    </p>
                    <p className="text-muted-foreground">
                      {t('paxlog.avm_detail.change.after')}: {String(change?.after ?? '—')}
                    </p>
                  </div>
                )
              })}
            </div>
          </CollapsibleSection>
        )}

        {/* Indicators */}
        <CollapsibleSection id="avm-indicators" title={t('paxlog.avm_detail.sections.preparation_indicators')} defaultExpanded>
          <div className="space-y-1">
            {[
              { flag: avm.requires_visa, label: t('paxlog.requires_visa') },
              { flag: avm.requires_badge, label: t('paxlog.requires_badge') },
              { flag: avm.requires_epi, label: t('paxlog.requires_epi') },
              { flag: avm.eligible_displacement_allowance, label: t('paxlog.displacement_allowance') },
            ].map((ind) => (
              <div key={ind.label} className="flex items-center gap-2 text-xs">
                <span className={cn('w-4 h-4 rounded flex items-center justify-center text-[10px]', ind.flag ? 'bg-green-100 dark:bg-green-900/30 text-green-700' : 'bg-muted text-muted-foreground')}>
                  {ind.flag ? '✓' : '–'}
                </span>
                <span className={ind.flag ? 'text-foreground' : 'text-muted-foreground'}>{ind.label}</span>
              </div>
            ))}
          </div>
          {(avm.global_attachments_config.length > 0 || avm.per_pax_attachments_config.length > 0) && (
            <div className="mt-3 space-y-2 rounded-md border border-border bg-card px-3 py-3 text-xs">
              {avm.global_attachments_config.length > 0 && (
                <div className="space-y-1">
                  <p className="font-medium text-foreground">{t('paxlog.avm_detail.fields.global_documents')}</p>
                  <div className="flex flex-wrap gap-2">
                    {avm.global_attachments_config.map((item) => (
                      <span key={item} className="gl-badge gl-badge-neutral">{item}</span>
                    ))}
                  </div>
                </div>
              )}
              {avm.per_pax_attachments_config.length > 0 && (
                <div className="space-y-1">
                  <p className="font-medium text-foreground">{t('paxlog.avm_detail.fields.per_pax_documents')}</p>
                  <div className="flex flex-wrap gap-2">
                    {avm.per_pax_attachments_config.map((item) => (
                      <span key={item} className="gl-badge gl-badge-neutral">{item}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CollapsibleSection>

        {/* Preparation checklist */}
        <CollapsibleSection id="avm-preparation" title={t('paxlog.avm_detail.sections.preparation_tasks', { progress: avm.preparation_progress })} defaultExpanded>
          <div className="mb-2">
            <CompletenessBar value={avm.preparation_progress} />
          </div>
          {avm.preparation_tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">{t('paxlog.avm_detail.empty.preparation_tasks')}</p>
          ) : (
            <div className="space-y-2">
              {avm.preparation_tasks.map((task) => {
                const taskStatusColors: Record<string, string> = {
                  pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700',
                  in_progress: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700',
                  completed: 'bg-green-100 dark:bg-green-900/30 text-green-700',
                  cancelled: 'bg-muted text-muted-foreground',
                  blocked: 'bg-red-100 dark:bg-red-900/30 text-red-700',
                  na: 'bg-muted text-muted-foreground',
                }
                const draft = taskDrafts[task.id] ?? {
                  status: task.status,
                  assigned_to_user_id: task.assigned_to_user_id,
                  due_date: task.due_date,
                  notes: task.notes || '',
                }
                const currentAssignedUser = avmUsersItems.find((user) => user.id === (draft.assigned_to_user_id || ''))
                const assignedLabel = currentAssignedUser
                  ? `${currentAssignedUser.first_name} ${currentAssignedUser.last_name}`.trim()
                  : task.assigned_to_user_name
                const hasTaskChanges =
                  draft.status !== task.status ||
                  (draft.assigned_to_user_id || null) !== (task.assigned_to_user_id || null) ||
                  (draft.due_date || null) !== (task.due_date || null) ||
                  (draft.notes || '') !== (task.notes || '')
                return (
                  <div key={task.id} className="rounded border border-border bg-card p-2.5 space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className={cn('w-2 h-2 rounded-full shrink-0', task.status === 'completed' ? 'bg-green-500' : task.status === 'pending' ? 'bg-amber-500' : task.status === 'in_progress' ? 'bg-blue-500' : 'bg-muted-foreground')} />
                      <span className={cn('flex-1', task.status === 'cancelled' ? 'line-through text-muted-foreground' : 'text-foreground')}>{task.title}</span>
                      <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', taskStatusColors[task.status] || 'bg-muted text-muted-foreground')}>
                        {t(`paxlog.avm_detail.preparation.status.${task.status}`)}
                      </span>
                      {task.auto_generated && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                          {t('paxlog.avm_detail.preparation.auto_generated')}
                        </span>
                      )}
                    </div>
                    <div className="grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-3">
                      <div>{t('paxlog.avm_detail.preparation.meta.task_type', { type: preparationTaskTypeLabels[task.task_type] || task.task_type })}</div>
                      <div>{t('paxlog.avm_detail.preparation.meta.assignee', { assignee: assignedLabel || t('common.unassigned') })}</div>
                      <div>{t('paxlog.avm_detail.preparation.meta.due_date', { date: formatDateShort(task.due_date) })}</div>
                    </div>
                    {!!task.linked_ads_id && (
                      <div className="text-[11px]">
                        <button
                          className="text-primary hover:underline inline-flex items-center gap-1"
                          onClick={() => openDynamicPanel({ type: 'detail', module: 'paxlog', id: task.linked_ads_id!, meta: { subtype: 'ads' } })}
                        >
                          <Link2 size={10} />
                          {task.linked_ads_reference || t('paxlog.avm_detail.preparation.linked_ads')}
                        </button>
                      </div>
                    )}
                    {!!task.notes && !canManagePreparation && (
                      <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{task.notes}</p>
                    )}
                    {canManagePreparation && (
                      <div className="space-y-2 border-t border-border pt-2">
                        <FormGrid className="@\[900px\]:grid-cols-2">
                          <DynamicPanelField label={t('common.status')}>
                            <select
                              value={draft.status || task.status}
                              onChange={(e) => setTaskDrafts((prev) => ({ ...prev, [task.id]: { ...draft, status: e.target.value as MissionPreparationTaskUpdate['status'] } }))}
                              className={panelInputClass}
                            >
                              {(['pending', 'in_progress', 'completed', 'blocked', 'na', 'cancelled'] as const).map((statusOption) => (
                                <option key={statusOption} value={statusOption}>
                                  {t(`paxlog.avm_detail.preparation.status.${statusOption}`)}
                                </option>
                              ))}
                            </select>
                          </DynamicPanelField>
                          <DynamicPanelField label={t('paxlog.avm_detail.preparation.fields.assignee')}>
                            <select
                              value={draft.assigned_to_user_id || ''}
                              onChange={(e) => setTaskDrafts((prev) => ({ ...prev, [task.id]: { ...draft, assigned_to_user_id: e.target.value || null } }))}
                              className={panelInputClass}
                            >
                              <option value="">{t('common.unassigned')}</option>
                              {avmUsersItems.map((user) => (
                                <option key={user.id} value={user.id}>
                                  {`${user.first_name} ${user.last_name}`.trim() || user.email}
                                </option>
                              ))}
                            </select>
                          </DynamicPanelField>
                          <DynamicPanelField label={t('common.due_date')}>
                            <input
                              type="date"
                              value={draft.due_date || ''}
                              onChange={(e) => setTaskDrafts((prev) => ({ ...prev, [task.id]: { ...draft, due_date: e.target.value || null } }))}
                              className={panelInputClass}
                            />
                          </DynamicPanelField>
                        </FormGrid>
                        <DynamicPanelField label={t('common.notes')}>
                          <textarea
                            value={draft.notes || ''}
                            onChange={(e) => setTaskDrafts((prev) => ({ ...prev, [task.id]: { ...draft, notes: e.target.value } }))}
                            className={cn(panelInputClass, 'min-h-[64px] resize-y')}
                            placeholder={t('paxlog.avm_detail.preparation.placeholders.notes')}
                          />
                        </DynamicPanelField>
                        <div className="flex items-center gap-2">
                          <PanelActionButton
                            variant="primary"
                            disabled={updatePreparationTaskMut.isPending || !hasTaskChanges}
                            onClick={() => updatePreparationTaskMut.mutate({ avmId: avm.id, taskId: task.id, payload: draft })}
                          >
                            {updatePreparationTaskMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <><CheckCircle2 size={12} /> {t('common.save')}</>}
                          </PanelActionButton>
                          <PanelActionButton
                            onClick={() => setTaskDrafts((prev) => ({ ...prev, [task.id]: { status: task.status, assigned_to_user_id: task.assigned_to_user_id, due_date: task.due_date, notes: task.notes || '' } }))}
                            disabled={updatePreparationTaskMut.isPending || !hasTaskChanges}
                          >
                            <RefreshCw size={12} /> {t('common.reset')}
                          </PanelActionButton>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CollapsibleSection>

        {avm.visa_followups.length > 0 && (
          <CollapsibleSection id="avm-visa-followups" title={t('paxlog.avm_detail.sections.visa_followups')} defaultExpanded>
            <div className="space-y-2">
              {avm.visa_followups.map((item) => {
                const draft = visaDrafts[item.id] ?? {
                  status: item.status,
                  visa_type: item.visa_type || '',
                  country: item.country || '',
                  notes: item.notes || '',
                }
                const hasChanges =
                  draft.status !== item.status ||
                  (draft.visa_type || '') !== (item.visa_type || '') ||
                  (draft.country || '') !== (item.country || '') ||
                  (draft.notes || '') !== (item.notes || '')
                return (
                  <div key={item.id} className="rounded border border-border bg-card p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="space-y-0.5">
                        <p className="font-medium text-foreground">{item.pax_name || '—'}</p>
                        {item.company_name && <p className="text-muted-foreground">{item.company_name}</p>}
                      </div>
                      <span className="gl-badge gl-badge-neutral">{visaStatusLabels[item.status] || item.status}</span>
                    </div>
                    <div className="grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-3">
                      <div>{t('paxlog.avm_detail.followups.visa_type')}: {item.visa_type || '—'}</div>
                      <div>{t('paxlog.avm_detail.followups.country')}: {item.country || '—'}</div>
                      <div>{t('common.status')}: {visaStatusLabels[item.status] || item.status}</div>
                    </div>
                    {canManagePreparation ? (
                      <div className="space-y-2 border-t border-border pt-2">
                        <FormGrid className="@\[900px\]:grid-cols-3">
                          <DynamicPanelField label={t('common.status')}>
                            <select
                              value={draft.status || item.status}
                              onChange={(e) => setVisaDrafts((prev) => ({ ...prev, [item.id]: { ...draft, status: e.target.value as MissionVisaFollowupUpdate['status'] } }))}
                              className={panelInputClass}
                            >
                              {(['to_initiate', 'submitted', 'in_review', 'obtained', 'refused'] as const).map((statusOption) => (
                                <option key={statusOption} value={statusOption}>{visaStatusLabels[statusOption] || statusOption}</option>
                              ))}
                            </select>
                          </DynamicPanelField>
                          <DynamicPanelField label={t('paxlog.avm_detail.followups.visa_type')}>
                            <select
                              value={draft.visa_type || ''}
                              onChange={(e) => setVisaDrafts((prev) => ({ ...prev, [item.id]: { ...draft, visa_type: e.target.value || null } }))}
                              className={panelInputClass}
                            >
                              <option value="">{t('common.select')}</option>
                              {visaTypeOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </DynamicPanelField>
                          <DynamicPanelField label={t('paxlog.avm_detail.followups.country')}>
                            <input
                              value={draft.country || ''}
                              onChange={(e) => setVisaDrafts((prev) => ({ ...prev, [item.id]: { ...draft, country: e.target.value } }))}
                              className={panelInputClass}
                            />
                          </DynamicPanelField>
                        </FormGrid>
                        <DynamicPanelField label={t('common.notes')}>
                          <textarea
                            value={draft.notes || ''}
                            onChange={(e) => setVisaDrafts((prev) => ({ ...prev, [item.id]: { ...draft, notes: e.target.value } }))}
                            className={cn(panelInputClass, 'min-h-[64px] resize-y')}
                          />
                        </DynamicPanelField>
                        <PanelActionButton
                          variant="primary"
                          disabled={updateVisaFollowupMut.isPending || !hasChanges}
                          onClick={() => updateVisaFollowupMut.mutate({ avmId: avm.id, followupId: item.id, payload: draft })}
                        >
                          {updateVisaFollowupMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <><CheckCircle2 size={12} /> {t('common.save')}</>}
                        </PanelActionButton>
                      </div>
                    ) : (
                      item.notes ? <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{item.notes}</p> : null
                    )}
                  </div>
                )
              })}
            </div>
          </CollapsibleSection>
        )}

        {avm.allowance_requests.length > 0 && (
          <CollapsibleSection id="avm-allowance-requests" title={t('paxlog.avm_detail.sections.allowance_requests')} defaultExpanded>
            <div className="space-y-2">
              {avm.allowance_requests.map((item) => {
                const draft = allowanceDrafts[item.id] ?? {
                  status: item.status,
                  amount: item.amount ?? null,
                  currency: item.currency || '',
                  payment_reference: item.payment_reference || '',
                  notes: item.notes || '',
                }
                const hasChanges =
                  draft.status !== item.status ||
                  (draft.amount ?? null) !== (item.amount ?? null) ||
                  (draft.currency || '') !== (item.currency || '') ||
                  (draft.payment_reference || '') !== (item.payment_reference || '') ||
                  (draft.notes || '') !== (item.notes || '')
                return (
                  <div key={item.id} className="rounded border border-border bg-card p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="space-y-0.5">
                        <p className="font-medium text-foreground">{item.pax_name || '—'}</p>
                        {item.company_name && <p className="text-muted-foreground">{item.company_name}</p>}
                      </div>
                      <span className="gl-badge gl-badge-neutral">{allowanceStatusLabels[item.status] || item.status}</span>
                    </div>
                    <div className="grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-3">
                      <div>{t('paxlog.avm_detail.followups.amount')}: {item.amount != null ? `${item.amount} ${item.currency || ''}`.trim() : '—'}</div>
                      <div>{t('paxlog.avm_detail.followups.payment_reference')}: {item.payment_reference || '—'}</div>
                      <div>{t('common.status')}: {allowanceStatusLabels[item.status] || item.status}</div>
                    </div>
                    {canManagePreparation ? (
                      <div className="space-y-2 border-t border-border pt-2">
                        <FormGrid className="@\[900px\]:grid-cols-4">
                          <DynamicPanelField label={t('common.status')}>
                            <select
                              value={draft.status || item.status}
                              onChange={(e) => setAllowanceDrafts((prev) => ({ ...prev, [item.id]: { ...draft, status: e.target.value as MissionAllowanceRequestUpdate['status'] } }))}
                              className={panelInputClass}
                            >
                              {(['draft', 'submitted', 'approved', 'paid'] as const).map((statusOption) => (
                                <option key={statusOption} value={statusOption}>{allowanceStatusLabels[statusOption] || statusOption}</option>
                              ))}
                            </select>
                          </DynamicPanelField>
                          <DynamicPanelField label={t('paxlog.avm_detail.followups.amount')}>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={draft.amount ?? ''}
                              onChange={(e) => setAllowanceDrafts((prev) => ({ ...prev, [item.id]: { ...draft, amount: e.target.value === '' ? null : Number(e.target.value) } }))}
                              className={panelInputClass}
                            />
                          </DynamicPanelField>
                          <DynamicPanelField label={t('paxlog.avm_detail.followups.currency')}>
                            <select
                              value={draft.currency || ''}
                              onChange={(e) => setAllowanceDrafts((prev) => ({ ...prev, [item.id]: { ...draft, currency: e.target.value || null } }))}
                              className={panelInputClass}
                            >
                              <option value="">{t('common.select')}</option>
                              {currencyOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </DynamicPanelField>
                          <DynamicPanelField label={t('paxlog.avm_detail.followups.payment_reference')}>
                            <input
                              value={draft.payment_reference || ''}
                              onChange={(e) => setAllowanceDrafts((prev) => ({ ...prev, [item.id]: { ...draft, payment_reference: e.target.value } }))}
                              className={panelInputClass}
                            />
                          </DynamicPanelField>
                        </FormGrid>
                        <DynamicPanelField label={t('common.notes')}>
                          <textarea
                            value={draft.notes || ''}
                            onChange={(e) => setAllowanceDrafts((prev) => ({ ...prev, [item.id]: { ...draft, notes: e.target.value } }))}
                            className={cn(panelInputClass, 'min-h-[64px] resize-y')}
                          />
                        </DynamicPanelField>
                        <PanelActionButton
                          variant="primary"
                          disabled={updateAllowanceRequestMut.isPending || !hasChanges}
                          onClick={() => updateAllowanceRequestMut.mutate({ avmId: avm.id, requestId: item.id, payload: draft })}
                        >
                          {updateAllowanceRequestMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <><CheckCircle2 size={12} /> {t('common.save')}</>}
                        </PanelActionButton>
                      </div>
                    ) : (
                      item.notes ? <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{item.notes}</p> : null
                    )}
                  </div>
                )
              })}
            </div>
          </CollapsibleSection>
        )}

        {/* Program lines */}
        <CollapsibleSection id="avm-programs" title={t('paxlog.avm_detail.sections.program', { count: avm.programs.length })} defaultExpanded>
          {avm.programs.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">{t('paxlog.avm_detail.empty.program')}</p>
          ) : (
            <div className="space-y-2">
              {avm.programs.map((prog: MissionProgramRead, idx: number) => (
                <div key={prog.id} className="rounded border border-border p-2.5 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-muted-foreground bg-muted rounded px-1.5 py-0.5">{idx + 1}</span>
                    <span className="text-xs font-medium text-foreground flex-1 truncate">{prog.activity_description}</span>
                    <span className="text-[10px] text-muted-foreground">{missionActivityTypeLabels[prog.activity_type] || prog.activity_type}</span>
                  </div>
                  {prog.site_name && <div className="text-[11px] text-muted-foreground">{t('paxlog.avm_detail.program.site', { site: prog.site_name })}</div>}
                  {!prog.site_name && <div className="text-[11px] text-amber-700 dark:text-amber-300">{t('paxlog.avm_detail.program.site_missing')}</div>}
                  {(prog.planned_start_date || prog.planned_end_date) && (
                    <div className="text-[11px] text-muted-foreground tabular-nums">{formatDateShort(prog.planned_start_date)} — {formatDateShort(prog.planned_end_date)}</div>
                  )}
                  {!prog.planned_start_date && !prog.planned_end_date && (
                    <div className="text-[11px] text-amber-700 dark:text-amber-300">{t('paxlog.avm_detail.program.dates_missing')}</div>
                  )}
                  {(prog.pax_entries?.length || 0) > 0 && <div className="text-[11px] text-muted-foreground">{t('paxlog.avm_detail.program.pax_count', { count: prog.pax_entries.length })}</div>}
                  {prog.generated_ads_id && (
                    <div className="flex items-center justify-between gap-2">
                      <button
                        className="text-[11px] text-primary hover:underline flex items-center gap-1"
                        onClick={() => openDynamicPanel({ type: 'detail', module: 'paxlog', id: prog.generated_ads_id!, meta: { subtype: 'ads' } })}
                      >
                        <Link2 size={10} /> {prog.generated_ads_reference || t('paxlog.avm_detail.program.generated_ads')}
                      </button>
                      {prog.generated_ads_status && (
                        <StatusBadge status={prog.generated_ads_status} map={ADS_STATUS_MAP} />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* Metadata */}
        <CollapsibleSection id="avm-metadata" title={t('paxlog.avm_detail.sections.metadata')}>
          <div className="space-y-1">
            <ReadOnlyRow label={t('paxlog.avm_detail.fields.created_at')} value={formatDate(avm.created_at)} />
            <ReadOnlyRow label={t('paxlog.avm_detail.fields.updated_at')} value={formatDate(avm.updated_at)} />
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
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<MainTabId>('dashboard')
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)
  const { hasPermission, hasAny } = usePermission()

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'paxlog'
  const isRequesterProfile = hasAny(['paxlog.ads.read', 'paxlog.ads.create', 'paxlog.avm.create', 'paxlog.avm.update']) &&
    !hasAny(['paxlog.profile.read', 'paxlog.compliance.read', 'paxlog.rotation.manage', 'paxlog.profile_type.manage', 'paxlog.credtype.manage'])
  const isValidatorProfile = !isRequesterProfile && hasAny(['paxlog.ads.approve', 'paxlog.compliance.read', 'paxlog.avm.approve', 'paxlog.avm.complete'])

  const visibleTabs = useMemo(() => {
    const tabs = ALL_TABS.filter((tab) => {
      if (tab.id === 'dashboard') return true
      if (tab.id === 'ads') return hasAny(['paxlog.ads.read', 'paxlog.ads.create', 'paxlog.ads.update', 'paxlog.ads.approve'])
      if (tab.id === 'avm') return hasAny(['paxlog.avm.create', 'paxlog.avm.update', 'paxlog.avm.approve', 'paxlog.avm.complete'])
      if (tab.id === 'profiles') return hasPermission('paxlog.profile.read')
      if (tab.id === 'compliance') return hasPermission('paxlog.compliance.read')
      if (tab.id === 'signalements') return hasPermission('paxlog.incident.read')
      if (tab.id === 'rotations') return hasPermission('paxlog.rotation.manage')
      return false
    })
    return tabs.length ? tabs : ALL_TABS.filter((tab) => tab.id === 'dashboard')
  }, [hasAny, hasPermission])

  const effectiveTab = visibleTabs.some((tab) => tab.id === activeTab) ? activeTab : visibleTabs[0].id

  const handleCreate = useCallback(() => {
    if (effectiveTab === 'profiles') openDynamicPanel({ type: 'create', module: 'paxlog', meta: { subtype: 'profile' } })
    else if (effectiveTab === 'ads') openDynamicPanel({ type: 'create', module: 'paxlog', meta: { subtype: 'ads' } })
    else if (effectiveTab === 'signalements') openDynamicPanel({ type: 'create', module: 'paxlog', meta: { subtype: 'incident' } })
    else if (effectiveTab === 'rotations') openDynamicPanel({ type: 'create', module: 'paxlog', meta: { subtype: 'rotation' } })
    else if (effectiveTab === 'avm') openDynamicPanel({ type: 'create', module: 'paxlog', meta: { subtype: 'avm' } })
  }, [effectiveTab, openDynamicPanel])

  const handleOpenDetail = useCallback((id: string, meta?: Record<string, unknown>) => {
    if (effectiveTab === 'profiles') openDynamicPanel({ type: 'detail', module: 'paxlog', id, meta: { subtype: 'profile', ...(meta || {}) } })
    else if (effectiveTab === 'ads') openDynamicPanel({ type: 'detail', module: 'paxlog', id, meta: { subtype: 'ads' } })
    else if (effectiveTab === 'avm') openDynamicPanel({ type: 'detail', module: 'paxlog', id, meta: { subtype: 'avm' } })
  }, [effectiveTab, openDynamicPanel])

  const createLabel = effectiveTab === 'profiles' ? t('paxlog.actions.new_profile')
    : effectiveTab === 'ads' ? t('paxlog.new_ads')
    : effectiveTab === 'signalements' ? t('paxlog.actions.new_signalement')
    : effectiveTab === 'rotations' ? t('paxlog.actions.new_rotation')
    : effectiveTab === 'avm' ? t('paxlog.new_avm')
    : ''
  const showCreate = ['profiles', 'ads', 'signalements', 'rotations', 'avm'].includes(effectiveTab)

  return (
    <div className="flex h-full">
      {!isFullPanel && (
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <PanelHeader icon={Users} title={t('paxlog.title')} subtitle={t('paxlog.subtitle')}>
            {showCreate && <ToolbarButton icon={Plus} label={createLabel} variant="primary" onClick={handleCreate} />}
          </PanelHeader>

          {/* Tab bar */}
          <div className="flex items-center gap-1 border-b border-border px-3.5 h-9 shrink-0 overflow-x-auto">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                    effectiveTab === tab.id ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                  )}>
                  <Icon size={12} />
                  {t(tab.labelKey)}
                </button>
              )
            })}
          </div>

          {effectiveTab === 'dashboard' && (
            isRequesterProfile
              ? <RequesterHomeTab onCreateAds={() => openDynamicPanel({ type: 'create', module: 'paxlog', meta: { subtype: 'ads' } })} onCreateAvm={() => openDynamicPanel({ type: 'create', module: 'paxlog', meta: { subtype: 'avm' } })} onOpenAds={(id) => openDynamicPanel({ type: 'detail', module: 'paxlog', id, meta: { subtype: 'ads' } })} onOpenAvm={(id) => openDynamicPanel({ type: 'detail', module: 'paxlog', id, meta: { subtype: 'avm' } })} />
              : isValidatorProfile
                ? <ValidatorHomeTab onOpenAds={(id) => openDynamicPanel({ type: 'detail', module: 'paxlog', id, meta: { subtype: 'ads' } })} onOpenAvm={(id) => openDynamicPanel({ type: 'detail', module: 'paxlog', id, meta: { subtype: 'avm' } })} />
                : <div className="space-y-4"><ModuleDashboard module="paxlog" /><DashboardTab /></div>
          )}
          {effectiveTab === 'ads' && <AdsTab openDetail={handleOpenDetail} requesterOnly={isRequesterProfile} validatorOnly={isValidatorProfile} />}
          {effectiveTab === 'profiles' && <ProfilesTab openDetail={handleOpenDetail} />}
          {effectiveTab === 'compliance' && <ComplianceTab />}
          {effectiveTab === 'signalements' && <SignalementsTab />}
          {effectiveTab === 'rotations' && <RotationsTab />}
          {effectiveTab === 'avm' && <AvmTab openDetail={handleOpenDetail} requesterOnly={isRequesterProfile} validatorOnly={isValidatorProfile} />}
        </div>
      )}

      {/* Dynamic panels */}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'profile' && <CreateProfilePanel />}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'ads' && <CreateAdsPanel />}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'incident' && <CreateIncidentPanel />}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'rotation' && <CreateRotationPanel />}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'avm' && <CreateAvmPanel />}
      {dynamicPanel?.module === 'paxlog' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'profile' && <ProfileDetailPanel id={dynamicPanel.id} paxSource={(dynamicPanel.meta?.pax_source as 'user' | 'contact') || 'user'} adsId={dynamicPanel.meta?.from_ads_id as string | undefined} />}
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
    if (view.meta?.subtype === 'profile') return <ProfileDetailPanel id={view.id} paxSource={(view.meta?.pax_source as 'user' | 'contact') || 'user'} adsId={view.meta?.from_ads_id as string | undefined} />
    if (view.meta?.subtype === 'ads') return <AdsDetailPanel id={view.id} />
    if (view.meta?.subtype === 'avm') return <AvmDetailPanel id={view.id} />
  }
  return null
})
