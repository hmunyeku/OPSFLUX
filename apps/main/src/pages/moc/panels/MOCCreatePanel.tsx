/**
 * MOCCreatePanel — form for creating a new Management of Change request.
 *
 * Mirrors CDC §4.1 fields. Only the minimum initial fields are required
 * here (site, platform, objectives); the rest is filled progressively
 * through the workflow.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Save, X } from 'lucide-react'
import {
  DynamicPanelShell,
  PanelContentLayout,
  FormSection,
  FormGrid,
  DynamicPanelField,
  PanelActionButton,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { useToast } from '@/components/ui/Toast'
import { useUIStore } from '@/stores/uiStore'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import { useCreateMOC } from '@/hooks/useMOC'
import type { MOCCreatePayload, MOCModificationType } from '@/services/mocService'

export function MOCCreatePanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const closePanel = useUIStore((s) => s.closeDynamicPanel)
  const create = useCreateMOC()

  // Sites & modification types come from the dictionary so admins can customise
  // them per tenant in Settings → Dictionary (category `moc_site`, `moc_modification_type`).
  const siteOptions = useDictionaryOptions('moc_site')
  const modificationTypeOptions = useDictionaryOptions('moc_modification_type')

  // Primary input: installation from asset registry. When present, backend
  // auto-derives site_label + platform_code from the hierarchy.
  // Fallback: free-text Site + Platform for tenants not using asset_registry.
  const [installationId, setInstallationId] = useState<string | null>(null)
  const [manualFallback, setManualFallback] = useState(false)
  const [site, setSite] = useState('')
  const [customSite, setCustomSite] = useState('')
  const [platform, setPlatform] = useState('')
  const [objectives, setObjectives] = useState('')
  const [description, setDescription] = useState('')
  const [currentSituation, setCurrentSituation] = useState('')
  const [proposedChanges, setProposedChanges] = useState('')
  const [impactAnalysis, setImpactAnalysis] = useState('')
  const [modificationType, setModificationType] = useState<MOCModificationType | ''>('')
  const [durationDays, setDurationDays] = useState('')
  const [initiatorFn, setInitiatorFn] = useState('')

  // Preferred path: installation picker — backend derives site + platform.
  // Fallback path: manual Site dropdown + Platform free-text.
  const siteLabel = site === 'OTHER' ? customSite.trim() : site
  const canSubmit =
    !!objectives.trim() &&
    !create.isPending &&
    (installationId || (siteLabel && platform.trim()))

  const submit = async () => {
    if (!canSubmit) return
    const payload: MOCCreatePayload = {
      installation_id: installationId,
      // Only include manual fields when no installation picked
      site_label: installationId ? null : siteLabel,
      platform_code: installationId ? null : platform.trim().toUpperCase(),
      objectives: objectives.trim() || null,
      description: description.trim() || null,
      current_situation: currentSituation.trim() || null,
      proposed_changes: proposedChanges.trim() || null,
      impact_analysis: impactAnalysis.trim() || null,
      modification_type: modificationType || null,
      temporary_duration_days:
        modificationType === 'temporary' && durationDays
          ? parseInt(durationDays, 10)
          : null,
      initiator_function: initiatorFn.trim() || null,
    }
    try {
      const moc = await create.mutateAsync(payload)
      toast({ title: t('moc.toast.created', { ref: moc.reference }), variant: 'success' })
      closePanel()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: { message?: string } } } })
          ?.response?.data?.detail?.message || 'Échec de la création'
      toast({ title: msg, variant: 'error' })
    }
  }

  return (
    <DynamicPanelShell
      title={t('moc.create.title')}
      subtitle={t('moc.create.subtitle')}
      actions={[
        <PanelActionButton
          key="save"
          icon={<Save size={12} />}
          variant="primary"
          disabled={!canSubmit || create.isPending}
          onClick={submit}
        >
          {t('common.save')}
        </PanelActionButton>,
        <PanelActionButton
          key="cancel"
          icon={<X size={12} />}
          variant="default"
          onClick={closePanel}
        >
          {t('common.cancel')}
        </PanelActionButton>,
      ]}
    >
      <PanelContentLayout>
        <FormSection title={t('moc.create.section_location')} defaultExpanded>
          {/* Primary: installation picker. Site + Platform auto-derived
              backend-side from the asset_registry hierarchy (Installation →
              Site → Field). If the target isn't in the registry yet, tick
              "Saisie manuelle" to enter Site + Platform as free text. */}
          <FormGrid>
            <DynamicPanelField label={t('moc.fields.installation')} span="full">
              <AssetPicker
                value={installationId}
                onChange={(id) => setInstallationId(id)}
                placeholder={t('moc.fields.installation_ph') as string}
                filterTypes={['installation']}
                clearable
              />
              <p className="mt-1 text-[10px] text-muted-foreground/70">
                {t('moc.fields.installation_hint_v2')}
              </p>
            </DynamicPanelField>
            <DynamicPanelField label={t('moc.fields.initiator_function')}>
              <input
                className={panelInputClass}
                value={initiatorFn}
                onChange={(e) => setInitiatorFn(e.target.value)}
                placeholder={t('moc.fields.initiator_function_ph') as string}
              />
            </DynamicPanelField>
          </FormGrid>

          {!installationId && (
            <div className="mt-3">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={manualFallback}
                  onChange={(e) => setManualFallback(e.target.checked)}
                />
                {t('moc.fields.manual_location_toggle')}
              </label>
              {manualFallback && (
                <FormGrid>
                  <DynamicPanelField label={t('moc.fields.site')}>
                    <select
                      className={panelInputClass}
                      value={site}
                      onChange={(e) => setSite(e.target.value)}
                    >
                      <option value="">—</option>
                      {siteOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                      <option value="OTHER">{t('common.other')}</option>
                    </select>
                  </DynamicPanelField>
                  {site === 'OTHER' && (
                    <DynamicPanelField label={t('moc.fields.site_custom')}>
                      <input
                        className={panelInputClass}
                        value={customSite}
                        onChange={(e) => setCustomSite(e.target.value)}
                        placeholder={t('moc.fields.site_custom_ph') as string}
                      />
                    </DynamicPanelField>
                  )}
                  <DynamicPanelField label={t('moc.fields.platform')}>
                    <input
                      className={panelInputClass}
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value)}
                      placeholder="BRF1, INF1, DS1, …"
                    />
                  </DynamicPanelField>
                </FormGrid>
              )}
            </div>
          )}
        </FormSection>

        <FormSection title={t('moc.create.section_objectives')} defaultExpanded>
          <DynamicPanelField label={t('moc.fields.objectives')}>
            <textarea
              className={panelInputClass}
              rows={3}
              value={objectives}
              onChange={(e) => setObjectives(e.target.value)}
              placeholder={t('moc.fields.objectives_ph') as string}
            />
          </DynamicPanelField>
          <DynamicPanelField label={t('moc.fields.description')}>
            <textarea
              className={panelInputClass}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </DynamicPanelField>
          <DynamicPanelField label={t('moc.fields.current_situation')}>
            <textarea
              className={panelInputClass}
              rows={3}
              value={currentSituation}
              onChange={(e) => setCurrentSituation(e.target.value)}
            />
          </DynamicPanelField>
          <DynamicPanelField label={t('moc.fields.proposed_changes')}>
            <textarea
              className={panelInputClass}
              rows={3}
              value={proposedChanges}
              onChange={(e) => setProposedChanges(e.target.value)}
            />
          </DynamicPanelField>
          <DynamicPanelField label={t('moc.fields.impact_analysis')}>
            <textarea
              className={panelInputClass}
              rows={3}
              value={impactAnalysis}
              onChange={(e) => setImpactAnalysis(e.target.value)}
              placeholder={t('moc.fields.impact_analysis_ph') as string}
            />
          </DynamicPanelField>
        </FormSection>

        <FormSection title={t('moc.create.section_type')} defaultExpanded>
          <FormGrid>
            <DynamicPanelField label={t('moc.fields.modification_type')}>
              <select
                className={panelInputClass}
                value={modificationType}
                onChange={(e) =>
                  setModificationType(e.target.value as MOCModificationType | '')
                }
              >
                <option value="">—</option>
                {modificationTypeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </DynamicPanelField>
            {modificationType === 'temporary' && (
              <DynamicPanelField label={t('moc.fields.duration_days')}>
                <input
                  type="number"
                  min={1}
                  className={panelInputClass}
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                />
              </DynamicPanelField>
            )}
          </FormGrid>
        </FormSection>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}
