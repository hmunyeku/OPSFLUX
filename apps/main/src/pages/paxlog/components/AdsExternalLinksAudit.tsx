import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import type { AdsExternalLinkSecurity } from '@/services/paxlogService'

type Props = {
  externalLinks: AdsExternalLinkSecurity[]
  formatDateTime: (value: string | null | undefined) => string
  getExternalLinkEventLabel: (action: string) => string
}

export function AdsExternalLinksAudit({ externalLinks, formatDateTime, getExternalLinkEventLabel }: Props) {
  const { t } = useTranslation()

  if (externalLinks.length === 0) return null

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3 space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-foreground">{t('paxlog.ads_detail.external_link.audit_title')}</p>
        <p className="text-xs text-muted-foreground">{t('paxlog.ads_detail.external_link.audit_description')}</p>
      </div>
      <div className="space-y-3">
        {externalLinks.map((link) => (
          <div key={link.id} className="rounded-lg border border-border/70 bg-background p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('gl-badge', link.active ? 'gl-badge-success' : 'gl-badge-neutral')}>
                {link.active ? t('paxlog.ads_detail.external_link.active') : t('paxlog.ads_detail.external_link.inactive')}
              </span>
              {link.anomaly_count > 0 && (
                <span className="gl-badge gl-badge-danger">
                  {t('paxlog.ads_detail.external_link.anomalies', { count: link.anomaly_count })}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {t('paxlog.ads_detail.external_link.destination_summary', { destination: link.otp_destination_masked || '—' })}
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-3 text-xs">
              <div>
                <span className="text-muted-foreground">{t('paxlog.ads_detail.external_link.created_at')}</span>
                <div>{formatDateTime(link.created_at)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">{t('paxlog.ads_detail.external_link.expires_at')}</span>
                <div>{formatDateTime(link.expires_at)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">{t('paxlog.ads_detail.external_link.uses')}</span>
                <div>
                  {link.use_count} / {link.max_uses}
                  {link.remaining_uses !== null ? ` (${t('paxlog.ads_detail.external_link.remaining_uses', { count: link.remaining_uses })})` : ''}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">{t('paxlog.ads_detail.external_link.last_validated_at')}</span>
                <div>{link.last_validated_at ? formatDateTime(link.last_validated_at) : '—'}</div>
              </div>
              <div>
                <span className="text-muted-foreground">{t('paxlog.ads_detail.external_link.session_expires_at')}</span>
                <div>{link.session_expires_at ? formatDateTime(link.session_expires_at) : '—'}</div>
              </div>
              <div>
                <span className="text-muted-foreground">{t('paxlog.ads_detail.external_link.otp_required')}</span>
                <div>{link.otp_required ? t('common.yes') : t('common.no')}</div>
              </div>
            </div>
            {Object.keys(link.anomaly_actions || {}).length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground">{t('paxlog.ads_detail.external_link.anomaly_breakdown')}</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(link.anomaly_actions).map(([action, count]) => (
                    <span key={action} className="gl-badge gl-badge-danger">
                      {getExternalLinkEventLabel(action)}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {link.recent_events.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground">{t('paxlog.ads_detail.external_link.recent_events')}</p>
                <div className="space-y-1">
                  {link.recent_events.map((event, index) => (
                    <div key={`${link.id}-${event.action}-${index}`} className="flex items-center justify-between gap-3 text-xs">
                      <span>{getExternalLinkEventLabel(event.action)}</span>
                      <span className="text-muted-foreground">{event.timestamp ? formatDateTime(event.timestamp) : '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
