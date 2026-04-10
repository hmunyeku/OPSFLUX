import { useEffect, useMemo, useState } from 'react'
import { BriefcaseBusiness, FolderTree, GitBranch, ListTree, Plus, ScrollText, Search, TableProperties } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import { DefaultImputationSettingEditor } from '@/components/shared/DefaultImputationSettingEditor'
import { usePermission } from '@/hooks/usePermission'
import { useProjects } from '@/hooks/useProjets'
import { useGroups } from '@/hooks/useRbac'
import {
  useBusinessUnits,
  useCostCenters,
  useCreateImputationAssignment,
  useCreateImputationOtpTemplate,
  useCreateImputationReference,
  useDeleteImputationAssignment,
  useDeleteImputationOtpTemplate,
  useDeleteImputationReference,
  useImputationAssignments,
  useImputationOtpTemplates,
  useImputationReferences,
  useUpdateImputationAssignment,
  useUpdateImputationOtpTemplate,
  useUpdateImputationReference,
} from '@/hooks/useSettings'
import { useUsers } from '@/hooks/useUsers'
import {
  DynamicPanelShell,
  PanelActionButton,
  ReadOnlyRow,
  FormSection,
  FormGrid,
  DynamicPanelField,
  PanelContentLayout,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { useToast } from '@/components/ui/Toast'
import { useUIStore } from '@/stores/uiStore'
import type {
  ImputationAssignment,
  ImputationAssignmentCreate,
  ImputationOtpTemplate,
  ImputationOtpTemplateCreate,
  ImputationReference,
  ImputationReferenceCreate,
} from '@/services/settingsService'

type MainTab = 'default' | 'registry'
type RegistrySection = 'references' | 'templates' | 'assignments'
type RegistryFilter = 'all' | 'OPEX' | 'SOPEX' | 'CAPEX' | 'OTHER' | 'active' | 'inactive' | 'user' | 'user_group' | 'business_unit' | 'project'

function normalizeSearch(value: string) {
  return value.trim().toLowerCase()
}

function matchesSearch(values: Array<string | number | null | undefined>, query: string) {
  const normalized = normalizeSearch(query)
  if (!normalized) return true
  return values.some((value) => String(value ?? '').toLowerCase().includes(normalized))
}

function RegistryNavButton({
  icon: Icon,
  label,
  active,
  onClick,
  count,
}: {
  icon: typeof FolderTree
  label: string
  active: boolean
  onClick: () => void
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon size={14} className="shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      {typeof count === 'number' && <span className="text-xs text-muted-foreground">{count}</span>}
    </button>
  )
}

function RegistryTree({
  section,
  filter,
  onChange,
  references,
  templates,
  assignments,
  t,
}: {
  section: RegistrySection
  filter: RegistryFilter
  onChange: (section: RegistrySection, filter: RegistryFilter) => void
  references: ImputationReference[]
  templates: ImputationOtpTemplate[]
  assignments: ImputationAssignment[]
  t: (key: string) => string
}) {
  return (
    <aside className="w-72 shrink-0 border-r border-border bg-background-subtle/40 p-3">
      <div className="space-y-1">
        <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('settings.imputations.references_title')}
        </div>
        <RegistryNavButton icon={FolderTree} label={t('common.all')} active={section === 'references' && filter === 'all'} count={references.length} onClick={() => onChange('references', 'all')} />
        {(['OPEX', 'SOPEX', 'CAPEX', 'OTHER'] as const).map((item) => (
          <RegistryNavButton
            key={item}
            icon={FolderTree}
            label={item}
            active={section === 'references' && filter === item}
            count={references.filter((reference) => reference.imputation_type === item).length}
            onClick={() => onChange('references', item)}
          />
        ))}
      </div>

      <div className="mt-4 space-y-1">
        <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('settings.imputations.templates_title')}
        </div>
        <RegistryNavButton icon={ScrollText} label={t('common.all')} active={section === 'templates' && filter === 'all'} count={templates.length} onClick={() => onChange('templates', 'all')} />
        <RegistryNavButton icon={ScrollText} label={t('common.active')} active={section === 'templates' && filter === 'active'} count={templates.filter((template) => template.active).length} onClick={() => onChange('templates', 'active')} />
        <RegistryNavButton icon={ScrollText} label={t('common.inactive')} active={section === 'templates' && filter === 'inactive'} count={templates.filter((template) => !template.active).length} onClick={() => onChange('templates', 'inactive')} />
      </div>

      <div className="mt-4 space-y-1">
        <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('settings.imputations.assignments_title')}
        </div>
        <RegistryNavButton icon={GitBranch} label={t('common.all')} active={section === 'assignments' && filter === 'all'} count={assignments.length} onClick={() => onChange('assignments', 'all')} />
        {([
          ['business_unit', t('settings.imputations.assignment_target_bu')],
          ['project', t('settings.imputations.assignment_target_project')],
          ['user_group', t('settings.imputations.assignment_target_group')],
          ['user', t('settings.imputations.assignment_target_user')],
        ] as const).map(([targetType, label]) => (
          <RegistryNavButton
            key={targetType}
            icon={GitBranch}
            label={label}
            active={section === 'assignments' && filter === targetType}
            count={assignments.filter((assignment) => assignment.target_type === targetType).length}
            onClick={() => onChange('assignments', targetType)}
          />
        ))}
      </div>
    </aside>
  )
}

function DefaultTab() {
  const { t } = useTranslation()
  return (
    <div className="space-y-6 p-4">
      <DefaultImputationSettingEditor
        scope="entity"
        title={t('settings.default_imputation.entity_title')}
        description={t('settings.default_imputation.entity_description')}
        hint={t('imputations.assignment_priority_description')}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">{t('imputations.asset_link_title')}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{t('imputations.asset_link_description')}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">{t('imputations.settings_hint_title')}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{t('imputations.settings_hint_description')}</p>
        </div>
      </div>
    </div>
  )
}

function buildReferenceColumns(t: (key: string) => string): ColumnDef<ImputationReference>[] {
  return [
    { accessorKey: 'code', header: t('common.code') },
    { accessorKey: 'name', header: t('common.name') },
    { accessorKey: 'imputation_type', header: t('settings.imputations.reference_type') },
    { accessorKey: 'otp_policy', header: t('settings.imputations.otp_policy') },
    { id: 'active', header: t('common.status'), cell: ({ row }) => (row.original.active ? t('common.active') : t('common.inactive')) },
  ]
}

function buildTemplateColumns(t: (key: string) => string): ColumnDef<ImputationOtpTemplate>[] {
  return [
    { accessorKey: 'code', header: t('common.code') },
    { accessorKey: 'name', header: t('common.name') },
    { id: 'rubrics', header: t('settings.imputations.template_rubrics'), cell: ({ row }) => row.original.rubrics.join(', ') || '—' },
    { id: 'active', header: t('common.status'), cell: ({ row }) => (row.original.active ? t('common.active') : t('common.inactive')) },
  ]
}

function buildAssignmentColumns(
  t: (key: string) => string,
  labels: Record<string, string>,
): ColumnDef<ImputationAssignment>[] {
  return [
    { accessorKey: 'target_type', header: t('settings.imputations.assignment_target_type') },
    { id: 'target', header: t('settings.imputations.assignment_target_id'), cell: ({ row }) => labels[row.original.target_id] ?? row.original.target_id },
    { accessorKey: 'priority', header: t('settings.imputations.assignment_priority') },
    { accessorKey: 'notes', header: t('settings.imputations.assignment_notes') },
    { id: 'active', header: t('common.status'), cell: ({ row }) => (row.original.active ? t('common.active') : t('common.inactive')) },
  ]
}

export function ImputationsPage() {
  const { t } = useTranslation()
  const [mainTab, setMainTab] = useState<MainTab>('registry')
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)
  const isFullPanel = panelMode === 'full' && dynamicPanel?.module === 'imputations'

  return (
    <div className="flex h-full">
      {!isFullPanel && (
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <PanelHeader icon={TableProperties} title={t('imputations.page_title')} subtitle={t('imputations.page_description')}>
            <button type="button" onClick={() => setMainTab('default')} className={`gl-button-sm ${mainTab === 'default' ? 'gl-button-confirm' : 'gl-button-default'}`}>{t('imputations.tab_default')}</button>
            <button type="button" onClick={() => setMainTab('registry')} className={`gl-button-sm ${mainTab === 'registry' ? 'gl-button-confirm' : 'gl-button-default'}`}>{t('imputations.tab_registry')}</button>
          </PanelHeader>
          <PanelContent>
            {mainTab === 'default' ? <DefaultTab /> : <RegistryTab />}
          </PanelContent>
        </div>
      )}
      <ImputationDynamicPanels />
    </div>
  )
}
