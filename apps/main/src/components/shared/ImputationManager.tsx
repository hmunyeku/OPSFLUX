/**
 * ImputationManager — Reusable polymorphic cost imputation component.
 *
 * Embeddable anywhere: AdS detail, voyage detail, mission detail, PO detail, etc.
 * Fetches and displays cost imputations for a given owner (owner_type + owner_id).
 * Supports percentage validation (sum must = 100), project & cost center pickers.
 *
 * Usage:
 *   <ImputationManager ownerType="ads" ownerId={ads.id} />
 *   <ImputationManager ownerType="voyage" ownerId={voyage.id} editable={false} />
 */
import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Loader2, Pencil, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import {
  useCostCenters,
  useCostImputations,
  useCreateCostImputation,
  useDeleteCostImputation,
  useImputationReferences,
  useUpdateCostImputation,
} from '@/hooks/useSettings'
import { useProjects } from '@/hooks/useProjets'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import type { CostImputation } from '@/services/settingsService'

const panelInputClass = 'w-full rounded border border-border bg-card px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring'

interface ImputationManagerProps {
  ownerType: string
  ownerId: string | undefined
  /** If false, hides add/delete buttons */
  editable?: boolean
  defaultProjectId?: string | null
  defaultCostCenterId?: string | null
}

export function ImputationManager({ ownerType, ownerId, editable = true, defaultProjectId = null, defaultCostCenterId = null }: ImputationManagerProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { data: imputations } = useCostImputations(ownerType, ownerId)
  const createImputation = useCreateCostImputation()
  const deleteImputation = useDeleteCostImputation()
  const updateImputation = useUpdateCostImputation()
  const { data: imputationReferences } = useImputationReferences()
  const { data: projects } = useProjects({ page: 1, page_size: 200 })
  const { data: costCenters } = useCostCenters({ page: 1, page_size: 200 })

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    imputation_reference_id: '',
    project_id: defaultProjectId || '',
    cost_center_id: defaultCostCenterId || '',
    percentage: 100,
  })

  useEffect(() => {
    if (!showForm) {
      setForm({
        imputation_reference_id: '',
        project_id: defaultProjectId || '',
        cost_center_id: defaultCostCenterId || '',
        percentage: 100,
      })
    }
  }, [defaultCostCenterId, defaultProjectId, showForm])

  const total = useMemo(() => {
    if (!imputations) return 0
    return imputations.reduce((sum: number, imp: CostImputation) => sum + imp.percentage, 0)
  }, [imputations])

  const handleAdd = () => {
    if (!ownerId || (!form.imputation_reference_id && !form.project_id && !form.cost_center_id)) return
    createImputation.mutate(
      {
        owner_type: ownerType,
        owner_id: ownerId,
        imputation_reference_id: form.imputation_reference_id || undefined,
        project_id: form.project_id || undefined,
        cost_center_id: form.cost_center_id || undefined,
        percentage: form.percentage,
      },
      {
        onSuccess: () => {
          setShowForm(false)
          setForm({
            imputation_reference_id: '',
            project_id: defaultProjectId || '',
            cost_center_id: defaultCostCenterId || '',
            percentage: 100,
          })
        },
        onError: (err) => {
          const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
          toast({
            title: t('common.error'),
            description: detail || t('settings.imputation_manager.create_error'),
            variant: 'error',
          })
        },
      },
    )
  }

  const handleDelete = (impId: string) => {
    if (!ownerId) return
    deleteImputation.mutate(
      { id: impId, ownerType, ownerId },
      {
        onError: (err) => {
          const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
          toast({
            title: t('common.error'),
            description: detail || t('settings.imputation_manager.delete_error'),
            variant: 'error',
          })
        },
      },
    )
  }

  const startEdit = (imp: CostImputation) => {
    setEditingId(imp.id)
    setForm({
      imputation_reference_id: imp.imputation_reference_id || '',
      project_id: imp.project_id || '',
      cost_center_id: imp.cost_center_id || '',
      percentage: imp.percentage,
    })
    setShowForm(false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm({
      imputation_reference_id: '',
      project_id: defaultProjectId || '',
      cost_center_id: defaultCostCenterId || '',
      percentage: 100,
    })
  }

  const handleUpdate = () => {
    if (!ownerId || !editingId || (!form.imputation_reference_id && !form.project_id && !form.cost_center_id)) return
    updateImputation.mutate(
      {
        id: editingId,
        ownerType,
        ownerId,
        payload: {
          imputation_reference_id: form.imputation_reference_id || null,
          project_id: form.project_id || null,
          cost_center_id: form.cost_center_id || null,
          percentage: form.percentage,
        },
      },
      {
        onSuccess: () => {
          cancelEdit()
        },
        onError: (err) => {
          const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
          toast({
            title: t('common.error'),
            description: detail || t('settings.imputation_manager.update_error'),
            variant: 'error',
          })
        },
      },
    )
  }

  return (
    <div className="space-y-2">
      {/* Section header with + button on hover */}
      <div className="flex items-center gap-2 group">
        <h3 className="text-xs font-semibold text-foreground/70 uppercase tracking-wide">Imputations</h3>
        {editable && !showForm && (
          <button
            className="gl-button gl-button-confirm h-5 w-5 flex text-primary opacity-0 group-hover:opacity-100"
            onClick={() => setShowForm(true)}
            title={t('settings.imputation_manager.add')}
          >
            <Plus size={13} />
          </button>
        )}
      </div>
      {/* Add form */}
      {editable && showForm && (
        <div className="mb-2">
          {(
            <div className="space-y-2 p-2 rounded-md border border-border bg-card">
              <p className="text-[10px] text-muted-foreground">
                {defaultProjectId
                  ? t('settings.imputation_manager.prefilled_project_help')
                  : t('settings.imputation_manager.no_project_help')}
              </p>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">{t('settings.imputation_manager.reference')}</label>
                  <select className={panelInputClass} value={form.imputation_reference_id} onChange={(e) => setForm({ ...form, imputation_reference_id: e.target.value })}>
                    <option value="">{t('settings.imputation_manager.reference_placeholder')}</option>
                    {(imputationReferences ?? []).map((ref) => <option key={ref.id} value={ref.id}>{ref.code} — {ref.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">{t('settings.imputation_manager.project')}</label>
                  <select className={panelInputClass} value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
                    <option value="">{t('settings.imputation_manager.project_placeholder')}</option>
                    {(projects?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">{t('settings.imputation_manager.cost_center')}</label>
                  <select className={panelInputClass} value={form.cost_center_id} onChange={(e) => setForm({ ...form, cost_center_id: e.target.value })}>
                    <option value="">{t('settings.imputation_manager.cost_center_placeholder')}</option>
                    {(costCenters?.items ?? []).map((cc) => (
                      <option key={cc.id} value={cc.id}>{cc.code} — {cc.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">%</label>
                  <input type="number" className={panelInputClass} value={form.percentage} onChange={(e) => setForm({ ...form, percentage: Number(e.target.value) })} min={1} max={100} />
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button className="gl-button-sm" onClick={() => setShowForm(false)}>{t('common.cancel')}</button>
                <button
                  className="gl-button-sm gl-button-confirm"
                  disabled={(!form.imputation_reference_id && !form.project_id && !form.cost_center_id) || createImputation.isPending}
                  onClick={handleAdd}
                >
                  {createImputation.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.add')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* List */}
      {!imputations || imputations.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2 italic">{t('settings.imputation_manager.empty')}</p>
      ) : (
        <div className="space-y-1">
          {/* Header */}
          <div className="grid grid-cols-5 gap-2 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>{t('settings.imputation_manager.reference')}</span>
            <span>{t('settings.imputation_manager.project')}</span>
            <span>{t('settings.imputation_manager.cost_center')}</span>
            <span className="text-right">%</span>
            <span></span>
          </div>
          {/* Rows */}
          {imputations.map((imp: CostImputation) => (
            <div key={imp.id} className="grid grid-cols-5 gap-2 px-2 py-1.5 rounded hover:bg-accent/50 text-xs items-center">
              {editingId === imp.id ? (
                <>
                  <select className={panelInputClass} value={form.imputation_reference_id} onChange={(e) => setForm({ ...form, imputation_reference_id: e.target.value })}>
                    <option value="">{t('settings.imputation_manager.reference_placeholder')}</option>
                    {(imputationReferences ?? []).map((ref) => <option key={ref.id} value={ref.id}>{ref.code} — {ref.name}</option>)}
                  </select>
                  <select className={panelInputClass} value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
                    <option value="">{t('settings.imputation_manager.project_placeholder')}</option>
                    {(projects?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                  </select>
                  <select className={panelInputClass} value={form.cost_center_id} onChange={(e) => setForm({ ...form, cost_center_id: e.target.value })}>
                    <option value="">{t('settings.imputation_manager.cost_center_placeholder')}</option>
                    {(costCenters?.items ?? []).map((cc) => (
                      <option key={cc.id} value={cc.id}>{cc.code} — {cc.name}</option>
                    ))}
                  </select>
                  <input type="number" className={panelInputClass} value={form.percentage} onChange={(e) => setForm({ ...form, percentage: Number(e.target.value) })} min={1} max={100} />
                </>
              ) : (
                <>
                  <div className="min-w-0">
                    <div className="truncate text-foreground">{imp.imputation_reference_code || '--'}</div>
                    {(imp.imputation_type || imp.otp_policy) && (
                      <div className="truncate text-[10px] text-muted-foreground">
                        {[imp.imputation_type, imp.otp_policy ? `OTP ${imp.otp_policy}` : null].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  <span className="truncate">
                    {imp.project_id ? (
                      <CrossModuleLink module="projets" id={imp.project_id} label={imp.project_name || imp.project_id} showIcon={false} className="text-xs" />
                    ) : (
                      <span className="text-foreground">--</span>
                    )}
                  </span>
                  <span className="text-muted-foreground truncate">{imp.cost_center_name || imp.cost_center_id || '--'}</span>
                  <span className="text-foreground text-right tabular-nums font-medium">{imp.percentage}%</span>
                </>
              )}
              <div className="flex justify-end">
                {editable && (
                  <div className="flex items-center gap-1">
                    {editingId === imp.id ? (
                      <>
                        <button
                          className="p-1 rounded hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-600"
                          onClick={handleUpdate}
                          disabled={updateImputation.isPending || (!form.imputation_reference_id && !form.project_id && !form.cost_center_id)}
                        >
                          {updateImputation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                        </button>
                        <button
                          className="gl-button gl-button-default"
                          onClick={cancelEdit}
                        >
                          <X size={11} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="gl-button gl-button-default"
                          onClick={() => startEdit(imp)}
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          className="gl-button gl-button-danger"
                          onClick={() => handleDelete(imp.id)}
                        >
                          <Trash2 size={11} />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {/* Total row */}
          <div className="grid grid-cols-5 gap-2 px-2 py-1.5 border-t border-border text-xs">
            <span className="font-semibold text-foreground col-span-3">{t('common.total')}</span>
            <span className={cn('text-right tabular-nums font-semibold', total === 100 ? 'text-green-600' : 'text-destructive')}>
              {total}%
            </span>
            <span></span>
          </div>
          {total !== 100 && (
            <p className="text-[10px] text-destructive px-2">{t('settings.imputation_manager.total_error')}</p>
          )}
          {total === 0 && defaultProjectId && (
            <p className="text-[10px] text-muted-foreground px-2">{t('settings.imputation_manager.quick_fill_hint')}</p>
          )}
        </div>
      )}
    </div>
  )
}
