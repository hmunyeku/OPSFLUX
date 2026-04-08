/**
 * TaskDetailPanel — Detail view for a project task.
 *
 * Shows: title (editable), status, priority, dates, assignee, progress,
 * description, deliverables count, comments.
 * Opened from Gantt chart double-click on a task.
 */
import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Calendar, User, Flag, CheckCircle2, Clock,
  MessageSquare, Link2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { useAllProjectTasks, useUpdateProjectTask, useTaskComments, useCreateTaskComment, useTaskDependencies } from '@/hooks/useProjets'
import { useUsers } from '@/hooks/useUsers'
import { useToast } from '@/components/ui/Toast'
import { DynamicPanelShell, PanelActionButton, FormSection, ReadOnlyRow, InlineEditableRow } from '@/components/layout/DynamicPanel'
import type { ProjectTask } from '@/types/api'

// ── Status/Priority labels ──────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  todo: 'À faire', in_progress: 'En cours', review: 'Revue', done: 'Terminé', cancelled: 'Annulé',
}
const STATUS_COLORS: Record<string, string> = {
  todo: '#9ca3af', in_progress: '#3b82f6', review: '#eab308', done: '#22c55e', cancelled: '#ef4444',
}
const PRIORITY_LABELS: Record<string, string> = {
  low: 'Basse', medium: 'Moyenne', high: 'Haute', critical: 'Critique',
}

// ── Component ───────────────────────────────────────────────────

export function TaskDetailPanel({ projectId, taskId }: { projectId: string; taskId: string }) {
  useTranslation()
  const { toast } = useToast()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const updateTask = useUpdateProjectTask()

  // Load all tasks for this project, find our task
  const { data: tasksData } = useAllProjectTasks({ page: 1, page_size: 500, project_id: projectId })
  const tasks = (tasksData?.items ?? []) as ProjectTask[]
  const task = tasks.find(t => t.id === taskId)

  // Comments
  const { data: comments } = useTaskComments(projectId, taskId)
  const createComment = useCreateTaskComment()
  const [commentText, setCommentText] = useState('')

  // Dependencies
  const { data: deps } = useTaskDependencies(projectId)
  const taskDeps = (deps || []).filter((d: { to_task_id: string }) => d.to_task_id === taskId)

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

  if (!task) {
    return (
      <DynamicPanelShell title="Tâche" subtitle="Chargement...">
        <div className="p-4 text-center text-muted-foreground text-sm">
          Chargement de la tâche...
        </div>
      </DynamicPanelShell>
    )
  }

  const statusColor = STATUS_COLORS[task.status] || '#9ca3af'

  return (
    <DynamicPanelShell
      title={task.title}
      subtitle={task.code || `Tâche du projet`}
      icon={
        <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: statusColor + '20' }}>
          <CheckCircle2 size={14} style={{ color: statusColor }} />
        </div>
      }
      actions={
        <PanelActionButton
          variant="default"
          onClick={() => openDynamicPanel({ type: 'detail', module: 'projets', id: projectId })}
        >
          Voir le projet
        </PanelActionButton>
      }
    >
      <div className="p-4 space-y-4">

        {/* ── Status + Priority badges ──────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-xs px-2.5 py-1 rounded-full font-medium"
            style={{ backgroundColor: statusColor + '18', color: statusColor }}
          >
            {STATUS_LABELS[task.status] || task.status}
          </span>
          {task.priority && (
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium',
              task.priority === 'critical' ? 'bg-red-100 text-red-700' :
              task.priority === 'high' ? 'bg-orange-100 text-orange-700' :
              task.priority === 'medium' ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-600',
            )}>
              {PRIORITY_LABELS[task.priority] || task.priority}
            </span>
          )}
          {task.progress != null && (
            <div className="flex items-center gap-1.5 ml-auto">
              <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${task.progress}%`, backgroundColor: statusColor }} />
              </div>
              <span className="text-xs font-semibold tabular-nums">{task.progress}%</span>
            </div>
          )}
        </div>

        {/* ── Editable fields ──────────────────────────────── */}
        <FormSection title="Détails" collapsible defaultExpanded storageKey="task-detail-fields">
          <InlineEditableRow
            label="Titre"
            value={task.title}
            onSave={(v) => handleSave('title', v)}
            type="text"
          />
          <ReadOnlyRow label="Code" value={task.code || '—'} />

          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Calendar size={10} /> Début
              </span>
              <InlineEditableRow
                label=""
                value={task.start_date ? new Date(task.start_date).toLocaleDateString('fr-FR') : '—'}
                onSave={(v) => handleSave('start_date', v)}
                type="text"
              />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Calendar size={10} /> Fin
              </span>
              <InlineEditableRow
                label=""
                value={task.due_date ? new Date(task.due_date).toLocaleDateString('fr-FR') : '—'}
                onSave={(v) => handleSave('due_date', v)}
                type="text"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Flag size={10} /> Statut
              </span>
              <select
                value={task.status}
                onChange={(e) => handleSave('status', e.target.value)}
                className="w-full h-7 px-2 text-xs border rounded bg-background mt-0.5"
              >
                {Object.entries(STATUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Flag size={10} /> Priorité
              </span>
              <select
                value={task.priority || 'medium'}
                onChange={(e) => handleSave('priority', e.target.value)}
                className="w-full h-7 px-2 text-xs border rounded bg-background mt-0.5"
              >
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Assignee */}
          <div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <User size={10} /> Assigné
            </span>
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

          {/* Progress */}
          <div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Clock size={10} /> Progression
            </span>
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

          {/* Description */}
          <InlineEditableRow
            label="Description"
            value={task.description || ''}
            onSave={(v) => handleSave('description', v || null)}
            type="text"
          />

          {/* Hours */}
          <div className="grid grid-cols-2 gap-x-4">
            <ReadOnlyRow label="Heures estimées" value={task.estimated_hours ? `${task.estimated_hours}h` : '—'} />
            <ReadOnlyRow label="Heures réelles" value={task.actual_hours ? `${task.actual_hours}h` : '—'} />
          </div>
        </FormSection>

        {/* ── Dependencies ─────────────────────────────────── */}
        <FormSection title={`Dépendances (${taskDeps.length})`} collapsible defaultExpanded={false} storageKey="task-detail-deps">
          {taskDeps.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Aucune dépendance</p>
          ) : (
            <div className="space-y-1">
              {taskDeps.map((dep: { id: string; from_task_id: string; dependency_type: string }) => {
                const predTask = tasks.find(t => t.id === dep.from_task_id)
                return (
                  <div key={dep.id} className="flex items-center gap-2 text-xs">
                    <Link2 size={10} className="text-muted-foreground" />
                    <span className="font-medium">{predTask?.title || dep.from_task_id.slice(0, 8)}</span>
                    <span className="text-muted-foreground">({dep.dependency_type})</span>
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
            <div key={c.id} className="border-b border-border/30 pb-2 mb-2">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <MessageSquare size={9} />
                <span className="font-medium">{c.author_name || 'Utilisateur'}</span>
                <span>·</span>
                <span>{new Date(c.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p className="text-xs mt-0.5">{c.content || c.body}</p>
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
              className="px-2 h-7 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              Envoyer
            </button>
          </div>
        </FormSection>
      </div>
    </DynamicPanelShell>
  )
}
