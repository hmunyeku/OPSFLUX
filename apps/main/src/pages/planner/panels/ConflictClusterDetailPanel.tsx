/**
 * Conflict cluster detail panel — PlannerPage.
 *
 * Replaces the transient ResolveConflictModal with the standard OpsFlux
 * detail-view pattern (DynamicPanelShell + PanelContentLayout +
 * FormSection). Same business logic — the panel is just a permanent
 * surface in the right dock, consistent with how Activities / Scenarios
 * are edited.
 *
 * The cluster shape is passed through `dynamicPanel.data.cluster`
 * (set by ConflitsTab when the user clicks "Résoudre" on a row). On
 * confirm, the panel calls onResolve which mutates server-side and
 * closes itself.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, XCircle, Clock, ListChecks, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DynamicPanelShell,
  PanelContentLayout,
  FormSection,
  DynamicPanelField,
  panelInputClass,
  type ActionItem,
} from '@/components/layout/DynamicPanel'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import {
  useResolveConflict,
  useBulkResolveConflicts,
  useConflictAudit,
  useActivitiesByIds,
} from '@/hooks/usePlanner'
import { usePermission } from '@/hooks/usePermission'
import type { PlannerConflictApplyAction } from '@/types/api'
import {
  formatDateShort,
  RESOLUTION_LABELS_FALLBACK,
  CONFLICT_STATUS_LABELS_FALLBACK,
  CONFLICT_STATUS_BADGES,
  StatusBadge,
  type ConflictClusterShape,
  extractApiError,
} from '../shared'

type Resolution = 'approve_both' | 'reschedule' | 'reduce_pax' | 'cancel' | 'deferred'

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

export function ConflictClusterDetailPanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { hasPermission } = usePermission()
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)

  // Pull the cluster shape passed by ConflitsTab via the panel store.
  // We deliberately keep a local snapshot so the form survives
  // background re-renders of the parent (which doesn't refetch the
  // cluster — it's derived from useConflicts and may briefly disagree
  // mid-mutation).
  const cluster = useMemo<ConflictClusterShape | null>(() => {
    const c = (dynamicPanel?.data as { cluster?: ConflictClusterShape } | undefined)?.cluster
    return c ?? null
  }, [dynamicPanel?.data])

  const resolveConflict = useResolveConflict()
  const bulkResolveConflicts = useBulkResolveConflicts()

  // Audit history of the cluster's primary open conflict.
  const { data: audit, isLoading: auditLoading } = useConflictAudit(cluster?.primary_conflict_id ?? undefined)
  // Live activity data for the picker (current dates / quotas).
  const involvedIds = useMemo(() => cluster?.activity_ids ?? [], [cluster?.key])
  const { byId: activitiesById } = useActivitiesByIds(involvedIds)

  // ── Form state ────────────────────────────────────────────────
  const [resolution, setResolution] = useState<Resolution | ''>('')
  const [note, setNote] = useState('')
  const [pickedActivityId, setPickedActivityId] = useState<string>('')
  const [shiftDays, setShiftDays] = useState<string>('5')
  const [shiftMode, setShiftMode] = useState<'shift' | 'set_window'>('shift')
  const [winStart, setWinStart] = useState<string>('')
  const [winEnd, setWinEnd] = useState<string>('')
  const [newQuota, setNewQuota] = useState<string>('')

  // Reset every form field when the panel switches to a new cluster.
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

  // Pre-fill action params from the picked activity when entering
  // set_window or set_quota mode (idempotent, functional setState).
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
    if (!supportsApply) return true
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
    return true
  }, [cluster, resolution, supportsApply, pickedActivityId, shiftMode, shiftDays, winStart, winEnd, newQuota])

  const handleConfirm = useCallback(async () => {
    if (!cluster || !resolution || !canConfirm) return
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
    try {
      if (apply && cluster.primary_conflict_id) {
        await resolveConflict.mutateAsync({
          id: cluster.primary_conflict_id,
          payload: {
            resolution,
            resolution_note: note || undefined,
            apply,
          },
        })
        toast({
          title: t('planner.toast.conflicts_resolved', {
            count: cluster.open_conflict_ids.length || 1,
          }),
          variant: 'success',
        })
      } else if (cluster.open_conflict_ids.length > 0) {
        const result = await bulkResolveConflicts.mutateAsync(
          cluster.open_conflict_ids.map((id) => ({
            conflict_id: id,
            resolution,
            resolution_note: note || undefined,
          })),
        )
        const errCount = result.errors?.length ?? 0
        toast({
          title: t('planner.toast.conflicts_resolved', { count: result.resolved }),
          description: errCount > 0
            ? t('planner.toast.errors_count', { count: errCount, skipped: result.skipped })
            : undefined,
          variant: errCount > 0 ? 'error' : 'success',
        })
      }
      closeDynamicPanel()
    } catch (err) {
      toast({
        title: t('planner.toast.bulk_resolve_failed'),
        description: extractApiError(err),
        variant: 'error',
      })
    }
  }, [
    cluster, resolution, supportsApply, pickedActivityId, shiftMode, shiftDays,
    winStart, winEnd, newQuota, note, canConfirm,
    resolveConflict, bulkResolveConflicts, toast, t, closeDynamicPanel,
  ])

  // Defensive: if no cluster is in the store, render an empty shell
  // and close. This shouldn't happen in practice — ConflitsTab always
  // injects the cluster — but keeps TS / runtime safe.
  if (!cluster) {
    return (
      <DynamicPanelShell title={t('planner.resolve_conflict_title')} icon={<AlertTriangle size={14} className="text-warning" />}>
        <PanelContentLayout>
          <div className="text-xs italic text-muted-foreground py-6 text-center">
            {t('common.error_generic', 'Aucun conflit sélectionné')}
          </div>
        </PanelContentLayout>
      </DynamicPanelShell>
    )
  }

  // Prevent submit + apply when the user lacks the activity-update
  // permission. Same defence-in-depth as the backend check, just earlier
  // in the UX. Pure resolutions (approve_both / deferred) stay allowed.
  const canApply = hasPermission('planner.activity.update')

  // Header actions: Cancel / Confirmer follow ScenarioDetailPanel
  // convention — surfaced in the panel toolbar so the user can act
  // without scrolling to a fixed footer.
  const isPending = resolveConflict.isPending || bulkResolveConflicts.isPending
  const actions: ActionItem[] = [
    {
      id: 'cancel',
      label: t('common.cancel'),
      icon: XCircle,
      onClick: () => closeDynamicPanel(),
    },
    {
      id: 'confirm',
      label: t('planner.confirm_resolution'),
      icon: CheckCircle2,
      onClick: handleConfirm,
      variant: 'primary',
      disabled: !canConfirm || isPending || (supportsApply && !canApply),
    },
  ]

  const same = cluster.start_date === cluster.end_date
  const headerSubtitle = same
    ? formatDateShort(cluster.start_date)
    : `${formatDateShort(cluster.start_date)} → ${formatDateShort(cluster.end_date)}`

  return (
    <DynamicPanelShell
      title={`${cluster.asset_name ?? 'Conflit'} · ${headerSubtitle}`}
      icon={<AlertTriangle size={14} className="text-warning" />}
      actionItems={actions}
    >
      <PanelContentLayout>
        {/* ── Summary ─────────────────────────────────────────── */}
        <FormSection title={t('planner.conflict_cluster.title', 'Conflit groupé')}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="rounded border border-border px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('planner.columns.conflict_date')}</div>
              <div className="text-foreground font-medium tabular-nums">{headerSubtitle}</div>
            </div>
            <div className="rounded border border-border px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Durée</div>
              <div className="text-foreground font-medium tabular-nums">
                {cluster.days <= 1
                  ? t('planner.conflict_cluster.single_day', '1 jour')
                  : t('planner.conflict_cluster.n_days', { count: cluster.days })}
              </div>
            </div>
            <div className="rounded border border-border px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('planner.columns.type')}</div>
              <div className="text-amber-600 dark:text-amber-400 font-semibold tabular-nums">
                {t('planner.conflict_cluster.max_overflow', { n: cluster.max_overflow })}
              </div>
            </div>
            <div className="rounded border border-border px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('planner.columns.status')}</div>
              <div>
                {cluster.status === 'partial' ? (
                  <span className="gl-badge gl-badge-warning">Partiel</span>
                ) : (
                  <StatusBadge
                    status={cluster.status}
                    labels={CONFLICT_STATUS_LABELS_FALLBACK}
                    badges={CONFLICT_STATUS_BADGES}
                  />
                )}
              </div>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            <span className="text-muted-foreground/70 mr-1">{t('planner.columns.activities_involved')}:</span>
            {cluster.activity_titles.join(' · ')}
          </div>
        </FormSection>

        {/* ── Resolution selector ─────────────────────────────── */}
        <FormSection title={t('planner.resolve_conflict_field')}>
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
                {RESOLUTION_LABELS_FALLBACK[r] || r}
              </button>
            ))}
          </div>
          {resolution === 'approve_both' && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t('planner.conflict_action.approve_help')}
            </p>
          )}
          {resolution === 'deferred' && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t('planner.conflict_action.deferred_help')}
            </p>
          )}
        </FormSection>

        {/* ── Action panel (contextual) ───────────────────────── */}
        {supportsApply && (
          <FormSection title={t('planner.conflict_action.title', "Action sur l'activité")}>
            <p className="text-[11px] text-muted-foreground -mt-1 mb-2">
              {t('planner.conflict_action.subtitle')}
            </p>
            {!canApply && (
              <div className="text-[11px] text-rose-600 dark:text-rose-400 bg-rose-500/5 border border-rose-500/30 rounded px-2 py-1.5 mb-2">
                Vous n&apos;avez pas la permission <code className="font-mono">planner.activity.update</code> pour appliquer une action concrète.
              </div>
            )}

            {/* Activity picker */}
            <DynamicPanelField label={t('planner.conflict_action.pick_activity')} span="full">
              <div className="space-y-1">
                {cluster.activity_ids.map((aid) => {
                  const a = activitiesById.get(aid)
                  const idx = cluster.activity_ids.indexOf(aid)
                  const title = a?.title || cluster.activity_titles[idx] || aid
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
                        name="cluster-activity-pick"
                        value={aid}
                        checked={pickedActivityId === aid}
                        onChange={() => setPickedActivityId(aid)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-foreground truncate">{title}</div>
                        {subtitle && (
                          <div className="text-[10px] text-muted-foreground tabular-nums">{subtitle}</div>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
            </DynamicPanelField>

            {/* Reschedule sub-panel */}
            {resolution === 'reschedule' && (
              <DynamicPanelField label={t('planner.conflict_action.shift_label', 'Décalage')} span="full">
                <div className="flex items-center gap-1.5 text-[10px] mb-2">
                  <button
                    type="button"
                    onClick={() => setShiftMode('shift')}
                    className={cn(
                      'px-2 py-0.5 rounded border',
                      shiftMode === 'shift' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted/40',
                    )}
                  >
                    {t('planner.conflict_action.shift_label', 'Décaler de N jours')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShiftMode('set_window')}
                    className={cn(
                      'px-2 py-0.5 rounded border',
                      shiftMode === 'set_window' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted/40',
                    )}
                  >
                    {t('planner.conflict_action.set_window_label', 'Nouvelle fenêtre')}
                  </button>
                </div>
                {shiftMode === 'shift' ? (
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">
                      {t('planner.conflict_action.shift_help', 'Positif = repousser, négatif = avancer')}
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={shiftDays}
                        onChange={(e) => setShiftDays(e.target.value)}
                        className={cn(panelInputClass, 'w-24 h-7')}
                      />
                      <span className="text-xs text-muted-foreground">jours</span>
                      <span className="text-[10px] text-muted-foreground/60 ml-2">
                        {t('planner.conflict_action.shift_quick', 'Raccourcis')}:
                      </span>
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
                    <p className="text-[10px] text-muted-foreground mb-1">
                      {t('planner.conflict_action.set_window_help')}
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={winStart}
                        onChange={(e) => setWinStart(e.target.value)}
                        className={cn(panelInputClass, 'h-7')}
                        title={t('planner.conflict_action.set_window_start')}
                      />
                      <span className="text-muted-foreground text-xs">→</span>
                      <input
                        type="date"
                        value={winEnd}
                        onChange={(e) => setWinEnd(e.target.value)}
                        min={winStart || undefined}
                        className={cn(panelInputClass, 'h-7')}
                        title={t('planner.conflict_action.set_window_end')}
                      />
                    </div>
                  </div>
                )}
              </DynamicPanelField>
            )}

            {/* Reduce pax sub-panel */}
            {resolution === 'reduce_pax' && (
              <DynamicPanelField label={t('planner.conflict_action.set_quota_label', 'Nouveau quota PAX')} span="full">
                <p className="text-[10px] text-muted-foreground mb-1">
                  {t('planner.conflict_action.set_quota_help')}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={newQuota}
                    onChange={(e) => setNewQuota(e.target.value)}
                    className={cn(panelInputClass, 'w-32 h-7')}
                  />
                  {selectedActivity && (
                    <span className="text-[10px] text-muted-foreground">
                      (actuel : {selectedActivity.pax_quota ?? '—'} PAX)
                    </span>
                  )}
                </div>
              </DynamicPanelField>
            )}

            {/* Cancel sub-panel */}
            {resolution === 'cancel' && (
              <p className="text-[11px] text-muted-foreground mt-2">
                {t('planner.conflict_action.cancel_help')}
              </p>
            )}
          </FormSection>
        )}

        {/* ── Note ────────────────────────────────────────────── */}
        <FormSection title={t('planner.resolve_conflict_note')}>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={cn(panelInputClass, 'min-h-[60px] resize-y')}
            placeholder={t('planner.resolve_conflict_note_placeholder')}
          />
        </FormSection>

        {/* ── Per-day breakdown ───────────────────────────────── */}
        <FormSection
          title={(
            <span className="inline-flex items-center gap-1.5">
              <ListChecks size={12} /> Détail jour par jour ({cluster.members.length})
            </span>
          ) as unknown as string}
        >
          <div className="max-h-44 overflow-y-auto rounded border border-border bg-muted/10 divide-y divide-border/60">
            {cluster.members.map((m) => (
              <div key={m.id} className="px-2 py-1 flex items-center justify-between text-[11px]">
                <span className="tabular-nums text-foreground">{formatDateShort(m.conflict_date)}</span>
                <span className="text-muted-foreground">
                  {m.overflow_amount != null && m.overflow_amount > 0 ? `+${m.overflow_amount}` : '—'}
                </span>
                <span className="text-muted-foreground/70 truncate ml-2 max-w-[40%]">
                  {m.resolution ? RESOLUTION_LABELS_FALLBACK[m.resolution] || m.resolution : '—'}
                </span>
                <StatusBadge
                  status={m.status}
                  labels={CONFLICT_STATUS_LABELS_FALLBACK}
                  badges={CONFLICT_STATUS_BADGES}
                />
              </div>
            ))}
          </div>
        </FormSection>

        {/* ── Audit history ───────────────────────────────────── */}
        <FormSection
          title={(
            <span className="inline-flex items-center gap-1.5">
              <History size={12} /> {t('planner.resolve_conflict_history')}
            </span>
          ) as unknown as string}
        >
          {auditLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
          {!auditLoading && (!audit || audit.length === 0) && (
            <p className="text-xs italic text-muted-foreground">
              {t('planner.resolve_conflict_history_empty')}
            </p>
          )}
          <div className="space-y-1.5">
            {(audit ?? []).map((entry) => (
              <div key={entry.id} className="rounded border border-border bg-background/50 px-2 py-1.5 text-[11px]">
                <p className="font-medium text-foreground truncate">
                  {(entry.actor_name || t('planner.revision_signals.actor_fallback'))} · {formatDateShort(entry.created_at)}
                </p>
                <p className="text-muted-foreground truncate">
                  {entry.new_resolution
                    ? RESOLUTION_LABELS_FALLBACK[entry.new_resolution] || entry.new_resolution
                    : (entry.action || '—')}
                  {entry.context === 'auto_cleared' && (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                      <Clock size={9} /> auto
                    </span>
                  )}
                </p>
                {entry.resolution_note && (
                  <p className="mt-0.5 text-muted-foreground/80 line-clamp-2">{entry.resolution_note}</p>
                )}
              </div>
            ))}
          </div>
        </FormSection>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}
