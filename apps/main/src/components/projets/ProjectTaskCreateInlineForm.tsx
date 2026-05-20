import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Layers, ListTodo, Loader2, Milestone, X } from 'lucide-react'
import { useCreateProjectTask, useCreateTaskDependency } from '@/hooks/useProjets'
import { useUsers } from '@/hooks/useUsers'
import { useToast } from '@/components/ui/Toast'
import { panelInputClass } from '@/components/layout/DynamicPanel'
import { cn } from '@/lib/utils'
import { VariablePobEditor } from '@/pages/planner/VariablePobEditor'
import type { DependencyType, ProjectTask, ProjectTaskCreate } from '@/types/api'

type CreateMode = 'task' | 'subtask' | 'milestone'

interface ProjectTaskCreateInlineFormProps {
  projectId: string
  mode: CreateMode
  parentTask?: ProjectTask | null
  availableTasks?: ProjectTask[]
  defaultTitle?: string
  onCancel: () => void
  onCreated?: (task: ProjectTask) => void
  className?: string
}

function parseDateKey(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1))
}

function dateKeyFromDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function buildDefaultDaily(startDate: string, endDate: string, value: number): Record<string, number> {
  if (!startDate || !endDate) return {}
  const start = parseDateKey(startDate)
  const end = parseDateKey(endDate)
  if (end < start) return {}
  const out: Record<string, number> = {}
  const current = new Date(start)
  let safety = 0
  while (current <= end && safety < 3650) {
    out[dateKeyFromDate(current)] = Math.max(0, Math.round(value))
    current.setUTCDate(current.getUTCDate() + 1)
    safety += 1
  }
  return out
}

function editorDailyToRelative(daily: Record<string, number>, startDate: string): Record<string, number> {
  if (!startDate) return {}
  const start = parseDateKey(startDate).getTime()
  const out: Record<string, number> = {}
  for (const [dateKey, rawValue] of Object.entries(daily)) {
    const offset = Math.round((parseDateKey(dateKey).getTime() - start) / 86_400_000)
    if (offset >= 0) out[`J${offset + 1}`] = Math.max(0, Math.round(Number(rawValue) || 0))
  }
  return out
}

export function ProjectTaskCreateInlineForm({
  projectId,
  mode,
  parentTask,
  availableTasks = [],
  defaultTitle,
  onCancel,
  onCreated,
  className,
}: ProjectTaskCreateInlineFormProps) {
  const { t } = useTranslation()
  const createTask = useCreateProjectTask()
  const createDependency = useCreateTaskDependency()
  const { toast } = useToast()
  const { data: usersData } = useUsers({ page: 1, page_size: 100, active: true })
  const users = usersData?.items ?? []
  const isSubtask = mode === 'subtask'
  const isMilestone = mode === 'milestone'

  const [form, setForm] = useState({
    title: defaultTitle ?? (isMilestone ? t('projets.inline_create.default_milestone') : isSubtask ? t('projets.inline_create.default_subtask') : t('projets.inline_create.default_task')),
    description: '',
    status: 'todo',
    priority: parentTask?.priority ?? 'medium',
    start_date: isMilestone ? '' : parentTask?.start_date?.slice(0, 10) ?? '',
    due_date: parentTask?.due_date?.slice(0, 10) ?? '',
    assignee_id: parentTask?.assignee_id ?? '',
    estimated_hours: '',
    pob_quota_mode: 'constant' as NonNullable<ProjectTaskCreate['pob_quota_mode']>,
    pob_quota: '',
    pob_quota_daily: {} as Record<string, number>,
    predecessor_id: isMilestone ? parentTask?.id ?? '' : '',
    dependency_type: 'finish_to_start' as DependencyType,
    lag_days: '0',
  })

  const title = isMilestone ? t('projets.inline_create.title_milestone') : isSubtask ? t('projets.inline_create.title_subtask') : t('projets.inline_create.title_task')
  const subtitle = isMilestone
    ? t('projets.inline_create.subtitle_milestone')
    : isSubtask && parentTask
      ? t('projets.inline_create.subtitle_subtask', { title: parentTask.title })
      : t('projets.inline_create.subtitle_task')
  const Icon = isMilestone ? Milestone : isSubtask ? Layers : ListTodo

  const dateRangeInvalid = useMemo(() => {
    if (isMilestone || !form.start_date || !form.due_date) return false
    return new Date(form.start_date).getTime() > new Date(form.due_date).getTime()
  }, [form.start_date, form.due_date, isMilestone])
  const missingRequiredDates = isMilestone ? !form.due_date : (!form.start_date || !form.due_date)
  const variableNeedsDates = !isMilestone && form.pob_quota_mode === 'variable' && (!form.start_date || !form.due_date)
  const variableDailyEmpty = !isMilestone && form.pob_quota_mode === 'variable' && Object.keys(form.pob_quota_daily).length === 0
  const canSubmit = form.title.trim().length > 0
    && !missingRequiredDates
    && !dateRangeInvalid
    && !variableNeedsDates
    && !variableDailyEmpty
    && !createTask.isPending
    && !createDependency.isPending

  useEffect(() => {
    if (isMilestone || form.pob_quota_mode !== 'variable' || !form.start_date || !form.due_date || dateRangeInvalid) return
    if (Object.keys(form.pob_quota_daily).length > 0) return
    const quota = form.pob_quota ? Number(form.pob_quota) : 1
    setForm(prev => ({
      ...prev,
      pob_quota_daily: buildDefaultDaily(prev.start_date, prev.due_date, Number.isFinite(quota) ? quota : 1),
    }))
  }, [dateRangeInvalid, form.due_date, form.pob_quota, form.pob_quota_daily, form.pob_quota_mode, form.start_date, isMilestone])

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const submit = async () => {
    if (!canSubmit) return
    const payload: ProjectTaskCreate = {
      title: form.title.trim(),
      parent_id: isSubtask ? parentTask?.id ?? null : isMilestone ? parentTask?.parent_id ?? null : null,
      description: form.description.trim() || null,
      status: form.status,
      priority: form.priority,
      start_date: isMilestone ? form.due_date : form.start_date || null,
      due_date: form.due_date || null,
      assignee_id: form.assignee_id || null,
      estimated_hours: isMilestone ? 0 : form.estimated_hours ? Number(form.estimated_hours) : null,
      pob_quota_mode: form.pob_quota_mode,
      pob_quota: form.pob_quota ? Number(form.pob_quota) : 0,
      pob_quota_daily: !isMilestone && form.pob_quota_mode === 'variable'
        ? editorDailyToRelative(form.pob_quota_daily, form.start_date)
        : null,
      is_milestone: isMilestone,
    }

    try {
      const created = await createTask.mutateAsync({ projectId, payload })
      if (form.predecessor_id) {
        await createDependency.mutateAsync({
          projectId,
          payload: {
            from_task_id: form.predecessor_id,
            to_task_id: created.id,
            dependency_type: form.dependency_type,
            lag_days: Number(form.lag_days) || 0,
          },
        })
      }
      toast({ title: isMilestone ? t('projets.inline_create.toast_milestone_created') : isSubtask ? t('projets.inline_create.toast_subtask_created') : t('projets.inline_create.toast_task_created'), variant: 'success' })
      onCreated?.(created)
    } catch {
      toast({ title: t('projets.inline_create.toast_create_error'), variant: 'error' })
    }
  }

  return (
    <div className={cn('rounded-lg border border-primary/25 bg-primary/5 p-3 space-y-3', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon size={14} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">{title}</div>
            <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>
          </div>
        </div>
        <button type="button" onClick={onCancel} className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted text-muted-foreground">
          <X size={13} />
        </button>
      </div>

      <div className="grid gap-2 md:grid-cols-[minmax(0,1.4fr)_120px_120px]">
        <input
          value={form.title}
          onChange={(e) => update('title', e.target.value)}
          className={`${panelInputClass} h-9 text-sm font-medium`}
          placeholder={isMilestone ? t('projets.inline_create.placeholder_milestone_name') : isSubtask ? t('projets.inline_create.placeholder_subtask_name') : t('projets.inline_create.placeholder_task_name')}
          autoFocus
        />
        <select value={form.status} onChange={(e) => update('status', e.target.value)} className={`${panelInputClass} h-9 text-xs`}>
          <option value="todo">{t('projets.task_status.todo')}</option>
          <option value="in_progress">{t('projets.task_status.in_progress')}</option>
          <option value="review">{t('projets.task_status.review')}</option>
          <option value="done">{t('projets.task_status.done')}</option>
        </select>
        <select value={form.priority} onChange={(e) => update('priority', e.target.value)} className={`${panelInputClass} h-9 text-xs`}>
          <option value="low">{t('projets.priority.low')}</option>
          <option value="medium">{t('projets.priority.medium')}</option>
          <option value="high">{t('projets.priority.high')}</option>
          <option value="critical">{t('projets.priority.critical')}</option>
        </select>
      </div>

      <textarea
        value={form.description}
        onChange={(e) => update('description', e.target.value)}
        className={`${panelInputClass} min-h-[58px] w-full resize-y text-xs`}
        placeholder={t('projets.inline_create.description_placeholder')}
        rows={2}
      />

      <div className={cn('grid gap-2 sm:grid-cols-2', isMilestone ? 'lg:grid-cols-3' : 'lg:grid-cols-4')}>
        {!isMilestone && (
          <label className="space-y-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('projets.inline_create.start_required')}</span>
            <input type="date" value={form.start_date} onChange={(e) => update('start_date', e.target.value)} className={`${panelInputClass} h-9 w-full text-xs`} />
          </label>
        )}
        <label className="space-y-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{isMilestone ? t('projets.inline_create.milestone_date_required') : t('projets.inline_create.end_required')}</span>
          <input type="date" value={form.due_date} onChange={(e) => update('due_date', e.target.value)} className={`${panelInputClass} h-9 w-full text-xs`} />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('projets.inline_create.assignee')}</span>
          <select value={form.assignee_id} onChange={(e) => update('assignee_id', e.target.value)} className={`${panelInputClass} h-9 w-full text-xs`}>
            <option value="">{t('projets.inline_create.unassigned')}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.first_name} {user.last_name}</option>
            ))}
          </select>
        </label>
        {!isMilestone && (
          <label className="space-y-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('projets.inline_create.estimated_load')}</span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={form.estimated_hours}
              onChange={(e) => update('estimated_hours', e.target.value)}
              className={`${panelInputClass} h-9 w-full text-xs`}
              placeholder="h"
            />
          </label>
        )}
      </div>

      {availableTasks.length > 0 && (
        <div className="grid gap-2 rounded-md border border-border/40 bg-background/40 p-2 sm:grid-cols-[minmax(0,1fr)_110px_86px] sm:items-end">
          <label className="space-y-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('projets.inline_create.predecessor')}</span>
            <select value={form.predecessor_id} onChange={(e) => update('predecessor_id', e.target.value)} className={`${panelInputClass} h-9 w-full text-xs`}>
              <option value="">{t('projets.inline_create.none')}</option>
              {availableTasks.map(task => (
                <option key={task.id} value={task.id}>
                  {task.code ? `${task.code} — ` : ''}{task.title}{task.is_milestone ? ` [${t('projets.inline_create.milestone_short')}]` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('projets.inline_create.link')}</span>
            <select value={form.dependency_type} onChange={(e) => update('dependency_type', e.target.value as DependencyType)} className={`${panelInputClass} h-9 w-full text-xs`}>
              <option value="finish_to_start">FS</option>
              <option value="start_to_start">SS</option>
              <option value="finish_to_finish">FF</option>
              <option value="start_to_finish">SF</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('projets.inline_create.lag')}</span>
            <input type="number" value={form.lag_days} onChange={(e) => update('lag_days', e.target.value)} className={`${panelInputClass} h-9 w-full text-xs`} placeholder="j" />
          </label>
        </div>
      )}

      {!isMilestone && (
        <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 rounded-md border border-border/40 bg-background/40 p-2 sm:grid-cols-[140px_120px_minmax(0,1fr)] sm:items-end">
          <label className="space-y-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">POB</span>
            <select
              value={form.pob_quota_mode}
              onChange={(e) => {
                const mode = e.target.value as typeof form.pob_quota_mode
                setForm(prev => ({
                  ...prev,
                  pob_quota_mode: mode,
                  pob_quota_daily: mode === 'variable'
                    ? buildDefaultDaily(prev.start_date, prev.due_date, prev.pob_quota ? Number(prev.pob_quota) : 1)
                    : {},
                }))
              }}
              className={`${panelInputClass} h-9 w-full text-xs`}
            >
              <option value="constant">{t('projets.inline_create.pob_constant')}</option>
              <option value="variable">{t('projets.inline_create.pob_variable')}</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('projets.inline_create.quota')}</span>
            <input
              type="number"
              min="0"
              value={form.pob_quota}
              onChange={(e) => update('pob_quota', e.target.value)}
              className={`${panelInputClass} h-9 w-full text-xs`}
              placeholder="0"
            />
          </label>
          <p className="col-span-2 text-[11px] text-muted-foreground sm:col-span-1">
            {form.pob_quota_mode === 'variable'
              ? t('projets.inline_create.variable_hint')
              : t('projets.inline_create.constant_hint')}
          </p>
        </div>
      )}

      {!isMilestone && form.pob_quota_mode === 'variable' && form.start_date && form.due_date && !dateRangeInvalid && (
        <div className="rounded-md border border-border/40 bg-background/40 p-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('projets.inline_create.relative_pob_plan')}</span>
            <span className="text-[10px] text-muted-foreground">{t('projets.inline_create.j1_hint')}</span>
          </div>
          <VariablePobEditor
            startDate={form.start_date}
            endDate={form.due_date}
            value={form.pob_quota_daily}
            onChange={(next) => update('pob_quota_daily', next)}
            defaultValue={form.pob_quota ? Number(form.pob_quota) : 1}
            compact
            labelMode="relative"
          />
        </div>
      )}

      {dateRangeInvalid && (
        <p className="text-[11px] font-medium text-red-500">{t('projets.inline_create.error_end_after_start')}</p>
      )}
      {missingRequiredDates && !variableNeedsDates && (
        <p className="text-[11px] font-medium text-red-500">
          {isMilestone ? t('projets.inline_create.error_milestone_date_required') : t('projets.inline_create.error_task_dates_required')}
        </p>
      )}
      {variableNeedsDates && (
        <p className="text-[11px] font-medium text-red-500">{t('projets.inline_create.error_variable_dates_required')}</p>
      )}
      {variableDailyEmpty && !variableNeedsDates && (
        <p className="text-[11px] font-medium text-red-500">{t('projets.inline_create.error_variable_daily_required')}</p>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-border/40 pt-2">
        <button type="button" onClick={onCancel} className="h-8 shrink-0 rounded border border-border px-3 text-xs text-muted-foreground hover:bg-muted">
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:hover:bg-muted"
        >
          {createTask.isPending || createDependency.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {isMilestone ? t('projets.inline_create.submit_milestone') : isSubtask ? t('projets.inline_create.submit_subtask') : t('projets.inline_create.submit_task')}
        </button>
      </div>
    </div>
  )
}
