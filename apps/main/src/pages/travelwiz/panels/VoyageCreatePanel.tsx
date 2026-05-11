import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plane, Plus, X } from 'lucide-react'
import { describeError } from '@/lib/errors'
import { DynamicPanelShell, PanelContentLayout, FormGrid, DynamicPanelField, panelInputClass, type ActionItem } from '@/components/layout/DynamicPanel'
import {
  SmartFormProvider,
  SmartFormSection,
  SmartFormToolbar,
  SmartFormSimpleHint,
  SmartFormWizardNav,
  SmartFormInlineHelpDrawer,
  useSmartForm,
} from '@/components/layout/SmartForm'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { useToast } from '@/components/ui/Toast'
import { useUIStore } from '@/stores/uiStore'
import { useCreateVoyage, useCreateVoyageStop, useVectors, useRotations } from '@/hooks/useTravelWiz'
import type { VoyageCreate } from '@/types/api'

/** Une étape staged côté client avant submit, prête à devenir un VoyageStop. */
interface StagedStop {
  /** Local id pour la key React seulement. */
  uid: string
  asset_id: string
  scheduled_arrival: string
  scheduled_departure: string
  pax_boarded_count: number
  pax_disembarked_count: number
  cargo_loaded_kg: number
  cargo_unloaded_kg: number
  notes: string
}

export function CreateVoyagePanel() {
  return (
    <SmartFormProvider panelId="create-voyage" defaultMode="simple">
      <CreateVoyageInner />
    </SmartFormProvider>
  )
}

function CreateVoyageInner() {
  const _ctx = useSmartForm()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const createVoyage = useCreateVoyage()
  const createStop = useCreateVoyageStop()
  const { data: vectorsData } = useVectors({ page: 1, page_size: 100 })
  const { data: rotationsData } = useRotations({ page: 1, page_size: 100 })
  const { toast } = useToast()
  const { t } = useTranslation()
  const [form, setForm] = useState<VoyageCreate>({
    vector_id: '',
    departure_base_id: '',
    scheduled_departure: '',
    scheduled_arrival: null,
    rotation_id: null,
  })
  // Itinéraire staged : Bastien feedback "les informations demandées sur
  // la route sont très peu suffisantes". On permet maintenant de définir
  // les étapes dès la création (au lieu de devoir aller dans la fiche
  // après). Chaque étape sera créée via useCreateVoyageStop en cascade
  // après la création du voyage.
  const [stops, setStops] = useState<StagedStop[]>([])
  const addStop = () => {
    setStops((prev) => [...prev, {
      uid: `s-${Date.now()}-${prev.length}`,
      asset_id: '',
      scheduled_arrival: '',
      scheduled_departure: '',
      pax_boarded_count: 0,
      pax_disembarked_count: 0,
      cargo_loaded_kg: 0,
      cargo_unloaded_kg: 0,
      notes: '',
    }])
  }
  const updateStop = (uid: string, patch: Partial<StagedStop>) => {
    setStops((prev) => prev.map((s) => s.uid === uid ? { ...s, ...patch } : s))
  }
  const removeStop = (uid: string) => {
    setStops((prev) => prev.filter((s) => s.uid !== uid))
  }
  const vectors = vectorsData?.items ?? []
  const rotations = useMemo(
    () => (rotationsData?.items ?? []).filter((rotation) => !form.vector_id || rotation.vector_id === form.vector_id),
    [rotationsData?.items, form.vector_id],
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const created = await createVoyage.mutateAsync(form)
      // Création en cascade des étapes staged. Si une étape échoue, on
      // toast un warning mais le voyage reste créé — l'utilisateur peut
      // ajouter manuellement les étapes manquantes depuis la fiche.
      const validStops = stops.filter((s) => s.asset_id)
      if (validStops.length > 0) {
        let stopsCreated = 0
        let stopsFailed = 0
        for (let i = 0; i < validStops.length; i++) {
          const s = validStops[i]
          try {
            await createStop.mutateAsync({
              voyageId: created.id,
              payload: {
                asset_id: s.asset_id,
                stop_order: i + 1,
                scheduled_arrival: s.scheduled_arrival ? new Date(s.scheduled_arrival).toISOString() : null,
                scheduled_departure: s.scheduled_departure ? new Date(s.scheduled_departure).toISOString() : null,
                pax_boarded_count: s.pax_boarded_count || 0,
                pax_disembarked_count: s.pax_disembarked_count || 0,
                cargo_loaded_kg: s.cargo_loaded_kg || 0,
                cargo_unloaded_kg: s.cargo_unloaded_kg || 0,
                notes: s.notes || null,
              },
            })
            stopsCreated++
          } catch {
            stopsFailed++
          }
        }
        if (stopsFailed > 0) {
          toast({
            title: `Voyage créé, mais ${stopsFailed} étape(s) en erreur`,
            description: `${stopsCreated} étape(s) ajoutée(s) sur ${validStops.length}. Vous pouvez compléter depuis la fiche du voyage.`,
            variant: 'warning',
          })
        } else {
          toast({
            title: t('travelwiz.toast.voyage_created'),
            description: `${stopsCreated} étape(s) ajoutée(s) à la route.`,
            variant: 'success',
          })
        }
      } else {
        toast({ title: t('travelwiz.toast.voyage_created'), variant: 'success' })
      }
      closeDynamicPanel()
      openDynamicPanel({ type: 'detail', module: 'travelwiz', id: created.id, meta: { subtype: 'voyage' } })
    } catch (err) {
      toast({
        title: t('travelwiz.toast.voyage_creation_error'),
        description: describeError(err, t),
        variant: 'error',
      })
    }
  }

  const createVoyageActions = useMemo<ActionItem[]>(() => [
    { id: 'cancel', label: 'Annuler', variant: 'default', priority: 40, onClick: closeDynamicPanel },
    { id: 'submit', label: 'Creer', variant: 'primary', priority: 100, loading: createVoyage.isPending, disabled: createVoyage.isPending, onClick: () => (document.getElementById('create-voyage-form') as HTMLFormElement)?.requestSubmit() },
  ], [closeDynamicPanel, createVoyage.isPending])

  return (
    <DynamicPanelShell title="Nouveau voyage" subtitle="TravelWiz" icon={<Plane size={14} className="text-primary" />}
      actionItems={createVoyageActions}
    >
      <form id="create-voyage-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
        <SmartFormToolbar />
        <SmartFormSimpleHint />
        <SmartFormInlineHelpDrawer />
          <SmartFormSection id="t_common_identification" title={t('common.identification')} level="essential" help={{ description: t('common.identification') }}>
            <FormGrid>
              <DynamicPanelField label={t('common.reference')}>
                <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Générée automatiquement par la numérotation TravelWiz au moment de la création.
                </div>
              </DynamicPanelField>
              <DynamicPanelField label={t('common.vector')} required>
                <select
                  required
                  value={form.vector_id}
                  onChange={(e) => setForm({ ...form, vector_id: e.target.value, rotation_id: null })}
                  className={panelInputClass}
                >
                  <option value="">Sélectionner un vecteur...</option>
                  {vectors.map((vector) => (
                    <option key={vector.id} value={vector.id}>
                      {vector.registration} - {vector.name}
                    </option>
                  ))}
                </select>
              </DynamicPanelField>
            </FormGrid>
          </SmartFormSection>
          <SmartFormSection id="t_common_scheduling" title={t('common.scheduling')} level="essential" help={{ description: t('common.scheduling') }}>
            <FormGrid>
              <DynamicPanelField label={t('common.rotation')}>
                <select
                  value={form.rotation_id ?? ''}
                  onChange={(e) => setForm({ ...form, rotation_id: e.target.value || null })}
                  className={panelInputClass}
                >
                  <option value="">Voyage ponctuel</option>
                  {rotations.map((rotation) => (
                    <option key={rotation.id} value={rotation.id}>
                      {rotation.name}{rotation.schedule_description ? ` - ${rotation.schedule_description}` : ''}
                    </option>
                  ))}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label={t('common.departure_base')} required span="full">
                <AssetPicker
                  value={form.departure_base_id || null}
                  onChange={(assetId) => setForm({ ...form, departure_base_id: assetId ?? '' })}
                  placeholder="Sélectionner une base de départ..."
                />
              </DynamicPanelField>
            </FormGrid>
            <p className="text-xs text-muted-foreground">
              La périodicité régulière se configure sur une rotation. Un voyage créé ici est une occurrence planifiée, éventuellement rattachée à une rotation existante.
            </p>
          </SmartFormSection>

          {/* ITINÉRAIRE — Bastien feedback: pouvoir definir les etapes
              du trajet des la creation, pas juste apres. Chaque etape
              peut definir asset destination + ar/dep + flow PAX/cargo. */}
          <SmartFormSection
            id="t_voyage_itinerary"
            title="Itinéraire (étapes optionnelles)"
            level="advanced"
            skippable
            help={{ description: "Un voyage peut passer par plusieurs sites entre son point de départ et sa destination finale. Définissez l'ordre des escales et, pour chacune, qui embarque, qui descend, et le cargo manipulé." }}
          >
            {stops.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/60 bg-muted/30 px-3 py-4 text-center">
                <p className="text-xs text-muted-foreground mb-2">
                  Aucune étape définie — le voyage ira du départ jusqu'à la destination finale en direct.
                </p>
                <button
                  type="button"
                  onClick={addStop}
                  className="btn-sm btn-secondary"
                >
                  <Plus size={11} /> Ajouter une étape (escale ou destination)
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {stops.map((s, idx) => {
                  const isLast = idx === stops.length - 1
                  return (
                    <div key={s.uid} className="rounded-lg border border-border/70 bg-card p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={
                          isLast
                            ? "inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500/15 text-green-700 dark:text-green-400 text-[11px] font-semibold"
                            : "inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground text-[11px] font-semibold"
                        }>
                          {isLast ? 'D' : (idx + 1)}
                        </span>
                        <span className="text-xs font-medium text-foreground">
                          {isLast ? 'Destination finale' : `Escale ${idx + 1}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeStop(s.uid)}
                          className="ml-auto p-1 rounded hover:bg-destructive/10 text-destructive transition-colors"
                          title="Retirer cette étape"
                        >
                          <X size={12} />
                        </button>
                      </div>
                      <DynamicPanelField label="Site / installation" required>
                        <AssetPicker
                          value={s.asset_id || null}
                          onChange={(id) => updateStop(s.uid, { asset_id: id || '' })}
                          placeholder="Sélectionner la destination de cette étape..."
                        />
                      </DynamicPanelField>
                      <FormGrid>
                        <DynamicPanelField label="Arrivée prévue (optionnel)">
                          <input
                            type="datetime-local"
                            value={s.scheduled_arrival}
                            onChange={(e) => updateStop(s.uid, { scheduled_arrival: e.target.value })}
                            className={panelInputClass}
                          />
                        </DynamicPanelField>
                        <DynamicPanelField label="Départ prévu (optionnel)">
                          <input
                            type="datetime-local"
                            value={s.scheduled_departure}
                            onChange={(e) => updateStop(s.uid, { scheduled_departure: e.target.value })}
                            className={panelInputClass}
                          />
                        </DynamicPanelField>
                      </FormGrid>
                      <FormGrid>
                        <DynamicPanelField label="↑ PAX qui embarquent">
                          <input
                            type="number"
                            min={0}
                            value={s.pax_boarded_count}
                            onChange={(e) => updateStop(s.uid, { pax_boarded_count: Number(e.target.value) || 0 })}
                            className={panelInputClass}
                          />
                        </DynamicPanelField>
                        <DynamicPanelField label="↓ PAX qui descendent">
                          <input
                            type="number"
                            min={0}
                            value={s.pax_disembarked_count}
                            onChange={(e) => updateStop(s.uid, { pax_disembarked_count: Number(e.target.value) || 0 })}
                            className={panelInputClass}
                          />
                        </DynamicPanelField>
                      </FormGrid>
                      <FormGrid>
                        <DynamicPanelField label="↑ Cargo chargé (kg)">
                          <input
                            type="number"
                            min={0}
                            value={s.cargo_loaded_kg}
                            onChange={(e) => updateStop(s.uid, { cargo_loaded_kg: Number(e.target.value) || 0 })}
                            className={panelInputClass}
                          />
                        </DynamicPanelField>
                        <DynamicPanelField label="↓ Cargo déchargé (kg)">
                          <input
                            type="number"
                            min={0}
                            value={s.cargo_unloaded_kg}
                            onChange={(e) => updateStop(s.uid, { cargo_unloaded_kg: Number(e.target.value) || 0 })}
                            className={panelInputClass}
                          />
                        </DynamicPanelField>
                      </FormGrid>
                      <DynamicPanelField label="Notes (optionnel)">
                        <textarea
                          value={s.notes}
                          onChange={(e) => updateStop(s.uid, { notes: e.target.value })}
                          className={`${panelInputClass} min-h-[50px]`}
                          placeholder="Contact local, raison de l'escale, instructions..."
                        />
                      </DynamicPanelField>
                    </div>
                  )
                })}
                <button
                  type="button"
                  onClick={addStop}
                  className="btn-sm btn-secondary w-full justify-center"
                >
                  <Plus size={11} /> Ajouter une autre étape
                </button>
                <p className="text-[10px] text-muted-foreground text-center">
                  La dernière étape sera marquée comme destination finale (D). Les autres sont des escales intermédiaires.
                </p>
              </div>
            )}
          </SmartFormSection>
          <SmartFormSection id="t_common_schedule_hours" title={t('common.schedule_hours')} level="essential" help={{ description: t('common.schedule_hours') }}>
            <FormGrid>
              <DynamicPanelField label="Départ prévu" required>
                <input
                  type="datetime-local"
                  required
                  value={form.scheduled_departure}
                  onChange={(e) => setForm({ ...form, scheduled_departure: e.target.value })}
                  className={panelInputClass}
                />
              </DynamicPanelField>
              <DynamicPanelField label="Arrivée prévue">
                <input
                  type="datetime-local"
                  value={form.scheduled_arrival ?? ''}
                  onChange={(e) => setForm({ ...form, scheduled_arrival: e.target.value || null })}
                  className={panelInputClass}
                />
              </DynamicPanelField>
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
