/**
 * Create Project panel.
 *
 * Extracted from ProjetsPage.tsx — pure restructure, no behavior changes.
 */
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderKanban, Loader2, Plus, Trash2, Flag, ListTodo } from 'lucide-react'
import { normalizeNames } from '@/lib/normalize'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormGrid,
  PanelActionButton,
  TagSelector,
  panelInputClass,
  PanelContentLayout,
  SectionColumns,
} from '@/components/layout/DynamicPanel'
import {
  SmartFormProvider,
  SmartFormSection,
  SmartFormToolbar,
  SmartFormSimpleHint,
  SmartFormWizardNav,
  SmartFormInlineHelpDrawer,
} from '@/components/layout/SmartForm'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { ExternalRefManager } from '@/components/shared/ExternalRefManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { ProjectPicker } from '@/components/shared/ProjectPicker'
import { RichTextField } from '@/components/shared/RichTextField'
import { TagManager } from '@/components/shared/TagManager'
import { useCreateProject } from '@/hooks/useProjets'
import { useCurrentEntity } from '@/hooks/useEntities'
import { useStagingRef } from '@/hooks/useStagingRef'
import type { ProjectCreate, ProgressWeightMethod, ProjectInitialTask } from '@/types/api'
import { PROGRESS_WEIGHT_METHOD_OPTIONS } from '@/types/api'
import {
  PROJECT_STATUS_VALUES, PROJECT_PRIORITY_VALUES,
  PROJECT_STATUS_LABELS_FALLBACK, PROJECT_PRIORITY_LABELS_FALLBACK,
  buildDictionaryOptions,
} from '../shared'

export function CreateProjectPanel() {
  const { t } = useTranslation()
  const createProject = useCreateProject()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { toast } = useToast()
  const projectStatusLabels = useDictionaryLabels('project_status', PROJECT_STATUS_LABELS_FALLBACK)
  const projectPriorityLabels = useDictionaryLabels('project_priority', PROJECT_PRIORITY_LABELS_FALLBACK)
  const projectStatusOptions = useMemo(() => buildDictionaryOptions(projectStatusLabels, PROJECT_STATUS_VALUES), [projectStatusLabels])
  const projectPriorityOptions = useMemo(() => buildDictionaryOptions(projectPriorityLabels, PROJECT_PRIORITY_VALUES), [projectPriorityLabels])
  // Used to label the "no override" option of the progress weight method
  // picker as "Standard (CODE_ENTITE)" so the user knows which fallback
  // they get (configured in Paramètres → Projets per entity).
  const currentEntity = useCurrentEntity()
  const standardLabel = currentEntity?.code ? `Standard (${currentEntity.code})` : 'Standard'
  // Staging — pre-attach pièces jointes & rich-text images before the
  // project exists. On create, the backend re-targets every row with
  // `owner_type='project_staging'` + `owner_id=stagingRef` to the new project.
  const { stagingRef, stagingOwnerType } = useStagingRef('project')
  // Initial tasks — FK-linked, local state, sent in payload on submit.
  const [initialTasks, setInitialTasks] = useState<ProjectInitialTask[]>([])
  const [taskDraftTitle, setTaskDraftTitle] = useState('')
  const [taskDraftPriority, setTaskDraftPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
  const [taskDraftDueDate, setTaskDraftDueDate] = useState<string>('')
  const [taskDraftIsMilestone, setTaskDraftIsMilestone] = useState(false)
  const addTaskDraft = () => {
    const title = taskDraftTitle.trim()
    if (!title) return
    setInitialTasks((prev) => [
      ...prev,
      {
        title,
        priority: taskDraftPriority,
        due_date: taskDraftDueDate || null,
        is_milestone: taskDraftIsMilestone,
      },
    ])
    setTaskDraftTitle('')
    setTaskDraftDueDate('')
    setTaskDraftIsMilestone(false)
  }
  const removeTask = (idx: number) =>
    setInitialTasks((prev) => prev.filter((_, i) => i !== idx))
  // Form state allows asset_id to be empty (null) during edition; we
  // re-validate in handleSubmit before sending to the backend, where the
  // schema requires it (spec §1.4).
  // Form state allows asset_id to be empty (null) during edition; we
  // re-validate in handleSubmit before sending to the backend, where the
  // schema requires it (spec §1.4).
  const [form, setForm] = useState<Omit<ProjectCreate, 'asset_id'> & { asset_id: string | null }>({
    name: '',
    description: null,
    status: 'draft',
    priority: 'medium',
    weather: 'sunny',
    start_date: null,
    end_date: null,
    budget: null,
    manager_id: null,
    parent_id: null,
    tier_id: null,
    asset_id: null,
    // null → backend uses the entity-scoped admin default
    // (`projets.default_progress_weight_method`).
    progress_weight_method: null,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Spec §1.4: site/installation obligatoire pour création native.
    if (!form.asset_id) {
      toast({ title: t('projets.errors.asset_required', 'Site / installation obligatoire'), variant: 'error' })
      return
    }
    try {
      // Narrow the form type — asset_id is non-null at this point.
      const payload: ProjectCreate = {
        ...form,
        asset_id: form.asset_id,
        staging_ref: stagingRef,
        initial_tasks: initialTasks,
      }
      await createProject.mutateAsync(normalizeNames(payload))
      closeDynamicPanel()
      toast({ title: t('projets.toast.project_created'), variant: 'success' })
    } catch {
      toast({ title: t('projets.toast.error'), variant: 'error' })
    }
  }

  return (
    <DynamicPanelShell
      title="Nouveau projet"
      subtitle="Projets"
      icon={<FolderKanban size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createProject.isPending}
            onClick={() => (document.getElementById('create-project-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createProject.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-project-form" onSubmit={handleSubmit}>
        <SmartFormProvider panelId="create-project" defaultMode="simple">
          <SmartFormToolbar />
          <SmartFormSimpleHint />

        <PanelContentLayout>
          <SectionColumns>
            <div className="@container space-y-5">
              <SmartFormSection
                id="identification"
                title={t('common.identification')}
                level="essential"
                help={{
                  description:
                    'Identité du projet : nom lisible pour les équipes, site/installation de rattachement, et macro-projet parent le cas échéant.',
                  tips: [
                    'Le code est auto-généré au format PRJ-AA-NNNNNN — vous ne pouvez pas le modifier.',
                    'Choisir un site/installation est obligatoire : il détermine qui peut voir et éditer le projet (RBAC par site).',
                    "Lier à un macro-projet quand le projet est un sous-ensemble d'un programme plus large — les indicateurs remontent automatiquement.",
                  ],
                }}
              >
                <FormGrid>
                  <DynamicPanelField label={t('common.code_field')}>
                    <span className="text-sm font-mono text-muted-foreground italic">Auto-généré à la création</span>
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.name_field')} required>
                    <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={panelInputClass} placeholder="Nom du projet" />
                  </DynamicPanelField>
                  <DynamicPanelField label="Macro-projet (parent)">
                    <ProjectPicker
                      value={form.parent_id || null}
                      onChange={(id) => setForm({ ...form, parent_id: id || null })}
                      filterStatus={['draft', 'planned', 'active', 'on_hold']}
                      clearable
                      placeholder="Aucun (projet indépendant)"
                    />
                  </DynamicPanelField>
                  <DynamicPanelField label="Site / installation" required>
                    <AssetPicker
                      value={form.asset_id || null}
                      onChange={(id) => setForm({ ...form, asset_id: id || null })}
                      label="Site / installation"
                    />
                  </DynamicPanelField>
                </FormGrid>
              </SmartFormSection>

              <SmartFormSection
                id="planning"
                title={t('common.planning')}
                level="advanced"
                skippable
                help={{
                  description:
                    'Dates prévisionnelles et budget indicatif. Ces valeurs peuvent être ajustées ensuite ; laissez-les vides pour un brouillon initial.',
                  tips: [
                    "Les dates définissent l'axe du Gantt et servent au calcul d'écarts planning.",
                    'Le budget est capturé en devise de l\'entité (XAF par défaut). Utilisez les imputations pour répartir entre centres de coût.',
                    'Vous pouvez créer un projet sans dates si le planning n\'est pas encore défini.',
                  ],
                }}
              >
                <DateRangePicker
                  startDate={form.start_date?.split('T')[0] ?? null}
                  endDate={form.end_date?.split('T')[0] ?? null}
                  onStartChange={(v) => setForm({ ...form, start_date: v || null })}
                  onEndChange={(v) => setForm({ ...form, end_date: v || null })}
                />
                <DynamicPanelField label="Budget">
                  <input type="number" step="any" value={form.budget ?? ''} onChange={(e) => setForm({ ...form, budget: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} placeholder="0" />
                </DynamicPanelField>
              </SmartFormSection>
            </div>

            <div className="@container space-y-5">
              <SmartFormSection
                id="status"
                title={t('common.status')}
                level="advanced"
                skippable
                help={{
                  description: 'Statut du projet dans le cycle de vie.',
                  items: [
                    { label: 'Draft', text: 'Brouillon — non visible dans les rapports, en cours de définition.' },
                    { label: 'Planned', text: 'Validé, démarrage prévu. Visible pour tous mais non démarré.' },
                    { label: 'Active', text: 'En cours d\'exécution — l\'avancement est comptabilisé.' },
                    { label: 'On hold', text: 'Suspendu temporairement (manque ressources, décision pendante...).' },
                    { label: 'Completed', text: 'Terminé à 100%, livré. En lecture seule.' },
                    { label: 'Cancelled', text: 'Annulé avant achèvement. Archive le projet.' },
                  ],
                }}
              >
                <TagSelector options={projectStatusOptions} value={form.status || 'draft'} onChange={(v) => setForm({ ...form, status: v })} />
              </SmartFormSection>

              <SmartFormSection
                id="priority"
                title={t('common.priority_field')}
                level="advanced"
                skippable
                help={{
                  description: "Niveau de priorité — détermine l'ordre de traitement et influence le tri dans les listes.",
                  items: [
                    { label: 'Low', text: 'Peut attendre. Pas de ressources dédiées nécessaires.' },
                    { label: 'Medium', text: 'Priorité normale — valeur par défaut pour la plupart des projets.' },
                    { label: 'High', text: 'À traiter rapidement. Remonte en haut des filtres par défaut.' },
                    { label: 'Critical', text: 'Urgent. Alertes automatiques en cas de retard, escalade management.' },
                  ],
                }}
              >
                <TagSelector options={projectPriorityOptions} value={form.priority || 'medium'} onChange={(v) => setForm({ ...form, priority: v })} />
              </SmartFormSection>

              <SmartFormSection
                id="progress"
                title="Avancement"
                level="advanced"
                collapsible
                defaultExpanded
                skippable
                help={{
                  description: "Méthode de calcul de l'avancement du projet à partir de l'avancement des tâches.",
                  items: [
                    { label: 'Standard (entité)', text: "Utilise le réglage défini dans Paramètres → Projets. Choisir ceci dans 90% des cas." },
                    { label: 'Equal', text: 'Moyenne simple : chaque tâche compte pour 1/N dans l\'avancement.' },
                    { label: 'Effort', text: "Pondération par estimated_hours — les tâches plus lourdes comptent davantage." },
                    { label: 'Duration', text: 'Pondération par durée (end_date − start_date) — tâches longues = plus de poids.' },
                    { label: 'Manual', text: 'Chaque tâche a un poids explicite dans son champ weight. Pour cas exceptionnels.' },
                  ],
                }}
              >
                <p className="text-[11px] text-muted-foreground mb-2">
                  Comment l'avancement du projet sera calculé à partir de l'avancement de chaque tâche. Laissez sur « {standardLabel} » pour utiliser le réglage entité.
                </p>
                <DynamicPanelField label="Méthode de calcul">
                  <select
                    value={form.progress_weight_method || ''}
                    onChange={(e) => setForm({ ...form, progress_weight_method: (e.target.value || null) as ProgressWeightMethod | null })}
                    className={panelInputClass}
                  >
                    <option value="">{standardLabel}</option>
                    {PROGRESS_WEIGHT_METHOD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </DynamicPanelField>
                {form.progress_weight_method && (
                  <p className="text-[11px] text-muted-foreground/80 italic mt-1.5">
                    {PROGRESS_WEIGHT_METHOD_OPTIONS.find((o) => o.value === form.progress_weight_method)?.description}
                  </p>
                )}
              </SmartFormSection>

              <SmartFormSection
                id="description"
                title={t('common.description')}
                level="essential"
                collapsible
                defaultExpanded={false}
                skippable
                help={{
                  description: 'Description libre du projet : contexte, objectifs, livrables attendus.',
                  tips: [
                    'Utilisez les tableaux pour structurer les livrables ou étapes clés.',
                    'Glissez une image depuis votre bureau ou collez-la (Ctrl+V) pour l\'intégrer.',
                    'Le bouton plein écran agrandit l\'éditeur pour les descriptions longues.',
                  ],
                }}
              >
                <RichTextField
                  value={form.description ?? ''}
                  onChange={(html) => setForm({ ...form, description: html || null })}
                  rows={4}
                  placeholder="Description du projet..."
                  imageOwnerType={stagingOwnerType}
                  imageOwnerId={stagingRef}
                />
              </SmartFormSection>

              <SmartFormSection
                id="initial_tasks"
                title={`${t('projets.initial_tasks', 'Tâches initiales')} (${initialTasks.length})`}
                level="advanced"
                collapsible
                defaultExpanded={false}
                skippable
                help={{
                  description: "Pré-charger le projet avec ses premières tâches ou jalons, créés dans la même transaction.",
                  tips: [
                    "Entrée sur le champ Titre = ajoute à la liste directement.",
                    "Cochez 'Jalon' pour un point de contrôle sans durée (start_date = due_date).",
                    "Affiner les détails (assignataire, progress, sous-tâches...) depuis la vue détail après création.",
                  ],
                }}
              >
                {initialTasks.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {initialTasks.map((task, idx) => (
                      <div
                        key={`${task.title}-${idx}`}
                        className="flex items-center justify-between gap-2 rounded border border-border bg-card px-2 py-1.5"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {task.is_milestone ? (
                            <Flag size={12} className="text-amber-500 shrink-0" />
                          ) : (
                            <ListTodo size={12} className="text-muted-foreground shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{task.title}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {[
                                task.priority,
                                task.due_date,
                                task.is_milestone ? t('projets.milestone', 'Jalon') : null,
                              ]
                                .filter(Boolean)
                                .join(' • ')}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeTask(idx)}
                          className="p-1 text-muted-foreground hover:text-destructive shrink-0"
                          title={t('common.delete') as string}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2 rounded-md border border-border bg-card p-2">
                  <input
                    type="text"
                    value={taskDraftTitle}
                    onChange={(e) => setTaskDraftTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTaskDraft()
                      }
                    }}
                    className={panelInputClass}
                    placeholder={t('projets.task_title_placeholder', 'Titre de la tâche…') as string}
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={taskDraftPriority}
                      onChange={(e) =>
                        setTaskDraftPriority(e.target.value as 'low' | 'medium' | 'high' | 'critical')
                      }
                      className="gl-form-select text-xs h-7"
                    >
                      <option value="low">{t('projets.priority.low', 'Basse')}</option>
                      <option value="medium">{t('projets.priority.medium', 'Moyenne')}</option>
                      <option value="high">{t('projets.priority.high', 'Haute')}</option>
                      <option value="critical">{t('projets.priority.critical', 'Critique')}</option>
                    </select>
                    <input
                      type="date"
                      value={taskDraftDueDate}
                      onChange={(e) => setTaskDraftDueDate(e.target.value)}
                      className="gl-form-input text-xs h-7"
                    />
                    <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={taskDraftIsMilestone}
                        onChange={(e) => setTaskDraftIsMilestone(e.target.checked)}
                      />
                      {t('projets.is_milestone', 'Jalon')}
                    </label>
                    <button
                      type="button"
                      onClick={addTaskDraft}
                      disabled={!taskDraftTitle.trim()}
                      className="gl-button-sm gl-button-confirm inline-flex items-center gap-1 ml-auto disabled:opacity-50"
                    >
                      <Plus size={12} /> {t('common.add', 'Ajouter')}
                    </button>
                  </div>
                </div>
              </SmartFormSection>

              <SmartFormSection
                id="attachments"
                title={t('common.attachments')}
                level="advanced"
                collapsible
                defaultExpanded={false}
                skippable
              >
                <AttachmentManager ownerType={stagingOwnerType} ownerId={stagingRef} compact />
              </SmartFormSection>

              <SmartFormSection
                id="notes"
                title={t('common.notes')}
                level="advanced"
                collapsible
                defaultExpanded={false}
                skippable
              >
                <NoteManager ownerType={stagingOwnerType} ownerId={stagingRef} compact />
              </SmartFormSection>

              <SmartFormSection
                id="tags"
                title={t('common.tags')}
                level="advanced"
                collapsible
                defaultExpanded={false}
                skippable
              >
                <TagManager ownerType={stagingOwnerType} ownerId={stagingRef} compact />
              </SmartFormSection>

              <SmartFormSection
                id="external_refs"
                title={t('projets.external_refs', 'Références externes')}
                level="advanced"
                collapsible
                defaultExpanded={false}
                skippable
              >
                <ExternalRefManager ownerType={stagingOwnerType} ownerId={stagingRef} compact />
              </SmartFormSection>
            </div>
          </SectionColumns>
        </PanelContentLayout>

          <SmartFormInlineHelpDrawer />
          <SmartFormWizardNav
            onCancel={closeDynamicPanel}
            submitDisabled={createProject.isPending}
            onSubmit={() =>
              (document.getElementById('create-project-form') as HTMLFormElement)?.requestSubmit()
            }
          />
        </SmartFormProvider>
      </form>
    </DynamicPanelShell>
  )
}
