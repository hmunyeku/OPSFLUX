import { useTranslation } from 'react-i18next'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { useAdsList, useAvmList } from '@/hooks/usePaxlog'
import { PanelContent } from '@/components/layout/PanelHeader'
import { ClipboardList, Briefcase, Clock, Info, CheckCircle2 } from 'lucide-react'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { ADS_STATUS_LABELS_FALLBACK, AVM_STATUS_LABELS_FALLBACK, StatCard, formatDateShort, StatusBadge, ADS_STATUS_BADGES, AVM_STATUS_BADGES } from '../shared'

export function RequesterHomeTab({
  onCreateAds,
  onCreateAvm,
  onOpenAds,
  onOpenAvm,
}: {
  onCreateAds: () => void
  onCreateAvm: () => void
  onOpenAds: (id: string) => void
  onOpenAvm: (id: string) => void
}) {
  const { t } = useTranslation()
  const adsStatusLabels = useDictionaryLabels('pax_ads_status', ADS_STATUS_LABELS_FALLBACK)
  const avmStatusLabels = useDictionaryLabels('pax_avm_status', AVM_STATUS_LABELS_FALLBACK)
  const { data: myAds, isLoading: adsLoading } = useAdsList({
    page: 1,
    page_size: 8,
    scope: 'my',
  })
  const { data: avmData, isLoading: avmLoading } = useAvmList({ page: 1, page_size: 6, scope: 'my' })

  const myAvm = avmData?.items ?? []

  const draftAds = (myAds?.items ?? []).filter((item) => item.status === 'draft').length
  const pendingAds = (myAds?.items ?? []).filter((item) => ['submitted', 'pending_compliance', 'pending_validation', 'requires_review'].includes(item.status)).length
  const activeAds = (myAds?.items ?? []).filter((item) => ['approved', 'in_progress'].includes(item.status)).length

  return (
    <PanelContent>
      <div className="p-4 space-y-5">
        <div className="rounded-xl border border-border bg-gradient-to-br from-primary/[0.08] via-background to-amber-500/[0.06] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t('paxlog.requester.eyebrow')}</p>
              <div>
                <h2 className="text-lg font-semibold text-foreground">{t('paxlog.requester.title')}</h2>
                <p className="text-sm text-muted-foreground">
                  {t('paxlog.requester.description')}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="gl-button-sm gl-button-confirm" onClick={onCreateAds}>
                <ClipboardList size={14} />
                {t('paxlog.new_ads')}
              </button>
              <button className="gl-button-sm gl-button-default" onClick={onCreateAvm}>
                <Briefcase size={14} />
                {t('paxlog.new_avm')}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={t('paxlog.requester.kpis.my_ads')} value={myAds?.total ?? 0} icon={ClipboardList} />
          <StatCard label={t('paxlog.requester.kpis.drafts')} value={draftAds} icon={Clock} accent={draftAds > 0 ? 'text-amber-600 dark:text-amber-400' : undefined} />
          <StatCard label={t('paxlog.requester.kpis.pending')} value={pendingAds} icon={Info} accent={pendingAds > 0 ? 'text-primary' : undefined} />
          <StatCard label={t('paxlog.requester.kpis.active_stays')} value={activeAds} icon={CheckCircle2} accent={activeAds > 0 ? 'text-emerald-600 dark:text-emerald-400' : undefined} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <CollapsibleSection id="requester-my-ads" title={t('paxlog.requester.sections.my_ads')} defaultExpanded>
            <div className="space-y-2">
              {adsLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
              {!adsLoading && (myAds?.items ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground italic">{t('paxlog.requester.empty.my_ads')}</p>
              )}
              {(myAds?.items ?? []).map((item) => (
                <button
                  key={item.id}
                  onClick={() => onOpenAds(item.id)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left hover:bg-accent"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-medium text-foreground">{item.reference}</p>
                      <p className="truncate text-sm text-foreground">{item.site_name || t('paxlog.common.site_not_specified')}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDateShort(item.start_date)} → {formatDateShort(item.end_date)} • {item.pax_count} PAX
                      </p>
                    </div>
                    <StatusBadge status={item.status} labels={adsStatusLabels} badges={ADS_STATUS_BADGES} className="shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          </CollapsibleSection>

          <div className="space-y-4">
            <CollapsibleSection id="requester-my-avm" title={t('paxlog.requester.sections.my_avm')} defaultExpanded>
              <div className="space-y-2">
                {avmLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
                {!avmLoading && myAvm.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">{t('paxlog.requester.empty.my_avm')}</p>
                )}
                {myAvm.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onOpenAvm(item.id)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left hover:bg-accent"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-medium text-foreground">{item.reference}</p>
                        <p className="truncate text-sm text-foreground">{item.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatDateShort(item.planned_start_date)} → {formatDateShort(item.planned_end_date)} • {item.pax_count} PAX
                        </p>
                      </div>
                      <StatusBadge status={item.status} labels={avmStatusLabels} badges={AVM_STATUS_BADGES} className="shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            </CollapsibleSection>

            <CollapsibleSection id="requester-guidance" title={t('paxlog.requester.sections.before_submit')}>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>{t('paxlog.requester.guidance.add_pax')}</p>
                <p>{t('paxlog.requester.guidance.use_avm')}</p>
                <p>{t('paxlog.requester.guidance.imputation_rule')}</p>
              </div>
            </CollapsibleSection>
          </div>
        </div>
      </div>
    </PanelContent>
  )
}

