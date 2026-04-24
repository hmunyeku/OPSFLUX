/**
 * Advanced sections of ProjectDetailPanel — separated to keep the
 * main panel under the 2k-line mark:
 *
 *   - WbsSection           : Work Breakdown Structure tree editor
 *   - CpmSection           : Critical Path Method analysis
 *   - PlanningRevisionsSection : baseline snapshots + apply/delete
 *   - SubProjectsSection   : hierarchical sub-project list
 *
 * These blocks were lifted verbatim from ProjectDetailPanel.tsx so
 * behaviour is identical — they just live in their own file now.
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Loader2, Plus, Zap, ChevronRight,
  GitBranch, X, Camera, FlaskConical, Layers, FolderKanban, Play, Star,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  FormSection,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { useUIStore } from '@/stores/uiStore'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import {
  useSubProjects,
  usePlanningRevisions, useCreateRevision, useApplyRevision, useDeleteRevision,
  useWbsNodes, useCreateWbsNode, useDeleteWbsNode,
  useProjectCpm,
} from '@/hooks/useProjets'
import type {
  ProjectWBSNode, CPMTaskInfo, PlanningRevision,
} from '@/types/api'

// Fallback labels used when the Dictionary service doesn't provide
// translations for a status code. Duplicated from ProjectDetailPanel
// so the advanced sections stay self-contained.
const PROJECT_STATUS_LABELS_FALLBACK: Record<string, string> = {
  planning: 'Planification',
  in_progress: 'En cours',
  on_hold: 'En pause',
  completed: 'Terminé',
  cancelled: 'Annulé',
}

// -- WBS Section (Work Breakdown Structure) ----------------------------------

export function WbsSection({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const { data: nodes = [] } = useWbsNodes(projectId)
  const createNode = useCreateWbsNode()
  const deleteNode = useDeleteWbsNode()
  const { toast } = useToast()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<{ parent_id: string; code: string; name: string; budget: string }>({
    parent_id: '', code: '', name: '', budget: '',
  })

  // Build a tree structure for rendering
  const tree = useMemo(() => {
    const byParent = new Map<string | null, ProjectWBSNode[]>()
    for (const n of nodes) {
      const key = n.parent_id
      if (!byParent.has(key)) byParent.set(key, [])
      byParent.get(key)!.push(n)
    }
    for (const arr of byParent.values()) arr.sort((a, b) => a.order - b.order || a.code.localeCompare(b.code))
    return byParent
  }, [nodes])

  const handleCreate = async () => {
    if (!form.code.trim() || !form.name.trim()) return
    try {
      await createNode.mutateAsync({
        projectId,
        payload: {
          parent_id: form.parent_id || null,
          code: form.code.trim(),
          name: form.name.trim(),
          budget: form.budget ? Number(form.budget) : null,
        },
      })
      toast({ title: t('projets.toast.wbs_node_created'), variant: 'success' })
      setForm({ parent_id: '', code: '', name: '', budget: '' })
      setShowAdd(false)
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? t('projets.toast.error')
      toast({ title: t('projets.toast.creation_failed'), description: String(msg), variant: 'error' })
    }
  }

  const renderNode = (node: ProjectWBSNode, depth: number): React.ReactNode => {
    const children = tree.get(node.id) ?? []
    return (
      <div key={node.id}>
        <div
          className="group flex items-center gap-1.5 text-[11px] py-1 px-1.5 rounded hover:bg-muted/40"
          style={{ paddingLeft: `${depth * 12 + 6}px` }}
        >
          <GitBranch size={10} className="text-primary shrink-0" />
          <span className="font-mono text-[10px] text-muted-foreground">{node.code}</span>
          <span className="flex-1 truncate">{node.name}</span>
          {node.task_count! > 0 && (
            <span className="text-[9px] text-muted-foreground">{node.task_count} t.</span>
          )}
          {node.budget != null && (
            <span className="text-[9px] text-muted-foreground tabular-nums">
              {node.budget.toLocaleString('fr-FR')} XAF
            </span>
          )}
          {node.cost_center_name && (
            <span className="text-[9px] px-1 rounded bg-muted text-muted-foreground">{node.cost_center_name}</span>
          )}
          <button
            onClick={() => deleteNode.mutate({ projectId, nodeId: node.id })}
            className="p-0.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100"
            title="Archiver le nœud"
          >
            <X size={10} />
          </button>
        </div>
        {children.map(c => renderNode(c, depth + 1))}
      </div>
    )
  }

  const roots = tree.get(null) ?? []

  return (
    <FormSection
      title={`WBS — Structure de découpage (${nodes.length})`}
      collapsible
      defaultExpanded={false}
      storageKey="project-detail-wbs"
    >
      {roots.length === 0 && !showAdd && (
        <div className="text-[11px] text-muted-foreground italic mb-2">
          Aucun nœud WBS. Créez une structure hiérarchique pour organiser les tâches
          par lots de travail et centres de coûts.
        </div>
      )}
      {roots.length > 0 && (
        <div className="border border-border rounded mb-2">
          {roots.map(r => renderNode(r, 0))}
        </div>
      )}

      {showAdd ? (
        <div className="border border-primary/30 rounded p-2 bg-primary/5 space-y-1.5">
          <select
            value={form.parent_id}
            onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))}
            className={`${panelInputClass} w-full text-xs`}
          >
            <option value="">(nœud racine)</option>
            {nodes.map(n => <option key={n.id} value={n.id}>{n.code} — {n.name}</option>)}
          </select>
          <div className="grid grid-cols-[90px_1fr] gap-1.5">
            <input
              type="text"
              value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
              className={`${panelInputClass} text-xs`}
              placeholder={t('projets.placeholders.lot_code')}
              autoFocus
            />
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className={`${panelInputClass} text-xs`}
              placeholder={t('projets.placeholders.lot_name')}
            />
          </div>
          <input
            type="number"
            value={form.budget}
            onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
            className={`${panelInputClass} w-full text-xs`}
            placeholder={t('projets.placeholders.lot_budget')}
            step="any"
          />
          <div className="flex justify-end gap-1">
            <button onClick={() => setShowAdd(false)} className="px-2 py-0.5 text-[10px] rounded hover:bg-muted text-muted-foreground">
              Annuler
            </button>
            <button
              onClick={handleCreate}
              disabled={!form.code.trim() || !form.name.trim() || createNode.isPending}
              className="gl-button-sm gl-button-confirm text-[10px]"
            >
              {createNode.isPending ? <Loader2 size={9} className="animate-spin inline" /> : 'Créer'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80"
        >
          <Plus size={10} /> Ajouter un nœud
        </button>
      )}
    </FormSection>
  )
}

// -- CPM Section (Critical Path Method) --------------------------------------

export function CpmSection({ projectId }: { projectId: string }) {
  const { data: cpm, isLoading } = useProjectCpm(projectId)

  return (
    <FormSection
      title="Chemin critique (CPM)"
      collapsible
      defaultExpanded={false}
      storageKey="project-detail-cpm"
    >
      {isLoading && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-2">
          <Loader2 size={12} className="animate-spin" /> Calcul en cours…
        </div>
      )}
      {cpm && cpm.tasks.length === 0 && (
        <div className="text-[11px] text-muted-foreground italic">
          Aucune tâche à analyser. Créez des tâches et leurs dépendances pour voir le chemin critique.
        </div>
      )}
      {cpm && cpm.tasks.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
            <div className="border border-primary/30 bg-primary/5 rounded p-2">
              <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Durée totale</div>
              <div className="text-lg font-semibold tabular-nums text-primary">{cpm.project_duration_days} j</div>
            </div>
            <div className="border border-red-500/30 bg-red-500/5 rounded p-2">
              <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Tâches critiques</div>
              <div className="text-lg font-semibold tabular-nums text-red-600">{cpm.critical_path_task_ids.length}</div>
            </div>
            <div className="border border-border rounded p-2">
              <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Tâches totales</div>
              <div className="text-lg font-semibold tabular-nums">{cpm.tasks.length}</div>
            </div>
          </div>
          {cpm.has_cycles && (
            <div className="flex items-start gap-1.5 text-[10px] p-1.5 rounded bg-red-500/10 border border-red-500/30 text-red-700">
              <Zap size={10} className="mt-0.5 shrink-0" />
              <span>Cycle détecté dans les dépendances — CPM partiel. Vérifiez les liens.</span>
            </div>
          )}
          {cpm.warnings.length > 0 && !cpm.has_cycles && (
            <div className="text-[10px] text-orange-600">
              {cpm.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
            </div>
          )}
          <div className="border border-border rounded overflow-hidden">
            <div className="grid grid-cols-[1fr_40px_40px_40px_40px] gap-1 px-2 py-1 bg-muted/50 text-[9px] font-semibold uppercase text-muted-foreground">
              <span>Tâche</span>
              <span className="text-right">ES</span>
              <span className="text-right">EF</span>
              <span className="text-right">Slack</span>
              <span className="text-right">Dur.</span>
            </div>
            <div className="max-h-[240px] overflow-y-auto">
              {cpm.tasks
                .slice()
                .sort((a, b) => {
                  if (a.is_critical !== b.is_critical) return a.is_critical ? -1 : 1
                  return a.early_start - b.early_start
                })
                .map((t: CPMTaskInfo) => (
                  <div
                    key={t.id}
                    className={cn(
                      'grid grid-cols-[1fr_40px_40px_40px_40px] gap-1 px-2 py-1 text-[10px] border-t border-border/30',
                      t.is_critical && 'bg-red-500/5',
                    )}
                  >
                    <span className="truncate flex items-center gap-1">
                      {t.is_critical && <Zap size={9} className="text-red-500 shrink-0" />}
                      {t.title}
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">J{t.early_start}</span>
                    <span className="text-right tabular-nums text-muted-foreground">J{t.early_finish}</span>
                    <span className={cn('text-right tabular-nums', t.slack === 0 ? 'text-red-500 font-semibold' : 'text-muted-foreground')}>
                      {t.slack}j
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">{t.duration_days}j</span>
                  </div>
                ))}
            </div>
          </div>
          <div className="text-[9px] text-muted-foreground italic">
            ES = début au plus tôt · EF = fin au plus tôt · Slack = marge totale (0 = critique)
          </div>
        </div>
      )}
    </FormSection>
  )
}

// -- Planning Revisions Section (in ProjectDetailPanel) ----------------------

export function PlanningRevisionsSection({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const { data: revisions = [] } = usePlanningRevisions(projectId)
  const createRev = useCreateRevision()
  const applyRev = useApplyRevision()
  const deleteRev = useDeleteRevision()
  const { toast } = useToast()
  const [creating, setCreating] = useState<null | 'baseline' | 'simulation'>(null)
  const [revName, setRevName] = useState('')
  const [revDesc, setRevDesc] = useState('')

  const handleCreate = async () => {
    if (!revName.trim() || !creating) return
    try {
      await createRev.mutateAsync({
        projectId,
        payload: {
          name: revName.trim(),
          description: revDesc.trim() || null,
          is_simulation: creating === 'simulation',
        },
      })
      toast({
        title: creating === 'simulation' ? 'Simulation créée' : 'Référence créée',
        variant: 'success',
      })
      setCreating(null)
      setRevName('')
      setRevDesc('')
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? t('projets.toast.error')
      toast({ title: t('projets.toast.revision_creation_error'), description: String(msg), variant: 'error' })
    }
  }

  const handleApply = async (rev: PlanningRevision) => {
    try {
      await applyRev.mutateAsync({ projectId, revisionId: rev.id })
      toast({ title: `Révision "${rev.name}" activée`, variant: 'success' })
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? t('projets.toast.error')
      toast({ title: t('projets.toast.revision_apply_failed'), description: String(msg), variant: 'error' })
    }
  }

  return (
    <FormSection
      title={`Révisions de planning (${revisions.length})`}
      collapsible
      defaultExpanded={false}
      storageKey="project-detail-revisions"
    >
      {revisions.length === 0 && !creating && (
        <div className="text-[11px] text-muted-foreground italic mb-2">
          Aucune révision. Créez une référence (baseline) pour figer le planning actuel,
          ou une simulation pour tester des scénarios "what-if".
        </div>
      )}

      {revisions.length > 0 && (
        <div className="space-y-1 mb-2">
          {revisions.map((rev: PlanningRevision) => (
            <div
              key={rev.id}
              className={cn(
                'group flex items-center gap-2 px-2 py-1.5 rounded border text-[11px]',
                rev.is_active ? 'border-primary/30 bg-primary/5' : 'border-border hover:bg-muted/40',
              )}
            >
              {rev.is_active
                ? <Star size={11} className="text-primary shrink-0 fill-primary" />
                : rev.is_simulation
                  ? <FlaskConical size={11} className="text-orange-500 shrink-0" />
                  : <Camera size={11} className="text-muted-foreground shrink-0" />}
              <span className="font-medium">#{rev.revision_number}</span>
              <span className="flex-1 truncate">{rev.name}</span>
              {rev.is_simulation && (
                <span className="text-[9px] px-1 py-0 rounded bg-orange-500/10 text-orange-600 border border-orange-500/20">
                  Simulation
                </span>
              )}
              {rev.is_active && (
                <span className="text-[9px] px-1 py-0 rounded bg-primary/10 text-primary border border-primary/20">
                  Active
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">
                {new Date(rev.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
              </span>
              {!rev.is_active && (
                <button
                  onClick={() => handleApply(rev)}
                  disabled={applyRev.isPending}
                  className="p-0.5 rounded hover:bg-primary/10 text-primary disabled:opacity-30"
                  title="Activer cette révision"
                >
                  <Play size={10} />
                </button>
              )}
              {!rev.is_active && (
                <button
                  onClick={() => deleteRev.mutate({ projectId, revisionId: rev.id })}
                  className="p-0.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100"
                  title="Supprimer"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {creating ? (
        <div className="border border-primary/30 rounded p-2 bg-primary/5 space-y-1.5">
          <div className="text-[10px] font-medium text-primary flex items-center gap-1">
            {creating === 'simulation' ? <FlaskConical size={10} /> : <Camera size={10} />}
            Nouvelle {creating === 'simulation' ? 'simulation' : 'référence (baseline)'}
          </div>
          <input
            type="text"
            value={revName}
            onChange={e => setRevName(e.target.value)}
            className={`${panelInputClass} w-full text-xs`}
            placeholder={t('projets.placeholders.revision_name')}
            autoFocus
          />
          <textarea
            value={revDesc}
            onChange={e => setRevDesc(e.target.value)}
            className={`${panelInputClass} w-full text-xs min-h-[36px] resize-y`}
            placeholder={t('projets.placeholders.revision_desc_optional')}
            rows={2}
          />
          <div className="flex justify-end gap-1">
            <button
              onClick={() => { setCreating(null); setRevName(''); setRevDesc('') }}
              className="px-2 py-0.5 text-[10px] rounded hover:bg-muted text-muted-foreground"
            >
              Annuler
            </button>
            <button
              onClick={handleCreate}
              disabled={!revName.trim() || createRev.isPending}
              className="gl-button-sm gl-button-confirm text-[10px]"
            >
              {createRev.isPending ? <Loader2 size={9} className="animate-spin inline" /> : 'Créer'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCreating('baseline')}
            className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80"
          >
            <Camera size={10} /> Nouvelle référence
          </button>
          <span className="text-muted-foreground">·</span>
          <button
            onClick={() => setCreating('simulation')}
            className="flex items-center gap-1 text-[10px] text-orange-600 hover:text-orange-500"
          >
            <FlaskConical size={10} /> Nouvelle simulation
          </button>
        </div>
      )}
    </FormSection>
  )
}
// -- Sub-Projects Section (for detail panel) ----------------------------------

export function SubProjectsSection({ projectId }: { projectId: string }) {
  const { data: children, isLoading } = useSubProjects(projectId)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const projectStatusLabels = useDictionaryLabels('project_status', PROJECT_STATUS_LABELS_FALLBACK)

  if (isLoading) return <div className="text-xs text-muted-foreground py-2"><Loader2 size={12} className="animate-spin inline mr-1" />Chargement...</div>
  if (!children || children.length === 0) return <EmptyState icon={Layers} title="Aucun sous-projet" variant="search" size="compact" />

  return (
    <div className="border border-border rounded-md overflow-hidden">
      {children.map((child) => (
        <div
          key={child.id}
          className="flex items-center gap-2 px-2.5 py-2 text-xs hover:bg-muted/40 transition-colors cursor-pointer border-b border-border/60 last:border-0"
          onClick={() => openDynamicPanel({ type: 'detail', module: 'projets', id: child.id })}
        >
          <FolderKanban size={11} className="text-primary shrink-0" />
          <span className="font-medium">{child.code}</span>
          <span className="text-muted-foreground truncate flex-1">{child.name}</span>
          <span className={cn('gl-badge', child.status === 'active' ? 'gl-badge-success' : 'gl-badge-neutral')}>
            {projectStatusLabels[child.status] ?? child.status}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">{child.progress}%</span>
          <ChevronRight size={12} className="text-muted-foreground" />
        </div>
      ))}
    </div>
  )
}
