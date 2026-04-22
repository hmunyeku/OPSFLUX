/**
 * Create activity panel — PlannerPage.
 *
 * Extracted from the monolithic PlannerPage.tsx. Behavior preserved 1:1.
 */
import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarRange, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { normalizeNames } from '@/lib/normalize'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import {
  DynamicPanelShell,
  PanelContentLayout,
  FormSection,
  FormGrid,
  DynamicPanelField,
  PanelActionButton,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { VariablePobEditor } from '../VariablePobEditor'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { ProjectPicker } from '@/components/shared/ProjectPicker'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { useCreateActivity } from '@/hooks/usePlanner'
import type { PlannerActivityCreate } from '@/types/api'
import {
  ACTIVITY_TYPE_LABELS_FALLBACK,
  PRIORITY_LABELS_FALLBACK,
  PLANNER_ACTIVITY_TYPE_VALUES,
  PLANNER_PRIORITY_VALUES,
  buildDictionaryOptions,
} from '../shared'

export function CreateActivityPanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const createActivity = useCreateActivity()
  const activityTypeLabels = useDictionaryLabels('planner_activity_type', ACTIVITY_TYPE_LABELS_FALLBACK)
  const priorityLabels = useDictionaryLabels('planner_activity_priority', PRIORITY_LABELS_FALLBACK)
  const activityTypeOptions = useMemo(() => buildDictionaryOptions(activityTypeLabels, PLANNER_ACTIVITY_TYPE_VALUES), [activityTypeLabels])
  const priorityOptions = useMemo(() => buildDictionaryOptions(priorityLabels, PLANNER_PRIORITY_VALUES), [priorityLabels])

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
    createActivity.mutate(normalizeNames(form), {
      onSuccess: () => {
        toast({ title: t('planner.toast.activity_created'), variant: 'success' })
        closeDynamicPanel()
      },
      onError: () => toast({ title: t('planner.toast.creation_error'), variant: 'error' }),
    })
  }, [form, createActivity, toast, closeDynamicPanel, t])

  return (
    <DynamicPanelShell
      title="Nouvelle activité"
      subtitle="Planner"
      icon={<CalendarRange size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>
            Annuler
          </PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createActivity.isPending}
            onClick={() => (document.getElementById('create-activity-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createActivity.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Créer'}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-activity-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <FormSection title="Informations générales">
            <FormGrid>
              <DynamicPanelField label={t('common.title_field')} required>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className={panelInputClass}
                  placeholder="Titre de l'activité"
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
          </FormSection>

          <FormSection title="Type et priorité">
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
              <DynamicPanelField label="Sous-type">
                <input
                  type="text"
                  value={form.subtype ?? ''}
                  onChange={(e) => setForm({ ...form, subtype: e.target.value || null })}
                  className={panelInputClass}
                  placeholder="Sous-type (optionnel)"
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
              <DynamicPanelField label="Mode POB">
                <select
                  value={form.pax_quota_mode || 'constant'}
                  onChange={(e) => setForm({ ...form, pax_quota_mode: e.target.value as 'constant' | 'variable' })}
                  className={panelInputClass}
                >
                  <option value="constant">Constant (même valeur tous les jours)</option>
                  <option value="variable">Variable (par jour)</option>
                </select>
              </DynamicPanelField>
              {form.pax_quota_mode !== 'variable' && (
                <DynamicPanelField label="Quota PAX">
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
                <p className="text-xs text-muted-foreground mb-2">Plan POB jour par jour :</p>
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
          </FormSection>

          <FormSection title={t('common.planning')}>
            <DateRangePicker
              startDate={form.start_date ?? null}
              endDate={form.end_date ?? null}
              onStartChange={(v) => setForm({ ...form, start_date: v || null })}
              onEndChange={(v) => setForm({ ...form, end_date: v || null })}
            />
          </FormSection>

          <FormSection title={t('common.description')}>
            <DynamicPanelField label={t('common.description')} span="full">
              <textarea
                value={form.description ?? ''}
                onChange={(e) => setForm({ ...form, description: e.target.value || null })}
                className={cn(panelInputClass, 'min-h-[80px] py-2')}
                placeholder="Description de l'activité..."
              />
            </DynamicPanelField>
          </FormSection>

          {form.type === 'workover' && (
            <FormSection title="Détails Workover">
              <FormGrid>
                <DynamicPanelField label="Référence puits">
                  <input
                    type="text"
                    value={form.well_reference ?? ''}
                    onChange={(e) => setForm({ ...form, well_reference: e.target.value || null })}
                    className={panelInputClass}
                    placeholder="Ref. puits"
                  />
                </DynamicPanelField>
                <DynamicPanelField label="Nom du rig">
                  <input
                    type="text"
                    value={form.rig_name ?? ''}
                    onChange={(e) => setForm({ ...form, rig_name: e.target.value || null })}
                    className={panelInputClass}
                    placeholder="Nom du rig"
                  />
                </DynamicPanelField>
              </FormGrid>
            </FormSection>
          )}

          {form.type === 'drilling' && (
            <FormSection title="Détails Forage">
              <FormGrid>
                <DynamicPanelField label="Date spud">
                  <input
                    type="date"
                    value={form.spud_date ?? ''}
                    onChange={(e) => setForm({ ...form, spud_date: e.target.value || null })}
                    className={panelInputClass}
                  />
                </DynamicPanelField>
                <DynamicPanelField label="Profondeur cible (m)">
                  <input
                    type="number"
                    value={form.target_depth ?? ''}
                    onChange={(e) => setForm({ ...form, target_depth: parseFloat(e.target.value) || null })}
                    className={panelInputClass}
                    placeholder="Profondeur en metres"
                  />
                </DynamicPanelField>
                <DynamicPanelField label="Ref. programme forage">
                  <input
                    type="text"
                    value={form.drilling_program_ref ?? ''}
                    onChange={(e) => setForm({ ...form, drilling_program_ref: e.target.value || null })}
                    className={panelInputClass}
                    placeholder="Référence programme"
                  />
                </DynamicPanelField>
              </FormGrid>
            </FormSection>
          )}

          {(form.type === 'maintenance' || form.type === 'integrity') && (
            <FormSection title="Détails Maintenance / Intégrité">
              <FormGrid>
                <DynamicPanelField label="Référence réglementaire">
                  <input
                    type="text"
                    value={form.regulatory_ref ?? ''}
                    onChange={(e) => setForm({ ...form, regulatory_ref: e.target.value || null })}
                    className={panelInputClass}
                    placeholder="Réf. réglementaire"
                  />
                </DynamicPanelField>
                <DynamicPanelField label="Bon de travail">
                  <input
                    type="text"
                    value={form.work_order_ref ?? ''}
                    onChange={(e) => setForm({ ...form, work_order_ref: e.target.value || null })}
                    className={panelInputClass}
                    placeholder="No. bon de travail"
                  />
                </DynamicPanelField>
              </FormGrid>
            </FormSection>
          )}
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}
