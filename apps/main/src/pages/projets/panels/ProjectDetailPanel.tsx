/**
 * Project Detail panel + all sections (tasks, milestones, members, WBS,
 * CPM, revisions, templates, custom fields, comments, activity, etc.).
 *
 * Extracted from ProjetsPage.tsx — pure restructure, no behavior changes.
 */
import { useState, useMemo, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FolderKanban, Plus, Loader2, Trash2, Users, Target, X, Check,
  Milestone, ListTodo, UserPlus,
  Circle, CheckCircle2,
  ChevronRight, Layers, RefreshCw,
  Link2, Package, CheckSquare, History, ArrowRight,
  Camera, Play, FlaskConical, Star,
  Zap, GitBranch, Settings2,
  FileDown, Copy, MessageSquare, Activity, Send, LayoutTemplate,
} from 'lucide-react'
import { TabBar } from '@/components/ui/Tabs'
import { Info, Paperclip, LayoutList, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { normalizeNames } from '@/lib/normalize'
import { useDebounce } from '@/hooks/useDebounce'
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
  useSubProjects,
  useGoutiStatus, useGoutiSyncOne,
  useTaskDependencies, useCreateTaskDependency, useDeleteTaskDependency,
  useTaskDeliverables, useCreateDeliverable, useUpdateDeliverable, useDeleteDeliverable,
  useTaskActions, useCreateAction, useUpdateAction, useDeleteAction,
  useTaskChangelog,
  usePlanningRevisions, useCreateRevision, useApplyRevision, useDeleteRevision,
  useWbsNodes, useCreateWbsNode, useDeleteWbsNode,
  useProjectCpm,
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
import type {
  ProjectTask,
  ProjectMilestone as ProjectMilestoneType,
  ProjectMember as ProjectMemberType,
  TaskDependency, DependencyType,
  TaskDeliverable, TaskAction, TaskChangeLog,
  PlanningRevision,
  ProjectWBSNode,
  CPMTaskInfo,
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
  const hasChildren = allTasks.some(t => t.parent_id === task.id)

  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={hasChildren ? expanded : undefined}
      className="border-b border-border/60 last:border-0"
    >
      {/* Summary row */}
      <div
        className="group flex items-center gap-2 py-2 text-xs hover:bg-muted/40 transition-colors cursor-pointer"
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
        <span className={cn('flex-1 truncate font-medium', task.status === 'done' && 'line-through text-muted-foreground')}>{task.title}</span>
        {(task.priority === 'high' || task.priority === 'critical') && (
          <span className={cn('text-[9px] px-1 rounded', task.priority === 'critical' ? 'bg-red-500/10 text-red-500' : 'bg-orange-500/10 text-orange-500')}>
            {priorityOpt?.label}
          </span>
        )}
        {task.due_date && (
          <span className="text-muted-foreground text-[10px] tabular-nums">{new Date(task.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
        )}
        {task.progress > 0 && <span className="text-[10px] text-muted-foreground tabular-nums">{task.progress}%</span>}
        {task.assignee_name && <span className="text-muted-foreground text-[10px] max-w-[70px] truncate">{task.assignee_name}</span>}
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
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [role, setRole] = useState('member')
  const [showDropdown, setShowDropdown] = useState(false)
  const debouncedSearch = useDebounce(search, 300)
  const { data: usersData } = useUsers({ search: debouncedSearch || undefined, page_size: 10, active: true })
  const addMember = useAddProjectMember()
  const memberRoleLabels = useDictionaryLabels('project_member_role', PROJECT_MEMBER_ROLE_LABELS_FALLBACK)
  const memberRoleOptions = useMemo(() => buildDictionaryOptions(memberRoleLabels, PROJECT_MEMBER_ROLE_VALUES), [memberRoleLabels])
  const dropdownRef = useRef<HTMLDivElement>(null)

  const users = usersData?.items ?? []

  const handleSelect = (userId: string, displayName: string) => {
    setSelectedUserId(userId)
    setSearch(displayName)
    setShowDropdown(false)
  }

  const handleSubmit = async () => {
    if (!selectedUserId) return
    await addMember.mutateAsync({ projectId, payload: { user_id: selectedUserId, role } })
    setSelectedUserId('')
    setSearch('')
    setRole('member')
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 py-1"
      >
        <UserPlus size={12} /> Ajouter un membre
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative flex-1" ref={dropdownRef}>
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelectedUserId(''); setShowDropdown(true) }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setOpen(false); setSearch(''); setSelectedUserId('') }
          }}
          className={`${panelInputClass} w-full text-xs`}
          placeholder={t('projets.placeholders.search_user')}
          autoFocus
        />
        {showDropdown && search.length > 0 && users.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-md max-h-[200px] overflow-y-auto">
            {users.map(u => (
              <button
                key={u.id}
                type="button"
                className="gl-button gl-button-sm gl-button-default w-full text-left flex flex-col"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(u.id, `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email)}
              >
                <span className="font-medium text-foreground">{u.first_name ?? ''} {u.last_name ?? ''}</span>
                <span className="text-muted-foreground">{u.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <select value={role} onChange={(e) => setRole(e.target.value)} className={`${panelInputClass} w-[100px] text-xs`}>
        {memberRoleOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      <button onClick={handleSubmit} disabled={addMember.isPending || !selectedUserId} className="gl-button gl-button-confirm text-primary">
        {addMember.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
      </button>
      <button onClick={() => { setOpen(false); setSearch(''); setSelectedUserId('') }} className="p-1 rounded hover:bg-muted text-muted-foreground">
        <X size={12} />
      </button>
    </div>
  )
}

// -- Task Section (list + create) — like Gouti "Progression et controle" -----

function TaskSection({ projectId, tasks }: { projectId: string; tasks: ProjectTask[] }) {
  const [showCreate, setShowCreate] = useState(false)

  const todoCount = tasks.filter(t => t.status === 'todo').length
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length
  const reviewCount = tasks.filter(t => t.status === 'review').length
  const doneCount = tasks.filter(t => t.status === 'done').length

  // Build a tree from parent_id so the list preserves Gouti-style hierarchy
  // (and any OpsFlux-native task tree built via the "sub-task" field).
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
      // Recurse into subtasks
      nodes.push(...walk(t.id, depth + 1))
    }
    return nodes
  }
  const rootNodes = walk(null, 0)
  // Orphan safety: tasks whose parent_id doesn't exist in the flat set
  const knownIds = new Set(tasks.map(t => t.id))
  const orphanNodes = tasks
    .filter(t => t.parent_id && !knownIds.has(t.parent_id))
    .map(t => (
      <TaskRow key={t.id} task={t} projectId={projectId} allTasks={tasks} depth={0} />
    ))

  return (
    <FormSection
      title={`Tâches (${tasks.length})`}
      collapsible
      defaultExpanded
      storageKey="project-detail-tasks"
    >
      {/* Kanban counters — like Gouti kanban columns header */}
      <div className="flex items-center gap-2 text-[10px] mb-2 flex-wrap">
        <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{todoCount} a faire</span>
        <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">{inProgressCount} en cours</span>
        {reviewCount > 0 && <span className="px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-600">{reviewCount} revue</span>}
        <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-600">{doneCount} terminées</span>
      </div>

      {/* Task treegrid (hierarchy preserved via parent_id) */}
      {tasks.length > 0 ? (
        <div role="tree" aria-label="Hiérarchie des tâches" className="border border-border rounded-md overflow-hidden max-h-[400px] overflow-y-auto">
          {rootNodes}
          {orphanNodes}
        </div>
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
    <FormSection title="Templates" collapsible defaultExpanded={false} storageKey="project-detail-templates">
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

function ActivityFeedSection({ projectId }: { projectId: string }) {
  const { data: feed = [], isLoading } = useActivityFeed(projectId)

  const iconForType = (type: string) => {
    switch (type) {
      case 'status_change': return <Circle size={10} className="text-blue-500" />
      case 'task_change': return <Settings2 size={10} className="text-amber-500" />
      case 'comment': return <MessageSquare size={10} className="text-green-500" />
      default: return <Activity size={10} className="text-muted-foreground" />
    }
  }

  const fmtVal = (v: unknown): string => {
    if (v == null) return ''
    const s = String(v)
    // Detect ISO date strings and format as readable date
    if (/^\d{4}-\d{2}-\d{2}[ T]/.test(s)) {
      try { return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { /* */ }
    }
    return s.length > 40 ? s.slice(0, 40) + '...' : s
  }

  const labelForItem = (item: ActivityFeedItem) => {
    switch (item.type) {
      case 'status_change': return item.detail || 'Changement de statut'
      case 'task_change': return `${item.task_title || 'Tâche'}: ${item.field} ${item.old ? `${fmtVal(item.old)} →` : '→'} ${fmtVal(item.new)}`
      case 'comment': return `${item.user || 'Utilisateur'}: ${(item.body || '').slice(0, 80)}${(item.body?.length ?? 0) > 80 ? '...' : ''}`
      default: return 'Activité'
    }
  }

  return (
    <FormSection title={`Activité (${feed.length})`} collapsible defaultExpanded={false} storageKey="project-detail-activity">
      {isLoading ? <Loader2 size={12} className="animate-spin text-muted-foreground" /> : feed.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucune activité</p>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {feed.map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-xs py-1">
              <div className="mt-0.5 shrink-0">{iconForType(item.type)}</div>
              <div className="flex-1 min-w-0">
                <span className="text-foreground">{labelForItem(item)}</span>
                {item.reason && <span className="text-muted-foreground ml-1">— {item.reason}</span>}
              </div>
              <span className="text-muted-foreground shrink-0 text-[10px]">
                {new Date(item.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </FormSection>
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

        {detailTab === 'fiche' && <>
        {/* Description — shown above the Fiche section so the project's
            purpose/summary is the first thing the reader sees. */}
        {(project.description || isProjectFieldEditable(project, 'description', capabilities)) && (
          <FormSection title="Description" collapsible defaultExpanded storageKey="project-detail-desc">
            {isProjectFieldEditable(project, 'description', capabilities)
              ? <InlineEditableRow label="Description" value={project.description || ''} onSave={(v) => handleSave('description', v)} />
              : <ReadOnlyRow label="Description" value={<span className="text-sm whitespace-pre-wrap">{project.description || '—'}</span>} />}
          </FormSection>
        )}

        {/* Quick stats — inspired by Gouti "Donnees quantitatives et acces rapide" */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1"><WeatherIcon weather={project.weather} size={14} /> {projectWeatherLabels[project.weather] ?? project.weather}</div>
          <div className="flex items-center gap-1"><Target size={11} /> {project.progress}%</div>
          <div className="flex items-center gap-1"><ListTodo size={11} /> {tasks?.length ?? 0} tâches</div>
          <div className="flex items-center gap-1"><Users size={11} /> {members?.length ?? 0} personnes</div>
          <div className="flex items-center gap-1"><Milestone size={11} /> {milestones?.length ?? 0} jalons</div>
        </div>

        <SectionColumns>
          <div className="@container space-y-5">
            <FormSection title="Fiche projet" collapsible defaultExpanded storageKey="project-detail-fiche">
              <DetailFieldGrid>
                {isProjectFieldEditable(project, 'name', capabilities)
                  ? <InlineEditableRow label="Nom" value={project.name} onSave={(v) => handleSave('name', v)} />
                  : <ReadOnlyRow label="Nom" value={<span className="text-sm text-foreground">{project.name}</span>} />}
                <ReadOnlyRow label="Code" value={<span className="text-sm font-mono font-medium text-foreground">{project.code || '—'}</span>} />
                {isProjectFieldEditable(project, 'status', capabilities)
                  ? <InlineEditableTags label="Statut" value={project.status} options={projectStatusOptions} onSave={(v) => handleSave('status', v)} />
                  : <ReadOnlyRow label="Statut" value={<span className="text-sm">{projectStatusLabels[project.status] || project.status}</span>} />}
                {isProjectFieldEditable(project, 'priority', capabilities)
                  ? <InlineEditableTags label="Priorité" value={project.priority} options={projectPriorityOptions} onSave={(v) => handleSave('priority', v)} />
                  : <ReadOnlyRow label="Priorité" value={<span className="text-sm">{projectPriorityLabels[project.priority] || project.priority}</span>} />}
                <InlineEditableTags label="Météo" value={project.weather} options={projectWeatherOptions} onSave={(v) => handleSave('weather', v)} />
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

            <FormSection title="Planning" collapsible defaultExpanded storageKey="project-detail-planning">
              <DetailFieldGrid>
                <InlineEditableRow label="Début" value={toDateInputValue(project.start_date)} displayValue={toDateDisplayValue(project.start_date)} onSave={(v) => handleSave('start_date', v || null)} type="date" />
                <InlineEditableRow label="Fin prévue" value={toDateInputValue(project.end_date)} displayValue={toDateDisplayValue(project.end_date)} onSave={(v) => handleSave('end_date', v || null)} type="date" />
                <InlineEditableRow label="Fin réelle" value={toDateInputValue(project.actual_end_date)} displayValue={toDateDisplayValue(project.actual_end_date)} onSave={(v) => handleSave('actual_end_date', v || null)} type="date" />
              </DetailFieldGrid>
            </FormSection>

            {/* Calcul d'avancement — méthode de pondération choisie pour ce projet */}
            <FormSection title="Calcul d'avancement" collapsible defaultExpanded={false} storageKey="project-detail-progress-method">
              <p className="text-[11px] text-muted-foreground mb-2">
                Détermine comment l'avancement de ce projet ({project.progress}%) est calculé à partir de l'avancement de chaque tâche. La modification recalcule immédiatement l'avancement.
              </p>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Méthode</label>
                <select
                  value={project.progress_weight_method || ''}
                  onChange={(e) => handleSave('progress_weight_method', e.target.value || null)}
                  className={`${panelInputClass} w-full text-xs mt-0.5`}
                  disabled={!isProjectFieldEditable(project, 'progress_weight_method', capabilities)}
                >
                  <option value="">{standardLabel}</option>
                  {PROGRESS_WEIGHT_METHOD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {project.progress_weight_method && (
                  <p className="text-[11px] text-muted-foreground/80 italic mt-1.5">
                    {PROGRESS_WEIGHT_METHOD_OPTIONS.find((o) => o.value === project.progress_weight_method)?.description}
                  </p>
                )}
                {!project.progress_weight_method && (
                  <p className="text-[11px] text-muted-foreground/80 italic mt-1.5">
                    Mode <strong>{standardLabel}</strong> — utilise la méthode configurée dans <strong>Paramètres → Projets</strong>.
                  </p>
                )}
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
          <ActivityFeedSection projectId={id} />
        </>}

        {detailTab === 'documents' && (
          <FormSection title="Notes & Documents" collapsible defaultExpanded storageKey="project-detail-docs">
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

// -- WBS Section (Work Breakdown Structure) ----------------------------------

function WbsSection({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const { data: nodes = [] } = useWbsNodes(projectId)
  const createNode = useCreateWbsNode()
  const deleteNode = useDeleteWbsNode()
  const { toast } = useToast()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<{ parent_id: string; code: string; name: string; budget: string }>({
    parent_id: '', code: '', name: '', budget: '',
  })

  // Build a tree structure for rendering
  const tree = useMemo(() => {
    const byParent = new Map<string | null, ProjectWBSNode[]>()
    for (const n of nodes) {
      const key = n.parent_id
      if (!byParent.has(key)) byParent.set(key, [])
      byParent.get(key)!.push(n)
    }
    for (const arr of byParent.values()) arr.sort((a, b) => a.order - b.order || a.code.localeCompare(b.code))
    return byParent
  }, [nodes])

  const handleCreate = async () => {
    if (!form.code.trim() || !form.name.trim()) return
    try {
      await createNode.mutateAsync({
        projectId,
        payload: {
          parent_id: form.parent_id || null,
          code: form.code.trim(),
          name: form.name.trim(),
          budget: form.budget ? Number(form.budget) : null,
        },
      })
      toast({ title: t('projets.toast.wbs_node_created'), variant: 'success' })
      setForm({ parent_id: '', code: '', name: '', budget: '' })
      setShowAdd(false)
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? t('projets.toast.error')
      toast({ title: t('projets.toast.creation_failed'), description: String(msg), variant: 'error' })
    }
  }

  const renderNode = (node: ProjectWBSNode, depth: number): React.ReactNode => {
    const children = tree.get(node.id) ?? []
    return (
      <div key={node.id}>
        <div
          className="group flex items-center gap-1.5 text-[11px] py-1 px-1.5 rounded hover:bg-muted/40"
          style={{ paddingLeft: `${depth * 12 + 6}px` }}
        >
          <GitBranch size={10} className="text-primary shrink-0" />
          <span className="font-mono text-[10px] text-muted-foreground">{node.code}</span>
          <span className="flex-1 truncate">{node.name}</span>
          {node.task_count! > 0 && (
            <span className="text-[9px] text-muted-foreground">{node.task_count} t.</span>
          )}
          {node.budget != null && (
            <span className="text-[9px] text-muted-foreground tabular-nums">
              {node.budget.toLocaleString('fr-FR')} XAF
            </span>
          )}
          {node.cost_center_name && (
            <span className="text-[9px] px-1 rounded bg-muted text-muted-foreground">{node.cost_center_name}</span>
          )}
          <button
            onClick={() => deleteNode.mutate({ projectId, nodeId: node.id })}
            className="p-0.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100"
            title="Archiver le nœud"
          >
            <X size={10} />
          </button>
        </div>
        {children.map(c => renderNode(c, depth + 1))}
      </div>
    )
  }

  const roots = tree.get(null) ?? []

  return (
    <FormSection
      title={`WBS — Structure de découpage (${nodes.length})`}
      collapsible
      defaultExpanded={false}
      storageKey="project-detail-wbs"
    >
      {roots.length === 0 && !showAdd && (
        <div className="text-[11px] text-muted-foreground italic mb-2">
          Aucun nœud WBS. Créez une structure hiérarchique pour organiser les tâches
          par lots de travail et centres de coûts.
        </div>
      )}
      {roots.length > 0 && (
        <div className="border border-border rounded mb-2">
          {roots.map(r => renderNode(r, 0))}
        </div>
      )}

      {showAdd ? (
        <div className="border border-primary/30 rounded p-2 bg-primary/5 space-y-1.5">
          <select
            value={form.parent_id}
            onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))}
            className={`${panelInputClass} w-full text-xs`}
          >
            <option value="">(nœud racine)</option>
            {nodes.map(n => <option key={n.id} value={n.id}>{n.code} — {n.name}</option>)}
          </select>
          <div className="grid grid-cols-[90px_1fr] gap-1.5">
            <input
              type="text"
              value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
              className={`${panelInputClass} text-xs`}
              placeholder={t('projets.placeholders.lot_code')}
              autoFocus
            />
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className={`${panelInputClass} text-xs`}
              placeholder={t('projets.placeholders.lot_name')}
            />
          </div>
          <input
            type="number"
            value={form.budget}
            onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
            className={`${panelInputClass} w-full text-xs`}
            placeholder={t('projets.placeholders.lot_budget')}
            step="any"
          />
          <div className="flex justify-end gap-1">
            <button onClick={() => setShowAdd(false)} className="px-2 py-0.5 text-[10px] rounded hover:bg-muted text-muted-foreground">
              Annuler
            </button>
            <button
              onClick={handleCreate}
              disabled={!form.code.trim() || !form.name.trim() || createNode.isPending}
              className="gl-button-sm gl-button-confirm text-[10px]"
            >
              {createNode.isPending ? <Loader2 size={9} className="animate-spin inline" /> : 'Créer'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80"
        >
          <Plus size={10} /> Ajouter un nœud
        </button>
      )}
    </FormSection>
  )
}

// -- CPM Section (Critical Path Method) --------------------------------------

function CpmSection({ projectId }: { projectId: string }) {
  const { data: cpm, isLoading } = useProjectCpm(projectId)

  return (
    <FormSection
      title="Chemin critique (CPM)"
      collapsible
      defaultExpanded={false}
      storageKey="project-detail-cpm"
    >
      {isLoading && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-2">
          <Loader2 size={12} className="animate-spin" /> Calcul en cours…
        </div>
      )}
      {cpm && cpm.tasks.length === 0 && (
        <div className="text-[11px] text-muted-foreground italic">
          Aucune tâche à analyser. Créez des tâches et leurs dépendances pour voir le chemin critique.
        </div>
      )}
      {cpm && cpm.tasks.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
            <div className="border border-primary/30 bg-primary/5 rounded p-2">
              <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Durée totale</div>
              <div className="text-lg font-semibold tabular-nums text-primary">{cpm.project_duration_days} j</div>
            </div>
            <div className="border border-red-500/30 bg-red-500/5 rounded p-2">
              <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Tâches critiques</div>
              <div className="text-lg font-semibold tabular-nums text-red-600">{cpm.critical_path_task_ids.length}</div>
            </div>
            <div className="border border-border rounded p-2">
              <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Tâches totales</div>
              <div className="text-lg font-semibold tabular-nums">{cpm.tasks.length}</div>
            </div>
          </div>
          {cpm.has_cycles && (
            <div className="flex items-start gap-1.5 text-[10px] p-1.5 rounded bg-red-500/10 border border-red-500/30 text-red-700">
              <Zap size={10} className="mt-0.5 shrink-0" />
              <span>Cycle détecté dans les dépendances — CPM partiel. Vérifiez les liens.</span>
            </div>
          )}
          {cpm.warnings.length > 0 && !cpm.has_cycles && (
            <div className="text-[10px] text-orange-600">
              {cpm.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
            </div>
          )}
          <div className="border border-border rounded overflow-hidden">
            <div className="grid grid-cols-[1fr_40px_40px_40px_40px] gap-1 px-2 py-1 bg-muted/50 text-[9px] font-semibold uppercase text-muted-foreground">
              <span>Tâche</span>
              <span className="text-right">ES</span>
              <span className="text-right">EF</span>
              <span className="text-right">Slack</span>
              <span className="text-right">Dur.</span>
            </div>
            <div className="max-h-[240px] overflow-y-auto">
              {cpm.tasks
                .slice()
                .sort((a, b) => {
                  if (a.is_critical !== b.is_critical) return a.is_critical ? -1 : 1
                  return a.early_start - b.early_start
                })
                .map((t: CPMTaskInfo) => (
                  <div
                    key={t.id}
                    className={cn(
                      'grid grid-cols-[1fr_40px_40px_40px_40px] gap-1 px-2 py-1 text-[10px] border-t border-border/30',
                      t.is_critical && 'bg-red-500/5',
                    )}
                  >
                    <span className="truncate flex items-center gap-1">
                      {t.is_critical && <Zap size={9} className="text-red-500 shrink-0" />}
                      {t.title}
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">J{t.early_start}</span>
                    <span className="text-right tabular-nums text-muted-foreground">J{t.early_finish}</span>
                    <span className={cn('text-right tabular-nums', t.slack === 0 ? 'text-red-500 font-semibold' : 'text-muted-foreground')}>
                      {t.slack}j
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">{t.duration_days}j</span>
                  </div>
                ))}
            </div>
          </div>
          <div className="text-[9px] text-muted-foreground italic">
            ES = début au plus tôt · EF = fin au plus tôt · Slack = marge totale (0 = critique)
          </div>
        </div>
      )}
    </FormSection>
  )
}

// -- Planning Revisions Section (in ProjectDetailPanel) ----------------------

function PlanningRevisionsSection({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const { data: revisions = [] } = usePlanningRevisions(projectId)
  const createRev = useCreateRevision()
  const applyRev = useApplyRevision()
  const deleteRev = useDeleteRevision()
  const { toast } = useToast()
  const [creating, setCreating] = useState<null | 'baseline' | 'simulation'>(null)
  const [revName, setRevName] = useState('')
  const [revDesc, setRevDesc] = useState('')

  const handleCreate = async () => {
    if (!revName.trim() || !creating) return
    try {
      await createRev.mutateAsync({
        projectId,
        payload: {
          name: revName.trim(),
          description: revDesc.trim() || null,
          is_simulation: creating === 'simulation',
        },
      })
      toast({
        title: creating === 'simulation' ? 'Simulation créée' : 'Référence créée',
        variant: 'success',
      })
      setCreating(null)
      setRevName('')
      setRevDesc('')
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? t('projets.toast.error')
      toast({ title: t('projets.toast.revision_creation_error'), description: String(msg), variant: 'error' })
    }
  }

  const handleApply = async (rev: PlanningRevision) => {
    try {
      await applyRev.mutateAsync({ projectId, revisionId: rev.id })
      toast({ title: `Révision "${rev.name}" activée`, variant: 'success' })
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? t('projets.toast.error')
      toast({ title: t('projets.toast.revision_apply_failed'), description: String(msg), variant: 'error' })
    }
  }

  return (
    <FormSection
      title={`Révisions de planning (${revisions.length})`}
      collapsible
      defaultExpanded={false}
      storageKey="project-detail-revisions"
    >
      {revisions.length === 0 && !creating && (
        <div className="text-[11px] text-muted-foreground italic mb-2">
          Aucune révision. Créez une référence (baseline) pour figer le planning actuel,
          ou une simulation pour tester des scénarios "what-if".
        </div>
      )}

      {revisions.length > 0 && (
        <div className="space-y-1 mb-2">
          {revisions.map((rev: PlanningRevision) => (
            <div
              key={rev.id}
              className={cn(
                'group flex items-center gap-2 px-2 py-1.5 rounded border text-[11px]',
                rev.is_active ? 'border-primary/30 bg-primary/5' : 'border-border hover:bg-muted/40',
              )}
            >
              {rev.is_active
                ? <Star size={11} className="text-primary shrink-0 fill-primary" />
                : rev.is_simulation
                  ? <FlaskConical size={11} className="text-orange-500 shrink-0" />
                  : <Camera size={11} className="text-muted-foreground shrink-0" />}
              <span className="font-medium">#{rev.revision_number}</span>
              <span className="flex-1 truncate">{rev.name}</span>
              {rev.is_simulation && (
                <span className="text-[9px] px-1 py-0 rounded bg-orange-500/10 text-orange-600 border border-orange-500/20">
                  Simulation
                </span>
              )}
              {rev.is_active && (
                <span className="text-[9px] px-1 py-0 rounded bg-primary/10 text-primary border border-primary/20">
                  Active
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">
                {new Date(rev.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
              </span>
              {!rev.is_active && (
                <button
                  onClick={() => handleApply(rev)}
                  disabled={applyRev.isPending}
                  className="p-0.5 rounded hover:bg-primary/10 text-primary disabled:opacity-30"
                  title="Activer cette révision"
                >
                  <Play size={10} />
                </button>
              )}
              {!rev.is_active && (
                <button
                  onClick={() => deleteRev.mutate({ projectId, revisionId: rev.id })}
                  className="p-0.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100"
                  title="Supprimer"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {creating ? (
        <div className="border border-primary/30 rounded p-2 bg-primary/5 space-y-1.5">
          <div className="text-[10px] font-medium text-primary flex items-center gap-1">
            {creating === 'simulation' ? <FlaskConical size={10} /> : <Camera size={10} />}
            Nouvelle {creating === 'simulation' ? 'simulation' : 'référence (baseline)'}
          </div>
          <input
            type="text"
            value={revName}
            onChange={e => setRevName(e.target.value)}
            className={`${panelInputClass} w-full text-xs`}
            placeholder={t('projets.placeholders.revision_name')}
            autoFocus
          />
          <textarea
            value={revDesc}
            onChange={e => setRevDesc(e.target.value)}
            className={`${panelInputClass} w-full text-xs min-h-[36px] resize-y`}
            placeholder={t('projets.placeholders.revision_desc_optional')}
            rows={2}
          />
          <div className="flex justify-end gap-1">
            <button
              onClick={() => { setCreating(null); setRevName(''); setRevDesc('') }}
              className="px-2 py-0.5 text-[10px] rounded hover:bg-muted text-muted-foreground"
            >
              Annuler
            </button>
            <button
              onClick={handleCreate}
              disabled={!revName.trim() || createRev.isPending}
              className="gl-button-sm gl-button-confirm text-[10px]"
            >
              {createRev.isPending ? <Loader2 size={9} className="animate-spin inline" /> : 'Créer'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCreating('baseline')}
            className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80"
          >
            <Camera size={10} /> Nouvelle référence
          </button>
          <span className="text-muted-foreground">·</span>
          <button
            onClick={() => setCreating('simulation')}
            className="flex items-center gap-1 text-[10px] text-orange-600 hover:text-orange-500"
          >
            <FlaskConical size={10} /> Nouvelle simulation
          </button>
        </div>
      )}
    </FormSection>
  )
}
// -- Sub-Projects Section (for detail panel) ----------------------------------

function SubProjectsSection({ projectId }: { projectId: string }) {
  const { data: children, isLoading } = useSubProjects(projectId)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const projectStatusLabels = useDictionaryLabels('project_status', PROJECT_STATUS_LABELS_FALLBACK)

  if (isLoading) return <div className="text-xs text-muted-foreground py-2"><Loader2 size={12} className="animate-spin inline mr-1" />Chargement...</div>
  if (!children || children.length === 0) return <EmptyState icon={Layers} title="Aucun sous-projet" variant="search" size="compact" />

  return (
    <div className="border border-border rounded-md overflow-hidden">
      {children.map((child) => (
        <div
          key={child.id}
          className="flex items-center gap-2 px-2.5 py-2 text-xs hover:bg-muted/40 transition-colors cursor-pointer border-b border-border/60 last:border-0"
          onClick={() => openDynamicPanel({ type: 'detail', module: 'projets', id: child.id })}
        >
          <FolderKanban size={11} className="text-primary shrink-0" />
          <span className="font-medium">{child.code}</span>
          <span className="text-muted-foreground truncate flex-1">{child.name}</span>
          <span className={cn('gl-badge', child.status === 'active' ? 'gl-badge-success' : 'gl-badge-neutral')}>
            {projectStatusLabels[child.status] ?? child.status}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">{child.progress}%</span>
          <ChevronRight size={12} className="text-muted-foreground" />
        </div>
      ))}
    </div>
  )
}
