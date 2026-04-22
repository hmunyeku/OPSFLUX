import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FileText, Package, Plus, Loader2, MapPin, Pencil, Save,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DynamicPanelShell, PanelContentLayout, FormSection, FormGrid, DynamicPanelField,
  PanelActionButton, DetailFieldGrid, ReadOnlyRow, SectionColumns,
  panelInputClass, type ActionItem,
} from '@/components/layout/DynamicPanel'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { ProjectPicker } from '@/components/shared/ProjectPicker'
import { ImputationPicker } from '@/components/shared/ImputationPicker'
import { CompanyPicker } from '@/components/shared/CompanyPicker'
import { UserPicker } from '@/components/shared/UserPicker'
import { ContactPicker } from '@/components/shared/ContactPicker'
import { useToast } from '@/components/ui/Toast'
import { useUIStore } from '@/stores/uiStore'
import { useDictionaryOptions, useDictionaryLabels } from '@/hooks/useDictionary'
import {
  useCargoWorkspace,
  useCargoDictionaryCategory,
  useWorkspaceApplyCargoRequestLoadingOption,
  useWorkspaceCargo,
  useWorkspaceCargoRequest,
  useWorkspaceCargoRequestLoadingOptions,
  useWorkspaceCargoRequestLtPdf,
  useWorkspaceCargoRequests,
  useWorkspaceCreateCargo,
  useWorkspaceCreateCargoRequest,
  useWorkspaceUpdateCargoRequest,
} from '@/pages/packlog/packlogWorkspace'
import {
  buildPickupMapEmbedUrl,
  buildPickupMapUrl,
} from '@/pages/packlog/PackLogCargoDetailSections'
import type {
  CargoItemCreate,
  CargoRequestCreate, CargoRequestUpdate,
} from '@/types/api'

export function CreateCargoRequestPanel() {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const createCargoRequest = useWorkspaceCreateCargoRequest()
  const { toast } = useToast()
  const { t } = useTranslation()
  const { moduleLabel } = useCargoWorkspace()
  const [form, setForm] = useState<CargoRequestCreate>({
    title: '',
    description: null,
    project_id: null,
    imputation_reference_id: null,
    sender_tier_id: null,
    sender_contact_tier_contact_id: null,
    receiver_name: null,
    destination_asset_id: null,
    requester_user_id: null,
    requester_name: null,
  })
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createCargoRequest.mutateAsync(form)
      toast({ title: t('travelwiz.toast.shipment_request_created'), variant: 'success' })
      closeDynamicPanel()
    } catch {
      toast({ title: t('travelwiz.toast.shipment_request_creation_error'), variant: 'error' })
    }
  }

  const readinessChecklist = [
    { label: 'Intitulé métier de la demande', done: Boolean(form.title.trim()) },
    { label: 'Description opérationnelle', done: Boolean((form.description ?? '').trim()) },
    { label: 'Entreprise expéditrice', done: Boolean(form.sender_tier_id) },
    { label: 'Contact entreprise', done: Boolean(form.sender_contact_tier_contact_id) },
    { label: 'Destinataire', done: Boolean((form.receiver_name ?? '').trim()) },
    { label: 'Site de destination', done: Boolean(form.destination_asset_id) },
    { label: 'Imputation', done: Boolean(form.imputation_reference_id) },
    { label: 'Demandeur', done: Boolean(form.requester_user_id || (form.requester_name ?? '').trim()) },
  ]
  const readinessScore = Math.round((readinessChecklist.filter((item) => item.done).length / readinessChecklist.length) * 100)

  const createCargoRequestActions = useMemo<ActionItem[]>(() => [
    { id: 'cancel', label: 'Annuler', variant: 'default', priority: 40, onClick: closeDynamicPanel },
    { id: 'submit', label: 'Creer', variant: 'primary', priority: 100, loading: createCargoRequest.isPending, disabled: createCargoRequest.isPending, onClick: () => (document.getElementById('create-cargo-request-form') as HTMLFormElement)?.requestSubmit() },
  ], [closeDynamicPanel, createCargoRequest.isPending])

  return (
    <DynamicPanelShell
      title="Nouvelle demande d'expedition"
      subtitle={moduleLabel}
      icon={<FileText size={14} className="text-primary" />}
      actionItems={createCargoRequestActions}
    >
      <form id="create-cargo-request-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <div className="space-y-5">
            <div className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="gl-badge gl-badge-info">Brouillon</span>
                <span className={cn('gl-badge', readinessScore >= 100 ? 'gl-badge-success' : 'gl-badge-warning')}>
                  {readinessScore >= 100 ? 'Prête pour saisie colis' : 'Préparation dossier'}
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('common.reference')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Générée automatiquement à l'enregistrement</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('common.completeness')}</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{readinessScore}%</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('common.project')}</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{form.project_id ? 'Renseigné' : 'Optionnel'}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('common.requester')}</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{form.requester_user_id || form.requester_name ? 'Renseigné' : 'À préciser'}</p>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {readinessChecklist.map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-xs">
                    <span className={cn('inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]', item.done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                      {item.done ? '✓' : '•'}
                    </span>
                    <span className={item.done ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <FormSection title="Demande d'expédition">
              <FormGrid>
                <DynamicPanelField label={t('common.label_field')} required>
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className={panelInputClass}
                    placeholder="Demande d'expédition équipements forage"
                  />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.project')}>
                  <ProjectPicker
                    value={form.project_id ?? null}
                    onChange={(projectId) => setForm({ ...form, project_id: projectId ?? null })}
                    clearable
                    placeholder="Sélectionner un projet..."
                  />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.description')} span="full">
                  <textarea
                    value={form.description ?? ''}
                    onChange={(e) => setForm({ ...form, description: e.target.value || null })}
                    className={`${panelInputClass} min-h-[72px] resize-y`}
                    rows={3}
                  />
                </DynamicPanelField>
              </FormGrid>
            </FormSection>

            <FormSection title="Contexte logistique">
              <FormGrid>
                <DynamicPanelField label={t('common.imputation')}>
                  <ImputationPicker
                    value={form.imputation_reference_id ?? null}
                    onChange={(id) => setForm({ ...form, imputation_reference_id: id ?? null })}
                    placeholder="Sélectionner une imputation..."
                  />
                </DynamicPanelField>
                <DynamicPanelField label="Entreprise expéditrice">
                  <CompanyPicker
                    value={form.sender_tier_id ?? null}
                    onChange={(id) => setForm({ ...form, sender_tier_id: id ?? null, sender_contact_tier_contact_id: null })}
                    placeholder="Sélectionner une entreprise..."
                  />
                </DynamicPanelField>
                <DynamicPanelField label="Contact entreprise">
                  <ContactPicker
                    value={form.sender_contact_tier_contact_id ?? null}
                    onChange={(id) => setForm({ ...form, sender_contact_tier_contact_id: id ?? null })}
                    placeholder="Sélectionner un contact..."
                    tierId={form.sender_tier_id ?? null}
                  />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.recipient')}>
                  <input type="text" value={form.receiver_name ?? ''} onChange={(e) => setForm({ ...form, receiver_name: e.target.value || null })} className={panelInputClass} />
                </DynamicPanelField>
                <DynamicPanelField label="Installation de destination" span="full">
                  <AssetPicker
                    value={form.destination_asset_id ?? null}
                    onChange={(assetId) => setForm({ ...form, destination_asset_id: assetId ?? null })}
                    clearable
                    placeholder="Sélectionner l'installation de destination..."
                  />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.requester')}>
                  <UserPicker
                    value={form.requester_user_id ?? null}
                    onChange={(id) => setForm({ ...form, requester_user_id: id ?? null })}
                    placeholder="Sélectionner un utilisateur..."
                  />
                </DynamicPanelField>
                <DynamicPanelField label="Demandeur libre">
                  <input type="text" value={form.requester_name ?? ''} onChange={(e) => setForm({ ...form, requester_name: e.target.value || null })} className={panelInputClass} placeholder="Fallback si le demandeur n'existe pas dans le référentiel" />
                </DynamicPanelField>
              </FormGrid>
            </FormSection>
          </div>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

export function CreateCargoPanel() {
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { panelModule, moduleLabel } = useCargoWorkspace()
  const cargoTypeCategory = useCargoDictionaryCategory('cargo_type')
  const ownershipCategory = useCargoDictionaryCategory('cargo_ownership_type')
  const createCargo = useWorkspaceCreateCargo()
  const { data: cargoRequestsData } = useWorkspaceCargoRequests({ page: 1, page_size: 100 })
  const cargoTypeOptions = useDictionaryOptions(cargoTypeCategory)
  const ownershipOptions = useDictionaryOptions(ownershipCategory)
  const { toast } = useToast()
  const { t } = useTranslation()
  const [form, setForm] = useState<CargoItemCreate>({
    request_id: null,
    description: '',
    designation: '',
    cargo_type: 'unit',
    weight_kg: 0,
    width_cm: null,
    length_cm: null,
    height_cm: null,
    surface_m2: null,
    package_count: 1,
    stackable: false,
    sender_tier_id: null,
    receiver_name: null,
    destination_asset_id: null,
    project_id: null,
    imputation_reference_id: null,
    ownership_type: null,
    pickup_location_label: null,
    pickup_latitude: null,
    pickup_longitude: null,
    requester_name: null,
    document_prepared_at: null,
    available_from: null,
    pickup_contact_user_id: null,
    pickup_contact_tier_contact_id: null,
    pickup_contact_name: null,
    pickup_contact_phone: null,
    lifting_provider: null,
    lifting_points_certified: false,
    weight_ticket_provided: false,
    photo_evidence_count: 0,
    document_attachment_count: 0,
    manifest_id: null,
    sap_article_code: null,
    hazmat_validated: false,
  })
  const cargoRequests = cargoRequestsData?.items ?? []
  const preselectedRequestId = dynamicPanel?.module === panelModule && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'cargo'
    ? ((dynamicPanel.meta as { requestId?: string }).requestId ?? null)
    : null
  const selectedRequest = form.request_id
    ? cargoRequests.find((request) => request.id === form.request_id) ?? null
    : null
  const pickupMapUrl = buildPickupMapUrl(form.pickup_latitude, form.pickup_longitude)
  const pickupMapEmbedUrl = buildPickupMapEmbedUrl(form.pickup_latitude, form.pickup_longitude)

  useEffect(() => {
    if (preselectedRequestId) {
      setForm((current) => current.request_id === preselectedRequestId ? current : { ...current, request_id: preselectedRequestId })
    }
  }, [preselectedRequestId])

  useEffect(() => {
    if (!selectedRequest) return
    setForm((current) => ({
      ...current,
      sender_tier_id: selectedRequest.sender_tier_id ?? null,
      receiver_name: selectedRequest.receiver_name ?? null,
      destination_asset_id: selectedRequest.destination_asset_id ?? null,
      project_id: selectedRequest.project_id ?? null,
      imputation_reference_id: selectedRequest.imputation_reference_id ?? null,
      requester_name: selectedRequest.requester_display_name ?? selectedRequest.requester_name ?? current.requester_name ?? null,
    }))
  }, [selectedRequest])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.request_id) {
      toast({ title: t('travelwiz.toast.select_request_first'), variant: 'error' })
      return
    }
    try {
      const createdCargo = await createCargo.mutateAsync(form)
      toast({ title: t('travelwiz.toast.parcel_created'), description: t('travelwiz.toast.parcel_created_description'), variant: 'success' })
      openDynamicPanel({ type: 'detail', module: panelModule, id: createdCargo.id, meta: { subtype: 'cargo' } })
    } catch { toast({ title: t('travelwiz.toast.parcel_creation_error'), variant: 'error' }) }
  }

  const createCargoActions = useMemo<ActionItem[]>(() => [
    { id: 'cancel', label: 'Annuler', variant: 'default', priority: 40, onClick: closeDynamicPanel },
    { id: 'submit', label: 'Creer', variant: 'primary', priority: 100, loading: createCargo.isPending, disabled: createCargo.isPending, onClick: () => (document.getElementById('create-cargo-form') as HTMLFormElement)?.requestSubmit() },
  ], [closeDynamicPanel, createCargo.isPending])

  return (
    <DynamicPanelShell title="Nouveau colis" subtitle={moduleLabel} icon={<Package size={14} className="text-primary" />}
      actionItems={createCargoActions}
    >
      <form id="create-cargo-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <SectionColumns>
            <div className="@container space-y-5">
              <FormSection title={t('common.identification')}>
            <FormGrid>
              <DynamicPanelField label="Demande d'expédition">
                <select
                  value={form.request_id ?? ''}
                  onChange={(e) => setForm({ ...form, request_id: e.target.value || null })}
                  className={panelInputClass}
                  disabled={!!preselectedRequestId}
                >
                  <option value="">{preselectedRequestId ? 'Demande parente imposée' : 'Aucune demande parente'}</option>
                  {cargoRequests.map((request) => (
                    <option key={request.id} value={request.id}>{request.request_code} — {request.title}</option>
                  ))}
                </select>
                {selectedRequest && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Ce colis sera créé dans la demande ` {selectedRequest.request_code} `.
                  </p>
                )}
              </DynamicPanelField>
              <DynamicPanelField label={t('common.reference')}>
                <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Générée automatiquement par la numérotation TravelWiz à l'enregistrement du colis.
                </div>
              </DynamicPanelField>
              <DynamicPanelField label="Type de colis" required>
                <select value={form.cargo_type} onChange={(e) => setForm({ ...form, cargo_type: e.target.value })} className={panelInputClass}>
                  {cargoTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label="Désignation">
                <input type="text" value={form.designation ?? ''} onChange={(e) => setForm({ ...form, designation: e.target.value || null })} className={panelInputClass} placeholder="Désignation courte du colis" />
              </DynamicPanelField>
              <DynamicPanelField label="Article SAP">
                <input type="text" value={form.sap_article_code ?? ''} onChange={(e) => setForm({ ...form, sap_article_code: e.target.value || null })} className={panelInputClass} placeholder="MAT-00001" />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.description')} required span="full">
                <textarea
                  required
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className={`${panelInputClass} min-h-[60px] resize-y`}
                  placeholder="Description opérationnelle du colis, de l'unité ou du lot..."
                  rows={3}
                />
              </DynamicPanelField>
            </FormGrid>
            {selectedRequest && (
              <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="gl-badge gl-badge-info">Hérité de la demande</span>
                  <span className="text-xs font-medium text-foreground">{selectedRequest.request_code} — {selectedRequest.title}</span>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('common.project')}</p>
                    <p className="mt-1 text-sm text-foreground">{selectedRequest.project_id ? 'Renseigné' : '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('common.imputation')}</p>
                    <p className="mt-1 text-sm text-foreground">{selectedRequest.imputation_reference_name ?? selectedRequest.imputation_reference_code ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('common.destination')}</p>
                    <p className="mt-1 text-sm text-foreground">{selectedRequest.destination_name ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('common.requester')}</p>
                    <p className="mt-1 text-sm text-foreground">{selectedRequest.requester_display_name ?? selectedRequest.requester_name ?? '—'}</p>
                  </div>
                </div>
              </div>
            )}
              </FormSection>
              <FormSection title="Préparation logistique" collapsible defaultExpanded>
            <FormGrid>
              <DynamicPanelField label="Propriété du matériel">
                <select value={form.ownership_type ?? ''} onChange={(e) => setForm({ ...form, ownership_type: e.target.value || null })} className={panelInputClass}>
                  <option value="">Sélectionner...</option>
                  {ownershipOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label="Document préparé le">
                <input type="datetime-local" value={form.document_prepared_at ?? ''} onChange={(e) => setForm({ ...form, document_prepared_at: e.target.value || null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Mise à disposition">
                <input type="datetime-local" value={form.available_from ?? ''} onChange={(e) => setForm({ ...form, available_from: e.target.value || null })} className={panelInputClass} />
              </DynamicPanelField>
            </FormGrid>
              </FormSection>
            </div>
            <div className="@container space-y-5">
              <FormSection title={t('common.dimensions')}>
            <FormGrid>
              <DynamicPanelField label="Poids (kg)" required>
                <input type="number" min={0.001} step="any" required value={form.weight_kg || ''} onChange={(e) => setForm({ ...form, weight_kg: e.target.value ? Number(e.target.value) : 0 })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Largeur (cm)">
                <input type="number" min={0} step="any" value={form.width_cm ?? ''} onChange={(e) => setForm({ ...form, width_cm: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Longueur (cm)">
                <input type="number" min={0} step="any" value={form.length_cm ?? ''} onChange={(e) => setForm({ ...form, length_cm: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Hauteur (cm)">
                <input type="number" min={0} step="any" value={form.height_cm ?? ''} onChange={(e) => setForm({ ...form, height_cm: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Surface totale (m²)">
                <input type="number" min={0} step="any" value={form.surface_m2 ?? ''} onChange={(e) => setForm({ ...form, surface_m2: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Nombre de colis">
                <input type="number" min={1} step={1} value={form.package_count ?? 1} onChange={(e) => setForm({ ...form, package_count: e.target.value ? Number(e.target.value) : 1 })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Empilable">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={form.stackable ?? false} onChange={(e) => setForm({ ...form, stackable: e.target.checked })} />
                  Oui, ce colis peut être empilé
                </label>
              </DynamicPanelField>
            </FormGrid>
            <p className="text-xs text-muted-foreground">
              Les dimensions physiques sont utilisées pour raisonner la place occupée et préparer le placement pont, pas seulement un volume libre saisi à la main.
            </p>
              </FormSection>
              <FormSection title="Conformité colis" collapsible defaultExpanded>
            <FormGrid>
              <DynamicPanelField label="Validation HAZMAT">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={form.hazmat_validated ?? false} onChange={(e) => setForm({ ...form, hazmat_validated: e.target.checked })} />
                  Conforme / validé pour traitement HAZMAT
                </label>
              </DynamicPanelField>
            </FormGrid>
              </FormSection>
              <FormSection title="Enlèvement et preuves" collapsible defaultExpanded>
            <FormGrid>
              <DynamicPanelField label="Lieu d'enlèvement" span="full">
                <input type="text" value={form.pickup_location_label ?? ''} onChange={(e) => setForm({ ...form, pickup_location_label: e.target.value || null })} className={panelInputClass} placeholder="Base, quai, magasin, yard..." />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.latitude')}>
                <input type="number" step="any" value={form.pickup_latitude ?? ''} onChange={(e) => setForm({ ...form, pickup_latitude: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.longitude')}>
                <input type="number" step="any" value={form.pickup_longitude ?? ''} onChange={(e) => setForm({ ...form, pickup_longitude: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Aperçu cartographique" span="full">
                {pickupMapEmbedUrl ? (
                  <div className="space-y-2">
                    <div className="overflow-hidden rounded-lg border border-border">
                      <iframe
                        title="Pickup map preview"
                        src={pickupMapEmbedUrl}
                        className="h-48 w-full bg-muted"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    </div>
                    {pickupMapUrl && (
                      <a
                        href={pickupMapUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-xs text-foreground hover:text-primary"
                      >
                        <MapPin size={12} />
                        Ouvrir la localisation sur la carte
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Renseigne latitude et longitude pour visualiser le point de pickup sur la carte.</p>
                )}
              </DynamicPanelField>
              <DynamicPanelField label="Contact utilisateur">
                <UserPicker
                  value={form.pickup_contact_user_id ?? null}
                  onChange={(id) => setForm({ ...form, pickup_contact_user_id: id ?? null })}
                  placeholder="Sélectionner un utilisateur..."
                />
              </DynamicPanelField>
              <DynamicPanelField label="Contact entreprise">
                <ContactPicker
                  value={form.pickup_contact_tier_contact_id ?? null}
                  onChange={(id) => setForm({ ...form, pickup_contact_tier_contact_id: id ?? null })}
                  placeholder="Sélectionner un contact..."
                  tierId={form.sender_tier_id ?? null}
                />
              </DynamicPanelField>
              <DynamicPanelField label="Nom libre du contact">
                <input type="text" value={form.pickup_contact_name ?? ''} onChange={(e) => setForm({ ...form, pickup_contact_name: e.target.value || null })} className={panelInputClass} placeholder="Fallback si hors référentiel" />
              </DynamicPanelField>
              <DynamicPanelField label="Téléphone contact">
                <input type="text" value={form.pickup_contact_phone ?? ''} onChange={(e) => setForm({ ...form, pickup_contact_phone: e.target.value || null })} className={panelInputClass} placeholder="+237..." />
              </DynamicPanelField>
              <DynamicPanelField label="Moyen de levage fourni par">
                <input type="text" value={form.lifting_provider ?? ''} onChange={(e) => setForm({ ...form, lifting_provider: e.target.value || null })} className={panelInputClass} placeholder="Entreprise, site, prestataire..." />
              </DynamicPanelField>
              <DynamicPanelField label="Oreilles de levage certifiées">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={form.lifting_points_certified ?? false} onChange={(e) => setForm({ ...form, lifting_points_certified: e.target.checked })} />
                  Certification fournie
                </label>
              </DynamicPanelField>
              <DynamicPanelField label="Preuve de pesée">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={form.weight_ticket_provided ?? false} onChange={(e) => setForm({ ...form, weight_ticket_provided: e.target.checked })} />
                  Ticket de pesée disponible
                </label>
              </DynamicPanelField>
              <DynamicPanelField label="Photos et documents" span="full">
                <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Les fichiers joints, photos terrain et preuves documentaires se gèrent après création du colis via l'onglet fichiers du détail colis.
                </div>
              </DynamicPanelField>
            </FormGrid>
              </FormSection>
            </div>
          </SectionColumns>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

export function CargoRequestDetailPanel({ id }: { id: string }) {
  const { panelModule } = useCargoWorkspace()
  const cargoRequestStatusCategory = useCargoDictionaryCategory('cargo_request_status')
  const { data: cargoRequest, isLoading } = useWorkspaceCargoRequest(id)
  const { data: requestCargoData } = useWorkspaceCargo({ page: 1, page_size: 100, request_id: id })
  const { data: loadingOptions } = useWorkspaceCargoRequestLoadingOptions(id)
  const downloadCargoRequestLtPdf = useWorkspaceCargoRequestLtPdf()
  const updateCargoRequest = useWorkspaceUpdateCargoRequest()
  const applyLoadingOption = useWorkspaceApplyCargoRequestLoadingOption()
  const requestStatusOptions = useDictionaryOptions(cargoRequestStatusCategory)
  const requestStatusLabels = useDictionaryLabels(cargoRequestStatusCategory)
  const { toast } = useToast()
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<CargoRequestUpdate>({})
  const requestCargo = requestCargoData?.items ?? []
  const missingRequirements = cargoRequest?.missing_requirements ?? []
  const totalWeightKg = requestCargo.reduce((sum, cargo) => sum + Number(cargo.weight_kg || 0), 0)
  const totalPackages = requestCargo.reduce((sum, cargo) => sum + Number(cargo.package_count || 0), 0)
  const deliveredCount = requestCargo.filter((cargo) => cargo.status === 'delivered_final').length
  const inTransitCount = requestCargo.filter((cargo) => cargo.status === 'in_transit').length
  const blockedCount = requestCargo.filter((cargo) => ['damaged', 'missing'].includes(cargo.status)).length
  const assignedCount = requestCargo.filter((cargo) => Boolean(cargo.manifest_id)).length
  const requestStatusBadges: Record<string, string> = {
    draft: 'gl-badge-neutral',
    submitted: 'gl-badge-warning',
    approved: 'gl-badge-info',
    assigned: 'gl-badge-info',
    in_progress: 'gl-badge-info',
    closed: 'gl-badge-success',
    cancelled: 'gl-badge-danger',
  }
  const completionRatio = Math.max(
    0,
    Math.min(
      100,
      cargoRequest?.is_ready_for_submission
        ? 100
        : Math.round(((Math.max(7 - missingRequirements.length, 0)) / 7) * 100),
    ),
  )

  const startEdit = useCallback(() => {
    if (!cargoRequest) return
    setEditForm({
      title: cargoRequest.title,
      description: cargoRequest.description,
      status: cargoRequest.status,
      project_id: cargoRequest.project_id,
      imputation_reference_id: cargoRequest.imputation_reference_id,
      sender_tier_id: cargoRequest.sender_tier_id,
      sender_contact_tier_contact_id: cargoRequest.sender_contact_tier_contact_id,
      receiver_name: cargoRequest.receiver_name,
      destination_asset_id: cargoRequest.destination_asset_id,
      requester_user_id: cargoRequest.requester_user_id,
      requester_name: cargoRequest.requester_name,
    })
    setEditing(true)
  }, [cargoRequest])

  const handleSave = async () => {
    try {
      await updateCargoRequest.mutateAsync({ id, payload: editForm })
      toast({ title: t('travelwiz.toast.request_updated'), variant: 'success' })
      setEditing(false)
    } catch (error) {
      const missing = Array.isArray((error as { response?: { data?: { detail?: { missing_requirements?: string[] } } } })?.response?.data?.detail?.missing_requirements)
        ? ((error as { response?: { data?: { detail?: { missing_requirements?: string[] } } } }).response?.data?.detail?.missing_requirements ?? [])
        : []
      const requirementLabels: Record<string, string> = {
        title: 'Intitulé de la demande',
        description: 'Description de la demande',
        sender_tier_id: 'Expéditeur',
        sender_contact_tier_contact_id: 'Contact entreprise',
        receiver_name: 'Destinataire',
        destination_asset_id: 'Installation de destination',
        imputation_reference_id: 'Imputation',
        requester: 'Demandeur',
        cargo_items: 'Au moins un colis rattaché',
      }
      toast({
        title: missing.length > 0
          ? `${t('travelwiz.toast.request_incomplete')}: ${missing.map((item) => requirementLabels[item] ?? item).join(', ')}`
          : t('travelwiz.toast.request_update_error'),
        variant: 'error',
      })
    }
  }

  const handleApplyLoadingOption = async (voyageId: string) => {
    try {
      await applyLoadingOption.mutateAsync({ id, voyageId })
      toast({ title: t('travelwiz.toast.loading_applied'), variant: 'success' })
    } catch (error) {
      const blockingReasons = Array.isArray((error as { response?: { data?: { detail?: { blocking_reasons?: string[] } } } })?.response?.data?.detail?.blocking_reasons)
        ? ((error as { response?: { data?: { detail?: { blocking_reasons?: string[] } } } }).response?.data?.detail?.blocking_reasons ?? [])
        : []
      const reasonLabels: Record<string, string> = {
        destination_mismatch: 'destination non desservie par le voyage',
        manifest_not_draft: 'manifeste cargo non modifiable',
        insufficient_weight_capacity: 'capacité poids insuffisante',
        no_zone_capacity_match: 'aucune zone compatible',
      }
      toast({
        title: blockingReasons.length > 0
          ? `${t('travelwiz.toast.loading_impossible')}: ${blockingReasons.map((item) => reasonLabels[item] ?? item).join(', ')}`
          : t('travelwiz.toast.voyage_assignment_error'),
        variant: 'error',
      })
    }
  }

  const handlePrintLt = async () => {
    try {
      await downloadCargoRequestLtPdf.mutateAsync(id)
    } catch {
      toast({ title: t('travelwiz.toast.lt_print_error'), description: t('travelwiz.toast.check_cargo_lt_pdf'), variant: 'error' })
    }
  }

  if (isLoading || !cargoRequest) {
    return (
      <DynamicPanelShell title="Chargement..." icon={<FileText size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={cargoRequest.request_code}
      subtitle={cargoRequest.title}
      icon={<FileText size={14} className="text-primary" />}
      actions={
        <>
          {!editing && (
            <PanelActionButton
              variant="primary"
              onClick={() => useUIStore.getState().openDynamicPanel({
                type: 'create',
                module: panelModule,
                meta: { subtype: 'cargo', requestId: id, requestTitle: cargoRequest.title, requestCode: cargoRequest.request_code },
              })}
              icon={<Plus size={12} />}
            >
              Ajouter un colis
            </PanelActionButton>
          )}
          {!editing && <PanelActionButton onClick={handlePrintLt} disabled={downloadCargoRequestLtPdf.isPending} icon={<FileText size={12} />}>Imprimer LT</PanelActionButton>}
          {!editing && <PanelActionButton onClick={startEdit} icon={<Pencil size={12} />}>{t('common.edit')}</PanelActionButton>}
          {editing && (
            <>
              <PanelActionButton onClick={() => setEditing(false)}>{t('common.cancel')}</PanelActionButton>
              <PanelActionButton variant="primary" onClick={handleSave} disabled={updateCargoRequest.isPending} icon={<Save size={12} />}>
                {updateCargoRequest.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Enregistrer'}
              </PanelActionButton>
            </>
          )}
        </>
      }
    >
      <PanelContentLayout>
        {editing ? (
          <FormSection title="Demande d'expédition">
            <FormGrid>
              <DynamicPanelField label={t('common.label_field')}>
                <input type="text" value={editForm.title ?? ''} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Statut">
                <select value={editForm.status ?? ''} onChange={(e) => setEditForm({ ...editForm, status: (e.target.value || null) as CargoRequestUpdate['status'] })} className={panelInputClass}>
                  <option value="">Sélectionner...</option>
                  {requestStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label={t('common.description')} span="full">
                <textarea value={editForm.description ?? ''} onChange={(e) => setEditForm({ ...editForm, description: e.target.value || null })} className={`${panelInputClass} min-h-[72px] resize-y`} rows={3} />
              </DynamicPanelField>
              <DynamicPanelField label="Entreprise expéditrice">
                <CompanyPicker
                  value={editForm.sender_tier_id ?? null}
                  onChange={(id) => setEditForm({ ...editForm, sender_tier_id: id ?? null, sender_contact_tier_contact_id: null })}
                  placeholder="Sélectionner une entreprise..."
                />
              </DynamicPanelField>
              <DynamicPanelField label="Contact entreprise">
                <ContactPicker
                  value={editForm.sender_contact_tier_contact_id ?? null}
                  onChange={(id) => setEditForm({ ...editForm, sender_contact_tier_contact_id: id ?? null })}
                  placeholder="Sélectionner un contact..."
                  tierId={editForm.sender_tier_id ?? null}
                />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.recipient')}>
                <input type="text" value={editForm.receiver_name ?? ''} onChange={(e) => setEditForm({ ...editForm, receiver_name: e.target.value || null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.imputation')}>
                <ImputationPicker
                  value={editForm.imputation_reference_id ?? null}
                  onChange={(id) => setEditForm({ ...editForm, imputation_reference_id: id ?? null })}
                  placeholder="Sélectionner une imputation..."
                />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.requester')}>
                <UserPicker
                  value={editForm.requester_user_id ?? null}
                  onChange={(id) => setEditForm({ ...editForm, requester_user_id: id ?? null })}
                  placeholder="Sélectionner un utilisateur..."
                />
              </DynamicPanelField>
              <DynamicPanelField label="Demandeur libre">
                <input type="text" value={editForm.requester_name ?? ''} onChange={(e) => setEditForm({ ...editForm, requester_name: e.target.value || null })} className={panelInputClass} placeholder="Fallback si le demandeur n'existe pas dans le référentiel" />
              </DynamicPanelField>
              <DynamicPanelField label="Installation de destination" span="full">
                <AssetPicker
                  value={editForm.destination_asset_id ?? null}
                  onChange={(assetId) => setEditForm({ ...editForm, destination_asset_id: assetId ?? null })}
                  clearable
                  placeholder="Sélectionner l'installation de destination..."
                />
              </DynamicPanelField>
              <DynamicPanelField label={t('common.project')} span="full">
                <ProjectPicker
                  value={editForm.project_id ?? null}
                  onChange={(projectId) => setEditForm({ ...editForm, project_id: projectId ?? null })}
                  clearable
                  placeholder="Sélectionner un projet..."
                />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
        ) : (
          <>
            <div className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('gl-badge', requestStatusBadges[cargoRequest.status] ?? 'gl-badge-neutral')}>
                  {requestStatusLabels[cargoRequest.status] ?? cargoRequest.status}
                </span>
                <span className={cn('gl-badge', cargoRequest.is_ready_for_submission ? 'gl-badge-success' : 'gl-badge-warning')}>
                  {cargoRequest.is_ready_for_submission ? 'Prête à soumettre' : 'À compléter'}
                </span>
                {loadingOptions?.length ? <span className="gl-badge gl-badge-info">{loadingOptions.length} option(s) de chargement</span> : null}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Demande d'expédition</p>
                <h3 className="mt-1 text-lg font-semibold text-foreground">{cargoRequest.request_code}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{cargoRequest.title}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('common.completeness')}</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{completionRatio}%</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('common.packages')}</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{requestCargo.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{totalPackages.toLocaleString('fr-FR')} packages</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Poids total</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{totalWeightKg.toLocaleString('fr-FR')} kg</p>
                  <p className="mt-1 text-xs text-muted-foreground">{assignedCount} affectés à un manifeste</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('common.tracking_label')}</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{deliveredCount} livrés · {inTransitCount} en transit</p>
                  <p className="mt-1 text-xs text-muted-foreground">{blockedCount} colis bloqués</p>
                </div>
              </div>
            </div>

            <FormSection title="Lecture opérationnelle" collapsible defaultExpanded>
              <div className="space-y-2">
                {[
                  { label: 'Intitulé de la demande', done: Boolean(cargoRequest.title?.trim()) },
                  { label: 'Description de la demande', done: Boolean(cargoRequest.description?.trim()) },
                  { label: 'Entreprise expéditrice', done: Boolean(cargoRequest.sender_tier_id) },
                  { label: 'Contact entreprise', done: Boolean(cargoRequest.sender_contact_tier_contact_id) },
                  { label: 'Destinataire', done: Boolean(cargoRequest.receiver_name?.trim()) },
                  { label: 'Installation de destination', done: Boolean(cargoRequest.destination_asset_id) },
                  { label: 'Imputation', done: Boolean(cargoRequest.imputation_reference_id) },
                  { label: 'Demandeur', done: Boolean(cargoRequest.requester_user_id || cargoRequest.requester_name?.trim()) },
                  { label: 'Au moins un colis rattaché', done: requestCargo.length > 0 },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-xs">
                    <span className={cn('inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]', item.done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                      {item.done ? '✓' : '•'}
                    </span>
                    <span className={item.done ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
                  </div>
                ))}
              </div>
            </FormSection>

            <FormSection title="Demande d'expédition">
              <DetailFieldGrid>
                <ReadOnlyRow label={t('common.code_field')} value={cargoRequest.request_code} />
                <ReadOnlyRow label={t('common.label_field')} value={cargoRequest.title} />
                <ReadOnlyRow label={t('common.status')} value={requestStatusLabels[cargoRequest.status] ?? cargoRequest.status} />
                <ReadOnlyRow label={t('common.description')} value={cargoRequest.description ?? '—'} />
                <ReadOnlyRow label="Entreprise expéditrice" value={cargoRequest.sender_name ?? '—'} />
                <ReadOnlyRow label="Contact entreprise" value={cargoRequest.sender_contact_name ?? '—'} />
                <ReadOnlyRow label={t('common.recipient')} value={cargoRequest.receiver_name ?? '—'} />
                <ReadOnlyRow label={t('common.destination')} value={cargoRequest.destination_name ?? '—'} />
                <ReadOnlyRow label={t('common.imputation')} value={cargoRequest.imputation_reference_name ? `${cargoRequest.imputation_reference_code ?? ''} ${cargoRequest.imputation_reference_name}`.trim() : '—'} />
                <ReadOnlyRow label={t('common.requester')} value={cargoRequest.requester_display_name ?? cargoRequest.requester_name ?? '—'} />
                <ReadOnlyRow label={t('common.package_count')} value={String(cargoRequest.cargo_count ?? 0)} />
                <ReadOnlyRow label={t('common.created_at_female')} value={new Date(cargoRequest.created_at).toLocaleString('fr-FR')} />
              </DetailFieldGrid>
            </FormSection>

            <FormSection title="Complétude de la demande" collapsible defaultExpanded>
              <div className="space-y-3">
                <div className={`rounded-lg border px-3 py-2 text-xs ${cargoRequest.is_ready_for_submission ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                  {cargoRequest.is_ready_for_submission
                    ? 'La demande est prête pour soumission.'
                    : "La demande n'est pas encore prête pour soumission."}
                </div>
                {missingRequirements.length > 0 ? (
                  <div className="space-y-1">
                    {missingRequirements.map((item) => (
                      <div key={item} className="rounded-lg border border-border/60 bg-card px-3 py-2 text-xs text-muted-foreground">
                        {{
                          title: 'Intitulé de la demande',
                          description: 'Description de la demande',
                          sender_tier_id: 'Expéditeur',
                          receiver_name: 'Destinataire',
                          destination_asset_id: 'Installation de destination',
                          imputation_reference_id: 'Imputation',
                          requester: 'Demandeur',
                          cargo_items: 'Au moins un colis rattaché',
                        }[item] ?? item}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Aucun manque bloquant détecté.</p>
                )}
              </div>
            </FormSection>

            <FormSection title={`Colis rattachés (${requestCargo.length})`} collapsible defaultExpanded>
              {requestCargo.length > 0 ? (
                <div className="space-y-2">
                  {requestCargo.map((cargo) => (
                    <button
                      key={cargo.id}
                      onClick={() => useUIStore.getState().openDynamicPanel({ type: 'detail', module: panelModule, id: cargo.id, meta: { subtype: 'cargo' } })}
                      className="w-full rounded-lg border border-border/60 bg-card px-3 py-2 text-left hover:bg-muted/40"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-mono text-muted-foreground">{cargo.code}</p>
                          <p className="text-sm font-medium text-foreground truncate">{cargo.designation || cargo.description}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">{cargo.weight_kg.toLocaleString('fr-FR')} kg</p>
                          <p className="text-[11px] text-muted-foreground">{cargo.status}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">Aucun colis rattaché à cette demande.</p>
                  <PanelActionButton
                    variant="primary"
                    onClick={() => useUIStore.getState().openDynamicPanel({
                      type: 'create',
                      module: panelModule,
                      meta: { subtype: 'cargo', requestId: id, requestTitle: cargoRequest.title, requestCode: cargoRequest.request_code },
                    })}
                    icon={<Plus size={12} />}
                  >
                    Ajouter le premier colis
                  </PanelActionButton>
                </div>
              )}
            </FormSection>

            <FormSection title="Propositions de chargement" collapsible defaultExpanded>
              {(loadingOptions ?? []).length > 0 ? (
                <div className="space-y-2">
                  {loadingOptions!.map((option) => (
                    <div key={option.voyage_id} className="rounded-lg border border-border/60 bg-card px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{option.voyage_code}</p>
                          <p className="text-xs text-muted-foreground">
                            {option.vector_name ?? 'Vecteur'} · départ {new Date(option.scheduled_departure).toLocaleString('fr-FR')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Base: {option.departure_base_name ?? '—'} · reste {option.remaining_weight_kg != null ? `${option.remaining_weight_kg.toLocaleString('fr-FR')} kg` : 'poids non borné'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Demande: {option.total_request_weight_kg.toLocaleString('fr-FR')} kg · destination {option.destination_match ? 'compatible' : 'non compatible'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Surface estimée: {option.total_request_surface_m2.toLocaleString('fr-FR')} m² · {option.all_items_stackable ? 'empilable' : 'non empilable'}
                          </p>
                          {option.compatible_zones.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {option.compatible_zones.map((zone) => (
                                <span key={zone.zone_id} className="gl-badge gl-badge-neutral">
                                  {zone.zone_name}
                                  {zone.surface_m2 != null ? ` · ${zone.surface_m2.toLocaleString('fr-FR')} m²` : ''}
                                </span>
                              ))}
                            </div>
                          )}
                          {option.blocking_reasons.length > 0 && (
                            <p className="mt-1 text-xs text-amber-700">
                              Blocages: {option.blocking_reasons.map((item) => ({
                                destination_mismatch: 'destination non desservie',
                                manifest_not_draft: 'manifeste non draft',
                                insufficient_weight_capacity: 'capacité poids insuffisante',
                                no_zone_capacity_match: 'aucune zone compatible',
                              }[item] ?? item)).join(', ')}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={cn('gl-badge', option.can_load ? 'gl-badge-success' : 'gl-badge-warning')}>
                            {option.can_load ? 'Chargeable' : 'Bloqué'}
                          </span>
                          <PanelActionButton
                            variant="primary"
                            onClick={() => handleApplyLoadingOption(option.voyage_id)}
                            disabled={!option.can_load || applyLoadingOption.isPending || cargoRequest.status !== 'approved'}
                          >
                            {applyLoadingOption.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Affecter'}
                          </PanelActionButton>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Aucune proposition de chargement disponible pour le moment.</p>
              )}
            </FormSection>
          </>
        )}
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}
