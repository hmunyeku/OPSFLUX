/**
 * DrawioVectorEditorPage — full-window Draw.io editor for a transport
 * vector's deck plan, opened via `window.open` from VectorDeckPlanTab.
 *
 * Why a separate route instead of an inline iframe :
 *   - The Draw.io editor needs as much screen real estate as it can
 *     get; embedding it in a side panel is uncomfortable.
 *   - The user can park it on a second monitor while the cargo
 *     placement canvas stays on the main one.
 *
 * Sync with the parent :
 *   - Auth comes for free (same-origin cookies + localStorage token).
 *   - Save writes through `useSaveVectorDeckPlan` like the inline
 *     panel did. The hook invalidates the React Query keys, and the
 *     parent picks up the fresh `deck_plan_xml` thanks to the
 *     QueryCache BroadcastChannel wired in `lib/queryClient.ts`.
 *   - Closing the window is left to the user (no auto-close on save
 *     so they can iterate on the plan).
 *
 * URL contract :
 *   /_drawio/vector/:vectorId
 *
 * No query params — the entity is identified by the URL path.
 */
import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import { DrawioEditor } from '@/components/pid-pfd/DrawioEditor'
import { useToast } from '@/components/ui/Toast'
import { useVector, useVectorDeckPlan, useSaveVectorDeckPlan } from '@/hooks/useTravelWiz'

export function DrawioVectorEditorPage() {
  const { vectorId } = useParams<{ vectorId: string }>()
  const { t } = useTranslation()
  const { toast } = useToast()
  const { data: vector } = useVector(vectorId)
  const { data: plan, isLoading } = useVectorDeckPlan(vectorId)
  const savePlan = useSaveVectorDeckPlan()

  // Surface the vector identity on the OS window's title so the user
  // can tell the popup apart from other windows on the taskbar.
  useEffect(() => {
    const base = vector?.name || t('travelwiz.vector.deck_plan.title', 'Plan du navire')
    document.title = `${base} — Draw.io · OpsFlux`
  }, [vector?.name, t])

  const handleSave = useCallback(
    (xml: string) => {
      if (!vectorId) return
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

  if (!vectorId) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        {t('travelwiz.vector.deck_plan.invalid_url', 'Identifiant de vecteur manquant.')}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-background">
      <DrawioEditor
        xmlContent={plan?.deck_plan_xml ?? null}
        onSave={handleSave}
        onClose={() => window.close()}
      />
    </div>
  )
}

export default DrawioVectorEditorPage
