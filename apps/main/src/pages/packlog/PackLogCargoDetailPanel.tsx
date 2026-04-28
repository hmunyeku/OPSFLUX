import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Clock,
  FileText,
  Layers,
  Loader2,
  MapPin,
  Package,
  Printer,
  Search,
  Undo2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  DynamicPanelShell,
  PanelContentLayout,
  FormSection,
  FormGrid,
  DynamicPanelField,
  SectionColumns,
  DetailFieldGrid,
  ReadOnlyRow,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import type { ActionItem } from '@/components/layout/DynamicPanel'
import { SkeletonDetailPanel } from '@/components/ui/Skeleton'
import { TabBar } from '@/components/ui/Tabs'
import { useUIStore } from '@/stores/uiStore'
import { UserPicker } from '@/components/shared/UserPicker'
import { ContactPicker } from '@/components/shared/ContactPicker'
import { useToast } from '@/components/ui/Toast'
import { useAttachments } from '@/hooks/useSettings'
import { useDictionaryLabels, useDictionaryOptions } from '@/hooks/useDictionary'
import { useAllManifests, useVectorZones, useVoyage } from '@/hooks/useTravelWiz'
import { useCargoLabelPdf, usePackLogSapMatch } from '@/hooks/usePackLog'
import {
  useCargoDictionaryCategory,
  useCargoWorkspace,
  useWorkspaceCargoAttachmentEvidence,
  useWorkspaceCargoHistory,
  useWorkspaceCargoItem,
  useWorkspaceCargoRequests,
  useWorkspaceInitiateCargoReturn,
  useWorkspacePackageElements,
  useWorkspaceUpdateCargo,
  useWorkspaceUpdateCargoAttachmentEvidence,
  useWorkspaceUpdateCargoStatus,
  useWorkspaceUpdateCargoWorkflowStatus,
  useWorkspaceUpdatePackageElementDisposition,
  useWorkspaceUpdatePackageElementReturn,
} from '@/pages/packlog/packlogWorkspace'
import {
  assessCargoReadiness,
  buildPickupMapEmbedUrl,
  buildPickupMapUrl,
  CargoBackReturnSection,
  CargoEvidenceQualificationSection,
  CargoFilesSection,
  CargoHistorySection,
  CargoLocationSection,
  CargoPackageElementsSection,
  CargoReadinessSection,
  CargoReturnSummarySection,
  CARGO_READINESS_LABELS,
  getRequiredCargoEvidenceTypes,
  type CargoReturnDraft,
  type PackageElementReturnDraft,
} from '@/pages/packlog/PackLogCargoDetailSections'
import type {
  CargoItem,
  CargoItemUpdate,
  PackageElement,
  PackageElementDispositionUpdate,
  PackageElementReturnUpdate,
} from '@/types/api'
import { formatDate } from '@/lib/i18n'

const CARGO_STATUS_LABELS_FALLBACK: Record<string, string> = {
  registered: 'Enregistré',
  ready: 'Prêt',
  ready_for_loading: 'Prêt au chargement',
  loaded: 'Chargé',
  in_transit: 'En transit',
  delivered: 'Livré',
  delivered_intermediate: 'Livré (inter.)',
  delivered_final: 'Livré final',
  return_declared: 'Retour déclaré',
  return_in_transit: 'Retour en transit',
  returned: 'Retourné',
  reintegrated: 'Réintégré',
  scrapped: 'Ferraillé',
  damaged: 'Endommagé',
  missing: 'Manquant',
}

const CARGO_STATUS_BADGES: Record<string, string> = {
  registered: 'gl-badge-neutral',
  ready: 'gl-badge-info',
  ready_for_loading: 'gl-badge-info',
  loaded: 'gl-badge-warning',
  in_transit: 'gl-badge-warning',
  delivered: 'gl-badge-success',
  delivered_intermediate: 'gl-badge-success',
  delivered_final: 'gl-badge-success',
  return_declared: 'gl-badge-warning',
  return_in_transit: 'gl-badge-warning',
  returned: 'gl-badge-success',
  reintegrated: 'gl-badge-success',
  scrapped: 'gl-badge-danger',
  damaged: 'gl-badge-danger',
  missing: 'gl-badge-danger',
}

function StatusBadge({
  status,
  labels,
  badges,
}: {
  status: string
  labels: Record<string, string>
  badges: Record<string, string>
}) {
  return <span className={cn('gl-badge', badges[status] ?? 'gl-badge-neutral')}>{labels[status] ?? status}</span>
}

function buildStatusOptions(labels: Record<string, string>, values: string[]) {
  return values.map((value) => ({ value, label: labels[value] ?? value }))
}

export function CargoDetailPanel({ id }: { id: string }) {
  const { panelModule } = useCargoWorkspace()
  const cargoTypeCategory = useCargoDictionaryCategory('cargo_type')
  const ownershipCategory = useCargoDictionaryCategory('cargo_ownership_type')
  const backCargoReturnTypeCategory = useCargoDictionaryCategory('back_cargo_return_type')
  const packageReturnStatusCategory = useCargoDictionaryCategory('package_return_status')
  const cargoStatusCategory = useCargoDictionaryCategory('cargo_status')
  const cargoWorkflowCategory = useCargoDictionaryCategory('cargo_workflow_status')
  const cargoRequestStatusCategory = useCargoDictionaryCategory('cargo_request_status')
  const cargoEvidenceCategory = useCargoDictionaryCategory('cargo_evidence_type')
  const { data: cargo, isLoading } = useWorkspaceCargoItem(id)
  const { data: cargoRequestsData } = useWorkspaceCargoRequests({ page: 1, page_size: 100 })
  const { data: manifests } = useAllManifests({ page: 1, page_size: 100 })
  const updateCargo = useWorkspaceUpdateCargo()
  const updateCargoSt = useWorkspaceUpdateCargoStatus()
  const updateCargoWorkflowStatus = useWorkspaceUpdateCargoWorkflowStatus()
  const { data: attachments } = useAttachments('cargo_item', id)
  const { data: attachmentEvidence } = useWorkspaceCargoAttachmentEvidence(id)
  const updateCargoAttachmentEvidence = useWorkspaceUpdateCargoAttachmentEvidence()
  const initiateReturn = useWorkspaceInitiateCargoReturn()
  const { data: packageElements } = useWorkspacePackageElements(id)
  const updatePackageElementReturn = useWorkspaceUpdatePackageElementReturn()
  const updatePackageElementDisposition = useWorkspaceUpdatePackageElementDisposition()
  const { data: cargoHistory } = useWorkspaceCargoHistory(id)
  const sapMatch = usePackLogSapMatch()
  const labelPdf = useCargoLabelPdf()
  const cargoTypeOptions = useDictionaryOptions(cargoTypeCategory)
  const ownershipOptions = useDictionaryOptions(ownershipCategory)
  const backCargoReturnTypeOptions = useDictionaryOptions(backCargoReturnTypeCategory)
  const packageReturnStatusOptions = useDictionaryOptions(packageReturnStatusCategory)
  const cargoTypeLabels = useDictionaryLabels(cargoTypeCategory)
  const ownershipLabels = useDictionaryLabels(ownershipCategory)
  const cargoStatusLabels = useDictionaryLabels(cargoStatusCategory, CARGO_STATUS_LABELS_FALLBACK)
  const cargoWorkflowLabels = useDictionaryLabels(cargoWorkflowCategory)
  const cargoRequestStatusLabels = useDictionaryLabels(cargoRequestStatusCategory)
  const backCargoReturnTypeLabels = useDictionaryLabels(backCargoReturnTypeCategory)
  const packageReturnStatusLabels = useDictionaryLabels(packageReturnStatusCategory)
  const cargoEvidenceOptions = useDictionaryOptions(cargoEvidenceCategory)
  const cargoEvidenceLabels = useDictionaryLabels(cargoEvidenceCategory)
  const { toast } = useToast()
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [activeTab, setActiveTab] = useState<'details' | 'logistique' | 'elements' | 'documents' | 'historique'>('details')
  const [editForm, setEditForm] = useState<CargoItemUpdate>({})
  const [workflowBlockingItems, setWorkflowBlockingItems] = useState<string[]>([])
  const [packageElementDrafts, setPackageElementDrafts] = useState<Record<string, PackageElementReturnDraft>>({})
  const [returnDraft, setReturnDraft] = useState<CargoReturnDraft>({
    return_type: 'waste',
    notes: '',
    waste_manifest_ref: '',
    pass_number: '',
    inventory_reference: '',
    sap_code_confirmed: false,
    photo_evidence_count: 0,
    double_signature_confirmed: false,
    yard_justification: '',
  })
  const cargoRequests = cargoRequestsData?.items ?? []
  const selectedManifest = useMemo(
    () => (manifests?.items ?? []).find((manifest) => manifest.id === (editForm.manifest_id ?? cargo?.manifest_id)) ?? null,
    [manifests?.items, editForm.manifest_id, cargo?.manifest_id],
  )
  const selectedVoyageId = selectedManifest?.voyage_id ?? undefined
  const { data: selectedVoyage } = useVoyage(selectedVoyageId)
  const { data: plannedZones } = useVectorZones(selectedVoyage?.vector_id ?? undefined)

  useEffect(() => {
    if (!packageElements?.length) return
    setPackageElementDrafts((current) => {
      const next = { ...current }
      for (const element of packageElements) {
        if (!next[element.id]) {
          next[element.id] = {
            quantity_returned: element.quantity_returned ?? 0,
            return_notes: element.return_notes ?? '',
            disposition: 'returned',
          }
        }
      }
      return next
    })
  }, [packageElements])

  const startEdit = useCallback(() => {
    if (!cargo) return
    setEditForm({
      request_id: cargo.request_id,
      description: cargo.description,
      designation: cargo.designation,
      weight_kg: cargo.weight_kg,
      width_cm: cargo.width_cm,
      length_cm: cargo.length_cm,
      height_cm: cargo.height_cm,
      surface_m2: cargo.surface_m2,
      package_count: cargo.package_count,
      stackable: cargo.stackable,
      cargo_type: cargo.cargo_type,
      ownership_type: cargo.ownership_type,
      pickup_location_label: cargo.pickup_location_label,
      pickup_latitude: cargo.pickup_latitude,
      pickup_longitude: cargo.pickup_longitude,
      document_prepared_at: cargo.document_prepared_at,
      available_from: cargo.available_from,
      pickup_contact_user_id: cargo.pickup_contact_user_id,
      pickup_contact_tier_contact_id: cargo.pickup_contact_tier_contact_id,
      pickup_contact_name: cargo.pickup_contact_name,
      pickup_contact_phone: cargo.pickup_contact_phone,
      lifting_provider: cargo.lifting_provider,
      lifting_points_certified: cargo.lifting_points_certified,
      weight_ticket_provided: cargo.weight_ticket_provided,
      photo_evidence_count: cargo.photo_evidence_count,
      document_attachment_count: cargo.document_attachment_count,
      manifest_id: cargo.manifest_id,
      planned_zone_id: cargo.planned_zone_id,
      sap_article_code: cargo.sap_article_code,
      hazmat_validated: cargo.hazmat_validated,
      is_reusable: cargo.is_reusable ?? false,
      expected_return_date: cargo.expected_return_date ?? null,
    })
    setEditing(true)
  }, [cargo])

  const handleSave = async () => {
    if (!editForm.request_id) {
      toast({ title: t('packlog.toast.cargo_must_have_request'), variant: 'error' })
      return
    }
    try {
      await updateCargo.mutateAsync({ id, payload: editForm })
      toast({ title: t('packlog.toast.cargo_updated'), variant: 'success' })
      setEditing(false)
    } catch {
      toast({ title: t('packlog.toast.cargo_update_error'), variant: 'error' })
    }
  }

  const handleReturn = async () => {
    const firstType = backCargoReturnTypeOptions[0]?.value ?? 'waste'
    setReturnDraft((current) => ({ ...current, return_type: current.return_type || firstType }))
    toast({
      title: t('packlog.toast.return_qualify'),
      description: t('packlog.toast.return_qualify_description'),
    })
  }

  const handleWorkflowChange = async (workflowStatus: CargoItem['workflow_status']) => {
    try {
      setWorkflowBlockingItems([])
      await updateCargoWorkflowStatus.mutateAsync({ id, workflow_status: workflowStatus })
      toast({ title: t('packlog.toast.workflow_updated'), variant: 'success' })
    } catch (error: unknown) {
      const missing = Array.isArray((error as { response?: { data?: { detail?: { missing_requirements?: string[] } } } })?.response?.data?.detail?.missing_requirements)
        ? ((error as { response?: { data?: { detail?: { missing_requirements?: string[] } } } }).response?.data?.detail?.missing_requirements ?? [])
        : []
      if (missing.length > 0) {
        setWorkflowBlockingItems(missing)
        toast({
          title: t('packlog.toast.workflow_incomplete'),
          description: missing.map((item) => CARGO_READINESS_LABELS[item] ?? item).join(', '),
          variant: 'error',
        })
        return
      }
      toast({ title: t('packlog.toast.workflow_change_error'), variant: 'error' })
    }
  }

  const updatePackageElementDraft = useCallback((elementId: string, patch: Partial<PackageElementReturnDraft>) => {
    setPackageElementDrafts((current) => ({
      ...current,
      [elementId]: {
        quantity_returned: current[elementId]?.quantity_returned ?? 0,
        return_notes: current[elementId]?.return_notes ?? '',
        disposition: current[elementId]?.disposition ?? 'returned',
        ...patch,
      },
    }))
  }, [])

  const handlePackageElementReturn = useCallback(async (element: PackageElement) => {
    const draft = packageElementDrafts[element.id]
    if (!draft) return
    try {
      await updatePackageElementReturn.mutateAsync({
        cargoItemId: id,
        elementId: element.id,
        payload: {
          quantity_returned: draft.quantity_returned,
          return_notes: draft.return_notes || null,
        } satisfies PackageElementReturnUpdate,
      })
      toast({ title: t('packlog.toast.element_return_saved'), variant: 'success' })
    } catch {
      toast({ title: t('packlog.toast.element_return_error'), variant: 'error' })
    }
  }, [id, packageElementDrafts, toast, updatePackageElementReturn])

  const handlePackageElementDisposition = useCallback(async (element: PackageElement) => {
    const draft = packageElementDrafts[element.id]
    if (!draft) return
    try {
      await updatePackageElementDisposition.mutateAsync({
        cargoItemId: id,
        elementId: element.id,
        payload: {
          return_status: draft.disposition,
          return_notes: draft.return_notes || null,
        } satisfies PackageElementDispositionUpdate,
      })
      toast({ title: t('packlog.toast.disposition_applied'), variant: 'success' })
    } catch {
      toast({ title: t('packlog.toast.disposition_error'), variant: 'error' })
    }
  }, [id, packageElementDrafts, toast, updatePackageElementDisposition])

  const updateReturnDraft = useCallback((patch: Partial<CargoReturnDraft>) => {
    setReturnDraft((current) => ({ ...current, ...patch }))
  }, [])

  const handleInitiateBackCargo = useCallback(async () => {
    try {
      await initiateReturn.mutateAsync({
        cargoItemId: id,
        payload: {
          return_type: returnDraft.return_type,
          notes: returnDraft.notes || null,
          waste_manifest_ref: returnDraft.waste_manifest_ref || null,
          pass_number: returnDraft.pass_number || null,
          inventory_reference: returnDraft.inventory_reference || null,
          sap_code_confirmed: returnDraft.sap_code_confirmed,
          photo_evidence_count: returnDraft.photo_evidence_count,
          double_signature_confirmed: returnDraft.double_signature_confirmed,
          yard_justification: returnDraft.yard_justification || null,
        },
      })
      toast({ title: t('packlog.toast.back_cargo_initiated'), variant: 'success' })
    } catch (error: unknown) {
      const message = ((error as { response?: { data?: { detail?: string } } })?.response?.data?.detail)
      toast({
        title: t('packlog.toast.back_cargo_error'),
        description: typeof message === 'string' ? message : undefined,
        variant: 'error',
      })
    }
  }, [id, initiateReturn, returnDraft, toast])

  // Derive cargoRequest before actionItems useMemo (cargo may be undefined before early return)
  const cargoRequest = cargo?.request_id
    ? cargoRequests.find((request) => request.id === cargo.request_id) ?? null
    : null

  // Silence "declared but never used" — these helpers still live in
  // the file so we can easily re-enable inline-edit mode later; the
  // action bar no longer has a trigger for them.
  void startEdit
  void handleSave

  // OpsFlux pattern: no edit-mode switch — inline edit directly on
  // permissioned fields (double-click InlineEditable rows). Only
  // domain actions that can't be expressed inline remain.
  const actionItems = useMemo<ActionItem[]>(() => {
    const items: ActionItem[] = []
    if (cargoRequest) {
      items.push({
        id: 'open-request',
        label: 'Ouvrir la demande',
        icon: FileText,
        priority: 50,
        onClick: () =>
          useUIStore.getState().openDynamicPanel({
            type: 'detail',
            module: panelModule,
            id: cargoRequest.id,
            meta: { subtype: 'cargo-request' },
          }),
      })
    }
    items.push({
      id: 'label-pdf',
      label: 'Etiquette PDF',
      icon: Printer,
      loading: labelPdf.isPending,
      priority: 60,
      onClick: () => labelPdf.mutate({ id }),
    })
    return items
  }, [cargoRequest, panelModule, id, labelPdf])

  if (isLoading || !cargo) {
    return (
      <DynamicPanelShell title={t('common.loading_ellipsis')} icon={<Package size={14} className="text-primary" />}>
        <SkeletonDetailPanel />
      </DynamicPanelShell>
    )
  }

  const isDelivered = ['delivered', 'delivered_final', 'delivered_intermediate'].includes(cargo.status)
  const projectLabel = cargo.request_project_id ?? cargo.project_id ?? null
  const manifestLabel = cargo.manifest_id
    ? (manifests?.items ?? []).find((manifest) => manifest.id === cargo.manifest_id)?.reference ?? cargo.manifest_id
    : null
  const volumeLabel = cargo.volume_m3 ? `${cargo.volume_m3.toLocaleString('fr-FR')} m³` : '—'
  const cargoRequestStatusLabel = cargoRequest?.status
    ? (cargoRequestStatusLabels[cargoRequest.status] ?? cargoRequest.status)
    : '—'
  const requiredEvidenceTypes = getRequiredCargoEvidenceTypes(cargo.cargo_type)
  const evidenceTypeSet = new Set((attachmentEvidence ?? []).map((item) => item.evidence_type))
  const missingRequirements = [
    ...assessCargoReadiness(cargo),
    ...requiredEvidenceTypes.filter((type) => !evidenceTypeSet.has(type)),
  ]
  const pickupMapUrl = buildPickupMapUrl(cargo.pickup_latitude, cargo.pickup_longitude)
  const pickupMapEmbedUrl = buildPickupMapEmbedUrl(cargo.pickup_latitude, cargo.pickup_longitude)
  const editingPickupMapUrl = buildPickupMapUrl(editForm.pickup_latitude, editForm.pickup_longitude)
  const editingPickupMapEmbedUrl = buildPickupMapEmbedUrl(editForm.pickup_latitude, editForm.pickup_longitude)
  const evidenceByAttachmentId = new Map((attachmentEvidence ?? []).map((item) => [item.attachment_id, item.evidence_type]))

  return (
    <DynamicPanelShell title={cargo.code} subtitle={cargo.description || 'Colis'} icon={<Package size={14} className="text-primary" />}
      actionItems={actionItems}
    >
      <PanelContentLayout>
        {/* Compact summary header — always visible */}
        <div className="flex items-start gap-3 pb-3 border-b border-border/50 mb-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={cargo.status} labels={cargoStatusLabels} badges={CARGO_STATUS_BADGES} />
              <span className="gl-badge gl-badge-neutral text-[10px]">{cargoWorkflowLabels[cargo.workflow_status] ?? cargo.workflow_status}</span>
              {cargo.hazmat_validated && (
                <span className="inline-flex items-center gap-1 text-[10px] text-destructive font-medium">
                  <AlertTriangle size={10} />HAZMAT
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap text-[11px] text-muted-foreground">
              {cargo.weight_kg && <span><span className="text-foreground font-medium">{cargo.weight_kg.toLocaleString('fr-FR')} kg</span></span>}
              {cargo.width_cm && cargo.length_cm && cargo.height_cm && <span>{cargo.width_cm}×{cargo.length_cm}×{cargo.height_cm} cm</span>}
              {cargo.voyage_code && <span>✈ {cargo.voyage_code}</span>}
              {cargo.destination_name && <span>→ {cargo.destination_name}</span>}
            </div>
            {!editing && (
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {!['delivered_final', 'damaged', 'missing', 'returned'].includes(cargo.status) && (
                  <select className="text-[11px] border border-border rounded px-1.5 py-0.5 bg-background text-foreground h-6" value=""
                    onChange={(e) => { if (e.target.value) updateCargoSt.mutate({ id, status: e.target.value }) }}>
                    <option value="">Changer statut...</option>
                    {buildStatusOptions(cargoStatusLabels, ['registered', 'ready', 'ready_for_loading', 'loaded', 'in_transit', 'delivered', 'delivered_intermediate', 'delivered_final', 'return_declared', 'return_in_transit', 'returned', 'reintegrated', 'scrapped', 'damaged', 'missing'])
                      .filter((option) => option.value && option.value !== cargo.status)
                      .map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                )}
                <select className="text-[11px] border border-border rounded px-1.5 py-0.5 bg-background text-foreground h-6" value=""
                  onChange={(e) => { if (e.target.value) void handleWorkflowChange(e.target.value as CargoItem['workflow_status']) }}>
                  <option value="">{t('common.workflow')}...</option>
                  {Object.entries(cargoWorkflowLabels).filter(([k]) => k !== cargo.workflow_status).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                {isDelivered && (
                  <button className="gl-button-sm gl-button-default text-[11px] inline-flex items-center gap-1 h-6" onClick={handleReturn} disabled={initiateReturn.isPending}>
                    <Undo2 size={9} /> Retour
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tab bar — only shown when not editing */}
        {!editing && (
          <div className="-mx-4">
            <TabBar
              items={[
                { id: 'details', label: 'Informations', icon: Package },
                { id: 'logistique', label: 'Logistique', icon: MapPin },
                { id: 'elements', label: 'Éléments', icon: Layers, badge: (cargo.sub_item_count ?? 0) > 0 ? (cargo.sub_item_count ?? undefined) : undefined },
                { id: 'documents', label: 'Documents', icon: FileText },
                { id: 'historique', label: 'Historique', icon: Clock },
              ]}
              activeId={activeTab}
              onTabChange={(id) => setActiveTab(id as typeof activeTab)}
            />
          </div>
        )}

        {editing ? (
          <FormSection title={t('common.information')}>
            <FormGrid>
              <DynamicPanelField label={t('common.reference')}>
                <span className="text-sm font-mono font-medium text-foreground">{cargo.code}</span>
              </DynamicPanelField>
              <DynamicPanelField label={t('common.package_type')}>
                <select value={editForm.cargo_type ?? ''} onChange={(e) => setEditForm({ ...editForm, cargo_type: e.target.value || null })} className={panelInputClass}>
                  {cargoTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label={t('common.shipment_request_label')}>
                <select value={editForm.request_id ?? ''} onChange={(e) => setEditForm({ ...editForm, request_id: e.target.value || null })} className={panelInputClass}>
                  <option value="">Sélectionner une demande...</option>
                  {cargoRequests.map((request) => (
                    <option key={request.id} value={request.id}>{request.request_code} — {request.title}</option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Le colis doit rester rattaché à une demande d'expédition pour conserver le flux métier parent → enfants.
                </p>
              </DynamicPanelField>
              <DynamicPanelField label={t('common.designation')}>
                <input type="text" value={editForm.designation ?? ''} onChange={(e) => setEditForm({ ...editForm, designation: e.target.value || null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.sap_article')}>
                <input type="text" value={editForm.sap_article_code ?? ''} onChange={(e) => setEditForm({ ...editForm, sap_article_code: e.target.value || null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.weight_kg')}><input type="number" min={0} step="any" value={editForm.weight_kg ?? ''} onChange={(e) => setEditForm({ ...editForm, weight_kg: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} /></DynamicPanelField>
              <DynamicPanelField label={t('common.width_cm')}><input type="number" min={0} step="any" value={editForm.width_cm ?? ''} onChange={(e) => setEditForm({ ...editForm, width_cm: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} /></DynamicPanelField>
              <DynamicPanelField label={t('common.length_cm')}><input type="number" min={0} step="any" value={editForm.length_cm ?? ''} onChange={(e) => setEditForm({ ...editForm, length_cm: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} /></DynamicPanelField>
              <DynamicPanelField label={t('common.height_cm')}><input type="number" min={0} step="any" value={editForm.height_cm ?? ''} onChange={(e) => setEditForm({ ...editForm, height_cm: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} /></DynamicPanelField>
              <DynamicPanelField label={t('common.total_area_m2')}><input type="number" min={0} step="any" value={editForm.surface_m2 ?? ''} onChange={(e) => setEditForm({ ...editForm, surface_m2: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} /></DynamicPanelField>
              <DynamicPanelField label={t('common.package_count')}><input type="number" min={1} step={1} value={editForm.package_count ?? ''} onChange={(e) => setEditForm({ ...editForm, package_count: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} /></DynamicPanelField>
              <DynamicPanelField label={t('common.stackable')}>
                <label className="inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={editForm.stackable ?? false} onChange={(e) => setEditForm({ ...editForm, stackable: e.target.checked })} />
                  Empilable
                </label>
              </DynamicPanelField>
              <DynamicPanelField label={t('common.material_ownership')}>
                <select value={editForm.ownership_type ?? ''} onChange={(e) => setEditForm({ ...editForm, ownership_type: e.target.value || null })} className={panelInputClass}>
                  <option value="">{t('common.select')}</option>
                  {ownershipOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label="Manifeste">
                <select value={editForm.manifest_id ?? ''} onChange={(e) => setEditForm({ ...editForm, manifest_id: e.target.value || null })} className={panelInputClass}>
                  <option value="">Aucun</option>
                  {(manifests?.items ?? []).map((manifest) => (
                    <option key={manifest.id} value={manifest.id}>{manifest.reference || manifest.id}</option>
                  ))}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label={t('common.loading_zone')}>
                <select
                  value={editForm.planned_zone_id ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, planned_zone_id: e.target.value || null })}
                  className={panelInputClass}
                  disabled={!selectedManifest || !(plannedZones?.length)}
                >
                  <option value="">{selectedManifest ? 'Aucune' : "Sélectionner d'abord un manifeste"}</option>
                  {(plannedZones ?? []).map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name}
                      {zone.zone_type ? ` — ${zone.zone_type}` : ''}
                    </option>
                  ))}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label="HAZMAT validé">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={editForm.hazmat_validated ?? false} onChange={(e) => setEditForm({ ...editForm, hazmat_validated: e.target.checked })} />
                  Conforme et validé pour transport HAZMAT
                </label>
              </DynamicPanelField>
              <DynamicPanelField label={t('common.reusable_package')}>
                <label className="inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={(editForm as { is_reusable?: boolean }).is_reusable ?? false} onChange={(e) => setEditForm({ ...editForm, is_reusable: e.target.checked } as typeof editForm)} />
                  Emballage retournable (basket, skid, coffre DNV…)
                </label>
              </DynamicPanelField>
              {(editForm as { is_reusable?: boolean }).is_reusable && (
                <DynamicPanelField label={t('common.expected_return_date')}>
                  <input type="date" value={(editForm as { expected_return_date?: string | null }).expected_return_date ?? ''} onChange={(e) => setEditForm({ ...editForm, expected_return_date: e.target.value || null } as typeof editForm)} className={panelInputClass} />
                </DynamicPanelField>
              )}
              <DynamicPanelField label="Contexte hérité de la demande" span="full">
                <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 md:grid-cols-4">
                  <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('common.sender')}</p><p className="mt-1 text-sm text-foreground">{cargo.sender_name ?? '—'}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('common.destination')}</p><p className="mt-1 text-sm text-foreground">{cargo.destination_name ?? cargo.receiver_name ?? '—'}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('common.project')}</p><p className="mt-1 text-sm text-foreground">{projectLabel ?? '—'}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('common.imputation')}</p><p className="mt-1 text-sm text-foreground">{cargo.imputation_reference_name ?? cargo.imputation_reference_code ?? '—'}</p></div>
                </div>
              </DynamicPanelField>
              <DynamicPanelField label={t('common.document_prepared_on')}>
                <input type="datetime-local" value={editForm.document_prepared_at ?? ''} onChange={(e) => setEditForm({ ...editForm, document_prepared_at: e.target.value || null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.availability')}>
                <input type="datetime-local" value={editForm.available_from ?? ''} onChange={(e) => setEditForm({ ...editForm, available_from: e.target.value || null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.pickup_location')} span="full">
                <input type="text" value={editForm.pickup_location_label ?? ''} onChange={(e) => setEditForm({ ...editForm, pickup_location_label: e.target.value || null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.latitude')}>
                <input type="number" step="any" value={editForm.pickup_latitude ?? ''} onChange={(e) => setEditForm({ ...editForm, pickup_latitude: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.longitude')}>
                <input type="number" step="any" value={editForm.pickup_longitude ?? ''} onChange={(e) => setEditForm({ ...editForm, pickup_longitude: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.map_preview')} span="full">
                {editingPickupMapEmbedUrl ? (
                  <div className="space-y-2">
                    <div className="overflow-hidden rounded-lg border border-border">
                      <iframe title="Pickup edit map preview" src={editingPickupMapEmbedUrl} className="h-48 w-full bg-muted" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                    </div>
                    {editingPickupMapUrl && (
                      <a href={editingPickupMapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs text-foreground hover:text-primary">
                        <MapPin size={12} />
                        Ouvrir la localisation sur la carte
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Renseigne latitude et longitude pour visualiser le point de pickup sur la carte.</p>
                )}
              </DynamicPanelField>
              <DynamicPanelField label={t('common.user_contact')}>
                <UserPicker value={editForm.pickup_contact_user_id ?? null} onChange={(id) => setEditForm({ ...editForm, pickup_contact_user_id: id ?? null })} placeholder={t('common.none_option')} />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.company_contact')}>
                <ContactPicker value={editForm.pickup_contact_tier_contact_id ?? null} onChange={(id) => setEditForm({ ...editForm, pickup_contact_tier_contact_id: id ?? null })} placeholder={t('common.none_option')} tierId={editForm.sender_tier_id ?? null} />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.free_contact_name')}>
                <input type="text" value={editForm.pickup_contact_name ?? ''} onChange={(e) => setEditForm({ ...editForm, pickup_contact_name: e.target.value || null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.contact_phone')}>
                <input type="text" value={editForm.pickup_contact_phone ?? ''} onChange={(e) => setEditForm({ ...editForm, pickup_contact_phone: e.target.value || null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Levage fourni par">
                <input type="text" value={editForm.lifting_provider ?? ''} onChange={(e) => setEditForm({ ...editForm, lifting_provider: e.target.value || null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Oreilles certifiées">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={editForm.lifting_points_certified ?? false} onChange={(e) => setEditForm({ ...editForm, lifting_points_certified: e.target.checked })} />
                  Certification disponible
                </label>
              </DynamicPanelField>
              <DynamicPanelField label="Ticket de pesée">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={editForm.weight_ticket_provided ?? false} onChange={(e) => setEditForm({ ...editForm, weight_ticket_provided: e.target.checked })} />
                  Preuve de pesée disponible
                </label>
              </DynamicPanelField>
              <DynamicPanelField label={t('common.photos_documents')} span="full">
                <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Les preuves visuelles et documentaires se gèrent via les fichiers joints du colis, pas par saisie manuelle de compteurs.
                </div>
              </DynamicPanelField>
              <DynamicPanelField label={t('common.description')} span="full"><textarea value={editForm.description ?? ''} onChange={(e) => setEditForm({ ...editForm, description: e.target.value || null })} className={`${panelInputClass} min-h-[60px] resize-y`} rows={3} /></DynamicPanelField>
            </FormGrid>
          </FormSection>
        ) : (
          <>
            {/* Tab: Informations */}
            {activeTab === 'details' && (
              <div className="space-y-4">
                <SectionColumns>
                  <div className="@container space-y-4">
                    <FormSection title={t('common.identification')}>
                      <DetailFieldGrid>
                        <ReadOnlyRow label={t('common.code_field')} value={cargo.code} />
                        <ReadOnlyRow label="Designation" value={cargo.designation ?? '—'} />
                        <ReadOnlyRow label={t('common.type_field')} value={cargoTypeLabels[cargo.cargo_type] ?? cargo.cargo_type ?? '—'} />
                        <ReadOnlyRow label="Article SAP" value={cargo.sap_article_code ?? '—'} />
                        <ReadOnlyRow label="Propriété" value={cargo.ownership_type ? (ownershipLabels[cargo.ownership_type] ?? cargo.ownership_type) : '—'} />
                        <ReadOnlyRow label="Réutilisable" value={cargo.is_reusable ? 'Oui — retour attendu' : 'Non'} />
                        {cargo.is_reusable && cargo.expected_return_date && (
                          <ReadOnlyRow label="Date retour prévue" value={formatDate(cargo.expected_return_date)} />
                        )}
                        <ReadOnlyRow label="HAZMAT validé" value={cargo.hazmat_validated ? 'Oui' : 'Non'} />
                      </DetailFieldGrid>
                    </FormSection>
                  </div>
                  <div className="@container space-y-4">
                    <FormSection title={t('packlog.cargo.section.dimensions', 'Dimensions & Poids')}>
                      <DetailFieldGrid>
                        <ReadOnlyRow label="Poids" value={cargo.weight_kg ? `${cargo.weight_kg.toLocaleString('fr-FR')} kg` : '—'} />
                        <ReadOnlyRow label="Dimensions" value={cargo.width_cm && cargo.length_cm && cargo.height_cm ? `${cargo.width_cm} × ${cargo.length_cm} × ${cargo.height_cm} cm` : '—'} />
                        <ReadOnlyRow label="Surface totale" value={cargo.surface_m2 != null ? `${cargo.surface_m2.toLocaleString('fr-FR')} m²` : '—'} />
                        <ReadOnlyRow label="Volume estimé" value={volumeLabel} />
                        <ReadOnlyRow label={t('common.package_count')} value={cargo.package_count?.toString() ?? '—'} />
                        <ReadOnlyRow label="Empilable" value={cargo.stackable ? 'Oui' : 'Non'} />
                      </DetailFieldGrid>
                    </FormSection>
                  </div>
                </SectionColumns>

                <FormSection title={t('packlog.cargo.section.request_tracking', 'Demande & Traçabilité')}>
                  <DetailFieldGrid>
                    <ReadOnlyRow label="Demande d'expédition" value={cargo.request_code ? `${cargo.request_code} — ${cargo.request_title ?? ''}`.trim() : '—'} />
                    <ReadOnlyRow label="Statut demande" value={cargoRequestStatusLabel} />
                    <ReadOnlyRow label="Workflow dossier" value={cargoWorkflowLabels[cargo.workflow_status] ?? cargo.workflow_status} />
                    <ReadOnlyRow label={t('common.requester')} value={cargo.requester_name ?? cargo.request_requester_name ?? '—'} />
                    <ReadOnlyRow label={t('common.sender')} value={cargo.sender_name ?? '—'} />
                    <ReadOnlyRow label={t('common.recipient')} value={cargo.receiver_name ?? cargo.request_receiver_name ?? '—'} />
                    <ReadOnlyRow label={t('common.project')} value={projectLabel ?? '—'} />
                    <ReadOnlyRow label={t('common.imputation')} value={cargo.imputation_reference_name ? `${cargo.imputation_reference_code ?? ''} ${cargo.imputation_reference_name}`.trim() : '—'} />
                    <ReadOnlyRow label="Préparé le" value={cargo.document_prepared_at ? new Date(cargo.document_prepared_at).toLocaleString('fr-FR') : '—'} />
                    <ReadOnlyRow label="Disponible le" value={cargo.available_from ? new Date(cargo.available_from).toLocaleString('fr-FR') : '—'} />
                    <ReadOnlyRow label={t('common.created_at_label')} value={formatDate(cargo.created_at)} />
                    {cargo.received_at && <ReadOnlyRow label="Reçu le" value={new Date(cargo.received_at).toLocaleString('fr-FR')} />}
                    <ReadOnlyRow label={t('common.description')} value={cargo.description ?? '—'} />
                    {cargo.damage_notes && <ReadOnlyRow label="Notes avarie" value={cargo.damage_notes} />}
                  </DetailFieldGrid>
                </FormSection>

                <CargoReadinessSection missingRequirements={missingRequirements} workflowBlockingItems={workflowBlockingItems} />

                <FormSection title={t('packlog.cargo.section.sap_matching', 'Matching SAP')} collapsible defaultExpanded={false}>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <p className="text-[10px] text-muted-foreground mb-1">Recherche par description</p>
                      <button className="gl-button-sm gl-button-default text-xs inline-flex items-center gap-1" onClick={() => { if (cargo.description) sapMatch.mutate(cargo.description) }} disabled={sapMatch.isPending || !cargo.description}>
                        {sapMatch.isPending ? <Loader2 size={10} className="animate-spin" /> : <Search size={10} />}
                        Rechercher SAP
                      </button>
                    </div>
                  </div>
                  {sapMatch.data && (
                    <div className="mt-2 p-2 rounded border border-border bg-muted/30">
                      {sapMatch.data.matched ? (
                        <p className="text-xs text-foreground">
                          <span className="font-mono font-medium">{sapMatch.data.sap_code}</span>
                          {' — '}{sapMatch.data.description}
                          {' '}({Math.round(sapMatch.data.confidence * 100)}% confiance)
                        </p>
                      ) : <p className="text-xs text-muted-foreground">Aucun article SAP correspondant.</p>}
                    </div>
                  )}
                </FormSection>
              </div>
            )}

            {/* Tab: Logistique */}
            {activeTab === 'logistique' && (
              <div className="space-y-4">
                <FormSection title={t('packlog.cargo.section.transport', 'Transport & Manifeste')}>
                  <DetailFieldGrid>
                    <ReadOnlyRow label="Voyage" value={cargo.voyage_code ?? '—'} />
                    <ReadOnlyRow label="Manifeste" value={manifestLabel ?? '—'} />
                    <ReadOnlyRow label="Zone prévue" value={cargo.planned_zone_name ?? '—'} />
                    <ReadOnlyRow label="Site de destination" value={cargo.destination_name ?? '—'} />
                  </DetailFieldGrid>
                </FormSection>

                <CargoLocationSection
                  pickupLocationLabel={cargo.pickup_location_label}
                  pickupCoordinatesLabel={cargo.pickup_latitude != null && cargo.pickup_longitude != null ? `${cargo.pickup_latitude}, ${cargo.pickup_longitude}` : '—'}
                  pickupMapUrl={pickupMapUrl}
                  pickupMapEmbedUrl={pickupMapEmbedUrl}
                />

                <FormSection title={t('packlog.cargo.section.contacts', 'Contacts & Opérations')}>
                  <DetailFieldGrid>
                    <ReadOnlyRow label="Lieu d'enlèvement" value={cargo.pickup_location_label ?? '—'} />
                    <ReadOnlyRow label="Coordonnées enlèvement" value={cargo.pickup_latitude != null && cargo.pickup_longitude != null ? `${cargo.pickup_latitude}, ${cargo.pickup_longitude}` : '—'} />
                    <ReadOnlyRow label="Contact d'enlèvement" value={cargo.pickup_contact_display_name ?? cargo.pickup_contact_name ?? '—'} />
                    <ReadOnlyRow label="Téléphone d'enlèvement" value={cargo.pickup_contact_phone ?? '—'} />
                    <ReadOnlyRow label="Levage fourni par" value={cargo.lifting_provider ?? '—'} />
                    <ReadOnlyRow label="Oreilles de levage certifiées" value={cargo.lifting_points_certified ? 'Oui' : 'Non'} />
                    <ReadOnlyRow label="Ticket de pesée" value={cargo.weight_ticket_provided ? 'Oui' : 'Non'} />
                    <ReadOnlyRow label="Photos" value={cargo.photo_evidence_count?.toString() ?? '0'} />
                    <ReadOnlyRow label="Documents" value={cargo.document_attachment_count?.toString() ?? '0'} />
                  </DetailFieldGrid>
                </FormSection>
              </div>
            )}

            {/* Tab: Éléments */}
            {activeTab === 'elements' && (
              <div className="space-y-4">
                <CargoPackageElementsSection
                  cargoStatus={cargo.status}
                  elements={packageElements}
                  drafts={packageElementDrafts}
                  cargoStatusLabels={cargoStatusLabels}
                  packageReturnStatusLabels={packageReturnStatusLabels}
                  packageReturnStatusOptions={packageReturnStatusOptions}
                  onDraftChange={updatePackageElementDraft}
                  onSubmitReturn={handlePackageElementReturn}
                  onSubmitDisposition={handlePackageElementDisposition}
                  savingReturn={updatePackageElementReturn.isPending}
                  savingDisposition={updatePackageElementDisposition.isPending}
                />
                <CargoReturnSummarySection elements={packageElements} packageReturnStatusLabels={packageReturnStatusLabels} />
                <CargoBackReturnSection
                  isDelivered={isDelivered}
                  returnDraft={returnDraft}
                  returnTypeOptions={backCargoReturnTypeOptions}
                  returnTypeLabels={backCargoReturnTypeLabels}
                  onChange={updateReturnDraft}
                  onSubmit={handleInitiateBackCargo}
                  isSubmitting={initiateReturn.isPending}
                />
              </div>
            )}

            {/* Tab: Documents */}
            {activeTab === 'documents' && (
              <div className="space-y-4">
                <CargoFilesSection cargoId={cargo.id} attachmentEvidence={attachmentEvidence} />
                <CargoEvidenceQualificationSection
                  cargoId={cargo.id}
                  attachments={attachments}
                  evidenceByAttachmentId={evidenceByAttachmentId}
                  cargoEvidenceOptions={cargoEvidenceOptions}
                  updateCargoAttachmentEvidence={updateCargoAttachmentEvidence}
                />
                <FormSection title={t('packlog.cargo.section.expected_proofs', 'Preuves attendues')} collapsible defaultExpanded={false}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {requiredEvidenceTypes.map((code) => {
                      const present = (attachmentEvidence ?? []).some((item) => item.evidence_type === code)
                      return (
                        <div
                          key={code}
                          className={cn(
                            'rounded-lg border px-3 py-2 text-xs',
                            present ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-border/60 bg-card text-muted-foreground',
                          )}
                        >
                          {cargoEvidenceLabels[code] ?? code}
                        </div>
                      )
                    })}
                  </div>
                </FormSection>
              </div>
            )}

            {/* Tab: Historique */}
            {activeTab === 'historique' && (
              <CargoHistorySection cargoHistory={cargoHistory} />
            )}
          </>
        )}
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}
