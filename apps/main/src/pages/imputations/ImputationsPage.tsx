import { useEffect, useMemo, useState } from 'react'
import { FolderTree, GitBranch, ListTree, Plus, ScrollText, Search, TableProperties } from 'lucide-react'
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
import { ProjectPicker } from '@/components/shared/ProjectPicker'
import { ImputationPicker } from '@/components/shared/ImputationPicker'
import { UserPicker } from '@/components/shared/UserPicker'
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
    <aside className="w-full sm:w-72 shrink-0 border-b sm:border-b-0 sm:border-r border-border bg-background-subtle/40 p-3 max-h-[40vh] sm:max-h-none overflow-y-auto">
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
          <PanelContent scroll={false}>
            {mainTab === 'default' ? <DefaultTab /> : <RegistryTab />}
          </PanelContent>
        </div>
      )}
      <ImputationDynamicPanels />
    </div>
  )
}

function RegistryTab() {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const setDynamicPanelNavItems = useUIStore((s) => s.setDynamicPanelNavItems)
  const [section, setSection] = useState<RegistrySection>('references')
  const [filter, setFilter] = useState<RegistryFilter>('all')
  const [search, setSearch] = useState('')

  const { data: references = [], isLoading: referencesLoading } = useImputationReferences()
  const { data: templates = [], isLoading: templatesLoading } = useImputationOtpTemplates()
  const { data: assignments = [], isLoading: assignmentsLoading } = useImputationAssignments()
  const { data: projectsData } = useProjects({ page_size: 200 })
  const { data: usersData } = useUsers({ page: 1, page_size: 200, active: true })
  const { data: groupsData } = useGroups({ page: 1, page_size: 200 })
  const { data: businessUnitsData } = useBusinessUnits({ page: 1, page_size: 200 })

  const targetLabels = useMemo(() => {
    const projectMap = Object.fromEntries((projectsData?.items ?? []).map((project) => [project.id, `${project.code} - ${project.name}`]))
    const userMap = Object.fromEntries((usersData?.items ?? []).map((user) => [user.id, `${user.first_name} ${user.last_name}`.trim() || user.email]))
    const groupMap = Object.fromEntries((groupsData?.items ?? []).map((group) => [group.id, group.name]))
    const buMap = Object.fromEntries((businessUnitsData?.items ?? []).map((bu) => [bu.id, `${bu.code} - ${bu.name}`]))
    return { ...projectMap, ...userMap, ...groupMap, ...buMap }
  }, [projectsData, usersData, groupsData, businessUnitsData])

  const filteredReferences = useMemo(() => references.filter((reference) => {
    if (section !== 'references') return false
    const matchesType = filter === 'all' ? true : reference.imputation_type === filter
    return matchesType && matchesSearch([reference.code, reference.name, reference.description, reference.imputation_type, reference.otp_policy], search)
  }), [references, section, filter, search])

  const filteredTemplates = useMemo(() => templates.filter((template) => {
    if (section !== 'templates') return false
    const matchesStatus = filter === 'all' ? true : filter === 'active' ? template.active : !template.active
    return matchesStatus && matchesSearch([template.code, template.name, template.description, template.rubrics.join(', ')], search)
  }), [templates, section, filter, search])

  const filteredAssignments = useMemo(() => assignments.filter((assignment) => {
    if (section !== 'assignments') return false
    const matchesType = filter === 'all' ? true : assignment.target_type === filter
    return matchesType && matchesSearch([assignment.target_type, targetLabels[assignment.target_id], assignment.notes, assignment.priority], search)
  }), [assignments, section, filter, search, targetLabels])

  const currentIds = useMemo(() => {
    if (section === 'references') return filteredReferences.map((item) => item.id)
    if (section === 'templates') return filteredTemplates.map((item) => item.id)
    return filteredAssignments.map((item) => item.id)
  }, [filteredAssignments, filteredReferences, filteredTemplates, section])

  useEffect(() => {
    setDynamicPanelNavItems(currentIds)
    return () => setDynamicPanelNavItems([])
  }, [currentIds, setDynamicPanelNavItems])

  const canCreateReference = hasPermission('imputation.create')
  const canManageTemplates = hasPermission('imputation.template.manage')
  const canManageAssignments = hasPermission('imputation.assignment.manage')

  const loading = section === 'references'
    ? referencesLoading
    : section === 'templates'
      ? templatesLoading
      : assignmentsLoading

  const title = section === 'references'
    ? t('settings.imputations.references_title')
    : section === 'templates'
      ? t('settings.imputations.templates_title')
      : t('settings.imputations.assignments_title')

  const description = section === 'references'
    ? t('settings.imputations.references_description')
    : section === 'templates'
      ? t('settings.imputations.templates_description')
      : t('settings.imputations.assignments_description')

  return (
    // On mobile the side-tree + main-content split collapses into a
    // vertical stack so the main content gets full viewport width
    // (was squashed to ~100px next to a 288px fixed aside on 390px
    // viewports). Desktop keeps the familiar two-pane layout.
    <div className="flex flex-col sm:flex-row h-full min-h-0">
      <RegistryTree
        section={section}
        filter={filter}
        onChange={(nextSection, nextFilter) => {
          setSection(nextSection)
          setFilter(nextFilter)
        }}
        references={references}
        templates={templates}
        assignments={assignments}
        t={t}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <PanelHeader icon={ListTree} title={title} subtitle={description}>
          <div className="relative hidden w-72 md:block">
            <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('common.search')}
              className={`${panelInputClass} h-8 pl-8 text-sm`}
            />
          </div>
          {section === 'references' && canCreateReference && (
            <ToolbarButton icon={Plus} label={t('settings.imputations.create_reference')} variant="primary" onClick={() => openDynamicPanel({ type: 'create', module: 'imputations', meta: { subtype: 'reference' } })} />
          )}
          {section === 'templates' && canManageTemplates && (
            <ToolbarButton icon={Plus} label={t('settings.imputations.create_template')} variant="primary" onClick={() => openDynamicPanel({ type: 'create', module: 'imputations', meta: { subtype: 'template' } })} />
          )}
          {section === 'assignments' && canManageAssignments && (
            <ToolbarButton icon={Plus} label={t('settings.imputations.create_assignment')} variant="primary" onClick={() => openDynamicPanel({ type: 'create', module: 'imputations', meta: { subtype: 'assignment' } })} />
          )}
        </PanelHeader>

        <div className="border-b border-border px-4 py-3 md:hidden">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('common.search')}
              className={`${panelInputClass} h-8 pl-8 text-sm`}
            />
          </div>
        </div>

        <PanelContent scroll={false} className="p-4">
          {section === 'references' && (
            <DataTable
              columns={buildReferenceColumns(t)}
              data={filteredReferences}
              isLoading={loading}
              storageKey="imputations-references"
              getRowId={(row) => row.id}
              onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'imputations', id: row.id })}
              emptyIcon={FolderTree}
              emptyTitle={t('common.no_results')}
            />
          )}
          {section === 'templates' && (
            <DataTable
              columns={buildTemplateColumns(t)}
              data={filteredTemplates}
              isLoading={loading}
              storageKey="imputations-templates"
              getRowId={(row) => row.id}
              onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'imputations', id: row.id })}
              emptyIcon={ScrollText}
              emptyTitle={t('common.no_results')}
            />
          )}
          {section === 'assignments' && (
            <DataTable
              columns={buildAssignmentColumns(t, targetLabels)}
              data={filteredAssignments}
              isLoading={loading}
              storageKey="imputations-assignments"
              getRowId={(row) => row.id}
              onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'imputations', id: row.id })}
              emptyIcon={GitBranch}
              emptyTitle={t('common.no_results')}
            />
          )}
        </PanelContent>
      </div>
    </div>
  )
}

function ImputationDynamicPanels() {
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const { data: references = [] } = useImputationReferences()
  const { data: templates = [] } = useImputationOtpTemplates()
  const { data: assignments = [] } = useImputationAssignments()

  if (dynamicPanel?.module !== 'imputations') return null

  if (dynamicPanel.type === 'create') {
    if (dynamicPanel.meta?.subtype === 'reference') return <ReferenceEditorPanel />
    if (dynamicPanel.meta?.subtype === 'template') return <TemplateEditorPanel />
    return <AssignmentEditorPanel />
  }

  const reference = references.find((item) => item.id === dynamicPanel.id)
  if (reference) return <ReferenceEditorPanel reference={reference} />

  const template = templates.find((item) => item.id === dynamicPanel.id)
  if (template) return <TemplateEditorPanel template={template} />

  const assignment = assignments.find((item) => item.id === dynamicPanel.id)
  if (assignment) return <AssignmentEditorPanel assignment={assignment} />

  return null
}

function makeReferenceForm(reference?: ImputationReference): ImputationReferenceCreate {
  return {
    code: reference?.code ?? '',
    name: reference?.name ?? '',
    description: reference?.description ?? '',
    imputation_type: reference?.imputation_type ?? 'OPEX',
    otp_policy: reference?.otp_policy ?? 'forbidden',
    otp_template_id: reference?.otp_template_id ?? null,
    default_project_id: reference?.default_project_id ?? null,
    default_cost_center_id: reference?.default_cost_center_id ?? null,
    valid_from: reference?.valid_from ?? null,
    valid_to: reference?.valid_to ?? null,
    active: reference?.active ?? true,
  }
}

function makeTemplateForm(template?: ImputationOtpTemplate): ImputationOtpTemplateCreate {
  return {
    code: template?.code ?? '',
    name: template?.name ?? '',
    description: template?.description ?? '',
    rubrics: template?.rubrics ?? [],
    active: template?.active ?? true,
  }
}

function makeAssignmentForm(assignment?: ImputationAssignment): ImputationAssignmentCreate {
  return {
    imputation_reference_id: assignment?.imputation_reference_id ?? '',
    target_type: assignment?.target_type ?? 'business_unit',
    target_id: assignment?.target_id ?? '',
    priority: assignment?.priority ?? 100,
    valid_from: assignment?.valid_from ?? null,
    valid_to: assignment?.valid_to ?? null,
    active: assignment?.active ?? true,
    notes: assignment?.notes ?? '',
  }
}

function ReferenceEditorPanel({ reference }: { reference?: ImputationReference }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const createReference = useCreateImputationReference()
  const updateReference = useUpdateImputationReference()
  const deleteReference = useDeleteImputationReference()
  const { data: templates = [] } = useImputationOtpTemplates()
  const { data: costCentersData } = useCostCenters({ page_size: 200 })
  const [form, setForm] = useState<ImputationReferenceCreate>(() => makeReferenceForm(reference))

  useEffect(() => setForm(makeReferenceForm(reference)), [reference])

  const handleSubmit = async () => {
    try {
      if (reference) await updateReference.mutateAsync({ id: reference.id, payload: form })
      else await createReference.mutateAsync(form)
      toast({ title: reference ? t('common.save') : t('settings.imputations.reference_created'), variant: 'success' })
      closeDynamicPanel()
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast({ title: t('settings.imputations.error_title'), description: detail || t('settings.imputations.reference_create_error'), variant: 'error' })
    }
  }

  return (
    <DynamicPanelShell
      title={reference ? reference.name : t('settings.imputations.create_reference')}
      subtitle={t('settings.imputations.references_title')}
      actions={
        <>
          {reference && <PanelActionButton variant="danger" onClick={async () => { await deleteReference.mutateAsync(reference.id); closeDynamicPanel() }}>{t('common.delete')}</PanelActionButton>}
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton variant="primary" onClick={handleSubmit}>{reference ? t('common.save') : t('common.create')}</PanelActionButton>
        </>
      }
    >
      <PanelContentLayout>
        <FormSection title={t('settings.imputations.references_title')}>
          <FormGrid>
            <DynamicPanelField label={t('common.code')} required><input className={panelInputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></DynamicPanelField>
            <DynamicPanelField label={t('common.name')} required><input className={panelInputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></DynamicPanelField>
            <DynamicPanelField label={t('settings.imputations.reference_type')}><select className={panelInputClass} value={form.imputation_type ?? 'OPEX'} onChange={(e) => setForm({ ...form, imputation_type: e.target.value as ImputationReference['imputation_type'] })}>{['OPEX', 'SOPEX', 'CAPEX', 'OTHER'].map((value) => <option key={value} value={value}>{value}</option>)}</select></DynamicPanelField>
            <DynamicPanelField label={t('settings.imputations.otp_policy')}><select className={panelInputClass} value={form.otp_policy ?? 'forbidden'} onChange={(e) => setForm({ ...form, otp_policy: e.target.value as ImputationReference['otp_policy'] })}><option value="forbidden">{t('settings.imputations.otp_forbidden')}</option><option value="optional">{t('settings.imputations.otp_optional')}</option><option value="required">{t('settings.imputations.otp_required')}</option></select></DynamicPanelField>
            <DynamicPanelField label={t('settings.imputations.templates_title')}><select className={panelInputClass} value={form.otp_template_id ?? ''} onChange={(e) => setForm({ ...form, otp_template_id: e.target.value || null })}><option value="">{t('settings.imputations.no_otp_template')}</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.code} - {template.name}</option>)}</select></DynamicPanelField>
            <DynamicPanelField label={t('settings.default_imputation.default_project')}><ProjectPicker value={form.default_project_id ?? null} onChange={(id) => setForm({ ...form, default_project_id: id })} placeholder={t('settings.imputations.no_default_project')} /></DynamicPanelField>
            <DynamicPanelField label={t('settings.default_imputation.default_cost_center')}><select className={panelInputClass} value={form.default_cost_center_id ?? ''} onChange={(e) => setForm({ ...form, default_cost_center_id: e.target.value || null })}><option value="">{t('settings.imputations.no_default_cost_center')}</option>{(costCentersData?.items ?? []).map((costCenter) => <option key={costCenter.id} value={costCenter.id}>{costCenter.code} - {costCenter.name}</option>)}</select></DynamicPanelField>
            <DynamicPanelField label={t('settings.imputations.valid_from')}><input type="date" className={panelInputClass} value={form.valid_from ?? ''} onChange={(e) => setForm({ ...form, valid_from: e.target.value || null })} /></DynamicPanelField>
            <DynamicPanelField label={t('settings.imputations.valid_to')}><input type="date" className={panelInputClass} value={form.valid_to ?? ''} onChange={(e) => setForm({ ...form, valid_to: e.target.value || null })} /></DynamicPanelField>
          </FormGrid>
        </FormSection>
        {reference && (
          <FormSection title={t('common.status')}>
            <ReadOnlyRow label={t('common.status')} value={reference.active ? t('common.active') : t('common.inactive')} />
            <ReadOnlyRow label={t('common.created_at')} value={reference.created_at || '—'} />
          </FormSection>
        )}
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

function TemplateEditorPanel({ template }: { template?: ImputationOtpTemplate }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const createTemplate = useCreateImputationOtpTemplate()
  const updateTemplate = useUpdateImputationOtpTemplate()
  const deleteTemplate = useDeleteImputationOtpTemplate()
  const [rubricsInput, setRubricsInput] = useState((template?.rubrics ?? []).join(', '))
  const [form, setForm] = useState<ImputationOtpTemplateCreate>(() => makeTemplateForm(template))

  useEffect(() => {
    setForm(makeTemplateForm(template))
    setRubricsInput((template?.rubrics ?? []).join(', '))
  }, [template])

  const handleSubmit = async () => {
    try {
      const payload = { ...form, rubrics: rubricsInput.split(',').map((item) => item.trim()).filter(Boolean) }
      if (template) await updateTemplate.mutateAsync({ id: template.id, payload })
      else await createTemplate.mutateAsync(payload)
      toast({ title: template ? t('common.save') : t('settings.imputations.template_created'), variant: 'success' })
      closeDynamicPanel()
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast({ title: t('settings.imputations.error_title'), description: detail || t('settings.imputations.template_create_error'), variant: 'error' })
    }
  }

  return (
    <DynamicPanelShell
      title={template ? template.name : t('settings.imputations.create_template')}
      subtitle={t('settings.imputations.templates_title')}
      actions={
        <>
          {template && <PanelActionButton variant="danger" onClick={async () => { await deleteTemplate.mutateAsync(template.id); closeDynamicPanel() }}>{t('common.delete')}</PanelActionButton>}
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton variant="primary" onClick={handleSubmit}>{template ? t('common.save') : t('common.create')}</PanelActionButton>
        </>
      }
    >
      <PanelContentLayout>
        <FormSection title={t('settings.imputations.templates_title')}>
          <FormGrid>
            <DynamicPanelField label={t('common.code')} required><input className={panelInputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></DynamicPanelField>
            <DynamicPanelField label={t('common.name')} required><input className={panelInputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></DynamicPanelField>
            <DynamicPanelField label={t('common.description')} span="full"><textarea className={`${panelInputClass} min-h-24`} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></DynamicPanelField>
            <DynamicPanelField label={t('settings.imputations.template_rubrics')} span="full"><textarea className={`${panelInputClass} min-h-24`} value={rubricsInput} onChange={(e) => setRubricsInput(e.target.value)} /></DynamicPanelField>
          </FormGrid>
        </FormSection>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

function AssignmentEditorPanel({ assignment }: { assignment?: ImputationAssignment }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const createAssignment = useCreateImputationAssignment()
  const updateAssignment = useUpdateImputationAssignment()
  const deleteAssignment = useDeleteImputationAssignment()
  const { data: projectsData } = useProjects({ page_size: 200 })
  const { data: usersData } = useUsers({ page: 1, page_size: 200, active: true })
  const { data: groupsData } = useGroups({ page: 1, page_size: 200 })
  const { data: businessUnitsData } = useBusinessUnits({ page: 1, page_size: 200 })
  const [form, setForm] = useState<ImputationAssignmentCreate>(() => makeAssignmentForm(assignment))

  useEffect(() => setForm(makeAssignmentForm(assignment)), [assignment])

  const targetOptions = useMemo(() => {
    if (form.target_type === 'project') return (projectsData?.items ?? []).map((project) => ({ value: project.id, label: `${project.code} - ${project.name}` }))
    if (form.target_type === 'user') return (usersData?.items ?? []).map((user) => ({ value: user.id, label: `${user.first_name} ${user.last_name}`.trim() || user.email }))
    if (form.target_type === 'user_group') return (groupsData?.items ?? []).map((group) => ({ value: group.id, label: group.name }))
    return (businessUnitsData?.items ?? []).map((bu) => ({ value: bu.id, label: `${bu.code} - ${bu.name}` }))
  }, [businessUnitsData, form.target_type, groupsData, projectsData, usersData])

  const handleSubmit = async () => {
    try {
      if (assignment) await updateAssignment.mutateAsync({ id: assignment.id, payload: form })
      else await createAssignment.mutateAsync(form)
      toast({ title: assignment ? t('settings.imputations.assignment_updated') : t('settings.imputations.assignment_created'), variant: 'success' })
      closeDynamicPanel()
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast({ title: t('settings.imputations.error_title'), description: detail || t('settings.imputations.assignment_save_error'), variant: 'error' })
    }
  }

  return (
    <DynamicPanelShell
      title={assignment ? t('settings.imputations.update_assignment') : t('settings.imputations.create_assignment')}
      subtitle={t('settings.imputations.assignments_title')}
      actions={
        <>
          {assignment && <PanelActionButton variant="danger" onClick={async () => { await deleteAssignment.mutateAsync(assignment.id); closeDynamicPanel() }}>{t('common.delete')}</PanelActionButton>}
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton variant="primary" onClick={handleSubmit}>{assignment ? t('common.save') : t('common.create')}</PanelActionButton>
        </>
      }
    >
      <PanelContentLayout>
        <FormSection title={t('settings.imputations.assignments_title')}>
          <FormGrid>
            <DynamicPanelField label={t('settings.imputations.assignment_reference')} required><ImputationPicker value={form.imputation_reference_id || null} onChange={(id) => setForm({ ...form, imputation_reference_id: id || '' })} /></DynamicPanelField>
            <DynamicPanelField label={t('settings.imputations.assignment_target_type')} required><select className={panelInputClass} value={form.target_type} onChange={(e) => setForm({ ...form, target_type: e.target.value as ImputationAssignment['target_type'], target_id: '' })}><option value="business_unit">{t('settings.imputations.assignment_target_bu')}</option><option value="project">{t('settings.imputations.assignment_target_project')}</option><option value="user_group">{t('settings.imputations.assignment_target_group')}</option><option value="user">{t('settings.imputations.assignment_target_user')}</option></select></DynamicPanelField>
            <DynamicPanelField label={t('settings.imputations.assignment_target_id')} required>
              {form.target_type === 'project' ? (
                <ProjectPicker value={form.target_id || null} onChange={(id) => setForm({ ...form, target_id: id || '' })} />
              ) : form.target_type === 'user' ? (
                <UserPicker value={form.target_id || null} onChange={(id) => setForm({ ...form, target_id: id || '' })} />
              ) : (
                <select className={panelInputClass} value={form.target_id} onChange={(e) => setForm({ ...form, target_id: e.target.value })}><option value="">{t('settings.imputations.assignment_target_placeholder')}</option>{targetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
              )}
            </DynamicPanelField>
            <DynamicPanelField label={t('settings.imputations.assignment_priority')}><input type="number" className={panelInputClass} value={String(form.priority ?? 100)} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) || 100 })} /></DynamicPanelField>
            <DynamicPanelField label={t('settings.imputations.valid_from')}><input type="date" className={panelInputClass} value={form.valid_from ?? ''} onChange={(e) => setForm({ ...form, valid_from: e.target.value || null })} /></DynamicPanelField>
            <DynamicPanelField label={t('settings.imputations.valid_to')}><input type="date" className={panelInputClass} value={form.valid_to ?? ''} onChange={(e) => setForm({ ...form, valid_to: e.target.value || null })} /></DynamicPanelField>
            <DynamicPanelField label={t('settings.imputations.assignment_notes')} span="full"><textarea className={`${panelInputClass} min-h-24`} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></DynamicPanelField>
          </FormGrid>
        </FormSection>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}
