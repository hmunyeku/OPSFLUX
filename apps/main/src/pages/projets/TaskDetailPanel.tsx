/**
 * TaskDetailPanel — Detail view for a project task.
 *
 * Follows the same DynamicPanel design pattern as ProjectDetailPanel:
 * - Header with icon, code, title
 * - Breadcrumb showing full task hierarchy (Project › Parent › Task)
 * - Quick stats row (status, progress, dates, assignee)
 * - FormSection sections with DetailFieldGrid / ReadOnlyRow / InlineEditableRow
 * - Dependencies, Comments, Revision Requests
 *
 * Opened from Gantt chart double-click on a task.
 */
import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Calendar, User, Flag, CheckCircle2, Clock, ListTodo,
  MessageSquare, Link2, ChevronRight, FolderKanban, Loader2,
} from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useProject, useAllProjectTasks, useUpdateProjectTask, useTaskComments, useCreateTaskComment, useTaskDependencies } from '@/hooks/useProjets'
import { useRevisionDecisionRequests, useRespondRevisionDecisionRequest } from '@/hooks/usePlanner'
import { useUsers } from '@/hooks/useUsers'
import { useToast } from '@/components/ui/Toast'
import {
  DynamicPanelShell,
  PanelActionButton,
  PanelContentLayout,
  FormSection,
  DetailFieldGrid,
  ReadOnlyRow,
  InlineEditableRow,
} from '@/components/layout/DynamicPanel'
import type { PlannerRevisionDecisionRequest, ProjectTask } from '@/types/api'

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

// ── Component ───────────────────────────────────────────────────

export function TaskDetailPanel({ projectId, taskId }: { projectId: string; taskId: string }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const updateTask = useUpdateProjectTask()
  const respondRevisionDecisionRequest = useRespondRevisionDecisionRequest()

  // Load project info for breadcrumb
  const { data: project } = useProject(projectId)

  // Load all tasks for this project, find our task
  const { data: tasksData } = useAllProjectTasks({ page: 1, page_size: 500, project_id: projectId })
  const tasks = (tasksData?.items ?? []) as ProjectTask[]
  const task = tasks.find(t => t.id === taskId)
  const childTasks = tasks.filter((t) => t.parent_id === taskId)

  // Ancestry path for breadcrumb
  const ancestry = useMemo(() => task ? buildAncestry(taskId, tasks) : [], [taskId, tasks, task])

  // Comments
  const { data: comments } = useTaskComments(projectId, taskId)
  const createComment = useCreateTaskComment()
  const [commentText, setCommentText] = useState('')

  // Dependencies
  const { data: deps } = useTaskDependencies(projectId)
  const taskDeps = (deps || []).filter((d: { to_task_id: string }) => d.to_task_id === taskId)
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
        onSuccess: () => toast({ title: 'Mis à jour', variant: 'success' }),
        onError: () => toast({ title: 'Erreur', variant: 'error' }),
      },
    )
  }, [projectId, taskId, updateTask, toast])

  const handleAddComment = useCallback(() => {
    if (!commentText.trim()) return
    createComment.mutate(
      { projectId, taskId, payload: { body: commentText.trim() } },
      {
        onSuccess: () => { setCommentText(''); toast({ title: 'Commentaire ajouté', variant: 'success' }) },
        onError: () => toast({ title: 'Erreur', variant: 'error' }),
      },
    )
  }, [projectId, taskId, commentText, createComment, toast])

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

  if (!task) {
    return (
      <DynamicPanelShell title="Tâche" subtitle="Chargement..." icon={<CheckCircle2 size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  const statusInfo = STATUS_MAP[task.status] || { color: '#9ca3af', label: task.status }
  const durationDays = task.start_date && task.due_date
    ? Math.ceil((new Date(task.due_date).getTime() - new Date(task.start_date).getTime()) / 86400000)
    : null

  return (
    <DynamicPanelShell
      title={task.code || taskId.slice(0, 8)}
      subtitle={task.title}
      icon={
        <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: statusInfo.color + '20' }}>
          <CheckCircle2 size={14} style={{ color: statusInfo.color }} />
        </div>
      }
      actions={
        <PanelActionButton
          variant="default"
          icon={<FolderKanban size={12} />}
          onClick={() => openDynamicPanel({ type: 'detail', module: 'projets', id: projectId })}
        >
          Voir le projet
        </PanelActionButton>
      }
    >
      <PanelContentLayout>
        {/* ── Breadcrumb: Projet > Parent > ... > Task ──────── */}
        <div className="flex items-center gap-1 flex-wrap text-[11px] text-muted-foreground px-0.5">
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

        {/* ── Quick info pills ─────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {task.start_date && (
            <div className="flex items-center gap-1">
              <Calendar size={11} />
              {new Date(task.start_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
              {task.due_date && <> → {new Date(task.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</>}
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

        {/* ── Fiche tâche ─────────────────────────────────── */}
        <FormSection title="Fiche tâche" collapsible defaultExpanded storageKey="task-detail-fiche">
          <DetailFieldGrid>
            <InlineEditableRow
              label="Titre"
              value={task.title}
              onSave={(v) => handleSave('title', v)}
              type="text"
            />
            <ReadOnlyRow label="Code" value={<span className="text-sm font-mono font-medium text-foreground">{task.code || '—'}</span>} />
          </DetailFieldGrid>

          <DetailFieldGrid>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Flag size={10} /> Statut
              </label>
              <select
                value={task.status}
                onChange={(e) => handleSave('status', e.target.value)}
                className="w-full h-7 px-2 text-xs border rounded bg-background mt-0.5"
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Flag size={10} /> Priorité
              </label>
              <select
                value={task.priority || 'medium'}
                onChange={(e) => handleSave('priority', e.target.value)}
                className="w-full h-7 px-2 text-xs border rounded bg-background mt-0.5"
              >
                {PRIORITY_OPTIONS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </DetailFieldGrid>

          <DetailFieldGrid>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <User size={10} /> Assigné
              </label>
              <select
                value={task.assignee_id || ''}
                onChange={(e) => handleSave('assignee_id', e.target.value || null)}
                className="w-full h-7 px-2 text-xs border rounded bg-background mt-0.5"
              >
                <option value="">Non assigné</option>
                {(usersData?.items ?? []).map(u => (
                  <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Clock size={10} /> Progression
              </label>
              <div className="flex items-center gap-2 mt-0.5">
                <input
                  type="range" min={0} max={100} step={5}
                  value={task.progress ?? 0}
                  onChange={(e) => handleSave('progress', Number(e.target.value))}
                  className="flex-1 h-1.5 accent-primary"
                />
                <span className="text-xs font-semibold tabular-nums w-8 text-right">{task.progress ?? 0}%</span>
              </div>
            </div>
          </DetailFieldGrid>
        </FormSection>

        {/* ── Planning ─────────────────────────────────────── */}
        <FormSection title="Planning" collapsible defaultExpanded storageKey="task-detail-planning">
          <DetailFieldGrid>
            <ReadOnlyRow label="Début" value={task.start_date ? new Date(task.start_date).toLocaleDateString('fr-FR') : '—'} />
            <ReadOnlyRow label="Échéance" value={task.due_date ? new Date(task.due_date).toLocaleDateString('fr-FR') : '—'} />
          </DetailFieldGrid>
          <DetailFieldGrid>
            <ReadOnlyRow label="Heures estimées" value={task.estimated_hours ? `${task.estimated_hours}h` : '—'} />
            <ReadOnlyRow label="Heures réelles" value={task.actual_hours ? `${task.actual_hours}h` : '—'} />
          </DetailFieldGrid>
          {task.completed_at && (
            <ReadOnlyRow label="Terminé le" value={new Date(task.completed_at).toLocaleDateString('fr-FR')} />
          )}
        </FormSection>

        {/* ── Description ─────────────────────────────────── */}
        <FormSection title="Description" collapsible defaultExpanded={!!task.description} storageKey="task-detail-desc">
          <InlineEditableRow
            label="Description"
            value={task.description || ''}
            onSave={(v) => handleSave('description', v || null)}
            type="text"
          />
        </FormSection>

        {/* ── Sous-tâches ─────────────────────────────────── */}
        {childTasks.length > 0 && (
          <FormSection title={`Sous-tâches (${childTasks.length})`} collapsible defaultExpanded storageKey="task-detail-children">
            <div className="space-y-1">
              {childTasks.map(child => (
                <div
                  key={child.id}
                  className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-muted/40 cursor-pointer transition-colors"
                  onClick={() => openDynamicPanel({ type: 'task-detail', module: 'projets', id: child.id, meta: { projectId } })}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: STATUS_MAP[child.status]?.color || '#9ca3af' }}
                  />
                  <span className="font-medium text-foreground truncate flex-1">{child.title}</span>
                  <span className="text-muted-foreground tabular-nums">{child.progress ?? 0}%</span>
                </div>
              ))}
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
                                    className="rounded border border-border px-1.5 py-0.5 text-[11px] text-foreground hover:bg-muted"
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

        {/* ── Dependencies ─────────────────────────────────── */}
        <FormSection title={`Dépendances (${taskDeps.length})`} collapsible defaultExpanded={taskDeps.length > 0} storageKey="task-detail-deps">
          {taskDeps.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Aucune dépendance</p>
          ) : (
            <div className="space-y-1">
              {taskDeps.map((dep: { id: string; from_task_id: string; dependency_type: string }) => {
                const predTask = tasks.find(t => t.id === dep.from_task_id)
                return (
                  <div
                    key={dep.id}
                    className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-muted/40 cursor-pointer transition-colors"
                    onClick={() => predTask && openDynamicPanel({ type: 'task-detail', module: 'projets', id: predTask.id, meta: { projectId } })}
                  >
                    <Link2 size={10} className="text-muted-foreground" />
                    <span className="font-medium text-foreground">{predTask?.title || dep.from_task_id.slice(0, 8)}</span>
                    <span className="text-muted-foreground ml-auto">({dep.dependency_type})</span>
                  </div>
                )
              })}
            </div>
          )}
        </FormSection>

        {/* ── Comments ─────────────────────────────────────── */}
        <FormSection title={`Commentaires (${(comments as unknown[])?.length || 0})`} collapsible defaultExpanded storageKey="task-detail-comments">
          {/* Comment list */}
          {((comments || []) as unknown as { id: string; content?: string; body?: string; author_name?: string; created_at: string }[]).map(c => (
            <div key={c.id} className="border-b border-border/30 pb-2 mb-2 last:border-0 last:pb-0 last:mb-0">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <MessageSquare size={9} />
                <span className="font-medium">{c.author_name || 'Utilisateur'}</span>
                <span>·</span>
                <span>{new Date(c.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p className="text-xs mt-0.5 text-foreground">{c.content || c.body}</p>
            </div>
          ))}

          {/* Add comment */}
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
              placeholder="Ajouter un commentaire..."
              className="flex-1 h-7 px-2 text-xs border rounded bg-background"
            />
            <button
              onClick={handleAddComment}
              disabled={!commentText.trim() || createComment.isPending}
              className="px-3 h-7 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 font-medium"
            >
              Envoyer
            </button>
          </div>
        </FormSection>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}
