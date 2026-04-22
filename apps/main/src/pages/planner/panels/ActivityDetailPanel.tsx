/**
 * Activity detail panel — PlannerPage.
 *
 * Extracted from the monolithic PlannerPage.tsx. Behavior preserved 1:1.
 * Includes the inline-editable DependencyRow helper.
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CalendarRange, Users, CheckCircle2, XCircle, Send, Ban, Pencil, Trash2, Link2, Loader2,
  Repeat, ArrowUpDown, Plus, Info, Paperclip, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { normalizeNames } from '@/lib/normalize'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import {
  DynamicPanelShell,
  PanelContentLayout,
  FormSection,
  FormGrid,
  DetailFieldGrid,
  ReadOnlyRow,
  SectionColumns,
  DynamicPanelField,
  InlineEditableRow,
  panelInputClass,
  type ActionItem,
} from '@/components/layout/DynamicPanel'
import { TabBar } from '@/components/ui/Tabs'
import { VariablePobEditor } from '../VariablePobEditor'
import { TagManager } from '@/components/shared/TagManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { ActivityPicker } from '@/components/shared/ActivityPicker'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { plannerService } from '@/services/plannerService'
import { useConfirm, usePromptInput } from '@/components/ui/ConfirmDialog'
import {
  useActivity,
  useUpdateActivity,
  useDeleteActivity,
  useSubmitActivity,
  useValidateActivity,
  useRejectActivity,
  useCancelActivity,
  useActivityDependencies,
  useAddDependency,
  useRemoveDependency,
  useImpactPreview,
  useOverridePriority,
  useSetRecurrence,
  useDeleteRecurrence,
} from '@/hooks/usePlanner'
import { usePermission } from '@/hooks/usePermission'
import type { PlannerDependency } from '@/types/api'
import {
  ACTIVITY_STATUS_LABELS_FALLBACK,
  ACTIVITY_STATUS_BADGES,
  ACTIVITY_TYPE_LABELS_FALLBACK,
  ACTIVITY_TYPE_META,
  PRIORITY_LABELS_FALLBACK,
  PRIORITY_CLASS_MAP,
  DEP_TYPE_LABELS_FALLBACK,
  PLANNER_ACTIVITY_TYPE_VALUES,
  PLANNER_PRIORITY_VALUES,
  PLANNER_DEP_TYPE_VALUES,
  buildDictionaryOptions,
  formatDateShort,
  formatVariablePaxRange,
  extractApiError,
} from '../shared'

// ── Inline-editable dependency row ─────────────────────────────────
// Lag is stored as days in the backend; the UI lets the user pick a unit
// (jours / semaines / mois) and converts on the fly. 1 month = 30 days for
// scheduling purposes.

type LagUnit = 'd' | 'w' | 'm'
const LAG_UNIT_DAYS: Record<LagUnit, number> = { d: 1, w: 7, m: 30 }
const LAG_UNIT_LABELS: Record<LagUnit, string> = { d: 'jours', w: 'semaines', m: 'mois' }

/** Pick the most natural unit for an existing day count (e.g. 14 → "2 semaines") */
function pickLagUnit(days: number): { unit: LagUnit; value: number } {
  const abs = Math.abs(days)
  if (abs > 0 && abs % 30 === 0) return { unit: 'm', value: days / 30 }
  if (abs > 0 && abs % 7 === 0) return { unit: 'w', value: days / 7 }
  return { unit: 'd', value: days }
}

interface DependencyRowProps {
  dep: PlannerDependency
  currentActivityId: string
  dependencyTypeOptions: { value: string; label: string }[]
  onDelete: (depId: string) => void
  onUpdate: (
    depId: string,
    payload: { predecessor_id: string; successor_id: string; dependency_type: string; lag_days: number },
  ) => void
  isPending?: boolean
}

function DependencyRow({ dep, currentActivityId, dependencyTypeOptions, onDelete, onUpdate, isPending }: DependencyRowProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)

  const isCurrentPredecessor = dep.predecessor_id === currentActivityId
  const otherActivityId = isCurrentPredecessor ? dep.successor_id : dep.predecessor_id
  const otherActivityTitle = isCurrentPredecessor ? dep.successor_title : dep.predecessor_title
  const role = isCurrentPredecessor ? 'Successeur' : 'Prédécesseur'

  const initialLag = pickLagUnit(dep.lag_days)
  const [draftOtherId, setDraftOtherId] = useState<string>(otherActivityId)
  const [draftType, setDraftType] = useState<string>(dep.dependency_type)
  const [draftLagValue, setDraftLagValue] = useState<number>(initialLag.value)
  const [draftLagUnit, setDraftLagUnit] = useState<LagUnit>(initialLag.unit)

  const startEdit = () => {
    const fresh = pickLagUnit(dep.lag_days)
    setDraftOtherId(otherActivityId)
    setDraftType(dep.dependency_type)
    setDraftLagValue(fresh.value)
    setDraftLagUnit(fresh.unit)
    setEditing(true)
  }

  const save = () => {
    const lagDays = Math.round(draftLagValue * LAG_UNIT_DAYS[draftLagUnit])
    const newPredecessor = isCurrentPredecessor ? currentActivityId : draftOtherId
    const newSuccessor = isCurrentPredecessor ? draftOtherId : currentActivityId
    const changed =
      newPredecessor !== dep.predecessor_id ||
      newSuccessor !== dep.successor_id ||
      draftType !== dep.dependency_type ||
      lagDays !== dep.lag_days
    if (changed) {
      onUpdate(dep.id, {
        predecessor_id: newPredecessor,
        successor_id: newSuccessor,
        dependency_type: draftType,
        lag_days: lagDays,
      })
    }
    setEditing(false)
  }

  const lagDisplay = (() => {
    if (dep.lag_days === 0) return null
    const { unit, value } = pickLagUnit(dep.lag_days)
    const sign = value > 0 ? '+' : ''
    const u = unit === 'd' ? 'j' : unit === 'w' ? 'sem' : 'mois'
    return `${sign}${value} ${u}`
  })()

  if (editing) {
    return (
      <div className="space-y-2 p-2 rounded border border-primary/50 bg-primary/5 text-xs">
        <div className="flex items-center gap-2">
          <Link2 size={11} className="text-primary shrink-0" />
          <span className="text-[10px] uppercase font-semibold text-primary tracking-wide">{role}</span>
          <span className="text-[10px] text-muted-foreground">— activité liée</span>
        </div>
        <ActivityPicker
          value={draftOtherId || null}
          onChange={(actId) => setDraftOtherId(actId || '')}
          excludeId={currentActivityId}
          label={undefined}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex flex-col">
            <label className="text-[9px] uppercase text-muted-foreground tracking-wide">Type</label>
            <select
              value={draftType}
              onChange={(e) => setDraftType(e.target.value)}
              className="h-7 px-1.5 text-xs border border-border rounded bg-background"
              disabled={isPending}
            >
              {dependencyTypeOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-[9px] uppercase text-muted-foreground tracking-wide">Délai</label>
            <input
              type="number"
              value={draftLagValue}
              onChange={(e) => setDraftLagValue(parseInt(e.target.value) || 0)}
              className="w-20 h-7 px-1.5 text-xs border border-border rounded bg-background tabular-nums"
              placeholder="0"
              disabled={isPending}
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[9px] uppercase text-muted-foreground tracking-wide">Unité</label>
            <select
              value={draftLagUnit}
              onChange={(e) => setDraftLagUnit(e.target.value as LagUnit)}
              className="h-7 px-1.5 text-xs border border-border rounded bg-background"
              disabled={isPending}
            >
              {(Object.keys(LAG_UNIT_LABELS) as LagUnit[]).map((u) => (
                <option key={u} value={u}>{LAG_UNIT_LABELS[u]}</option>
              ))}
            </select>
          </div>
          <div className="ml-auto flex items-center gap-1 self-end">
            <button
              onClick={save}
              disabled={isPending || !draftOtherId}
              className="gl-button-sm gl-button-confirm"
            >
              Enregistrer
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={isPending}
              className="px-2 py-1 text-[11px] rounded border border-border"
            >
              Annuler
            </button>
          </div>
        </div>
        <p className="text-[9px] text-muted-foreground">
          Délai positif = retard sur le lien · négatif = chevauchement. La valeur est convertie en jours côté serveur.
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded border border-border/50 text-xs hover:bg-muted/30 transition-colors">
      <Link2 size={11} className="text-muted-foreground shrink-0" />
      <span className="text-[10px] uppercase text-muted-foreground tracking-wide w-[78px] shrink-0">{role}</span>
      <span className="font-medium text-foreground truncate flex-1" title={otherActivityTitle || otherActivityId}>
        {otherActivityTitle || otherActivityId.slice(0, 8) + '…'}
      </span>
      <span className="gl-badge gl-badge-neutral text-[10px]" title="Type de dépendance">{dep.dependency_type}</span>
      {lagDisplay && (
        <span className="text-muted-foreground text-[10px] tabular-nums" title="Délai (lag)">{lagDisplay}</span>
      )}
      <button
        onClick={startEdit}
        className="gl-button gl-button-confirm"
        title={t('common.edit')}
      >
        <Pencil size={11} />
      </button>
      <button
        onClick={() => onDelete(dep.id)}
        className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        title={t('common.delete')}
      >
        <XCircle size={11} />
      </button>
    </div>
  )
}

export function ActivityDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const promptInput = usePromptInput()
  const confirm = useConfirm()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data: activity, isLoading, isError } = useActivity(id)
  const updateActivity = useUpdateActivity()
  const deleteActivity = useDeleteActivity()
  const submitActivity = useSubmitActivity()
  const validateActivity = useValidateActivity()
  const rejectActivity = useRejectActivity()
  const cancelActivity = useCancelActivity()
  const { data: dependencies } = useActivityDependencies(id)
  const addDependency = useAddDependency()
  const removeDependency = useRemoveDependency()
  const impactPreview = useImpactPreview()
  const overridePriority = useOverridePriority()
  const setRecurrence = useSetRecurrence()
  const deleteRecurrence = useDeleteRecurrence()
  const { hasPermission } = usePermission()
  const canUpdate = hasPermission('planner.activity.update')
  const canDelete = hasPermission('planner.activity.delete')
  const canOverridePriority = hasPermission('planner.priority.override')
  const activityTypeLabels = useDictionaryLabels('planner_activity_type', ACTIVITY_TYPE_LABELS_FALLBACK)
  const priorityLabels = useDictionaryLabels('planner_activity_priority', PRIORITY_LABELS_FALLBACK)
  const activityStatusLabels = useDictionaryLabels('planner_activity_status', ACTIVITY_STATUS_LABELS_FALLBACK)
  const dependencyTypeLabels = useDictionaryLabels('planner_dependency_type', DEP_TYPE_LABELS_FALLBACK)
  const activityTypeOptions = useMemo(() => buildDictionaryOptions(activityTypeLabels, PLANNER_ACTIVITY_TYPE_VALUES), [activityTypeLabels])
  const priorityOptions = useMemo(() => buildDictionaryOptions(priorityLabels, PLANNER_PRIORITY_VALUES), [priorityLabels])
  const dependencyTypeOptions = useMemo(() => buildDictionaryOptions(dependencyTypeLabels, PLANNER_DEP_TYPE_VALUES), [dependencyTypeLabels])

  const [detailTab, setDetailTab] = useState<'informations' | 'ressources' | 'documents'>('informations')

  useEffect(() => {
    if (isError && id) closeDynamicPanel()
  }, [isError, id, closeDynamicPanel])

  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, unknown>>({})

  const [depForm, setDepForm] = useState({ predecessor_id: '', dependency_type: 'FS', lag_days: 0 })
  const [showDepAdd, setShowDepAdd] = useState(false)

  const [showImpact, setShowImpact] = useState(false)

  const [showRecurrence, setShowRecurrence] = useState(false)
  const [recForm, setRecForm] = useState({ frequency: 'weekly', interval_value: 1, day_of_week: 1, end_date: '' })

  const [showPriorityOverride, setShowPriorityOverride] = useState(false)
  const [priorityOverrideForm, setPriorityOverrideForm] = useState({ priority: 'high', reason: '' })

  const handleInlineSave = useCallback((field: string, value: string) => {
    updateActivity.mutate(
      { id, payload: normalizeNames({ [field]: value }) },
      {
        onSuccess: () => toast({ title: t('planner.toast.field_updated'), variant: 'success' }),
        onError: () => toast({ title: t('planner.toast.update_error'), variant: 'error' }),
      },
    )
  }, [id, updateActivity, toast, t])

  const pobSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleInlinePobSave = useCallback((next: Record<string, number>) => {
    if (pobSaveTimerRef.current) clearTimeout(pobSaveTimerRef.current)
    pobSaveTimerRef.current = setTimeout(() => {
      updateActivity.mutate(
        { id, payload: { pax_quota_daily: next } },
        {
          onSuccess: () => toast({ title: t('planner.toast.pob_plan_updated'), variant: 'success' }),
          onError: () => toast({ title: t('planner.toast.update_error'), variant: 'error' }),
        },
      )
    }, 400)
  }, [id, updateActivity, toast, t])
  useEffect(() => () => {
    if (pobSaveTimerRef.current) clearTimeout(pobSaveTimerRef.current)
  }, [])

  const startEdit = useCallback(() => {
    if (!activity) return
    setEditForm({
      title: activity.title,
      type: activity.type,
      subtype: activity.subtype ?? '',
      priority: activity.priority,
      pax_quota: activity.pax_quota,
      pax_quota_mode: activity.pax_quota_mode ?? 'constant',
      pax_quota_daily: activity.pax_quota_daily ?? null,
      start_date: activity.start_date ?? '',
      end_date: activity.end_date ?? '',
      description: activity.description ?? '',
      well_reference: activity.well_reference ?? '',
      rig_name: activity.rig_name ?? '',
      spud_date: activity.spud_date ?? '',
      target_depth: activity.target_depth ?? '',
      drilling_program_ref: activity.drilling_program_ref ?? '',
      regulatory_ref: activity.regulatory_ref ?? '',
      work_order_ref: activity.work_order_ref ?? '',
    })
    setEditing(true)
  }, [activity])
  void startEdit // kept for future inline-edit trigger wiring

  const doSave = useCallback(() => {
    updateActivity.mutate(
      { id, payload: normalizeNames(editForm as Record<string, string | number | null>) },
      {
        onSuccess: () => {
          toast({ title: t('planner.toast.activity_updated'), variant: 'success' })
          setEditing(false)
          setShowImpact(false)
        },
        onError: () => toast({ title: t('planner.toast.update_error'), variant: 'error' }),
      },
    )
  }, [id, editForm, updateActivity, toast, t])

  const handleSave = useCallback(() => {
    if (activity && ['validated', 'in_progress'].includes(activity.status) && !showImpact) {
      impactPreview.mutate(
        {
          activityId: id,
          params: {
            new_start: editForm.start_date as string || undefined,
            new_end: editForm.end_date as string || undefined,
            new_pax_quota: editForm.pax_quota as number || undefined,
          },
        },
        {
          onSuccess: () => setShowImpact(true),
          onError: () => {
            doSave()
          },
        },
      )
      return
    }
    doSave()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, editForm, activity, showImpact])

  const handleDelete = useCallback(() => {
    deleteActivity.mutate(id, {
      onSuccess: () => {
        toast({ title: t('planner.toast.activity_deleted'), variant: 'success' })
        closeDynamicPanel()
      },
      onError: () => toast({ title: t('planner.toast.deletion_error'), variant: 'error' }),
    })
  }, [id, deleteActivity, toast, closeDynamicPanel, t])

  const handleSubmit = useCallback(() => {
    if (activity && !activity.has_children && (activity.pax_quota_mode ?? 'constant') === 'constant' && (activity.pax_quota ?? 0) <= 0) {
      toast({ title: t('planner.toast.submission_refused'), description: 'Le quota PAX doit être supérieur à 0 avant de soumettre.', variant: 'error' })
      return
    }
    submitActivity.mutate(id, {
      onSuccess: () => toast({ title: t('planner.toast.activity_submitted'), variant: 'success' }),
      onError: (err) => toast({
        title: t('planner.toast.submission_refused'),
        description: extractApiError(err),
        variant: 'error',
      }),
    })
  }, [id, activity, submitActivity, toast, t])

  const handleValidate = useCallback(() => {
    validateActivity.mutate(id, {
      onSuccess: () => toast({ title: t('planner.toast.activity_validated'), variant: 'success' }),
      onError: (err) => toast({
        title: t('planner.toast.validation_refused'),
        description: extractApiError(err),
        variant: 'error',
      }),
    })
  }, [id, validateActivity, toast, t])

  const handleReject = useCallback(async () => {
    const reason = await promptInput({ title: t('planner.toast.reject_activity_title'), placeholder: 'Motif du rejet...' })
    if (reason === null) return
    rejectActivity.mutate(
      { id, reason },
      {
        onSuccess: () => toast({ title: t('planner.toast.activity_rejected'), variant: 'success' }),
        onError: (err) => toast({
          title: t('planner.toast.rejection_refused'),
          description: extractApiError(err),
          variant: 'error',
        }),
      },
    )
  }, [id, rejectActivity, toast, promptInput, t])

  const handleCancel = useCallback(() => {
    cancelActivity.mutate(id, {
      onSuccess: () => toast({ title: t('planner.toast.activity_cancelled'), variant: 'success' }),
      onError: () => toast({ title: t('planner.toast.cancellation_error'), variant: 'error' }),
    })
  }, [id, cancelActivity, toast, t])

  const handleAddDep = useCallback(async () => {
    if (!depForm.predecessor_id.trim()) return
    const predId = depForm.predecessor_id.trim()
    const depType = depForm.dependency_type
    const lagDays = depForm.lag_days ?? 0

    try {
      await addDependency.mutateAsync({
        activityId: id,
        payload: {
          predecessor_id: predId,
          successor_id: id,
          dependency_type: depType,
          lag_days: lagDays,
        },
      })
      toast({ title: t('planner.toast.dependency_added'), variant: 'success' })

      if (activity?.start_date && activity?.end_date) {
        try {
          const pred = await plannerService.getActivity(predId)
          if (pred?.start_date && pred?.end_date) {
            const MS = 86400000
            const lagMs = lagDays * MS
            const succStart = new Date(activity.start_date).getTime()
            const succEnd = new Date(activity.end_date).getTime()
            const predStart = new Date(pred.start_date).getTime()
            const predEnd = new Date(pred.end_date).getTime()

            let minStart = succStart
            let minEnd = succEnd
            switch (depType) {
              case 'FS': minStart = predEnd + lagMs; break
              case 'SS': minStart = predStart + lagMs; break
              case 'FF': minEnd = predEnd + lagMs; break
              case 'SF': minEnd = predStart + lagMs; break
            }
            const deltaStart = Math.max(0, minStart - succStart)
            const deltaEnd = Math.max(0, minEnd - succEnd)
            const delta = Math.max(deltaStart, deltaEnd)

            if (delta > 0) {
              const deltaDays = Math.ceil(delta / MS)
              const proceed = await confirm({
                title: 'Contrainte non respectée',
                message:
                  `La contrainte ${depType}${lagDays !== 0 ? ` (lag ${lagDays > 0 ? '+' : ''}${lagDays}j)` : ''} ` +
                  `exige que « ${activity.title} » soit décalée de ${deltaDays} jour${deltaDays > 1 ? 's' : ''} ` +
                  `par rapport à « ${pred.title} ».\n\n` +
                  `Voulez-vous appliquer ce décalage automatiquement ?`,
                confirmLabel: 'Décaler',
                cancelLabel: 'Ignorer',
                variant: 'warning',
              })
              if (proceed) {
                const newStart = new Date(succStart + delta).toISOString().slice(0, 10)
                const newEnd = new Date(succEnd + delta).toISOString().slice(0, 10)
                await plannerService.updateActivity(id, {
                  start_date: newStart,
                  end_date: newEnd,
                })
                toast({
                  title: t('planner.toast.task_shifted', { count: deltaDays }),
                  variant: 'success',
                })
              }
            }
          }
        } catch {
          // Predecessor fetch failed — don't block the user
        }
      }

      setDepForm({ predecessor_id: '', dependency_type: 'FS', lag_days: 0 })
      setShowDepAdd(false)
    } catch (err) {
      toast({
        title: t('planner.toast.addition_refused'),
        description: extractApiError(err),
        variant: 'error',
      })
    }
  }, [id, depForm, addDependency, toast, activity, confirm, t])

  const handleRemoveDep = useCallback((depId: string) => {
    removeDependency.mutate(
      { activityId: id, dependencyId: depId },
      {
        onSuccess: () => toast({ title: t('planner.toast.dependency_deleted'), variant: 'success' }),
        onError: () => toast({ title: t('planner.toast.deletion_error'), variant: 'error' }),
      },
    )
  }, [id, removeDependency, toast, t])

  const handleUpdateDep = useCallback((depId: string, payload: {
    predecessor_id: string
    successor_id: string
    dependency_type: string
    lag_days: number
  }) => {
    removeDependency.mutate(
      { activityId: id, dependencyId: depId },
      {
        onSuccess: () => {
          addDependency.mutate(
            {
              activityId: id,
              payload: {
                predecessor_id: payload.predecessor_id,
                successor_id: payload.successor_id,
                dependency_type: payload.dependency_type,
                lag_days: payload.lag_days,
              },
            },
            {
              onSuccess: () => toast({ title: t('planner.toast.dependency_modified'), variant: 'success' }),
              onError: () => toast({ title: t('planner.toast.modification_error'), variant: 'error' }),
            },
          )
        },
        onError: () => toast({ title: t('planner.toast.modification_error'), variant: 'error' }),
      },
    )
  }, [id, removeDependency, addDependency, toast, t])

  const handleSetRecurrence = useCallback(() => {
    setRecurrence.mutate(
      {
        activityId: id,
        payload: {
          frequency: recForm.frequency,
          interval_value: recForm.interval_value,
          day_of_week: recForm.day_of_week,
          end_date: recForm.end_date || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: t('planner.toast.recurrence_configured'), variant: 'success' })
          setShowRecurrence(false)
        },
        onError: () => toast({ title: t('planner.toast.error_generic'), variant: 'error' }),
      },
    )
  }, [id, recForm, setRecurrence, toast, t])

  const handleOverridePriority = useCallback(() => {
    if (!priorityOverrideForm.reason) return
    overridePriority.mutate(
      { activityId: id, priority: priorityOverrideForm.priority, reason: priorityOverrideForm.reason },
      {
        onSuccess: () => {
          toast({ title: t('planner.toast.priority_modified'), variant: 'success' })
          setShowPriorityOverride(false)
        },
        onError: () => toast({ title: t('planner.toast.error_generic'), variant: 'error' }),
      },
    )
  }, [id, priorityOverrideForm, overridePriority, toast, t])

  if (isLoading || !activity) {
    return (
      <DynamicPanelShell title={t('common.loading_ellipsis')} icon={<CalendarRange size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      </DynamicPanelShell>
    )
  }

  const st = activity.status
  const tp = activity.type

  const actionItems: ActionItem[] = editing
    ? [
        {
          id: 'cancel-edit',
          label: 'Annuler',
          icon: XCircle,
          onClick: () => {
            setEditing(false)
            setShowImpact(false)
          },
          priority: 40,
        },
        {
          id: 'save-edit',
          label: 'Enregistrer',
          icon: CheckCircle2,
          variant: 'primary',
          onClick: handleSave,
          disabled: updateActivity.isPending,
          loading: updateActivity.isPending,
          priority: 100,
        },
      ]
    : [
        // OpsFlux pattern: no "Modifier" button — inline edit via double-click.
        ...(canUpdate && st === 'draft'
          ? [{
              id: 'submit',
              label: 'Soumettre',
              icon: Send,
              variant: 'primary',
              onClick: handleSubmit,
              disabled: submitActivity.isPending,
              loading: submitActivity.isPending,
              priority: 100,
            } as ActionItem]
          : []),
        ...(canUpdate && st === 'submitted'
          ? [
              {
                id: 'validate',
                label: 'Valider',
                icon: CheckCircle2,
                variant: 'primary',
                onClick: handleValidate,
                disabled: validateActivity.isPending,
                loading: validateActivity.isPending,
                priority: 100,
              } as ActionItem,
              {
                id: 'reject',
                label: 'Rejeter',
                icon: XCircle,
                onClick: handleReject,
                disabled: rejectActivity.isPending,
                loading: rejectActivity.isPending,
                priority: 55,
              } as ActionItem,
            ]
          : []),
        ...(canUpdate && !['completed', 'cancelled'].includes(st)
          ? [{
              id: 'cancel-activity',
              label: 'Annuler',
              icon: Ban,
              onClick: handleCancel,
              disabled: cancelActivity.isPending,
              priority: 40,
            } as ActionItem]
          : []),
        ...(canDelete
          ? [{
              id: 'delete',
              label: 'Supprimer',
              icon: Trash2,
              variant: 'danger',
              onClick: handleDelete,
              confirm: {
                title: 'Supprimer l\u2019activité ?',
                message: 'Cette action est définitive. L\u2019activité et ses dépendances seront retirées du planner.',
                confirmLabel: 'Supprimer',
                cancelLabel: 'Conserver',
                variant: 'danger',
              },
              priority: 20,
            } as ActionItem]
          : []),
      ]

  const typeEntry = ACTIVITY_TYPE_META[tp]
  const priorityEntry = { label: priorityLabels[activity.priority] ?? activity.priority, cls: PRIORITY_CLASS_MAP[activity.priority] || 'text-muted-foreground' }
  const statusEntry = { label: activityStatusLabels[st] ?? st, badge: ACTIVITY_STATUS_BADGES[st] || 'gl-badge-neutral' }

  return (
    <DynamicPanelShell
      title={activity.title}
      subtitle={activityTypeLabels[tp] || tp}
      icon={<CalendarRange size={14} className="text-primary" />}
      actionItems={actionItems}
      onActionConfirm={async (cfg) =>
        confirm({
          title: cfg.title,
          message: cfg.message,
          confirmLabel: cfg.confirmLabel,
          cancelLabel: cfg.cancelLabel,
          variant: cfg.variant,
        })
      }
    >
      <TabBar
        items={[
          { id: 'informations', label: 'Informations', icon: Info },
          { id: 'ressources', label: 'Ressources', icon: Users },
          { id: 'documents', label: 'Documents', icon: Paperclip },
        ]}
        activeId={detailTab}
        onTabChange={(id) => setDetailTab(id as 'informations' | 'ressources' | 'documents')}
        className="px-4 pt-3 pb-0"
      />
      <PanelContentLayout>
        {editing ? (
          /* ── EDIT MODE ── */
          detailTab === 'informations' ? (
          <>
            <FormSection title={t('common.information')}>
              <FormGrid>
                <DynamicPanelField label={t('common.title_field')} required>
                  <input
                    type="text"
                    value={editForm.title as string}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className={panelInputClass}
                  />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.type_field')} required>
                  <select
                    value={editForm.type as string}
                    onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                    className={panelInputClass}
                  >
                    {activityTypeOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </DynamicPanelField>
                <DynamicPanelField label="Sous-type">
                  <input
                    type="text"
                    value={editForm.subtype as string}
                    onChange={(e) => setEditForm({ ...editForm, subtype: e.target.value || null })}
                    className={panelInputClass}
                  />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.priority_field')}>
                  <select
                    value={editForm.priority as string}
                    onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                    className={panelInputClass}
                  >
                    {priorityOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </DynamicPanelField>
                <DynamicPanelField label="Mode POB">
                  <select
                    value={(editForm.pax_quota_mode as string) || 'constant'}
                    onChange={(e) => setEditForm({ ...editForm, pax_quota_mode: e.target.value })}
                    className={panelInputClass}
                  >
                    <option value="constant">Constant</option>
                    <option value="variable">Variable (par jour)</option>
                  </select>
                </DynamicPanelField>
                {editForm.pax_quota_mode !== 'variable' && (
                  <DynamicPanelField label="Quota PAX">
                    <input
                      type="number"
                      value={editForm.pax_quota as number}
                      onChange={(e) => setEditForm({ ...editForm, pax_quota: Math.max(1, parseInt(e.target.value) || 1) })}
                      className={panelInputClass}
                      min={1}
                    />
                  </DynamicPanelField>
                )}
              </FormGrid>
              {((editForm.pax_quota_mode as string) === 'variable' && editForm.start_date && editForm.end_date) ? (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground mb-2">Plan POB jour par jour :</p>
                  <VariablePobEditor
                    startDate={editForm.start_date as string}
                    endDate={editForm.end_date as string}
                    value={(editForm.pax_quota_daily ?? null) as Record<string, number> | null}
                    onChange={(daily) => setEditForm({ ...editForm, pax_quota_daily: daily })}
                    defaultValue={(editForm.pax_quota as number) || 1}
                    compact
                  />
                </div>
              ) : null}
            </FormSection>

            <FormSection title={t('common.planning')}>
              <DateRangePicker
                startDate={(editForm.start_date as string) || null}
                endDate={(editForm.end_date as string) || null}
                onStartChange={(v) => setEditForm({ ...editForm, start_date: v || null })}
                onEndChange={(v) => setEditForm({ ...editForm, end_date: v || null })}
              />
            </FormSection>

            <FormSection title={t('common.description')}>
              <DynamicPanelField label={t('common.description')} span="full">
                <textarea
                  value={editForm.description as string}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value || null })}
                  className={cn(panelInputClass, 'min-h-[80px] py-2')}
                />
              </DynamicPanelField>
            </FormSection>

            {(editForm.type === 'workover') && (
              <FormSection title="Détails Workover">
                <FormGrid>
                  <DynamicPanelField label="Référence puits">
                    <input
                      type="text"
                      value={editForm.well_reference as string}
                      onChange={(e) => setEditForm({ ...editForm, well_reference: e.target.value || null })}
                      className={panelInputClass}
                    />
                  </DynamicPanelField>
                  <DynamicPanelField label="Nom du rig">
                    <input
                      type="text"
                      value={editForm.rig_name as string}
                      onChange={(e) => setEditForm({ ...editForm, rig_name: e.target.value || null })}
                      className={panelInputClass}
                    />
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>
            )}

            {(editForm.type === 'drilling') && (
              <FormSection title="Détails Forage">
                <FormGrid>
                  <DynamicPanelField label="Date spud">
                    <input
                      type="date"
                      value={editForm.spud_date as string}
                      onChange={(e) => setEditForm({ ...editForm, spud_date: e.target.value || null })}
                      className={panelInputClass}
                    />
                  </DynamicPanelField>
                  <DynamicPanelField label="Profondeur cible (m)">
                    <input
                      type="number"
                      value={editForm.target_depth as string}
                      onChange={(e) => setEditForm({ ...editForm, target_depth: parseFloat(e.target.value) || null })}
                      className={panelInputClass}
                    />
                  </DynamicPanelField>
                  <DynamicPanelField label="Ref. programme forage">
                    <input
                      type="text"
                      value={editForm.drilling_program_ref as string}
                      onChange={(e) => setEditForm({ ...editForm, drilling_program_ref: e.target.value || null })}
                      className={panelInputClass}
                    />
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>
            )}

            {(editForm.type === 'maintenance' || editForm.type === 'integrity') && (
              <FormSection title="Détails Maintenance / Intégrité">
                <FormGrid>
                  <DynamicPanelField label="Référence réglementaire">
                    <input
                      type="text"
                      value={editForm.regulatory_ref as string}
                      onChange={(e) => setEditForm({ ...editForm, regulatory_ref: e.target.value || null })}
                      className={panelInputClass}
                    />
                  </DynamicPanelField>
                  <DynamicPanelField label="Bon de travail">
                    <input
                      type="text"
                      value={editForm.work_order_ref as string}
                      onChange={(e) => setEditForm({ ...editForm, work_order_ref: e.target.value || null })}
                      className={panelInputClass}
                    />
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>
            )}
          </>
          ) : (
            <div className="p-6 text-sm text-muted-foreground">
              Cliquez sur l'onglet <strong>Informations</strong> pour continuer l'édition.
            </div>
          )
        ) : (
          /* ── READ MODE ── */
          <>
            {detailTab === 'informations' && (
            <div className="@container space-y-5">
              <SectionColumns>
                <div className="@container space-y-4">
                  <FormSection title={t('common.information')}>
                    <DetailFieldGrid>
                      <InlineEditableRow label="Titre" value={activity.title} onSave={(v) => handleInlineSave('title', v)} />
                      <ReadOnlyRow
                        label="Type"
                        value={
                          <span className={cn('gl-badge inline-flex items-center gap-1', typeEntry?.badge || 'gl-badge-neutral')}>
                            {activityTypeLabels[tp] || tp}
                          </span>
                        }
                      />
                    </DetailFieldGrid>
                    <DetailFieldGrid>
                      <ReadOnlyRow
                        label="Statut"
                        value={
                          <span className={cn('gl-badge', statusEntry?.badge || 'gl-badge-neutral')}>
                            {statusEntry?.label || st}
                          </span>
                        }
                      />
                      <ReadOnlyRow
                        label="Priorité"
                        value={
                          <span className={cn('text-sm font-medium', priorityEntry?.cls || 'text-muted-foreground')}>
                            {priorityEntry?.label || activity.priority}
                          </span>
                        }
                      />
                    </DetailFieldGrid>
                    {activity.subtype && (
                      <DetailFieldGrid>
                        <ReadOnlyRow label="Sous-type" value={activity.subtype} />
                      </DetailFieldGrid>
                    )}
                  </FormSection>
                </div>
                <div className="@container space-y-4">
                  <FormSection title="Rattachement">
                    <DetailFieldGrid>
                      <ReadOnlyRow label="Site" value={
                        activity.asset_id ? (
                          <CrossModuleLink module="assets" id={activity.asset_id} label={activity.asset_name || activity.asset_id} mode="navigate" />
                        ) : (activity.asset_name || '—')
                      } />
                      <ReadOnlyRow label={t('common.project')} value={
                        activity.project_id ? (
                          <CrossModuleLink module="projets" id={activity.project_id} label={activity.project_name || activity.project_id} mode="navigate" />
                        ) : (activity.project_name || '—')
                      } />
                    </DetailFieldGrid>
                  </FormSection>
                </div>
              </SectionColumns>

              <FormSection title={t('common.planning')}>
                <DetailFieldGrid>
                  <InlineEditableRow
                    label="Date début"
                    value={activity.start_date ? activity.start_date.slice(0, 10) : ''}
                    onSave={(v) => handleInlineSave('start_date', v)}
                    type="date"
                  />
                  <InlineEditableRow
                    label="Date fin"
                    value={activity.end_date ? activity.end_date.slice(0, 10) : ''}
                    onSave={(v) => handleInlineSave('end_date', v)}
                    type="date"
                  />
                </DetailFieldGrid>
                <DetailFieldGrid>
                  <InlineEditableRow
                    label="Début réel"
                    value={activity.actual_start ? activity.actual_start.slice(0, 10) : ''}
                    onSave={(v) => handleInlineSave('actual_start', v)}
                    type="date"
                  />
                  <InlineEditableRow
                    label="Fin réelle"
                    value={activity.actual_end ? activity.actual_end.slice(0, 10) : ''}
                    onSave={(v) => handleInlineSave('actual_end', v)}
                    type="date"
                  />
                </DetailFieldGrid>
                <DetailFieldGrid>
                  <ReadOnlyRow
                    label="Mode POB"
                    value={activity.pax_quota_mode === 'variable' ? 'Variable (par jour)' : 'Constant'}
                  />
                  {activity.pax_quota_mode !== 'variable' ? (
                    <InlineEditableRow
                      label="Quota PAX"
                      value={String(activity.pax_quota ?? 0)}
                      onSave={(v) => handleInlineSave('pax_quota', v)}
                      type="number"
                    />
                  ) : (
                    <ReadOnlyRow
                      label="Quota PAX"
                      value={
                        <span className="inline-flex items-center gap-1">
                          <Users size={12} className="text-muted-foreground" />
                          {formatVariablePaxRange(activity.pax_quota_daily, activity.pax_quota)}
                          <span className="text-[10px] text-muted-foreground ml-1">(min–max journalier)</span>
                        </span>
                      }
                    />
                  )}
                </DetailFieldGrid>
                {activity.has_children && activity.children_pob_total != null && (
                  <DetailFieldGrid>
                    <ReadOnlyRow
                      label="POB enfants (\u03A3)"
                      value={
                        <span className="inline-flex items-center gap-1 font-semibold text-primary">
                          <Users size={12} />
                          {activity.children_pob_daily && Object.keys(activity.children_pob_daily).length > 0
                            ? (() => {
                                const vals = Object.values(activity.children_pob_daily!).filter((v) => typeof v === 'number') as number[]
                                if (vals.length === 0) return `\u03A3${activity.children_pob_total}`
                                const min = Math.min(...vals)
                                const max = Math.max(...vals)
                                return min === max ? `\u03A3${min}` : `\u03A3${min}\u2013${max} /jour`
                              })()
                            : `\u03A3${activity.children_pob_total}`}
                        </span>
                      }
                    />
                  </DetailFieldGrid>
                )}
                {activity.pax_quota_mode === 'variable'
                  && activity.start_date
                  && activity.end_date
                  && canUpdate && (
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground mb-2">
                      Plan POB jour par jour (modifications auto-enregistrées) :
                    </p>
                    <VariablePobEditor
                      startDate={activity.start_date}
                      endDate={activity.end_date}
                      value={activity.pax_quota_daily ?? null}
                      onChange={handleInlinePobSave}
                      defaultValue={activity.pax_quota || 1}
                      compact
                    />
                  </div>
                )}
              </FormSection>

              <FormSection title={t('common.description')}>
                <InlineEditableRow label="Description" value={activity.description ?? ''} onSave={(v) => handleInlineSave('description', v)} />
              </FormSection>

              {tp === 'workover' && (activity.well_reference || activity.rig_name) && (
                <FormSection title="Détails Workover">
                  <DetailFieldGrid>
                    <ReadOnlyRow label="Référence puits" value={activity.well_reference || '—'} />
                    <ReadOnlyRow label="Nom du rig" value={activity.rig_name || '—'} />
                  </DetailFieldGrid>
                </FormSection>
              )}

              {tp === 'drilling' && (activity.spud_date || activity.target_depth || activity.drilling_program_ref) && (
                <FormSection title="Détails Forage">
                  <DetailFieldGrid>
                    <ReadOnlyRow label="Date spud" value={formatDateShort(activity.spud_date)} />
                    <ReadOnlyRow label="Profondeur cible" value={activity.target_depth != null ? `${activity.target_depth} m` : '—'} />
                  </DetailFieldGrid>
                  {activity.drilling_program_ref && (
                    <DetailFieldGrid>
                      <ReadOnlyRow label="Ref. programme forage" value={activity.drilling_program_ref} />
                    </DetailFieldGrid>
                  )}
                </FormSection>
              )}

              {(tp === 'maintenance' || tp === 'integrity') && (activity.regulatory_ref || activity.work_order_ref) && (
                <FormSection title="Détails Maintenance / Intégrité">
                  <DetailFieldGrid>
                    <ReadOnlyRow label="Référence réglementaire" value={activity.regulatory_ref || '—'} />
                    <ReadOnlyRow label="Bon de travail" value={activity.work_order_ref || '—'} />
                  </DetailFieldGrid>
                </FormSection>
              )}

              <FormSection title="Workflow">
                <DetailFieldGrid>
                  <ReadOnlyRow label={t('common.created_by')} value={activity.created_by_name || '—'} />
                  {activity.submitted_by_name && (
                    <ReadOnlyRow
                      label="Soumis par"
                      value={`${activity.submitted_by_name}${activity.submitted_at ? ` — ${formatDateShort(activity.submitted_at)}` : ''}`}
                    />
                  )}
                </DetailFieldGrid>
                {(activity.validated_by_name || (st === 'rejected' && activity.rejection_reason)) && (
                  <DetailFieldGrid>
                    {activity.validated_by_name && (
                      <ReadOnlyRow
                        label="Validé par"
                        value={`${activity.validated_by_name}${activity.validated_at ? ` — ${formatDateShort(activity.validated_at)}` : ''}`}
                      />
                    )}
                    {st === 'rejected' && activity.rejection_reason && (
                      <ReadOnlyRow
                        label="Motif du rejet"
                        value={<span className="text-destructive">{activity.rejection_reason}</span>}
                      />
                    )}
                  </DetailFieldGrid>
                )}
              </FormSection>
            </div>
            )}

            {detailTab === 'ressources' && (<>
            <FormSection title="Dependances">
              {dependencies && dependencies.length > 0 ? (
                <div className="space-y-1.5">
                  {dependencies.map((dep: PlannerDependency) => (
                    <DependencyRow
                      key={dep.id}
                      dep={dep}
                      currentActivityId={id}
                      dependencyTypeOptions={dependencyTypeOptions}
                      onDelete={handleRemoveDep}
                      onUpdate={handleUpdateDep}
                      isPending={removeDependency.isPending || addDependency.isPending}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Aucune dépendance</p>
              )}

              {showDepAdd ? (
                <div className="mt-3 space-y-2 p-2.5 rounded-lg border border-border bg-background-subtle">
                  <div className="grid grid-cols-1 gap-2">
                    <ActivityPicker
                      value={depForm.predecessor_id || null}
                      onChange={(actId) => setDepForm({ ...depForm, predecessor_id: actId || '' })}
                      excludeId={id}
                      label="Activité prédécesseur"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Type</label>
                        <select
                          value={depForm.dependency_type}
                          onChange={(e) => setDepForm({ ...depForm, dependency_type: e.target.value })}
                          className={panelInputClass}
                        >
                          {dependencyTypeOptions.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Délai (jours)</label>
                        <input
                          type="number"
                          value={depForm.lag_days}
                          onChange={(e) => setDepForm({ ...depForm, lag_days: parseInt(e.target.value) || 0 })}
                          className={panelInputClass}
                          min={0}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="gl-button-sm gl-button-confirm" onClick={handleAddDep} disabled={addDependency.isPending}>
                      Ajouter
                    </button>
                    <button className="gl-button-sm gl-button-default" onClick={() => setShowDepAdd(false)}>
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="mt-2 text-xs text-primary hover:underline inline-flex items-center gap-1"
                  onClick={() => setShowDepAdd(true)}
                >
                  <Plus size={11} /> Ajouter une dependance
                </button>
              )}
            </FormSection>

            {tp === 'maintenance' && (
              <FormSection title="Récurrence">
                {showRecurrence ? (
                  <div className="space-y-2 p-2.5 rounded-lg border border-border bg-background-subtle">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Frequence</label>
                        <select
                          value={recForm.frequency}
                          onChange={(e) => setRecForm({ ...recForm, frequency: e.target.value })}
                          className={panelInputClass}
                        >
                          <option value="daily">Quotidien</option>
                          <option value="weekly">Hebdomadaire</option>
                          <option value="monthly">Mensuel</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Intervalle</label>
                        <input
                          type="number"
                          value={recForm.interval_value}
                          onChange={(e) => setRecForm({ ...recForm, interval_value: parseInt(e.target.value) || 1 })}
                          className={panelInputClass}
                          min={1}
                        />
                      </div>
                    </div>
                    {recForm.frequency === 'weekly' && (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Jour de la semaine</label>
                        <select
                          value={recForm.day_of_week}
                          onChange={(e) => setRecForm({ ...recForm, day_of_week: parseInt(e.target.value) })}
                          className={panelInputClass}
                        >
                          {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map((d, i) => (
                            <option key={i} value={i + 1}>{d}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Date fin recurrence</label>
                      <input
                        type="date"
                        value={recForm.end_date}
                        onChange={(e) => setRecForm({ ...recForm, end_date: e.target.value })}
                        className={panelInputClass}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="gl-button-sm gl-button-confirm" onClick={handleSetRecurrence} disabled={setRecurrence.isPending}>
                        Configurer
                      </button>
                      <button className="gl-button-sm gl-button-default" onClick={() => setShowRecurrence(false)}>
                        Annuler
                      </button>
                      <button
                        className="gl-button-sm text-xs text-destructive hover:text-destructive/80 ml-auto"
                        onClick={() => deleteRecurrence.mutate(id, {
                          onSuccess: () => { toast({ title: t('planner.toast.recurrence_deleted'), variant: 'success' }); setShowRecurrence(false) },
                        })}
                        disabled={deleteRecurrence.isPending}
                      >
                        Supprimer recurrence
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                    onClick={() => setShowRecurrence(true)}
                  >
                    <Repeat size={11} /> Configurer la recurrence
                  </button>
                )}
              </FormSection>
            )}

            {canOverridePriority && (
            <FormSection title="Actions avancées">
              {showPriorityOverride ? (
                <div className="space-y-2 p-2.5 rounded-lg border border-border bg-background-subtle">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Nouvelle priorite</label>
                      <select
                        value={priorityOverrideForm.priority}
                        onChange={(e) => setPriorityOverrideForm({ ...priorityOverrideForm, priority: e.target.value })}
                        className={panelInputClass}
                      >
                        {priorityOptions.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Motif *</label>
                    <textarea
                      value={priorityOverrideForm.reason}
                      onChange={(e) => setPriorityOverrideForm({ ...priorityOverrideForm, reason: e.target.value })}
                      className={cn(panelInputClass, 'min-h-[50px] py-1.5')}
                      placeholder="Justification du changement de priorité..."
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="gl-button-sm gl-button-confirm"
                      onClick={handleOverridePriority}
                      disabled={!priorityOverrideForm.reason || overridePriority.isPending}
                    >
                      Appliquer
                    </button>
                    <button className="gl-button-sm gl-button-default" onClick={() => setShowPriorityOverride(false)}>
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  onClick={() => setShowPriorityOverride(true)}
                >
                  <ArrowUpDown size={11} /> Forcer la priorite (DO)
                </button>
              )}
            </FormSection>
            )}
            </>)}

            {detailTab === 'documents' && (
            <FormSection title={t('common.tags_notes_files')} defaultExpanded>
              <div className="space-y-3">
                <TagManager ownerType="planner_activity" ownerId={activity.id} compact />
                <AttachmentManager ownerType="planner_activity" ownerId={activity.id} compact />
                <NoteManager ownerType="planner_activity" ownerId={activity.id} compact />
              </div>
            </FormSection>
            )}
          </>
        )}
      </PanelContentLayout>

      {/* Impact Preview Modal */}
      {showImpact && (
        <div className="gl-modal-backdrop" onClick={() => setShowImpact(false)}>
          <div className="gl-modal-card max-w-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-500" />
              Impact de la modification
            </h3>
            {impactPreview.data ? (
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  Activité: <span className="text-foreground font-medium">{impactPreview.data.activity_title}</span>
                </p>
                {impactPreview.data.ads_affected > 0 && (
                  <p className="text-amber-600">AdS impactes: {impactPreview.data.ads_affected}</p>
                )}
                {impactPreview.data.manifests_affected > 0 && (
                  <p className="text-amber-600">Manifestes impactes: {impactPreview.data.manifests_affected}</p>
                )}
                {impactPreview.data.potential_conflict_days.length > 0 && (
                  <p className="text-destructive">
                    Jours de conflit potentiel: {impactPreview.data.potential_conflict_days.join(', ')}
                  </p>
                )}
                {impactPreview.data.changes.length > 0 && (
                  <div className="space-y-1">
                    <p className="font-medium">Modifications:</p>
                    {impactPreview.data.changes.map((c, i) => (
                      <div key={i} className="text-xs text-muted-foreground">
                        {c.field}: {c.old_value || '—'} &rarr; {c.new_value || '—'}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : impactPreview.isPending ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              </div>
            ) : null}
            <div className="flex items-center gap-2 justify-end">
              <button className="gl-button-sm gl-button-default" onClick={() => { setShowImpact(false) }}>{t('common.cancel')}</button>
              <button
                className="gl-button-sm gl-button-confirm"
                onClick={doSave}
                disabled={updateActivity.isPending}
              >
                {updateActivity.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Confirmer la modification'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DynamicPanelShell>
  )
}
