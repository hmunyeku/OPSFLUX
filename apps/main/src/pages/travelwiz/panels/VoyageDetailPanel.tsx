import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '@/lib/i18n'

const numLocale = (): string => (i18n.language === 'en' ? 'en-US' : 'fr-FR')
import {
  Plane, Package, FileText, Users, MapPin, Weight,
  Loader2, Trash2, CheckCircle2, Plus, X,
  Info, BookOpen, Paperclip,
  ChevronDown, ChevronUp, ArrowUp, ArrowDown,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TabBar } from '@/components/ui/Tabs'
import {
  DynamicPanelShell, PanelContentLayout, FormSection, FormGrid, DynamicPanelField,
  DetailFieldGrid, ReadOnlyRow, panelInputClass, type ActionItem,
} from '@/components/layout/DynamicPanel'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { TagManager } from '@/components/shared/TagManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { ExportWizard } from '@/components/shared/ExportWizard'
import { useToast } from '@/components/ui/Toast'
import { useUIStore } from '@/stores/uiStore'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import {
  useVoyage,
  useUpdateVoyage,
  useDeleteVoyage,
  useUpdateVoyageStatus,
  useCloseTrip,
  useVoyagePaxManifestPdf,
  useVoyageCargoManifestPdf,
  useVoyageStops,
  useCreateVoyageStop,
  useUpdateVoyageStop,
  useDeleteVoyageStop,
  useVoyageManifests,
  useVoyageCapacity,
  useVoyageEvents,
  useTripKpis,
  useVoyageCargoOperationsReport,
  useVectors,
  useRotations,
} from '@/hooks/useTravelWiz'
import { usePermission } from '@/hooks/usePermission'
import type { VoyageStop, VoyageUpdate } from '@/types/api'
import {
  VOYAGE_STATUS_LABELS_FALLBACK, VOYAGE_STATUS_BADGES,
  MANIFEST_STATUS_LABELS_FALLBACK, MANIFEST_STATUS_BADGES,
  CARGO_STATUS_LABELS_FALLBACK,
  buildStatusOptions, formatDateTime,
} from '../shared'
import { StatusBadge } from '../components'

function VoyageCargoOperationsSection({
  report,
  cargoStatusLabels,
  packageReturnStatusLabels,
  onOpenExport,
}: {
  report: {
    cargo_count: number
    delivered_count: number
    damaged_count: number
    missing_count: number
    return_started_count: number
    items: Array<{
      cargo_id: string
      tracking_code: string
      request_code?: string | null
      designation: string | null
      description: string
      status: string
      destination_name: string | null
      weight_kg: number
      total_sent_units: number
      total_returned_units: number
      return_coverage_ratio: number
      aggregate_return_status: string
      aggregate_disposition: string
    }>
  } | undefined
  cargoStatusLabels: Record<string, string>
  packageReturnStatusLabels: Record<string, string>
  onOpenExport: () => void
}) {
  const { t } = useTranslation()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  return (
    <FormSection title="Rapport cargo opérationnel" collapsible defaultExpanded>
      {!report || report.items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucun cargo affecté à ce voyage.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button className="btn-sm btn-secondary text-xs" onClick={onOpenExport}>
              Exporter le rapport
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
            <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('common.packages')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{report.cargo_count}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('common.delivered')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{report.delivered_count}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('common.damaged')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{report.damaged_count}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('common.missing')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{report.missing_count}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Retours démarrés</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{report.return_started_count}</p>
            </div>
          </div>

          <div className="space-y-2">
            {report.items.map((item) => (
              <button
                key={item.cargo_id}
                type="button"
                onClick={() => openDynamicPanel({ type: 'detail', module: 'packlog', id: item.cargo_id, meta: { subtype: 'cargo' } })}
                className="w-full rounded-lg border border-border/60 bg-card px-3 py-3 text-left hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-muted-foreground">{item.tracking_code}</p>
                    <p className="text-sm font-medium text-foreground truncate">{item.designation || item.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {cargoStatusLabels[item.status] ?? item.status}
                      {' • '}
                      {item.destination_name ?? 'Destination non résolue'}
                      {' • '}
                      {item.weight_kg.toLocaleString(numLocale())} kg
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">
                      Retour {Math.round((item.return_coverage_ratio ?? 0) * 100)}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.total_returned_units} / {item.total_sent_units} unités
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {packageReturnStatusLabels[item.aggregate_disposition] ?? item.aggregate_disposition}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </FormSection>
  )
}

function getAggregateReturnStatusLabel(status: string): string {
  switch (status) {
    case 'no_elements':
      return 'Aucun élément détaillé'
    case 'not_started':
      return 'Aucun retour saisi'
    case 'partial_return':
      return 'Retour partiel en cours'
    case 'fully_returned':
      return 'Retour complet déclaré'
    default:
      return status
  }
}

export function VoyageDetailPanel({ id }: { id: string }) {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data: voyage, isLoading } = useVoyage(id)
  const { data: vectors } = useVectors({ page: 1, page_size: 100 })
  const { data: rotations } = useRotations({ page: 1, page_size: 100 })
  const updateVoyage = useUpdateVoyage()
  const deleteVoyage = useDeleteVoyage()
  const updateStatus = useUpdateVoyageStatus()
  const downloadPaxManifestPdf = useVoyagePaxManifestPdf()
  const downloadCargoManifestPdf = useVoyageCargoManifestPdf()
  const { hasPermission } = usePermission()
  const canUpdate = hasPermission('travelwiz.voyage.update')
  const canDelete = hasPermission('travelwiz.voyage.delete')
  const closeTrip = useCloseTrip()
  const { data: stops } = useVoyageStops(id)
  const createStop = useCreateVoyageStop()
  const updateStop = useUpdateVoyageStop()
  const deleteStop = useDeleteVoyageStop()
  const { data: manifests } = useVoyageManifests(id)
  const { data: capacity } = useVoyageCapacity(id)
  const { data: events } = useVoyageEvents(id)
  const { data: kpis } = useTripKpis(id)
  const { data: cargoOperationsReport } = useVoyageCargoOperationsReport(id)
  const voyageStatusLabels = useDictionaryLabels('travelwiz_voyage_status', VOYAGE_STATUS_LABELS_FALLBACK)
  const manifestStatusLabels = useDictionaryLabels('travelwiz_manifest_status', MANIFEST_STATUS_LABELS_FALLBACK)
  const cargoStatusLabels = useDictionaryLabels('travelwiz_cargo_status', CARGO_STATUS_LABELS_FALLBACK)
  const cargoWorkflowLabels = useDictionaryLabels('travelwiz_cargo_workflow_status')
  const packageReturnStatusLabels = useDictionaryLabels('travelwiz_package_return_status')
  const voyageStatusOptions = useMemo(
    () => buildStatusOptions(voyageStatusLabels, ['planned', 'confirmed', 'boarding', 'departed', 'arrived', 'closed', 'cancelled', 'delayed']).filter((option) => option.value),
    [voyageStatusLabels],
  )
  const { toast } = useToast()
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [cargoReportExportOpen, setCargoReportExportOpen] = useState(false)
  const [editForm, setEditForm] = useState<VoyageUpdate>({})
  const [detailTab, setDetailTab] = useState<'informations' | 'manifestes' | 'cargo' | 'journal' | 'documents'>('informations')

  // SUP-0033 fix: inline form pour ajouter une étape (= destination ou
  // escale intermédiaire) directement depuis la fiche voyage. Avant, il
  // fallait passer par une autre UI (ou pas d'UI du tout) — la fiche
  // affichait juste 'D —' et personne ne savait quoi faire.
  const [addStopOpen, setAddStopOpen] = useState(false)
  const [stopAssetId, setStopAssetId] = useState<string | null>(null)
  const [stopArrivalAt, setStopArrivalAt] = useState<string>('')
  const [stopDepartureAt, setStopDepartureAt] = useState<string>('')
  // Champs PAX/cargo optionnels à la création — ils peuvent rester
  // vides, on remplit plus tard via l'inline editor par étape.
  const [stopPaxBoarded, setStopPaxBoarded] = useState<string>('')
  const [stopPaxDisembarked, setStopPaxDisembarked] = useState<string>('')
  const [stopCargoLoaded, setStopCargoLoaded] = useState<string>('')
  const [stopCargoUnloaded, setStopCargoUnloaded] = useState<string>('')
  const [stopNotes, setStopNotes] = useState<string>('')

  // Inline editor par étape : on tracke l'ID de l'étape en cours
  // d'édition + un brouillon local (pas mutation directe du cache
  // react-query). À la sauvegarde on appelle updateStop puis on ferme.
  const [editingStopId, setEditingStopId] = useState<string | null>(null)
  const [stopDraft, setStopDraft] = useState<{
    scheduled_arrival: string
    scheduled_departure: string
    pax_boarded: string
    pax_disembarked: string
    cargo_loaded: string
    cargo_unloaded: string
    notes: string
  }>({
    scheduled_arrival: '',
    scheduled_departure: '',
    pax_boarded: '',
    pax_disembarked: '',
    cargo_loaded: '',
    cargo_unloaded: '',
    notes: '',
  })

  const resetAddStopForm = useCallback(() => {
    setAddStopOpen(false)
    setStopAssetId(null)
    setStopArrivalAt('')
    setStopDepartureAt('')
    setStopPaxBoarded('')
    setStopPaxDisembarked('')
    setStopCargoLoaded('')
    setStopCargoUnloaded('')
    setStopNotes('')
  }, [])

  const handleAddStop = useCallback(async () => {
    if (!stopAssetId) {
      toast({ title: 'Sélectionnez un site/installation pour la destination', variant: 'warning' })
      return
    }
    try {
      const nextOrder = (stops?.length ?? 0) + 1
      // Helpers: vide → null (le backend traite null comme "non
      // renseigné"). On envoie un number positif ou null, jamais NaN.
      const toIntOrNull = (s: string): number | null => {
        if (!s.trim()) return null
        const n = parseInt(s, 10)
        return Number.isFinite(n) && n >= 0 ? n : null
      }
      const toFloatOrNull = (s: string): number | null => {
        if (!s.trim()) return null
        const n = parseFloat(s.replace(',', '.'))
        return Number.isFinite(n) && n >= 0 ? n : null
      }
      await createStop.mutateAsync({
        voyageId: id,
        payload: {
          asset_id: stopAssetId,
          stop_order: nextOrder,
          scheduled_arrival: stopArrivalAt ? new Date(stopArrivalAt).toISOString() : null,
          scheduled_departure: stopDepartureAt ? new Date(stopDepartureAt).toISOString() : null,
          pax_boarded_count: toIntOrNull(stopPaxBoarded),
          pax_disembarked_count: toIntOrNull(stopPaxDisembarked),
          cargo_loaded_kg: toFloatOrNull(stopCargoLoaded),
          cargo_unloaded_kg: toFloatOrNull(stopCargoUnloaded),
          notes: stopNotes.trim() || null,
        },
      })
      toast({ title: 'Étape ajoutée à la route', variant: 'success' })
      resetAddStopForm()
    } catch (err) {
      toast({
        title: 'Impossible d’ajouter l’étape',
        description: (err as Error).message,
        variant: 'error',
      })
    }
  }, [
    stopAssetId, stopArrivalAt, stopDepartureAt,
    stopPaxBoarded, stopPaxDisembarked, stopCargoLoaded, stopCargoUnloaded,
    stopNotes, stops, createStop, id, toast, resetAddStopForm,
  ])

  const openStopEditor = useCallback((stop: VoyageStop) => {
    // Pré-remplit le brouillon avec les valeurs courantes. Les
    // datetime-local n'acceptent que YYYY-MM-DDTHH:mm — on tronque l'ISO.
    const toLocal = (iso: string | null | undefined): string => {
      if (!iso) return ''
      // ISO arrive en UTC ou avec TZ — on garde la même heure d'affichage
      // que le reste de l'UI (Date locale du navigateur).
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return ''
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    setEditingStopId(stop.id)
    setStopDraft({
      scheduled_arrival: toLocal(stop.scheduled_arrival),
      scheduled_departure: toLocal(stop.scheduled_departure),
      pax_boarded: String(stop.pax_boarded_count ?? 0),
      pax_disembarked: String(stop.pax_disembarked_count ?? 0),
      cargo_loaded: String(stop.cargo_loaded_kg ?? 0),
      cargo_unloaded: String(stop.cargo_unloaded_kg ?? 0),
      notes: stop.notes ?? '',
    })
  }, [])

  const handleSaveStopEdit = useCallback(async (stopId: string) => {
    const toIntOr0 = (s: string): number => {
      const n = parseInt(s, 10)
      return Number.isFinite(n) && n >= 0 ? n : 0
    }
    const toFloatOr0 = (s: string): number => {
      const n = parseFloat((s || '').replace(',', '.'))
      return Number.isFinite(n) && n >= 0 ? n : 0
    }
    try {
      await updateStop.mutateAsync({
        voyageId: id,
        stopId,
        payload: {
          scheduled_arrival: stopDraft.scheduled_arrival
            ? new Date(stopDraft.scheduled_arrival).toISOString()
            : null,
          scheduled_departure: stopDraft.scheduled_departure
            ? new Date(stopDraft.scheduled_departure).toISOString()
            : null,
          pax_boarded_count: toIntOr0(stopDraft.pax_boarded),
          pax_disembarked_count: toIntOr0(stopDraft.pax_disembarked),
          cargo_loaded_kg: toFloatOr0(stopDraft.cargo_loaded),
          cargo_unloaded_kg: toFloatOr0(stopDraft.cargo_unloaded),
          notes: stopDraft.notes.trim() || null,
        },
      })
      toast({ title: 'Étape mise à jour', variant: 'success' })
      setEditingStopId(null)
    } catch (err) {
      toast({
        title: 'Mise à jour impossible',
        description: (err as Error).message,
        variant: 'error',
      })
    }
  }, [id, stopDraft, updateStop, toast])

  const handleDeleteStop = useCallback(async (stopId: string) => {
    try {
      await deleteStop.mutateAsync({ voyageId: id, stopId })
      toast({ title: 'Étape supprimée', variant: 'success' })
    } catch (err) {
      toast({ title: 'Suppression impossible', description: (err as Error).message, variant: 'error' })
    }
  }, [deleteStop, id, toast])

  const startEdit = useCallback(() => {
    if (!voyage) return
    setEditForm({
      vector_id: voyage.vector_id,
      departure_base_id: voyage.departure_base_id,
      rotation_id: voyage.rotation_id,
      scheduled_departure: voyage.scheduled_departure,
      scheduled_arrival: voyage.scheduled_arrival,
    })
    setEditing(true)
  }, [voyage])

  const handleSave = async () => {
    try { await updateVoyage.mutateAsync({ id, payload: editForm }); toast({ title: t('travelwiz.toast.voyage_updated'), variant: 'success' }); setEditing(false) }
    catch { toast({ title: t('travelwiz.toast.voyage_update_error'), variant: 'error' }) }
  }

  const handleDelete = async () => {
    try { await deleteVoyage.mutateAsync(id); toast({ title: t('travelwiz.toast.voyage_deleted'), variant: 'success' }); closeDynamicPanel() }
    catch { toast({ title: t('travelwiz.toast.voyage_deletion_error'), variant: 'error' }) }
  }

  const handleClose = async () => {
    try { await closeTrip.mutateAsync(id); toast({ title: t('travelwiz.toast.voyage_closed'), variant: 'success' }) }
    catch { toast({ title: t('travelwiz.toast.voyage_close_error'), variant: 'error' }) }
  }

  const handlePrintPaxManifest = async () => {
    try {
      await downloadPaxManifestPdf.mutateAsync(id)
    } catch {
      toast({ title: t('travelwiz.toast.pax_manifest_print_error'), description: t('travelwiz.toast.check_pax_manifest_pdf'), variant: 'error' })
    }
  }

  const handlePrintCargoManifest = async () => {
    try {
      await downloadCargoManifestPdf.mutateAsync(id)
    } catch {
      toast({ title: t('travelwiz.toast.cargo_manifest_print_error'), description: t('travelwiz.toast.check_cargo_manifest_pdf'), variant: 'error' })
    }
  }

  // ⚠️ React hooks MUST be called in the same order every render, so all
  // useMemo/useCallback calls below MUST run BEFORE any early return. The
  // previous version returned <Loader/> when the voyage was still loading
  // and THEN declared useMemo — which caused React error #310 ("Rendered
  // more hooks than previous render") as soon as the query resolved.

  // PAX summary from manifests
  const paxSummary = useMemo(() => {
    if (!manifests) return { confirmed: 0, standby: 0, noShow: 0 }
    return { confirmed: voyage?.pax_count ?? 0, standby: 0, noShow: 0 }
  }, [manifests, voyage])

  // Occupation cumulée du vecteur au pic — on parcourt les étapes
  // dans l'ordre, on additionne pax_boarded à la base puis on retire
  // pax_disembarked à chaque escale ; on garde le max atteint à
  // n'importe quel moment du voyage. Idem côté cargo (kg).
  // Le départ initial (base) embarque la somme des PAX qui descendront
  // à des escales intermédiaires + ceux à destination finale, donc on
  // utilise plutôt la lecture explicite des embarks par étape (la
  // base de départ n'embarque pas — c'est l'étape 1 qui peut commencer
  // à embarquer si on le souhaite, ou bien c'est représenté
  // implicitement). Vu que les PAX board logiquement à la base, on
  // additionne pax_boarded sans soustraire avant le premier stop.
  const occupancyAnalysis = useMemo(() => {
    if (!stops || stops.length === 0) {
      return { peakPax: 0, peakCargoKg: 0, totalBoarded: 0, totalDisembarked: 0 }
    }
    const ordered = [...stops].sort((a, b) => a.stop_order - b.stop_order)
    let runningPax = 0
    let runningCargo = 0
    let peakPax = 0
    let peakCargo = 0
    let totalBoarded = 0
    let totalDisembarked = 0
    for (const s of ordered) {
      // Convention : à chaque escale on embarque d'abord (peak avant
      // débarquement), puis on débarque. C'est la lecture la plus
      // conservative côté capacité — si le vecteur passe par 50 PAX
      // entre deux escales, on l'indique.
      const boarded = s.pax_boarded_count ?? 0
      const disembarked = s.pax_disembarked_count ?? 0
      const loaded = s.cargo_loaded_kg ?? 0
      const unloaded = s.cargo_unloaded_kg ?? 0
      runningPax += boarded
      runningCargo += loaded
      totalBoarded += boarded
      if (runningPax > peakPax) peakPax = runningPax
      if (runningCargo > peakCargo) peakCargo = runningCargo
      runningPax = Math.max(0, runningPax - disembarked)
      runningCargo = Math.max(0, runningCargo - unloaded)
      totalDisembarked += disembarked
    }
    return { peakPax, peakCargoKg: peakCargo, totalBoarded, totalDisembarked }
  }, [stops])

  const cargoReportExportRows = useMemo(() => (
    cargoOperationsReport?.items.map((item) => ({
      tracking_code: item.tracking_code,
      request_code: item.request_code ?? '',
      designation: item.designation ?? item.description,
      cargo_status: cargoStatusLabels[item.status] ?? item.status,
      workflow_status: cargoWorkflowLabels[item.workflow_status] ?? item.workflow_status,
      destination_name: item.destination_name ?? '',
      weight_kg: item.weight_kg,
      total_sent_units: item.total_sent_units,
      total_returned_units: item.total_returned_units,
      return_coverage_pct: Math.round((item.return_coverage_ratio ?? 0) * 100),
      aggregate_return_status: getAggregateReturnStatusLabel(item.aggregate_return_status),
      aggregate_disposition: packageReturnStatusLabels[item.aggregate_disposition] ?? item.aggregate_disposition,
      damage_notes: item.damage_notes ?? '',
      received_at: item.received_at ?? '',
    })) ?? []
  ), [cargoOperationsReport?.items, cargoStatusLabels, cargoWorkflowLabels, packageReturnStatusLabels])

  // OpsFlux pattern: no "Modifier" button — inline edit on
  // permissioned fields only. Kept the domain actions that can't
  // be expressed inline (print manifests, cloture, delete).
  const voyageDetailActions = useMemo<ActionItem[]>(() => {
    const items: ActionItem[] = []
    items.push({ id: 'pax-manifest', label: 'Manifeste PAX', icon: FileText, variant: 'default', priority: 60, loading: downloadPaxManifestPdf.isPending, disabled: downloadPaxManifestPdf.isPending, onClick: handlePrintPaxManifest })
    items.push({ id: 'cargo-manifest', label: 'Manifeste cargo', icon: FileText, variant: 'default', priority: 60, loading: downloadCargoManifestPdf.isPending, disabled: downloadCargoManifestPdf.isPending, onClick: handlePrintCargoManifest })
    if (canUpdate && (voyage?.status === 'arrived')) {
      items.push({ id: 'close', label: 'Cloturer', icon: CheckCircle2, variant: 'default', priority: 70, loading: closeTrip.isPending, disabled: closeTrip.isPending, onClick: handleClose })
    }
    if (canDelete) {
      items.push({ id: 'delete', label: 'Supprimer', icon: Trash2, variant: 'danger', priority: 20, confirm: { title: 'Supprimer le voyage', message: 'Supprimer ce voyage ?', confirmLabel: 'Supprimer', variant: 'danger' }, onClick: handleDelete })
    }
    return items
  }, [editing, canUpdate, canDelete, startEdit, updateVoyage.isPending, handleSave, downloadPaxManifestPdf.isPending, handlePrintPaxManifest, downloadCargoManifestPdf.isPending, handlePrintCargoManifest, voyage?.status, closeTrip.isPending, handleClose, handleDelete])

  if (isLoading || !voyage) {
    return (
      <DynamicPanelShell title={t('common.loading_ellipsis')} icon={<Plane size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  const departureLabel = voyage.departure_base_name ?? voyage.origin ?? '?'
  const destinationLabel = stops?.length ? stops[stops.length - 1]?.location ?? '—' : voyage.destination ?? '—'

  // Cargo summary
  const cargoWeight = capacity?.current_cargo_kg ?? 0
  const hasHazmat = false // from cargo items if available

  const voyageStatusSelect = !editing && canUpdate && voyage.status !== 'cancelled' && voyage.status !== 'closed' ? (
    <select
      className="text-xs border border-border rounded px-1.5 py-0.5 bg-background text-foreground h-7"
      value=""
      onChange={(e) => { if (e.target.value) updateStatus.mutate({ id, status: e.target.value }) }}
    >
      <option value="">Statut...</option>
      {voyageStatusOptions.filter((option) => option.value !== voyage.status).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  ) : null

  return (
    <DynamicPanelShell
      title={voyage.code}
      subtitle={`${departureLabel} \u2192 ${destinationLabel}`}
      icon={<Plane size={14} className="text-primary" />}
      actionItems={voyageDetailActions}
      headerRight={voyageStatusSelect}
    >
      <TabBar
        items={[
          { id: 'informations', label: 'Informations', icon: Info },
          { id: 'manifestes', label: 'Manifestes PAX', icon: Users },
          { id: 'cargo', label: 'Cargo', icon: Package },
          { id: 'journal', label: 'Journal', icon: BookOpen },
          { id: 'documents', label: 'Documents', icon: Paperclip },
        ]}
        activeId={detailTab}
        onTabChange={setDetailTab}
      />
      <PanelContentLayout>
        {detailTab === 'informations' && (
          <>
          {/* Status badge — visible only on Informations tab */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={voyage.status} labels={voyageStatusLabels} badges={VOYAGE_STATUS_BADGES} />
          </div>
          </>
        )}

        {detailTab === 'informations' && (
          editing ? (
            <FormSection title={t('common.information')}>
              <FormGrid>
                <DynamicPanelField label={t('common.code_field')}>
                  <span className="text-sm font-mono font-medium text-foreground">{voyage.code}</span>
                </DynamicPanelField>
                <DynamicPanelField label={t('common.vector')} required>
                  <select
                    value={editForm.vector_id ?? ''}
                    onChange={(e) => setEditForm({ ...editForm, vector_id: e.target.value || null })}
                    className={panelInputClass}
                  >
                    <option value="">{t('common.select')}</option>
                    {(vectors?.items ?? []).map((vector) => (
                      <option key={vector.id} value={vector.id}>
                        {vector.name} {vector.registration ? `(${vector.registration})` : ''}
                      </option>
                    ))}
                  </select>
                </DynamicPanelField>
                <DynamicPanelField label={t('common.rotation')}>
                  <select
                    value={editForm.rotation_id ?? ''}
                    onChange={(e) => setEditForm({ ...editForm, rotation_id: e.target.value || null })}
                    className={panelInputClass}
                  >
                    <option value="">Aucune rotation</option>
                    {(rotations?.items ?? []).map((rotation) => (
                      <option key={rotation.id} value={rotation.id}>
                        {rotation.name}{rotation.schedule_description ? ` - ${rotation.schedule_description}` : ''}
                      </option>
                    ))}
                  </select>
                </DynamicPanelField>
                <DynamicPanelField label={t('common.departure_base')} span="full">
                  <AssetPicker
                    value={editForm.departure_base_id ?? null}
                    onChange={(assetId) => setEditForm({ ...editForm, departure_base_id: assetId ?? null })}
                    placeholder="Selectionner la base de depart..."
                  />
                </DynamicPanelField>
                <DynamicPanelField label="Depart programme">
                  <input
                    type="datetime-local"
                    value={editForm.scheduled_departure ?? ''}
                    onChange={(e) => setEditForm({ ...editForm, scheduled_departure: e.target.value || null })}
                    className={panelInputClass}
                  />
                </DynamicPanelField>
                <DynamicPanelField label="Arrivee programmee">
                  <input
                    type="datetime-local"
                    value={editForm.scheduled_arrival ?? ''}
                    onChange={(e) => setEditForm({ ...editForm, scheduled_arrival: e.target.value || null })}
                    className={panelInputClass}
                  />
                </DynamicPanelField>
              </FormGrid>
            </FormSection>
          ) : (
            <>
              <FormSection title={t('common.information')}>
                <DetailFieldGrid>
                  <ReadOnlyRow label={t('common.code_field')} value={voyage.code} />
                  <ReadOnlyRow label={t('common.vector')} value={voyage.vector_name ?? '\u2014'} />
                  <ReadOnlyRow label={t('travelwiz.voyage.rotation', 'Rotation')} value={voyage.rotation_name ?? '\u2014'} />
                  <ReadOnlyRow label={t('travelwiz.voyage.departure_base', 'Base de d\u00e9part')} value={departureLabel} />
                  <ReadOnlyRow label={t('travelwiz.voyage.last_stop', 'Derni\u00e8re escale planifi\u00e9e')} value={destinationLabel} />
                  <ReadOnlyRow label={t('travelwiz.voyage.scheduled_departure', 'D\u00e9part programm\u00e9')} value={voyage.scheduled_departure ? new Date(voyage.scheduled_departure).toLocaleString(numLocale()) : '\u2014'} />
                  <ReadOnlyRow label={t('travelwiz.voyage.scheduled_arrival', 'Arriv\u00e9e programm\u00e9e')} value={voyage.scheduled_arrival ? new Date(voyage.scheduled_arrival).toLocaleString(numLocale()) : '\u2014'} />
                  <ReadOnlyRow label={t('travelwiz.voyage.actual_departure', 'D\u00e9part r\u00e9el')} value={voyage.actual_departure ? new Date(voyage.actual_departure).toLocaleString(numLocale()) : '\u2014'} />
                  <ReadOnlyRow label={t('travelwiz.voyage.actual_arrival', 'Arriv\u00e9e r\u00e9elle')} value={voyage.actual_arrival ? new Date(voyage.actual_arrival).toLocaleString(numLocale()) : '\u2014'} />
                  <ReadOnlyRow label={t('travelwiz.voyage.delay_reason', 'Motif du retard')} value={voyage.delay_reason ?? '\u2014'} />
                </DetailFieldGrid>
              </FormSection>

              <FormSection title={`Route (${(stops?.length ?? 0) + 1} point${(stops?.length ?? 0) + 1 > 1 ? 's' : ''})`} collapsible defaultExpanded>
                {/* Indicateur d'occupation calculée à partir des flux
                    pax_boarded/pax_disembarked par étape. Affiché
                    uniquement quand au moins une étape a des chiffres
                    saisis (sinon c'est juste "0 PAX" pas très utile). */}
                {(occupancyAnalysis.totalBoarded > 0 || occupancyAnalysis.peakCargoKg > 0) && (
                  <div className="mb-2 flex items-center gap-2 rounded-md border border-primary/20 bg-primary/[0.04] px-2.5 py-1.5">
                    <TrendingUp size={12} className="text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Occupation max au pic</p>
                      <p className="text-xs font-semibold text-foreground tabular-nums">
                        {occupancyAnalysis.peakPax} PAX
                        {occupancyAnalysis.peakCargoKg > 0 && (
                          <span className="text-muted-foreground font-normal"> · {occupancyAnalysis.peakCargoKg.toLocaleString(numLocale())} kg de cargo</span>
                        )}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                      Total : {occupancyAnalysis.totalBoarded} ↑ / {occupancyAnalysis.totalDisembarked} ↓
                    </span>
                  </div>
                )}
                <div className="space-y-1.5">
                  {/* Origin (toujours présent — vient de departure_base) */}
                  <div className="flex items-center gap-2 p-1.5 rounded bg-primary/5 border border-primary/10">
                    <div className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">O</div>
                    <span className="text-xs font-medium text-foreground">{departureLabel}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{formatDateTime(voyage.scheduled_departure)}</span>
                  </div>
                  {/* Étapes/destinations (VoyageStops) — éditables individuellement */}
                  {stops?.map((stop, idx) => {
                    const isLast = idx === (stops.length - 1)
                    const isEditing = editingStopId === stop.id
                    const hasFlow =
                      (stop.pax_boarded_count ?? 0) > 0 ||
                      (stop.pax_disembarked_count ?? 0) > 0 ||
                      (stop.cargo_loaded_kg ?? 0) > 0 ||
                      (stop.cargo_unloaded_kg ?? 0) > 0
                    return (
                      <div key={stop.id} className="space-y-1">
                        <div className={cn(
                          'flex items-center gap-2 p-1.5 rounded border group transition-colors',
                          isLast ? 'bg-green-500/5 border-green-500/20' : 'bg-muted/40 border-border/60',
                          isEditing && 'ring-1 ring-primary/40 bg-primary/[0.03]',
                        )}>
                          <div className={cn(
                            'w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0',
                            isLast ? 'bg-green-500/20 text-green-600' : 'bg-muted text-muted-foreground',
                          )}>{isLast ? 'D' : (idx + 1)}</div>
                          <button
                            type="button"
                            onClick={() => {
                              if (!canUpdate || voyage.status === 'closed' || voyage.status === 'cancelled') return
                              if (isEditing) setEditingStopId(null)
                              else openStopEditor(stop)
                            }}
                            disabled={!canUpdate || voyage.status === 'closed' || voyage.status === 'cancelled'}
                            className="text-xs font-medium text-foreground flex-1 min-w-0 truncate text-left hover:underline disabled:hover:no-underline disabled:cursor-default"
                            title={canUpdate ? 'Modifier les flux PAX/cargo' : undefined}
                          >
                            {stop.asset_name ?? stop.location ?? '—'}
                          </button>
                          {/* Badges PAX/cargo — affichés seulement si > 0 pour
                              ne pas saturer la ligne. */}
                          {(stop.pax_boarded_count ?? 0) > 0 && (
                            <span
                              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 text-[10px] font-semibold tabular-nums"
                              title={`${stop.pax_boarded_count} PAX embarquent à cette étape`}
                            >
                              <ArrowUp size={9} />{stop.pax_boarded_count}
                            </span>
                          )}
                          {(stop.pax_disembarked_count ?? 0) > 0 && (
                            <span
                              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] font-semibold tabular-nums"
                              title={`${stop.pax_disembarked_count} PAX descendent à cette étape`}
                            >
                              <ArrowDown size={9} />{stop.pax_disembarked_count}
                            </span>
                          )}
                          {(stop.cargo_loaded_kg ?? 0) > 0 && (
                            <span
                              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 text-[10px] font-semibold tabular-nums"
                              title={`${stop.cargo_loaded_kg} kg chargés ici`}
                            >
                              <Weight size={9} /><ArrowUp size={8} />{Math.round(stop.cargo_loaded_kg)}
                            </span>
                          )}
                          {(stop.cargo_unloaded_kg ?? 0) > 0 && (
                            <span
                              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] font-semibold tabular-nums"
                              title={`${stop.cargo_unloaded_kg} kg déchargés ici`}
                            >
                              <Weight size={9} /><ArrowDown size={8} />{Math.round(stop.cargo_unloaded_kg)}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{stop.scheduled_arrival ? formatDateTime(stop.scheduled_arrival) : '—'}</span>
                          {canUpdate && voyage.status !== 'closed' && voyage.status !== 'cancelled' && (
                            <>
                              <button
                                onClick={() => {
                                  if (isEditing) setEditingStopId(null)
                                  else openStopEditor(stop)
                                }}
                                className={cn(
                                  'p-0.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-opacity shrink-0',
                                  isEditing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                                )}
                                title={isEditing ? 'Fermer l’édition' : 'Modifier flux PAX/cargo'}
                              >
                                {isEditing ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                              </button>
                              <button
                                onClick={() => handleDeleteStop(stop.id)}
                                className="p-0.5 rounded hover:bg-destructive/10 text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                title="Retirer cette étape de la route"
                              >
                                <X size={11} />
                              </button>
                            </>
                          )}
                        </div>
                        {/* Notes inline (lecture seule sur la carte —
                            édition dans l'éditeur ci-dessous). */}
                        {!isEditing && stop.notes && (
                          <p className="ml-7 text-[11px] text-muted-foreground italic line-clamp-2">{stop.notes}</p>
                        )}
                        {/* Inline editor — flux PAX/cargo + horaires +
                            notes pour cette étape. */}
                        {isEditing && (
                          <div className="ml-7 rounded-md border border-primary/30 bg-primary/[0.02] p-2.5 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Arrivée prévue</label>
                                <input
                                  type="datetime-local"
                                  value={stopDraft.scheduled_arrival}
                                  onChange={(e) => setStopDraft({ ...stopDraft, scheduled_arrival: e.target.value })}
                                  className={panelInputClass}
                                />
                              </div>
                              <div>
                                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Départ prévu</label>
                                <input
                                  type="datetime-local"
                                  value={stopDraft.scheduled_departure}
                                  onChange={(e) => setStopDraft({ ...stopDraft, scheduled_departure: e.target.value })}
                                  className={panelInputClass}
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-600 font-medium">
                                  <ArrowUp size={9} /> PAX embarquent
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  value={stopDraft.pax_boarded}
                                  onChange={(e) => setStopDraft({ ...stopDraft, pax_boarded: e.target.value })}
                                  className={panelInputClass}
                                />
                              </div>
                              <div>
                                <label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 font-medium">
                                  <ArrowDown size={9} /> PAX descendent
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  value={stopDraft.pax_disembarked}
                                  onChange={(e) => setStopDraft({ ...stopDraft, pax_disembarked: e.target.value })}
                                  className={panelInputClass}
                                />
                              </div>
                              <div>
                                <label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-600 font-medium">
                                  <Weight size={9} /><ArrowUp size={9} /> Cargo chargé (kg)
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  step="0.1"
                                  value={stopDraft.cargo_loaded}
                                  onChange={(e) => setStopDraft({ ...stopDraft, cargo_loaded: e.target.value })}
                                  className={panelInputClass}
                                />
                              </div>
                              <div>
                                <label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 font-medium">
                                  <Weight size={9} /><ArrowDown size={9} /> Cargo déchargé (kg)
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  step="0.1"
                                  value={stopDraft.cargo_unloaded}
                                  onChange={(e) => setStopDraft({ ...stopDraft, cargo_unloaded: e.target.value })}
                                  className={panelInputClass}
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Notes (optionnel)</label>
                              <textarea
                                value={stopDraft.notes}
                                onChange={(e) => setStopDraft({ ...stopDraft, notes: e.target.value })}
                                rows={2}
                                className={panelInputClass}
                                placeholder="Contact local, raison de l’escale, instructions…"
                              />
                            </div>
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingStopId(null)}
                                className="btn-sm btn-secondary"
                              >
                                Annuler
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveStopEdit(stop.id)}
                                disabled={updateStop.isPending}
                                className="btn-sm btn-primary"
                              >
                                {updateStop.isPending ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                                Enregistrer
                              </button>
                            </div>
                          </div>
                        )}
                        {/* Hint visuel quand aucun flux n'est saisi
                            mais qu'on a édit le stop — incite à
                            remplir. (Optionnel mais utile pour
                            l'onboarding de cette feature.) */}
                        {!isEditing && !hasFlow && canUpdate && voyage.status !== 'closed' && voyage.status !== 'cancelled' && (
                          <p className="ml-7 text-[10px] text-muted-foreground/70">
                            Pas de flux PAX/cargo saisi — cliquez sur le nom de l’étape pour ajouter.
                          </p>
                        )}
                      </div>
                    )
                  })}
                  {/* Si pas de destination encore définie, afficher un placeholder
                      explicite (au lieu de juste "—"). */}
                  {(stops?.length ?? 0) === 0 && (
                    <div className="flex items-center gap-2 p-1.5 rounded border border-dashed border-border bg-background/50 text-muted-foreground italic">
                      <div className="w-5 h-5 rounded-full bg-muted/30 text-muted-foreground/60 text-[10px] font-bold flex items-center justify-center shrink-0">?</div>
                      <span className="text-xs flex-1">Pas de destination définie</span>
                    </div>
                  )}
                  {/* SUP-0033 fix: bouton Ajouter une étape directement sur la
                      fiche. Bastien attendait pouvoir mettre la destination
                      dès la création — au moins maintenant on peut l'ajouter
                      après en 2 clics depuis la fiche détail. */}
                  {canUpdate && voyage.status !== 'closed' && voyage.status !== 'cancelled' && (
                    !addStopOpen ? (
                      <button
                        type="button"
                        onClick={() => setAddStopOpen(true)}
                        className="btn-sm btn-secondary w-full justify-center mt-1.5"
                      >
                        <Plus size={12} /> Ajouter une étape ({(stops?.length ?? 0) === 0 ? 'destination' : 'escale'})
                      </button>
                    ) : (
                      <div className="rounded-md border border-primary/40 bg-primary/[0.03] p-2.5 space-y-2 mt-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                          <Plus size={12} /> Nouvelle étape #{(stops?.length ?? 0) + 1}
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Site / installation</label>
                          <AssetPicker
                            value={stopAssetId}
                            onChange={(v) => setStopAssetId(v)}
                            placeholder="Sélectionner la destination..."
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Arrivée prévue (optionnel)</label>
                            <input
                              type="datetime-local"
                              value={stopArrivalAt}
                              onChange={(e) => setStopArrivalAt(e.target.value)}
                              className={panelInputClass}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Départ prévu (optionnel)</label>
                            <input
                              type="datetime-local"
                              value={stopDepartureAt}
                              onChange={(e) => setStopDepartureAt(e.target.value)}
                              className={panelInputClass}
                            />
                          </div>
                        </div>
                        {/* Champs PAX/cargo optionnels — la plupart du
                            temps on les remplit après via l'inline
                            editor par étape, mais quand on connaît
                            déjà les chiffres à la création autant les
                            saisir tout de suite. */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-600 font-medium">
                              <ArrowUp size={9} /> PAX embarquent (optionnel)
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={stopPaxBoarded}
                              onChange={(e) => setStopPaxBoarded(e.target.value)}
                              className={panelInputClass}
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 font-medium">
                              <ArrowDown size={9} /> PAX descendent (optionnel)
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={stopPaxDisembarked}
                              onChange={(e) => setStopPaxDisembarked(e.target.value)}
                              className={panelInputClass}
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-600 font-medium">
                              <Weight size={9} /><ArrowUp size={9} /> Cargo chargé kg (optionnel)
                            </label>
                            <input
                              type="number"
                              min={0}
                              step="0.1"
                              value={stopCargoLoaded}
                              onChange={(e) => setStopCargoLoaded(e.target.value)}
                              className={panelInputClass}
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 font-medium">
                              <Weight size={9} /><ArrowDown size={9} /> Cargo déchargé kg (optionnel)
                            </label>
                            <input
                              type="number"
                              min={0}
                              step="0.1"
                              value={stopCargoUnloaded}
                              onChange={(e) => setStopCargoUnloaded(e.target.value)}
                              className={panelInputClass}
                              placeholder="0"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Notes (optionnel)</label>
                          <textarea
                            value={stopNotes}
                            onChange={(e) => setStopNotes(e.target.value)}
                            rows={2}
                            className={panelInputClass}
                            placeholder="Contact local, raison de l’escale, instructions…"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={resetAddStopForm}
                            className="btn-sm btn-secondary"
                          >
                            Annuler
                          </button>
                          <button
                            type="button"
                            onClick={handleAddStop}
                            disabled={!stopAssetId || createStop.isPending}
                            className="btn-sm btn-primary"
                          >
                            {createStop.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                            Ajouter
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </FormSection>
            </>
          )
        )}

        {detailTab === 'manifestes' && (
          <FormSection title={`Manifestes PAX (${manifests?.length ?? 0})`} collapsible defaultExpanded>
            <div className="grid grid-cols-3 gap-2 mb-2 sm:grid-cols-3">
              {/* 3 cols of small stat cards — keep 3-col on very small
                  widths; each card is ~80px which fits even 320px. */}
              <div className="text-center p-2 rounded bg-muted/50">
                <p className="text-sm font-semibold tabular-nums">{paxSummary.confirmed}</p>
                <p className="text-[10px] text-muted-foreground">Confirmes</p>
              </div>
              <div className="text-center p-2 rounded bg-muted/50">
                <p className="text-sm font-semibold tabular-nums">{paxSummary.standby}</p>
                <p className="text-[10px] text-muted-foreground">Standby</p>
              </div>
              <div className="text-center p-2 rounded bg-muted/50">
                <p className="text-sm font-semibold tabular-nums">{paxSummary.noShow}</p>
                <p className="text-[10px] text-muted-foreground">No-show</p>
              </div>
            </div>
            {manifests && manifests.length > 0 ? (
              <div className="space-y-1.5">
                {manifests.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg border border-border/60 bg-card">
                    <FileText size={14} className="text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{m.reference || m.manifest_type || 'Manifeste'}</p>
                      <p className="text-xs text-muted-foreground">{m.passenger_count ?? 0} passagers</p>
                    </div>
                    <StatusBadge status={m.status} labels={manifestStatusLabels} badges={MANIFEST_STATUS_BADGES} />
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground py-2">Aucun manifeste.</p>}
          </FormSection>
        )}

        {detailTab === 'cargo' && (
          <>
            <FormSection title="Cargo" collapsible defaultExpanded>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center p-2 rounded bg-muted/50">
                  <p className="text-sm font-semibold tabular-nums">{cargoWeight.toLocaleString(numLocale())} kg</p>
                  <p className="text-[10px] text-muted-foreground">Poids total</p>
                </div>
                <div className="text-center p-2 rounded bg-muted/50">
                  <p className="text-sm font-semibold tabular-nums">{hasHazmat ? 'Oui' : 'Non'}</p>
                  <p className="text-[10px] text-muted-foreground">HAZMAT</p>
                </div>
              </div>
            </FormSection>

            <VoyageCargoOperationsSection
              report={cargoOperationsReport}
              cargoStatusLabels={cargoStatusLabels}
              packageReturnStatusLabels={packageReturnStatusLabels}
              onOpenExport={() => setCargoReportExportOpen(true)}
            />

            {capacity && (
              <FormSection title="Capacite" collapsible defaultExpanded>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-1"><Users size={12} /><span className="text-[10px] font-medium uppercase tracking-wide">PAX</span></div>
                    <p className="text-sm font-semibold tabular-nums">{capacity.current_pax} / {capacity.vector_capacity_pax ?? '\u221e'}</p>
                    {capacity.pax_utilization_pct !== null && (
                      <div className="mt-1.5 h-1.5 rounded-full bg-border overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all', capacity.pax_utilization_pct > 90 ? 'bg-destructive' : 'bg-primary')} style={{ width: `${Math.min(100, capacity.pax_utilization_pct)}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-1"><Weight size={12} /><span className="text-[10px] font-medium uppercase tracking-wide">Cargo (kg)</span></div>
                    <p className="text-sm font-semibold tabular-nums">{(capacity.current_cargo_kg ?? 0).toLocaleString(numLocale())} / {capacity.vector_capacity_cargo_kg?.toLocaleString(numLocale()) ?? '\u221e'}</p>
                    {capacity.cargo_utilization_pct !== null && (
                      <div className="mt-1.5 h-1.5 rounded-full bg-border overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all', capacity.cargo_utilization_pct > 90 ? 'bg-destructive' : 'bg-primary')} style={{ width: `${Math.min(100, capacity.cargo_utilization_pct)}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              </FormSection>
            )}
          </>
        )}

        {detailTab === 'journal' && (
          <>
            <FormSection title={`Journal de bord (${events?.length ?? 0})`} collapsible defaultExpanded>
              {events && events.length > 0 ? (
                <div className="relative pl-4 border-l-2 border-border space-y-3">
                  {events.map((evt) => (
                    <div key={evt.id} className="relative">
                      <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                      <div className="ml-2">
                        <p className="text-xs font-medium text-foreground">{evt.event_code.replace(/_/g, ' ')}</p>
                        <p className="text-[10px] text-muted-foreground">{formatDateTime(evt.recorded_at)}{evt.recorded_by_name ? ` \u2022 ${evt.recorded_by_name}` : ''}</p>
                        {evt.notes && <p className="text-xs text-muted-foreground mt-0.5">{evt.notes}</p>}
                        {(evt.latitude || evt.longitude) && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 inline-flex items-center gap-1"><MapPin size={9} />{evt.latitude?.toFixed(4)}, {evt.longitude?.toFixed(4)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-muted-foreground py-2">{t('travelwiz.voyage.no_events', 'Aucun événement enregistré.')}</p>}
            </FormSection>

            {kpis && (
              <FormSection title={t('travelwiz.voyage.kpi_section', 'KPIs du voyage')} collapsible defaultExpanded>
                <DetailFieldGrid>
                  <ReadOnlyRow label={t('travelwiz.voyage.total_pax', 'PAX total')} value={kpis.total_pax} />
                  <ReadOnlyRow label={t('travelwiz.voyage.total_cargo', 'Cargo total')} value={`${(kpis.total_cargo_kg ?? 0).toLocaleString(numLocale())} kg`} />
                  <ReadOnlyRow label={t('travelwiz.voyage.no_shows', 'No-shows')} value={kpis.no_shows} />
                  <ReadOnlyRow label={t('travelwiz.voyage.on_time', "À l'heure")} value={kpis.on_time ? t('common.yes', 'Oui') : t('travelwiz.voyage.late_min', 'Non ({{min}} min)', { min: kpis.delay_minutes ?? 0 })} />
                  <ReadOnlyRow label={t('travelwiz.voyage.events_count', 'Événements')} value={kpis.events_count} />
                  <ReadOnlyRow label={t('travelwiz.voyage.hazmat_items', 'Articles HAZMAT')} value={kpis.hazmat_items} />
                </DetailFieldGrid>
              </FormSection>
            )}
          </>
        )}

        {detailTab === 'documents' && (
          <>
            <FormSection title="Plan de pont" collapsible defaultExpanded={false}>
              <p className="text-xs text-muted-foreground py-2">Le plan de pont interactif sera disponible prochainement.</p>
            </FormSection>

            <FormSection title={t('common.tags_notes_files')} collapsible defaultExpanded>
              <div className="space-y-3">
                <TagManager ownerType="voyage" ownerId={voyage.id} compact />
                <AttachmentManager ownerType="voyage" ownerId={voyage.id} compact />
                <NoteManager ownerType="voyage" ownerId={voyage.id} compact />
              </div>
            </FormSection>
          </>
        )}
      </PanelContentLayout>
      <ExportWizard
        open={cargoReportExportOpen}
        onClose={() => setCargoReportExportOpen(false)}
        data={cargoReportExportRows}
        columns={[
          { id: 'tracking_code', header: t('travelwiz.columns.export_tracking') },
          { id: 'request_code', header: t('travelwiz.columns.export_request') },
          { id: 'designation', header: t('travelwiz.columns.export_parcel') },
          { id: 'cargo_status', header: t('travelwiz.columns.export_cargo_status') },
          { id: 'workflow_status', header: t('travelwiz.columns.export_workflow_status') },
          { id: 'destination_name', header: t('travelwiz.columns.export_destination') },
          { id: 'weight_kg', header: t('travelwiz.columns.export_weight_kg') },
          { id: 'total_sent_units', header: t('travelwiz.columns.export_qty_sent') },
          { id: 'total_returned_units', header: t('travelwiz.columns.export_qty_returned') },
          { id: 'return_coverage_pct', header: t('travelwiz.columns.export_return_coverage') },
          { id: 'aggregate_return_status', header: t('travelwiz.columns.export_return_status') },
          { id: 'aggregate_disposition', header: t('travelwiz.columns.export_base_disposition') },
          { id: 'damage_notes', header: t('travelwiz.columns.export_damages') },
          { id: 'received_at', header: t('travelwiz.columns.export_reception') },
        ]}
        filenamePrefix={`travelwiz-cargo-report-${voyage.code.toLowerCase()}`}
      />
    </DynamicPanelShell>
  )
}
