import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardPenLine, Eye } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { DataTableFilterDef, DataTablePagination } from '@/components/ui/DataTable/types'
import { usePermission } from '@/hooks/usePermission'
import { useComplianceAuditTemplates } from '@/hooks/useConformite'
import { useUIStore } from '@/stores/uiStore'
import type { ComplianceAuditTemplate } from '@/types/api'
import { cn } from '@/lib/utils'

type AuditTemplateRow = ComplianceAuditTemplate & {
  theme_count: number
  question_count: number
  status_filter: 'active' | 'inactive'
}

export function AuditTemplatesTab() {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const { data: templates = [], isLoading } = useComplianceAuditTemplates({ include_inactive: true })
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const [searchValue, setSearchValue] = useState('')
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>({})
  const canCreate = hasPermission('conformite.audit.template.create')

  const rows = useMemo<AuditTemplateRow[]>(
    () => [...templates]
      .sort((a, b) => `${a.audit_type}-${a.code}`.localeCompare(`${b.audit_type}-${b.code}`))
      .map((template) => ({
        ...template,
        theme_count: template.themes.length,
        question_count: template.themes.reduce((sum, theme) => sum + theme.questions.length, 0),
        status_filter: template.active ? 'active' : 'inactive',
      })),
    [templates],
  )

  const auditTypeOptions = useMemo(() => (
    Array.from(new Set(rows.map((row) => row.audit_type).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, label: value }))
  ), [rows])

  const filters = useMemo<DataTableFilterDef[]>(() => [
    {
      id: 'audit_type',
      label: t('conformite.audit_templates.fields.audit_type'),
      type: 'select',
      options: auditTypeOptions,
    },
    {
      id: 'status_filter',
      label: t('common.status'),
      type: 'select',
      options: [
        { value: 'active', label: t('common.active') },
        { value: 'inactive', label: t('common.inactive') },
      ],
    },
  ], [auditTypeOptions, t])

  const filteredRows = useMemo(() => {
    const q = searchValue.trim().toLowerCase()
    const auditTypeFilter = activeFilters.audit_type as string | undefined
    const statusFilter = activeFilters.status_filter as string | undefined
    return rows.filter((row) => {
      if (auditTypeFilter && row.audit_type !== auditTypeFilter) return false
      if (statusFilter && row.status_filter !== statusFilter) return false
      if (!q) return true
      return [
        row.code,
        row.name,
        row.audit_type,
        row.description ?? '',
        row.passing_score,
        row.validity_days ?? '',
      ].some((value) => String(value).toLowerCase().includes(q))
    })
  }, [activeFilters, rows, searchValue])

  const openCreatePanel = useCallback(() => openDynamicPanel({
    type: 'create',
    module: 'conformite',
    meta: { subtype: 'audit-template' },
  }), [openDynamicPanel])

  const openDetailPanel = useCallback((id: string) => openDynamicPanel({
    type: 'detail',
    module: 'conformite',
    id,
    meta: { subtype: 'audit-template' },
  }), [openDynamicPanel])

  const columns = useMemo<ColumnDef<AuditTemplateRow>[]>(() => [
    {
      accessorKey: 'name',
      header: t('conformite.audit_templates.fields.name'),
      size: 260,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-foreground">{row.original.name}</div>
          <div className="truncate font-mono text-[10px] text-muted-foreground">{row.original.code}</div>
        </div>
      ),
    },
    {
      accessorKey: 'audit_type',
      header: t('conformite.audit_templates.fields.audit_type'),
      size: 120,
      cell: ({ row }) => (
        <span className="chip chip-info text-[9px]">{row.original.audit_type}</span>
      ),
    },
    {
      accessorKey: 'description',
      header: t('common.description'),
      size: 280,
      cell: ({ row }) => (
        <span className="line-clamp-2 text-xs text-muted-foreground">
          {row.original.description || '-'}
        </span>
      ),
    },
    {
      accessorKey: 'theme_count',
      header: t('conformite.audit_templates.metrics.themes'),
      size: 90,
      cell: ({ row }) => <span className="tabular-nums">{row.original.theme_count}</span>,
    },
    {
      accessorKey: 'question_count',
      header: t('conformite.audit_templates.metrics.questions'),
      size: 100,
      cell: ({ row }) => <span className="tabular-nums">{row.original.question_count}</span>,
    },
    {
      accessorKey: 'passing_score',
      header: t('conformite.audit_templates.fields.passing_score'),
      size: 110,
      cell: ({ row }) => <span className="tabular-nums">{row.original.passing_score}%</span>,
    },
    {
      accessorKey: 'validity_days',
      header: t('conformite.audit_templates.fields.validity_days'),
      size: 120,
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.validity_days
            ? t('conformite.audit_templates.validity_days', { count: row.original.validity_days })
            : t('conformite.audit_templates.validity_permanent')}
        </span>
      ),
    },
    {
      accessorKey: 'status_filter',
      header: t('common.status'),
      size: 100,
      cell: ({ row }) => (
        <span className={cn('chip text-[9px]', row.original.active ? 'chip-success' : '')}>
          {row.original.active ? t('common.active') : t('common.inactive')}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      size: 64,
      cell: ({ row }) => (
        <button
          type="button"
          className="btn-sm btn-secondary"
          title={t('conformite.audit_templates.open_detail')}
          onClick={(event) => {
            event.stopPropagation()
            openDetailPanel(row.original.id)
          }}
        >
          <Eye size={12} />
        </button>
      ),
    },
  ], [openDetailPanel, t])

  const pagination = useMemo<DataTablePagination>(() => ({
    page: 1,
    pageSize: filteredRows.length || 50,
    total: filteredRows.length,
    pages: 1,
  }), [filteredRows.length])

  return (
    <DataTable<AuditTemplateRow>
      columns={columns}
      data={filteredRows}
      isLoading={isLoading}
      pagination={pagination}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      searchPlaceholder={t('conformite.audit_templates.search')}
      filters={filters}
      activeFilters={activeFilters}
      onFilterChange={(id, value) => {
        setActiveFilters((prev) => {
          const next = { ...prev }
          if (value === undefined || value === null || value === '') delete next[id]
          else next[id] = value
          return next
        })
      }}
      onRowClick={(row) => openDetailPanel(row.id)}
      emptyIcon={ClipboardPenLine}
      emptyTitle={templates.length === 0 ? t('conformite.audit_templates.empty_title') : t('common.no_results')}
      emptyAction={templates.length === 0 && canCreate ? { label: t('conformite.audit_templates.create'), onClick: openCreatePanel } : undefined}
      toolbarRight={(
        <div className="hidden text-[11px] text-muted-foreground sm:block">
          {filteredRows.length}/{rows.length} {t('conformite.audit_templates.metrics.templates').toLowerCase()}
        </div>
      )}
      columnResizing
      columnVisibility
      defaultHiddenColumns={['description']}
      storageKey="conformite-audit-templates"
    />
  )
}
