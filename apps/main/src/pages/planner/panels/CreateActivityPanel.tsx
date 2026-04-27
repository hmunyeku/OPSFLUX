/**
 * Create activity panel — PlannerPage.
 *
 * Extracted from the monolithic PlannerPage.tsx. Behavior preserved 1:1.
 */
import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarRange, Loader2 } from 'lucide-react'
import { normalizeNames } from '@/lib/normalize'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import {
  DynamicPanelShell,
  PanelContentLayout,
  FormGrid,
  DynamicPanelField,
  PanelActionButton,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import {
  SmartFormProvider,
  SmartFormSection,
  SmartFormToolbar,
  SmartFormSimpleHint,
  SmartFormWizardNav,
  SmartFormInlineHelpDrawer,
  useSmartForm,
} from '@/components/layout/SmartForm'
import { VariablePobEditor } from '../VariablePobEditor'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { ProjectPicker } from '@/components/shared/ProjectPicker'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { RichTextField } from '@/components/shared/RichTextField'
import { TagManager } from '@/components/shared/TagManager'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { useCreateActivity } from '@/hooks/usePlanner'
import { useStagingRef } from '@/hooks/useStagingRef'
import type { PlannerActivityCreate } from '@/types/api'
import {
  ACTIVITY_TYPE_LABELS_FALLBACK,
  PRIORITY_LABELS_FALLBACK,
  PLANNER_ACTIVITY_TYPE_VALUES,
  PLANNER_PRIORITY_VALUES,
  buildDictionaryOptions,
} from '../shared'

export function CreateActivityPanel() {
  return (
    <SmartFormProvider panelId="create-activity" defaultMode="simple">
      <ActivityInner />
    </SmartFormProvider>
  )
}

function ActivityInner() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const ctx = useSmartForm()
  const createActivity = useCreateActivity()
  const activityTypeLabels = useDictionaryLabels('planner_activity_type', ACTIVITY_TYPE_LABELS_FALLBACK)
  const priorityLabels = useDictionaryLabels('planner_activity_priority', PRIORITY_LABELS_FALLBACK)
  const activityTypeOptions = useMemo(() => buildDictionaryOptions(activityTypeLabels, PLANNER_ACTIVITY_TYPE_VALUES), [activityTypeLabels])
  const priorityOptions = useMemo(() => buildDictionaryOptions(priorityLabels, PLANNER_PRIORITY_VALUES), [priorityLabels])
  const { stagingRef, stagingOwnerType } = useStagingRef('planner_activity')

  const [form, setForm] = useState<PlannerActivityCreate>({
    asset_id: '',
    project_id: null,
    parent_id: null,
    type: 'project',
    subtype: null,
    title: '',
    description: null,
    priority: 'medium',
    pax_quota: 1,
    pax_quota_mode: 'constant',
    pax_quota_daily: null,
    start_date: null,
    end_date: null,
    well_reference: null,
    rig_name: null,
    spud_date: null,
    target_depth: null,
    drilling_program_ref: null,
    regulatory_ref: null,
    work_order_ref: null,
  })

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    createActivity.mutate(normalizeNames({ ...form, staging_ref: stagingRef }), {
      onSuccess: (created) => {
        toast({ title: t('planner.toast.activity_created'), variant: 'success' })
        if (created?.id) {
          openDynamicPanel({ type: 'detail', module: 'planner', id: created.id })
        } else {
          closeDynamicPanel()
        }
      },
      onError: () => toast({ title: t('planner.toast.creation_error'), variant: 'error' }),
    })
  }, [form, stagingRef, createActivity, toast, closeDynamicPanel, openDynamicPanel, t])

  return (
    <DynamicPanelShell
      title={t('planner.create_activity.title', 'Nouvelle activité')}
      subtitle={t('planner.title', 'Planner')}
      icon={<CalendarRange size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>
            {t('common.cancel')}
          </PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createActivity.isPending}
            onClick={() => (document.getElementById('create-activity-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createActivity.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create', 'Créer')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-activity-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <SmartFormToolbar />
          <SmartFormSimpleHint />
          <SmartFormInlineHelpDrawer />
          <SmartFormSection id="general" title={t('planner.activity.section_general', 'Informations générales')} level="essential" help={{ description: t('planner.activity.help.general_description'), tips: [ t('planner.activity.help.general_tip_title'), t('planner.activity.help.general_tip_site'), t('planner.activity.help.general_tip_project') ] }}>
            <FormGrid>
              <DynamicPanelField label={t('common.title_field')} required>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className={panelInputClass}
                  placeholder={t('planner.create_activity.title_placeholder', "Titre de l'activité")}
                />
              </DynamicPanelField>
              <DynamicPanelField label="Site" required>
                <AssetPicker
                  value={form.asset_id || null}
                  onChange={(id) => setForm({ ...form, asset_id: id || '' })}
                  label="Site"
                />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.project')}>
                <ProjectPicker
                  value={form.project_id || null}
                  onChange={(id) => setForm({ ...form, project_id: id })}
                  filterStatus={['draft', 'active', 'on_hold']}
                />
              </DynamicPanelField>
            </FormGrid>
          </SmartFormSection>

          <SmartFormSection id="type" title={t('planner.activity.section_type', 'Type et priorité')} level="essential" help={{ description: t('planner.activity.help.type_description'), tips: [ t('planner.activity.help.type_tip_pob') ] }}>
            <FormGrid>
              <DynamicPanelField label={t('common.type_field')} required>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className={panelInputClass}
                >
                  {activityTypeOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label={t('common.subtype')}>
                <input
                  type="text"
                  value={form.subtype ?? ''}
                  onChange={(e) => setForm({ ...form, subtype: e.target.value || null })}
                  className={panelInputClass}
                  placeholder={t('planner.create_activity.subtype_placeholder', 'Sous-type (optionnel)')}
                />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.priority_field')}>
                <select
                  value={form.priority || 'medium'}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  className={panelInputClass}
                >
                  {priorityOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label={t('common.pob_mode')}>
                <select
                  value={form.pax_quota_mode || 'constant'}
                  onChange={(e) => setForm({ ...form, pax_quota_mode: e.target.value as 'constant' | 'variable' })}
                  className={panelInputClass}
                >
                  <option value="constant">{t('planner.pob_mode.constant', 'Constant (même valeur tous les jours)')}</option>
                  <option value="variable">{t('planner.pob_mode.variable', 'Variable (par jour)')}</option>
                </select>
              </DynamicPanelField>
              {form.pax_quota_mode !== 'variable' && (
                <DynamicPanelField label={t('common.pax_quota')}>
                  <input
                    type="number"
                    value={form.pax_quota ?? 1}
                    onChange={(e) => setForm({ ...form, pax_quota: Math.max(1, parseInt(e.target.value) || 1) })}
                    className={panelInputClass}
                    min={1}
                    placeholder="1"
                  />
                </DynamicPanelField>
              )}
            </FormGrid>
            {form.pax_quota_mode === 'variable' && form.start_date && form.end_date && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground mb-2">{t('planner.create_activity.pob_daily_intro', 'Plan POB jour par jour :')}</p>
                <VariablePobEditor
                  startDate={form.start_date}
                  endDate={form.end_date}
                  value={(form.pax_quota_daily ?? null) as Record<string, number> | null}
                  onChange={(daily) => setForm({ ...form, pax_quota_daily: daily })}
                  defaultValue={form.pax_quota || 1}
                  compact
                />
              </div>
            )}
          </SmartFormSection>

          <SmartFormSection id="planning" title={t('common.planning')} level="essential" help={{ description: t('planner.activity.help.planning_description') }}>
            <DateRangePicker
              startDate={form.start_date ?? null}
              endDate={form.end_date ?? null}
              onStartChange={(v) => setForm({ ...form, start_date: v || null })}
              onEndChange={(v) => setForm({ ...form, end_date: v || null })}
            />
          </SmartFormSection>

          <SmartFormSection id="description" title={t('common.description')} level="essential" help={{ description: t('planner.activity.help.description_description') }}>
            <DynamicPanelField label={t('common.description')} span="full">
              <RichTextField
                value={form.description ?? ''}
                onChange={(html) => setForm({ ...form, description: html || null })}
                rows={4}
                placeholder={t('planner.create_activity.description_placeholder', "Description de l'activité…")}
                imageOwnerType={stagingOwnerType}
                imageOwnerId={stagingRef}
              />
            </DynamicPanelField>
          </SmartFormSection>

          <SmartFormSection id="attachments" title={t('common.attachments')} level="advanced" skippable collapsible defaultExpanded={false} help={{ description: t('planner.activity.help.attachments_description') }}>
            <AttachmentManager
              ownerType={stagingOwnerType}
              ownerId={stagingRef}
              compact
            />
          </SmartFormSection>

          <SmartFormSection id="notes" title={t('common.notes')} level="advanced" skippable collapsible defaultExpanded={false} help={{ description: t('planner.activity.help.notes_description') }}>
            <NoteManager
              ownerType={stagingOwnerType}
              ownerId={stagingRef}
              compact
            />
          </SmartFormSection>

          <SmartFormSection id="tags" title={t('common.tags')} level="advanced" skippable collapsible defaultExpanded={false} help={{ description: t('planner.activity.help.tags_description') }}>
            <TagManager
              ownerType={stagingOwnerType}
              ownerId={stagingRef}
              compact
            />
          </SmartFormSection>

          {form.type === 'workover' && (
            <SmartFormSection id="workover" title={t('common.workover_details')} level="advanced" help={{ description: t('planner.activity.help.workover_description') }}>
              <FormGrid>
                <DynamicPanelField label={t('common.well_reference')}>
                  <input
                    type="text"
                    value={form.well_reference ?? ''}
                    onChange={(e) => setForm({ ...form, well_reference: e.target.value || null })}
                    className={panelInputClass}
                    placeholder={t('planner.create_activity.well_ref', 'Ref. puits')}
                  />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.rig_name')}>
                  <input
                    type="text"
                    value={form.rig_name ?? ''}
                    onChange={(e) => setForm({ ...form, rig_name: e.target.value || null })}
                    className={panelInputClass}
                    placeholder={t('planner.create_activity.rig_name', 'Nom du rig')}
                  />
                </DynamicPanelField>
              </FormGrid>
            </SmartFormSection>
          )}

          {form.type === 'drilling' && (
            <SmartFormSection id="drilling" title={t('common.drilling_details')} level="advanced" help={{ description: t('planner.activity.help.drilling_description') }}>
              <FormGrid>
                <DynamicPanelField label={t('common.spud_date')}>
                  <input
                    type="date"
                    value={form.spud_date ?? ''}
                    onChange={(e) => setForm({ ...form, spud_date: e.target.value || null })}
                    className={panelInputClass}
                  />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.target_depth_m')}>
                  <input
                    type="number"
                    value={form.target_depth ?? ''}
                    onChange={(e) => setForm({ ...form, target_depth: parseFloat(e.target.value) || null })}
                    className={panelInputClass}
                    placeholder={t('planner.create_activity.depth_m', 'Profondeur en mètres')}
                  />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.drilling_program_ref')}>
                  <input
                    type="text"
                    value={form.drilling_program_ref ?? ''}
                    onChange={(e) => setForm({ ...form, drilling_program_ref: e.target.value || null })}
                    className={panelInputClass}
                    placeholder={t('planner.create_activity.program_ref', 'Référence programme')}
                  />
                </DynamicPanelField>
              </FormGrid>
            </SmartFormSection>
          )}

          {(form.type === 'maintenance' || form.type === 'integrity') && (
            <SmartFormSection id="maintenance" title={t('common.maintenance_details')} level="advanced" help={{ description: t('planner.activity.help.maintenance_description') }}>
              <FormGrid>
                <DynamicPanelField label={t('common.regulatory_reference')}>
                  <input
                    type="text"
                    value={form.regulatory_ref ?? ''}
                    onChange={(e) => setForm({ ...form, regulatory_ref: e.target.value || null })}
                    className={panelInputClass}
                    placeholder={t('planner.create_activity.regulatory_ref', 'Réf. réglementaire')}
                  />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.work_order')}>
                  <input
                    type="text"
                    value={form.work_order_ref ?? ''}
                    onChange={(e) => setForm({ ...form, work_order_ref: e.target.value || null })}
                    className={panelInputClass}
                    placeholder={t('planner.create_activity.work_order', 'N° bon de travail')}
                  />
                </DynamicPanelField>
              </FormGrid>
            </SmartFormSection>
          )}
          {ctx?.mode === 'wizard' && (
            <SmartFormWizardNav
              onSubmit={() => (document.getElementById('create-activity-form') as HTMLFormElement)?.requestSubmit()}
              onCancel={closeDynamicPanel}
              submitDisabled={createActivity.isPending}
              submitLabel={t('common.create', 'Créer')}
            />
          )}
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}
