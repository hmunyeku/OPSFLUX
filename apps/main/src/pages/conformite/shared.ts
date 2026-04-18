/**
 * Shared types, constants, hooks, and helpers for the Conformite page.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldCheck, LayoutDashboard, Briefcase, ClipboardList, Scale, ShieldOff, FileCheck, ClipboardCheck, GitBranch } from 'lucide-react'
import { useDictionaryLabels, useDictionaryOptions } from '@/hooks/useDictionary'

export type ConformiteTab = 'dashboard' | 'referentiel' | 'enregistrements' | 'verifications' | 'exemptions' | 'fiches' | 'regles' | 'transferts'

export const VALID_CONF_TABS = new Set<ConformiteTab>(['dashboard', 'referentiel', 'enregistrements', 'verifications', 'exemptions', 'fiches', 'regles', 'transferts'])

export const CATEGORY_COLORS_MAP: Record<string, string> = {
  formation: 'bg-blue-600',
  certification: 'bg-emerald-600',
  habilitation: 'bg-violet-600',
  audit: 'bg-amber-600',
  medical: 'bg-rose-600',
  epi: 'bg-cyan-600',
}

export const CATEGORY_ORDER: string[] = ['formation', 'certification', 'habilitation', 'medical', 'epi', 'audit']

export const PRIORITY_COLORS: Record<string, string> = { high: 'bg-red-600', normal: 'bg-zinc-500', low: 'bg-sky-500' }

export const PACKLOG_CONDITION_OPERATOR_TO_STRUCTURED: Record<string, string> = {
  equals: 'eq',
  not_equals: 'ne',
  greater_than: 'gt',
  less_than: 'lt',
  greater_or_equal: 'gte',
  less_or_equal: 'lte',
  contains: 'contains',
}

export const STRUCTURED_OPERATOR_TO_PACKLOG_CONDITION: Record<string, string> = {
  eq: 'equals',
  ne: 'not_equals',
  gt: 'greater_than',
  lt: 'less_than',
  gte: 'greater_or_equal',
  lte: 'less_or_equal',
  contains: 'contains',
}

export function buildPackLogConditionBuilderValue(value: Record<string, any> | null) {
  const when = value?.when
  if (!when || typeof when !== 'object') return null
  const whenObj = when as Record<string, unknown>
  const logic = Array.isArray(whenObj.any) ? 'or' : 'and'
  const conditions = ((whenObj.all ?? whenObj.any) as Array<Record<string, any>> | undefined)?.map((item) => ({
    field: item.field ?? '',
    operator: STRUCTURED_OPERATOR_TO_PACKLOG_CONDITION[String(item.op ?? 'eq')] ?? 'equals',
    value: item.value ?? '',
  })) ?? []
  if (conditions.some((item) => !item.field)) return null
  return { logic, conditions }
}

export function updatePackLogRuleConfig(
  current: Record<string, any> | null | undefined,
  patch: Record<string, unknown>,
) {
  const next = { ...(current ?? {}) }
  for (const [key, value] of Object.entries(patch)) {
    if (
      value == null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0)
    ) {
      delete next[key]
    } else {
      next[key] = value
    }
  }
  return Object.keys(next).length > 0 ? next : null
}

export function useConformiteTabs() {
  const { t } = useTranslation()
  return useMemo<{ id: ConformiteTab; label: string; icon: typeof ShieldCheck }[]>(() => [
    { id: 'dashboard', label: t('conformite.tabs.dashboard'), icon: LayoutDashboard },
    { id: 'fiches', label: t('conformite.tabs.fiches_poste'), icon: Briefcase },
    { id: 'referentiel', label: t('conformite.tabs.referentiel'), icon: ClipboardList },
    { id: 'regles', label: t('conformite.tabs.regles'), icon: Scale },
    { id: 'exemptions', label: t('conformite.tabs.exemptions'), icon: ShieldOff },
    { id: 'enregistrements', label: t('conformite.tabs.enregistrements'), icon: FileCheck },
    { id: 'verifications', label: t('conformite.tabs.verifications'), icon: ClipboardCheck },
    { id: 'transferts', label: t('conformite.tabs.transferts'), icon: GitBranch },
  ], [t])
}

export function useConformiteDictionaryState() {
  const { t } = useTranslation()

  const categoryOptions = useDictionaryOptions('compliance_category')
  const statusOptions = useDictionaryOptions('compliance_status')
  const exemptionStatusOptions = useDictionaryOptions('compliance_exemption_status')
  const ruleTargetOptions = useDictionaryOptions('compliance_rule_target')
  const verificationStatusOptions = useDictionaryOptions('compliance_verification_status')
  const rulePriorityOptions = useDictionaryOptions('compliance_rule_priority')
  const ruleApplicabilityOptions = useDictionaryOptions('compliance_rule_applicability')

  const categoryLabels = useDictionaryLabels('compliance_category', {
    formation: t('conformite.types.formation'),
    certification: t('conformite.types.certification'),
    habilitation: t('conformite.types.habilitation'),
    audit: t('conformite.types.audit'),
    medical: t('conformite.types.medical'),
    epi: t('conformite.types.epi'),
  })
  const statusLabels = useDictionaryLabels('compliance_status', {
    valid: t('conformite.records.valid'),
    expired: t('conformite.records.expired'),
    pending: t('conformite.records.pending'),
    rejected: t('conformite.records.rejected'),
  })
  const exemptionStatusLabels = useDictionaryLabels('compliance_exemption_status', {
    pending: t('conformite.exemptions.pending'),
    approved: t('conformite.exemptions.approved'),
    rejected: t('conformite.exemptions.rejected'),
    expired: t('conformite.exemptions.expired'),
  })
  const ruleTargetLabels = useDictionaryLabels('compliance_rule_target', {
    all: t('conformite.rules.targets.all'),
    tier_type: t('conformite.rules.targets.tier_type'),
    asset: t('conformite.rules.targets.asset'),
    department: t('conformite.rules.targets.department'),
    job_position: t('conformite.rules.targets.job_position'),
    packlog_cargo: t('conformite.rules.targets.packlog_cargo'),
  })
  const verificationStatusLabels = useDictionaryLabels('compliance_verification_status', {
    pending: t('conformite.verifications.pending'),
    verified: t('conformite.verifications.verified'),
    rejected: t('conformite.verifications.rejected'),
  })
  const rulePriorityLabels = useDictionaryLabels('compliance_rule_priority', {
    high: t('conformite.rules.priority.high'),
    normal: t('conformite.rules.priority.normal'),
    low: t('conformite.rules.priority.low'),
  })
  const ruleApplicabilityLabels = useDictionaryLabels('compliance_rule_applicability', {
    permanent: t('conformite.rules.applicability.permanent'),
    contextual: t('conformite.rules.applicability.contextual'),
  })

  return {
    categoryOptions,
    categoryLabels,
    statusOptions,
    statusLabels,
    exemptionStatusOptions,
    exemptionStatusLabels,
    ruleTargetOptions,
    ruleTargetLabels,
    verificationStatusOptions,
    verificationStatusLabels,
    rulePriorityOptions,
    rulePriorityLabels,
    ruleApplicabilityOptions,
    ruleApplicabilityLabels,
  }
}

export function useVerificationRecordTypeLabels() {
  const { t } = useTranslation()
  return useMemo<Record<string, string>>(() => ({
    compliance_record: t('conformite.verifications.record_types.compliance_record'),
    passport: t('conformite.verifications.record_types.passport'),
    visa: t('conformite.verifications.record_types.visa'),
    social_security: t('conformite.verifications.record_types.social_security'),
    vaccine: t('conformite.verifications.record_types.vaccine'),
    driving_license: t('conformite.verifications.record_types.driving_license'),
    medical_check: t('conformite.verifications.record_types.medical_check'),
  }), [t])
}
