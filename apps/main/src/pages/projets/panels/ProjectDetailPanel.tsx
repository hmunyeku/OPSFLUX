/**
 * Project Detail panel + all sections (tasks, milestones, members, WBS,
 * CPM, revisions, templates, custom fields, comments, activity, etc.).
 *
 * Extracted from ProjetsPage.tsx — pure restructure, no behavior changes.
 */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FolderKanban, Plus, Loader2, Trash2, Users, Target, X, Check,
  Milestone, ListTodo, UserPlus,
  Circle, CheckCircle2,
  ChevronRight, Layers, RefreshCw,
  Link2, Package, CheckSquare, History, ArrowRight,
  Settings2,
  FileDown, Copy, MessageSquare, Activity, Send, LayoutTemplate,
  Sun, Cloud, CloudRain, CloudLightning,
} from 'lucide-react'
import { TabBar } from '@/components/ui/Tabs'
import { Info, Paperclip, LayoutList, BarChart3, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { normalizeNames } from '@/lib/normalize'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import {
  DynamicPanelShell,
  FormSection,
  InlineEditableRow,
  InlineEditableTags,
  ReadOnlyRow,
  PanelActionButton,
  DangerConfirmButton,
  panelInputClass,
  PanelContentLayout,
  SectionColumns,
  DetailFieldGrid,
  TagSelector,
} from '@/components/layout/DynamicPanel'
import { NoteManager } from '@/components/shared/NoteManager'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { TagManager } from '@/components/shared/TagManager'
import { useUIStore } from '@/stores/uiStore'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import {
  useProject, useUpdateProject, useArchiveProject,
  useProjectTasks, useCreateProjectTask, useUpdateProjectTask, useDeleteProjectTask,
  useProjectMembers, useAddProjectMember, useRemoveProjectMember,
  useProjectMilestones, useCreateProjectMilestone, useUpdateProjectMilestone, useDeleteProjectMilestone,
  useGoutiStatus, useGoutiSyncOne,
  useTaskDependencies, useCreateTaskDependency, useDeleteTaskDependency,
  useTaskDeliverables, useCreateDeliverable, useUpdateDeliverable, useDeleteDeliverable,
  useTaskActions, useCreateAction, useUpdateAction, useDeleteAction,
  useTaskChangelog,
  useProjectTemplates, useSaveAsTemplate, useCloneFromTemplate, useDeleteTemplate,
  useCustomFields, useSetCustomFieldValue,
  useProjectComments, useCreateProjectComment, useDeleteComment,
  useActivityFeed,
  useExportProjectPdf,
} from '@/hooks/useProjets'
import { useCurrentEntity } from '@/hooks/useEntities'
import { isGoutiProject, goutiProjectId, isProjectFieldEditable } from '@/services/projetsService'
import { PlannerLinkModal } from '@/components/shared/PlannerLinkModal'
import { useUsers } from '@/hooks/useUsers'
import { UserPicker } from '@/components/shared/UserPicker'
import type {
  ProjectTask,
  ProjectMilestone as ProjectMilestoneType,
  ProjectMember as ProjectMemberType,
  TaskDependency, DependencyType,
  TaskDeliverable, TaskAction, TaskChangeLog,
  ActivityFeedItem,
} from '@/types/api'
import { PROGRESS_WEIGHT_METHOD_OPTIONS } from '@/types/api'
import {
  PROJECT_STATUS_VALUES, PROJECT_PRIORITY_VALUES, PROJECT_WEATHER_VALUES,
  PROJECT_TASK_STATUS_VALUES, PROJECT_MEMBER_ROLE_VALUES, PROJECT_DELIVERABLE_STATUS_VALUES,
  PROJECT_STATUS_LABELS_FALLBACK, PROJECT_PRIORITY_LABELS_FALLBACK,
  PROJECT_WEATHER_LABELS_FALLBACK, PROJECT_TASK_STATUS_LABELS_FALLBACK,
  PROJECT_MEMBER_ROLE_LABELS_FALLBACK,
  buildDictionaryOptions,
  GoutiProjectBanner, WeatherIcon, InlinePickerField,
  TaskStatusIcon, nextTaskStatus,
} from '../shared'
import { formatDate } from '@/lib/i18n'
import { WbsSection, CpmSection, PlanningRevisionsSection, SubProjectsSection } from './ProjectDetailAdvanced'
import { RichTextField, RichTextDisplay } from '@/components/shared/RichTextField'
import {
  TimeTrackingSection,
  AllocationMatrixSection,
  LossesSection,
  ProjectReportSection,
} from './ProjectResourcesSections'

function TaskCreateForm({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const createTask = useCreateProjectTask()
  const { toast } = useToast()
  const taskStatusLabels = useDictionaryLabels('project_task_status', PROJECT_TASK_STATUS_LABELS_FALLBACK)
  const projectPriorityLabels = useDictionaryLabels('project_priority', PROJECT_PRIORITY_LABELS_FALLBACK)
  const taskStatusOptions = useMemo(() => buildDictionaryOptions(taskStatusLabels, PROJECT_TASK_STATUS_VALUES), [taskStatusLabels])
  const projectPriorityOptions = useMemo(() => buildDictionaryOptions(projectPriorityLabels, PROJECT_PRIORITY_VALUES), [projectPriorityLabels])
  const [form, setForm] = useState({
    title: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    start_date: '',
    due_date: '',
    estimated_hours: '',
  })

  const handleSubmit = async () => {
    if (!form.title.trim()) return
    try {
      await createTask.mutateAsync({
        projectId,
        payload: {
          title: form.title.trim(),
          description: form.description || null,
          status: form.status,
          priority: form.priority,
          start_date: form.start_date || null,
          due_date: form.due_date || null,
          estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
        },
      })
      toast({ title: t('projets.toast.task_created'), variant: 'success' })
      onClose()
    } catch {
      toast({ title: t('projets.toast.error'), variant: 'error' })
    }
  }

  return (
    <div className="border border-primary/30 rounded-md bg-primary/5 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-primary">Nouvelle tâche</span>
        <button onClick={onClose} className="gl-button gl-button-default"><X size={12} /></button>
      </div>

      <input
        type="text"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        className={`${panelInputClass} w-full text-xs`}
        placeholder={t('projets.placeholders.task_title')}
        autoFocus
      />

      <textarea
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        className={`${panelInputClass} w-full text-xs min-h-[40px] resize-y`}
        placeholder={t('projets.placeholders.description')}
        rows={2}
      />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground mb-0.5 block">Statut</label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={`${panelInputClass} w-full text-xs`}>
            {taskStatusOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground mb-0.5 block">Priorité</label>
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={`${panelInputClass} w-full text-xs`}>
            {projectPriorityOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-2 items-end">
        <DateRangePicker
          startDate={form.start_date || null}
          endDate={form.due_date || null}
          onStartChange={(v) => setForm({ ...form, start_date: v })}
          onEndChange={(v) => setForm({ ...form, due_date: v })}
          startLabel="Début"
          endLabel="Fin"
          className="flex-1"
        />
        <div className="w-20 shrink-0">
          <label className="text-[10px] text-muted-foreground mb-0.5 block">Heures est.</label>
          <input type="number" step="0.5" min="0" value={form.estimated_hours} onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })} className={`${panelInputClass} w-full text-xs`} placeholder={t('projets.placeholders.estimated_hours')} />
        </div>
      </div>

      <div className="flex justify-end gap-1.5 pt-1">
        <button onClick={onClose} className="gl-button-sm gl-button-default">{t('common.cancel')}</button>
        <button onClick={handleSubmit} disabled={createTask.isPending || !form.title.trim()} className="gl-button-sm gl-button-confirm">
          {createTask.isPending ? <Loader2 size={10} className="animate-spin inline mr-1" /> : null}
          Créer
        </button>
      </div>
    </div>
  )
}

// -- Task sub-features: Dependencies / Livrables / Actions / Historique -----

const DEPENDENCY_TYPE_LABELS: Record<DependencyType, string> = {
  finish_to_start: 'FS — Fin → Début',
  start_to_start: 'SS — Début → Début',
  finish_to_finish: 'FF — Fin → Fin',
  start_to_finish: 'SF — Début → Fin',
}

const PROJECT_DELIVERABLE_STATUS_LABELS_FALLBACK: Record<string, string> = {
  pending: 'En attente',
  in_progress: 'En cours',
  delivered: 'Livré',
  accepted: 'Accepté',
  rejected: 'Rejeté',
}

const DELIVERABLE_STATUS_COLOR_MAP: Record<string, string> = {
  pending: 'text-muted-foreground',
  in_progress: 'text-primary',
  delivered: 'text-blue-500',
  accepted: 'text-green-500',
  rejected: 'text-red-500',
}

type SubTab = 'deps' | 'deliverables' | 'actions' | 'history'

function TaskDependenciesSection({ task, projectId, allTasks }: {
  task: ProjectTask
  projectId: string
  allTasks: ProjectTask[]
}) {
  const { data: deps = [] } = useTaskDependencies(projectId)
  const { t } = useTranslation()
  const createDep = useCreateTaskDependency()
  const deleteDep = useDeleteTaskDependency()
  const { toast } = useToast()
  const [showAdd, setShowAdd] = useState(false)
  const [depForm, setDepForm] = useState<{ to_task_id: string; dependency_type: DependencyType; lag_days: number }>({
    to_task_id: '',
    dependency_type: 'finish_to_start',
    lag_days: 0,
  })

  const predecessors = deps.filter((d: TaskDependency) => d.to_task_id === task.id)
  const successors = deps.filter((d: TaskDependency) => d.from_task_id === task.id)
  const otherTasks = allTasks.filter(t => t.id !== task.id)
  const taskById = useMemo(() => new Map(allTasks.map(t => [t.id, t])), [allTasks])

  const handleCreate = async () => {
    if (!depForm.to_task_id) return
    try {
      await createDep.mutateAsync({
        projectId,
        payload: {
          from_task_id: task.id,
          to_task_id: depForm.to_task_id,
          dependency_type: depForm.dependency_type,
          lag_days: depForm.lag_days,
        },
      })
      toast({ title: t('projets.toast.dependency_added'), variant: 'success' })
      setShowAdd(false)
      setDepForm({ to_task_id: '', dependency_type: 'finish_to_start', lag_days: 0 })
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? t('projets.toast.error')
      toast({ title: t('projets.toast.dependency_add_failed'), description: String(msg), variant: 'error' })
    }
  }

  const renderLink = (d: TaskDependency, otherId: string, direction: 'from' | 'to') => {
    const other = taskById.get(otherId)
    return (
      <div key={d.id} className="flex items-center gap-1.5 py-1 text-[11px] group">
        {direction === 'from' ? <ArrowRight size={10} className="text-primary" /> : <ArrowRight size={10} className="text-muted-foreground rotate-180" />}
        <span className="truncate flex-1">{other?.title ?? `(tâche ${otherId.slice(0, 8)}…)`}</span>
        <span className="text-[9px] text-muted-foreground shrink-0">
          {DEPENDENCY_TYPE_LABELS[d.dependency_type]}{d.lag_days ? ` +${d.lag_days}j` : ''}
        </span>
        <button
          onClick={() => deleteDep.mutate({ projectId, depId: d.id })}
          className="p-0.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100"
          title="Supprimer"
        >
          <X size={10} />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {predecessors.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-0.5">Prédécesseurs ({predecessors.length})</div>
          {predecessors.map((d: TaskDependency) => renderLink(d, d.from_task_id, 'to'))}
        </div>
      )}
      {successors.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-0.5">Successeurs ({successors.length})</div>
          {successors.map((d: TaskDependency) => renderLink(d, d.to_task_id, 'from'))}
        </div>
      )}
      {predecessors.length === 0 && successors.length === 0 && !showAdd && (
        <div className="text-[10px] text-muted-foreground italic">Aucune dépendance</div>
      )}

      {showAdd ? (
        <div className="border border-border rounded p-2 space-y-1.5 bg-background">
          <select
            value={depForm.to_task_id}
            onChange={e => setDepForm(f => ({ ...f, to_task_id: e.target.value }))}
            className={`${panelInputClass} w-full text-xs`}
          >
            <option value="">Sélectionner une tâche successeur…</option>
            {otherTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <div className="grid grid-cols-[1fr_60px] gap-1.5">
            <select
              value={depForm.dependency_type}
              onChange={e => setDepForm(f => ({ ...f, dependency_type: e.target.value as DependencyType }))}
              className={`${panelInputClass} text-xs`}
            >
              {(Object.entries(DEPENDENCY_TYPE_LABELS) as [DependencyType, string][]).map(([v, l]) =>
                <option key={v} value={v}>{l}</option>)}
            </select>
            <input
              type="number"
              value={depForm.lag_days}
              onChange={e => setDepForm(f => ({ ...f, lag_days: Number(e.target.value) || 0 }))}
              className={`${panelInputClass} text-xs`}
              placeholder={t('projets.placeholders.lag_days')}
            />
          </div>
          <div className="flex justify-end gap-1">
            <button onClick={() => setShowAdd(false)} className="px-2 py-0.5 text-[10px] rounded hover:bg-muted">{t('common.cancel')}</button>
            <button
              onClick={handleCreate}
              disabled={!depForm.to_task_id || createDep.isPending}
              className="gl-button-sm gl-button-confirm text-[10px]"
            >
              {createDep.isPending ? <Loader2 size={9} className="animate-spin inline" /> : 'Ajouter'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80"
        >
          <Plus size={10} /> Lier à une autre tâche
        </button>
      )}
    </div>
  )
}

function TaskDeliverablesSection({ task, projectId }: { task: ProjectTask; projectId: string }) {
  const { t } = useTranslation()
  const { data: deliverables = [] } = useTaskDeliverables(projectId, task.id)
  const createD = useCreateDeliverable()
  const updateD = useUpdateDeliverable()
  const deleteD = useDeleteDeliverable()
  const deliverableStatusLabels = useDictionaryLabels('project_deliverable_status', PROJECT_DELIVERABLE_STATUS_LABELS_FALLBACK)
  const deliverableStatusOptions = useMemo(() => buildDictionaryOptions(deliverableStatusLabels, PROJECT_DELIVERABLE_STATUS_VALUES), [deliverableStatusLabels])
  const [newName, setNewName] = useState('')

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name) return
    await createD.mutateAsync({ projectId, taskId: task.id, payload: { name } })
    setNewName('')
  }

  return (
    <div className="space-y-1.5">
      {deliverables.length === 0 && (
        <div className="text-[10px] text-muted-foreground italic">Aucun livrable</div>
      )}
      {deliverables.map((d: TaskDeliverable) => {
        const statusColor = DELIVERABLE_STATUS_COLOR_MAP[d.status] ?? 'text-muted-foreground'
        return (
          <div key={d.id} className="flex items-center gap-1.5 text-[11px] group">
            <Package size={10} className={cn('shrink-0', statusColor)} />
            <span className="flex-1 truncate">{d.name}</span>
            <select
              value={d.status}
              onChange={e => updateD.mutate({
                projectId, taskId: task.id, deliverableId: d.id,
                payload: { status: e.target.value },
              })}
              className={`${panelInputClass} text-[10px] w-[90px] py-0`}
              onClick={e => e.stopPropagation()}
            >
              {deliverableStatusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button
              onClick={() => deleteD.mutate({ projectId, taskId: task.id, deliverableId: d.id })}
              className="p-0.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100"
            >
              <X size={10} />
            </button>
          </div>
        )
      })}
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          className={`${panelInputClass} flex-1 text-[11px]`}
          placeholder={t('projets.placeholders.new_deliverable')}
        />
        <button
          onClick={handleAdd}
          disabled={!newName.trim() || createD.isPending}
          className="gl-button gl-button-confirm text-primary"
        >
          {createD.isPending ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
        </button>
      </div>
    </div>
  )
}

function TaskActionsSection({ task, projectId }: { task: ProjectTask; projectId: string }) {
  const { t } = useTranslation()
  const { data: actions = [] } = useTaskActions(projectId, task.id)
  const createA = useCreateAction()
  const updateA = useUpdateAction()
  const deleteA = useDeleteAction()
  const [newTitle, setNewTitle] = useState('')

  const handleAdd = async () => {
    const title = newTitle.trim()
    if (!title) return
    await createA.mutateAsync({ projectId, taskId: task.id, payload: { title } })
    setNewTitle('')
  }

  const toggleDone = (a: TaskAction) => {
    updateA.mutate({
      projectId, taskId: task.id, actionId: a.id,
      payload: { completed: !a.completed },
    })
  }

  const completedCount = actions.filter((a: TaskAction) => a.completed).length

  return (
    <div className="space-y-1.5">
      {actions.length > 0 && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full" style={{ width: `${actions.length > 0 ? (completedCount / actions.length) * 100 : 0}%` }} />
          </div>
          <span className="tabular-nums">{completedCount}/{actions.length}</span>
        </div>
      )}
      {actions.length === 0 && (
        <div className="text-[10px] text-muted-foreground italic">Aucune action</div>
      )}
      {actions.map((a: TaskAction) => (
        <div key={a.id} className="flex items-center gap-1.5 text-[11px] group">
          <button onClick={() => toggleDone(a)} className="shrink-0">
            {a.completed
              ? <CheckSquare size={12} className="text-green-500" />
              : <Circle size={12} className="text-muted-foreground" />}
          </button>
          <span className={cn('flex-1 truncate', a.completed && 'line-through text-muted-foreground')}>{a.title}</span>
          <button
            onClick={() => deleteA.mutate({ projectId, taskId: task.id, actionId: a.id })}
            className="p-0.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100"
          >
            <X size={10} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          className={`${panelInputClass} flex-1 text-[11px]`}
          placeholder={t('projets.placeholders.new_action')}
        />
        <button
          onClick={handleAdd}
          disabled={!newTitle.trim() || createA.isPending}
          className="gl-button gl-button-confirm text-primary"
        >
          {createA.isPending ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
        </button>
      </div>
    </div>
  )
}

function TaskHistorySection({ task, projectId }: { task: ProjectTask; projectId: string }) {
  const { data: logs = [] } = useTaskChangelog(projectId, task.id)
  if (logs.length === 0) {
    return <div className="text-[10px] text-muted-foreground italic">Aucune modification enregistrée</div>
  }
  return (
    <div className="space-y-1 max-h-[160px] overflow-y-auto">
      {logs.map((l: TaskChangeLog) => (
        <div key={l.id} className="text-[10px] border-l-2 border-border pl-2 py-0.5">
          <div className="flex items-center gap-1">
            <span className="font-medium">{l.field_name}</span>
            <span className="text-muted-foreground">•</span>
            <span className="text-muted-foreground">{new Date(l.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div className="text-muted-foreground truncate">
            <span className="line-through">{l.old_value ?? '∅'}</span>
            <ArrowRight size={8} className="inline mx-1" />
            <span className="text-foreground">{l.new_value ?? '∅'}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function TaskSubFeatures({ task, projectId, allTasks }: {
  task: ProjectTask
  projectId: string
  allTasks: ProjectTask[]
}) {
  const [tab, setTab] = useState<SubTab>('deps')
  const tabs: { id: SubTab; label: string; icon: typeof Link2 }[] = [
    { id: 'deps', label: 'Dépendances', icon: Link2 },
    { id: 'deliverables', label: 'Livrables', icon: Package },
    { id: 'actions', label: 'Actions', icon: CheckSquare },
    { id: 'history', label: 'Historique', icon: History },
  ]
  return (
    <div className="border-t border-border/30 pt-2 mt-1">
      <div className="flex items-center gap-0.5 mb-2 border border-border rounded p-0.5 bg-muted/20">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors flex-1 justify-center',
                tab === t.id ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon size={10} />
              {t.label}
            </button>
          )
        })}
      </div>
      <div className="px-1">
        {tab === 'deps' && <TaskDependenciesSection task={task} projectId={projectId} allTasks={allTasks} />}
        {tab === 'deliverables' && <TaskDeliverablesSection task={task} projectId={projectId} />}
        {tab === 'actions' && <TaskActionsSection task={task} projectId={projectId} />}
        {tab === 'history' && <TaskHistorySection task={task} projectId={projectId} />}
      </div>
    </div>
  )
}

// -- Task Row (interactive, expandable) --------------------------------------

function TaskRow({
  task, projectId, allTasks, depth = 0,
}: {
  task: ProjectTask
  projectId: string
  allTasks: ProjectTask[]
  depth?: number
}) {
  const { t } = useTranslation()
  const updateTask = useUpdateProjectTask()
  const deleteTask = useDeleteProjectTask()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [expanded, setExpanded] = useState(false)
  // Brief visual highlight when the row is the target of a deep-link
  // (e.g. clicked from the Activité tab). Pulses for ~1.5s then fades.
  const [highlight, setHighlight] = useState(false)
  const rowRef = useRef<HTMLDivElement | null>(null)
  // Cross-section navigation: listen for `opsflux:focus-task` events
  // dispatched when the user clicks an entry in the activity feed.
  // When the event matches this row, we expand it, scroll it into view,
  // and flash a highlight so the user can spot it instantly.
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ taskId: string }>
      if (!ce.detail || ce.detail.taskId !== task.id) return
      setExpanded(true)
      // Defer so the expanded content is in the DOM when we scroll.
      requestAnimationFrame(() => {
        rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
      setHighlight(true)
      const t = setTimeout(() => setHighlight(false), 1600)
      return () => clearTimeout(t)
    }
    window.addEventListener('opsflux:focus-task', handler as EventListener)
    return () => window.removeEventListener('opsflux:focus-task', handler as EventListener)
  }, [task.id])
  const taskStatusLabels = useDictionaryLabels('project_task_status', PROJECT_TASK_STATUS_LABELS_FALLBACK)
  const projectPriorityLabels = useDictionaryLabels('project_priority', PROJECT_PRIORITY_LABELS_FALLBACK)
  const taskStatusOptions = useMemo(() => buildDictionaryOptions(taskStatusLabels, PROJECT_TASK_STATUS_VALUES), [taskStatusLabels])
  const projectPriorityOptions = useMemo(() => buildDictionaryOptions(projectPriorityLabels, PROJECT_PRIORITY_VALUES), [projectPriorityLabels])

  const handleStatusChange = (newStatus: string) => {
    updateTask.mutate({ projectId, taskId: task.id, payload: { status: newStatus } })
  }

  const handleFieldSave = (field: string, value: string | number | null) => {
    updateTask.mutate({ projectId, taskId: task.id, payload: { [field]: value } })
  }

  const handleDelete = () => {
    deleteTask.mutate({ projectId, taskId: task.id })
    setConfirmDelete(false)
  }

  const statusOpt = taskStatusOptions.find(s => s.value === task.status)
  const priorityOpt = projectPriorityOptions.find(p => p.value === task.priority)
  const childTasks = allTasks.filter(t => t.parent_id === task.id)
  const hasChildren = childTasks.length > 0

  // Aggregate stats for parent tasks: how many subtasks done + average
  // progress across direct children. Useful at a glance on a WBS node
  // without having to expand it.
  const subAgg = useMemo(() => {
    if (!hasChildren) return null
    const total = childTasks.length
    const done = childTasks.filter(c => c.status === 'done').length
    const avgProgress = Math.round(
      childTasks.reduce((s, c) => s + (c.progress ?? 0), 0) / Math.max(1, total),
    )
    return { total, done, avgProgress }
  }, [childTasks, hasChildren])

  // Overdue detection: due date in the past AND task not completed/cancelled.
  const overdue = useMemo(() => {
    if (!task.due_date) return false
    if (task.status === 'done' || task.status === 'cancelled') return false
    const d = new Date(task.due_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return d < today
  }, [task.due_date, task.status])

  // Effective progress for the bar: parents show aggregate, leaves show their own.
  const displayProgress = subAgg ? subAgg.avgProgress : (task.progress ?? 0)

  // Duration in days (inclusive). Returns null when either bound missing.
  const durationDays = useMemo(() => {
    if (!task.start_date || !task.due_date) return null
    const s = new Date(task.start_date); const e = new Date(task.due_date)
    const d = Math.round((e.getTime() - s.getTime()) / 86_400_000)
    return d >= 0 ? d + 1 : null
  }, [task.start_date, task.due_date])

  // Weather indicator — derived heuristic comparing real progress vs.
  // the linear "expected progress today" between start_date and due_date:
  //   ☀ sunny  : on or ahead of schedule (or done)
  //   ☁ cloudy : 10–25% behind expected
  //   🌧 rainy  : >25% behind expected
  //   ⛈ stormy : overdue and not finished
  // Cancelled tasks return null (no météo).
  const weather = useMemo<null | 'sunny' | 'cloudy' | 'rainy' | 'stormy'>(() => {
    if (task.status === 'cancelled') return null
    if (task.status === 'done') return 'sunny'
    if (!task.due_date) return null
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const due = new Date(task.due_date); due.setHours(0, 0, 0, 0)
    if (today > due && displayProgress < 100) return 'stormy'
    const start = task.start_date ? new Date(task.start_date) : null
    if (start) start.setHours(0, 0, 0, 0)
    let expected = 0
    if (start && due > start) {
      if (today <= start) expected = 0
      else if (today >= due) expected = 100
      else expected = ((today.getTime() - start.getTime()) / (due.getTime() - start.getTime())) * 100
    } else {
      expected = today >= due ? 100 : 0
    }
    const delta = displayProgress - expected
    if (delta < -25) return 'rainy'
    if (delta < -10) return 'cloudy'
    return 'sunny'
  }, [task.status, task.start_date, task.due_date, displayProgress])

  const WeatherIcon = weather === 'sunny' ? Sun : weather === 'cloudy' ? Cloud : weather === 'rainy' ? CloudRain : weather === 'stormy' ? CloudLightning : null
  const weatherTone = weather === 'sunny' ? 'text-amber-500' : weather === 'cloudy' ? 'text-zinc-400' : weather === 'rainy' ? 'text-blue-500' : 'text-red-500'
  const weatherLabel = weather === 'sunny' ? 'Dans les temps' : weather === 'cloudy' ? 'Léger retard' : weather === 'rainy' ? 'Retard important' : weather === 'stormy' ? 'En dépassement' : ''

  const fmtShortDate = (iso: string | null) => {
    if (!iso) return null
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
  }

  return (
    <div
      ref={rowRef}
      data-task-id={task.id}
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={hasChildren ? expanded : undefined}
      className={cn(
        'border-b border-border/30 last:border-0 transition-colors duration-700',
        highlight && 'bg-primary/15 ring-1 ring-primary/40 rounded-md',
      )}
    >
      {/* Summary row — single line: chevron · status · title · meteo · dates · durée · % · actions.
          The full-width progress bar that used to live below the title was removed:
          progress is now expressed inline as a percentage and (visually) by the meteo. */}
      <div
        className="group flex items-center gap-2 py-1.5 text-xs hover:bg-muted/40 transition-colors cursor-pointer relative"
        style={{ paddingLeft: `${10 + depth * 16}px`, paddingRight: '10px' }}
        onClick={() => setExpanded(!expanded)}
      >
        {hasChildren ? (
          <ChevronRight
            size={10}
            className={cn('text-muted-foreground shrink-0 transition-transform', expanded && 'rotate-90')}
          />
        ) : (
          <span className="w-[10px] shrink-0" />
        )}
        <button onClick={(e) => { e.stopPropagation(); handleStatusChange(nextTaskStatus(task.status)) }} className="shrink-0 hover:scale-110 transition-transform" title={statusOpt?.label}>
          <TaskStatusIcon status={task.status} />
        </button>

        {/* Title (flex-1, truncates) — keeps the strikethrough for done tasks */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className={cn('truncate font-medium', task.status === 'done' && 'line-through text-muted-foreground')}>{task.title}</span>
          {hasChildren && subAgg && (
            <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground tabular-nums">
              {subAgg.done}/{subAgg.total}
            </span>
          )}
          {(task.priority === 'high' || task.priority === 'critical') && (
            <span className={cn('text-[9px] px-1 rounded shrink-0', task.priority === 'critical' ? 'bg-red-500/10 text-red-500' : 'bg-orange-500/10 text-orange-500')}>
              {priorityOpt?.label}
            </span>
          )}
        </div>

        {/* Météo — only when we can compute it (not cancelled, has due date) */}
        {WeatherIcon && (
          <span className={cn('shrink-0', weatherTone)} title={`Météo : ${weatherLabel}`}>
            <WeatherIcon size={12} />
          </span>
        )}

        {/* Date range — start → end, compact. Only end if start is missing.
            Hidden on very narrow widths via the `hidden sm:flex` switch. */}
        {(task.start_date || task.due_date) && (
          <span
            className={cn(
              'hidden sm:flex items-center gap-0.5 text-[10px] tabular-nums shrink-0 w-[110px] justify-end',
              overdue ? 'text-red-500 font-semibold' : 'text-muted-foreground',
            )}
            title={
              overdue ? 'Échéance dépassée' :
              task.start_date && task.due_date ? `${fmtShortDate(task.start_date)} → ${fmtShortDate(task.due_date)}` :
              task.due_date ? `Échéance ${fmtShortDate(task.due_date)}` :
              `Début ${fmtShortDate(task.start_date)}`
            }
          >
            {task.start_date && task.due_date ? (
              <>
                <span>{fmtShortDate(task.start_date)}</span>
                <span className="text-muted-foreground/60">→</span>
                <span>{fmtShortDate(task.due_date)}</span>
              </>
            ) : (
              <span>{fmtShortDate(task.due_date) || fmtShortDate(task.start_date)}</span>
            )}
          </span>
        )}

        {/* Durée — fixed width slot so columns align across rows */}
        <span className="text-[10px] tabular-nums text-muted-foreground shrink-0 w-[42px] text-right" title={durationDays ? `Durée ${durationDays} j` : 'Durée non définie'}>
          {durationDays ? `${durationDays}j` : '—'}
        </span>

        {/* Progress % — color-coded mini chip; always shown so the column is stable */}
        <span
          className={cn(
            'shrink-0 w-[40px] text-right text-[10px] tabular-nums font-medium',
            displayProgress >= 100 ? 'text-green-600' :
            overdue ? 'text-red-500' :
            displayProgress >= 50 ? 'text-primary' :
            displayProgress > 0 ? 'text-foreground/80' :
            'text-muted-foreground/60',
          )}
          title={subAgg ? `Moyenne ${displayProgress}% sur ${subAgg.total} sous-tâches` : `${displayProgress}%`}
        >
          {displayProgress}%
        </span>

        {/* Assignee — hidden on small to keep the row tight */}
        {task.assignee_name && (
          <span
            className="hidden md:inline text-muted-foreground text-[10px] max-w-[80px] truncate shrink-0"
            title={task.assignee_name}
          >
            {task.assignee_name}
          </span>
        )}

        {/* Actions */}
        {confirmDelete ? (
          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <button onClick={handleDelete} className="gl-button gl-button-danger text-red-500"><Check size={10} /></button>
            <button onClick={() => setConfirmDelete(false)} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X size={10} /></button>
          </div>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }} className="p-0.5 rounded hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            <Trash2 size={10} />
          </button>
        )}
      </div>

      {/* Expanded detail (like Gouti task sheet) */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 bg-muted/20 space-y-2.5 border-t border-border/30">
          {/* Status + Priority selectors */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Statut</label>
              <select value={task.status} onChange={(e) => handleStatusChange(e.target.value)} className={`${panelInputClass} w-full text-xs`}>
                {taskStatusOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Priorité</label>
              <select value={task.priority} onChange={(e) => handleFieldSave('priority', e.target.value)} className={`${panelInputClass} w-full text-xs`}>
                {projectPriorityOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>

          {/* Dates */}
          <DateRangePicker
            startDate={task.start_date?.split('T')[0] ?? null}
            endDate={task.due_date?.split('T')[0] ?? null}
            onStartChange={(v) => handleFieldSave('start_date', v || null)}
            onEndChange={(v) => handleFieldSave('due_date', v || null)}
            startLabel="Début"
            endLabel="Fin"
          />

          {/* Progress + Hours */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Progression %</label>
              <input
                type="number" min="0" max="100" step="5"
                defaultValue={task.progress}
                onBlur={(e) => handleFieldSave('progress', e.target.value ? Number(e.target.value) : 0)}
                className={`${panelInputClass} w-full text-xs`}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Heures est.</label>
              <input
                type="number" min="0" step="0.5"
                defaultValue={task.estimated_hours ?? ''}
                onBlur={(e) => handleFieldSave('estimated_hours', e.target.value ? Number(e.target.value) : null)}
                className={`${panelInputClass} w-full text-xs`}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Heures réelles</label>
              <input
                type="number" min="0" step="0.5"
                defaultValue={task.actual_hours ?? ''}
                onBlur={(e) => handleFieldSave('actual_hours', e.target.value ? Number(e.target.value) : null)}
                className={`${panelInputClass} w-full text-xs`}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">Description</label>
            <textarea
              defaultValue={task.description ?? ''}
              onBlur={(e) => handleFieldSave('description', e.target.value || null)}
              className={`${panelInputClass} w-full text-xs min-h-[36px] resize-y`}
              rows={2}
              placeholder={t('projets.placeholders.task_description')}
            />
          </div>

          {/* Dependencies / Deliverables / Actions / History tabs */}
          <TaskSubFeatures task={task} projectId={projectId} allTasks={allTasks} />

          {/* Meta info */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1">
            {task.code && <span>Ref: {task.code}</span>}
            {task.assignee_name && <span>Resp: {task.assignee_name}</span>}
            <span>Créé le {formatDate(task.created_at)}</span>
            {task.completed_at && <span>Terminé le {formatDate(task.completed_at)}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

// -- Milestone Row (interactive) ---------------------------------------------

function MilestoneRow({ ms, projectId }: { ms: ProjectMilestoneType; projectId: string }) {
  const updateMs = useUpdateProjectMilestone()
  const deleteMs = useDeleteProjectMilestone()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const toggleComplete = () => {
    if (ms.status === 'completed') {
      updateMs.mutate({ projectId, msId: ms.id, payload: { status: 'pending', completed_at: null } })
    } else {
      updateMs.mutate({ projectId, msId: ms.id, payload: { status: 'completed', completed_at: new Date().toISOString() } })
    }
  }

  return (
    <div className="group flex items-center gap-2 text-xs py-1.5 border-b border-border/40 last:border-0">
      <button onClick={toggleComplete} className="shrink-0 hover:scale-110 transition-transform">
        {ms.status === 'completed'
          ? <CheckCircle2 size={12} className="text-green-500" />
          : ms.status === 'overdue'
            ? <Milestone size={12} className="text-red-500" />
            : <Milestone size={12} className="text-muted-foreground" />
        }
      </button>
      <span className={cn('flex-1 truncate text-foreground', ms.status === 'completed' && 'line-through text-muted-foreground')}>{ms.name}</span>
      {ms.due_date && (
        <span className="text-muted-foreground text-[10px] tabular-nums">{new Date(ms.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
      )}
      {confirmDelete ? (
        <div className="flex items-center gap-0.5">
          <button onClick={() => { deleteMs.mutate({ projectId, msId: ms.id }); setConfirmDelete(false) }} className="p-0.5 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20"><Check size={10} /></button>
          <button onClick={() => setConfirmDelete(false)} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X size={10} /></button>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)} className="p-0.5 rounded hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
          <Trash2 size={10} />
        </button>
      )}
    </div>
  )
}

// -- Milestone Quick Add -----------------------------------------------------

function MilestoneQuickAdd({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [dueDate, setDueDate] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const createMs = useCreateProjectMilestone()

  const handleSubmit = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    await createMs.mutateAsync({ projectId, payload: { name: trimmed, due_date: dueDate || null } })
    setName('')
    setDueDate('')
    inputRef.current?.focus()
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50) }}
        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 py-1"
      >
        <Plus size={12} /> Ajouter un jalon
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') { setOpen(false); setName(''); setDueDate('') } }}
        className={`${panelInputClass} flex-1 text-xs`}
        placeholder={t('projets.placeholders.milestone_name')}
        autoFocus
      />
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className={`${panelInputClass} w-[110px] text-xs`}
      />
      <button onClick={handleSubmit} disabled={createMs.isPending || !name.trim()} className="gl-button gl-button-confirm text-primary">
        {createMs.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
      </button>
      <button onClick={() => { setOpen(false); setName(''); setDueDate('') }} className="p-1 rounded hover:bg-muted text-muted-foreground">
        <X size={12} />
      </button>
    </div>
  )
}

// -- Member Row (interactive) ------------------------------------------------

function MemberRow({ member, projectId }: { member: ProjectMemberType; projectId: string }) {
  const removeMember = useRemoveProjectMember()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const memberRoleLabels = useDictionaryLabels('project_member_role', PROJECT_MEMBER_ROLE_LABELS_FALLBACK)

  const roleLbl = memberRoleLabels[member.role] ?? member.role

  return (
    <div className="group flex items-center gap-2 text-xs py-1.5 border-b border-border/40 last:border-0">
      <Users size={11} className="text-muted-foreground shrink-0" />
      <span className="flex-1 truncate text-foreground">{member.member_name || '(inconnu)'}</span>
      <span className="text-muted-foreground text-[10px]">{roleLbl}</span>
      {confirmDelete ? (
        <div className="flex items-center gap-0.5">
          <button onClick={() => { removeMember.mutate({ projectId, memberId: member.id }); setConfirmDelete(false) }} className="p-0.5 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20"><Check size={10} /></button>
          <button onClick={() => setConfirmDelete(false)} className="p-0.5 rounded hover:bg-muted text-muted-foreground"><X size={10} /></button>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)} className="p-0.5 rounded hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
          <Trash2 size={10} />
        </button>
      )}
    </div>
  )
}

// -- Member Quick Add --------------------------------------------------------

function MemberQuickAdd({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [selectedUserLabel, setSelectedUserLabel] = useState<string>('')
  const [role, setRole] = useState('member')
  const addMember = useAddProjectMember()
  const memberRoleLabels = useDictionaryLabels('project_member_role', PROJECT_MEMBER_ROLE_LABELS_FALLBACK)
  const memberRoleOptions = useMemo(() => buildDictionaryOptions(memberRoleLabels, PROJECT_MEMBER_ROLE_VALUES), [memberRoleLabels])

  const reset = () => {
    setSelectedUserId(null)
    setSelectedUserLabel('')
    setRole('member')
    setOpen(false)
  }

  const handleSubmit = async () => {
    if (!selectedUserId) return
    await addMember.mutateAsync({ projectId, payload: { user_id: selectedUserId, role } })
    reset()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 py-1 mt-1"
      >
        <UserPlus size={12} /> Ajouter un membre
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1 p-2 rounded-md border border-border/40 bg-card/40">
      <div className="flex-1 min-w-[200px]">
        <UserPicker
          value={selectedUserId}
          onChange={(id, item) => {
            setSelectedUserId(id)
            if (item) {
              setSelectedUserLabel(`${item.first_name} ${item.last_name}`.trim() || item.email)
            } else {
              setSelectedUserLabel('')
            }
          }}
          placeholder="Sélectionner un utilisateur…"
        />
      </div>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className={`${panelInputClass} w-[110px] text-xs`}
      >
        {memberRoleOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      <button
        onClick={handleSubmit}
        disabled={addMember.isPending || !selectedUserId}
        className="inline-flex items-center gap-1 px-3 h-8 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
        title={selectedUserId ? `Ajouter ${selectedUserLabel}` : 'Sélectionnez d\'abord un utilisateur'}
      >
        {addMember.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
        Ajouter
      </button>
      <button
        onClick={reset}
        className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
        title="Annuler"
      >
        <X size={14} />
      </button>
    </div>
  )
}

// -- Task Section (list + create) — like Gouti "Progression et controle" -----

function TaskSection({ projectId, tasks }: { projectId: string; tasks: ProjectTask[] }) {
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'order' | 'due_date' | 'priority' | 'progress'>('order')

  const counts = useMemo(() => ({
    todo: tasks.filter(t => t.status === 'todo').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    review: tasks.filter(t => t.status === 'review').length,
    done: tasks.filter(t => t.status === 'done').length,
    cancelled: tasks.filter(t => t.status === 'cancelled').length,
  }), [tasks])

  // Apply filters: search across title + status filter.
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return tasks.filter(t => {
      if (statusFilter && t.status !== statusFilter) return false
      if (s && !(t.title || '').toLowerCase().includes(s)) return false
      return true
    })
  }, [tasks, search, statusFilter])

  // When filters are active, show a flat sorted list (no hierarchy) so
  // the matching tasks aren't hidden under a collapsed parent. Fallback
  // to the hierarchical tree only when no filter is applied — that's
  // the typical reading mode for medium projects with WBS structure.
  const isFiltered = !!search.trim() || !!statusFilter

  const sorted = useMemo(() => {
    const list = [...filtered]
    const priorityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
    if (sortBy === 'due_date') {
      list.sort((a, b) => {
        const da = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER
        const db = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER
        return da - db
      })
    } else if (sortBy === 'priority') {
      list.sort((a, b) =>
        (priorityRank[a.priority ?? 'medium'] ?? 9) -
        (priorityRank[b.priority ?? 'medium'] ?? 9),
      )
    } else if (sortBy === 'progress') {
      list.sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))
    } else {
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    }
    return list
  }, [filtered, sortBy])

  const tree = useMemo(() => {
    const byParent = new Map<string | null, ProjectTask[]>()
    for (const t of tasks) {
      const key = t.parent_id ?? null
      if (!byParent.has(key)) byParent.set(key, [])
      byParent.get(key)!.push(t)
    }
    for (const arr of byParent.values()) {
      arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    }
    return byParent
  }, [tasks])

  const walk = (parent: string | null, depth: number): React.ReactNode[] => {
    const children = tree.get(parent) || []
    const nodes: React.ReactNode[] = []
    for (const t of children) {
      nodes.push(
        <TaskRow key={t.id} task={t} projectId={projectId} allTasks={tasks} depth={depth} />,
      )
      nodes.push(...walk(t.id, depth + 1))
    }
    return nodes
  }

  const renderRows = (): React.ReactNode => {
    if (isFiltered) {
      // Flat sorted view — matching tasks always visible regardless of parent.
      return sorted.map(t => (
        <TaskRow key={t.id} task={t} projectId={projectId} allTasks={tasks} depth={0} />
      ))
    }
    const rootNodes = walk(null, 0)
    const knownIds = new Set(tasks.map(t => t.id))
    const orphanNodes = tasks
      .filter(t => t.parent_id && !knownIds.has(t.parent_id))
      .map(t => (
        <TaskRow key={t.id} task={t} projectId={projectId} allTasks={tasks} depth={0} />
      ))
    return [...rootNodes, ...orphanNodes]
  }

  const STATUS_PILLS: { value: string; label: string; cls: string; count: number }[] = [
    { value: 'todo', label: 'À faire', cls: 'bg-muted text-muted-foreground', count: counts.todo },
    { value: 'in_progress', label: 'En cours', cls: 'bg-primary/10 text-primary', count: counts.in_progress },
    { value: 'review', label: 'Revue', cls: 'bg-yellow-500/10 text-yellow-600', count: counts.review },
    { value: 'done', label: 'Terminées', cls: 'bg-green-500/10 text-green-600', count: counts.done },
    { value: 'cancelled', label: 'Annulées', cls: 'bg-red-500/5 text-red-500', count: counts.cancelled },
  ]

  return (
    <FormSection
      title={`Tâches (${tasks.length})`}
      collapsible
      defaultExpanded
      storageKey="project-detail-tasks"
    >
      {/* Status filter pills — click to filter, click again to clear */}
      <div className="flex items-center gap-1 text-[10px] mb-2 flex-wrap">
        {STATUS_PILLS.filter(p => p.count > 0 || statusFilter === p.value).map(p => {
          const active = statusFilter === p.value
          return (
            <button
              key={p.value}
              onClick={() => setStatusFilter(active ? null : p.value)}
              className={cn(
                'px-1.5 py-0.5 rounded transition-all',
                p.cls,
                active ? 'ring-1 ring-foreground/40 font-semibold' : 'opacity-70 hover:opacity-100',
              )}
            >
              {p.count} {p.label.toLowerCase()}
            </button>
          )
        })}
        {statusFilter && (
          <button
            onClick={() => setStatusFilter(null)}
            className="text-[10px] text-muted-foreground hover:text-foreground underline ml-1"
          >
            Tout
          </button>
        )}
      </div>

      {/* Search + Sort */}
      {tasks.length > 4 && (
        <div className="flex items-center gap-1.5 mb-2">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une tâche…"
              className={`${panelInputClass} text-xs pl-7 w-full h-7`}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={11} />
              </button>
            )}
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className={`${panelInputClass} text-xs h-7 w-[110px]`}
            title="Trier par"
          >
            <option value="order">Ordre WBS</option>
            <option value="due_date">Date</option>
            <option value="priority">Priorité</option>
            <option value="progress">Avancement</option>
          </select>
        </div>
      )}

      {/* Task treegrid (hierarchy preserved when no filter; flat when filtered) */}
      {tasks.length > 0 ? (
        filtered.length === 0 ? (
          <div className="text-[11px] text-muted-foreground text-center py-4 border border-dashed border-border/40 rounded">
            Aucune tâche ne correspond aux filtres
          </div>
        ) : (
          <div role="tree" aria-label="Hiérarchie des tâches" className="border border-border/40 rounded-md overflow-hidden max-h-[400px] overflow-y-auto">
            {renderRows()}
          </div>
        )
      ) : (
        <EmptyState icon={ListTodo} title="Aucune tâche" variant="search" size="compact" />
      )}

      {/* Create form or button */}
      {showCreate ? (
        <TaskCreateForm projectId={projectId} onClose={() => setShowCreate(false)} />
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 py-1"
        >
          <Plus size={12} /> Ajouter une tâche
        </button>
      )}
    </FormSection>
  )
}

// -- Templates Section --------------------------------------------------------

function TemplatesSection({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const { data: templates = [], isLoading } = useProjectTemplates()
  const saveAsTemplate = useSaveAsTemplate()
  const cloneFromTemplate = useCloneFromTemplate()
  const deleteTemplate = useDeleteTemplate()
  const { toast } = useToast()
  const [showSave, setShowSave] = useState(false)
  const [showClone, setShowClone] = useState(false)
  const [tplName, setTplName] = useState('')
  const [tplDesc, setTplDesc] = useState('')
  const [selectedTpl, setSelectedTpl] = useState('')
  const [cloneName, setCloneName] = useState('')

  const handleSave = async () => {
    if (!tplName.trim()) return
    try {
      await saveAsTemplate.mutateAsync({ project_id: projectId, name: tplName, description: tplDesc || undefined })
      toast({ title: t('projets.toast.template_saved'), variant: 'success' })
      setShowSave(false); setTplName(''); setTplDesc('')
    } catch { toast({ title: t('projets.toast.template_save_error'), variant: 'error' }) }
  }

  const handleClone = async () => {
    if (!selectedTpl || !cloneName.trim()) return
    try {
      await cloneFromTemplate.mutateAsync({ templateId: selectedTpl, name: cloneName })
      toast({ title: t('projets.toast.project_created_from_template'), variant: 'success' })
      setShowClone(false); setSelectedTpl(''); setCloneName('')
    } catch { toast({ title: t('projets.toast.template_clone_error'), variant: 'error' }) }
  }

  return (
    <FormSection title={t('common.templates')} collapsible defaultExpanded={false} storageKey="project-detail-templates">
      <div className="space-y-3">
        {/* Save current project as template */}
        {!showSave ? (
          <button onClick={() => setShowSave(true)} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80">
            <Copy size={12} /> Sauvegarder comme template
          </button>
        ) : (
          <div className="space-y-2 border rounded p-2 bg-muted/30">
            <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder={t('projets.placeholders.template_name')} className={panelInputClass} />
            <input value={tplDesc} onChange={(e) => setTplDesc(e.target.value)} placeholder={t('projets.placeholders.template_desc_optional')} className={panelInputClass} />
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saveAsTemplate.isPending || !tplName.trim()} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 disabled:opacity-50">
                {saveAsTemplate.isPending ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Sauvegarder
              </button>
              <button onClick={() => setShowSave(false)} className="text-xs text-muted-foreground hover:text-foreground"><X size={10} /></button>
            </div>
          </div>
        )}

        {/* Clone from template */}
        {!showClone ? (
          <button onClick={() => setShowClone(true)} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80">
            <LayoutTemplate size={12} /> Créer depuis un template
          </button>
        ) : (
          <div className="space-y-2 border rounded p-2 bg-muted/30">
            <select value={selectedTpl} onChange={(e) => setSelectedTpl(e.target.value)} className={panelInputClass}>
              <option value="">Choisir un template...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name} {t.category ? `(${t.category})` : ''} — {t.usage_count} utilisation(s)</option>
              ))}
            </select>
            <input value={cloneName} onChange={(e) => setCloneName(e.target.value)} placeholder={t('projets.placeholders.clone_name')} className={panelInputClass} />
            <div className="flex gap-2">
              <button onClick={handleClone} disabled={cloneFromTemplate.isPending || !selectedTpl || !cloneName.trim()} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 disabled:opacity-50">
                {cloneFromTemplate.isPending ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Créer
              </button>
              <button onClick={() => setShowClone(false)} className="text-xs text-muted-foreground hover:text-foreground"><X size={10} /></button>
            </div>
          </div>
        )}

        {/* Existing templates list */}
        {isLoading ? <Loader2 size={12} className="animate-spin text-muted-foreground" /> : templates.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground font-medium">Templates disponibles ({templates.length})</div>
            {templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-xs py-1 px-1 hover:bg-muted/40 rounded group">
                <div className="flex items-center gap-2">
                  <LayoutTemplate size={11} className="text-muted-foreground" />
                  <span className="font-medium">{t.name}</span>
                  {t.category && <span className="text-muted-foreground">({t.category})</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{t.usage_count}x</span>
                  <button
                    onClick={() => deleteTemplate.mutate(t.id)}
                    className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </FormSection>
  )
}

// -- Custom Fields Section ----------------------------------------------------

function CustomFieldsSection({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const { data: fields = [], isLoading } = useCustomFields(projectId)
  const setFieldValue = useSetCustomFieldValue()
  const { toast } = useToast()

  if (isLoading) return <Loader2 size={12} className="animate-spin text-muted-foreground" />
  if (fields.length === 0) return null

  const handleSave = async (fieldDefId: string, value: string) => {
    try {
      await setFieldValue.mutateAsync({ projectId, fieldDefId, payload: { value_text: value } })
    } catch { toast({ title: t('projets.toast.field_save_error'), variant: 'error' }) }
  }

  return (
    <FormSection title="Champs personnalisés" collapsible defaultExpanded storageKey="project-detail-custom-fields">
      <DetailFieldGrid>
        {fields.map((f) => (
          <InlineEditableRow
            key={f.id}
            label={f.label}
            value={f.value_text || f.default_value || ''}
            onSave={(v) => handleSave(f.id, v)}
          />
        ))}
      </DetailFieldGrid>
    </FormSection>
  )
}

// -- Comments Section ---------------------------------------------------------

function CommentsSection({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const { data: comments = [], isLoading } = useProjectComments(projectId)
  const createComment = useCreateProjectComment()
  const deleteComment = useDeleteComment()
  const { toast } = useToast()
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [mentionIds, setMentionIds] = useState<string[]>([])

  // @mention autocomplete
  const [mentionQuery, setMentionQuery] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionIdx, setMentionIdx] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { data: mentionUsers } = useUsers({ search: mentionQuery, page_size: 8, active: true })
  const mentionList = mentionUsers?.items ?? []

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setBody(val)
    // Detect @mention trigger
    const cursor = e.target.selectionStart ?? val.length
    const textBefore = val.slice(0, cursor)
    const match = textBefore.match(/@(\w*)$/)
    if (match) {
      setMentionQuery(match[1])
      setShowMentions(true)
      setMentionIdx(0)
    } else {
      setShowMentions(false)
    }
  }

  const insertMention = (user: { id: string; first_name?: string; last_name?: string; email?: string }) => {
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || 'Utilisateur'
    const cursor = inputRef.current?.selectionStart ?? body.length
    const textBefore = body.slice(0, cursor)
    const textAfter = body.slice(cursor)
    const replaced = textBefore.replace(/@\w*$/, `@${name} `)
    setBody(replaced + textAfter)
    setMentionIds((prev) => [...prev, user.id])
    setShowMentions(false)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions && mentionList.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx((i) => Math.min(i + 1, mentionList.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx((i) => Math.max(i - 1, 0)) }
      else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionList[mentionIdx]) }
      else if (e.key === 'Escape') { setShowMentions(false) }
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }

  const handleSubmit = async () => {
    if (!body.trim()) return
    try {
      await createComment.mutateAsync({
        projectId,
        payload: { body, parent_id: replyTo || undefined, mentions: mentionIds.length > 0 ? mentionIds : undefined },
      })
      setBody(''); setReplyTo(null); setMentionIds([])
    } catch { toast({ title: t('projets.toast.comment_error'), variant: 'error' }) }
  }

  const handleDelete = async (commentId: string) => {
    try {
      await deleteComment.mutateAsync({ projectId, commentId })
    } catch { toast({ title: t('projets.toast.deletion_error'), variant: 'error' }) }
  }

  const rootComments = comments.filter((c) => !c.parent_id && c.active)
  const getReplies = (parentId: string) => comments.filter((c) => c.parent_id === parentId && c.active)

  return (
    <FormSection title={`Commentaires (${rootComments.length})`} collapsible defaultExpanded={false} storageKey="project-detail-comments">
      <div className="space-y-3">
        {isLoading ? <Loader2 size={12} className="animate-spin text-muted-foreground" /> : rootComments.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucun commentaire</p>
        ) : (
          <div className="space-y-2">
            {rootComments.map((c) => (
              <div key={c.id} className="space-y-1">
                <div className="flex items-start gap-2 text-xs">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.author_name || 'Utilisateur'}</span>
                      <span className="text-muted-foreground">{new Date(c.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap">{c.body}</p>
                    <div className="flex gap-2 mt-1">
                      <button onClick={() => setReplyTo(c.id)} className="text-primary hover:text-primary/80 text-[10px]">Répondre</button>
                      <button onClick={() => handleDelete(c.id)} className="text-destructive hover:text-destructive/80 text-[10px]">{t('common.delete')}</button>
                    </div>
                  </div>
                </div>
                {getReplies(c.id).map((r) => (
                  <div key={r.id} className="ml-4 pl-2 border-l flex items-start gap-2 text-xs">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{r.author_name || 'Utilisateur'}</span>
                        <span className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap">{r.body}</p>
                      <button onClick={() => handleDelete(r.id)} className="text-destructive hover:text-destructive/80 text-[10px] mt-1">{t('common.delete')}</button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Comment input with @mention autocomplete */}
        <div className="space-y-1">
          {replyTo && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>Réponse à un commentaire</span>
              <button onClick={() => setReplyTo(null)} className="text-destructive"><X size={10} /></button>
            </div>
          )}
          <div className="relative flex gap-2">
            <textarea
              ref={inputRef}
              value={body}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={t('projets.placeholders.comment_with_mention')}
              rows={2}
              className={cn(panelInputClass, 'flex-1 resize-none')}
            />
            <button onClick={handleSubmit} disabled={createComment.isPending || !body.trim()} className="text-primary hover:text-primary/80 disabled:opacity-50 self-end pb-1">
              {createComment.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            </button>
            {/* @mention dropdown */}
            {showMentions && mentionList.length > 0 && (
              <div className="absolute bottom-full left-0 mb-1 w-64 bg-popover border rounded-md shadow-md z-50 max-h-48 overflow-y-auto">
                {mentionList.map((u, i) => (
                  <button
                    key={u.id}
                    onMouseDown={(e) => { e.preventDefault(); insertMention(u) }}
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-xs hover:bg-muted/60 flex items-center gap-2',
                      i === mentionIdx && 'bg-muted/60',
                    )}
                  >
                    <Users size={10} className="text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{[u.first_name, u.last_name].filter(Boolean).join(' ') || u.email}</span>
                    {u.email && <span className="text-muted-foreground truncate">{u.email}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </FormSection>
  )
}

// -- Activity Feed Section ----------------------------------------------------

// Field labels — converts internal column names to friendly French
// equivalents for the activity feed. Anything not in the map is
// humanised on the fly (snake_case → "Snake case").
const TASK_FIELD_LABELS: Record<string, string> = {
  due_date: 'Date d’échéance',
  start_date: 'Date de début',
  end_date: 'Date de fin',
  progress: 'Progression',
  status: 'Statut',
  priority: 'Priorité',
  estimated_hours: 'Heures estimées',
  actual_hours: 'Heures réelles',
  title: 'Titre',
  description: 'Description',
  assignee_id: 'Assigné',
  parent_id: 'Tâche parente',
  duration_days: 'Durée (jours)',
}

function humaniseField(field: string | undefined): string {
  if (!field) return ''
  if (TASK_FIELD_LABELS[field]) return TASK_FIELD_LABELS[field]
  return field.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
}

function fmtFieldValue(field: string | undefined, v: unknown): string {
  if (v == null || v === '') return '—'
  const s = String(v)
  // Date fields → format as readable date
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    try { return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { /* */ }
  }
  // Progress as percentage
  if (field === 'progress') return `${s}%`
  return s.length > 40 ? s.slice(0, 40) + '…' : s
}

function ActivityFeedSection({
  projectId,
  onNavigateToTask,
}: {
  projectId: string
  onNavigateToTask?: (taskId: string) => void
}) {
  const { data: feed = [], isLoading } = useActivityFeed(projectId)
  const [filter, setFilter] = useState<'all' | 'task_change' | 'comment' | 'status_change'>('all')
  const [search, setSearch] = useState('')

  const iconForType = (type: string) => {
    switch (type) {
      case 'status_change': return <Circle size={11} className="text-blue-500" />
      case 'task_change': return <Settings2 size={11} className="text-amber-500" />
      case 'comment': return <MessageSquare size={11} className="text-green-500" />
      default: return <Activity size={11} className="text-muted-foreground" />
    }
  }

  // Apply filter + search before grouping
  const filtered = useMemo(() => {
    let list = feed.slice()
    if (filter !== 'all') list = list.filter(it => it.type === filter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(it =>
        (it.task_title?.toLowerCase().includes(q)) ||
        (it.body?.toLowerCase().includes(q)) ||
        (it.user?.toLowerCase().includes(q)) ||
        (it.field?.toLowerCase().includes(q)),
      )
    }
    return list
  }, [feed, filter, search])

  // Group entries by day so the timeline reads chronologically (Aujourd'hui / Hier / dd MMM).
  const groups = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
    const dayLabel = (iso: string) => {
      const d = new Date(iso); d.setHours(0, 0, 0, 0)
      if (d.getTime() === today.getTime()) return "Aujourd'hui"
      if (d.getTime() === yesterday.getTime()) return 'Hier'
      return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })
    }
    const map = new Map<string, ActivityFeedItem[]>()
    for (const it of filtered) {
      const k = dayLabel(it.date)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(it)
    }
    return Array.from(map.entries())
  }, [filtered])

  const counts = useMemo(() => ({
    all: feed.length,
    task_change: feed.filter(f => f.type === 'task_change').length,
    comment: feed.filter(f => f.type === 'comment').length,
    status_change: feed.filter(f => f.type === 'status_change').length,
  }), [feed])

  // Resolve the target task id for a row — task_change has it directly,
  // comments only when posted on a task (owner_type === 'project_task').
  const targetTaskId = (item: ActivityFeedItem): string | null => {
    if (item.type === 'task_change' && item.task_id) return item.task_id
    if (item.type === 'comment' && item.owner_type === 'project_task' && item.owner_id) return item.owner_id
    return null
  }

  const renderItem = (item: ActivityFeedItem) => {
    const taskId = targetTaskId(item)
    const clickable = !!taskId && !!onNavigateToTask
    const time = new Date(item.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

    // One-line layout: [icon] [actor] · [task title] · [field old → new]      [time]
    // Each row collapses everything onto a single horizontal line; the
    // narrative still reads naturally because we keep the same "actor /
    // subject / change" order, just separated by middots instead of
    // breaks.
    return (
      <button
        type="button"
        onClick={clickable ? () => onNavigateToTask!(taskId!) : undefined}
        disabled={!clickable}
        className={cn(
          'group flex items-center gap-2 w-full text-left rounded-md px-2 py-1 text-[11px] transition-colors',
          clickable
            ? 'hover:bg-muted/60 hover:ring-1 hover:ring-primary/30 cursor-pointer'
            : 'cursor-default',
        )}
        title={clickable ? 'Aller à la tâche' : undefined}
      >
        <span className="shrink-0">{iconForType(item.type)}</span>

        {/* Actor */}
        <span className="font-medium text-foreground shrink-0 truncate max-w-[140px]">
          {item.user || 'Système'}
        </span>

        {/* Subject (task title for task_change/comment, "Statut projet" for status_change) */}
        {item.type === 'task_change' && item.task_title && (
          <>
            <span className="text-muted-foreground/50 shrink-0">·</span>
            <span className="text-foreground/90 truncate">{item.task_title}</span>
          </>
        )}
        {item.type === 'status_change' && (
          <>
            <span className="text-muted-foreground/50 shrink-0">·</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 shrink-0">Statut projet</span>
            <span className="text-foreground/90 truncate">{item.detail}</span>
            {item.reason && <span className="text-muted-foreground italic truncate">— {item.reason}</span>}
          </>
        )}
        {item.type === 'comment' && (
          <>
            <span className="text-muted-foreground/50 shrink-0">·</span>
            <span className="text-foreground/90 italic truncate">«&nbsp;{(item.body || '').slice(0, 100)}{(item.body?.length ?? 0) > 100 ? '…' : ''}&nbsp;»</span>
          </>
        )}

        {/* Change detail (only for task_change) */}
        {item.type === 'task_change' && (
          <>
            <span className="text-muted-foreground/50 shrink-0">·</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 shrink-0">{humaniseField(item.field)}</span>
            <span className="px-1 rounded bg-red-500/10 text-red-700 dark:text-red-300 text-[10px] line-through shrink-0 max-w-[100px] truncate">{fmtFieldValue(item.field, item.old)}</span>
            <span className="text-muted-foreground/60 shrink-0">→</span>
            <span className="px-1 rounded bg-green-500/10 text-green-700 dark:text-green-300 text-[10px] font-medium shrink-0 max-w-[100px] truncate">{fmtFieldValue(item.field, item.new)}</span>
          </>
        )}

        {item.type === 'comment' && item.owner_type === 'project_task' && clickable && (
          <span className="text-[10px] text-primary shrink-0">↗</span>
        )}

        {/* Spacer pushes time to the right */}
        <span className="flex-1" />

        {clickable && (
          <ChevronRight size={10} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        )}
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{time}</span>
      </button>
    )
  }

  return (
    <FormSection
      title={`Activité (${feed.length})`}
      collapsible
      defaultExpanded={false}
      storageKey="project-detail-activity"
    >
      {isLoading ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-2">
          <Loader2 size={12} className="animate-spin" /> Chargement…
        </div>
      ) : feed.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Aucune activité enregistrée</p>
      ) : (
        <div className="space-y-2">
          {/* Filter pills + search */}
          <div className="flex flex-wrap items-center gap-1.5">
            {([
              ['all', 'Tout', counts.all],
              ['task_change', 'Tâches', counts.task_change],
              ['comment', 'Commentaires', counts.comment],
              ['status_change', 'Statut', counts.status_change],
            ] as const).map(([key, label, n]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border transition-colors',
                  filter === key
                    ? 'bg-primary/10 border-primary/40 text-primary font-medium'
                    : 'border-border text-muted-foreground hover:bg-muted/50',
                )}
              >
                {label}
                <span className="tabular-nums opacity-70">{n}</span>
              </button>
            ))}
            {feed.length > 6 && (
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className={cn(panelInputClass, 'h-6 text-[10px] flex-1 min-w-[120px] ml-auto')}
              />
            )}
          </div>

          {/* Grouped timeline */}
          <div className="max-h-96 overflow-y-auto pr-1 space-y-3">
            {groups.length === 0 && (
              <p className="text-[11px] text-muted-foreground italic text-center py-2">Aucun résultat</p>
            )}
            {groups.map(([day, items]) => (
              <div key={day} className="space-y-0.5">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-semibold sticky top-0 bg-card/95 backdrop-blur py-1 z-10">
                  {day} · <span className="opacity-60">{items.length}</span>
                </div>
                <div className="space-y-0.5">
                  {items.map((item, i) => (
                    <div key={i}>{renderItem(item)}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </FormSection>
  )
}

// -- Project Color Picker (preset palette + reset) ---------------------------

const PROJECT_COLOR_PRESETS = [
  { value: '#1e40af', label: 'Bleu' },
  { value: '#0891b2', label: 'Cyan' },
  { value: '#047857', label: 'Vert' },
  { value: '#65a30d', label: 'Lime' },
  { value: '#b45309', label: 'Ambre' },
  { value: '#dc2626', label: 'Rouge' },
  { value: '#c026d3', label: 'Magenta' },
  { value: '#7c3aed', label: 'Violet' },
  { value: '#374151', label: 'Gris' },
  { value: '#0f172a', label: 'Slate' },
]

function ProjectColorPicker({
  value,
  onChange,
  onCancel,
}: {
  value: string | null
  onChange: (color: string | null) => void
  onCancel: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          'h-7 px-2 text-[10px] rounded border border-dashed border-border hover:border-foreground/40 hover:bg-muted',
          !value && 'border-primary/40 bg-primary/5 text-primary',
        )}
        title="Couleur automatique (déduite du code projet)"
      >
        Auto
      </button>
      {PROJECT_COLOR_PRESETS.map((c) => (
        <button
          key={c.value}
          type="button"
          onClick={() => onChange(c.value)}
          className={cn(
            'w-6 h-6 rounded border-2 transition-transform hover:scale-110',
            value === c.value ? 'border-foreground' : 'border-white/20',
          )}
          style={{ backgroundColor: c.value }}
          title={c.label}
        />
      ))}
      <input
        type="color"
        value={value || '#3b82f6'}
        onChange={(e) => onChange(e.target.value)}
        className="w-6 h-6 rounded border border-border cursor-pointer p-0"
        title="Couleur personnalisée"
      />
      <button
        type="button"
        onClick={onCancel}
        className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted"
        title="Fermer"
      >
        <X size={12} />
      </button>
    </div>
  )
}

// -- Project Description Editor (rich text wrapper with save-on-blur) --------
//
// Wraps RichTextField with local-draft semantics: keeps a local copy of the
// HTML and only flushes back to the server when the editor loses focus, AND
// only if the value actually changed. This avoids a server round-trip on
// every keystroke (which the controlled RichTextField would otherwise
// trigger via onChange).

function ProjectDescriptionEditor({
  initialValue,
  onSave,
  projectId,
}: {
  initialValue: string
  onSave: (html: string) => void
  projectId: string
}) {
  const [draft, setDraft] = useState(initialValue)
  const containerRef = useRef<HTMLDivElement>(null)

  const flush = useCallback(() => {
    const next = draft.trim()
    const prev = (initialValue || '').trim()
    // Treat an "empty" editor state (e.g. <p></p>) as empty so we don't
    // store dummy markup.
    const stripped = next.replace(/<p[^>]*>\s*<\/p>/g, '').trim()
    const prevStripped = prev.replace(/<p[^>]*>\s*<\/p>/g, '').trim()
    if (stripped !== prevStripped) onSave(stripped)
  }, [draft, initialValue, onSave])

  // Save when the user focuses out of the entire editor (any toolbar /
  // menu click is still considered "inside"), not on every keystroke.
  return (
    <div
      ref={containerRef}
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node | null)) {
          flush()
        }
      }}
    >
      <RichTextField
        value={draft}
        onChange={setDraft}
        placeholder="Description du projet…"
        rows={6}
        imageOwnerType="project"
        imageOwnerId={projectId}
      />
    </div>
  )
}

// -- Project Detail Panel -----------------------------------------------------

export function ProjectDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { data: project, isLoading } = useProject(id)
  const updateProject = useUpdateProject()
  const archiveProject = useArchiveProject()
  const { data: tasks } = useProjectTasks(id)
  const { data: members } = useProjectMembers(id)
  const { data: milestones } = useProjectMilestones(id)
  const { data: allUsersData } = useUsers({ page_size: 100, active: true })
  const goutiSyncOne = useGoutiSyncOne()
  const [showPlannerLink, setShowPlannerLink] = useState(false)
  const [detailTab, setDetailTab] = useState<'fiche' | 'taches' | 'planification' | 'activite' | 'documents'>('fiche')
  const exportPdf = useExportProjectPdf()
  const { data: goutiStatus } = useGoutiStatus()
  const { toast } = useToast()
  const capabilities = goutiStatus?.capabilities ?? null
  const projectStatusLabels = useDictionaryLabels('project_status', PROJECT_STATUS_LABELS_FALLBACK)
  const projectPriorityLabels = useDictionaryLabels('project_priority', PROJECT_PRIORITY_LABELS_FALLBACK)
  const projectWeatherLabels = useDictionaryLabels('project_weather', PROJECT_WEATHER_LABELS_FALLBACK)
  const projectStatusOptions = useMemo(() => buildDictionaryOptions(projectStatusLabels, PROJECT_STATUS_VALUES), [projectStatusLabels])
  const projectPriorityOptions = useMemo(() => buildDictionaryOptions(projectPriorityLabels, PROJECT_PRIORITY_VALUES), [projectPriorityLabels])
  const projectWeatherOptions = useMemo(() => buildDictionaryOptions(projectWeatherLabels, PROJECT_WEATHER_VALUES), [projectWeatherLabels])
  // Used to label the "no override" option of the progress weight method
  // picker as "Standard (CODE_ENTITE)".
  const currentEntity = useCurrentEntity()
  const standardLabel = currentEntity?.code ? `Standard (${currentEntity.code})` : 'Standard'

  const handleSave = useCallback((field: string, value: string | number | null) => {
    updateProject.mutate({ id, payload: normalizeNames({ [field]: value }) }, {
      onError: () => toast({ title: t('common.error'), variant: 'error' }),
    })
  }, [id, updateProject, toast, t])

  const handleArchive = useCallback(async () => {
    await archiveProject.mutateAsync(id)
    closeDynamicPanel()
    toast({ title: t('projets.toast.project_archived'), variant: 'success' })
  }, [id, archiveProject, closeDynamicPanel, toast])

  const handleResyncGouti = useCallback(async () => {
    if (!project) return
    const gid = goutiProjectId(project)
    if (!gid) return
    try {
      const res = await goutiSyncOne.mutateAsync(gid)
      toast({
        title: t('projets.toast.project_resynchronized'),
        description: `${res.action === 'created' ? 'Créé' : 'Mis à jour'} depuis Gouti — ${res.reports_synced} rapport(s)`,
        variant: 'success',
      })
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } }; message?: string })
        ?.response?.data?.detail ?? (err as Error)?.message ?? t('projets.toast.error')
      toast({ title: t('projets.toast.resync_failed'), description: String(msg).slice(0, 200), variant: 'error' })
    }
  }, [project, goutiSyncOne, toast])

  if (isLoading || !project) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<FolderKanban size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  const isGouti = isGoutiProject(project)
  const projectCurrency = project.currency || 'XAF'
  const toDateInputValue = (value: string | null | undefined) => value ? value.slice(0, 10) : ''
  const toDateDisplayValue = (value: string | null | undefined) => {
    if (!value) return ''
    try {
      return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    } catch {
      return value.slice(0, 10)
    }
  }

  return (
    <DynamicPanelShell
      title={project.code}
      subtitle={project.name}
      icon={<FolderKanban size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton
            onClick={() => setShowPlannerLink(true)}
            icon={<Send size={12} />}
          >
            Planner
          </PanelActionButton>
          {isGouti && (
            <PanelActionButton
              onClick={handleResyncGouti}
              disabled={goutiSyncOne.isPending}
              icon={goutiSyncOne.isPending
                ? <Loader2 size={12} className="animate-spin" />
                : <RefreshCw size={12} />}
            >
              Resync Gouti
            </PanelActionButton>
          )}
          <PanelActionButton
            onClick={() => exportPdf.mutate(id)}
            disabled={exportPdf.isPending}
            icon={exportPdf.isPending ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
          >
            PDF
          </PanelActionButton>
          <DangerConfirmButton icon={<Trash2 size={12} />} onConfirm={handleArchive} confirmLabel="Archiver ?">
            Archiver
          </DangerConfirmButton>
        </>
      }
    >
      <TabBar
        items={[
          { id: 'fiche', label: 'Fiche', icon: Info },
          { id: 'taches', label: `Tâches (${tasks?.length ?? 0})`, icon: ListTodo },
          { id: 'planification', label: 'Planification', icon: BarChart3 },
          { id: 'activite', label: 'Activité', icon: LayoutList },
          { id: 'documents', label: 'Documents', icon: Paperclip },
        ]}
        activeId={detailTab}
        onTabChange={(id) => setDetailTab(id as typeof detailTab)}
      />
      <PanelContentLayout>
        <TagManager ownerType="project" ownerId={project.id} compact />

        {isGouti && <GoutiProjectBanner />}

        {/* KPI strip — always visible at the top regardless of tab. Same
            stats as before (météo, %, tâches, personnes, jalons) but
            more prominent: colored values, bigger icons, card-style row. */}
        <div className="flex flex-wrap items-stretch gap-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/40 bg-card/40">
            <WeatherIcon weather={project.weather} size={18} />
            <div className="flex flex-col leading-tight">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/80 font-medium">Météo</span>
              <span className="text-sm font-display font-semibold text-foreground">
                {projectWeatherLabels[project.weather] ?? project.weather}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/30 bg-primary/5">
            <Target size={16} className="text-primary" />
            <div className="flex flex-col leading-tight">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/80 font-medium">Avancement</span>
              <span className="text-sm font-display font-semibold text-primary tabular-nums">{project.progress}%</span>
            </div>
          </div>
          {/* Tendance — qualitative indicator (up/flat/down) set manually */}
          {(() => {
            const trend = project.trend ?? 'flat'
            const arrow = trend === 'up' ? '↗' : trend === 'down' ? '↘' : '→'
            const cls = trend === 'up'
              ? 'border-green-500/30 bg-green-500/5 text-green-600'
              : trend === 'down'
              ? 'border-red-500/30 bg-red-500/5 text-red-600'
              : 'border-border/40 bg-card/40 text-muted-foreground'
            const label = trend === 'up' ? 'En amélioration' : trend === 'down' ? 'En dégradation' : 'Stable'
            return (
              <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border', cls)}>
                <span className="text-xl leading-none font-bold">{arrow}</span>
                <div className="flex flex-col leading-tight">
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground/80 font-medium">Tendance</span>
                  <span className="text-sm font-display font-semibold">{label}</span>
                </div>
              </div>
            )
          })()}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/40 bg-card/40">
            <ListTodo size={16} className="text-muted-foreground" />
            <div className="flex flex-col leading-tight">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/80 font-medium">Tâches</span>
              <span className="text-sm font-display font-semibold text-foreground tabular-nums">{tasks?.length ?? 0}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/40 bg-card/40">
            <Users size={16} className="text-muted-foreground" />
            <div className="flex flex-col leading-tight">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/80 font-medium">Personnes</span>
              <span className="text-sm font-display font-semibold text-foreground tabular-nums">{members?.length ?? 0}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/40 bg-card/40">
            <Milestone size={16} className="text-muted-foreground" />
            <div className="flex flex-col leading-tight">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/80 font-medium">Jalons</span>
              <span className="text-sm font-display font-semibold text-foreground tabular-nums">{milestones?.length ?? 0}</span>
            </div>
          </div>
        </div>

        {detailTab === 'fiche' && <>
        {/* Description — shown above the Fiche section so the project's
            purpose/summary is the first thing the reader sees. */}
        {(project.description || isProjectFieldEditable(project, 'description', capabilities)) && (
          <FormSection title={t('common.description')} collapsible defaultExpanded storageKey="project-detail-desc">
            {/* Rich text editor (TipTap) — supports headings, bold, italic,
                lists, blockquote, link, image (uploaded as Attachment on
                project), tables, slash commands. Stored as sanitized HTML. */}
            {isProjectFieldEditable(project, 'description', capabilities) ? (
              <ProjectDescriptionEditor
                key={project.id}
                initialValue={project.description || ''}
                onSave={(html) => handleSave('description', html || null)}
                projectId={project.id}
              />
            ) : (
              <RichTextDisplay value={project.description || ''} />
            )}
          </FormSection>
        )}

        <SectionColumns>
          <div className="@container space-y-5">
            <FormSection title="Fiche projet" collapsible defaultExpanded storageKey="project-detail-fiche">
              <DetailFieldGrid>
                {isProjectFieldEditable(project, 'name', capabilities)
                  ? <InlineEditableRow label="Nom" value={project.name} onSave={(v) => handleSave('name', v)} />
                  : <ReadOnlyRow label={t('common.name_field')} value={<span className="text-sm text-foreground">{project.name}</span>} />}
                <ReadOnlyRow label={t('common.code_field')} value={<span className="text-sm font-mono font-medium text-foreground">{project.code || '—'}</span>} />
                {isProjectFieldEditable(project, 'status', capabilities)
                  ? <InlineEditableTags label="Statut" value={project.status} options={projectStatusOptions} onSave={(v) => handleSave('status', v)} />
                  : <ReadOnlyRow label={t('common.status')} value={<span className="text-sm">{projectStatusLabels[project.status] || project.status}</span>} />}
                {isProjectFieldEditable(project, 'priority', capabilities)
                  ? <InlineEditableTags label="Priorité" value={project.priority} options={projectPriorityOptions} onSave={(v) => handleSave('priority', v)} />
                  : <ReadOnlyRow label={t('common.priority_field')} value={<span className="text-sm">{projectPriorityLabels[project.priority] || project.priority}</span>} />}
                <InlineEditableTags label="Météo" value={project.weather} options={projectWeatherOptions} onSave={(v) => handleSave('weather', v)} />
                <InlineEditableTags
                  label="Tendance"
                  value={project.trend ?? 'flat'}
                  options={[
                    { value: 'up', label: '↗ En amélioration' },
                    { value: 'flat', label: '→ Stable' },
                    { value: 'down', label: '↘ En dégradation' },
                  ]}
                  onSave={(v) => handleSave('trend', v)}
                />
                <InlinePickerField
                  label="Couleur"
                  displayValue={project.color ? `${project.color}` : '— Auto'}
                  renderPicker={(onDone) => (
                    <ProjectColorPicker
                      value={project.color}
                      onChange={(c) => { handleSave('color', c); onDone() }}
                      onCancel={onDone}
                    />
                  )}
                />
              </DetailFieldGrid>
              <DetailFieldGrid>
                <InlinePickerField
                  label="Chef de projet"
                  displayValue={project.manager_name || '--'}
                  renderPicker={(onDone) => (
                    <select
                      autoFocus
                      value={project.manager_id || ''}
                      onChange={(e) => { handleSave('manager_id', e.target.value || null); onDone() }}
                      onBlur={onDone}
                      className={`${panelInputClass} w-full text-xs`}
                    >
                      <option value="">-- Aucun --</option>
                      {(allUsersData?.items ?? []).map(u => (
                        <option key={u.id} value={u.id}>
                          {`${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email}
                        </option>
                      ))}
                    </select>
                  )}
                />
                <ReadOnlyRow label="Entreprise" value={
                  project.tier_id ? (
                    <CrossModuleLink module="tiers" id={project.tier_id} label={project.tier_name || project.tier_id} mode="navigate" />
                  ) : (project.tier_name || '--')
                } />
                <InlineEditableRow label="Budget" value={project.budget != null ? String(project.budget) : ''} onSave={(v) => handleSave('budget', v ? Number(v) : null)} type="number" suffix={projectCurrency} />
                <InlinePickerField
                  label="Site / Installation"
                  displayValue={project.asset_name || '--'}
                  renderPicker={(onDone) => (
                    <AssetPicker
                      value={project.asset_id || null}
                      onChange={(id) => {
                        updateProject.mutate(
                          { id: project.id, payload: { asset_id: id || null } },
                          { onError: () => toast({ title: t('common.error'), variant: 'error' }) },
                        )
                        onDone()
                      }}
                      placeholder={t('projets.placeholders.select_site')}
                      clearable
                    />
                  )}
                />
              </DetailFieldGrid>
            </FormSection>

            <FormSection title={t('common.planning')} collapsible defaultExpanded storageKey="project-detail-planning">
              <DetailFieldGrid>
                <InlineEditableRow label="Début" value={toDateInputValue(project.start_date)} displayValue={toDateDisplayValue(project.start_date)} onSave={(v) => handleSave('start_date', v || null)} type="date" />
                <InlineEditableRow label="Fin prévue" value={toDateInputValue(project.end_date)} displayValue={toDateDisplayValue(project.end_date)} onSave={(v) => handleSave('end_date', v || null)} type="date" />
                <InlineEditableRow label="Fin réelle" value={toDateInputValue(project.actual_end_date)} displayValue={toDateDisplayValue(project.actual_end_date)} onSave={(v) => handleSave('actual_end_date', v || null)} type="date" />
              </DetailFieldGrid>
            </FormSection>

            {/* Calcul d'avancement — pondération du % d'avancement à partir des tâches */}
            <FormSection
              title={`Calcul d'avancement (${project.progress}%)`}
              collapsible
              defaultExpanded={false}
              storageKey="project-detail-progress-method"
              headerExtra={
                <span
                  className="text-[10px] text-muted-foreground/70 hidden sm:inline"
                  title="La modification recalcule immédiatement l'avancement."
                >
                  Pondération du %
                </span>
              }
            >
              <div className="flex flex-col gap-1 py-1.5 sm:flex-row sm:items-start sm:gap-3">
                <span
                  className="text-[10px] text-muted-foreground shrink-0 font-semibold uppercase tracking-wider sm:text-xs sm:font-medium sm:tracking-wide sm:pt-1"
                  style={{ width: 'var(--opsflux-label-w, 8rem)' } as React.CSSProperties}
                >
                  Méthode
                </span>
                <div className="flex-1 min-w-0 space-y-2">
                  {isProjectFieldEditable(project, 'progress_weight_method', capabilities) ? (
                    <TagSelector
                      value={project.progress_weight_method || ''}
                      onChange={(v) => handleSave('progress_weight_method', v || null)}
                      options={[
                        { value: '', label: 'Hériter' },
                        ...PROGRESS_WEIGHT_METHOD_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
                      ]}
                    />
                  ) : (
                    <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium bg-muted text-muted-foreground">
                      {project.progress_weight_method
                        ? PROGRESS_WEIGHT_METHOD_OPTIONS.find((o) => o.value === project.progress_weight_method)?.label
                        : 'Hériter'}
                    </span>
                  )}
                  <p className="text-[11px] text-muted-foreground/80 italic">
                    {project.progress_weight_method
                      ? PROGRESS_WEIGHT_METHOD_OPTIONS.find((o) => o.value === project.progress_weight_method)?.description
                      : <>Hérite de <strong>Paramètres → Projets</strong> (mode {standardLabel}).</>}
                  </p>
                </div>
              </div>
            </FormSection>

            {/* Sub-projects — macro-projet hierarchy */}
            {(project.children_count ?? 0) > 0 && (
              <FormSection title={`Sous-projets (${project.children_count})`} collapsible defaultExpanded storageKey="project-detail-children">
                <SubProjectsSection projectId={id} />
              </FormSection>
            )}

            {/* Parent project link */}
            {project.parent_id && project.parent_name && (
              <FormSection title="Macro-projet" collapsible defaultExpanded storageKey="project-detail-parent">
                <div
                  className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/40 px-2 py-1.5 rounded"
                  onClick={() => openDynamicPanel({ type: 'detail', module: 'projets', id: project.parent_id! })}
                >
                  <Layers size={12} className="text-primary" />
                  <span className="font-medium">{project.parent_name}</span>
                  <ChevronRight size={12} className="text-muted-foreground ml-auto" />
                </div>
              </FormSection>
            )}

            {/* Equipe / Members — like Gouti "Gestion > Les collaborateurs" */}
            <FormSection title={`Équipe (${members?.length ?? 0})`} collapsible defaultExpanded storageKey="project-detail-equipe">
              {members && members.length > 0 ? (
                <div>
                  {members.map((m) => <MemberRow key={m.id} member={m} projectId={id} />)}
                </div>
              ) : (
                <EmptyState icon={Users} title="Aucun membre" variant="search" size="compact" />
              )}
              <MemberQuickAdd projectId={id} />
            </FormSection>

            {/* Pointage / Time tracking (workflow draft → submitted → validated) */}
            <TimeTrackingSection projectId={id} members={members ?? []} />

            {/* Matrice d'affectation tâches × membres (planifié vs réalisé) */}
            <AllocationMatrixSection projectId={id} />

            {/* Pertes par catégorie (intempéries, matériau, etc.) */}
            <LossesSection projectId={id} />

            {/* Rapport projet (synthèse façon MS Project) */}
            <ProjectReportSection projectId={id} />
          </div>
        </SectionColumns>
        </>}

        {detailTab === 'taches' && <>
          {/* Tasks — inspired by Gouti "Progression et contrôle > Liste des tâches" */}
          <TaskSection projectId={id} tasks={tasks ?? []} />

          {/* Milestones — like Gouti "Cadrage > Jalons" */}
          <FormSection title={`Jalons (${milestones?.length ?? 0})`} collapsible defaultExpanded storageKey="project-detail-jalons">
            {milestones && milestones.length > 0 ? (
              <div>
                {milestones.map((ms) => (
                  <MilestoneRow key={ms.id} ms={ms} projectId={id} />
                ))}
              </div>
            ) : (
              <EmptyState icon={Milestone} title="Aucun jalon" variant="search" size="compact" />
            )}
            <MilestoneQuickAdd projectId={id} />
          </FormSection>
        </>}

        {detailTab === 'planification' && <>
          {/* WBS — Work Breakdown Structure */}
          <WbsSection projectId={id} />

          {/* CPM — Critical Path Method analysis */}
          <CpmSection projectId={id} />

          {/* Planning Revisions — baselines + what-if simulations */}
          <PlanningRevisionsSection projectId={id} />
        </>}

        {detailTab === 'activite' && <>
          {/* Custom Fields (EAV) */}
          <CustomFieldsSection projectId={id} />

          {/* Templates */}
          <TemplatesSection projectId={id} />

          {/* Comments */}
          <CommentsSection projectId={id} />

          {/* Activity Feed */}
          <ActivityFeedSection
            projectId={id}
            onNavigateToTask={(taskId) => {
              // Switch to the Tâches tab, then dispatch a focus event
              // on the next frame so the TaskRow listeners are mounted
              // by the time the event is fired.
              setDetailTab('taches')
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  window.dispatchEvent(new CustomEvent('opsflux:focus-task', { detail: { taskId } }))
                })
              })
            }}
          />
        </>}

        {detailTab === 'documents' && (
          <FormSection title={t('common.notes_documents')} collapsible defaultExpanded storageKey="project-detail-docs">
            <DetailFieldGrid>
              <div>
                <NoteManager ownerType="project" ownerId={project.id} compact />
              </div>
              <div>
                <AttachmentManager ownerType="project" ownerId={project.id} compact />
              </div>
            </DetailFieldGrid>
          </FormSection>
        )}
      </PanelContentLayout>
      <PlannerLinkModal
        open={showPlannerLink}
        onClose={() => setShowPlannerLink(false)}
        projectId={project.id}
        projectCode={project.code}
        assetId={project.asset_id}
      />
    </DynamicPanelShell>
  )
}
