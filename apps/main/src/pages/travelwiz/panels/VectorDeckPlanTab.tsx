/**
 * VectorDeckPlanTab — Draw.io-authored floor plan for a transport vector.
 *
 * Reuses the existing PID/PFD DrawioEditor component (iframe + postMessage).
 * The XML is saved on `transport_vectors.deck_plan_xml`; the cached SVG
 * export is wired separately once the editor enhancement lands. The plan
 * acts as the visual background for the upcoming cargo placement canvas.
 */
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Map as MapIcon, Pencil, Loader2 } from 'lucide-react'
import i18n from '@/lib/i18n'

import { FormSection } from '@/components/layout/DynamicPanel'
import { useToast } from '@/components/ui/Toast'
import { DrawioEditor } from '@/components/pid-pfd/DrawioEditor'
import { useVectorDeckPlan, useSaveVectorDeckPlan } from '@/hooks/useTravelWiz'
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
  const { toast } = useToast()
  const { hasPermission } = usePermission()
  const canEdit = hasPermission('travelwiz.vector.update')

  const { data: plan, isLoading } = useVectorDeckPlan(vectorId)
  const savePlan = useSaveVectorDeckPlan()
  const [editing, setEditing] = useState(false)

  const handleSave = useCallback(
    (xml: string) => {
      savePlan.mutate(
        { vectorId, payload: { deck_plan_xml: xml } },
        {
          onSuccess: () => {
            toast({ title: t('common.saved', 'Enregistré'), variant: 'success' })
          },
          onError: () => {
            toast({
              title: t('common.save_failed', "Échec de l'enregistrement"),
              variant: 'error',
            })
          },
        },
      )
    },
    [savePlan, vectorId, toast, t],
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (editing) {
    return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 12rem)', minHeight: 480 }}>
        <DrawioEditor
          xmlContent={plan?.deck_plan_xml ?? null}
          onSave={handleSave}
          onClose={() => setEditing(false)}
        />
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
            onClick={() => setEditing(true)}
          >
            <Pencil size={12} />
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
