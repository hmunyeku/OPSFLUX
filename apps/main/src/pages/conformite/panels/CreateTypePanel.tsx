import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldCheck } from 'lucide-react'
import { DynamicPanelShell, DynamicPanelField, FormGrid, SectionColumns, TagSelector, panelInputClass, PanelContentLayout } from '@/components/layout/DynamicPanel'
import {
  SmartFormProvider,
  SmartFormSection,
  SmartFormToolbar,
  SmartFormSimpleHint,
  SmartFormWizardNav,
  SmartFormInlineHelpDrawer,
  useSmartForm,
} from '@/components/layout/SmartForm'
import type { ActionItem } from '@/components/layout/DynamicPanel'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { normalizeNames } from '@/lib/normalize'
import { useCreateComplianceType } from '@/hooks/useConformite'
import type { ComplianceTypeCreate } from '@/types/api'
import { useConformiteDictionaryState } from '../shared'

export function CreateTypePanel() {
  return (
    <SmartFormProvider panelId="create-type" defaultMode="simple">
      <CreateTypeInner />
    </SmartFormProvider>
  )
}

function CreateTypeInner() {
  const _ctx = useSmartForm()
  const { t } = useTranslation()
  const createType = useCreateComplianceType()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { toast } = useToast()
  const { categoryOptions } = useConformiteDictionaryState()
  const [form, setForm] = useState<ComplianceTypeCreate>({
    category: 'formation',
    code: '',
    name: '',
    description: null,
    validity_days: null,
    is_mandatory: false,
    compliance_source: 'opsflux',
    external_provider: null,
    external_mapping: null,
  })
  // Slugify a free-text name into UPPER_SNAKE for the code field.
  const slugifyCode = (s: string) => s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
    .slice(0, 50)
  // Track whether the user manually edited the code so we don't overwrite it.
  const [codeIsDirty, setCodeIsDirty] = useState(false)
  // When external mapping is needed, expose a simple "key=value" editor.
  const [mappingKey, setMappingKey] = useState('')
  const [mappingValue, setMappingValue] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const created = await createType.mutateAsync(normalizeNames(form))
      openDynamicPanel({ type: 'detail', module: 'conformite', id: created.id })
      toast({ title: t('conformite.toast.type_created'), variant: 'success' })
    } catch {
      toast({ title: t('conformite.toast.error'), variant: 'error' })
    }
  }

  const actionItems = useMemo<ActionItem[]>(() => [
    { id: 'cancel', label: t('common.cancel'), priority: 40, onClick: closeDynamicPanel },
    {
      id: 'create',
      label: t('common.create'),
      variant: 'primary',
      priority: 100,
      loading: createType.isPending,
      disabled: createType.isPending,
      onClick: () => (document.getElementById('create-ct-form') as HTMLFormElement)?.requestSubmit(),
    },
  ], [t, closeDynamicPanel, createType.isPending])

  return (
    <DynamicPanelShell
      title="Nouveau type"
      subtitle="Conformite"
      icon={<ShieldCheck size={14} className="text-primary" />}
      actionItems={actionItems}
    >
      <form id="create-ct-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
        <SmartFormToolbar />
        <SmartFormSimpleHint />
        <SmartFormInlineHelpDrawer />
          <SmartFormSection id="t_common_category" title={t('common.category')} level="essential" help={{ description: t('common.category') }}>
            <TagSelector
              options={categoryOptions}
              value={form.category}
              onChange={(v) => setForm({ ...form, category: v })}
            />
          </SmartFormSection>

          <SectionColumns>
            <div className="@container space-y-5">
              <SmartFormSection id="t_common_information" title={t('common.information')} level="essential" help={{ description: t('common.information') }}>
                <FormGrid>
                  <DynamicPanelField label={t('common.code_field')} required>
                    <input
                      type="text"
                      required
                      value={form.code ?? ''}
                      onChange={(e) => { setCodeIsDirty(true); setForm({ ...form, code: slugifyCode(e.target.value) }) }}
                      className={`${panelInputClass} font-mono`}
                      placeholder="FORMATION_HSE_N1"
                      pattern="[A-Z0-9_]+"
                      title="Lettres majuscules, chiffres et underscores"
                    />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.name_field')} required>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => {
                        const next = e.target.value
                        setForm((f) => ({
                          ...f,
                          name: next,
                          // Auto-suggest the code from the name while the user hasn't typed in the code box yet.
                          code: codeIsDirty ? f.code : slugifyCode(next),
                        }))
                      }}
                      className={panelInputClass}
                      placeholder="Formation HSE Niveau 1"
                    />
                  </DynamicPanelField>
                  <DynamicPanelField label="Validité (jours)">
                    <input type="number" value={form.validity_days ?? ''} onChange={(e) => setForm({ ...form, validity_days: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} placeholder="365 (vide = permanent)" />
                  </DynamicPanelField>
                </FormGrid>
              </SmartFormSection>
            </div>

            <div className="@container space-y-5">
              <SmartFormSection id="t_common_description" title={t('common.description')} level="essential" help={{ description: t('common.description') }}>
                <textarea
                  value={form.description ?? ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value || null })}
                  className={`${panelInputClass} min-h-[60px] resize-y`}
                  placeholder="Description du type de conformité..."
                  rows={3}
                />
              </SmartFormSection>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_mandatory} onChange={(e) => setForm({ ...form, is_mandatory: e.target.checked })} className="rounded border-border" />
                Obligatoire par défaut
              </label>
            </div>
          </SectionColumns>

          {/* Source & vérification externe — permet de raccorder un référentiel à RiseUp ou autre provider externe. */}
          <SmartFormSection
            id="t_common_source"
            title="Source & vérification externe"
            level="advanced"
            help={{
              description:
                'Définit comment les enregistrements de ce type sont vérifiés. "OpsFlux" = saisie manuelle. "Externe" = vérification automatique via un provider tiers (ex. RiseUp pour les formations e-learning). "Mixte" = les deux modes acceptés.',
            }}
          >
            <FormGrid>
              <DynamicPanelField label="Source de conformité" required>
                <select
                  value={form.compliance_source ?? 'opsflux'}
                  onChange={(e) => {
                    const next = e.target.value as 'opsflux' | 'external' | 'both'
                    setForm((f) => ({
                      ...f,
                      compliance_source: next,
                      // Reset provider/mapping when going back to internal-only.
                      external_provider: next === 'opsflux' ? null : f.external_provider,
                      external_mapping: next === 'opsflux' ? null : f.external_mapping,
                    }))
                  }}
                  className={panelInputClass}
                >
                  <option value="opsflux">OpsFlux (interne)</option>
                  <option value="external">Externe (provider tiers)</option>
                  <option value="both">Mixte (interne + externe)</option>
                </select>
              </DynamicPanelField>
              {form.compliance_source !== 'opsflux' && (
                <DynamicPanelField label="Provider externe" required>
                  <select
                    value={form.external_provider ?? ''}
                    onChange={(e) => setForm({ ...form, external_provider: e.target.value || null })}
                    className={panelInputClass}
                    required
                  >
                    <option value="">Choisir un provider…</option>
                    <option value="riseup">RiseUp (LMS)</option>
                  </select>
                </DynamicPanelField>
              )}
              {form.compliance_source !== 'opsflux' && form.external_provider === 'riseup' && (
                <DynamicPanelField label="Mapping RiseUp" span="full">
                  <p className="mb-1 text-xs text-muted-foreground">
                    Lie ce référentiel OpsFlux à un identifiant côté RiseUp (ex. <code className="font-mono">riseup_cert_id = 2</code>).
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={mappingKey || (form.external_mapping ? Object.keys(form.external_mapping)[0] || '' : '')}
                      onChange={(e) => {
                        const k = e.target.value
                        setMappingKey(k)
                        const v = mappingValue || (form.external_mapping ? Object.values(form.external_mapping)[0] || '' : '')
                        setForm({ ...form, external_mapping: k && v ? { [k]: String(v) } : null })
                      }}
                      className={`${panelInputClass} flex-1 font-mono text-xs`}
                      placeholder="riseup_cert_id"
                      list="riseup-mapping-keys"
                    />
                    <datalist id="riseup-mapping-keys">
                      <option value="riseup_cert_id" />
                      <option value="riseup_training_id" />
                      <option value="riseup_module_id" />
                    </datalist>
                    <span className="text-sm text-muted-foreground self-center">=</span>
                    <input
                      type="text"
                      value={mappingValue || (form.external_mapping ? String(Object.values(form.external_mapping)[0] ?? '') : '')}
                      onChange={(e) => {
                        const v = e.target.value
                        setMappingValue(v)
                        const k = mappingKey || (form.external_mapping ? Object.keys(form.external_mapping)[0] || '' : '')
                        setForm({ ...form, external_mapping: k && v ? { [k]: String(v) } : null })
                      }}
                      className={`${panelInputClass} flex-1 font-mono text-xs`}
                      placeholder="2"
                    />
                  </div>
                </DynamicPanelField>
              )}
            </FormGrid>
          </SmartFormSection>
        {_ctx?.mode === 'wizard' && (

          <SmartFormWizardNav

            onSubmit={() => document.querySelector('form')?.requestSubmit()}

            onCancel={() => {}}

          />

        )}

        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}
