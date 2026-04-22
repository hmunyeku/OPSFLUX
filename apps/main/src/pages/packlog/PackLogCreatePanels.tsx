import { useEffect, useState } from 'react'
import { FileText, Loader2, MapPin, Package } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import {
  DynamicPanelShell,
  PanelContentLayout,
  FormSection,
  FormGrid,
  DynamicPanelField,
  PanelActionButton,
  SectionColumns,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { ProjectPicker } from '@/components/shared/ProjectPicker'
import { ImputationPicker } from '@/components/shared/ImputationPicker'
import { CompanyPicker } from '@/components/shared/CompanyPicker'
import { UserPicker } from '@/components/shared/UserPicker'
import { ContactPicker } from '@/components/shared/ContactPicker'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import {
  useCargoWorkspace,
  useCargoDictionaryCategory,
  useWorkspaceCreateCargo,
  useWorkspaceCreateCargoRequest,
  useWorkspaceCargoRequests,
} from '@/pages/packlog/packlogWorkspace'
import type { CargoItemCreate, CargoRequestCreate } from '@/types/api'

function buildPickupMapUrl(latitude: number | null | undefined, longitude: number | null | undefined) {
  if (latitude == null || longitude == null) return null
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`
}

function buildPickupMapEmbedUrl(latitude: number | null | undefined, longitude: number | null | undefined) {
  if (latitude == null || longitude == null) return null
  const delta = 0.008
  const bbox = [
    longitude - delta,
    latitude - delta,
    longitude + delta,
    latitude + delta,
  ].join('%2C')
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude}%2C${longitude}`
}

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
      toast({ title: t('packlog.toast.request_created'), variant: 'success' })
      closeDynamicPanel()
    } catch {
      toast({ title: t('packlog.toast.request_create_error'), variant: 'error' })
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

  return (
    <DynamicPanelShell
      title="Nouvelle demande d’expédition"
      subtitle={moduleLabel}
      icon={<FileText size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createCargoRequest.isPending}
            onClick={() => (document.getElementById('create-cargo-request-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createCargoRequest.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Créer'}
          </PanelActionButton>
        </>
      }
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
                  <p className="mt-1 text-xs text-muted-foreground">Générée automatiquement à l’enregistrement</p>
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

            <FormSection title="Demande d’expédition">
              <FormGrid>
                <DynamicPanelField label={t('common.label_field')} required>
                  <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={panelInputClass} placeholder={t('packlog.placeholders.request_title_example')} />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.project')}>
                  <ProjectPicker value={form.project_id ?? null} onChange={(projectId) => setForm({ ...form, project_id: projectId ?? null })} clearable placeholder={t('packlog.placeholders.select_project')} />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.description')} span="full">
                  <textarea value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value || null })} className={`${panelInputClass} min-h-[72px] resize-y`} rows={3} />
                </DynamicPanelField>
              </FormGrid>
            </FormSection>

            <FormSection title={t('common.logistics_context')}>
              <FormGrid>
                <DynamicPanelField label={t('common.imputation')}>
                  <ImputationPicker value={form.imputation_reference_id ?? null} onChange={(id) => setForm({ ...form, imputation_reference_id: id ?? null })} placeholder={t('packlog.placeholders.select_imputation')} />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.sender_company')}>
                  <CompanyPicker value={form.sender_tier_id ?? null} onChange={(id) => setForm({ ...form, sender_tier_id: id ?? null, sender_contact_tier_contact_id: null })} placeholder={t('packlog.placeholders.select_company')} />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.company_contact')}>
                  <ContactPicker value={form.sender_contact_tier_contact_id ?? null} onChange={(id) => setForm({ ...form, sender_contact_tier_contact_id: id ?? null })} placeholder={t('packlog.placeholders.select_contact')} tierId={form.sender_tier_id ?? null} />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.recipient')}>
                  <input type="text" value={form.receiver_name ?? ''} onChange={(e) => setForm({ ...form, receiver_name: e.target.value || null })} className={panelInputClass} />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.destination_installation')} span="full">
                  <AssetPicker value={form.destination_asset_id ?? null} onChange={(assetId) => setForm({ ...form, destination_asset_id: assetId ?? null })} clearable placeholder={t('packlog.placeholders.select_destination_asset')} />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.requester')}>
                  <UserPicker value={form.requester_user_id ?? null} onChange={(id) => setForm({ ...form, requester_user_id: id ?? null })} placeholder={t('packlog.placeholders.select_user')} />
                </DynamicPanelField>
                <DynamicPanelField label={t('common.free_requester')}>
                  <input type="text" value={form.requester_name ?? ''} onChange={(e) => setForm({ ...form, requester_name: e.target.value || null })} className={panelInputClass} placeholder={t('packlog.placeholders.requester_fallback')} />
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
    is_reusable: false,
    expected_return_date: null as string | null,
    parent_cargo_id: null as string | null,
  })
  const cargoRequests = cargoRequestsData?.items ?? []
  const preselectedRequestId =
    dynamicPanel?.module === panelModule && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'cargo'
      ? ((dynamicPanel.meta as { requestId?: string }).requestId ?? null)
      : null
  const selectedRequest = form.request_id ? cargoRequests.find((request) => request.id === form.request_id) ?? null : null
  const pickupMapUrl = buildPickupMapUrl(form.pickup_latitude, form.pickup_longitude)
  const pickupMapEmbedUrl = buildPickupMapEmbedUrl(form.pickup_latitude, form.pickup_longitude)

  useEffect(() => {
    if (preselectedRequestId) {
      setForm((current) => (current.request_id === preselectedRequestId ? current : { ...current, request_id: preselectedRequestId }))
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
      toast({ title: t('packlog.toast.select_request_first'), variant: 'error' })
      return
    }
    try {
      const createdCargo = await createCargo.mutateAsync(form)
      toast({ title: t('packlog.toast.cargo_created'), description: t('packlog.toast.cargo_created_description'), variant: 'success' })
      openDynamicPanel({ type: 'detail', module: panelModule, id: createdCargo.id, meta: { subtype: 'cargo' } })
    } catch {
      toast({ title: t('packlog.toast.cargo_create_error'), variant: 'error' })
    }
  }

  return (
    <DynamicPanelShell
      title="Nouveau colis"
      subtitle={moduleLabel}
      icon={<Package size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton variant="primary" disabled={createCargo.isPending} onClick={() => (document.getElementById('create-cargo-form') as HTMLFormElement)?.requestSubmit()}>
            {createCargo.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Créer'}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-cargo-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <SectionColumns>
            <div className="@container space-y-5">
              <FormSection title={t('common.identification')}>
                <FormGrid>
                  <DynamicPanelField label="Demande d’expédition">
                    <select value={form.request_id ?? ''} onChange={(e) => setForm({ ...form, request_id: e.target.value || null })} className={panelInputClass} disabled={!!preselectedRequestId}>
                      <option value="">{preselectedRequestId ? 'Demande parente imposée' : 'Aucune demande parente'}</option>
                      {cargoRequests.map((request) => (
                        <option key={request.id} value={request.id}>{request.request_code} — {request.title}</option>
                      ))}
                    </select>
                    {selectedRequest && <p className="mt-1 text-[11px] text-muted-foreground">Ce colis sera créé dans la demande ` {selectedRequest.request_code} `.</p>}
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.reference')}>
                    <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      Générée automatiquement par la numérotation TravelWiz à l’enregistrement du colis.
                    </div>
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.package_type')} required>
                    <select value={form.cargo_type} onChange={(e) => setForm({ ...form, cargo_type: e.target.value })} className={panelInputClass}>
                      {cargoTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.designation')}>
                    <input type="text" value={form.designation ?? ''} onChange={(e) => setForm({ ...form, designation: e.target.value || null })} className={panelInputClass} placeholder={t('packlog.placeholders.cargo_designation')} />
                  </DynamicPanelField>
                  <DynamicPanelField label="Article SAP">
                    <input type="text" value={form.sap_article_code ?? ''} onChange={(e) => setForm({ ...form, sap_article_code: e.target.value || null })} className={panelInputClass} placeholder={t('packlog.placeholders.sap_code_example')} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.description')} required span="full">
                    <textarea required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${panelInputClass} min-h-[60px] resize-y`} placeholder={t('packlog.placeholders.cargo_description')} rows={3} />
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
              <FormSection title={t('common.logistics_preparation')} collapsible defaultExpanded>
                <FormGrid>
                  <DynamicPanelField label={t('common.material_ownership')}>
                    <select value={form.ownership_type ?? ''} onChange={(e) => setForm({ ...form, ownership_type: e.target.value || null })} className={panelInputClass}>
                      <option value="">Sélectionner...</option>
                      {ownershipOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.document_prepared_on')}>
                    <input type="datetime-local" value={form.document_prepared_at ?? ''} onChange={(e) => setForm({ ...form, document_prepared_at: e.target.value || null })} className={panelInputClass} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.availability')}>
                    <input type="datetime-local" value={form.available_from ?? ''} onChange={(e) => setForm({ ...form, available_from: e.target.value || null })} className={panelInputClass} />
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>
            </div>
            <div className="@container space-y-5">
              <FormSection title={t('common.dimensions')}>
                <FormGrid>
                  <DynamicPanelField label={t('common.weight_kg')} required>
                    <input type="number" min={0.001} step="any" required value={form.weight_kg || ''} onChange={(e) => setForm({ ...form, weight_kg: e.target.value ? Number(e.target.value) : 0 })} className={panelInputClass} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.width_cm')}>
                    <input type="number" min={0} step="any" value={form.width_cm ?? ''} onChange={(e) => setForm({ ...form, width_cm: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.length_cm')}>
                    <input type="number" min={0} step="any" value={form.length_cm ?? ''} onChange={(e) => setForm({ ...form, length_cm: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.height_cm')}>
                    <input type="number" min={0} step="any" value={form.height_cm ?? ''} onChange={(e) => setForm({ ...form, height_cm: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.total_area_m2')}>
                    <input type="number" min={0} step="any" value={form.surface_m2 ?? ''} onChange={(e) => setForm({ ...form, surface_m2: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.package_count')}>
                    <input type="number" min={1} step={1} value={form.package_count ?? 1} onChange={(e) => setForm({ ...form, package_count: e.target.value ? Number(e.target.value) : 1 })} className={panelInputClass} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.stackable')}>
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
              <FormSection title={t('common.cargo_compliance')} collapsible defaultExpanded>
                <FormGrid>
                  <DynamicPanelField label="Validation HAZMAT">
                    <label className="inline-flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={form.hazmat_validated ?? false} onChange={(e) => setForm({ ...form, hazmat_validated: e.target.checked })} />
                      Conforme / validé pour traitement HAZMAT
                    </label>
                  </DynamicPanelField>
                  <DynamicPanelField label="Colis réutilisable">
                    <label className="inline-flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={form.is_reusable ?? false} onChange={(e) => setForm({ ...form, is_reusable: e.target.checked })} />
                      Emballage / conteneur retournable (basket, skid, coffre DNV…)
                    </label>
                  </DynamicPanelField>
                  {form.is_reusable && (
                    <DynamicPanelField label="Date retour prévue">
                      <input type="date" value={form.expected_return_date ?? ''} onChange={(e) => setForm({ ...form, expected_return_date: e.target.value || null })} className={panelInputClass} />
                    </DynamicPanelField>
                  )}
                </FormGrid>
              </FormSection>
              <FormSection title={t('common.pickup_evidence')} collapsible defaultExpanded>
                <FormGrid>
                  <DynamicPanelField label="Lieu d’enlèvement" span="full">
                    <input type="text" value={form.pickup_location_label ?? ''} onChange={(e) => setForm({ ...form, pickup_location_label: e.target.value || null })} className={panelInputClass} placeholder={t('packlog.placeholders.pickup_location_example')} />
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
                          <iframe title="Pickup map preview" src={pickupMapEmbedUrl} className="h-48 w-full bg-muted" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                        </div>
                        {pickupMapUrl && (
                          <a href={pickupMapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs text-foreground hover:text-primary">
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
                    <UserPicker value={form.pickup_contact_user_id ?? null} onChange={(id) => setForm({ ...form, pickup_contact_user_id: id ?? null })} placeholder={t('packlog.placeholders.select_user')} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.company_contact')}>
                    <ContactPicker value={form.pickup_contact_tier_contact_id ?? null} onChange={(id) => setForm({ ...form, pickup_contact_tier_contact_id: id ?? null })} placeholder={t('packlog.placeholders.select_contact')} tierId={form.sender_tier_id ?? null} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.free_contact_name')}>
                    <input type="text" value={form.pickup_contact_name ?? ''} onChange={(e) => setForm({ ...form, pickup_contact_name: e.target.value || null })} className={panelInputClass} placeholder={t('packlog.placeholders.pickup_contact_fallback')} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.contact_phone')}>
                    <input type="text" value={form.pickup_contact_phone ?? ''} onChange={(e) => setForm({ ...form, pickup_contact_phone: e.target.value || null })} className={panelInputClass} placeholder={t('packlog.placeholders.phone_example')} />
                  </DynamicPanelField>
                  <DynamicPanelField label="Moyen de levage fourni par">
                    <input type="text" value={form.lifting_provider ?? ''} onChange={(e) => setForm({ ...form, lifting_provider: e.target.value || null })} className={panelInputClass} placeholder={t('packlog.placeholders.lifting_provider_example')} />
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
                  <DynamicPanelField label={t('common.photos_documents')} span="full">
                    <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      Les fichiers joints, photos terrain et preuves documentaires se gèrent après création du colis via l’onglet fichiers du détail colis.
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
