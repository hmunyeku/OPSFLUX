/**
 * WeeklyTimesheetGrid — feuille de temps hebdomadaire en grille (Gouti-style).
 *
 * Lignes : tâches du projet (groupées par groupe parent si présent).
 * Colonnes : 7 jours de la semaine (Lun → Dim).
 * Cellules : heures éditables par double-clic ou tab.
 *
 * Comportement :
 *  - Cellule vide + saisie > 0   → crée un ProjectTimeEntry draft
 *  - Cellule existante + saisie  → patch l'entry (hours + status éventuellement
 *                                  remis à draft si rejected)
 *  - Cellule existante + saisie 0 → delete l'entry
 *  - Bouton "Soumettre la semaine" → submit toutes les entrées draft de la
 *    semaine (loop sur les drafts).
 *
 * Statut des cellules visualisé :
 *  - draft     : fond gris-bleu (border bleu clair)
 *  - submitted : fond jaune (en attente de validation)
 *  - validated : fond vert (verrouillée, plus modifiable)
 *  - rejected  : fond rouge (modifiable, repassera draft à la sauvegarde)
 */
import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Send, Loader2, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import {
  useProjectTasks,
  useProjectMembers,
  useProjectTimeEntries,
  useCreateProjectTimeEntry,
  useUpdateProjectTimeEntry,
  useDeleteProjectTimeEntry,
  useSubmitProjectTimeEntry,
} from '@/hooks/useProjets'
import type { ProjectTask, ProjectTimeEntry } from '@/types/api'

// ── Date helpers (no external dep) ──────────────────────────────────────────

const ISO_DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const

function getMonday(d: Date): Date {
  const day = d.getDay() // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diff = day === 0 ? -6 : 1 - day // shift to Monday
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(d.getDate() + n)
  return copy
}

function fmtISODate(d: Date): string {
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

function fmtDayHeader(d: Date): { label: string; date: string } {
  const dayName = ISO_DAY_LABELS[(d.getDay() + 6) % 7] // Mon-first
  const date = `${d.getDate()}/${(d.getMonth() + 1).toString().padStart(2, '0')}`
  return { label: dayName, date }
}

function isWeekend(d: Date): boolean {
  const w = d.getDay()
  return w === 0 || w === 6
}

function isoWeekNumber(d: Date): number {
  // ISO week: week starts Monday, week 1 = week containing Jan 4
  const target = new Date(d)
  const dayNum = (d.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNum + 3)
  const firstThursday = target.valueOf()
  target.setMonth(0, 1)
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7)
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000)
}

// ── Types ───────────────────────────────────────────────────────────────────

type CellKey = string // `${taskId}|${YYYY-MM-DD}`

interface CellMap {
  [key: CellKey]: ProjectTimeEntry
}

// ── Component ───────────────────────────────────────────────────────────────

export function WeeklyTimesheetGrid({
  projectId,
  weeklyTargetHours = 40,
}: {
  projectId: string
  /** Target hours per week (default 40h = 5 jours × 8h). Used for the X/40 badge. */
  weeklyTargetHours?: number
}) {
  const { t } = useTranslation()
  const currentUser = useAuthStore((s) => s.user)
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()))

  const days = useMemo(
    () => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(weekStart, i)),
    [weekStart],
  )
  const weekEnd = days[6]
  const dateFrom = fmtISODate(weekStart)
  const dateTo = fmtISODate(weekEnd)

  const { data: members } = useProjectMembers(projectId)
  const myMember = useMemo(
    () => members?.find((m) => m.user_id === currentUser?.id),
    [members, currentUser?.id],
  )

  const { data: tasks } = useProjectTasks(projectId)
  const { data: entries } = useProjectTimeEntries(
    projectId,
    myMember
      ? { member_id: myMember.id, date_from: dateFrom, date_to: dateTo }
      : { date_from: dateFrom, date_to: dateTo },
  )

  const cellMap = useMemo<CellMap>(() => {
    const m: CellMap = {}
    for (const e of entries ?? []) {
      m[`${e.task_id ?? 'no-task'}|${e.date}`] = e
    }
    return m
  }, [entries])

  const createEntry = useCreateProjectTimeEntry()
  const updateEntry = useUpdateProjectTimeEntry()
  const deleteEntry = useDeleteProjectTimeEntry()
  const submitEntry = useSubmitProjectTimeEntry()

  const visibleTasks: ProjectTask[] = useMemo(
    () => (tasks ?? []).filter((t) => t.active !== false),
    [tasks],
  )

  // ── Per-day totals + grand total ─────────────────────────────────────────
  const dayTotals = useMemo(() => {
    return days.map((d) => {
      const iso = fmtISODate(d)
      let total = 0
      for (const e of entries ?? []) {
        if (e.date === iso) total += Number(e.hours) || 0
      }
      return total
    })
  }, [days, entries])
  const weekTotal = useMemo(() => dayTotals.reduce((s, n) => s + n, 0), [dayTotals])

  // ── Row totals (per task) ────────────────────────────────────────────────
  const taskTotals = useMemo(() => {
    const out: Record<string, number> = {}
    for (const e of entries ?? []) {
      if (e.task_id) out[e.task_id] = (out[e.task_id] || 0) + (Number(e.hours) || 0)
    }
    return out
  }, [entries])

  // ── Cell write ──────────────────────────────────────────────────────────
  const handleCellChange = useCallback(
    async (taskId: string, dateISO: string, raw: string) => {
      if (!myMember) return
      const parsed = parseFloat((raw || '0').replace(',', '.'))
      const hours = isNaN(parsed) ? 0 : parsed
      const key = `${taskId}|${dateISO}`
      const existing = cellMap[key]

      // Validated entries are locked from edits.
      if (existing && existing.status === 'validated') return

      if (hours <= 0) {
        if (existing) {
          if (existing.status !== 'draft' && existing.status !== 'rejected') return
          await deleteEntry.mutateAsync({ projectId, entryId: existing.id })
        }
        return
      }

      if (existing) {
        // Update
        if (existing.status === 'submitted') return // can't edit submitted; user must wait for approve/reject
        await updateEntry.mutateAsync({
          projectId,
          entryId: existing.id,
          payload: { hours },
        })
      } else {
        // Create draft
        await createEntry.mutateAsync({
          projectId,
          payload: {
            member_id: myMember.id,
            task_id: taskId,
            date: dateISO,
            hours,
          },
        })
      }
    },
    [myMember, cellMap, createEntry, updateEntry, deleteEntry, projectId],
  )

  // ── Submit week (all draft entries) ─────────────────────────────────────
  const drafts = useMemo(
    () => (entries ?? []).filter((e) => e.status === 'draft'),
    [entries],
  )
  const [submittingWeek, setSubmittingWeek] = useState(false)
  const submitWeek = useCallback(async () => {
    if (drafts.length === 0) return
    setSubmittingWeek(true)
    try {
      for (const d of drafts) {
        await submitEntry.mutateAsync({ projectId, entryId: d.id })
      }
    } finally {
      setSubmittingWeek(false)
    }
  }, [drafts, projectId, submitEntry])

  // ── Render ──────────────────────────────────────────────────────────────

  if (!myMember) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-border/50 bg-muted/15 px-3 py-2 text-xs text-muted-foreground">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background/60 text-muted-foreground">
          <Calendar size={13} />
        </span>
        <div className="min-w-0">
          <div className="font-medium text-foreground">{t('projets.timesheet.unavailable_title', 'Feuille de temps indisponible')}</div>
          <div className="text-[11px]">{t('projets.timesheet.unavailable_description', 'Vous devez être membre du projet pour pointer des heures.')}</div>
        </div>
      </div>
    )
  }

  const year = weekStart.getFullYear()
  const week = isoWeekNumber(weekStart)
  const submittedCount = (entries ?? []).filter((e) => e.status === 'submitted').length
  const validatedCount = (entries ?? []).filter((e) => e.status === 'validated').length
  const allValidated = (entries ?? []).length > 0 && validatedCount === (entries ?? []).length

  return (
    <div className="space-y-2">
      {/* Header: week navigation + status + submit */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <div className="grid min-w-0 flex-1 grid-cols-[28px_minmax(0,1fr)_28px] items-center gap-1.5 sm:flex sm:flex-initial">
          <button
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted"
            title={t('projets.timesheet.previous_week', 'Semaine précédente')}
          >
            <ChevronLeft size={14} />
          </button>
          <div className="inline-flex h-7 min-w-0 items-center justify-center gap-1.5 rounded border border-border bg-muted/30 px-2 font-medium sm:min-w-[150px]">
            <Calendar size={12} className="shrink-0 text-muted-foreground" />
            <span className="truncate">{t('projets.timesheet.year', 'Année')} {year}</span>
            <span className="text-muted-foreground">·</span>
            <span className="truncate">{t('projets.timesheet.week', 'Semaine')} {week}</span>
          </div>
          <button
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted"
            title={t('projets.timesheet.next_week', 'Semaine suivante')}
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <button
          onClick={() => setWeekStart(getMonday(new Date()))}
          className="h-7 shrink-0 rounded border border-border px-2 text-xs hover:bg-muted"
        >
          {t('projets.timesheet.this_week', 'Cette semaine')}
        </button>

        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          <span
            className={cn(
              'rounded px-2 py-1 font-medium tabular-nums',
              weekTotal >= weeklyTargetHours
                ? 'bg-green-500/10 text-green-600'
                : weekTotal === 0
                ? 'bg-muted text-muted-foreground'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-500',
            )}
          >
            {weekTotal.toFixed(1)} / {weeklyTargetHours}h
          </span>
          {allValidated ? (
            <span className="px-2 py-1 rounded bg-green-500/10 text-green-700 dark:text-green-500 font-medium">
              {t('projets.timesheet.validated_week', 'Validée')}
            </span>
          ) : submittedCount > 0 ? (
            <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-700 dark:text-blue-400 font-medium">
              {t('projets.timesheet.submitted_waiting', '{{count}} soumis · attente validation', { count: submittedCount })}
            </span>
          ) : (
            <button
              onClick={submitWeek}
              disabled={drafts.length === 0 || submittingWeek}
              className="inline-flex h-7 items-center gap-1 rounded bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              {submittingWeek ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
              {t('projets.timesheet.submit_drafts', 'Soumettre ({{count}})', { count: drafts.length })}
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="hidden overflow-x-auto rounded-md border border-border/40 md:block">
        <table className="text-xs w-full border-collapse">
          <thead>
            <tr className="bg-muted/40">
              <th className="text-left px-2 py-1.5 font-medium text-muted-foreground sticky left-0 bg-muted/40 z-10 min-w-[200px] max-w-[300px] border-r border-border/40">
                {t('projets.timesheet.task', 'Tâche')}
              </th>
              {days.map((d, i) => {
                const h = fmtDayHeader(d)
                return (
                  <th
                    key={i}
                    className={cn(
                      'text-center px-2 py-1.5 font-medium border-l border-border/40 min-w-[70px]',
                      isWeekend(d) ? 'bg-muted/60 text-muted-foreground' : 'text-foreground',
                    )}
                  >
                    <div className="text-[10px] uppercase tracking-wide">{h.label}</div>
                    <div className="text-[10px] text-muted-foreground">{h.date}</div>
                  </th>
                )
              })}
              <th className="text-right px-2 py-1.5 font-medium text-muted-foreground border-l border-border/40 min-w-[60px]">
                {t('projets.timesheet.total', 'Total')}
              </th>
            </tr>
            {/* Day-totals row */}
            <tr className="border-t border-border/40 bg-background">
              <td className="px-2 py-1 sticky left-0 bg-background z-10 text-[11px] font-semibold border-r border-border/40">
                {t('projets.timesheet.total', 'Total')}
              </td>
              {dayTotals.map((t, i) => (
                <td
                  key={i}
                  className={cn(
                    'text-center px-2 py-1 tabular-nums border-l border-border/40 font-semibold',
                    t === 0 ? 'text-muted-foreground/50' : 'text-foreground',
                    isWeekend(days[i]) && 'bg-muted/30',
                  )}
                >
                  {t.toFixed(1)}h
                </td>
              ))}
              <td className="text-right px-2 py-1 tabular-nums border-l border-border/40 font-semibold">
                {weekTotal.toFixed(1)}h
              </td>
            </tr>
          </thead>
          <tbody>
            {visibleTasks.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="text-center text-[11px] text-muted-foreground py-3"
                >
                  {t('projets.timesheet.no_tasks', 'Aucune tâche à pointer sur ce projet.')}
                </td>
              </tr>
            ) : (
              visibleTasks.map((task) => (
                <tr key={task.id} className="border-t border-border/30 hover:bg-muted/10">
                  <td
                    className="px-2 py-1.5 sticky left-0 bg-background z-10 text-foreground truncate max-w-[300px] border-r border-border/40"
                    title={task.title}
                  >
                    <span className="text-[10px] text-muted-foreground font-mono mr-1">
                      [{task.code || task.order}]
                    </span>
                    {task.title}
                  </td>
                  {days.map((d) => {
                    const iso = fmtISODate(d)
                    const cell = cellMap[`${task.id}|${iso}`]
                    return (
                      <TimesheetCell
                        key={iso}
                        cell={cell}
                        weekend={isWeekend(d)}
                        onChange={(raw) => handleCellChange(task.id, iso, raw)}
                      />
                    )
                  })}
                  <td className="text-right px-2 py-1.5 tabular-nums text-muted-foreground border-l border-border/40">
                    {(taskTotals[task.id] || 0).toFixed(1)}h
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 md:hidden">
        <div className="grid grid-cols-7 gap-1 rounded-md border border-border/50 bg-muted/15 p-1.5">
          {days.map((d, i) => {
            const h = fmtDayHeader(d)
            return (
              <div
                key={fmtISODate(d)}
                className={cn(
                  'rounded bg-background/55 px-1 py-1 text-center',
                  isWeekend(d) && 'bg-muted/35 text-muted-foreground',
                )}
              >
                <div className="text-[9px] font-medium uppercase text-muted-foreground">{h.label}</div>
                <div className="text-[10px] tabular-nums text-muted-foreground">{h.date}</div>
                <div className="mt-1 text-[11px] font-semibold tabular-nums text-foreground">{dayTotals[i].toFixed(1)}h</div>
              </div>
            )
          })}
        </div>

        {visibleTasks.length === 0 ? (
          <div className="rounded-md border border-border/40 px-3 py-4 text-center text-[11px] text-muted-foreground">
            {t('projets.timesheet.no_tasks', 'Aucune tâche à pointer sur ce projet.')}
          </div>
        ) : (
          visibleTasks.map((task) => (
            <div key={task.id} className="rounded-md border border-border/50 bg-background/35 p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-foreground">{task.title}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">[{task.code || task.order}]</div>
                </div>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                  {(taskTotals[task.id] || 0).toFixed(1)}h
                </span>
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1">
                {days.map((d) => {
                  const iso = fmtISODate(d)
                  const cell = cellMap[`${task.id}|${iso}`]
                  return (
                    <MobileTimesheetCell
                      key={iso}
                      cell={cell}
                      date={d}
                      weekend={isWeekend(d)}
                      onChange={(raw) => handleCellChange(task.id, iso, raw)}
                    />
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
        <span><span className="inline-block w-2 h-2 rounded-sm bg-muted align-middle mr-1" />{t('projets.timesheet.legend_draft', 'Brouillon')}</span>
        <span><span className="inline-block w-2 h-2 rounded-sm bg-blue-500/40 align-middle mr-1" />{t('projets.timesheet.legend_submitted', 'Soumis')}</span>
        <span><span className="inline-block w-2 h-2 rounded-sm bg-green-500/40 align-middle mr-1" />{t('projets.timesheet.legend_validated', 'Validé')}</span>
        <span><span className="inline-block w-2 h-2 rounded-sm bg-red-500/40 align-middle mr-1" />{t('projets.timesheet.legend_rejected', 'Rejeté')}</span>
        <span className="hidden sm:ml-auto sm:inline">{t('projets.timesheet.shortcuts_hint', 'Tab pour cellule suivante · Entrée pour valider · 0 pour vider')}</span>
      </div>
    </div>
  )
}

// ── Cell ────────────────────────────────────────────────────────────────────

function TimesheetCell({
  cell,
  weekend,
  onChange,
}: {
  cell: ProjectTimeEntry | undefined
  weekend: boolean
  onChange: (raw: string) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<string>(cell ? String(cell.hours) : '')
  const inputRef = useRef<HTMLInputElement>(null)

  // Re-sync when external cell changes (e.g. status changed by approve/reject).
  useEffect(() => {
    setDraft(cell ? String(cell.hours) : '')
  }, [cell?.id, cell?.hours, cell?.status])

  const locked = cell?.status === 'validated' || cell?.status === 'submitted'

  const bg = (() => {
    if (!cell) return weekend ? 'bg-muted/20' : ''
    switch (cell.status) {
      case 'draft':
        return 'bg-muted'
      case 'submitted':
        return 'bg-blue-500/15 text-blue-700 dark:text-blue-400'
      case 'validated':
        return 'bg-green-500/15 text-green-700 dark:text-green-500'
      case 'rejected':
        return 'bg-red-500/15 text-red-700 dark:text-red-500'
      default:
        return ''
    }
  })()

  const tooltip = (() => {
    if (!cell) return weekend ? t('projets.timesheet.weekend', 'Week-end') : t('projets.timesheet.enter_hours', 'Saisir des heures')
    const statusLabel = {
      draft: t('projets.timesheet.status_draft', 'Brouillon'),
      submitted: t('projets.timesheet.status_submitted', 'Soumis pour validation'),
      validated: t('projets.timesheet.status_validated_locked', 'Validé · verrouillé'),
      rejected: cell.rejected_reason
        ? t('projets.timesheet.status_rejected_reason', 'Rejeté : {{reason}}', { reason: cell.rejected_reason })
        : t('projets.timesheet.status_rejected_fix', 'Rejeté · à corriger'),
    }[cell.status]
    return `${cell.hours}h — ${statusLabel}`
  })()

  return (
    <td
      className={cn(
        'p-0 text-center border-l border-border/30 relative',
        bg,
      )}
      title={tooltip}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={draft}
        disabled={locked}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          const cur = cell ? String(cell.hours) : ''
          if (draft !== cur) onChange(draft)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            setDraft(cell ? String(cell.hours) : '')
            e.currentTarget.blur()
          }
        }}
        className={cn(
          'w-full h-7 text-center bg-transparent text-xs tabular-nums border-0 outline-none focus:ring-2 focus:ring-primary/30 rounded',
          locked && 'cursor-not-allowed text-muted-foreground/60',
        )}
        placeholder=""
      />
    </td>
  )
}

function MobileTimesheetCell({
  cell,
  date,
  weekend,
  onChange,
}: {
  cell: ProjectTimeEntry | undefined
  date: Date
  weekend: boolean
  onChange: (raw: string) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<string>(cell ? String(cell.hours) : '')
  const day = fmtDayHeader(date)

  useEffect(() => {
    setDraft(cell ? String(cell.hours) : '')
  }, [cell?.id, cell?.hours, cell?.status])

  const locked = cell?.status === 'validated' || cell?.status === 'submitted'

  const bg = (() => {
    if (!cell) return weekend ? 'bg-muted/25' : 'bg-background/55'
    switch (cell.status) {
      case 'draft':
        return 'bg-muted'
      case 'submitted':
        return 'bg-blue-500/15 text-blue-700 dark:text-blue-400'
      case 'validated':
        return 'bg-green-500/15 text-green-700 dark:text-green-500'
      case 'rejected':
        return 'bg-red-500/15 text-red-700 dark:text-red-500'
      default:
        return 'bg-background/55'
    }
  })()

  const tooltip = (() => {
    if (!cell) return weekend ? t('projets.timesheet.weekend', 'Week-end') : t('projets.timesheet.enter_hours', 'Saisir des heures')
    const statusLabel = {
      draft: t('projets.timesheet.status_draft', 'Brouillon'),
      submitted: t('projets.timesheet.status_submitted', 'Soumis pour validation'),
      validated: t('projets.timesheet.status_validated_locked', 'Validé · verrouillé'),
      rejected: cell.rejected_reason
        ? t('projets.timesheet.status_rejected_reason', 'Rejeté : {{reason}}', { reason: cell.rejected_reason })
        : t('projets.timesheet.status_rejected_fix', 'Rejeté · à corriger'),
    }[cell.status]
    return `${cell.hours}h — ${statusLabel}`
  })()

  return (
    <label className={cn('block rounded border border-border/35 px-1 py-1 text-center', bg)} title={tooltip}>
      <span className="block text-[8px] font-medium uppercase leading-none text-muted-foreground">{day.label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        disabled={locked}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          const cur = cell ? String(cell.hours) : ''
          if (draft !== cur) onChange(draft)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            setDraft(cell ? String(cell.hours) : '')
            e.currentTarget.blur()
          }
        }}
        className={cn(
          'mt-0.5 h-6 w-full rounded bg-transparent text-center text-[11px] tabular-nums outline-none focus:ring-2 focus:ring-primary/30',
          locked && 'cursor-not-allowed text-muted-foreground/60',
        )}
        placeholder="0"
      />
    </label>
  )
}
