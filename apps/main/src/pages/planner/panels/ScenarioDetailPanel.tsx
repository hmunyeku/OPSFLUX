/**
 * Scenario detail panel — PlannerPage.
 *
 * Extracted from the monolithic PlannerPage.tsx. Behavior preserved 1:1.
 */
import { useState, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Plus, Trash2, Loader2, FlaskConical, TrendingUp, CheckCircle2, XCircle,
  Star, Play, Info, CalendarDays, RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DynamicPanelShell,
  PanelContentLayout,
  FormSection,
  FormGrid,
  DetailFieldGrid,
  ReadOnlyRow,
  DynamicPanelField,
  panelInputClass,
  type ActionItem,
} from '@/components/layout/DynamicPanel'
import { TabBar } from '@/components/ui/Tabs'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import {
  useScenario,
  useUpdateScenario,
  useDeleteScenario,
  useSimulateScenarioPersistent,
  usePromoteScenario,
  useRestoreScenario,
  useAddScenarioActivity,
  useRemoveScenarioActivity,
  useReferenceScenario,
} from '@/hooks/usePlanner'
import { usePermission } from '@/hooks/usePermission'
import { formatDateOnly, extractApiError } from '../shared'
import { formatDate } from '@/lib/i18n'

export function ScenarioDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const confirm = useConfirm()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const [searchParams, setSearchParams] = useSearchParams()
  const activeScenarioInUrl = searchParams.get('scenario')
  const isThisScenarioActive = activeScenarioInUrl === id
  const { data: referenceScenario } = useReferenceScenario()
  const isReference = referenceScenario?.id === id

  const handleActivate = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (isThisScenarioActive) {
        next.delete('scenario')
      } else {
        next.set('scenario', id)
        next.set('tab', 'gantt')
      }
      return next
    }, { replace: true })
  }, [id, isThisScenarioActive, setSearchParams])

  const { data: scenario, isLoading, isError } = useScenario(id)
  const updateScenario = useUpdateScenario()
  const deleteScenario = useDeleteScenario()
  const simulateScenario = useSimulateScenarioPersistent()
  const promoteScenario = usePromoteScenario()
  const restoreScenario = useRestoreScenario()
  const addScenarioActivity = useAddScenarioActivity()
  const removeScenarioActivity = useRemoveScenarioActivity()
  const { hasPermission } = usePermission()
  const canPromote = hasPermission('planner.activity.create')

  const [detailTab, setDetailTab] = useState<'informations' | 'activites'>('informations')

  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ title: '', description: '' })
  const [showAddActivity, setShowAddActivity] = useState(false)
  const [addActivityForm, setAddActivityForm] = useState({
    title: '',
    type: 'project' as string,
    start_date: '',
    end_date: '',
    pax_quota: 1,
    notes: '',
  })

  useEffect(() => {
    if (isError && id) closeDynamicPanel()
  }, [isError, id, closeDynamicPanel])

  useEffect(() => {
    if (scenario) {
      setEditForm({ title: scenario.title || '', description: scenario.description || '' })
    }
  }, [scenario])

  const handleSave = useCallback(async () => {
    if (!editForm.title.trim()) return
    try {
      await updateScenario.mutateAsync({ id, payload: { title: editForm.title.trim(), description: editForm.description.trim() || undefined } })
      setEditing(false)
      toast({ title: 'Scénario mis à jour', variant: 'success' })
    } catch {
      toast({ title: t('planner.toast.error_generic'), variant: 'error' })
    }
  }, [id, editForm, updateScenario, toast, t])

  const handleStatusChange = useCallback(async (newStatus: string) => {
    try {
      await updateScenario.mutateAsync({ id, payload: { status: newStatus } })
      toast({ title: `Statut → ${newStatus}`, variant: 'success' })
    } catch {
      toast({ title: t('planner.toast.error_generic'), variant: 'error' })
    }
  }, [id, updateScenario, toast, t])

  const handleSimulate = useCallback(async () => {
    try {
      await simulateScenario.mutateAsync(id)
      toast({ title: t('planner.toast.simulation_done'), variant: 'success' })
    } catch (err) {
      toast({ title: t('planner.toast.simulation_failed'), description: extractApiError(err), variant: 'error' })
    }
  }, [id, simulateScenario, toast, t])

  const handlePromote = useCallback(async () => {
    const ok = await confirm({
      title: 'Promouvoir ce scénario ?',
      message: 'Les activités proposées seront converties en activités réelles. L\'état actuel du plan sera sauvegardé — vous pourrez Restaurer plus tard si besoin.',
      confirmLabel: 'Promouvoir',
      variant: 'warning',
    })
    if (!ok) return
    try {
      const result = await promoteScenario.mutateAsync(id)
      toast({
        title: t('planner.toast.activities_promoted', { count: result.promoted_activity_count }),
        variant: result.errors?.length > 0 ? 'error' : 'success',
      })
    } catch (err) {
      toast({ title: t('planner.toast.promote_failed'), description: extractApiError(err), variant: 'error' })
    }
  }, [id, promoteScenario, confirm, toast, t])

  const handleRestore = useCallback(async () => {
    const ok = await confirm({
      title: 'Restaurer le plan d\'avant ?',
      message: 'Annule la promotion : les activités modifiées reviennent à leur état antérieur, et celles créées par ce scénario seront annulées. Le scénario sera marqué Archivé.',
      confirmLabel: 'Restaurer',
      variant: 'warning',
    })
    if (!ok) return
    try {
      const result = await restoreScenario.mutateAsync(id)
      toast({
        title: `Plan restauré : ${result.restored_activities} activités revenues, ${result.cancelled_created_activities} annulées`,
        variant: result.errors?.length > 0 ? 'error' : 'success',
      })
    } catch (err) {
      toast({ title: 'Restauration échouée', description: extractApiError(err), variant: 'error' })
    }
  }, [id, restoreScenario, confirm, toast])

  const handleDelete = useCallback(async () => {
    const ok = await confirm({ title: 'Supprimer ce scénario ?', message: 'Le scénario sera archivé.', confirmLabel: 'Supprimer', variant: 'danger' })
    if (!ok) return
    await deleteScenario.mutateAsync(id)
    closeDynamicPanel()
  }, [id, deleteScenario, confirm, closeDynamicPanel])

  const handleAddScenarioActivity = useCallback(async () => {
    if (!addActivityForm.title.trim() || !addActivityForm.start_date || !addActivityForm.end_date) {
      toast({ title: 'Titre, date début et date fin sont requis', variant: 'error' })
      return
    }
    try {
      await addScenarioActivity.mutateAsync({
        scenarioId: id,
        payload: {
          title: addActivityForm.title.trim(),
          type: addActivityForm.type || undefined,
          start_date: addActivityForm.start_date,
          end_date: addActivityForm.end_date,
          pax_quota: addActivityForm.pax_quota > 0 ? addActivityForm.pax_quota : 1,
          notes: addActivityForm.notes.trim() || undefined,
        },
      })
      toast({ title: 'Activité ajoutée au scénario', variant: 'success' })
      setShowAddActivity(false)
      setAddActivityForm({ title: '', type: 'project', start_date: '', end_date: '', pax_quota: 1, notes: '' })
    } catch (err) {
      toast({ title: 'Erreur lors de l\'ajout', description: extractApiError(err), variant: 'error' })
    }
  }, [id, addActivityForm, addScenarioActivity, toast])

  const handleRemoveScenarioActivity = useCallback(async (activityId: string) => {
    try {
      await removeScenarioActivity.mutateAsync({ scenarioId: id, activityId })
      toast({ title: 'Activité retirée du scénario', variant: 'success' })
    } catch (err) {
      toast({ title: 'Erreur lors de la suppression', description: extractApiError(err), variant: 'error' })
    }
  }, [id, removeScenarioActivity, toast])

  if (isLoading || !scenario) {
    return (
      <DynamicPanelShell title="Chargement..." icon={<FlaskConical size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      </DynamicPanelShell>
    )
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

  const isPromoted = scenario.status === 'promoted'
  const isArchived = scenario.status === 'archived'
  const sim = scenario.last_simulation_result
  const overlayActivities = scenario.proposed_activities ?? []

  const actions: ActionItem[] = []
  if (!isPromoted && !isArchived) {
    actions.push({ id: 'simulate', label: 'Simuler', icon: FlaskConical, onClick: handleSimulate, disabled: simulateScenario.isPending })
  }
  if (scenario.status === 'draft') {
    actions.push({ id: 'validate', label: 'Valider', icon: CheckCircle2, onClick: () => handleStatusChange('validated') })
  }
  if (scenario.status === 'validated' && canPromote) {
    actions.push({ id: 'promote', label: 'Promouvoir', icon: TrendingUp, onClick: handlePromote, variant: 'primary' })
  }
  if (isPromoted && canPromote) {
    actions.push({
      id: 'restore',
      label: 'Restaurer',
      icon: RotateCcw,
      onClick: handleRestore,
      variant: 'primary',
      disabled: restoreScenario.isPending,
    })
  }
  if (!isPromoted) {
    actions.push({ id: 'delete', label: 'Supprimer', icon: Trash2, onClick: handleDelete, variant: 'danger' })
  }
  actions.unshift({
    id: 'activate',
    label: isThisScenarioActive ? 'Désactiver' : 'Activer',
    icon: isThisScenarioActive ? XCircle : Play,
    onClick: handleActivate,
    variant: isThisScenarioActive ? 'default' : 'primary',
  })

  return (
    <DynamicPanelShell
      title={scenario.title}
      icon={<FlaskConical size={14} className={isReference ? 'text-amber-500' : 'text-primary'} />}
      actionItems={actions}
    >
      <TabBar
        items={[
          { id: 'informations', label: 'Informations', icon: Info },
          { id: 'activites', label: 'Activites', icon: CalendarDays },
        ]}
        activeId={detailTab}
        onTabChange={(id) => setDetailTab(id as 'informations' | 'activites')}
        className="px-4 pt-3 pb-0"
      />
      <PanelContentLayout>
        {/* ── Tab: Informations ── */}
        {detailTab === 'informations' && (
        <>
        <FormSection title={t('common.identification')}>
          {editing ? (
            <FormGrid>
              <DynamicPanelField label={t('common.title_field')} required>
                <input className={panelInputClass} value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} autoFocus />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.description')} span="full">
                <textarea className={cn(panelInputClass, 'min-h-[60px]')} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
              </DynamicPanelField>
              <div className="col-span-full flex gap-2 justify-end">
                <button className="gl-button-sm gl-button-default" onClick={() => setEditing(false)}>{t('common.cancel')}</button>
                <button className="gl-button-sm gl-button-confirm" onClick={handleSave} disabled={!editForm.title.trim() || updateScenario.isPending}>
                  {updateScenario.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Enregistrer'}
                </button>
              </div>
            </FormGrid>
          ) : (
            <DetailFieldGrid>
              <ReadOnlyRow label="Titre" value={scenario.title} />
              <ReadOnlyRow label="Description" value={scenario.description || '—'} />
              <ReadOnlyRow label="Statut" value={
                <div className="flex items-center gap-1.5">
                  <span className={cn('gl-badge text-[10px]', STATUS_BADGE[scenario.status] || 'gl-badge-neutral')}>
                    {STATUS_LABEL[scenario.status] || scenario.status}
                  </span>
                  {isReference && (
                    <span className="gl-badge text-[10px] gl-badge-warning inline-flex items-center gap-1">
                      <Star size={9} className="fill-amber-500" /> Référence
                    </span>
                  )}
                  {isThisScenarioActive && (
                    <span className="gl-badge text-[10px] gl-badge-info">Vue active</span>
                  )}
                </div>
              } />
              <ReadOnlyRow label="Créé par" value={scenario.created_by_name || '—'} />
              <ReadOnlyRow label="Créé le" value={formatDate(scenario.created_at)} />
              {scenario.promoted_by_name && <ReadOnlyRow label="Promu par" value={scenario.promoted_by_name} />}
              {scenario.promoted_at && <ReadOnlyRow label="Promu le" value={formatDate(scenario.promoted_at)} />}
              {scenario.last_simulated_at && <ReadOnlyRow label="Dernière simulation" value={new Date(scenario.last_simulated_at).toLocaleString('fr-FR')} />}
              {!isPromoted && !isArchived && (
                <div className="col-span-full pt-1">
                  <button className="text-xs text-primary hover:underline" onClick={() => setEditing(true)}>{t('common.edit')}</button>
                </div>
              )}
            </DetailFieldGrid>
          )}
        </FormSection>

        {/* ── Simulation results ── */}
        {sim && (
          <FormSection title="Resultat simulation" defaultExpanded>
            <DetailFieldGrid>
              <ReadOnlyRow label="Jours de conflit" value={String(sim.conflict_days ?? '—')} />
              <ReadOnlyRow label="Debordement max" value={String(sim.worst_overflow ?? '—')} />
              {sim.total_pax != null && <ReadOnlyRow label="PAX total" value={String(sim.total_pax)} />}
              {sim.avg_occupancy != null && <ReadOnlyRow label="Occupation moy." value={`${Math.round(sim.avg_occupancy * 100)}%`} />}
            </DetailFieldGrid>
          </FormSection>
        )}
        </>)}

        {/* ── Tab: Activites ── */}
        {detailTab === 'activites' && (
        <>
        {/* ── Proposed activities ── */}
        <FormSection
          title={overlayActivities.length > 0
            ? `Modifications du scénario (${overlayActivities.length})`
            : `Activités héritées du plan (${scenario.activity_count ?? 0})`
          }
          defaultExpanded
          headerExtra={!isPromoted && !isArchived && (
            <button
              className="text-[10px] text-primary hover:underline inline-flex items-center gap-1"
              onClick={() => setShowAddActivity((v) => !v)}
            >
              <Plus size={10} /> Ajouter
            </button>
          )}
        >
          {showAddActivity && !isPromoted && !isArchived && (
            <div className="mb-3 rounded-lg border border-border bg-muted/20 p-3 space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Nouvelle activité dans le scénario</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="text-[10px] text-muted-foreground">Titre *</label>
                  <input type="text" className={cn(panelInputClass, 'mt-0.5')} value={addActivityForm.title} onChange={(e) => setAddActivityForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ex: Campagne forage P22" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Type</label>
                  <select className={cn(panelInputClass, 'mt-0.5')} value={addActivityForm.type} onChange={(e) => setAddActivityForm((f) => ({ ...f, type: e.target.value }))}>
                    <option value="project">Projet</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="drilling">Forage</option>
                    <option value="inspection">Inspection</option>
                    <option value="other">Autre</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">PAX quota</label>
                  <input type="number" min={1} className={cn(panelInputClass, 'mt-0.5')} value={addActivityForm.pax_quota} onChange={(e) => setAddActivityForm((f) => ({ ...f, pax_quota: Math.max(1, parseInt(e.target.value) || 1) }))} />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Date début *</label>
                  <input type="date" className={cn(panelInputClass, 'mt-0.5')} value={addActivityForm.start_date} onChange={(e) => setAddActivityForm((f) => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Date fin *</label>
                  <input type="date" className={cn(panelInputClass, 'mt-0.5')} value={addActivityForm.end_date} onChange={(e) => setAddActivityForm((f) => ({ ...f, end_date: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-muted-foreground">Notes</label>
                  <textarea className={cn(panelInputClass, 'mt-0.5 min-h-[40px]')} value={addActivityForm.notes} onChange={(e) => setAddActivityForm((f) => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button className="gl-button-sm gl-button-default text-xs" onClick={() => setShowAddActivity(false)}>{t('common.cancel')}</button>
                <button className="gl-button-sm gl-button-confirm text-xs" onClick={handleAddScenarioActivity} disabled={addScenarioActivity.isPending}>
                  {addScenarioActivity.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Ajouter'}
                </button>
              </div>
            </div>
          )}
          {/* Inherited activities count */}
          {!showAddActivity && overlayActivities.length === 0 && (
            <div className="rounded-md bg-muted/30 border border-border px-3 py-2 mb-2">
              <p className="text-[11px] text-muted-foreground">
                Ce scénario hérite de <strong className="text-foreground">{scenario.activity_count ?? 0}</strong> activité(s) du plan de référence.
                Cliquez <strong>"Activer"</strong> pour les voir dans le Gantt, ou <strong>"Ajouter"</strong> pour créer des activités spécifiques à ce scénario.
              </p>
            </div>
          )}
          {overlayActivities.length === 0 && !showAddActivity ? (
            <p className="text-xs text-muted-foreground py-2 text-center">Aucune modification ou nouvelle activité dans ce scénario</p>
          ) : (
            <div className="divide-y divide-border">
              {overlayActivities.map((act: Record<string, unknown>) => (
                <div key={act.id as string} className="py-2 px-1 flex items-start justify-between gap-2 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-foreground truncate">{(act.title as string) || (act.source_activity_title as string) || '—'}</span>
                      {Boolean(act.is_removed) && <span className="gl-badge gl-badge-danger text-[9px]">Supprimée</span>}
                      {Boolean(act.source_activity_id) && !act.is_removed && <span className="gl-badge gl-badge-neutral text-[9px]">Modifiée</span>}
                      {!act.source_activity_id && !act.is_removed && <span className="gl-badge gl-badge-info text-[9px]">Nouvelle</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                      {Boolean(act.asset_name) && <span>{String(act.asset_name)}</span>}
                      {Boolean(act.type) && <span className="capitalize">{String(act.type)}</span>}
                      {Boolean(act.start_date) && <span>{formatDateOnly(act.start_date as string)} → {formatDateOnly(act.end_date as string)}</span>}
                      {act.pax_quota != null && <span>{String(act.pax_quota)} PAX</span>}
                    </div>
                  </div>
                  {!isPromoted && !isArchived && (
                    <button
                      className="gl-button gl-button-danger opacity-0 group-hover:opacity-100"
                      title="Retirer du scénario"
                      onClick={() => handleRemoveScenarioActivity(act.id as string)}
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </FormSection>

        {/* ── How scenarios work ── */}
        <FormSection title="Comment fonctionne un scenario ?" collapsible defaultExpanded={overlayActivities.length === 0}>
          <div className="text-xs text-muted-foreground space-y-2 leading-relaxed">
            <p><span className="font-semibold text-foreground">1. Creer</span> — Un scenario est un plan alternatif ("et si ?"). Il ne touche pas au plan en cours.</p>
            <p><span className="font-semibold text-foreground">2. Ajouter des activites</span> — Cliquez "Ajouter" pour creer des activites propres a ce scenario, ou depuis le Gantt, selectionnez une activite et choisissez "Ajouter au scenario".</p>
            <p><span className="font-semibold text-foreground">3. Simuler</span> — Lance un calcul de conflits de capacite pour evaluer la faisabilite du scenario.</p>
            <p><span className="font-semibold text-foreground">4. Valider &rarr; Promouvoir</span> — Passer a "Valide" pour review, puis "Promouvoir" convertit les activites du scenario en activites reelles dans le plan.</p>
            <p><span className="font-semibold text-foreground">5. Restaurer</span> — Si un scenario promu pose probleme, "Restaurer" annule la promotion et revient a l'etat precedent.</p>
          </div>
        </FormSection>
        </>)}
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}
