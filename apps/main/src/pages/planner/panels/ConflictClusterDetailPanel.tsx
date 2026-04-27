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
import { AlertTriangle, CheckCircle2, XCircle, Clock, ListChecks, History, FileText, Send } from 'lucide-react'
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
import { plannerService } from '@/services/plannerService'
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

  // ── Read-only mode ────────────────────────────────────────────
  // A cluster is "closed" once every member has been resolved or
  // deferred. The panel then becomes a historical view: no resolution
  // form, no Confirmer action — just summary, the most recent decision
  // surfaced at the top, calendar, audit timeline, and PDF/email.
  // 'partial' clusters keep the editable surface (some members are
  // still open and need a decision).
  const isReadOnly = cluster.status === 'resolved' || cluster.status === 'deferred'

  // Most recent NON-auto audit entry — that's the human-applied
  // resolution we want to surface at the top in read-only mode. We
  // fall back to any entry if the cluster was only auto-cleared.
  const latestDecision = useMemo(() => {
    if (!audit || audit.length === 0) return null
    const sorted = [...audit].sort((a, b) =>
      a.created_at < b.created_at ? 1 : -1,
    )
    return sorted.find((e) => e.context !== 'auto_cleared') ?? sorted[0] ?? null
  }, [audit])

  // PDF + email: download the cluster as A4 portrait PDF, or send it
  // as an attachment. Mirrors the real-world arbitration broadcast we
  // see in operations emails ("voici l'arbitrage de la fenêtre du …").
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const handleDownloadPdf = useCallback(async () => {
    if (!cluster?.primary_conflict_id && cluster?.members.length === 0) return
    const anchorId = cluster.primary_conflict_id || cluster.members[0]?.id
    if (!anchorId) return
    setExportingPdf(true)
    try {
      const blob = await plannerService.exportConflictPdf({ conflict_id: anchorId })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `arbitrage-conflit-${cluster.asset_name?.toLowerCase().replace(/\s+/g, '-') ?? 'asset'}-${cluster.start_date}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: 'PDF généré', variant: 'success' })
    } catch (err) {
      toast({ title: 'Échec génération PDF', description: extractApiError(err), variant: 'error' })
    } finally {
      setExportingPdf(false)
    }
  }, [cluster, toast])

  // Header actions: Cancel / Confirmer follow ScenarioDetailPanel
  // convention — surfaced in the panel toolbar so the user can act
  // without scrolling to a fixed footer.
  const isPending = resolveConflict.isPending || bulkResolveConflicts.isPending
  const actions: ActionItem[] = isReadOnly
    ? [
        {
          id: 'export-pdf',
          label: 'PDF',
          icon: FileText,
          onClick: handleDownloadPdf,
          disabled: exportingPdf,
        },
        {
          id: 'email',
          label: 'Email',
          icon: Send,
          onClick: () => setEmailModalOpen(true),
        },
        {
          id: 'close',
          label: t('common.close', 'Fermer'),
          icon: XCircle,
          onClick: () => closeDynamicPanel(),
        },
      ]
    : [
        {
          id: 'export-pdf',
          label: 'PDF',
          icon: FileText,
          onClick: handleDownloadPdf,
          disabled: exportingPdf,
        },
        {
          id: 'email',
          label: 'Email',
          icon: Send,
          onClick: () => setEmailModalOpen(true),
        },
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
      icon={
        isReadOnly ? (
          <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" />
        ) : (
          <AlertTriangle size={14} className="text-warning" />
        )
      }
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
        </FormSection>

        {/* ── Activités impliquées — promoted to its own section so the
            user immediately sees WHAT is in conflict, and can jump to
            the underlying activity detail panel with one click. */}
        <FormSection title={t('planner.columns.activities_involved')}>
          <div className="space-y-1.5">
            {cluster.activity_ids.map((aid, idx) => {
              const a = activitiesById.get(aid)
              const title = a?.title || cluster.activity_titles[idx] || aid
              const subtitle = a
                ? `${formatDateShort(a.start_date)} → ${formatDateShort(a.end_date)} · ${a.pax_quota ?? '?'} PAX${a.status ? ` · ${a.status}` : ''}`
                : null
              return (
                <button
                  key={aid}
                  type="button"
                  onClick={() => {
                    // Switch the right panel to the activity detail —
                    // standard OpsFlux cross-entity navigation.
                    useUIStore.getState().openDynamicPanel({
                      type: 'detail',
                      module: 'planner',
                      id: aid,
                      meta: { subtype: 'activity' },
                    })
                  }}
                  className={cn(
                    'w-full flex items-start justify-between gap-2 px-3 py-2 rounded border border-border',
                    'bg-background hover:bg-accent/40 hover:border-primary/40 transition-colors',
                    'text-left group',
                  )}
                  title={`Ouvrir « ${title} »`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-foreground group-hover:text-primary truncate">
                      {title}
                    </div>
                    {subtitle && (
                      <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                        {subtitle}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground/60 group-hover:text-primary shrink-0 mt-0.5">
                    Ouvrir →
                  </span>
                </button>
              )
            })}
          </div>
        </FormSection>

        {/* ── Read-only "Résolution appliquée" summary ─────────────
            Surfaced at the top of the form area when the cluster is
            already resolved/deferred so the user immediately sees the
            decision, who applied it and when, plus the note. The full
            audit timeline below preserves the rest of the history. */}
        {isReadOnly && (
          <FormSection title="Résolution appliquée">
            {!latestDecision ? (
              <p className="text-xs italic text-muted-foreground">
                Aucune trace de décision dans l'historique.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="rounded border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Décision
                  </div>
                  <div className="text-emerald-700 dark:text-emerald-300 font-semibold truncate">
                    {latestDecision.new_resolution
                      ? RESOLUTION_LABELS_FALLBACK[latestDecision.new_resolution]
                          ?? latestDecision.new_resolution
                      : '—'}
                  </div>
                </div>
                <div className="rounded border border-border px-2 py-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Appliquée par
                  </div>
                  <div className="text-foreground font-medium truncate">
                    {latestDecision.actor_name ?? '—'}
                  </div>
                </div>
                <div className="rounded border border-border px-2 py-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Date
                  </div>
                  <div className="text-foreground font-medium tabular-nums">
                    {formatDateShort(latestDecision.created_at)}
                  </div>
                </div>
                {latestDecision.resolution_note && (
                  <div className="sm:col-span-3 rounded border border-border bg-background px-2 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Note d'arbitrage
                    </div>
                    <p className="text-foreground/90 whitespace-pre-wrap">
                      {latestDecision.resolution_note}
                    </p>
                  </div>
                )}
              </div>
            )}
          </FormSection>
        )}

        {/* ── Resolution selector ─────────────────────────────── */}
        {!isReadOnly && (
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
        )}

        {/* ── Action panel (contextual) ───────────────────────── */}
        {!isReadOnly && supportsApply && (
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
        {!isReadOnly && (
          <FormSection title={t('planner.resolve_conflict_note')}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={cn(panelInputClass, 'min-h-[60px] resize-y')}
              placeholder={t('planner.resolve_conflict_note_placeholder')}
            />
          </FormSection>
        )}

        {/* ── Per-day breakdown — week-aligned calendar ────────── */}
        <FormSection
          title={(
            <span className="inline-flex items-center gap-1.5">
              <ListChecks size={12} /> Calendrier du conflit ({cluster.members.length} jour{cluster.members.length > 1 ? 's' : ''})
            </span>
          ) as unknown as string}
        >
          <ConflictWeekCalendar cluster={cluster} />
        </FormSection>

        {/* ── Audit history — vertical timeline ───────────────── */}
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
          {audit && audit.length > 0 && (
            // Most-recent-first vertical timeline. The left rail is a
            // 1px line; each entry has a colored dot anchored on it
            // (emerald for auto-clear, primary for manual user actions),
            // followed by the actor / date / resolution / note.
            <ol className="relative pl-4 space-y-2.5">
              <span
                aria-hidden="true"
                className="absolute left-[7px] top-1 bottom-1 w-px bg-border"
              />
              {[...audit]
                .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
                .map((entry) => {
                  const isAuto = entry.context === 'auto_cleared'
                  return (
                    <li key={entry.id} className="relative">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'absolute -left-4 top-1.5 inline-block h-2 w-2 rounded-full ring-2 ring-background',
                          isAuto
                            ? 'bg-emerald-500'
                            : entry.action === 'auto_resolve'
                              ? 'bg-emerald-500'
                              : 'bg-primary',
                        )}
                      />
                      <div className="rounded border border-border bg-background px-2 py-1.5 text-[11px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground truncate">
                            {entry.actor_name || t('planner.revision_signals.actor_fallback')}
                          </span>
                          <span className="text-muted-foreground tabular-nums shrink-0 text-[10px]">
                            {formatDateShort(entry.created_at)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className="text-foreground/80">
                            {entry.new_resolution
                              ? RESOLUTION_LABELS_FALLBACK[entry.new_resolution] || entry.new_resolution
                              : (entry.action || '—')}
                          </span>
                          {isAuto && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                              <Clock size={9} /> auto
                            </span>
                          )}
                          {entry.old_status && entry.new_status && entry.old_status !== entry.new_status && (
                            <span className="text-[10px] text-muted-foreground/60 ml-auto">
                              {entry.old_status} → {entry.new_status}
                            </span>
                          )}
                        </div>
                        {entry.resolution_note && (
                          <p className="mt-1 text-muted-foreground/80 line-clamp-2">
                            {entry.resolution_note}
                          </p>
                        )}
                      </div>
                    </li>
                  )
                })}
            </ol>
          )}
        </FormSection>
      </PanelContentLayout>

      {emailModalOpen && (
        <EmailConflictModal
          cluster={cluster}
          onClose={() => setEmailModalOpen(false)}
          onSent={() => {
            setEmailModalOpen(false)
            toast({ title: 'Email envoyé', variant: 'success' })
          }}
        />
      )}
    </DynamicPanelShell>
  )
}

// ──────────────────────────────────────────────────────────────────────
// EmailConflictModal — minimal recipients/subject/body form. Sends via
// the OpsFlux email system with the cluster's PDF as attachment.
// ──────────────────────────────────────────────────────────────────────
function EmailConflictModal({
  cluster,
  onClose,
  onSent,
}: {
  cluster: ConflictClusterShape
  onClose: () => void
  onSent: () => void
}) {
  const [recipients, setRecipients] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState(
    `[Planner] Arbitrage conflit ${cluster.asset_name ?? ''} ${cluster.start_date} → ${cluster.end_date}`,
  )
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const { toast } = useToast()

  const parseList = (s: string): string[] =>
    s.split(/[,;\s]+/).map((x) => x.trim()).filter((x) => /\S+@\S+\.\S+/.test(x))

  const recipientList = parseList(recipients)
  const ccList = parseList(cc)
  const canSend = recipientList.length > 0 && !sending && !!cluster.primary_conflict_id

  const handleSend = async () => {
    if (!canSend) return
    const anchorId = cluster.primary_conflict_id || cluster.members[0]?.id
    if (!anchorId) return
    setSending(true)
    try {
      await plannerService.emailConflictCluster(anchorId, {
        recipients: recipientList,
        cc: ccList.length > 0 ? ccList : undefined,
        subject: subject || undefined,
        body: body || undefined,
      })
      onSent()
    } catch (err) {
      toast({ title: 'Échec envoi email', description: extractApiError(err), variant: 'error' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="gl-modal-backdrop" onClick={() => !sending && onClose()}>
      <div className="gl-modal-card max-w-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-foreground">Envoyer l'arbitrage par email</h3>
        <p className="text-[11px] text-muted-foreground -mt-1">
          Le PDF de synthèse est joint automatiquement à l'envoi.
        </p>

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Destinataires <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            placeholder="om@perenco.com, projet@perenco.com"
            className={cn('w-full h-8 px-2 text-sm border border-border rounded bg-background')}
          />
          {recipientList.length > 0 && (
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
              {recipientList.length} adresse{recipientList.length > 1 ? 's' : ''} reconnue{recipientList.length > 1 ? 's' : ''}
            </p>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Cc (optionnel)</label>
          <input
            type="text"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="cc@perenco.com"
            className={cn('w-full h-8 px-2 text-sm border border-border rounded bg-background')}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Objet</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={cn('w-full h-8 px-2 text-sm border border-border rounded bg-background')}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Message (optionnel)</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Si laissé vide, un message standard est utilisé."
            className={cn('w-full min-h-[100px] px-2 py-1.5 text-sm border border-border rounded bg-background resize-y')}
          />
        </div>

        <div className="flex items-center gap-2 justify-end">
          <button className="gl-button-sm gl-button-default" onClick={onClose} disabled={sending}>
            Annuler
          </button>
          <button
            className="gl-button-sm gl-button-confirm"
            onClick={handleSend}
            disabled={!canSend}
          >
            <Send size={12} />
            {sending ? 'Envoi…' : 'Envoyer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// ConflictWeekCalendar — week-aligned calendar for the cluster
//
// The previous list-style breakdown (one row per day) didn't help
// the user reason about the *shape* of the overflow window — was it
// 5 contiguous workdays, did it bleed through a weekend, was the
// peak in the first or second week? A calendar makes that legible
// in a glance: each day is a cell, in-cluster days carry the POB
// overflow + a status dot, off-cluster days are muted.
// ──────────────────────────────────────────────────────────────────────
const WEEK_DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const DAY_MS_LOCAL = 86_400_000

function startOfMondayWeek(d: Date): Date {
  // Monday-based week (ISO 8601). getDay returns 0 for Sunday so we
  // shift to make Monday = 0.
  const day = (d.getDay() + 6) % 7
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  out.setDate(out.getDate() - day)
  return out
}

function isoWeekNumber(d: Date): number {
  // ISO week number — Thursday-anchored.
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const diff = (date.getTime() - firstThursday.getTime()) / DAY_MS_LOCAL
  return 1 + Math.round((diff - ((firstThursday.getUTCDay() + 6) % 7)) / 7)
}

function ConflictWeekCalendar({ cluster }: { cluster: ConflictClusterShape }) {
  // Build a quick lookup by ISO-date → conflict member.
  const memberByDate = useMemo(() => {
    const m = new Map<string, typeof cluster.members[number]>()
    for (const c of cluster.members) m.set(c.conflict_date.slice(0, 10), c)
    return m
  }, [cluster.key])

  // Frame the calendar from the Monday of the cluster's first day to
  // the Sunday of the cluster's last day, giving the user the full
  // week context (workdays vs weekend etc.).
  const weeks = useMemo(() => {
    const start = startOfMondayWeek(new Date(cluster.start_date))
    const lastDay = new Date(cluster.end_date)
    // Sunday of last week
    const end = startOfMondayWeek(lastDay)
    end.setDate(end.getDate() + 6)
    const out: { week: number; year: number; days: Date[] }[] = []
    let cursor = new Date(start)
    while (cursor.getTime() <= end.getTime()) {
      const days: Date[] = []
      for (let i = 0; i < 7; i++) {
        const d = new Date(cursor)
        d.setDate(d.getDate() + i)
        days.push(d)
      }
      out.push({ week: isoWeekNumber(cursor), year: cursor.getFullYear(), days })
      cursor = new Date(cursor)
      cursor.setDate(cursor.getDate() + 7)
    }
    return out
  }, [cluster.key, cluster.start_date, cluster.end_date])

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])
  const todayIso = today.toISOString().slice(0, 10)

  // Cell color tone driven by status (open = amber/destructive,
  // resolved = emerald, deferred = warning).
  const cellTone = (status: string) =>
    status === 'open'
      ? 'border-rose-400/60 bg-rose-500/5 text-rose-700 dark:text-rose-300'
      : status === 'resolved'
        ? 'border-emerald-400/60 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
        : status === 'deferred'
          ? 'border-amber-400/60 bg-amber-500/5 text-amber-700 dark:text-amber-300'
          : 'border-border bg-muted/10 text-muted-foreground'

  const dotTone = (status: string) =>
    status === 'open'
      ? 'bg-rose-500'
      : status === 'resolved'
        ? 'bg-emerald-500'
        : status === 'deferred'
          ? 'bg-amber-500'
          : 'bg-muted-foreground/40'

  return (
    <div className="rounded border border-border bg-background overflow-hidden">
      {/* Header — weekday names */}
      <div className="grid grid-cols-[2.5rem_repeat(7,minmax(0,1fr))] text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/20">
        <div className="px-1 py-1.5 text-center border-r border-border">Sem.</div>
        {WEEK_DAYS_FR.map((d, i) => (
          <div
            key={d}
            className={cn(
              'px-1 py-1.5 text-center',
              i === 5 || i === 6 ? 'text-muted-foreground/60' : '',
            )}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map(({ week, year, days }) => (
        <div
          key={`${year}-W${week}`}
          className="grid grid-cols-[2.5rem_repeat(7,minmax(0,1fr))] border-t border-border/60"
        >
          {/* Week column */}
          <div className="px-1 py-1 text-[10px] tabular-nums text-muted-foreground border-r border-border/60 flex items-center justify-center">
            S{String(week).padStart(2, '0')}
          </div>
          {/* Day cells */}
          {days.map((d) => {
            const iso = d.toISOString().slice(0, 10)
            const member = memberByDate.get(iso)
            const isInCluster = !!member
            const isWeekend = d.getDay() === 0 || d.getDay() === 6
            const isToday = iso === todayIso
            return (
              <div
                key={iso}
                title={
                  member
                    ? `${formatDateShort(iso)} · ${
                        member.overflow_amount != null && member.overflow_amount > 0
                          ? `Pic POB +${member.overflow_amount}`
                          : 'sans dépassement'
                      }${member.resolution ? ` · ${RESOLUTION_LABELS_FALLBACK[member.resolution] || member.resolution}` : ''}`
                    : formatDateShort(iso)
                }
                className={cn(
                  'min-h-[52px] px-1 py-1 border-l border-border/40 first:border-l-0 flex flex-col gap-0.5 text-[10px]',
                  isInCluster
                    ? cellTone(member.status)
                    : isWeekend
                      ? 'bg-muted/10 text-muted-foreground/40'
                      : 'text-muted-foreground/70',
                  isToday && 'ring-1 ring-primary/50 ring-inset',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn('tabular-nums font-medium', isToday && 'text-primary')}>
                    {d.getDate()}
                  </span>
                  {isInCluster && (
                    <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', dotTone(member.status))} />
                  )}
                </div>
                {isInCluster && member.overflow_amount != null && member.overflow_amount > 0 && (
                  <div className="text-[10px] font-semibold tabular-nums leading-none mt-0.5">
                    +{member.overflow_amount}
                  </div>
                )}
                {isInCluster && member.resolution && (
                  <div className="text-[9px] truncate leading-none mt-0.5 opacity-80">
                    {RESOLUTION_LABELS_FALLBACK[member.resolution] || member.resolution}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 px-2 py-1.5 border-t border-border/60 text-[10px] text-muted-foreground bg-muted/10">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-rose-500" /> Ouvert
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Résolu
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-amber-500" /> Différé
        </span>
        <span className="inline-flex items-center gap-1 ml-auto">
          Pic POB = dépassement de capacité quotidien
        </span>
      </div>
    </div>
  )
}
