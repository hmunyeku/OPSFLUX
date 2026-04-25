/**
 * TaskDetailPanel — Detail view for a project task.
 *
 * Follows the OpsFlux gold standard (like PackLogCargoDetailPanel):
 * - Compact summary header (breadcrumb, status/priority badges, KPI pills)
 * - Tabbed layout: Détails | Sous-tâches | Dépendances | Collaboration
 *
 * Opened from Gantt chart double-click on a task.
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Calendar, User, Flag, CheckCircle2, Clock, ListTodo,
  MessageSquare, Link2, ChevronRight, FolderKanban, Loader2,
  Send, X, ArrowRight, ArrowLeft,
  FileText, AlertCircle, TrendingUp, Pencil, Check, Layers,
} from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import {
  useProject, useAllProjectTasks, useUpdateProjectTask, useTaskComments, useCreateTaskComment, useTaskDependencies,
  usePlannerLinks, useSendToPlanner, useUnlinkTaskFromPlanner,
  useBreakdownPending, useResolveBreakdownPending,
} from '@/hooks/useProjets'
import { useRevisionDecisionRequests, useRespondRevisionDecisionRequest } from '@/hooks/usePlanner'
import { useUsers } from '@/hooks/useUsers'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import {
  DynamicPanelShell,
  PanelContentLayout,
  SectionColumns,
  FormSection,
  DetailFieldGrid,
  ReadOnlyRow,
  InlineEditableRow,
  InlineEditableSelect,
} from '@/components/layout/DynamicPanel'
import type { ActionItem } from '@/components/layout/DynamicPanel'
import { TabBar } from '@/components/ui/Tabs'
import { TagManager } from '@/components/shared/TagManager'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import type { PlannerRevisionDecisionRequest, ProjectTask } from '@/types/api'
import { formatDate } from '@/lib/i18n'

// ── Inline editable textarea (multiline) ─────────────────────
// InlineEditableRow only supports single-line input. For long-form
// fields like description we use a local textarea wrapper that mimics
// the same UX (double-click to edit, Esc to cancel, blur/Cmd+Enter to
// commit) but renders a multi-line area.

function InlineEditableTextarea({
  value,
  placeholder,
  onSave,
  disabled,
}: {
  value: string
  placeholder?: string
  onSave: (newValue: string) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const taRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (editing) { setDraft(value); setTimeout(() => taRef.current?.focus(), 0) } }, [editing, value])

  const commit = useCallback(() => {
    if (draft !== value) onSave(draft)
    setEditing(false)
  }, [draft, value, onSave])

  const cancel = useCallback(() => { setDraft(value); setEditing(false) }, [value])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') cancel()
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit()
  }, [commit, cancel])

  if (editing && !disabled) {
    return (
      <div className="rounded-md border border-primary/30 bg-background p-2">
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={5}
          placeholder={placeholder}
          className="w-full text-sm bg-transparent resize-y focus:outline-none min-h-[5rem]"
        />
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
          <span className="text-[10px] text-muted-foreground mr-auto">{t('projets.entree_pour_valider_esc_pour_annuler')}</span>
          <button onClick={cancel} className="h-7 px-2 rounded text-xs text-muted-foreground hover:bg-accent inline-flex items-center gap-1">
            <X size={12} /> Annuler
          </button>
          <button onClick={commit} className="gl-button-sm gl-button-confirm">
            <Check size={12} /> Enregistrer
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'group rounded-md border border-dashed border-border/60 px-3 py-2.5 transition-colors min-h-[3.5rem]',
        !disabled && 'hover:border-primary/40 cursor-text',
      )}
      onDoubleClick={() => !disabled && setEditing(true)}
      onClick={() => !disabled && !value && setEditing(true)}
      title={disabled ? undefined : 'Double-cliquer pour modifier'}
    >
      {value ? (
        <p className="text-sm text-foreground whitespace-pre-wrap break-words">{value}</p>
      ) : (
        <p className="text-sm text-muted-foreground italic">{placeholder || 'Aucune description — cliquer pour ajouter'}</p>
      )}
      {!disabled && (
        <Pencil size={11} className="float-right -mt-4 text-transparent group-hover:text-muted-foreground transition-colors" />
      )}
    </div>
  )
}

// ── Status/Priority labels & colors ────────────────────────────

const STATUS_OPTIONS = [
  { value: 'todo', label: 'À faire', color: '#9ca3af' },
  { value: 'in_progress', label: 'En cours', color: '#3b82f6' },
  { value: 'review', label: 'Revue', color: '#eab308' },
  { value: 'done', label: 'Terminé', color: '#22c55e' },
  { value: 'cancelled', label: 'Annulé', color: '#ef4444' },
]
const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Basse', color: '#9ca3af' },
  { value: 'medium', label: 'Moyenne', color: '#3b82f6' },
  { value: 'high', label: 'Haute', color: '#f97316' },
  { value: 'critical', label: 'Critique', color: '#ef4444' },
]
const STATUS_MAP = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s]))
const PRIORITY_MAP = Object.fromEntries(PRIORITY_OPTIONS.map(p => [p.value, p]))

function statusBadge(status: string) {
  const s = STATUS_MAP[status]
  if (!s) return <span className="text-xs text-muted-foreground">{status}</span>
  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1"
      style={{ backgroundColor: s.color + '18', color: s.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
      {s.label}
    </span>
  )
}

function priorityBadge(priority: string) {
  const p = PRIORITY_MAP[priority]
  if (!p) return <span className="text-xs text-muted-foreground">{priority}</span>
  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-full font-medium"
      style={{ backgroundColor: p.color + '18', color: p.color }}
    >
      {p.label}
    </span>
  )
}

// ── Build task ancestry path ──────────────────────────────────

function buildAncestry(taskId: string, allTasks: ProjectTask[]): ProjectTask[] {
  const path: ProjectTask[] = []
  let current = allTasks.find(t => t.id === taskId)
  while (current) {
    path.unshift(current)
    if (!current.parent_id) break
    current = allTasks.find(t => t.id === current!.parent_id)
  }
  return path
}

// ── Tab type ─────────────────────────────────────────────────

type TaskTab = 'details' | 'subtasks' | 'dependencies' | 'collaboration'

// ── Component ───────────────────────────────────────────────────

export function TaskDetailPanel({ projectId, taskId }: { projectId: string; taskId: string }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const updateTask = useUpdateProjectTask()
  const respondRevisionDecisionRequest = useRespondRevisionDecisionRequest()
  const { data: plannerLinks = [] } = usePlannerLinks(projectId)
  const sendToPlanner = useSendToPlanner()
  const unlinkFromPlanner = useUnlinkTaskFromPlanner()
  const isLinkedToPlanner = useMemo(() => plannerLinks.some((l) => l.task_id === taskId), [plannerLinks, taskId])

  // Tab state
  const [activeTab, setActiveTab] = useState<TaskTab>('details')

  // Spec §2.8: list of child tasks flagged pending manual breakdown
  // after a parent Planner revision was accepted. Used to badge the
  // affected children in the "Sous-tâches" grid and to show an info
  // banner on the task itself when IT is the one to update.
  const { data: breakdownPendingList = [] } = useBreakdownPending(projectId)
  const breakdownPendingByTask = useMemo(() => {
    const m = new Map<string, typeof breakdownPendingList[number]>()
    for (const item of breakdownPendingList) m.set(item.task_id, item)
    return m
  }, [breakdownPendingList])
  const thisTaskBreakdownPending = breakdownPendingByTask.get(taskId)
  const resolveBreakdown = useResolveBreakdownPending()

  // Load project info for breadcrumb
  const { data: project } = useProject(projectId)

  // Load all tasks for this project, find our task
  const { data: tasksData } = useAllProjectTasks({ page: 1, page_size: 500, project_id: projectId })
  const tasks = (tasksData?.items ?? []) as ProjectTask[]
  const task = tasks.find(t => t.id === taskId)
  const childTasks = tasks.filter((t) => t.parent_id === taskId)
  // A task is a "parent" (i.e. has children) → its progress is auto-derived
  // by the backend roll-up. The slider must be disabled and a hint shown.
  const isParentTask = childTasks.length > 0
  // Project context — used to know whether to show the manual `weight`
  // field. We only show it when the project explicitly opts into manual
  // weighting; if the project relies on the admin default, the user can
  // switch to manual on the project detail panel first.
  const isManualMethod = project?.progress_weight_method === 'manual'

  // Ancestry path for breadcrumb
  const ancestry = useMemo(() => task ? buildAncestry(taskId, tasks) : [], [taskId, tasks, task])

  // Comments
  const { data: comments } = useTaskComments(projectId, taskId)
  const createComment = useCreateTaskComment()
  const [commentText, setCommentText] = useState('')

  // Dependencies — both predecessors (incoming → this task) and
  // successors (this task → outgoing) so the panel shows the full
  // upstream/downstream context.
  const { data: deps } = useTaskDependencies(projectId)
  type Dep = { id: string; from_task_id: string; to_task_id: string; dependency_type: string; lag_days?: number | null }
  const allDeps = (deps || []) as Dep[]
  const incomingDeps = allDeps.filter((d) => d.to_task_id === taskId)
  const outgoingDeps = allDeps.filter((d) => d.from_task_id === taskId)
  const { data: incomingRevisionRequestsData } = useRevisionDecisionRequests({
    page: 1,
    page_size: 20,
    direction: 'incoming',
    task_id: taskId,
    project_id: projectId,
    status: 'pending',
  })
  const { data: outgoingRevisionRequestsData } = useRevisionDecisionRequests({
    page: 1,
    page_size: 20,
    direction: 'outgoing',
    task_id: taskId,
    project_id: projectId,
    status: 'all',
  })
  const incomingRevisionRequests = incomingRevisionRequestsData?.items ?? []
  const outgoingRevisionRequests = outgoingRevisionRequestsData?.items ?? []

  // Users for assignee picker
  const { data: usersData } = useUsers({ page: 1, page_size: 100, active: true })

  // ── Save handler ──────────────────────────────────────────────

  const handleSave = useCallback((field: string, value: string | number | null) => {
    updateTask.mutate(
      { projectId, taskId, payload: { [field]: value } },
      {
        onSuccess: () => toast({ title: t('projets.toast.updated'), variant: 'success' }),
        onError: () => toast({ title: t('projets.toast.error'), variant: 'error' }),
      },
    )
  }, [projectId, taskId, updateTask, toast, t])

  const handleAddComment = useCallback(() => {
    if (!commentText.trim()) return
    createComment.mutate(
      { projectId, taskId, payload: { body: commentText.trim() } },
      {
        onSuccess: () => { setCommentText(''); toast({ title: t('projets.toast.comment_added'), variant: 'success' }) },
        onError: () => toast({ title: t('projets.toast.error'), variant: 'error' }),
      },
    )
  }, [projectId, taskId, commentText, createComment, toast, t])

  // Spec 1.5 / 2.3: per-task toggle "Lien Planner" / "Retirer du Planner".
  const handleTogglePlannerLink = useCallback(async () => {
    if (isLinkedToPlanner) {
      try {
        await unlinkFromPlanner.mutateAsync({ projectId, taskId })
        toast({ title: t('projets.task.planner.unlinked', 'Tâche retirée du Planner'), variant: 'success' })
      } catch {
        toast({ title: t('projets.task.planner.unlink_error', 'Erreur lors du retrait'), variant: 'error' })
      }
    } else {
      try {
        const res = await sendToPlanner.mutateAsync({
          projectId,
          items: [{ task_id: taskId, priority: task?.priority || 'medium' }],
        })
        if (res.created > 0) {
          toast({ title: t('projets.task.planner.sent', 'Tâche envoyée au Planner'), variant: 'success' })
        } else if (res.skipped > 0) {
          toast({ title: t('projets.task.planner.already_linked', 'Tâche déjà liée au Planner'), variant: 'warning' })
        } else {
          toast({ title: res.errors[0] || t('common.error', 'Erreur'), variant: 'error' })
        }
      } catch (err) {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? t('common.error', 'Erreur')
        toast({ title: String(msg), variant: 'error' })
      }
    }
  }, [isLinkedToPlanner, projectId, taskId, sendToPlanner, unlinkFromPlanner, toast, task, t])

  const handleRespondRevision = useCallback((request: PlannerRevisionDecisionRequest, response: 'accepted' | 'counter_proposed') => {
    respondRevisionDecisionRequest.mutate(
      {
        requestId: request.id,
        payload: {
          response,
          response_note: response === 'accepted'
            ? t('planner.revision_requests.accepted_from_projects')
            : t('planner.revision_requests.counter_from_projects'),
          counter_start_date: response === 'counter_proposed' && task?.start_date ? task.start_date : undefined,
          counter_end_date: response === 'counter_proposed' && task?.due_date ? task.due_date : undefined,
          counter_status: response === 'counter_proposed' ? task?.status : undefined,
        },
      },
      {
        onSuccess: () => toast({ title: t('common.saved'), variant: 'success' }),
        onError: () => toast({ title: t('common.error'), variant: 'error' }),
      },
    )
  }, [respondRevisionDecisionRequest, t, toast, task])

  const actionItems = useMemo<ActionItem[]>(() => [
    {
      id: 'toggle-planner',
      label: isLinkedToPlanner
        ? t('projets.task.planner.unlink_button', 'Retirer du Planner')
        : t('projets.task.planner.link_button', 'Lier au Planner'),
      icon: isLinkedToPlanner ? X : Send,
      loading: sendToPlanner.isPending || unlinkFromPlanner.isPending,
      variant: isLinkedToPlanner ? 'default' : 'primary',
      priority: 100,
      onClick: handleTogglePlannerLink,
    },
    {
      id: 'view-project',
      label: t('projets.task.view_project', 'Voir le projet'),
      icon: FolderKanban,
      variant: 'default',
      priority: 50,
      onClick: () => openDynamicPanel({ type: 'detail', module: 'projets', id: projectId }),
    },
  ], [isLinkedToPlanner, sendToPlanner.isPending, unlinkFromPlanner.isPending, handleTogglePlannerLink, openDynamicPanel, projectId, t])

  if (!task) {
    return (
      <DynamicPanelShell title={t('projets.columns.task')} subtitle="Chargement..." icon={<CheckCircle2 size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  const statusInfo = STATUS_MAP[task.status] || { color: '#9ca3af', label: task.status }
  const durationDays = task.start_date && task.due_date
    ? Math.ceil((new Date(task.due_date).getTime() - new Date(task.start_date).getTime()) / 86400000)
    : null

  const commentsCount = (comments as unknown[])?.length || 0
  const depsCount = incomingDeps.length + outgoingDeps.length

  return (
    <DynamicPanelShell
      title={task.code || taskId.slice(0, 8)}
      subtitle={task.title}
      icon={
        <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: statusInfo.color + '20' }}>
          <CheckCircle2 size={14} style={{ color: statusInfo.color }} />
        </div>
      }
      actionItems={actionItems}
    >
      {/* ── Summary header (always visible) ─────────────────── */}
      <div className="border-b border-border/60 bg-card/50 px-4 py-3 @container">
        {/* Breadcrumb: Projet > Parent > ... > Task */}
        <div className="flex items-center gap-1 flex-wrap text-[11px] text-muted-foreground">
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
            onClick={() => openDynamicPanel({ type: 'detail', module: 'projets', id: projectId })}
          >
            <FolderKanban size={11} className="text-primary" />
            <span className="font-medium truncate max-w-[140px]">{project?.code || project?.name || 'Projet'}</span>
          </button>
          {ancestry.map((ancestor, i) => {
            const isLast = i === ancestry.length - 1
            return (
              <span key={ancestor.id} className="inline-flex items-center gap-1">
                <ChevronRight size={10} className="text-muted-foreground/60" />
                {isLast ? (
                  <span className="font-semibold text-foreground truncate max-w-[140px]">{ancestor.title}</span>
                ) : (
                  <button
                    type="button"
                    className="hover:text-foreground transition-colors cursor-pointer truncate max-w-[120px]"
                    onClick={() => openDynamicPanel({ type: 'task-detail', module: 'projets', id: ancestor.id, meta: { projectId } })}
                  >
                    {ancestor.title}
                  </button>
                )}
              </span>
            )
          })}
        </div>

        {/* ── Spec §2.8: breakdown-pending banner ───────────── */}
        {/* Displayed when THIS task was flagged as needing update     */}
        {/* after a parent-task Planner revision was accepted.          */}
        {thisTaskBreakdownPending && (
          <div className="rounded-lg border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 flex items-start gap-2.5">
            <Flag size={14} className="mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                Mise à jour requise suite à la révision du parent
              </p>
              <p className="mt-0.5 text-[11px] text-amber-800/80 dark:text-amber-300/80">
                {thisTaskBreakdownPending.parent_task_title
                  ? `La tâche parente « ${thisTaskBreakdownPending.parent_task_title} » a accepté une révision Planner. `
                  : 'Une révision Planner a été acceptée sur la tâche parente. '}
                Merci de mettre à jour les dates ou le périmètre de cette sous-tâche en conséquence.
              </p>
              {(thisTaskBreakdownPending.proposed_start_date || thisTaskBreakdownPending.proposed_end_date) && (
                <p className="mt-1 text-[10px] text-amber-700/70 dark:text-amber-400/70 tabular-nums">
                  Proposition parent : {thisTaskBreakdownPending.proposed_start_date ? new Date(thisTaskBreakdownPending.proposed_start_date).toLocaleDateString('fr-FR') : '—'}
                  {' → '}
                  {thisTaskBreakdownPending.proposed_end_date ? new Date(thisTaskBreakdownPending.proposed_end_date).toLocaleDateString('fr-FR') : '—'}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => resolveBreakdown.mutate(
                { projectId, taskId },
                {
                  onSuccess: () => toast({ title: t('projets.toast.breakdown_resolved'), variant: 'success' }),
                  onError: () => toast({ title: t('projets.toast.error'), variant: 'error' }),
                },
              )}
              disabled={resolveBreakdown.isPending}
              className="gl-button gl-button-default shrink-0 border-amber-400/60 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200 dark:hover:bg-amber-900/40"
            >
              {resolveBreakdown.isPending ? 'Enregistrement…' : 'J\'ai mis à jour'}
            </button>
          </div>
        )}

        {/* ── Quick stats row ──────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground">
          {statusBadge(task.status)}
          {priorityBadge(task.priority)}
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${task.progress ?? 0}%`, backgroundColor: statusInfo.color }}
              />
            </div>
            <span className="text-xs font-semibold tabular-nums">{task.progress ?? 0}%</span>
          </div>
        </div>

        {/* KPI pills: dates, duration, assignee, child count */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-2">
          {task.start_date && (
            <div className="flex items-center gap-1">
              <Calendar size={11} />
              {new Date(task.start_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
              {task.due_date && <> {'->'} {new Date(task.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</>}
            </div>
          )}
          {durationDays != null && (
            <div className="flex items-center gap-1">
              <Clock size={11} /> {durationDays}j
            </div>
          )}
          {task.assignee_name && (
            <div className="flex items-center gap-1">
              <User size={11} /> {task.assignee_name}
            </div>
          )}
          {childTasks.length > 0 && (
            <div className="flex items-center gap-1">
              <ListTodo size={11} /> {childTasks.length} sous-tâches
            </div>
          )}
        </div>
      </div>

      {/* ── Tab bar ──────────────────────────────────────────── */}
      <TabBar
        className="px-4"
        activeId={activeTab}
        onTabChange={(id) => setActiveTab(id as typeof activeTab)}
        items={[
          { id: 'details', label: 'Détails', icon: ListTodo },
          { id: 'subtasks', label: 'Sous-tâches', icon: Layers, badge: childTasks.length || undefined },
          { id: 'dependencies', label: 'Dépendances', icon: Link2, badge: depsCount || undefined },
          { id: 'collaboration', label: 'Collaboration', icon: MessageSquare, badge: commentsCount || undefined },
        ]}
      />

          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5 flex items-center gap-1">
              <FileText size={10} /> Description
            </p>
            <InlineEditableTextarea
              value={task.description || ''}
              placeholder={t('projets.aucune_description_cliquer_ou_double_cli')}
              onSave={(v) => handleSave('description', v || null)}
            />
          </div>

          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">Tags</p>
            <TagManager ownerType="project_task" ownerId={taskId} compact />
          </div>
        </FormSection>

        {/* ── 2-column layout: État/Assignation | Planning/POB ── */}
        <SectionColumns>
          <div className="@container space-y-5">
            <FormSection title={t('projets.etat_priorite')} collapsible defaultExpanded storageKey="task-detail-state">
              <DetailFieldGrid>
                <InlineEditableRow
                  label="Titre"
                  value={task.title}
                  onSave={(v) => handleSave('title', v)}
                  type="text"
                />
                <InlineEditableSelect
                  label={t('common.priority')}
                  value={task.priority || 'medium'}
                  displayValue={PRIORITY_MAP[task.priority || 'medium']?.label || task.priority}
                  options={PRIORITY_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
                  onSave={(v) => handleSave('priority', v)}
                />
              </DetailFieldGrid>

              <div className="mt-3">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1">
                    <TrendingUp size={10} /> Avancement
                    {isParentTask && (
                      <span
                        className="ml-1 text-[9px] font-normal text-muted-foreground/70 normal-case"
                        title={t('projets.cette_tache_est_un_parent_son_avancement')}
                      >
                        (calculé)
                      </span>
                    )}
                  </p>
                  <span className="text-sm font-semibold tabular-nums" style={{ color: statusInfo.color }}>
                    {task.progress ?? 0}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range" min={0} max={100} step={5}
                    value={task.progress ?? 0}
                    onChange={(e) => !isParentTask && handleSave('progress', Number(e.target.value))}
                    disabled={isParentTask}
                    title={isParentTask ? "Calculé depuis les sous-tâches — non modifiable manuellement" : undefined}
                    className={cn(
                      'flex-1 h-1.5 accent-primary',
                      isParentTask && 'opacity-50 cursor-not-allowed',
                    )}
                  />
                </div>
                <div className="mt-1.5 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${task.progress ?? 0}%`, backgroundColor: statusInfo.color }}
                  />
                </div>
                {isParentTask && (
                  <p className="mt-1.5 text-[10px] text-muted-foreground/80 italic">
                    <AlertCircle size={10} className="inline mr-0.5" />
                    Avancement agrégé automatiquement depuis les {childTasks.length} sous-tâche{childTasks.length > 1 ? 's' : ''} selon la méthode du projet.
                  </p>
                )}
              </div>

              <div className="mt-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">Tags</p>
                <TagManager ownerType="project_task" ownerId={taskId} compact />
              </div>
            </FormSection>

            {/* ── 2-column layout: État/Assignation | Planning/POB ── */}
            <SectionColumns>
              <div className="@container space-y-5">
                <FormSection title="État & priorité" collapsible defaultExpanded storageKey="task-detail-state">
                  <DetailFieldGrid>
                    <InlineEditableSelect
                      label="Statut"
                      value={task.status}
                      displayValue={STATUS_MAP[task.status]?.label || task.status}
                      options={STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
                      onSave={(v) => handleSave('status', v)}
                    />
                    <InlineEditableSelect
                      label="Priorité"
                      value={task.priority || 'medium'}
                      displayValue={PRIORITY_MAP[task.priority || 'medium']?.label || task.priority}
                      options={PRIORITY_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
                      onSave={(v) => handleSave('priority', v)}
                    />
                  </DetailFieldGrid>

                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1">
                        <TrendingUp size={10} /> Avancement
                        {isParentTask && (
                          <span
                            className="ml-1 text-[9px] font-normal text-muted-foreground/70 normal-case"
                            title="Cette tâche est un parent — son avancement est calculé automatiquement à partir de ses sous-tâches selon la méthode de pondération du projet."
                          >
                            (calculé)
                          </span>
                        )}
                      </p>
                      <span className="text-sm font-semibold tabular-nums" style={{ color: statusInfo.color }}>
                        {task.progress ?? 0}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range" min={0} max={100} step={5}
                        value={task.progress ?? 0}
                        onChange={(e) => !isParentTask && handleSave('progress', Number(e.target.value))}
                        disabled={isParentTask}
                        title={isParentTask ? 'Calculé depuis les sous-tâches — non modifiable manuellement' : undefined}
                        className={cn(
                          'flex-1 h-1.5 accent-primary',
                          isParentTask && 'opacity-50 cursor-not-allowed',
                        )}
                      />
                    </div>
                    <div className="mt-1.5 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${task.progress ?? 0}%`, backgroundColor: statusInfo.color }}
                      />
                    </div>
                    {isParentTask && (
                      <p className="mt-1.5 text-[10px] text-muted-foreground/80 italic">
                        <AlertCircle size={10} className="inline mr-0.5" />
                        Avancement agrégé automatiquement depuis les {childTasks.length} sous-tâche{childTasks.length > 1 ? 's' : ''} selon la méthode du projet.
                      </p>
                    )}
                  </div>

                  {/* Manual weight — conceptually tied to the progress calculation
                      (it's the per-task weight used in the project's weighted
                      average). Only shown when the project uses 'manual' mode
                      AND the task is a leaf (parents are auto-derived). */}
                  {isManualMethod && !isParentTask && (
                    <div className="mt-3">
                      <DetailFieldGrid>
                        <InlineEditableRow
                          label="Poids"
                          value={task.weight != null ? String(task.weight) : ''}
                          displayValue={task.weight != null ? String(task.weight) : '— (non pondéré)'}
                          onSave={(v) => handleSave('weight', v ? Number(v) : null)}
                          type="number"
                        />
                        <div />
                      </DetailFieldGrid>
                      <p className="mt-1.5 text-[10px] text-muted-foreground/80 italic">
                        <AlertCircle size={10} className="inline mr-0.5" />
                        Le projet utilise la pondération manuelle. Les tâches sans poids comptent pour 0 dans le calcul de l&apos;avancement.
                      </p>
                    </div>
                  )}
                </FormSection>

                <FormSection title="Assignation" collapsible defaultExpanded storageKey="task-detail-assign">
                  <DetailFieldGrid>
                    <InlineEditableSelect
                      label="Assigné"
                      value={task.assignee_id || ''}
                      displayValue={
                        task.assignee_id
                          ? (usersData?.items ?? []).find((u) => u.id === task.assignee_id)
                              ? `${(usersData!.items.find((u) => u.id === task.assignee_id)!).first_name} ${(usersData!.items.find((u) => u.id === task.assignee_id)!).last_name}`
                              : task.assignee_name || '—'
                          : 'Non assigné'
                      }
                      options={[
                        { value: '', label: 'Non assigné' },
                        ...((usersData?.items ?? []).map((u) => ({
                          value: u.id,
                          label: `${u.first_name} ${u.last_name}`,
                        }))),
                      ]}
                      onSave={(v) => handleSave('assignee_id', v || null)}
                    />
                  </DetailFieldGrid>
                </FormSection>
              </div>

              <div className="@container space-y-5">
                <FormSection title={t('common.planning')} collapsible defaultExpanded storageKey="task-detail-planning">
                  <DetailFieldGrid>
                    <InlineEditableRow
                      label="Début"
                      value={task.start_date ? task.start_date.split('T')[0] : ''}
                      displayValue={task.start_date ? formatDate(task.start_date) : '—'}
                      onSave={(v) => handleSave('start_date', v || null)}
                      type="date"
                    />
                    <InlineEditableRow
                      label="Échéance"
                      value={task.due_date ? task.due_date.split('T')[0] : ''}
                      displayValue={task.due_date ? formatDate(task.due_date) : '—'}
                      onSave={(v) => handleSave('due_date', v || null)}
                      type="date"
                    />
                  </DetailFieldGrid>
                  <DetailFieldGrid>
                    <ReadOnlyRow
                      label="Durée"
                      value={
                        durationDays != null
                          ? <span className="text-sm tabular-nums">{durationDays} jour{durationDays !== 1 ? 's' : ''}</span>
                          : '—'
                      }
                    />
                    {task.completed_at && (
                      <ReadOnlyRow
                        label="Terminé le"
                        value={formatDate(task.completed_at)}
                      />
                    )}
                  </DetailFieldGrid>
                </FormSection>

                <FormSection title="POB & Charge" collapsible defaultExpanded storageKey="task-detail-pob">
                  <DetailFieldGrid>
                    <InlineEditableRow
                      label="POB demandé"
                      value={String(task.pob_quota ?? 0)}
                      displayValue={`${task.pob_quota ?? 0} pers.`}
                      onSave={(v) => handleSave('pob_quota', Math.max(0, Number(v) || 0))}
                      type="number"
                    />
                    <ReadOnlyRow label="Heures estimées" value={task.estimated_hours ? `${task.estimated_hours} h` : '—'} />
                  </DetailFieldGrid>
                  <DetailFieldGrid>
                    <ReadOnlyRow label="Heures réelles" value={task.actual_hours ? `${task.actual_hours} h` : '—'} />
                    <div />
                  </DetailFieldGrid>
                  <p className="mt-2 text-[10px] text-muted-foreground/80 italic">
                    <AlertCircle size={10} className="inline mr-1" />
                    Modifier le POB d&apos;une tâche liée au Planner déclenche une notification à l&apos;arbitre.
                  </p>
                </div>
              )}
            </FormSection>

            <FormSection title="Assignation" collapsible defaultExpanded storageKey="task-detail-assign">
              <DetailFieldGrid>
                <InlineEditableSelect
                  label={t('projets.assigne')}
                  value={task.assignee_id || ''}
                  displayValue={
                    task.assignee_id
                      ? (usersData?.items ?? []).find((u) => u.id === task.assignee_id)
                          ? `${(usersData!.items.find((u) => u.id === task.assignee_id)!).first_name} ${(usersData!.items.find((u) => u.id === task.assignee_id)!).last_name}`
                          : task.assignee_name || '—'
                      : 'Non assigné'
                  }
                  options={[
                    { value: '', label: 'Non assigné' },
                    ...((usersData?.items ?? []).map((u) => ({
                      value: u.id,
                      label: `${u.first_name} ${u.last_name}`,
                    }))),
                  ]}
                  onSave={(v) => handleSave('assignee_id', v || null)}
                />
              </DetailFieldGrid>
            </FormSection>
          </div>

          <div className="@container space-y-5">
            <FormSection title="Planning" collapsible defaultExpanded storageKey="task-detail-planning">
              <DetailFieldGrid>
                <InlineEditableRow
                  label={t('conformite.columns.start_date')}
                  value={task.start_date ? task.start_date.split('T')[0] : ''}
                  displayValue={task.start_date ? new Date(task.start_date).toLocaleDateString('fr-FR') : '—'}
                  onSave={(v) => handleSave('start_date', v || null)}
                  type="date"
                />
                <InlineEditableRow
                  label={t('projets.columns.deadline')}
                  value={task.due_date ? task.due_date.split('T')[0] : ''}
                  displayValue={task.due_date ? new Date(task.due_date).toLocaleDateString('fr-FR') : '—'}
                  onSave={(v) => handleSave('due_date', v || null)}
                  type="date"
                />
              </DetailFieldGrid>
              <DetailFieldGrid>
                <ReadOnlyRow
                  label={t('common.duration')}
                  value={
                    durationDays != null
                      ? <span className="text-sm tabular-nums">{durationDays} jour{durationDays !== 1 ? 's' : ''}</span>
                      : '—'
                  }
                />
                {task.completed_at && (
                  <ReadOnlyRow
                    label={t('projets.columns.completed_at')}
                    value={new Date(task.completed_at).toLocaleDateString('fr-FR')}
                  />
                )}
              </DetailFieldGrid>
            </FormSection>

            <FormSection title="POB & Charge" collapsible defaultExpanded storageKey="task-detail-pob">
              <DetailFieldGrid>
                <InlineEditableRow
                  label={t('projets.pob_demande')}
                  value={String(task.pob_quota ?? 0)}
                  displayValue={`${task.pob_quota ?? 0} pers.`}
                  onSave={(v) => handleSave('pob_quota', Math.max(0, Number(v) || 0))}
                  type="number"
                />
                <ReadOnlyRow label={t('projets.tasks.estimated_hours')} value={task.estimated_hours ? `${task.estimated_hours} h` : '—'} />
              </DetailFieldGrid>
              <DetailFieldGrid>
                <ReadOnlyRow label={t('projets.heures_reelles')} value={task.actual_hours ? `${task.actual_hours} h` : '—'} />
                <div />
              </DetailFieldGrid>
              <p className="mt-2 text-[10px] text-muted-foreground/80 italic">
                <AlertCircle size={10} className="inline mr-1" />
                Modifier le POB d'une tâche liée au Planner déclenche une notification à l'arbitre.
              </p>
            </FormSection>
          </div>
        </SectionColumns>

        {/* ── Sous-tâches ─────────────────────────────────── */}
        {childTasks.length > 0 && (
          <FormSection title={`Sous-tâches (${childTasks.length})`} collapsible defaultExpanded storageKey="task-detail-children">
            <div className="space-y-1.5">
              {childTasks.map(child => {
                const childPending = breakdownPendingByTask.get(child.id)
                const childColor = STATUS_MAP[child.status]?.color || '#9ca3af'
                return (
                  <div
                    key={child.id}
                    className={cn(
                      'group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all border',
                      childPending
                        ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-400/60 hover:border-amber-500'
                        : 'border-border/40 hover:border-primary/30 hover:bg-accent/30',
                    )}
                    onClick={() => openDynamicPanel({ type: 'task-detail', module: 'projets', id: child.id, meta: { projectId } })}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: childColor }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{child.title}</p>
                      {child.code && (
                        <p className="text-[10px] text-muted-foreground font-mono">{child.code}</p>
                      )}
                    </div>
                    {childPending && (
                      <span className="gl-badge gl-badge-warning text-[10px] shrink-0">
                        à réviser
                      </span>
                    )}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${child.progress ?? 0}%`, backgroundColor: childColor }}
                        />
                      </div>
                      <span className="text-xs font-semibold tabular-nums text-muted-foreground w-9 text-right">
                        {child.progress ?? 0}%
                      </span>
                    </div>
                    <ChevronRight size={14} className="text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
                  </div>
                )
              })}
            </div>
          </FormSection>
        )}

        {/* ── Revision Requests (Planner ↔ Projets) ───────── */}
        <FormSection title={t('planner.revision_requests.projects_section_title')} collapsible defaultExpanded={incomingRevisionRequests.length > 0} storageKey="task-detail-planner-revisions">
          {incomingRevisionRequests.length === 0 && outgoingRevisionRequests.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">{t('planner.revision_requests.projects_section_empty')}</p>
          ) : (
            <div className="space-y-3">
              {incomingRevisionRequests.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{t('planner.revision_requests.incoming_title')}</p>
                  {incomingRevisionRequests.map((request) => (
                    <div key={request.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                      <p className="text-xs font-medium text-foreground">
                        {request.requester_user_name || t('planner.revision_signals.actor_fallback')}
                        {request.due_at ? ` · ${t('planner.revision_requests.due_at')} ${new Date(request.due_at).toLocaleDateString('fr-FR')}` : ''}
                      </p>
                      {(request.proposed_start_date || request.proposed_end_date || request.proposed_pax_quota != null || request.proposed_status) && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t('planner.revision_requests.proposed_summary', {
                            start: request.proposed_start_date ? new Date(request.proposed_start_date).toLocaleDateString('fr-FR') : '—',
                            end: request.proposed_end_date ? new Date(request.proposed_end_date).toLocaleDateString('fr-FR') : '—',
                            pax: request.proposed_pax_quota ?? '—',
                            status: request.proposed_status || '—',
                          })}
                        </p>
                      )}
                      {request.note && <p className="mt-1 text-xs text-muted-foreground">{request.note}</p>}
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          className="gl-button-sm gl-button-confirm text-xs"
                          onClick={() => handleRespondRevision(request, 'accepted')}
                          disabled={respondRevisionDecisionRequest.isPending}
                        >
                          {t('planner.revision_requests.accept')}
                        </button>
                        <button
                          type="button"
                          className="gl-button-sm gl-button-default text-xs"
                          onClick={() => handleRespondRevision(request, 'counter_proposed')}
                          disabled={respondRevisionDecisionRequest.isPending}
                        >
                          {t('planner.revision_requests.counter_propose')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {outgoingRevisionRequests.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{t('planner.revision_requests.outgoing_title')}</p>
                  {outgoingRevisionRequests.map((request) => (
                    <div key={request.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-foreground">{request.target_user_name || t('planner.revision_signals.actor_fallback')}</p>
                        <span className="text-[10px] text-muted-foreground">{t(`planner.revision_requests.status_${request.status}`)}</span>
                      </div>
                      {(request.response_note || request.forced_reason || request.note) && (
                        <p className="mt-1 text-xs text-muted-foreground">{request.response_note || request.forced_reason || request.note}</p>
                      )}
                      {request.application_result && (
                        <div className="mt-1 space-y-1">
                          <p className="text-xs text-muted-foreground">
                            {request.application_result.task_requires_manual_breakdown
                              ? t('planner.revision_requests.application_manual_breakdown')
                              : t('planner.revision_requests.application_summary', {
                                task: request.application_result.applied_to_task ? t('common.yes') : t('common.no'),
                                activities: request.application_result.applied_activity_count ?? 0,
                              })}
                          </p>
                          {request.application_result.task_requires_manual_breakdown && childTasks.length > 0 && (
                            <div className="rounded border border-border/60 bg-background/70 px-2 py-1.5">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                {t('planner.revision_requests.child_tasks_to_review', { count: childTasks.length })}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {childTasks.map((child) => (
                                  <button
                                    key={child.id}
                                    type="button"
                                    className="gl-button gl-button-default"
                                    onClick={() => openDynamicPanel({ type: 'task-detail', module: 'projets', id: child.id, meta: { projectId } })}
                                  >
                                    {child.code || child.title}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {(request.counter_start_date || request.counter_end_date || request.counter_status) && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t('planner.revision_requests.counter_summary', {
                            start: request.counter_start_date ? new Date(request.counter_start_date).toLocaleDateString('fr-FR') : '—',
                            end: request.counter_end_date ? new Date(request.counter_end_date).toLocaleDateString('fr-FR') : '—',
                            pax: request.counter_pax_quota ?? '—',
                            status: request.counter_status || '—',
                          })}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </FormSection>

        {/* ── Dependencies (predecessors + successors) ────── */}
        <FormSection
          title={`Dépendances (${incomingDeps.length + outgoingDeps.length})`}
          collapsible
          defaultExpanded={incomingDeps.length + outgoingDeps.length > 0}
          storageKey="task-detail-deps"
        >
          {incomingDeps.length === 0 && outgoingDeps.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">{t('planner.no_dependency')}</p>
          ) : (
            <SectionColumns>
              {/* Predecessors */}
              <div className="@container">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5 flex items-center gap-1.5">
                  <ArrowLeft size={11} />
                  Antécédents ({incomingDeps.length})
                </p>
                {incomingDeps.length === 0 ? (
                  <p className="text-xs text-muted-foreground/70 italic px-2 py-1.5">Aucun</p>
                ) : (
                  <div className="space-y-1">
                    {incomingDeps.map((dep) => {
                      const predTask = tasks.find((t) => t.id === dep.from_task_id)
                      return (
                        <button
                          key={dep.id}
                          type="button"
                          className="gl-button gl-button-default group w-full text-left"
                          onClick={() => predTask && openDynamicPanel({ type: 'task-detail', module: 'projets', id: predTask.id, meta: { projectId } })}
                        >
                          <Link2 size={12} className="text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium text-foreground truncate flex-1">
                            {predTask?.title || dep.from_task_id.slice(0, 8)}
                          </span>
                          <span className="gl-badge gl-badge-info text-[9px] shrink-0 font-mono">
                            {dep.dependency_type}
                            {typeof dep.lag_days === 'number' && dep.lag_days !== 0 && (
                              <span className="ml-0.5">{dep.lag_days >= 0 ? '+' : ''}{dep.lag_days}j</span>
                            )}
                          </span>
                          <ChevronRight size={12} className="text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Successors */}
              <div className="@container">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5 flex items-center gap-1.5">
                  <ArrowRight size={11} />
                  Successeurs ({outgoingDeps.length})
                </p>
                {outgoingDeps.length === 0 ? (
                  <p className="text-xs text-muted-foreground/70 italic px-2 py-1.5">Aucun</p>
                ) : (
                  <div className="space-y-1">
                    {outgoingDeps.map((dep) => {
                      const succTask = tasks.find((t) => t.id === dep.to_task_id)
                      return (
                        <button
                          key={dep.id}
                          type="button"
                          className="gl-button gl-button-default group w-full text-left"
                          onClick={() => succTask && openDynamicPanel({ type: 'task-detail', module: 'projets', id: succTask.id, meta: { projectId } })}
                        >
                          <Link2 size={12} className="text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium text-foreground truncate flex-1">
                            {succTask?.title || dep.to_task_id.slice(0, 8)}
                          </span>
                          <span className="gl-badge gl-badge-info text-[9px] shrink-0 font-mono">
                            {dep.dependency_type}
                            {typeof dep.lag_days === 'number' && dep.lag_days !== 0 && (
                              <span className="ml-0.5">{dep.lag_days >= 0 ? '+' : ''}{dep.lag_days}j</span>
                            )}
                          </span>
                          <ChevronRight size={12} className="text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </SectionColumns>
          </>
        )}

        {/* ── Pièces jointes ──────────────────────────────── */}
        <FormSection
          title={t('common.attachments')}
          collapsible
          defaultExpanded={false}
          storageKey="task-detail-attachments"
        >
          <AttachmentManager ownerType="project_task" ownerId={taskId} compact />
        </FormSection>

        {/* ── Commentaires ─────────────────────────────────── */}
        <FormSection
          title={`Commentaires (${(comments as unknown[])?.length || 0})`}
          collapsible
          defaultExpanded
          storageKey="task-detail-comments"
        >
          <div className="space-y-2.5">
            {((comments || []) as unknown as { id: string; content?: string; body?: string; author_name?: string; created_at: string }[]).map(c => (
              <div key={c.id} className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
                  <MessageSquare size={10} />
                  <span className="font-semibold text-foreground/80">{c.author_name || 'Utilisateur'}</span>
                  <span>·</span>
                  <span className="tabular-nums">
                    {new Date(c.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => resolveBreakdown.mutate(
                    { projectId, taskId },
                    {
                      onSuccess: () => toast({ title: t('projets.toast.breakdown_resolved'), variant: 'success' }),
                      onError: () => toast({ title: t('projets.toast.error'), variant: 'error' }),
                    },
                  )}
                  disabled={resolveBreakdown.isPending}
                  className="gl-button-sm gl-button-default shrink-0"
                >
                  {resolveBreakdown.isPending ? 'Enregistrement…' : "J'ai mis à jour"}
                </button>
              </div>
            ))}
            {(comments as unknown[])?.length === 0 && (
              <p className="text-xs text-muted-foreground italic px-2 py-1.5">{t('projets.aucun_commentaire_pour_le_moment')}</p>
            )}

          {/* Add comment */}
          <div className="flex gap-2 mt-3 pt-3 border-t border-border/30">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
              placeholder={t('support.ajouter_un_commentaire')}
              className="gl-form-input flex-1 h-8 px-2 text-sm"
            />
            <button
              onClick={handleAddComment}
              disabled={!commentText.trim() || createComment.isPending}
              className="px-3 h-8 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 font-medium inline-flex items-center gap-1"
            >
              {incomingDeps.length === 0 && outgoingDeps.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Aucune dépendance</p>
              ) : (
                <SectionColumns>
                  {/* Predecessors */}
                  <div className="@container">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5 flex items-center gap-1.5">
                      <ArrowLeft size={11} />
                      Antécédents ({incomingDeps.length})
                    </p>
                    {incomingDeps.length === 0 ? (
                      <p className="text-xs text-muted-foreground/70 italic px-2 py-1.5">Aucun</p>
                    ) : (
                      <div className="space-y-1">
                        {incomingDeps.map((dep) => {
                          const predTask = tasks.find((t) => t.id === dep.from_task_id)
                          return (
                            <button
                              key={dep.id}
                              type="button"
                              className="gl-button gl-button-default group w-full text-left flex hover:border-primary/30"
                              onClick={() => predTask && openDynamicPanel({ type: 'task-detail', module: 'projets', id: predTask.id, meta: { projectId } })}
                            >
                              <Link2 size={12} className="text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium text-foreground truncate flex-1">
                                {predTask?.title || dep.from_task_id.slice(0, 8)}
                              </span>
                              <span className="gl-badge gl-badge-info text-[9px] shrink-0 font-mono">
                                {dep.dependency_type}
                                {typeof dep.lag_days === 'number' && dep.lag_days !== 0 && (
                                  <span className="ml-0.5">{dep.lag_days >= 0 ? '+' : ''}{dep.lag_days}j</span>
                                )}
                              </span>
                              <ChevronRight size={12} className="text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Successors */}
                  <div className="@container">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5 flex items-center gap-1.5">
                      <ArrowRight size={11} />
                      Successeurs ({outgoingDeps.length})
                    </p>
                    {outgoingDeps.length === 0 ? (
                      <p className="text-xs text-muted-foreground/70 italic px-2 py-1.5">Aucun</p>
                    ) : (
                      <div className="space-y-1">
                        {outgoingDeps.map((dep) => {
                          const succTask = tasks.find((t) => t.id === dep.to_task_id)
                          return (
                            <button
                              key={dep.id}
                              type="button"
                              className="gl-button gl-button-default group w-full text-left flex hover:border-primary/30"
                              onClick={() => succTask && openDynamicPanel({ type: 'task-detail', module: 'projets', id: succTask.id, meta: { projectId } })}
                            >
                              <Link2 size={12} className="text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium text-foreground truncate flex-1">
                                {succTask?.title || dep.to_task_id.slice(0, 8)}
                              </span>
                              <span className="gl-badge gl-badge-info text-[9px] shrink-0 font-mono">
                                {dep.dependency_type}
                                {typeof dep.lag_days === 'number' && dep.lag_days !== 0 && (
                                  <span className="ml-0.5">{dep.lag_days >= 0 ? '+' : ''}{dep.lag_days}j</span>
                                )}
                              </span>
                              <ChevronRight size={12} className="text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </SectionColumns>
              )}
            </FormSection>

            {/* Revision Requests (Planner ↔ Projets) */}
            <FormSection title={t('planner.revision_requests.projects_section_title')} collapsible defaultExpanded={incomingRevisionRequests.length > 0} storageKey="task-detail-planner-revisions">
              {incomingRevisionRequests.length === 0 && outgoingRevisionRequests.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">{t('planner.revision_requests.projects_section_empty')}</p>
              ) : (
                <div className="space-y-3">
                  {incomingRevisionRequests.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{t('planner.revision_requests.incoming_title')}</p>
                      {incomingRevisionRequests.map((request) => (
                        <div key={request.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                          <p className="text-xs font-medium text-foreground">
                            {request.requester_user_name || t('planner.revision_signals.actor_fallback')}
                            {request.due_at ? ` · ${t('planner.revision_requests.due_at')} ${formatDate(request.due_at)}` : ''}
                          </p>
                          {(request.proposed_start_date || request.proposed_end_date || request.proposed_pax_quota != null || request.proposed_status) && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t('planner.revision_requests.proposed_summary', {
                                start: request.proposed_start_date ? formatDate(request.proposed_start_date) : '—',
                                end: request.proposed_end_date ? formatDate(request.proposed_end_date) : '—',
                                pax: request.proposed_pax_quota ?? '—',
                                status: request.proposed_status || '—',
                              })}
                            </p>
                          )}
                          {request.note && <p className="mt-1 text-xs text-muted-foreground">{request.note}</p>}
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              className="gl-button-sm gl-button-confirm text-xs"
                              onClick={() => handleRespondRevision(request, 'accepted')}
                              disabled={respondRevisionDecisionRequest.isPending}
                            >
                              {t('planner.revision_requests.accept')}
                            </button>
                            <button
                              type="button"
                              className="gl-button-sm gl-button-default text-xs"
                              onClick={() => handleRespondRevision(request, 'counter_proposed')}
                              disabled={respondRevisionDecisionRequest.isPending}
                            >
                              {t('planner.revision_requests.counter_propose')}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {outgoingRevisionRequests.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{t('planner.revision_requests.outgoing_title')}</p>
                      {outgoingRevisionRequests.map((request) => (
                        <div key={request.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium text-foreground">{request.target_user_name || t('planner.revision_signals.actor_fallback')}</p>
                            <span className="text-[10px] text-muted-foreground">{t(`planner.revision_requests.status_${request.status}`)}</span>
                          </div>
                          {(request.response_note || request.forced_reason || request.note) && (
                            <p className="mt-1 text-xs text-muted-foreground">{request.response_note || request.forced_reason || request.note}</p>
                          )}
                          {request.application_result && (
                            <div className="mt-1 space-y-1">
                              <p className="text-xs text-muted-foreground">
                                {request.application_result.task_requires_manual_breakdown
                                  ? t('planner.revision_requests.application_manual_breakdown')
                                  : t('planner.revision_requests.application_summary', {
                                    task: request.application_result.applied_to_task ? t('common.yes') : t('common.no'),
                                    activities: request.application_result.applied_activity_count ?? 0,
                                  })}
                              </p>
                              {request.application_result.task_requires_manual_breakdown && childTasks.length > 0 && (
                                <div className="rounded border border-border/60 bg-background/70 px-2 py-1.5">
                                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                    {t('planner.revision_requests.child_tasks_to_review', { count: childTasks.length })}
                                  </p>
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {childTasks.map((child) => (
                                      <button
                                        key={child.id}
                                        type="button"
                                        className="gl-button gl-button-default text-[11px]"
                                        onClick={() => openDynamicPanel({ type: 'task-detail', module: 'projets', id: child.id, meta: { projectId } })}
                                      >
                                        {child.code || child.title}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          {(request.counter_start_date || request.counter_end_date || request.counter_status) && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t('planner.revision_requests.counter_summary', {
                                start: request.counter_start_date ? formatDate(request.counter_start_date) : '—',
                                end: request.counter_end_date ? formatDate(request.counter_end_date) : '—',
                                pax: request.counter_pax_quota ?? '—',
                                status: request.counter_status || '—',
                              })}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </FormSection>
          </>
        )}

        {/* ══ COLLABORATION TAB ═════════════════════════════════ */}
        {activeTab === 'collaboration' && (
          <>
            {/* Pièces jointes */}
            <FormSection
              title="Pièces jointes"
              collapsible
              defaultExpanded={false}
              storageKey="task-detail-attachments"
            >
              <AttachmentManager ownerType="project_task" ownerId={taskId} compact />
            </FormSection>

            {/* Commentaires */}
            <FormSection
              title={`Commentaires (${commentsCount})`}
              collapsible
              defaultExpanded
              storageKey="task-detail-comments"
            >
              <div className="space-y-2.5">
                {((comments || []) as unknown as { id: string; content?: string; body?: string; author_name?: string; created_at: string }[]).map(c => (
                  <div key={c.id} className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
                      <MessageSquare size={10} />
                      <span className="font-semibold text-foreground/80">{c.author_name || 'Utilisateur'}</span>
                      <span>·</span>
                      <span className="tabular-nums">
                        {new Date(c.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{c.content || c.body}</p>
                  </div>
                ))}
                {commentsCount === 0 && (
                  <p className="text-xs text-muted-foreground italic px-2 py-1.5">Aucun commentaire pour le moment</p>
                )}
              </div>

              {/* Add comment */}
              <div className="flex gap-2 mt-3 pt-3 border-t border-border/30">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                  placeholder="Ajouter un commentaire..."
                  className="gl-form-input flex-1 h-8 px-2 text-sm"
                />
                <button
                  onClick={handleAddComment}
                  disabled={!commentText.trim() || createComment.isPending}
                  className="gl-button-sm gl-button-confirm"
                >
                  <Send size={11} />
                  Envoyer
                </button>
              </div>
            </FormSection>
          </>
        )}

      </PanelContentLayout>
    </DynamicPanelShell>
  )
}
