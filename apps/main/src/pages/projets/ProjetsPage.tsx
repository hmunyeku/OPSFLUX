/**
 * Projets (Project Management) page — inspired by Gouti.
 *
 * Architecture:
 *  - DataTable with enriched columns (code, name, status, weather, %, manager, dates)
 *  - ProjectDetailPanel: fiche projet + equipe + taches + jalons + notes/documents
 *  - CreateProjectPanel: full creation form
 */
import { useState, useCallback, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FolderKanban, Plus, Loader2, Trash2, Users, Target,
  Sun, Cloud, CloudRain, CloudLightning, Milestone, ListTodo,
} from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import type { DataTablePagination, DataTableFilterDef } from '@/components/ui/DataTable/types'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormGrid,
  FormSection,
  InlineEditableRow,
  InlineEditableTags,
  ReadOnlyRow,
  PanelActionButton,
  DangerConfirmButton,
  TagSelector,
  panelInputClass,
  PanelContentLayout,
  SectionColumns,
  DetailFieldGrid,
} from '@/components/layout/DynamicPanel'
import { NoteManager } from '@/components/shared/NoteManager'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { TagManager } from '@/components/shared/TagManager'
import { useUIStore } from '@/stores/uiStore'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import {
  useProjects, useProject, useCreateProject, useUpdateProject, useArchiveProject,
  useProjectTasks, useProjectMembers, useProjectMilestones,
} from '@/hooks/useProjets'
import type { Project, ProjectCreate } from '@/types/api'

// -- Constants ----------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'planned', label: 'Planifie' },
  { value: 'active', label: 'Actif' },
  { value: 'on_hold', label: 'Suspendu' },
  { value: 'completed', label: 'Termine' },
  { value: 'cancelled', label: 'Annule' },
]

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Basse' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'high', label: 'Haute' },
  { value: 'critical', label: 'Critique' },
]

const WEATHER_OPTIONS = [
  { value: 'sunny', label: 'Ensoleille', icon: Sun },
  { value: 'cloudy', label: 'Nuageux', icon: Cloud },
  { value: 'rainy', label: 'Pluvieux', icon: CloudRain },
  { value: 'stormy', label: 'Orageux', icon: CloudLightning },
]

/* Task status columns — used by Kanban view */
/* 'todo' | 'in_progress' | 'review' | 'done' */

function WeatherIcon({ weather, size = 14 }: { weather: string; size?: number }) {
  const opt = WEATHER_OPTIONS.find(w => w.value === weather)
  if (!opt) return null
  const Icon = opt.icon
  const color = weather === 'sunny' ? 'text-yellow-500' : weather === 'cloudy' ? 'text-gray-400' : weather === 'rainy' ? 'text-blue-400' : 'text-red-500'
  return <Icon size={size} className={color} />
}

// -- Create Project Panel -----------------------------------------------------

function CreateProjectPanel() {
  const { t } = useTranslation()
  const createProject = useCreateProject()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { toast } = useToast()
  const [form, setForm] = useState<ProjectCreate>({
    code: '',
    name: '',
    description: null,
    status: 'draft',
    priority: 'medium',
    weather: 'sunny',
    start_date: null,
    end_date: null,
    budget: null,
    manager_id: null,
    tier_id: null,
    asset_id: null,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createProject.mutateAsync(form)
      closeDynamicPanel()
      toast({ title: 'Projet cree', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }

  return (
    <DynamicPanelShell
      title="Nouveau projet"
      subtitle="Projets"
      icon={<FolderKanban size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createProject.isPending}
            onClick={() => (document.getElementById('create-project-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createProject.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-project-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <SectionColumns>
            <div className="@container space-y-5">
              <FormSection title="Identification">
                <FormGrid>
                  <DynamicPanelField label="Code" required>
                    <input type="text" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={panelInputClass} placeholder="PRJ-001" />
                  </DynamicPanelField>
                  <DynamicPanelField label="Nom" required>
                    <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={panelInputClass} placeholder="Nom du projet" />
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>

              <FormSection title="Planning">
                <FormGrid>
                  <DynamicPanelField label="Date de debut">
                    <input type="date" value={form.start_date?.split('T')[0] ?? ''} onChange={(e) => setForm({ ...form, start_date: e.target.value || null })} className={panelInputClass} />
                  </DynamicPanelField>
                  <DynamicPanelField label="Date de fin">
                    <input type="date" value={form.end_date?.split('T')[0] ?? ''} onChange={(e) => setForm({ ...form, end_date: e.target.value || null })} className={panelInputClass} />
                  </DynamicPanelField>
                  <DynamicPanelField label="Budget">
                    <input type="number" step="any" value={form.budget ?? ''} onChange={(e) => setForm({ ...form, budget: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} placeholder="0" />
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>
            </div>

            <div className="@container space-y-5">
              <FormSection title="Statut">
                <TagSelector options={STATUS_OPTIONS} value={form.status || 'draft'} onChange={(v) => setForm({ ...form, status: v })} />
              </FormSection>

              <FormSection title="Priorite">
                <TagSelector options={PRIORITY_OPTIONS} value={form.priority || 'medium'} onChange={(v) => setForm({ ...form, priority: v })} />
              </FormSection>

              <FormSection title="Description" collapsible defaultExpanded={false}>
                <textarea
                  value={form.description ?? ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value || null })}
                  className={`${panelInputClass} min-h-[60px] resize-y`}
                  placeholder="Description du projet..."
                  rows={3}
                />
              </FormSection>
            </div>
          </SectionColumns>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

// -- Project Detail Panel -----------------------------------------------------

function ProjectDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data: project, isLoading } = useProject(id)
  const updateProject = useUpdateProject()
  const archiveProject = useArchiveProject()
  const { data: tasks } = useProjectTasks(id)
  const { data: members } = useProjectMembers(id)
  const { data: milestones } = useProjectMilestones(id)
  const { toast } = useToast()

  const handleSave = useCallback((field: string, value: string) => {
    updateProject.mutate({ id, payload: { [field]: value } })
  }, [id, updateProject])

  const handleArchive = useCallback(async () => {
    await archiveProject.mutateAsync(id)
    closeDynamicPanel()
    toast({ title: 'Projet archive', variant: 'success' })
  }, [id, archiveProject, closeDynamicPanel, toast])

  if (isLoading || !project) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<FolderKanban size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  const todoCount = tasks?.filter(t => t.status === 'todo').length ?? 0
  const inProgressCount = tasks?.filter(t => t.status === 'in_progress').length ?? 0
  const doneCount = tasks?.filter(t => t.status === 'done').length ?? 0

  return (
    <DynamicPanelShell
      title={project.code}
      subtitle={project.name}
      icon={<FolderKanban size={14} className="text-primary" />}
      actions={
        <DangerConfirmButton icon={<Trash2 size={12} />} onConfirm={handleArchive} confirmLabel="Archiver ?">
          Archiver
        </DangerConfirmButton>
      }
    >
      <PanelContentLayout>
        <TagManager ownerType="project" ownerId={project.id} compact />

        {/* Quick stats */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1"><WeatherIcon weather={project.weather} size={14} /> {WEATHER_OPTIONS.find(w => w.value === project.weather)?.label}</div>
          <div className="flex items-center gap-1"><Target size={11} /> {project.progress}%</div>
          <div className="flex items-center gap-1"><ListTodo size={11} /> {tasks?.length ?? 0} taches</div>
          <div className="flex items-center gap-1"><Users size={11} /> {members?.length ?? 0} membres</div>
          <div className="flex items-center gap-1"><Milestone size={11} /> {milestones?.length ?? 0} jalons</div>
        </div>

        <SectionColumns>
          <div className="@container space-y-5">
            <FormSection title="Fiche projet" collapsible defaultExpanded storageKey="project-detail-sections">
              <DetailFieldGrid>
                <InlineEditableRow label="Nom" value={project.name} onSave={(v) => handleSave('name', v)} />
                <InlineEditableRow label="Code" value={project.code} onSave={(v) => handleSave('code', v)} />
                <InlineEditableTags label="Statut" value={project.status} options={STATUS_OPTIONS} onSave={(v) => handleSave('status', v)} />
                <InlineEditableTags label="Priorite" value={project.priority} options={PRIORITY_OPTIONS} onSave={(v) => handleSave('priority', v)} />
              </DetailFieldGrid>
              <DetailFieldGrid>
                <ReadOnlyRow label="Chef de projet" value={project.manager_name || '--'} />
                <ReadOnlyRow label="Entreprise" value={project.tier_name || '--'} />
                <ReadOnlyRow label="Budget" value={project.budget ? `${project.budget.toLocaleString('fr-FR')}` : '--'} />
              </DetailFieldGrid>
            </FormSection>

            <FormSection title="Planning" collapsible defaultExpanded storageKey="project-detail-sections">
              <DetailFieldGrid>
                <ReadOnlyRow label="Debut" value={project.start_date ? new Date(project.start_date).toLocaleDateString('fr-FR') : '--'} />
                <ReadOnlyRow label="Fin prevue" value={project.end_date ? new Date(project.end_date).toLocaleDateString('fr-FR') : '--'} />
                <ReadOnlyRow label="Fin reelle" value={project.actual_end_date ? new Date(project.actual_end_date).toLocaleDateString('fr-FR') : '--'} />
              </DetailFieldGrid>
            </FormSection>
          </div>

          <div className="@container space-y-5">
            {/* Tasks mini-view */}
            <FormSection title={`Taches (${tasks?.length ?? 0})`} collapsible defaultExpanded storageKey="project-detail-sections">
              {tasks && tasks.length > 0 ? (
                <div className="space-y-1.5">
                  {/* Quick kanban counters */}
                  <div className="flex items-center gap-2 text-[10px] mb-2">
                    <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{todoCount} a faire</span>
                    <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">{inProgressCount} en cours</span>
                    <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-600">{doneCount} terminees</span>
                  </div>
                  <div className="border border-border rounded-md overflow-hidden divide-y divide-border/60 max-h-[200px] overflow-y-auto">
                    {tasks.slice(0, 10).map((task) => (
                      <div key={task.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                        <span className={cn(
                          'w-2 h-2 rounded-full shrink-0',
                          task.status === 'done' ? 'bg-green-500' : task.status === 'in_progress' ? 'bg-primary' : task.status === 'review' ? 'bg-yellow-500' : 'bg-muted-foreground/30',
                        )} />
                        <span className="flex-1 truncate text-foreground">{task.title}</span>
                        <span className="text-muted-foreground text-[10px]">{task.assignee_name || ''}</span>
                      </div>
                    ))}
                  </div>
                  {tasks.length > 10 && (
                    <p className="text-[10px] text-muted-foreground text-center">+ {tasks.length - 10} autres taches</p>
                  )}
                </div>
              ) : (
                <EmptyState icon={ListTodo} title="Aucune tache" variant="search" size="compact" />
              )}
            </FormSection>

            {/* Milestones */}
            <FormSection title={`Jalons (${milestones?.length ?? 0})`} collapsible defaultExpanded={false} storageKey="project-detail-sections">
              {milestones && milestones.length > 0 ? (
                <div className="space-y-1.5">
                  {milestones.map((ms) => (
                    <div key={ms.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-border/40 last:border-0">
                      <Milestone size={11} className={cn(ms.status === 'completed' ? 'text-green-500' : ms.status === 'overdue' ? 'text-red-500' : 'text-muted-foreground')} />
                      <span className="flex-1 truncate text-foreground">{ms.name}</span>
                      {ms.due_date && <span className="text-muted-foreground text-[10px]">{new Date(ms.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Milestone} title="Aucun jalon" variant="search" size="compact" />
              )}
            </FormSection>
          </div>
        </SectionColumns>

        {/* Notes & Documents */}
        <FormSection title="Notes & Documents" collapsible defaultExpanded={false} storageKey="project-detail-sections">
          <DetailFieldGrid>
            <div>
              <NoteManager ownerType="project" ownerId={project.id} compact />
            </div>
            <div>
              <AttachmentManager ownerType="project" ownerId={project.id} compact />
            </div>
          </DetailFieldGrid>
        </FormSection>

        <FormSection title="Description" collapsible defaultExpanded={false} storageKey="project-detail-sections">
          <InlineEditableRow label="Description" value={project.description || ''} onSave={(v) => handleSave('description', v)} />
        </FormSection>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// -- Main Page ----------------------------------------------------------------

export function ProjetsPage() {
  useTranslation()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>({})

  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)
  const setNavItems = useUIStore((s) => s.setDynamicPanelNavItems)

  const statusFilter = typeof activeFilters.status === 'string' ? activeFilters.status : undefined
  const priorityFilter = typeof activeFilters.priority === 'string' ? activeFilters.priority : undefined

  const { data, isLoading } = useProjects({
    page, page_size: pageSize,
    search: debouncedSearch || undefined,
    status: statusFilter,
    priority: priorityFilter,
  })

  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilters])

  useEffect(() => {
    if (data?.items) setNavItems(data.items.map(i => i.id))
    return () => setNavItems([])
  }, [data?.items, setNavItems])

  const filters = useMemo<DataTableFilterDef[]>(() => [
    { id: 'status', label: 'Statut', type: 'multi-select', operators: ['is', 'is_not'], options: STATUS_OPTIONS.map(o => ({ value: o.value, label: o.label })) },
    { id: 'priority', label: 'Priorite', type: 'select', options: PRIORITY_OPTIONS.map(o => ({ value: o.value, label: o.label })) },
  ], [])

  const handleFilterChange = useCallback((filterId: string, value: unknown) => {
    setActiveFilters(prev => {
      const next = { ...prev }
      if (value === undefined || value === null) delete next[filterId]
      else next[filterId] = value
      return next
    })
  }, [])

  const columns = useMemo<ColumnDef<Project, unknown>[]>(() => [
    { accessorKey: 'code', header: 'Code', size: 100, cell: ({ row }) => <span className="font-medium text-foreground">{row.original.code}</span> },
    { accessorKey: 'name', header: 'Nom', cell: ({ row }) => <span className="text-foreground">{row.original.name}</span> },
    {
      accessorKey: 'status', header: 'Statut', size: 100,
      cell: ({ row }) => {
        const s = row.original.status
        const cls = s === 'active' ? 'gl-badge-success' : s === 'completed' ? 'gl-badge-info' : s === 'on_hold' || s === 'cancelled' ? 'gl-badge-danger' : 'gl-badge-neutral'
        return <span className={cn('gl-badge', cls)}>{STATUS_OPTIONS.find(o => o.value === s)?.label ?? s}</span>
      },
    },
    { accessorKey: 'weather', header: 'Meteo', size: 60, cell: ({ row }) => <WeatherIcon weather={row.original.weather} /> },
    {
      accessorKey: 'progress', header: '%', size: 60,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${row.original.progress}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums">{row.original.progress}%</span>
        </div>
      ),
    },
    {
      accessorKey: 'priority', header: 'Priorite', size: 80,
      cell: ({ row }) => {
        const p = row.original.priority
        const cls = p === 'critical' ? 'gl-badge-danger' : p === 'high' ? 'gl-badge-warning' : 'gl-badge-neutral'
        return <span className={cn('gl-badge', cls)}>{PRIORITY_OPTIONS.find(o => o.value === p)?.label ?? p}</span>
      },
    },
    { accessorKey: 'manager_name', header: 'Chef de projet', size: 140, cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.manager_name || '--'}</span> },
    { accessorKey: 'task_count', header: 'Taches', size: 70, cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.task_count ?? 0}</span> },
    { accessorKey: 'tier_name', header: 'Entreprise', size: 130, cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.tier_name || '--'}</span> },
    {
      accessorKey: 'end_date', header: 'Echeance', size: 100,
      cell: ({ row }) => row.original.end_date
        ? <span className="text-muted-foreground text-xs">{new Date(row.original.end_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        : <span className="text-muted-foreground/40">--</span>,
    },
  ], [])

  const pagination: DataTablePagination | undefined = data ? { page: data.page, pageSize, total: data.total, pages: data.pages } : undefined
  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'projets'

  return (
    <div className="flex h-full">
      {!isFullPanel && <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <PanelHeader icon={FolderKanban} title="Projets" subtitle="Gestion de projets">
          <ToolbarButton icon={Plus} label="Nouveau projet" variant="primary" onClick={() => openDynamicPanel({ type: 'create', module: 'projets' })} />
        </PanelHeader>

        <PanelContent>
          <DataTable<Project>
            columns={columns}
            data={data?.items ?? []}
            isLoading={isLoading}
            pagination={pagination}
            onPaginationChange={(p, size) => { if (size !== pageSize) { setPageSize(size); setPage(1) } else setPage(p) }}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Rechercher par code ou nom..."
            filters={filters}
            activeFilters={activeFilters}
            onFilterChange={handleFilterChange}
            onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'projets', id: row.id })}
            emptyIcon={FolderKanban}
            emptyTitle="Aucun projet"
            columnResizing
            columnPinning
            columnVisibility
            defaultPinnedColumns={{ left: ['code'] }}
            defaultHiddenColumns={['tier_name', 'end_date']}
            storageKey="projets"
          />
        </PanelContent>
      </div>}

      {dynamicPanel?.module === 'projets' && dynamicPanel.type === 'create' && <CreateProjectPanel />}
      {dynamicPanel?.module === 'projets' && dynamicPanel.type === 'detail' && <ProjectDetailPanel id={dynamicPanel.id} />}
    </div>
  )
}

registerPanelRenderer('projets', (view) => {
  if (view.type === 'create') return <CreateProjectPanel />
  if (view.type === 'detail' && 'id' in view) return <ProjectDetailPanel id={view.id} />
  return null
})
