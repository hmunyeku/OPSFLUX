/**
 * Conformite (Compliance) page — referentiel + enregistrements + exemptions.
 *
 * Onglets: Referentiel | Enregistrements | Exemptions | Fiches de poste | Regles | Transferts
 */
import { useState, useCallback, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ShieldCheck, Plus, FileCheck, Briefcase, GitBranch, ShieldOff,
} from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import { PageNavBar } from '@/components/ui/Tabs'
import type { ColumnDef } from '@tanstack/react-table'
import type { DataTablePagination, DataTableFilterDef } from '@/components/ui/DataTable/types'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { useFilterPersistence } from '@/hooks/useFilterPersistence'
import { usePageSize } from '@/hooks/usePageSize'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { ModuleDashboard } from '@/components/dashboard/ModuleDashboard'
import { useUIStore } from '@/stores/uiStore'
import { usePermission } from '@/hooks/usePermission'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import {
  useComplianceTypes,
  useComplianceRecords,
  useComplianceRules, useCreateComplianceRule, useDeleteComplianceRule,
  useJobPositions,
  useTransfers,
  useExemptions,
} from '@/hooks/useConformite'
import type {
  ComplianceType,
  ComplianceRecord,
  ComplianceRuleCreate,
  ComplianceExemption,
  JobPosition,
  TierContactTransfer,
} from '@/types/api'

import {
  type ConformiteTab,
  VALID_CONF_TABS,
  useConformiteTabs,
  useConformiteDictionaryState,
} from './shared'
import { ComplianceOwnerCell } from './components'

// Panels
import { CreateTypePanel } from './panels/CreateTypePanel'
import { TypeDetailPanel } from './panels/TypeDetailPanel'
import { CreateComplianceRecordPanel } from './panels/CreateComplianceRecordPanel'
import { ComplianceRecordDetailPanel } from './panels/ComplianceRecordDetailPanel'
import { CreateExemptionPanel } from './panels/CreateExemptionPanel'
import { ExemptionDetailPanel } from './panels/ExemptionDetailPanel'
import { CreateJobPositionPanel } from './panels/CreateJobPositionPanel'
import { JobPositionDetailPanel } from './panels/JobPositionDetailPanel'
import { CreateRulePanel } from './panels/CreateRulePanel'
import { EditRulePanel } from './panels/EditRulePanel'
import { VerificationDetailPanel } from './panels/VerificationDetailPanel'

// Tabs
import { VerificationsTab } from './tabs/VerificationsTab'
import { RulesMatrixView } from './tabs/RulesTab'

export function ConformitePage() {
  const { t } = useTranslation()
  const tabs = useConformiteTabs()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab') as ConformiteTab | null
  const [activeTab, setActiveTabRaw] = useState<ConformiteTab>(
    tabFromUrl && VALID_CONF_TABS.has(tabFromUrl) ? tabFromUrl : 'dashboard',
  )
  const setActiveTab = useCallback((tab: ConformiteTab) => {
    setActiveTabRaw(tab)
    setSearchParams(tab === 'dashboard' ? {} : { tab }, { replace: true })
  }, [setSearchParams])
  const [page, setPage] = useState(1)
  const { pageSize, setPageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [activeFilters, setActiveFilters] = useFilterPersistence<Record<string, unknown>>('conformite.filters', {})

  const {
    categoryOptions,
    categoryLabels,
    statusOptions,
    statusLabels,
    exemptionStatusOptions,
    exemptionStatusLabels,
  } = useConformiteDictionaryState()

  const { hasPermission } = usePermission()
  const canImport = hasPermission('conformite.import')
  const canExport = hasPermission('conformite.export') || hasPermission('conformite.record.read')
  const canCreateType = hasPermission('conformite.type.create')
  const canCreateRecord = hasPermission('conformite.record.create')
  const canCreateRule = hasPermission('conformite.rule.create')
  const canCreateJP = hasPermission('conformite.jobposition.create')
  const canCreateExemption = hasPermission('conformite.exemption.create')
  const canApproveExemption = hasPermission('conformite.exemption.approve')
  const canVerify = hasPermission('conformite.verify')

  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)
  const setNavItems = useUIStore((s) => s.setDynamicPanelNavItems)

  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilters, activeTab])

  const handleTabChange = useCallback((tab: ConformiteTab) => {
    setActiveTab(tab)
    setSearch('')
    setActiveFilters({})
    setPage(1)
  }, [setActiveTab, setActiveFilters])

  // Data
  const categoryFilter = typeof activeFilters.category === 'string' ? activeFilters.category : undefined
  const statusFilter = typeof activeFilters.status === 'string' ? activeFilters.status : undefined
  const departmentFilter = typeof activeFilters.department === 'string' ? activeFilters.department : undefined

  const { data: typesData, isLoading: typesLoading } = useComplianceTypes({
    page: activeTab === 'referentiel' ? page : 1,
    page_size: activeTab === 'referentiel' ? pageSize : (activeTab === 'regles' ? 200 : 1),
    category: activeTab === 'referentiel' ? categoryFilter : undefined,
    search: activeTab === 'referentiel' ? (debouncedSearch || undefined) : undefined,
  })

  const { data: recordsData, isLoading: recordsLoading } = useComplianceRecords({
    page: activeTab === 'enregistrements' ? page : 1,
    page_size: activeTab === 'enregistrements' ? pageSize : 1,
    status: activeTab === 'enregistrements' ? statusFilter : undefined,
    category: activeTab === 'enregistrements' ? categoryFilter : undefined,
    search: activeTab === 'enregistrements' ? (debouncedSearch || undefined) : undefined,
  })

  const { data: exemptionsData, isLoading: exemptionsLoading } = useExemptions({
    page: activeTab === 'exemptions' ? page : 1,
    page_size: activeTab === 'exemptions' ? pageSize : 1,
    status: activeTab === 'exemptions' ? statusFilter : undefined,
    search: activeTab === 'exemptions' ? (debouncedSearch || undefined) : undefined,
  })

  const { data: jpData, isLoading: jpLoading } = useJobPositions({
    page: activeTab === 'fiches' ? page : 1,
    page_size: activeTab === 'fiches' ? pageSize : 1,
    department: activeTab === 'fiches' ? departmentFilter : undefined,
    search: activeTab === 'fiches' ? (debouncedSearch || undefined) : undefined,
  })

  const { data: rulesData, isLoading: rulesLoading } = useComplianceRules(undefined)
  const { data: jobPositionsData } = useJobPositions({ page_size: 200 })

  const { data: transfersData, isLoading: transfersLoading } = useTransfers({
    page: activeTab === 'transferts' ? page : 1,
    page_size: activeTab === 'transferts' ? pageSize : 1,
  })

  const createRule = useCreateComplianceRule()
  const deleteRule = useDeleteComplianceRule()

  useEffect(() => {
    if (activeTab === 'referentiel' && typesData?.items) setNavItems(typesData.items.map(i => i.id))
    else if (activeTab === 'enregistrements' && recordsData?.items) setNavItems(recordsData.items.map(i => i.id))
    else if (activeTab === 'exemptions' && exemptionsData?.items) setNavItems(exemptionsData.items.map(i => i.id))
    else if (activeTab === 'fiches' && jpData?.items) setNavItems(jpData.items.map(i => i.id))
    return () => setNavItems([])
  }, [activeTab, typesData?.items, recordsData?.items, exemptionsData?.items, jpData?.items, setNavItems])

  // Filters
  const typeFilters = useMemo<DataTableFilterDef[]>(() => [
    { id: 'category', label: 'Catégorie', type: 'select', options: categoryOptions.map(o => ({ value: o.value, label: o.label })) },
  ], [categoryOptions])

  const recordFilters = useMemo<DataTableFilterDef[]>(() => [
    { id: 'category', label: 'Catégorie', type: 'select', options: categoryOptions.map(o => ({ value: o.value, label: o.label })) },
    { id: 'status', label: 'Statut', type: 'select', options: statusOptions.map(o => ({ value: o.value, label: o.label })) },
  ], [categoryOptions, statusOptions])

  const exemptionFilters = useMemo<DataTableFilterDef[]>(() => [
    { id: 'status', label: 'Statut', type: 'select', options: exemptionStatusOptions.map(o => ({ value: o.value, label: o.label })) },
  ], [exemptionStatusOptions])

  const handleFilterChange = useCallback((filterId: string, value: unknown) => {
    setActiveFilters(prev => {
      const next = { ...prev }
      if (value === undefined || value === null) delete next[filterId]
      else next[filterId] = value
      return next
    })
  }, [setActiveFilters])

  // Columns
  const typeColumns = useMemo<ColumnDef<ComplianceType, unknown>[]>(() => [
    { accessorKey: 'code', header: t('conformite.columns.code'), size: 100, cell: ({ row }) => <span className="font-medium">{row.original.code}</span> },
    { accessorKey: 'name', header: t('conformite.columns.name'), cell: ({ row }) => <span className="text-foreground">{row.original.name}</span> },
    { accessorKey: 'category', header: t('conformite.columns.category'), size: 120, cell: ({ row }) => <span className="gl-badge gl-badge-neutral">{categoryLabels[row.original.category] ?? row.original.category}</span> },
    { accessorKey: 'validity_days', header: t('conformite.columns.validity'), size: 100, cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.validity_days ? `${row.original.validity_days}j` : 'Permanent'}</span> },
    { accessorKey: 'is_mandatory', header: t('conformite.columns.mandatory'), size: 90, cell: ({ row }) => row.original.is_mandatory ? <span className="gl-badge gl-badge-warning">Oui</span> : <span className="text-muted-foreground/40">--</span> },
  ], [categoryLabels, t])

  const recordColumns = useMemo<ColumnDef<ComplianceRecord, unknown>[]>(() => [
    { accessorKey: 'type_name', header: t('conformite.columns.type'), cell: ({ row }) => <span className="text-foreground font-medium">{row.original.type_name || '--'}</span> },
    { accessorKey: 'type_category', header: t('conformite.columns.category'), size: 110, cell: ({ row }) => <span className="gl-badge gl-badge-neutral">{row.original.type_category || '--'}</span> },
    { accessorKey: 'owner_type', header: t('conformite.columns.owner'), size: 180, cell: ({ row }) => <ComplianceOwnerCell ownerType={row.original.owner_type} ownerId={row.original.owner_id} /> },
    { accessorKey: 'status', header: t('conformite.columns.status'), size: 90, cell: ({ row }) => {
      const s = row.original.status
      const cls = s === 'valid' ? 'gl-badge-success' : s === 'expired' ? 'gl-badge-danger' : s === 'pending' ? 'gl-badge-warning' : 'gl-badge-neutral'
      return <span className={cn('gl-badge', cls)}>{statusLabels[s] ?? s}</span>
    }},
    { accessorKey: 'expires_at', header: t('conformite.columns.expiration'), size: 110, cell: ({ row }) => row.original.expires_at ? <span className="text-muted-foreground text-xs">{new Date(row.original.expires_at).toLocaleDateString('fr-FR')}</span> : <span className="text-muted-foreground/40">--</span> },
    { accessorKey: 'issuer', header: t('conformite.columns.issuer'), size: 120, cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.issuer || '--'}</span> },
  ], [statusLabels, t])

  const exemptionColumns = useMemo<ColumnDef<ComplianceExemption, unknown>[]>(() => [
    { accessorKey: 'record_type_name', header: t('conformite.columns.type'), cell: ({ row }) => <span className="text-foreground font-medium">{row.original.record_type_name || '--'}</span> },
    { accessorKey: 'owner_name', header: t('conformite.columns.owner'), size: 150, cell: ({ row }) => <span className="text-foreground text-xs">{row.original.owner_name || '--'}</span> },
    { accessorKey: 'status', header: t('conformite.columns.status'), size: 100, cell: ({ row }) => {
      const s = row.original.status
      const cls = s === 'approved' ? 'gl-badge-success' : s === 'rejected' ? 'gl-badge-danger' : s === 'pending' ? 'gl-badge-warning' : 'gl-badge-neutral'
      return <span className={cn('gl-badge', cls)}>{exemptionStatusLabels[s] ?? s}</span>
    }},
    { accessorKey: 'reason', header: t('conformite.columns.reason'), cell: ({ row }) => <span className="text-muted-foreground text-xs truncate max-w-[200px] block">{row.original.reason}</span> },
    { accessorKey: 'start_date', header: t('conformite.columns.start_date'), size: 100, cell: ({ row }) => <span className="text-muted-foreground text-xs tabular-nums">{new Date(row.original.start_date).toLocaleDateString('fr-FR')}</span> },
    { accessorKey: 'end_date', header: t('conformite.columns.end_date'), size: 100, cell: ({ row }) => <span className="text-muted-foreground text-xs tabular-nums">{new Date(row.original.end_date).toLocaleDateString('fr-FR')}</span> },
    { accessorKey: 'approver_name', header: t('conformite.columns.approved_by'), size: 130, cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.approver_name || '--'}</span> },
    { accessorKey: 'created_at', header: t('conformite.columns.created_at'), size: 100, cell: ({ row }) => <span className="text-muted-foreground text-xs tabular-nums">{new Date(row.original.created_at).toLocaleDateString('fr-FR')}</span> },
  ], [exemptionStatusLabels, t])

  const jpColumns = useMemo<ColumnDef<JobPosition, unknown>[]>(() => [
    { accessorKey: 'code', header: t('conformite.columns.code'), size: 100, cell: ({ row }) => <span className="font-medium">{row.original.code}</span> },
    { accessorKey: 'name', header: t('conformite.columns.title'), cell: ({ row }) => <span className="text-foreground">{row.original.name}</span> },
    { accessorKey: 'department', header: t('conformite.columns.department'), size: 140, cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.department || '--'}</span> },
    { accessorKey: 'created_at', header: t('conformite.columns.created_at'), size: 100, cell: ({ row }) => <span className="text-muted-foreground text-xs">{new Date(row.original.created_at).toLocaleDateString('fr-FR')}</span> },
  ], [t])

  const transferColumns = useMemo<ColumnDef<TierContactTransfer, unknown>[]>(() => [
    { accessorKey: 'contact_name', header: t('conformite.columns.employee'), cell: ({ row }) => <span className="text-foreground font-medium">{row.original.contact_name || '--'}</span> },
    { accessorKey: 'from_tier_name', header: t('conformite.columns.from'), size: 180, cell: ({ row }) => row.original.from_tier_id
        ? <CrossModuleLink module="tiers" id={row.original.from_tier_id} label={row.original.from_tier_name || row.original.from_tier_id} showIcon={false} className="text-xs" />
        : <span className="text-muted-foreground text-xs">{row.original.from_tier_name || '--'}</span>,
    },
    { accessorKey: 'to_tier_name', header: t('conformite.columns.to'), size: 180, cell: ({ row }) => row.original.to_tier_id
        ? <CrossModuleLink module="tiers" id={row.original.to_tier_id} label={row.original.to_tier_name || row.original.to_tier_id} showIcon={false} className="text-xs" />
        : <span className="text-foreground text-xs">{row.original.to_tier_name || '--'}</span>,
    },
    { accessorKey: 'transfer_date', header: t('conformite.columns.date'), size: 100, cell: ({ row }) => <span className="text-muted-foreground text-xs tabular-nums">{new Date(row.original.transfer_date).toLocaleDateString('fr-FR')}</span> },
    { accessorKey: 'reason', header: t('conformite.columns.reason'), cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.reason || '--'}</span> },
  ], [t])

  const typesPagination: DataTablePagination | undefined = typesData ? { page: typesData.page, pageSize, total: typesData.total, pages: typesData.pages } : undefined
  const recordsPagination: DataTablePagination | undefined = recordsData ? { page: recordsData.page, pageSize, total: recordsData.total, pages: recordsData.pages } : undefined
  const exemptionsPagination: DataTablePagination | undefined = exemptionsData ? { page: exemptionsData.page, pageSize, total: exemptionsData.total, pages: exemptionsData.pages } : undefined
  const jpPagination: DataTablePagination | undefined = jpData ? { page: jpData.page, pageSize, total: jpData.total, pages: jpData.pages } : undefined
  const transfersPagination: DataTablePagination | undefined = transfersData ? { page: transfersData.page, pageSize, total: transfersData.total, pages: transfersData.pages } : undefined

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'conformite'

  const toolbarAction = useMemo(() => {
    if (activeTab === 'referentiel' && canCreateType) return <ToolbarButton icon={Plus} label={t('conformite.types.create')} variant="primary" onClick={() => openDynamicPanel({ type: 'create', module: 'conformite' })} />
    if (activeTab === 'fiches' && canCreateJP) return <ToolbarButton icon={Plus} label={t('conformite.job_positions.create')} variant="primary" onClick={() => openDynamicPanel({ type: 'create', module: 'conformite', meta: { subtype: 'job-position' } })} />
    if (activeTab === 'exemptions' && canCreateExemption) return <ToolbarButton icon={Plus} label={t('conformite.exemptions.create')} variant="primary" onClick={() => openDynamicPanel({ type: 'create', module: 'conformite', meta: { subtype: 'exemption' } })} />
    if (activeTab === 'enregistrements' && canCreateRecord) return <ToolbarButton icon={Plus} label={t('conformite.records.create')} variant="primary" onClick={() => openDynamicPanel({ type: 'create', module: 'conformite', meta: { subtype: 'record' } })} />
    if (activeTab === 'regles' && canCreateRule) return <ToolbarButton icon={Plus} label={t('conformite.rules.create')} variant="primary" onClick={() => openDynamicPanel({ type: 'create', module: 'conformite', meta: { subtype: 'rule' } })} />
    return null
  }, [activeTab, openDynamicPanel, canCreateType, canCreateRecord, canCreateJP, canCreateExemption, canCreateRule, t])

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <div className="space-y-4 p-4"><ModuleDashboard module="conformite" toolbarPortalId="dash-toolbar-conformite" /></div>
      case 'referentiel':
        return (
          <DataTable<ComplianceType>
            columns={typeColumns}
            data={typesData?.items ?? []}
            isLoading={typesLoading}
            pagination={typesPagination}
            onPaginationChange={(p, size) => { if (size !== pageSize) { setPageSize(size); setPage(1) } else setPage(p) }}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder={t('conformite.search_type')}
            filters={typeFilters}
            activeFilters={activeFilters}
            onFilterChange={handleFilterChange}
            onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'conformite', id: row.id })}
            emptyIcon={ShieldCheck}
            emptyTitle={t('conformite.no_type')}
            columnResizing
            columnVisibility
            storageKey="conformite-types"
          />
        )
      case 'enregistrements':
        return (
          <DataTable<ComplianceRecord>
            columns={recordColumns}
            data={recordsData?.items ?? []}
            isLoading={recordsLoading}
            pagination={recordsPagination}
            onPaginationChange={(p, size) => { if (size !== pageSize) { setPageSize(size); setPage(1) } else setPage(p) }}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder={t('conformite.search_record')}
            filters={recordFilters}
            activeFilters={activeFilters}
            onFilterChange={handleFilterChange}
            importExport={(canExport || canImport) ? {
              exportFormats: canExport ? ['csv', 'xlsx'] : undefined,
              advancedExport: true,
              importWizardTarget: canImport ? 'compliance_record' : undefined,
              filenamePrefix: 'conformite',
            } : undefined}
            onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'conformite', id: row.id, meta: { subtype: 'record' } })}
            emptyIcon={FileCheck}
            emptyTitle={t('conformite.no_record')}
            columnResizing
            columnVisibility
            storageKey="conformite-records"
          />
        )
      case 'verifications':
        return <VerificationsTab />
      case 'exemptions':
        return (
          <DataTable<ComplianceExemption>
            columns={exemptionColumns}
            data={exemptionsData?.items ?? []}
            isLoading={exemptionsLoading}
            pagination={exemptionsPagination}
            onPaginationChange={(p, size) => { if (size !== pageSize) { setPageSize(size); setPage(1) } else setPage(p) }}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder={t('conformite.search_exemption')}
            filters={exemptionFilters}
            activeFilters={activeFilters}
            onFilterChange={handleFilterChange}
            onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'conformite', id: row.id, meta: { subtype: 'exemption' } })}
            emptyIcon={ShieldOff}
            emptyTitle={t('conformite.exemptions.empty')}
            columnResizing
            columnVisibility
            storageKey="conformite-exemptions"
          />
        )
      case 'fiches':
        return (
          <DataTable<JobPosition>
            columns={jpColumns}
            data={jpData?.items ?? []}
            isLoading={jpLoading}
            pagination={jpPagination}
            onPaginationChange={(p, size) => { if (size !== pageSize) { setPageSize(size); setPage(1) } else setPage(p) }}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder={t('conformite.search_job_position')}
            onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'conformite', id: row.id, meta: { subtype: 'job-position' } })}
            emptyIcon={Briefcase}
            emptyTitle={t('conformite.no_job_position')}
            columnResizing
            columnVisibility
            storageKey="conformite-fiches"
          />
        )
      case 'regles':
        return (
          <RulesMatrixView
            rules={rulesData ?? []}
            types={typesData?.items ?? []}
            jobPositions={jobPositionsData?.items ?? []}
            isLoading={rulesLoading}
            onCreateRule={(payload) => createRule.mutate(payload as ComplianceRuleCreate)}
            onDeleteRule={(id) => deleteRule.mutate({ id })}
            onEditRule={(rule) => openDynamicPanel({ type: 'edit', module: 'conformite', id: rule.id, meta: { subtype: 'rule' }, data: { rule } })}
            onCreateRulePanel={(prefill) => openDynamicPanel({ type: 'create', module: 'conformite', meta: { subtype: 'rule', prefill_type_id: prefill.type_id, prefill_target_type: prefill.target_type, prefill_target_value: prefill.target_value || '' } })}
          />
        )
      case 'transferts':
        return (
          <DataTable<TierContactTransfer>
            columns={transferColumns}
            data={transfersData?.items ?? []}
            isLoading={transfersLoading}
            pagination={transfersPagination}
            onPaginationChange={(p, size) => { if (size !== pageSize) { setPageSize(size); setPage(1) } else setPage(p) }}
            emptyIcon={GitBranch}
            emptyTitle={t('conformite.no_transfer')}
            columnResizing
            storageKey="conformite-transferts"
          />
        )
    }
  }

  return (
    <div className="flex h-full">
      {!isFullPanel && <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <PanelHeader icon={ShieldCheck} title="Conformité" subtitle="Formations, certifications, habilitations, audits">
          {toolbarAction}
        </PanelHeader>

        <PageNavBar
          items={tabs.filter((tab) => {
            if (tab.id === 'dashboard') return hasPermission('conformite.record.read')
            if (tab.id === 'verifications') return canVerify
            if (tab.id === 'exemptions') return canCreateExemption || canApproveExemption || hasPermission('conformite.exemption.read')
            if (tab.id === 'referentiel') return hasPermission('conformite.type.read')
            if (tab.id === 'enregistrements') return hasPermission('conformite.record.read')
            if (tab.id === 'fiches') return hasPermission('conformite.jobposition.read')
            if (tab.id === 'regles') return hasPermission('conformite.rule.read')
            if (tab.id === 'transferts') return hasPermission('conformite.transfer.read')
            return true
          })}
          activeId={activeTab}
          onTabChange={handleTabChange}
          rightSlot={activeTab === 'dashboard' ? <div id="dash-toolbar-conformite" /> : null}
        />

        <PanelContent scroll={activeTab === 'dashboard'}>
          {renderTabContent()}
        </PanelContent>
      </div>}

      {dynamicPanel?.module === 'conformite' && dynamicPanel.type === 'create' && !dynamicPanel.meta?.subtype && <CreateTypePanel />}
      {dynamicPanel?.module === 'conformite' && dynamicPanel.type === 'detail' && !dynamicPanel.meta?.subtype && <TypeDetailPanel id={dynamicPanel.id} />}
      {dynamicPanel?.module === 'conformite' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'record' && <CreateComplianceRecordPanel />}
      {dynamicPanel?.module === 'conformite' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'record' && <ComplianceRecordDetailPanel id={dynamicPanel.id} />}
      {dynamicPanel?.module === 'conformite' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'job-position' && <CreateJobPositionPanel />}
      {dynamicPanel?.module === 'conformite' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'job-position' && <JobPositionDetailPanel id={dynamicPanel.id} />}
      {dynamicPanel?.module === 'conformite' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'exemption' && <CreateExemptionPanel />}
      {dynamicPanel?.module === 'conformite' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'exemption' && <ExemptionDetailPanel id={dynamicPanel.id} />}
      {dynamicPanel?.module === 'conformite' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'rule' && <CreateRulePanel />}
      {dynamicPanel?.module === 'conformite' && dynamicPanel.type === 'edit' && dynamicPanel.meta?.subtype === 'rule' && <EditRulePanel />}
      {dynamicPanel?.module === 'conformite' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'verification' && <VerificationDetailPanel id={dynamicPanel.id} recordType={dynamicPanel.meta?.record_type as string || ''} />}
    </div>
  )
}

registerPanelRenderer('conformite', (view) => {
  if (view.type === 'create' && !view.meta?.subtype) return <CreateTypePanel />
  if (view.type === 'detail' && 'id' in view && !view.meta?.subtype) return <TypeDetailPanel id={view.id} />
  if (view.type === 'create' && view.meta?.subtype === 'record') return <CreateComplianceRecordPanel />
  if (view.type === 'detail' && 'id' in view && view.meta?.subtype === 'record') return <ComplianceRecordDetailPanel id={view.id} />
  if (view.type === 'create' && view.meta?.subtype === 'job-position') return <CreateJobPositionPanel />
  if (view.type === 'detail' && 'id' in view && view.meta?.subtype === 'job-position') return <JobPositionDetailPanel id={view.id} />
  if (view.type === 'create' && view.meta?.subtype === 'rule') return <CreateRulePanel />
  if (view.type === 'edit' && view.meta?.subtype === 'rule') return <EditRulePanel />
  if (view.type === 'create' && view.meta?.subtype === 'exemption') return <CreateExemptionPanel />
  if (view.type === 'detail' && 'id' in view && view.meta?.subtype === 'exemption') return <ExemptionDetailPanel id={view.id} />
  if (view.type === 'detail' && 'id' in view && view.meta?.subtype === 'verification') return <VerificationDetailPanel id={view.id} recordType={view.meta?.record_type as string || ''} />
  return null
})
