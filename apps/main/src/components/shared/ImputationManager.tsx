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
import { useState, useMemo } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCostImputations, useCreateCostImputation, useDeleteCostImputation } from '@/hooks/useSettings'
import { useProjects } from '@/hooks/useProjets'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import type { CostImputation } from '@/services/settingsService'

const panelInputClass = 'w-full rounded border border-border bg-card px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring'

interface ImputationManagerProps {
  ownerType: string
  ownerId: string | undefined
  /** If false, hides add/delete buttons */
  editable?: boolean
}

export function ImputationManager({ ownerType, ownerId, editable = true }: ImputationManagerProps) {
  const { data: imputations } = useCostImputations(ownerType, ownerId)
  const createImputation = useCreateCostImputation()
  const deleteImputation = useDeleteCostImputation()
  const { data: projects } = useProjects({ page: 1, page_size: 200 })

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ project_id: '', cost_center_id: '', percentage: 100 })

  const total = useMemo(() => {
    if (!imputations) return 0
    return imputations.reduce((sum: number, imp: CostImputation) => sum + imp.percentage, 0)
  }, [imputations])

  const handleAdd = () => {
    if (!ownerId || !form.project_id) return
    createImputation.mutate(
      {
        owner_type: ownerType,
        owner_id: ownerId,
        project_id: form.project_id || undefined,
        cost_center_id: form.cost_center_id || undefined,
        percentage: form.percentage,
      },
      {
        onSuccess: () => {
          setShowForm(false)
          setForm({ project_id: '', cost_center_id: '', percentage: 100 })
        },
      },
    )
  }

  const handleDelete = (impId: string) => {
    if (!ownerId) return
    deleteImputation.mutate({ id: impId, ownerType, ownerId })
  }

  return (
    <div className="space-y-2">
      {/* Add form */}
      {editable && (
        <div className="mb-2">
          {!showForm ? (
            <button className="gl-button-sm gl-button-confirm w-full" onClick={() => setShowForm(true)}>
              <Plus size={12} /> Ajouter une imputation
            </button>
          ) : (
            <div className="space-y-2 p-2 rounded-md border border-border bg-card">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">Projet</label>
                  <select className={panelInputClass} value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
                    <option value="">— Projet —</option>
                    {(projects?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">Centre de coût</label>
                  <input className={panelInputClass} value={form.cost_center_id} onChange={(e) => setForm({ ...form, cost_center_id: e.target.value })} placeholder="ID centre de coût" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">%</label>
                  <input type="number" className={panelInputClass} value={form.percentage} onChange={(e) => setForm({ ...form, percentage: Number(e.target.value) })} min={1} max={100} />
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button className="gl-button-sm" onClick={() => setShowForm(false)}>Annuler</button>
                <button
                  className="gl-button-sm gl-button-confirm"
                  disabled={!form.project_id || createImputation.isPending}
                  onClick={handleAdd}
                >
                  {createImputation.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Ajouter'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* List */}
      {!imputations || imputations.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2 italic">Aucune imputation de coût.</p>
      ) : (
        <div className="space-y-1">
          {/* Header */}
          <div className="grid grid-cols-4 gap-2 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Projet</span>
            <span>Centre de coût</span>
            <span className="text-right">%</span>
            <span></span>
          </div>
          {/* Rows */}
          {imputations.map((imp: CostImputation) => (
            <div key={imp.id} className="grid grid-cols-4 gap-2 px-2 py-1.5 rounded hover:bg-accent/50 text-xs items-center">
              <span className="truncate">
                {imp.project_id ? (
                  <CrossModuleLink module="projets" id={imp.project_id} label={imp.project_name || imp.project_id} showIcon={false} className="text-xs" />
                ) : (
                  <span className="text-foreground">--</span>
                )}
              </span>
              <span className="text-muted-foreground truncate">{imp.cost_center_name || imp.cost_center_id || '--'}</span>
              <span className="text-foreground text-right tabular-nums font-medium">{imp.percentage}%</span>
              <div className="flex justify-end">
                {editable && (
                  <button
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(imp.id)}
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {/* Total row */}
          <div className="grid grid-cols-4 gap-2 px-2 py-1.5 border-t border-border text-xs">
            <span className="font-semibold text-foreground col-span-2">Total</span>
            <span className={cn('text-right tabular-nums font-semibold', total === 100 ? 'text-green-600' : 'text-destructive')}>
              {total}%
            </span>
            <span></span>
          </div>
          {total !== 100 && (
            <p className="text-[10px] text-destructive px-2">Le total des imputations doit être égal à 100%.</p>
          )}
        </div>
      )}
    </div>
  )
}
