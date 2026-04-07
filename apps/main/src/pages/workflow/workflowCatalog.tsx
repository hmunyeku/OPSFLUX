import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Archive,
  ArrowRight,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  LayoutList,
  Pause,
  Play,
  Plus,
  Send,
  Shield,
  Tag,
  Trash2,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import { usePageSize } from '@/hooks/usePageSize'
import { useWorkflowInstances } from '@/hooks/useWorkflow'
import type { WorkflowDefinitionSummary, WorkflowInstance } from '@/services/workflowService'
import { entityTypeLabel, isStructureLockedDefinition } from './workflowShared'

export function StatusFilter({
  value,
  onChange,
  counts,
}: {
  value: string
  onChange: (v: string) => void
  counts: Record<string, number>
}) {
  const { t } = useTranslation()
  const tabs = [
    { key: '', label: t('workflow.all'), count: Object.values(counts).reduce((a, b) => a + b, 0) },
    { key: 'draft', label: t('workflow.draft'), count: counts.draft || 0 },
    { key: 'published', label: t('workflow.published'), count: counts.published || 0 },
    { key: 'archived', label: t('workflow.archived'), count: counts.archived || 0 },
  ]

  return (
    <div className="flex items-center gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
            value === tab.key
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          {tab.label}
          {tab.count > 0 && (
            <span className="ml-1 text-[10px] bg-accent rounded-full px-1.5">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}

export function WorkflowStatCard({
  icon: Icon,
  label,
  value,
  tone = 'default',
  subtitle,
}: {
  icon: LucideIcon
  label: string
  value: number
  tone?: 'default' | 'system' | 'success' | 'warning'
  subtitle?: string
}) {
  const toneClass = {
    default: 'bg-card border-border text-foreground',
    system: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-100',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-100',
    warning: 'bg-sky-50 border-sky-200 text-sky-900 dark:bg-sky-950/20 dark:border-sky-900/30 dark:text-sky-100',
  } as const

  return (
    <div className={cn('rounded-xl border px-4 py-3 shadow-sm', toneClass[tone])}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold leading-none">{value}</p>
          {subtitle && <p className="mt-2 text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="rounded-lg bg-background/70 p-2 shadow-sm">
          <Icon size={16} />
        </div>
      </div>
    </div>
  )
}

export function DefinitionSection({
  title,
  subtitle,
  items,
  statsMap,
  onOpen,
  onPublish,
  onArchive,
  onClone,
  onDelete,
  onViewInstances,
  canDelete,
}: {
  title: string
  subtitle: string
  items: WorkflowDefinitionSummary[]
  statsMap: Record<string, { total: number; by_state: Record<string, number> }>
  onOpen: (id: string) => void
  onPublish: (id: string) => void
  onArchive: (id: string) => void
  onClone: (id: string) => void
  onDelete: (id: string, name: string) => void
  onViewInstances: (id: string) => void
  canDelete: boolean
}) {
  if (items.length === 0) return null

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <span className="rounded-full bg-accent px-2 py-1 text-[11px] font-medium text-muted-foreground">
          {items.length}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {items.map((def) => (
          <DefinitionCard
            key={def.id}
            def={def}
            stats={statsMap[def.id]}
            onOpen={() => onOpen(def.id)}
            onPublish={() => onPublish(def.id)}
            onArchive={() => onArchive(def.id)}
            onClone={() => onClone(def.id)}
            onDelete={() => onDelete(def.id, def.name)}
            onViewInstances={() => onViewInstances(def.id)}
            canDelete={canDelete}
          />
        ))}
      </div>
    </section>
  )
}

function DefinitionCard({
  def,
  stats,
  onOpen,
  onPublish,
  onArchive,
  onClone,
  onDelete,
  onViewInstances,
  canDelete = true,
}: {
  def: WorkflowDefinitionSummary
  stats?: { total: number; by_state: Record<string, number> }
  onOpen: () => void
  onPublish: () => void
  onArchive: () => void
  onClone: () => void
  onDelete: () => void
  onViewInstances: () => void
  canDelete?: boolean
}) {
  const { t } = useTranslation()
  const structureLocked = isStructureLockedDefinition(def)

  return (
    <div
      className="rounded-md border border-border bg-card hover:bg-accent/20 transition-colors cursor-pointer group"
      onClick={onOpen}
    >
      <div className="px-3 py-2">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="text-[13px] font-semibold text-foreground truncate">{def.name}</h3>
          <div className="flex items-center gap-1 shrink-0">
            <span className={cn(
              'inline-flex items-center gap-0.5 rounded-sm px-1.5 py-0.5 text-[10px] font-medium leading-none',
              def.status === 'published'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                : def.status === 'draft'
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
            )}>
              {def.status === 'published' ? <Play size={8} /> : def.status === 'draft' ? <Pause size={8} /> : <Archive size={8} />}
              {t(`workflow.${def.status}`)}
            </span>
            <span className="text-[10px] text-muted-foreground leading-none">v{def.version}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-400 font-medium">
            <Tag size={7} />
            {entityTypeLabel(def.entity_type)}
          </span>
          {structureLocked && (
            <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 font-medium">
              <Shield size={7} />
              {t('workflow.system_badge')}
            </span>
          )}
          <span className="flex items-center gap-0.5">
            <CheckCircle2 size={10} /> {def.node_count}
          </span>
          <span className="flex items-center gap-0.5">
            <ArrowRight size={10} /> {def.edge_count}
          </span>
          {stats && stats.total > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onViewInstances() }}
              className="flex items-center gap-0.5 text-primary hover:underline"
            >
              <Clock size={10} /> {stats.total}
            </button>
          )}
        </div>

        {def.description && (
          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{def.description}</p>
        )}
      </div>

      <div
        className="flex items-center gap-0.5 px-2 py-1 border-t border-border/50 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        {def.status === 'draft' && (
          <>
            <button onClick={onPublish} className="gl-button-sm gl-button-confirm text-[10px]">
              <Send size={9} /> {t('workflow.publish')}
            </button>
            {canDelete && (
              <button onClick={onDelete} className="gl-button-sm gl-button-danger text-[10px]">
                <Trash2 size={9} /> {t('common.delete')}
              </button>
            )}
          </>
        )}
        {def.status === 'published' && (
          <>
            {canDelete && (
              <button onClick={onArchive} className="gl-button-sm gl-button-default text-[10px]">
                <Archive size={9} /> {t('workflow.archive')}
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); onViewInstances() }} className="gl-button-sm gl-button-default text-[10px]">
              <Eye size={9} /> {t('workflow.instances')}
            </button>
          </>
        )}
        <button onClick={onClone} className="gl-button-sm gl-button-default text-[10px]">
          <Copy size={9} /> {structureLocked ? t('workflow.adjustable_version') : t('workflow.clone')}
        </button>
      </div>
    </div>
  )
}

export function InstancesTable({
  definitionFilter,
  onViewInstance,
}: {
  definitionFilter?: string
  onViewInstance: (id: string) => void
}) {
  const { t } = useTranslation()
  const { pageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const { data, isLoading } = useWorkflowInstances({
    definition_id: definitionFilter,
    page_size: pageSize,
  })

  const instances = useMemo(() => {
    const items = data?.items || []
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter((instance) =>
      (instance.definition_name || '').toLowerCase().includes(q)
      || instance.entity_type.toLowerCase().includes(q)
      || instance.current_state.toLowerCase().includes(q)
    )
  }, [data?.items, search])

  const columns = useMemo<ColumnDef<WorkflowInstance, unknown>[]>(() => [
    {
      id: 'workflow',
      header: t('workflow.column_workflow'),
      cell: ({ row }) => (
        <span className="text-xs font-medium text-foreground">
          {row.original.definition_name || row.original.workflow_definition_id.slice(0, 8)}
        </span>
      ),
    },
    {
      accessorKey: 'entity_type',
      header: t('workflow.entity_type'),
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-400 text-[10px] font-medium">
          <Tag size={8} /> {entityTypeLabel(row.original.entity_type)}
        </span>
      ),
    },
    {
      id: 'ref',
      header: t('workflow.column_reference'),
      cell: ({ row }) => (
        <span className="text-[11px] font-mono text-muted-foreground">
          {row.original.entity_id_ref.slice(0, 8)}...
        </span>
      ),
    },
    {
      accessorKey: 'current_state',
      header: t('workflow.current_state'),
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-semibold">
          <Zap size={9} /> {row.original.current_state}
        </span>
      ),
    },
    {
      accessorKey: 'created_at',
      header: t('workflow.column_date'),
      cell: ({ row }) => (
        <span className="text-[11px] text-muted-foreground">
          {new Date(row.original.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: () => (
        <button className="p-1 rounded hover:bg-accent text-muted-foreground">
          <Eye size={12} />
        </button>
      ),
      size: 40,
    },
  ], [t])

  return (
    <DataTable
      columns={columns}
      data={instances}
      isLoading={isLoading}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder={t('workflow.search_placeholder')}
      onRowClick={(row) => onViewInstance(row.id)}
      emptyIcon={LayoutList}
      emptyTitle={t('workflow.no_instances')}
      importExport={{
        exportFormats: ['csv', 'xlsx'],
        advancedExport: true,
        filenamePrefix: 'workflows',
        exportHeaders: {
          entity_type: t('workflow.export_entity_type'),
          current_state: t('workflow.export_current_state'),
          created_at: t('workflow.export_date'),
        },
      }}
      storageKey="workflow-instances"
    />
  )
}

export function CreateDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (name: string, description: string, entityType: string) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [entityType, setEntityType] = useState('workflow')

  const entityTypeOptions = [
    { value: 'workflow', label: t('workflow.entity.workflow') },
    { value: 'avis_sejour', label: t('workflow.entity_option.avis_sejour') },
    { value: 'ads', label: t('workflow.entity_option.ads') },
    { value: 'avm', label: t('workflow.entity.avm') },
    { value: 'project', label: t('workflow.entity.project') },
    { value: 'planner_activity', label: t('workflow.entity.planner_activity') },
    { value: 'voyage', label: t('workflow.entity.voyage') },
    { value: 'cargo_item_workflow', label: t('workflow.entity.cargo_item_workflow') },
    { value: 'work_order', label: t('workflow.entity.work_order') },
    { value: 'purchase_order', label: t('workflow.entity.purchase_order') },
    { value: 'asset', label: t('workflow.entity.asset') },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-foreground mb-4">{t('workflow.new_workflow')}</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">{t('common.name')}</label>
            <input
              type="text"
              className="gl-form-input text-sm w-full"
              placeholder={t('workflow.new_name_placeholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">{t('workflow.entity_type')}</label>
            <select
              className="gl-form-input text-sm w-full"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            >
              {entityTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground mt-1">
              {t('workflow.entity_type_help')}
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">{t('common.description')}</label>
            <textarea
              className="gl-form-input text-sm w-full min-h-[60px] resize-y"
              placeholder={t('workflow.description_placeholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onClose} className="gl-button-sm gl-button-default">{t('common.cancel')}</button>
          <button
            onClick={() => { onCreate(name, description, entityType); onClose() }}
            disabled={!name.trim()}
            className="gl-button-sm gl-button-confirm"
          >
            <Plus size={12} /> {t('common.create')}
          </button>
        </div>
      </div>
    </div>
  )
}
