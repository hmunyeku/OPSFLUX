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
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
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
  const [taskDraftStartDate, setTaskDraftStartDate] = useState<string>('')
  const [taskDraftDueDate, setTaskDraftDueDate] = useState<string>('')
  const [taskDraftIsMilestone, setTaskDraftIsMilestone] = useState(false)
  // Antécédent: index of the predecessor task in initialTasks (or ''
  // for none). Kept as a string so the <select> value is trivially
  // bindable; we parse on add.
  const [taskDraftPredecessor, setTaskDraftPredecessor] = useState<string>('')
  const [taskDraftDependencyType, setTaskDraftDependencyType] = useState<
    'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish'
  >('finish_to_start')
  const [taskDraftLagDays, setTaskDraftLagDays] = useState<string>('0')
  const addTaskDraft = () => {
    const title = taskDraftTitle.trim()
    if (!title) return
    const predIdx = taskDraftPredecessor === '' ? null : Number(taskDraftPredecessor)
    setInitialTasks((prev) => [
      ...prev,
      {
        title,
        priority: taskDraftPriority,
        start_date: taskDraftIsMilestone ? (taskDraftDueDate || null) : (taskDraftStartDate || null),
        due_date: taskDraftDueDate || null,
        is_milestone: taskDraftIsMilestone,
        predecessor_index: predIdx !== null && Number.isInteger(predIdx) && predIdx >= 0 ? predIdx : null,
        dependency_type: predIdx !== null ? taskDraftDependencyType : undefined,
        lag_days: predIdx !== null ? Number(taskDraftLagDays) || 0 : undefined,
      },
    ])
    setTaskDraftTitle('')
    setTaskDraftStartDate('')
    setTaskDraftDueDate('')
    setTaskDraftIsMilestone(false)
    setTaskDraftPredecessor('')
    setTaskDraftDependencyType('finish_to_start')
    setTaskDraftLagDays('0')
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
      const created = await createProject.mutateAsync(normalizeNames(payload))
      openDynamicPanel({ type: 'detail', module: 'projets', id: created.id })
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
                    {initialTasks.map((task, idx) => {
                      const predTitle =
                        task.predecessor_index !== null &&
                        task.predecessor_index !== undefined &&
                        initialTasks[task.predecessor_index]
                          ? initialTasks[task.predecessor_index].title
                          : null
                      const depTypeShort =
                        task.dependency_type === 'start_to_start' ? 'SS'
                        : task.dependency_type === 'finish_to_finish' ? 'FF'
                        : task.dependency_type === 'start_to_finish' ? 'SF'
                        : 'FS'
                      const dateLabel = task.is_milestone
                        ? task.due_date
                        : task.start_date && task.due_date
                          ? `${task.start_date} → ${task.due_date}`
                          : task.due_date || task.start_date
                      return (
                      <div
                        key={`${task.title}-${idx}`}
                        className="flex items-center justify-between gap-2 rounded border border-border bg-card px-2 py-1.5"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
                            #{idx + 1}
                          </span>
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
                                dateLabel,
                                task.is_milestone ? t('projets.milestone', 'Jalon') : null,
                                predTitle
                                  ? `${depTypeShort}${task.lag_days ? ` ${task.lag_days >= 0 ? '+' : ''}${task.lag_days}j` : ''} · ← ${predTitle}`
                                  : null,
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
                      )
                    })}
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

                  {/* Row 1: priority + dates + milestone */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={taskDraftPriority}
                      onChange={(e) =>
                        setTaskDraftPriority(e.target.value as 'low' | 'medium' | 'high' | 'critical')
                      }
                      className="gl-form-select text-xs h-7"
                      title={t('common.priority_field', 'Priorité') as string}
                    >
                      {/* Priorities read from the `project_priority` dictionary
                          — admins can override labels per entity. Fallback is
                          PROJECT_PRIORITY_LABELS_FALLBACK so display stays
                          readable if the dictionary hasn't been seeded. */}
                      {projectPriorityOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {!taskDraftIsMilestone && (
                      <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        {t('projets.task_start_date', 'Début')}
                        <input
                          type="date"
                          value={taskDraftStartDate}
                          onChange={(e) => setTaskDraftStartDate(e.target.value)}
                          className="gl-form-input text-xs h-7"
                          title={t('projets.task_start_date_hint', 'Date de début planifiée') as string}
                        />
                      </label>
                    )}
                    <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      {taskDraftIsMilestone
                        ? t('projets.task_milestone_date', 'Date du jalon')
                        : t('projets.task_end_date', 'Fin')}
                      <input
                        type="date"
                        value={taskDraftDueDate}
                        onChange={(e) => setTaskDraftDueDate(e.target.value)}
                        min={taskDraftStartDate || undefined}
                        className="gl-form-input text-xs h-7"
                      />
                    </label>
                    <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={taskDraftIsMilestone}
                        onChange={(e) => setTaskDraftIsMilestone(e.target.checked)}
                      />
                      {t('projets.is_milestone', 'Jalon')}
                    </label>
                  </div>

                  {/* Row 2: antécédent — only if there's at least 1 task already */}
                  {initialTasks.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border/40">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        {t('projets.task_predecessor', 'Antécédent')}
                      </span>
                      <select
                        value={taskDraftPredecessor}
                        onChange={(e) => setTaskDraftPredecessor(e.target.value)}
                        className="gl-form-select text-xs h-7 min-w-[140px]"
                      >
                        <option value="">
                          {t('projets.task_predecessor_none', '— Aucun —')}
                        </option>
                        {initialTasks.map((tk, i) => (
                          <option key={i} value={String(i)}>
                            #{i + 1} — {tk.title}
                          </option>
                        ))}
                      </select>
                      {taskDraftPredecessor !== '' && (
                        <>
                          <select
                            value={taskDraftDependencyType}
                            onChange={(e) =>
                              setTaskDraftDependencyType(
                                e.target.value as
                                  | 'finish_to_start'
                                  | 'start_to_start'
                                  | 'finish_to_finish'
                                  | 'start_to_finish',
                              )
                            }
                            className="gl-form-select text-xs h-7"
                            title={t('projets.task_dependency_type', 'Type de dépendance') as string}
                          >
                            <option value="finish_to_start">FS — {t('projets.dep_fs', 'Fin → Début')}</option>
                            <option value="start_to_start">SS — {t('projets.dep_ss', 'Début → Début')}</option>
                            <option value="finish_to_finish">FF — {t('projets.dep_ff', 'Fin → Fin')}</option>
                            <option value="start_to_finish">SF — {t('projets.dep_sf', 'Début → Fin')}</option>
                          </select>
                          <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            {t('projets.task_lag_days', 'Décalage (j)')}
                            <input
                              type="number"
                              step="1"
                              value={taskDraftLagDays}
                              onChange={(e) => setTaskDraftLagDays(e.target.value)}
                              className="gl-form-input text-xs h-7 w-14"
                              title={t('projets.task_lag_days_hint', 'Négatif = anticiper · Positif = retarder') as string}
                            />
                          </label>
                        </>
                      )}
                    </div>
                  )}

                  {/* Row 3: add button */}
                  <div className="flex items-center justify-end pt-1">
                    <button
                      type="button"
                      onClick={addTaskDraft}
                      disabled={!taskDraftTitle.trim()}
                      className="gl-button-sm gl-button-confirm inline-flex items-center gap-1 disabled:opacity-50"
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
