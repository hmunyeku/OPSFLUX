/**
 * Create Project panel.
 *
 * Extracted from ProjetsPage.tsx — pure restructure, no behavior changes.
 */
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderKanban, Loader2 } from 'lucide-react'
import { normalizeNames } from '@/lib/normalize'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormGrid,
  FormSection,
  PanelActionButton,
  TagSelector,
  panelInputClass,
  PanelContentLayout,
  SectionColumns,
} from '@/components/layout/DynamicPanel'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { NoteManager } from '@/components/shared/NoteManager'
import { ProjectPicker } from '@/components/shared/ProjectPicker'
import { RichTextField } from '@/components/shared/RichTextField'
import { TagManager } from '@/components/shared/TagManager'
import { useCreateProject } from '@/hooks/useProjets'
import { useCurrentEntity } from '@/hooks/useEntities'
import { useStagingRef } from '@/hooks/useStagingRef'
import type { ProjectCreate, ProgressWeightMethod } from '@/types/api'
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
        <PanelContentLayout>
          <SectionColumns>
            <div className="@container space-y-5">
              <FormSection title={t('common.identification')}>
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
              </FormSection>

              <FormSection title={t('common.planning')}>
                <DateRangePicker
                  startDate={form.start_date?.split('T')[0] ?? null}
                  endDate={form.end_date?.split('T')[0] ?? null}
                  onStartChange={(v) => setForm({ ...form, start_date: v || null })}
                  onEndChange={(v) => setForm({ ...form, end_date: v || null })}
                />
                <DynamicPanelField label="Budget">
                  <input type="number" step="any" value={form.budget ?? ''} onChange={(e) => setForm({ ...form, budget: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} placeholder="0" />
                </DynamicPanelField>
              </FormSection>
            </div>

            <div className="@container space-y-5">
              <FormSection title={t('common.status')}>
                <TagSelector options={projectStatusOptions} value={form.status || 'draft'} onChange={(v) => setForm({ ...form, status: v })} />
              </FormSection>

              <FormSection title={t('common.priority_field')}>
                <TagSelector options={projectPriorityOptions} value={form.priority || 'medium'} onChange={(v) => setForm({ ...form, priority: v })} />
              </FormSection>

              <FormSection title="Avancement" collapsible defaultExpanded>
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
              </FormSection>

              <FormSection title={t('common.description')} collapsible defaultExpanded={false}>
                <RichTextField
                  value={form.description ?? ''}
                  onChange={(html) => setForm({ ...form, description: html || null })}
                  rows={4}
                  placeholder="Description du projet..."
                  imageOwnerType={stagingOwnerType}
                  imageOwnerId={stagingRef}
                />
              </FormSection>

              <FormSection title={t('common.attachments')} collapsible defaultExpanded={false}>
                <AttachmentManager
                  ownerType={stagingOwnerType}
                  ownerId={stagingRef}
                  compact
                />
              </FormSection>

              <FormSection title={t('common.notes')} collapsible defaultExpanded={false}>
                <NoteManager
                  ownerType={stagingOwnerType}
                  ownerId={stagingRef}
                  compact
                />
              </FormSection>

              <FormSection title={t('common.tags')} collapsible defaultExpanded={false}>
                <TagManager
                  ownerType={stagingOwnerType}
                  ownerId={stagingRef}
                  compact
                />
              </FormSection>
            </div>
          </SectionColumns>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}
