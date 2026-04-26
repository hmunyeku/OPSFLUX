/**
 * ResolveConflictModal — the actionable conflict resolution dialog.
 *
 * Replaces the old "pick a label + free-text note" modal. The arbitration
 * patterns we observe in real production forecasting emails are:
 *   - delay an activity by N days       → `shift`
 *   - move it to a specific date window → `set_window`
 *   - reduce its constant pax quota     → `set_quota`
 *   - cancel one of the activities      → `cancel`
 *   - approve the overflow as-is        → no action
 *   - defer the decision                → no action
 *
 * The component lets the user pick the resolution label AND the concrete
 * change to apply. The change is sent in the same call — backend mutates
 * the activity, re-detects, and auto-clears any sibling conflicts whose
 * day no longer overflows.
 */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PlannerActivity, PlannerConflict, PlannerConflictApplyAction, ConflictAuditEntry } from '@/types/api'
import { formatDateShort, RESOLUTION_LABELS_FALLBACK } from '../shared'

type Resolution = 'approve_both' | 'reschedule' | 'reduce_pax' | 'cancel' | 'deferred'

/** A virtual cluster of consecutive conflict days on the same asset
 *  with the same set of involved activities. We resolve the cluster
 *  by mutating ONE activity; sibling days auto-clear server-side. */
export interface ConflictCluster {
  /** Stable unique key for React + the modal trigger. */
  key: string
  asset_id: string
  asset_name: string | null
  start_date: string
  end_date: string
  /** Number of conflict-days in the cluster. */
  days: number
  /** Maximum overflow_amount across the cluster. */
  max_overflow: number
  /** Sum of all daily overflows (proxy for total pax-day pain). */
  sum_overflow: number
  activity_ids: string[]
  activity_titles: string[]
  /** All open conflict ids in the cluster (used for bulk-resolve when
   *  no concrete activity action is applied). */
  open_conflict_ids: string[]
  /** First open conflict — the one we'll target with the apply payload. */
  primary_conflict_id: string | null
  /** All conflicts (open + resolved) of the cluster — used for the
   *  expanded per-day view. */
  members: PlannerConflict[]
}

export interface ResolveConflictModalProps {
  cluster: ConflictCluster | null
  /** Look up activities to display titles + dates inside the modal. */
  activitiesById: Map<string, PlannerActivity>
  /** Optional resolution audit history of the primary conflict. */
  audit?: ConflictAuditEntry[] | null
  auditLoading?: boolean
  isPending?: boolean
  onClose: () => void
  /** Called with the selected resolution + optional apply action.
   *  Parent decides whether to call resolveConflict (apply) or
   *  bulkResolveConflicts (no apply, all open ids). */
  onConfirm: (params: {
    resolution: Resolution
    note: string | null
    apply: PlannerConflictApplyAction | null
  }) => void | Promise<void>
}

const RESOLUTION_OPTIONS: Resolution[] = [
  'approve_both',
  'reschedule',
  'reduce_pax',
  'cancel',
  'deferred',
]

/** Map a resolution to the concrete action shape it expects. */
const ACTION_FOR: Record<Resolution, PlannerConflictApplyAction['action'] | null> = {
  approve_both: null,
  reschedule: 'shift',
  reduce_pax: 'set_quota',
  cancel: 'cancel',
  deferred: null,
}

export function ResolveConflictModal({
  cluster,
  activitiesById,
  audit,
  auditLoading,
  isPending,
  onClose,
  onConfirm,
}: ResolveConflictModalProps) {
  const { t } = useTranslation()
  const [resolution, setResolution] = useState<Resolution | ''>('')
  const [note, setNote] = useState('')
  const [pickedActivityId, setPickedActivityId] = useState<string>('')
  // Action params
  const [shiftDays, setShiftDays] = useState<string>('5')
  const [shiftMode, setShiftMode] = useState<'shift' | 'set_window'>('shift')
  const [winStart, setWinStart] = useState<string>('')
  const [winEnd, setWinEnd] = useState<string>('')
  const [newQuota, setNewQuota] = useState<string>('')

  // Reset every form field when the modal switches to a new cluster.
  // We deliberately key on cluster.key only — auto-prefilling values
  // from activitiesById in a separate effect was causing render storms
  // during slow query mounts. The user fills numbers manually; the
  // current values are still shown next to the inputs as a hint.
  useEffect(() => {
    if (!cluster) return
    setResolution('')
    setNote('')
    setShiftDays('5')
    setShiftMode('shift')
    setWinStart('')
    setWinEnd('')
    setNewQuota('')
    setPickedActivityId(cluster.activity_ids[0] ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cluster?.key])

  const action = resolution ? ACTION_FOR[resolution] : null
  const supportsApply = action !== null

  const selectedActivity = pickedActivityId ? activitiesById.get(pickedActivityId) : undefined

  // When the user switches into "set_window" mode, prefill once from
  // the picked activity if the inputs are empty. Same for set_quota.
  // Only runs when the user actively changes mode/resolution → no loop.
  useEffect(() => {
    if (!selectedActivity) return
    if (resolution === 'reschedule' && shiftMode === 'set_window') {
      setWinStart((cur) => cur || (selectedActivity.start_date ?? '').slice(0, 10))
      setWinEnd((cur) => cur || (selectedActivity.end_date ?? '').slice(0, 10))
    }
    if (resolution === 'reduce_pax') {
      setNewQuota((cur) => cur || String(selectedActivity.pax_quota ?? ''))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolution, shiftMode, pickedActivityId])

  const canConfirm = useMemo(() => {
    if (!cluster || !resolution) return false
    if (!supportsApply) return true // approve_both / deferred
    if (!pickedActivityId) return false
    if (resolution === 'reschedule') {
      if (shiftMode === 'shift') {
        const n = Number(shiftDays)
        return Number.isFinite(n) && n !== 0
      }
      return Boolean(winStart || winEnd)
    }
    if (resolution === 'reduce_pax') {
      const n = Number(newQuota)
      return Number.isFinite(n) && n >= 0
    }
    if (resolution === 'cancel') return true
    return true
  }, [cluster, resolution, supportsApply, pickedActivityId, shiftMode, shiftDays, winStart, winEnd, newQuota])

  if (!cluster) return null

  const handleConfirm = () => {
    if (!resolution || !canConfirm) return
    let apply: PlannerConflictApplyAction | null = null
    if (supportsApply && pickedActivityId) {
      if (resolution === 'reschedule') {
        if (shiftMode === 'shift') {
          apply = { activity_id: pickedActivityId, action: 'shift', days: Number(shiftDays) }
        } else {
          apply = {
            activity_id: pickedActivityId,
            action: 'set_window',
            start_date: winStart || null,
            end_date: winEnd || null,
          }
        }
      } else if (resolution === 'reduce_pax') {
        apply = { activity_id: pickedActivityId, action: 'set_quota', pax_quota: Number(newQuota) }
      } else if (resolution === 'cancel') {
        apply = { activity_id: pickedActivityId, action: 'cancel' }
      }
    }
    onConfirm({ resolution, note: note || null, apply })
  }

  const resolutionLabel = (r: Resolution) => RESOLUTION_LABELS_FALLBACK[r] || r

  return (
    <div className="gl-modal-backdrop" onClick={() => !isPending && onClose()}>
      <div
        className="gl-modal-card max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{t('planner.resolve_conflict_title')}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {t('planner.conflict_cluster.subtitle_window', {
                start: formatDateShort(cluster.start_date),
                end: formatDateShort(cluster.end_date),
                days: cluster.days,
              })}
              {' · '}
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                {t('planner.conflict_cluster.max_overflow', { n: cluster.max_overflow })}
              </span>
            </p>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5" title={cluster.activity_titles.join(' · ')}>
              {t('planner.conflict_cluster.subtitle_activities', { names: cluster.activity_titles.join(' · ') })}
            </p>
          </div>
        </div>

        {/* Resolution selector */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            {t('planner.resolve_conflict_field')}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
            {RESOLUTION_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setResolution(r)}
                className={cn(
                  'text-xs px-2 py-1.5 rounded border transition-colors',
                  resolution === r
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:bg-muted/50 text-foreground',
                )}
              >
                {resolutionLabel(r)}
              </button>
            ))}
          </div>
        </div>

        {/* Action panel — appears only when the chosen resolution can
            apply a concrete change (reschedule / reduce_pax / cancel). */}
        {supportsApply && (
          <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
            <div>
              <p className="text-xs font-semibold text-foreground">{t('planner.conflict_action.title')}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{t('planner.conflict_action.subtitle')}</p>
            </div>

            {/* Activity picker */}
            <div>
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground block mb-1">
                {t('planner.conflict_action.pick_activity')}
              </label>
              <div className="space-y-1">
                {cluster.activity_ids.map((aid) => {
                  const a = activitiesById.get(aid)
                  const title = a?.title || cluster.activity_titles[cluster.activity_ids.indexOf(aid)] || aid
                  const subtitle = a
                    ? `${formatDateShort(a.start_date)} → ${formatDateShort(a.end_date)} · ${a.pax_quota ?? '?'} PAX`
                    : ''
                  return (
                    <label
                      key={aid}
                      className={cn(
                        'flex items-start gap-2 px-2 py-1.5 rounded border cursor-pointer text-xs transition-colors',
                        pickedActivityId === aid
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/30',
                      )}
                    >
                      <input
                        type="radio"
                        name="activity-pick"
                        value={aid}
                        checked={pickedActivityId === aid}
                        onChange={() => setPickedActivityId(aid)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-foreground truncate">{title}</div>
                        {subtitle && <div className="text-[10px] text-muted-foreground tabular-nums">{subtitle}</div>}
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Action params */}
            {resolution === 'reschedule' && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setShiftMode('shift')}
                    className={cn(
                      'px-2 py-0.5 rounded border',
                      shiftMode === 'shift' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted/40',
                    )}
                  >
                    {t('planner.conflict_action.shift_label')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShiftMode('set_window')}
                    className={cn(
                      'px-2 py-0.5 rounded border',
                      shiftMode === 'set_window' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted/40',
                    )}
                  >
                    {t('planner.conflict_action.set_window_label')}
                  </button>
                </div>
                {shiftMode === 'shift' ? (
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">{t('planner.conflict_action.shift_help')}</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={shiftDays}
                        onChange={(e) => setShiftDays(e.target.value)}
                        className="w-24 h-7 px-2 text-xs border border-border rounded bg-background"
                      />
                      <span className="text-xs text-muted-foreground">jours</span>
                      <span className="text-[10px] text-muted-foreground/60 ml-2">{t('planner.conflict_action.shift_quick')}:</span>
                      {[-5, 5, 10].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setShiftDays(String(n))}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/40"
                        >
                          {n > 0 ? `+${n}` : n}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">{t('planner.conflict_action.set_window_help')}</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={winStart}
                        onChange={(e) => setWinStart(e.target.value)}
                        className="h-7 px-2 text-xs border border-border rounded bg-background"
                        title={t('planner.conflict_action.set_window_start')}
                      />
                      <span className="text-muted-foreground text-xs">→</span>
                      <input
                        type="date"
                        value={winEnd}
                        onChange={(e) => setWinEnd(e.target.value)}
                        min={winStart || undefined}
                        className="h-7 px-2 text-xs border border-border rounded bg-background"
                        title={t('planner.conflict_action.set_window_end')}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {resolution === 'reduce_pax' && (
              <div>
                <label className="text-[11px] uppercase tracking-wide text-muted-foreground block mb-1">
                  {t('planner.conflict_action.set_quota_label')}
                </label>
                <p className="text-[10px] text-muted-foreground mb-1">{t('planner.conflict_action.set_quota_help')}</p>
                <input
                  type="number"
                  min={0}
                  value={newQuota}
                  onChange={(e) => setNewQuota(e.target.value)}
                  className="w-32 h-7 px-2 text-xs border border-border rounded bg-background"
                />
                {selectedActivity && (
                  <span className="ml-2 text-[10px] text-muted-foreground">
                    (actuel : {selectedActivity.pax_quota ?? '—'} PAX)
                  </span>
                )}
              </div>
            )}

            {resolution === 'cancel' && (
              <p className="text-[11px] text-muted-foreground">{t('planner.conflict_action.cancel_help')}</p>
            )}
          </div>
        )}

        {/* Approve / Defer hints */}
        {resolution === 'approve_both' && (
          <p className="text-[11px] text-muted-foreground">{t('planner.conflict_action.approve_help')}</p>
        )}
        {resolution === 'deferred' && (
          <p className="text-[11px] text-muted-foreground">{t('planner.conflict_action.deferred_help')}</p>
        )}

        {/* Audit history */}
        {audit !== undefined && (
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-muted-foreground">
                {t('planner.resolve_conflict_history')}
              </label>
              {auditLoading && <span className="text-[11px] text-muted-foreground">{t('common.loading')}</span>}
            </div>
            <div className="max-h-32 overflow-y-auto rounded border border-border bg-muted/20 p-2 space-y-1">
              {!auditLoading && (!audit || audit.length === 0) && (
                <p className="text-xs italic text-muted-foreground">
                  {t('planner.resolve_conflict_history_empty')}
                </p>
              )}
              {(audit ?? []).map((entry) => (
                <div key={entry.id} className="rounded bg-background border border-border px-2 py-1 text-[11px]">
                  <p className="font-medium text-foreground truncate">
                    {(entry.actor_name || t('planner.revision_signals.actor_fallback'))} · {formatDateShort(entry.created_at)}
                  </p>
                  <p className="text-muted-foreground truncate">
                    {entry.new_resolution
                      ? `${RESOLUTION_LABELS_FALLBACK[entry.new_resolution] || entry.new_resolution}`
                      : (entry.action || '—')}
                  </p>
                  {entry.resolution_note && (
                    <p className="mt-0.5 text-muted-foreground/80 line-clamp-2">{entry.resolution_note}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Note */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            {t('planner.resolve_conflict_note')}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full min-h-[50px] px-2 py-1.5 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={t('planner.resolve_conflict_note_placeholder')}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 justify-end">
          <button className="gl-button-sm gl-button-default" onClick={onClose} disabled={isPending}>
            {t('common.cancel')}
          </button>
          <button
            className="gl-button-sm gl-button-confirm"
            onClick={handleConfirm}
            disabled={!canConfirm || isPending}
          >
            {isPending ? <Loader2 size={12} className="animate-spin" /> : t('planner.confirm_resolution')}
          </button>
        </div>
      </div>
    </div>
  )
}
