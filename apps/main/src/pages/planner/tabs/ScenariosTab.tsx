/**
 * Scenarios tab (what-if simulation) — PlannerPage.
 *
 * Extracted from the monolithic PlannerPage.tsx. Behavior preserved 1:1.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus, Pencil, Trash2, Loader2, FlaskConical, TrendingUp, CheckCircle2, Star, Play,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePageSize } from '@/hooks/usePageSize'
import { PanelContent } from '@/components/layout/PanelHeader'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import {
  useScenarios,
  useCreateScenario,
  useDeleteScenario,
  useSimulateScenarioPersistent,
  usePromoteScenario,
  useReferenceScenario,
} from '@/hooks/usePlanner'
import { usePermission } from '@/hooks/usePermission'
import { StatCard, formatDateShort, extractApiError } from '../shared'

export function ScenariosTab({
  activeScenarioId,
  onActivateScenario,
}: {
  activeScenarioId?: string
  onActivateScenario?: (id: string | null) => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { pageSize } = usePageSize()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const { data, isLoading } = useScenarios({ page, page_size: pageSize, status: statusFilter || undefined })
  const createScenario = useCreateScenario()
  const deleteScenario = useDeleteScenario()
  const simulateScenario = useSimulateScenarioPersistent()
  const promoteScenario = usePromoteScenario()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const confirmDialog = useConfirm()
  const { hasPermission } = usePermission()
  const canPromote = hasPermission('planner.activity.create')
  const { data: referenceScenario } = useReferenceScenario()

  const scenarios = data?.items ?? []
  const total = data?.total ?? 0

  const [showCreate, setShowCreate] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createDesc, setCreateDesc] = useState('')

  const handleCreate = async () => {
    if (!createTitle.trim()) return
    try {
      await createScenario.mutateAsync({ title: createTitle.trim(), description: createDesc.trim() || undefined })
      setShowCreate(false)
      setCreateTitle('')
      setCreateDesc('')
      toast({ title: t('planner.toast.scenario_created'), variant: 'success' })
    } catch {
      toast({ title: t('planner.toast.error_generic'), variant: 'error' })
    }
  }

  const handleSimulate = async (scenarioId: string) => {
    try {
      await simulateScenario.mutateAsync(scenarioId)
      toast({ title: t('planner.toast.simulation_done'), variant: 'success' })
    } catch (err) {
      toast({ title: t('planner.toast.simulation_failed'), description: extractApiError(err), variant: 'error' })
    }
  }

  const handlePromote = async (scenarioId: string) => {
    const ok = await confirmDialog({
      title: 'Promouvoir ce scénario ?',
      message: 'Les activités proposées seront converties en activités réelles dans le plan. Cette action est irréversible.',
      confirmLabel: 'Promouvoir',
      variant: 'warning',
    })
    if (!ok) return
    try {
      const result = await promoteScenario.mutateAsync(scenarioId)
      toast({
        title: t('planner.toast.activities_promoted', { count: result.promoted_activity_count }),
        description: result.errors.length > 0 ? t('planner.toast.errors_short', { count: result.errors.length }) : undefined,
        variant: result.errors.length > 0 ? 'error' : 'success',
      })
    } catch (err) {
      toast({ title: t('planner.toast.promote_failed'), description: extractApiError(err), variant: 'error' })
    }
  }

  const handleDelete = async (scenarioId: string) => {
    const ok = await confirmDialog({ title: 'Supprimer ce scénario ?', message: 'Le scénario sera archivé.', confirmLabel: 'Supprimer', variant: 'danger' })
    if (!ok) return
    await deleteScenario.mutateAsync(scenarioId)
  }

  const STATUS_BADGE: Record<string, string> = {
    draft: 'gl-badge-neutral',
    validated: 'gl-badge-info',
    promoted: 'gl-badge-success',
    archived: 'gl-badge-warning',
  }
  const STATUS_LABEL: Record<string, string> = {
    draft: 'Brouillon',
    validated: 'Validé',
    promoted: 'Promu',
    archived: 'Archivé',
  }

  return (
    <>
      {/* Stats + filter bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b border-border">
        <StatCard label="Total scénarios" value={total} icon={FlaskConical} />
        <StatCard label="Brouillons" value={scenarios.filter((s: Record<string, unknown>) => s.status === 'draft').length} icon={Pencil} accent="text-muted-foreground" />
        <StatCard label="Validés" value={scenarios.filter((s: Record<string, unknown>) => s.status === 'validated').length} icon={CheckCircle2} accent="text-blue-600 dark:text-blue-400" />
        <StatCard label="Promus" value={scenarios.filter((s: Record<string, unknown>) => s.status === 'promoted').length} icon={TrendingUp} accent="text-emerald-600 dark:text-emerald-400" />
      </div>

      <div className="flex flex-wrap items-center gap-2 gap-y-1.5 border-b border-border px-3.5 py-1.5 min-h-9 shrink-0">
        {['', 'draft', 'validated', 'promoted', 'archived'].map(s => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1) }}
            className={cn(
              'px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap',
              statusFilter === s ? 'bg-primary/[0.16] text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {s === '' ? 'Tous' : STATUS_LABEL[s] || s}
          </button>
        ))}
        <button
          onClick={() => setShowCreate(true)}
          className="ml-auto gl-button-sm gl-button-confirm flex items-center gap-1"
        >
          <Plus size={12} /> Nouveau scénario
        </button>
      </div>

      {/* Scenario list */}
      <PanelContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
        ) : scenarios.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground/50">
            <FlaskConical size={32} strokeWidth={1.5} />
            <span className="text-sm">Aucun scénario</span>
            <button onClick={() => setShowCreate(true)} className="gl-button gl-button-default inline-flex items-center gap-1.5 text-xs mt-1">
              <Plus size={12} /> Nouveau scénario
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {scenarios.map((s: Record<string, unknown>) => {
              const sid = s.id as string
              const isActive = activeScenarioId === sid
              const isReference = referenceScenario?.id === sid
              return (
                <div
                  key={sid}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 cursor-pointer group transition-colors',
                    isActive
                      ? 'bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                      : 'hover:bg-muted/30',
                  )}
                  onClick={() => openDynamicPanel({ type: 'detail', module: 'planner', id: sid, meta: { subtype: 'scenario' } })}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {isReference && (
                        <span title="Scénario de référence (plan actif)">
                          <Star size={11} className="text-amber-500 fill-amber-500 shrink-0" />
                        </span>
                      )}
                      <span className="text-sm font-medium text-foreground truncate">{s.title as string}</span>
                      <span className={cn('gl-badge text-[10px]', STATUS_BADGE[s.status as string] || 'gl-badge-neutral')}>
                        {STATUS_LABEL[s.status as string] || s.status as string}
                      </span>
                      {isActive && (
                        <span className="gl-badge text-[10px] gl-badge-warning">Vue active</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                      <span>{s.created_by_name as string || '—'}</span>
                      <span>{formatDateShort(s.created_at as string)}</span>
                      <span>{isReference ? 'Toutes les activités héritées' : `${(s.activity_count as number) || 0} activité${((s.activity_count as number) || 0) !== 1 ? 's' : ''}`}</span>
                      {(s.conflict_days as number) != null && (
                        <span className={cn((s.conflict_days as number) > 0 && 'text-red-500 font-medium')}>
                          {s.conflict_days as number}j conflit
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!isReference && (isActive ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); onActivateScenario?.(null) }}
                        className="px-2 py-1 rounded text-[10px] font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors shrink-0"
                        title="Revenir au plan de référence"
                      >
                        Désactiver
                      </button>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); onActivateScenario?.(sid) }}
                        className="gl-button-sm gl-button-ghost opacity-0 group-hover:opacity-100"
                        title="Activer ce scénario"
                      >
                        <Play size={9} className="inline mr-0.5" />Activer
                      </button>
                    ))}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {s.status === 'draft' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSimulate(sid) }}
                          className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary"
                          title="Simuler"
                          disabled={simulateScenario.isPending}
                        >
                          <FlaskConical size={13} />
                        </button>
                      )}
                      {canPromote && s.status === 'validated' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePromote(sid) }}
                          className="p-1.5 rounded hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-600"
                          title="Promouvoir en activités réelles (devient référence)"
                        >
                          <TrendingUp size={13} />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(sid) }}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        title={t('common.delete')}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </PanelContent>

      {/* Create scenario modal */}
      {showCreate && (
        <div className="gl-modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="gl-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-foreground">Nouveau scénario</h3>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Titre *</label>
              <input
                type="text"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                className="w-full h-8 px-2 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Ex: Ajout drilling Q3 Munja"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Description</label>
              <textarea
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                className="w-full min-h-[60px] px-2 py-1.5 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Optionnel — contexte ou objectif du scénario"
              />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button className="gl-button-sm gl-button-default" onClick={() => setShowCreate(false)}>{t('common.cancel')}</button>
              <button
                className="gl-button-sm gl-button-confirm"
                onClick={handleCreate}
                disabled={!createTitle.trim() || createScenario.isPending}
              >
                {createScenario.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
