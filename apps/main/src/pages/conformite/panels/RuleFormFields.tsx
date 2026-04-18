import { useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  DynamicPanelField,
  FormGrid,
  FormSection,
  TagSelector,
  panelInputClass,
  PanelContentLayout,
} from '@/components/layout/DynamicPanel'
import { ConditionBuilder } from '@/components/shared/ConditionBuilder'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import {
  useConformiteDictionaryState,
  buildPackLogConditionBuilderValue,
  updatePackLogRuleConfig,
  PACKLOG_CONDITION_OPERATOR_TO_STRUCTURED,
} from '../shared'
import { SearchableSelect, MultiSearchableSelect } from '../components'

function PackLogRuleDesigner({ form, setForm }: {
  form: Record<string, any>
  setForm: (f: Record<string, any>) => void
}) {
  const { t } = useTranslation()
  const cargoTypeOptions = useDictionaryOptions('packlog_cargo_type')
  const workflowStatusOptions = useDictionaryOptions('packlog_cargo_workflow_status')
  const evidenceTypeOptions = useDictionaryOptions('packlog_cargo_evidence_type')

  const packlogFields = useMemo(() => ([
    { value: 'designation', label: t('conformite.rules.packlog.fields.designation') },
    { value: 'description', label: t('conformite.rules.packlog.fields.description') },
    { value: 'weight_kg', label: t('conformite.rules.packlog.fields.weight_kg') },
    { value: 'width_cm', label: t('conformite.rules.packlog.fields.width_cm') },
    { value: 'length_cm', label: t('conformite.rules.packlog.fields.length_cm') },
    { value: 'height_cm', label: t('conformite.rules.packlog.fields.height_cm') },
    { value: 'surface_m2', label: t('conformite.rules.packlog.fields.surface_m2') },
    { value: 'destination_asset_id', label: t('conformite.rules.packlog.fields.destination_asset_id') },
    { value: 'pickup_location_label', label: t('conformite.rules.packlog.fields.pickup_location_label') },
    { value: 'available_from', label: t('conformite.rules.packlog.fields.available_from') },
    { value: 'imputation_reference_id', label: t('conformite.rules.packlog.fields.imputation_reference_id') },
    { value: 'receiver_name', label: t('conformite.rules.packlog.fields.receiver_name') },
    { value: 'platform_crane_type', label: t('conformite.rules.packlog.fields.platform_crane_type') },
  ]), [t])

  const packlogFlagOptions = useMemo(() => ([
    { value: 'hazmat_validated', label: t('conformite.rules.packlog.flags.hazmat_validated') },
    { value: 'lifting_points_certified', label: t('conformite.rules.packlog.flags.lifting_points_certified') },
    { value: 'weight_ticket_provided', label: t('conformite.rules.packlog.flags.weight_ticket_provided') },
  ]), [t])

  const thresholdFieldOptions = useMemo(() => ([
    { value: 'weight_kg', label: t('conformite.rules.packlog.fields.weight_kg') },
    { value: 'width_cm', label: t('conformite.rules.packlog.fields.width_cm') },
    { value: 'length_cm', label: t('conformite.rules.packlog.fields.length_cm') },
    { value: 'height_cm', label: t('conformite.rules.packlog.fields.height_cm') },
    { value: 'surface_m2', label: t('conformite.rules.packlog.fields.surface_m2') },
  ]), [t])

  const conditionFields = useMemo(() => ([
    { id: 'cargo_type', label: t('conformite.rules.packlog.conditions.cargo_type'), type: 'select' as const, options: cargoTypeOptions.map(o => o.label) },
    { id: 'target_workflow_status', label: t('conformite.rules.packlog.conditions.target_workflow_status'), type: 'select' as const, options: workflowStatusOptions.map(o => o.value) },
    { id: 'weight_kg', label: t('conformite.rules.packlog.fields.weight_kg'), type: 'number' as const },
    { id: 'surface_m2', label: t('conformite.rules.packlog.fields.surface_m2'), type: 'number' as const },
    { id: 'width_cm', label: t('conformite.rules.packlog.fields.width_cm'), type: 'number' as const },
    { id: 'length_cm', label: t('conformite.rules.packlog.fields.length_cm'), type: 'number' as const },
    { id: 'height_cm', label: t('conformite.rules.packlog.fields.height_cm'), type: 'number' as const },
    { id: 'hazmat_validated', label: t('conformite.rules.packlog.flags.hazmat_validated'), type: 'boolean' as const },
    { id: 'lifting_points_certified', label: t('conformite.rules.packlog.flags.lifting_points_certified'), type: 'boolean' as const },
    { id: 'weight_ticket_provided', label: t('conformite.rules.packlog.flags.weight_ticket_provided'), type: 'boolean' as const },
  ]), [cargoTypeOptions, workflowStatusOptions, t])

  const ruleConfig = (form.condition_json as Record<string, any> | null) ?? null
  const builderValue = useMemo(() => buildPackLogConditionBuilderValue(ruleConfig), [ruleConfig])
  const requiredFields = Array.isArray(ruleConfig?.required_fields) ? ruleConfig.required_fields : []
  const requiredFlags = Array.isArray(ruleConfig?.required_flags) ? ruleConfig.required_flags : []
  const requiredEvidence = Array.isArray(ruleConfig?.required_evidence_types) ? ruleConfig.required_evidence_types : []
  const minValues = (ruleConfig?.min_values && typeof ruleConfig.min_values === 'object') ? ruleConfig.min_values as Record<string, number | string> : {}
  const maxValues = (ruleConfig?.max_values && typeof ruleConfig.max_values === 'object') ? ruleConfig.max_values as Record<string, number | string> : {}

  const setRuleConfig = useCallback((patch: Record<string, unknown>) => {
    setForm({ ...form, condition_json: updatePackLogRuleConfig(ruleConfig, patch) })
  }, [form, setForm, ruleConfig])

  const setThresholdValue = useCallback((kind: 'min_values' | 'max_values', field: string, raw: string) => {
    const currentValues = (((ruleConfig?.[kind] as Record<string, unknown> | undefined) ?? {}))
    const nextValues = { ...currentValues }
    if (raw === '') {
      delete nextValues[field]
    } else {
      nextValues[field] = Number(raw)
    }
    setRuleConfig({ [kind]: nextValues })
  }, [ruleConfig, setRuleConfig])

  const handleWhenChange = useCallback((value: Record<string, unknown> | null) => {
    const group = value as { logic?: 'and' | 'or'; conditions?: Array<{ field: string; operator: string; value: unknown }> } | null
    if (!group || !Array.isArray(group.conditions) || group.conditions.length === 0) {
      setRuleConfig({ when: null })
      return
    }
    const key = group.logic === 'or' ? 'any' : 'all'
    const items = group.conditions
      .filter((item) => item.field)
      .map((item) => ({
        field: item.field,
        op: PACKLOG_CONDITION_OPERATOR_TO_STRUCTURED[item.operator] ?? 'eq',
        value: item.value,
      }))
    setRuleConfig({ when: items.length > 0 ? { [key]: items } : null })
  }, [setRuleConfig])

  return (
    <>
      <FormSection title={t('conformite.rules.packlog.scope_title')} defaultExpanded>
        <FormGrid>
          <DynamicPanelField label={t('conformite.rules.packlog.target_value')} span="full">
            <SearchableSelect
              value={form.target_value ?? 'all'}
              onChange={(v) => setForm({ ...form, target_value: v === 'all' ? '' : v })}
              options={[
                { value: 'all', label: t('conformite.rules.packlog.all_cargo_types') },
                ...cargoTypeOptions.map(option => ({ value: option.value, label: option.label })),
              ]}
              placeholder={t('conformite.rules.packlog.all_cargo_types')}
            />
          </DynamicPanelField>
        </FormGrid>
      </FormSection>

      <FormSection title={t('conformite.rules.packlog.conditions_title')} defaultExpanded={false}>
        <div className="text-xs text-muted-foreground mb-3">{t('conformite.rules.packlog.conditions_help')}</div>
        <ConditionBuilder
          value={builderValue as Record<string, unknown> | null}
          onChange={handleWhenChange}
          fields={conditionFields}
        />
      </FormSection>

      <FormSection title={t('conformite.rules.packlog.requirements_title')} defaultExpanded>
        <FormGrid>
          <DynamicPanelField label={t('conformite.rules.packlog.required_fields')} span="full">
            <MultiSearchableSelect
              values={requiredFields}
              onChange={(values) => setRuleConfig({ required_fields: values })}
              options={packlogFields}
              placeholder={t('conformite.rules.packlog.required_fields_placeholder')}
            />
          </DynamicPanelField>
          <DynamicPanelField label={t('conformite.rules.packlog.required_flags')} span="full">
            <MultiSearchableSelect
              values={requiredFlags}
              onChange={(values) => setRuleConfig({ required_flags: values })}
              options={packlogFlagOptions}
              placeholder={t('conformite.rules.packlog.required_flags_placeholder')}
            />
          </DynamicPanelField>
          <DynamicPanelField label={t('conformite.rules.packlog.required_evidence')} span="full">
            <MultiSearchableSelect
              values={requiredEvidence}
              onChange={(values) => setRuleConfig({ required_evidence_types: values })}
              options={evidenceTypeOptions.map(option => ({ value: option.value, label: option.label }))}
              placeholder={t('conformite.rules.packlog.required_evidence_placeholder')}
            />
          </DynamicPanelField>
        </FormGrid>
      </FormSection>

      <FormSection title={t('conformite.rules.packlog.thresholds_title')} defaultExpanded={false}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs font-medium text-foreground">{t('conformite.rules.packlog.min_values')}</div>
            {thresholdFieldOptions.map((field) => (
              <div key={`min-${field.value}`} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground min-w-0 flex-1">{field.label}</span>
                <input
                  type="number"
                  value={minValues[field.value] ?? ''}
                  onChange={(e) => setThresholdValue('min_values', field.value, e.target.value)}
                  className={cn(panelInputClass, 'w-28')}
                  placeholder="—"
                />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium text-foreground">{t('conformite.rules.packlog.max_values')}</div>
            {thresholdFieldOptions.map((field) => (
              <div key={`max-${field.value}`} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground min-w-0 flex-1">{field.label}</span>
                <input
                  type="number"
                  value={maxValues[field.value] ?? ''}
                  onChange={(e) => setThresholdValue('max_values', field.value, e.target.value)}
                  className={cn(panelInputClass, 'w-28')}
                  placeholder="—"
                />
              </div>
            ))}
          </div>
        </div>
      </FormSection>
    </>
  )
}

function RuleTargetSpecificDesigner({ form, setForm }: {
  form: Record<string, any>
  setForm: (f: Record<string, any>) => void
}) {
  switch (form.target_type) {
    case 'packlog_cargo':
      return <PackLogRuleDesigner form={form} setForm={setForm} />
    default:
      return null
  }
}

export function RuleFormFields({ form, setForm, typesData, jpData, typeReadOnly }: {
  form: Record<string, any>
  setForm: (f: Record<string, any>) => void
  typesData: any
  jpData: any
  typeReadOnly?: boolean
}) {
  const { t } = useTranslation()
  const { ruleTargetOptions, rulePriorityOptions, ruleApplicabilityOptions } = useConformiteDictionaryState()
  const typeOptions = useMemo(() =>
    (typesData?.items ?? []).map((t: any) => ({ value: t.id, label: `${t.code} — ${t.name}`, group: t.category })),
  [typesData])

  const jpOptions = useMemo(() =>
    (jpData?.items ?? []).map((jp: any) => ({ value: jp.id, label: `${jp.code} — ${jp.name}`, group: jp.department })),
  [jpData])

  const ct = typesData?.items?.find((t: any) => t.id === form.compliance_type_id)

  return (
    <PanelContentLayout>
      <FormSection title="Général">
        <FormGrid>
          <DynamicPanelField label="Type de conformité" required span="full">
            {typeReadOnly ? (
              <div className={cn(panelInputClass, 'bg-accent/30 cursor-default')}>
                {ct ? `[${ct.category}] ${ct.code} — ${ct.name}` : '—'}
              </div>
            ) : (
              <SearchableSelect
                value={form.compliance_type_id}
                onChange={(v) => setForm({ ...form, compliance_type_id: v })}
                options={typeOptions}
                placeholder="Rechercher un type..."
              />
            )}
          </DynamicPanelField>
          <DynamicPanelField label="Cible" required>
            <TagSelector
              options={ruleTargetOptions}
              value={form.target_type}
              onChange={(v: string) => setForm({ ...form, target_type: v, target_value: '' })}
            />
          </DynamicPanelField>
          {form.target_type === 'job_position' && (
            <DynamicPanelField label="Fiche(s) de poste" span="full">
              <MultiSearchableSelect
                values={(form.target_value || '').split(',').filter(Boolean)}
                onChange={(vs) => setForm({ ...form, target_value: vs.join(',') })}
                options={jpOptions}
                placeholder="Rechercher et ajouter des postes..."
              />
            </DynamicPanelField>
          )}
          {form.target_type === 'packlog_cargo' && (
            <DynamicPanelField label={t('conformite.rules.packlog.target_value')} span="full">
              <div className={cn(panelInputClass, 'bg-accent/20 text-muted-foreground')}>
                {t('conformite.rules.packlog.scope_help')}
              </div>
            </DynamicPanelField>
          )}
          {(form.target_type === 'asset' || form.target_type === 'tier_type' || form.target_type === 'department') && (
            <DynamicPanelField label="Valeur">
              <input type="text" value={form.target_value} onChange={(e) => setForm({ ...form, target_value: e.target.value })} className={panelInputClass} placeholder={form.target_type === 'department' ? 'Nom du département...' : 'Valeur...'} />
            </DynamicPanelField>
          )}
          <DynamicPanelField label="Description" span="full">
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${panelInputClass} min-h-[48px] resize-y`} placeholder="Description de la règle..." rows={2} />
          </DynamicPanelField>
          <DynamicPanelField label="Priorité">
            <TagSelector
              options={rulePriorityOptions}
              value={form.priority}
              onChange={(v: string) => setForm({ ...form, priority: v })}
            />
          </DynamicPanelField>
          <DynamicPanelField label="Applicabilité">
            <TagSelector
              options={ruleApplicabilityOptions}
              value={form.applicability ?? 'permanent'}
              onChange={(v: string) => setForm({ ...form, applicability: v })}
            />
          </DynamicPanelField>
        </FormGrid>
      </FormSection>

      <FormSection title="Validité & Rappels" defaultExpanded={false}>
        <FormGrid>
          <DynamicPanelField label="Entrée en vigueur">
            <input type="date" value={form.effective_from ?? ''} onChange={(e) => setForm({ ...form, effective_from: e.target.value || null })} className={panelInputClass} />
          </DynamicPanelField>
          <DynamicPanelField label="Fin de validité">
            <input type="date" value={form.effective_to ?? ''} onChange={(e) => setForm({ ...form, effective_to: e.target.value || null })} className={panelInputClass} />
          </DynamicPanelField>
          <DynamicPanelField label="Validité override (jours)">
            <input type="number" value={form.override_validity_days ?? ''} onChange={(e) => setForm({ ...form, override_validity_days: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} placeholder="Vide = utilise la valeur du type" />
          </DynamicPanelField>
          <DynamicPanelField label="Période de grâce (jours)">
            <input type="number" value={form.grace_period_days ?? ''} onChange={(e) => setForm({ ...form, grace_period_days: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} placeholder="0" />
          </DynamicPanelField>
          <DynamicPanelField label="Rappel renouvellement (jours avant)">
            <input type="number" value={form.renewal_reminder_days ?? ''} onChange={(e) => setForm({ ...form, renewal_reminder_days: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} placeholder="60" />
          </DynamicPanelField>
        </FormGrid>
      </FormSection>

      <FormSection title="Conditions d'application" defaultExpanded={false} collapsible>
        {form.target_type === 'packlog_cargo' ? (
          <RuleTargetSpecificDesigner form={form} setForm={setForm} />
        ) : (
          <ConditionBuilder
            value={form.condition_json}
            onChange={(v) => setForm({ ...form, condition_json: v })}
          />
        )}
      </FormSection>
    </PanelContentLayout>
  )
}
