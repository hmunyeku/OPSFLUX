/**
 * VectorDeckPlanTab — Draw.io-authored floor plan for a transport vector.
 *
 * The full editor lives in a dedicated route `/_drawio/vector/:vectorId`
 * opened in a real OS window via `window.open`. The Draw.io app needs as
 * much screen real estate as it can get, and parking the editor on a
 * second monitor is a common workflow. The tab itself stays a tight
 * status surface : last-modified chip + "Modifier le plan" button +
 * an inline SVG preview when one is cached.
 *
 * Save round-trip : the popup writes through `useSaveVectorDeckPlan`,
 * which invalidates the React Query keys. The QueryCache BroadcastChannel
 * wired in `lib/queryClient.ts` propagates the invalidation back to the
 * parent so this tab refreshes automatically.
 */
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Map as MapIcon, Pencil, Loader2, ExternalLink } from 'lucide-react'
import i18n from '@/lib/i18n'

import { FormSection } from '@/components/layout/DynamicPanel'
import { useVectorDeckPlan } from '@/hooks/useTravelWiz'
import { usePermission } from '@/hooks/usePermission'

const dateLocale = (): string => (i18n.language === 'en' ? 'en-US' : 'fr-FR')

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(dateLocale())
  } catch {
    return iso
  }
}

export function VectorDeckPlanTab({ vectorId }: { vectorId: string }) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canEdit = hasPermission('travelwiz.vector.update')

  const { data: plan, isLoading } = useVectorDeckPlan(vectorId)

  const openEditor = useCallback(() => {
    // Open the dedicated /_drawio route in a sized OS window. We don't
    // care about the popup handle: save round-trips through React Query
    // and the parent picks up the change via BroadcastChannel.
    const w = Math.min(window.screen.availWidth - 80, 1600)
    const h = Math.min(window.screen.availHeight - 120, 1000)
    const left = Math.max(0, Math.floor((window.screen.availWidth - w) / 2))
    const top = Math.max(0, Math.floor((window.screen.availHeight - h) / 2))
    window.open(
      `/_drawio/vector/${vectorId}`,
      `opsflux-drawio-${vectorId}`,
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no`,
    )
  }, [vectorId])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <FormSection
      title={t('travelwiz.vector.deck_plan.title', 'Plan du navire')}
      collapsible
      defaultExpanded
    >
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {t(
            'travelwiz.vector.deck_plan.description',
            "Plan 2D du navire dessiné dans Draw.io. Sert de fond pour le placement des colis sur le pont.",
          )}
        </p>

        <div className="rounded-lg border border-border/60 bg-card p-3 space-y-2">
          <div className="flex items-center gap-2">
            <MapIcon size={14} className="text-muted-foreground" />
            <span className="text-xs font-medium">
              {plan?.deck_plan_xml
                ? t('travelwiz.vector.deck_plan.has_plan', 'Plan défini')
                : t('travelwiz.vector.deck_plan.no_plan', 'Aucun plan')}
            </span>
          </div>
          {plan?.deck_plan_updated_at && (
            <div className="text-xs text-muted-foreground">
              {t('common.last_modified', 'Dernière modification')}{' '}
              {formatDateTime(plan.deck_plan_updated_at)}
              {plan.deck_plan_updated_by_name && ` — ${plan.deck_plan_updated_by_name}`}
            </div>
          )}
        </div>

        {canEdit && (
          <button
            type="button"
            className="gl-button-sm gl-button-confirm"
            onClick={openEditor}
            title={t('travelwiz.vector.deck_plan.open_in_window', 'Ouvrir dans une fenêtre')}
          >
            {plan?.deck_plan_xml ? <Pencil size={12} /> : <ExternalLink size={12} />}
            <span>
              {plan?.deck_plan_xml
                ? t('travelwiz.vector.deck_plan.edit', 'Modifier le plan')
                : t('travelwiz.vector.deck_plan.create', 'Créer le plan')}
            </span>
          </button>
        )}

        {plan?.deck_plan_svg && (
          <div className="rounded-lg border border-border/60 bg-card p-2">
            <div
              className="w-full overflow-auto"
              style={{ maxHeight: 360 }}
              // SVG comes from our trusted Draw.io export pipeline. We intentionally
              // inline it — the canvas overlay later will reference shapes by id.
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: plan.deck_plan_svg }}
            />
          </div>
        )}
      </div>
    </FormSection>
  )
}
