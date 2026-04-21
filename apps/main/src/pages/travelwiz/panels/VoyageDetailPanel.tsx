import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plane, Package, FileText, Users, MapPin, Weight,
  Loader2, Pencil, Trash2, Save, CheckCircle2,
  Info, BookOpen, Paperclip,
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
  useVoyageManifests,
  useVoyageCapacity,
  useVoyageEvents,
  useTripKpis,
  useVoyageCargoOperationsReport,
  useVectors,
  useRotations,
} from '@/hooks/useTravelWiz'
import { usePermission } from '@/hooks/usePermission'
import type { VoyageUpdate } from '@/types/api'
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
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  return (
    <FormSection title="Rapport cargo opérationnel" collapsible defaultExpanded>
      {!report || report.items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucun cargo affecté à ce voyage.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button className="gl-button-sm gl-button-default text-xs" onClick={onOpenExport}>
              Exporter le rapport
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
            <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Colis</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{report.cargo_count}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Livrés</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{report.delivered_count}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Endommagés</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{report.damaged_count}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Manquants</p>
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
                      {item.weight_kg.toLocaleString('fr-FR')} kg
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
      <DynamicPanelShell title="Chargement..." icon={<Plane size={14} className="text-primary" />}>
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
            <FormSection title="Informations">
              <FormGrid>
                <DynamicPanelField label="Code">
                  <span className="text-sm font-mono font-medium text-foreground">{voyage.code}</span>
                </DynamicPanelField>
                <DynamicPanelField label="Vecteur" required>
                  <select
                    value={editForm.vector_id ?? ''}
                    onChange={(e) => setEditForm({ ...editForm, vector_id: e.target.value || null })}
                    className={panelInputClass}
                  >
                    <option value="">Selectionner...</option>
                    {(vectors?.items ?? []).map((vector) => (
                      <option key={vector.id} value={vector.id}>
                        {vector.name} {vector.registration ? `(${vector.registration})` : ''}
                      </option>
                    ))}
                  </select>
                </DynamicPanelField>
                <DynamicPanelField label="Rotation">
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
                <DynamicPanelField label="Base de depart" span="full">
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
              <FormSection title="Informations">
                <DetailFieldGrid>
                  <ReadOnlyRow label="Code" value={voyage.code} />
                  <ReadOnlyRow label="Vecteur" value={voyage.vector_name ?? '\u2014'} />
                  <ReadOnlyRow label="Rotation" value={voyage.rotation_name ?? '\u2014'} />
                  <ReadOnlyRow label="Base de depart" value={departureLabel} />
                  <ReadOnlyRow label="Derniere escale planifiee" value={destinationLabel} />
                  <ReadOnlyRow label="Depart programme" value={voyage.scheduled_departure ? new Date(voyage.scheduled_departure).toLocaleString('fr-FR') : '\u2014'} />
                  <ReadOnlyRow label="Arrivee programmee" value={voyage.scheduled_arrival ? new Date(voyage.scheduled_arrival).toLocaleString('fr-FR') : '\u2014'} />
                  <ReadOnlyRow label="Depart reel" value={voyage.actual_departure ? new Date(voyage.actual_departure).toLocaleString('fr-FR') : '\u2014'} />
                  <ReadOnlyRow label="Arrivee reelle" value={voyage.actual_arrival ? new Date(voyage.actual_arrival).toLocaleString('fr-FR') : '\u2014'} />
                  <ReadOnlyRow label="Motif du retard" value={voyage.delay_reason ?? '\u2014'} />
                </DetailFieldGrid>
              </FormSection>

              <FormSection title={`Route (${(stops?.length ?? 0) + 2} points)`} collapsible defaultExpanded>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 p-1.5 rounded bg-primary/5 border border-primary/10">
                    <div className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">O</div>
                    <span className="text-xs font-medium text-foreground">{departureLabel}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{formatDateTime(voyage.scheduled_departure)}</span>
                  </div>
                  {stops?.map((stop, idx) => (
                    <div key={stop.id} className="flex items-center gap-2 p-1.5 rounded border border-border/60">
                      <div className="w-5 h-5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold flex items-center justify-center shrink-0">{idx + 1}</div>
                      <span className="text-xs text-foreground">{stop.location}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">{formatDateTime(stop.arrival_at)}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 p-1.5 rounded bg-green-500/5 border border-green-500/10">
                    <div className="w-5 h-5 rounded-full bg-green-500/20 text-green-600 text-[10px] font-bold flex items-center justify-center shrink-0">D</div>
                    <span className="text-xs font-medium text-foreground">{destinationLabel}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{formatDateTime(voyage.scheduled_arrival)}</span>
                  </div>
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
                  <p className="text-sm font-semibold tabular-nums">{cargoWeight.toLocaleString('fr-FR')} kg</p>
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
                    <p className="text-sm font-semibold tabular-nums">{(capacity.current_cargo_kg ?? 0).toLocaleString('fr-FR')} / {capacity.vector_capacity_cargo_kg?.toLocaleString('fr-FR') ?? '\u221e'}</p>
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
              ) : <p className="text-xs text-muted-foreground py-2">Aucun evenement enregistre.</p>}
            </FormSection>

            {kpis && (
              <FormSection title="KPIs du voyage" collapsible defaultExpanded>
                <DetailFieldGrid>
                  <ReadOnlyRow label="PAX total" value={kpis.total_pax} />
                  <ReadOnlyRow label="Cargo total" value={`${(kpis.total_cargo_kg ?? 0).toLocaleString('fr-FR')} kg`} />
                  <ReadOnlyRow label="No-shows" value={kpis.no_shows} />
                  <ReadOnlyRow label="A l'heure" value={kpis.on_time ? 'Oui' : `Non (${kpis.delay_minutes ?? 0} min)`} />
                  <ReadOnlyRow label="Evenements" value={kpis.events_count} />
                  <ReadOnlyRow label="Articles HAZMAT" value={kpis.hazmat_items} />
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

            <FormSection title="Tags, notes & fichiers" collapsible defaultExpanded>
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
