import { useTranslation } from 'react-i18next'
import { usePermission } from '@/hooks/usePermission'
import { useAdsValidationQueue, useAvmList, useExpiringCredentials } from '@/hooks/usePaxlog'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import type { AdsValidationQueueItem } from '@/services/paxlogService'
import { useMemo, useCallback } from 'react'
import { ClipboardList, ThumbsUp, Shield, Briefcase } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { PanelContent } from '@/components/layout/PanelHeader'
import { ADS_STATUS_LABELS_FALLBACK, ADS_STATUS_BADGES, AVM_STATUS_LABELS_FALLBACK, AVM_STATUS_BADGES, CountdownBadge, StatCard, StatusBadge, formatDateShort } from '../shared'

export function ValidatorHomeTab({
  onOpenAds,
  onOpenAvm,
}: {
  onOpenAds: (id: string) => void
  onOpenAvm: (id: string) => void
}) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canSeeCompliance = hasPermission('paxlog.compliance.read')
  const { data: adsData, isLoading: adsLoading } = useAdsValidationQueue({ page: 1, page_size: 12 })
  const { data: avmData, isLoading: avmLoading } = useAvmList({ page: 1, page_size: 8 })
  const { data: expiringCreds, isLoading: expiringLoading } = useExpiringCredentials(30)
  const visitCategoryLabels = useDictionaryLabels('visit_category')
  const adsStatusLabels = useDictionaryLabels('pax_ads_status', ADS_STATUS_LABELS_FALLBACK)
  const avmStatusLabels = useDictionaryLabels('pax_avm_status', AVM_STATUS_LABELS_FALLBACK)

  const adsItems: AdsValidationQueueItem[] = adsData?.items ?? []
  const avmItems = avmData?.items ?? []
  const adsToValidate = adsItems
    .filter((item) => ['submitted', 'pending_project_review', 'pending_compliance', 'pending_validation', 'requires_review'].includes(item.status))
    .sort((a, b) => {
      const score = (item: AdsValidationQueueItem) =>
        (item.blocked_pax_count > 0 ? 100 : 0)
        + (item.remaining_capacity !== null && item.remaining_capacity <= 0 ? 60 : 0)
        + (item.linked_project_count > 1 ? 30 : 0)
        + (item.stay_program_count > 0 ? 20 : 0)
      return score(b) - score(a)
    })
  const adsValidationGroups = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; helper: string | null; items: AdsValidationQueueItem[] }>()
    for (const item of adsToValidate) {
      const projectNames = (item.linked_project_names ?? []).filter(Boolean)
      const groupKey = item.planner_activity_id
        ? `activity:${item.planner_activity_id}`
        : projectNames.length > 0
          ? `projects:${projectNames.join('|')}:${item.site_entry_asset_id}`
          : `site:${item.site_entry_asset_id}`
      const groupLabel = item.planner_activity_title
        || (projectNames.length > 0 ? projectNames.join(', ') : (item.site_name || t('paxlog.common.site_not_specified')))
      const helper = item.planner_activity_title
        ? (projectNames.length > 0 ? t('paxlog.validator.group_helper_projects', { projects: projectNames.join(', ') }) : null)
        : t('paxlog.validator.group_helper_site', { site: item.site_name || t('paxlog.common.site_not_specified') })

      const existing = groups.get(groupKey)
      if (existing) existing.items.push(item)
      else groups.set(groupKey, { key: groupKey, label: groupLabel, helper, items: [item] })
    }
    return Array.from(groups.values())
  }, [adsToValidate, t])
  const adsAwaitingApproval = adsItems.filter((item) => ['submitted', 'pending_project_review', 'pending_validation'].includes(item.status))
  const adsAwaitingCompliance = adsItems.filter((item) => item.status === 'pending_compliance')
  const avmToArbitrate = avmItems.filter((item) => ['in_preparation', 'active', 'ready'].includes(item.status))
  const urgentCreds = (expiringCreds ?? []).filter((item) => item.days_remaining <= 7).slice(0, 6)
  const getCapacityScopeLabel = useCallback((scope: string | null) => {
    if (!scope) return '—'
    if (scope === 'planner_activity' || scope === 'site') {
      return t(`paxlog.waitlist.capacity.scope.${scope}`)
    }
    return scope
  }, [t])
  const getDailyPreviewTone = useCallback((item: AdsValidationQueueItem['daily_capacity_preview'][number]) => {
    if (item.is_critical) return 'border-destructive/30 bg-destructive/10 text-destructive'
    if ((item.saturation_pct ?? 0) >= 85) return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
    return 'border-border bg-muted/40 text-muted-foreground'
  }, [])

  return (
    <PanelContent>
      <div className="p-4 space-y-5">
        <div className="rounded-xl border border-border bg-gradient-to-br from-amber-500/[0.10] via-background to-primary/[0.08] p-4">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t('paxlog.validator.eyebrow')}</p>
            <h2 className="text-lg font-semibold text-foreground">{t('paxlog.validator.title')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('paxlog.validator.description')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={t('paxlog.validator.kpis.ads_to_review')} value={adsToValidate.length} icon={ClipboardList} accent={adsToValidate.length > 0 ? 'text-amber-600 dark:text-amber-400' : undefined} />
          <StatCard label={t('paxlog.validator.kpis.final_validation')} value={adsAwaitingApproval.length} icon={ThumbsUp} accent={adsAwaitingApproval.length > 0 ? 'text-primary' : undefined} />
          <StatCard label={t('paxlog.validator.kpis.compliance_review')} value={adsAwaitingCompliance.length} icon={Shield} accent={adsAwaitingCompliance.length > 0 ? 'text-destructive' : undefined} />
          <StatCard label={t('paxlog.validator.kpis.avm_to_arbitrate')} value={avmToArbitrate.length} icon={Briefcase} accent={avmToArbitrate.length > 0 ? 'text-emerald-600 dark:text-emerald-400' : undefined} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <CollapsibleSection id="validator-ads-queue" title={t('paxlog.validator.sections.ads_priority')} defaultExpanded>
            <div className="space-y-2">
              {adsLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
              {!adsLoading && adsToValidate.length === 0 && (
                <p className="text-xs text-muted-foreground italic">{t('paxlog.validator.empty.ads_priority')}</p>
              )}
              {adsValidationGroups.map((group) => (
                <div key={group.key} className="rounded-xl border border-border bg-muted/20 p-2.5">
                  <div className="mb-2 flex items-start justify-between gap-3 px-1">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{group.label}</p>
                      {group.helper && <p className="text-[11px] text-muted-foreground">{group.helper}</p>}
                    </div>
                    <span className="gl-badge gl-badge-info">{t('paxlog.validator.group_count', { count: group.items.length })}</span>
                  </div>
                  <div className="space-y-2">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => onOpenAds(item.id)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left hover:bg-accent"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-mono text-xs font-medium text-foreground">{item.reference}</p>
                              <StatusBadge status={item.status} labels={adsStatusLabels} badges={ADS_STATUS_BADGES} className="shrink-0" />
                            </div>
                            <p className="truncate text-sm text-foreground">{item.site_name || t('paxlog.common.site_not_specified')}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {visitCategoryLabels[item.visit_category] || item.visit_category}
                              {' • '}
                              {formatDateShort(item.start_date)} → {formatDateShort(item.end_date)}
                              {' • '}
                              {item.pax_count} PAX
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {t('paxlog.validator.capacity_context', {
                                scope: getCapacityScopeLabel(item.capacity_scope),
                                forecast: item.forecast_pax ?? '—',
                                real: item.real_pob ?? '—',
                                remaining: item.remaining_capacity ?? '—',
                                limit: item.capacity_limit ?? '—',
                              })}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {t('paxlog.validator.review_context', {
                                blocked: item.blocked_pax_count ?? 0,
                                projects: item.linked_project_count ?? 0,
                                stayPrograms: item.stay_program_count ?? 0,
                              })}
                            </p>
                            {(item.linked_project_names ?? []).length > 0 && (
                              <p className="text-[11px] text-muted-foreground">
                                {t('paxlog.validator.projects_label', { projects: item.linked_project_names.join(', ') })}
                              </p>
                            )}
                            {(item.daily_capacity_preview ?? []).length > 0 && (
                              <div className="mt-2 space-y-1">
                                <p className="text-[11px] font-medium text-muted-foreground">
                                  {t('paxlog.validator.daily_preview')}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {(item.daily_capacity_preview ?? []).map((day) => (
                                    <div
                                      key={day.date}
                                      className={cn('min-w-[86px] rounded-md border px-2 py-1', getDailyPreviewTone(day))}
                                    >
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em]">
                                        {formatDateShort(day.date)}
                                      </p>
                                      <p className="text-[10px]">
                                        {t('paxlog.validator.daily_preview_values', {
                                          forecast: day.forecast_pax ?? '—',
                                          real: day.real_pob ?? '—',
                                          limit: day.capacity_limit ?? '—',
                                        })}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="mt-1 flex flex-wrap gap-1">
                              {(item.blocked_pax_count ?? 0) > 0 && (
                                <span className="gl-badge gl-badge-danger">{t('paxlog.validator.badges.compliance_blocked', { count: item.blocked_pax_count })}</span>
                              )}
                              {(item.linked_project_count ?? 0) > 1 && (
                                <span className="gl-badge gl-badge-warning">{t('paxlog.validator.badges.multi_project', { count: item.linked_project_count })}</span>
                              )}
                              {(item.stay_program_count ?? 0) > 0 && (
                                <span className="gl-badge gl-badge-info">{t('paxlog.validator.badges.stay_program', { count: item.stay_program_count })}</span>
                              )}
                              {item.remaining_capacity !== null && item.remaining_capacity <= 0 && (
                                <span className="gl-badge gl-badge-warning">{t('paxlog.validator.badges.capacity_full')}</span>
                              )}
                            </div>
                            {item.planner_activity_title && (
                              <p className="text-[11px] text-muted-foreground">{item.planner_activity_title}</p>
                            )}
                            {item.requester_name && <p className="text-[11px] text-muted-foreground">{t('paxlog.validator.requester_label', { name: item.requester_name })}</p>}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          <div className="space-y-4">
            <CollapsibleSection id="validator-avm-queue" title={t('paxlog.validator.sections.avm_priority')} defaultExpanded>
              <div className="space-y-2">
                {avmLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
                {!avmLoading && avmToArbitrate.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">{t('paxlog.validator.empty.avm_priority')}</p>
                )}
                {avmToArbitrate.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onOpenAvm(item.id)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left hover:bg-accent"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-xs font-medium text-foreground">{item.reference}</p>
                          <StatusBadge status={item.status} labels={avmStatusLabels} badges={AVM_STATUS_BADGES} className="shrink-0" />
                        </div>
                        <p className="truncate text-sm text-foreground">{item.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatDateShort(item.planned_start_date)} → {formatDateShort(item.planned_end_date)}
                          {' • '}
                          {t('paxlog.validator.avm_planned_pax', { count: item.pax_quota })}
                          {' • '}
                          {t('paxlog.validator.preparation_progress', { progress: item.preparation_progress })}
                        </p>
                        {item.creator_name && <p className="text-[11px] text-muted-foreground">{t('paxlog.validator.creator_label', { name: item.creator_name })}</p>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </CollapsibleSection>

            {canSeeCompliance && (
              <CollapsibleSection id="validator-compliance-risks" title={t('paxlog.validator.sections.compliance_risks')}>
                <div className="space-y-2">
                  {expiringLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
                  {!expiringLoading && urgentCreds.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">{t('paxlog.validator.empty.compliance_risks')}</p>
                  )}
                  {urgentCreds.map((cred) => (
                    <div key={cred.id} className="rounded-lg border border-border bg-background px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{cred.pax_last_name} {cred.pax_first_name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {cred.credential_type_name}
                            {cred.pax_company_name ? ` • ${cred.pax_company_name}` : ''}
                          </p>
                        </div>
                        <CountdownBadge days={cred.days_remaining} />
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            <CollapsibleSection id="validator-guidance" title={t('paxlog.validator.sections.attention_points')}>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>{t('paxlog.validator.guidance.ads_priority')}</p>
                <p>{t('paxlog.validator.guidance.ads_imputation')}</p>
                <p>{t('paxlog.validator.guidance.avm_scope')}</p>
              </div>
            </CollapsibleSection>
          </div>
        </div>
      </div>
    </PanelContent>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB 2: AVIS DE SEJOUR (AdS)
// ═══════════════════════════════════════════════════════════════

