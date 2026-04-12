import { useCallback, useState } from 'react'
import { FileText, Loader2, Pencil, Plus, Save } from 'lucide-react'
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
  DetailRow,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { ProjectPicker } from '@/components/shared/ProjectPicker'
import { ImputationPicker } from '@/components/shared/ImputationPicker'
import { CompanyPicker } from '@/components/shared/CompanyPicker'
import { UserPicker } from '@/components/shared/UserPicker'
import { ContactPicker } from '@/components/shared/ContactPicker'
import { useDictionaryLabels, useDictionaryOptions } from '@/hooks/useDictionary'
import {
  useCargoWorkspace,
  useCargoDictionaryCategory,
  useWorkspaceApplyCargoRequestLoadingOption,
  useWorkspaceCargo,
  useWorkspaceCargoRequest,
  useWorkspaceCargoRequestLoadingOptions,
  useWorkspaceCargoRequestLtPdf,
  useWorkspaceUpdateCargoRequest,
} from '@/pages/packlog/packlogWorkspace'
import type { CargoRequestUpdate } from '@/types/api'

const REQUIREMENT_LABELS: Record<string, string> = {
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

const REASON_LABELS: Record<string, string> = {
  destination_mismatch: 'destination non desservie par le voyage',
  manifest_not_draft: 'manifeste cargo non modifiable',
  insufficient_weight_capacity: 'capacité poids insuffisante',
  no_zone_capacity_match: 'aucune zone compatible',
}

const REQUEST_STATUS_BADGES: Record<string, string> = {
  draft: 'gl-badge-neutral',
  submitted: 'gl-badge-warning',
  approved: 'gl-badge-info',
  assigned: 'gl-badge-info',
  in_progress: 'gl-badge-info',
  closed: 'gl-badge-success',
  cancelled: 'gl-badge-danger',
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
  const completionRatio = Math.max(
    0,
    Math.min(
      100,
      cargoRequest?.is_ready_for_submission ? 100 : Math.round((Math.max(7 - missingRequirements.length, 0) / 7) * 100),
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
      toast({ title: t('packlog.toast.request_updated'), variant: 'success' })
      setEditing(false)
    } catch (error) {
      const missing = Array.isArray((error as { response?: { data?: { detail?: { missing_requirements?: string[] } } } })?.response?.data?.detail?.missing_requirements)
        ? ((error as { response?: { data?: { detail?: { missing_requirements?: string[] } } } }).response?.data?.detail?.missing_requirements ?? [])
        : []
      toast({
        title: missing.length > 0 ? `Demande incomplète: ${missing.map((item) => REQUIREMENT_LABELS[item] ?? item).join(', ')}` : "Erreur lors de la mise à jour de la demande",
        variant: 'error',
      })
    }
  }

  const handleApplyLoadingOption = async (voyageId: string) => {
    try {
      await applyLoadingOption.mutateAsync({ id, voyageId })
      toast({ title: t('packlog.toast.loading_option_applied'), variant: 'success' })
    } catch (error) {
      const blockingReasons = Array.isArray((error as { response?: { data?: { detail?: { blocking_reasons?: string[] } } } })?.response?.data?.detail?.blocking_reasons)
        ? ((error as { response?: { data?: { detail?: { blocking_reasons?: string[] } } } }).response?.data?.detail?.blocking_reasons ?? [])
        : []
      toast({
        title: blockingReasons.length > 0 ? t('packlog.toast.loading_impossible', { details: blockingReasons.map((item) => REASON_LABELS[item] ?? item).join(', ') }) : t('packlog.toast.loading_assign_error'),
        variant: 'error',
      })
    }
  }

  const handlePrintLt = async () => {
    try {
      await downloadCargoRequestLtPdf.mutateAsync(id)
    } catch {
      toast({ title: t('packlog.toast.print_lt_error'), description: t('packlog.toast.print_lt_error_description'), variant: 'error' })
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
          {!editing && <PanelActionButton onClick={startEdit} icon={<Pencil size={12} />}>Modifier</PanelActionButton>}
          {editing && (
            <>
              <PanelActionButton onClick={() => setEditing(false)}>Annuler</PanelActionButton>
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
          <FormSection title="Demande d’expédition">
            <FormGrid>
              <DynamicPanelField label="Intitulé">
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
              <DynamicPanelField label="Description" span="full">
                <textarea value={editForm.description ?? ''} onChange={(e) => setEditForm({ ...editForm, description: e.target.value || null })} className={`${panelInputClass} min-h-[72px] resize-y`} rows={3} />
              </DynamicPanelField>
              <DynamicPanelField label="Entreprise expéditrice">
                <CompanyPicker value={editForm.sender_tier_id ?? null} onChange={(id) => setEditForm({ ...editForm, sender_tier_id: id ?? null, sender_contact_tier_contact_id: null })} placeholder="Sélectionner une entreprise..." />
              </DynamicPanelField>
              <DynamicPanelField label="Contact entreprise">
                <ContactPicker value={editForm.sender_contact_tier_contact_id ?? null} onChange={(id) => setEditForm({ ...editForm, sender_contact_tier_contact_id: id ?? null })} placeholder="Sélectionner un contact..." tierId={editForm.sender_tier_id ?? null} />
              </DynamicPanelField>
              <DynamicPanelField label="Destinataire">
                <input type="text" value={editForm.receiver_name ?? ''} onChange={(e) => setEditForm({ ...editForm, receiver_name: e.target.value || null })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label="Imputation">
                <ImputationPicker value={editForm.imputation_reference_id ?? null} onChange={(id) => setEditForm({ ...editForm, imputation_reference_id: id ?? null })} placeholder="Sélectionner une imputation..." />
              </DynamicPanelField>
              <DynamicPanelField label="Demandeur">
                <UserPicker value={editForm.requester_user_id ?? null} onChange={(id) => setEditForm({ ...editForm, requester_user_id: id ?? null })} placeholder="Sélectionner un utilisateur..." />
              </DynamicPanelField>
              <DynamicPanelField label="Demandeur libre">
                <input type="text" value={editForm.requester_name ?? ''} onChange={(e) => setEditForm({ ...editForm, requester_name: e.target.value || null })} className={panelInputClass} placeholder="Fallback si le demandeur n'existe pas dans le référentiel" />
              </DynamicPanelField>
              <DynamicPanelField label="Installation de destination" span="full">
                <AssetPicker value={editForm.destination_asset_id ?? null} onChange={(assetId) => setEditForm({ ...editForm, destination_asset_id: assetId ?? null })} clearable placeholder="Sélectionner l'installation de destination..." />
              </DynamicPanelField>
              <DynamicPanelField label="Projet" span="full">
                <ProjectPicker value={editForm.project_id ?? null} onChange={(projectId) => setEditForm({ ...editForm, project_id: projectId ?? null })} clearable placeholder="Sélectionner un projet..." />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
        ) : (
          <>
            <div className="space-y-3 rounded-xl border border-border/70 bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('gl-badge', REQUEST_STATUS_BADGES[cargoRequest.status] ?? 'gl-badge-neutral')}>
                  {requestStatusLabels[cargoRequest.status] ?? cargoRequest.status}
                </span>
                <span className={cn('gl-badge', cargoRequest.is_ready_for_submission ? 'gl-badge-success' : 'gl-badge-warning')}>
                  {cargoRequest.is_ready_for_submission ? 'Prête à soumettre' : 'À compléter'}
                </span>
                {loadingOptions?.length ? <span className="gl-badge gl-badge-info">{loadingOptions.length} option(s) de chargement</span> : null}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Demande d’expédition</p>
                <h3 className="mt-1 text-lg font-semibold text-foreground">{cargoRequest.request_code}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{cargoRequest.title}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Complétude</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{completionRatio}%</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Colis</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{requestCargo.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{totalPackages.toLocaleString('fr-FR')} packages</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Poids total</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{totalWeightKg.toLocaleString('fr-FR')} kg</p>
                  <p className="mt-1 text-xs text-muted-foreground">{assignedCount} affectés à un manifeste</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Suivi</p>
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

            <FormSection title="Demande d’expédition">
              <DetailRow label="Code" value={cargoRequest.request_code} />
              <DetailRow label="Intitulé" value={cargoRequest.title} />
              <DetailRow label="Statut" value={requestStatusLabels[cargoRequest.status] ?? cargoRequest.status} />
              <DetailRow label="Description" value={cargoRequest.description ?? '—'} />
              <DetailRow label="Entreprise expéditrice" value={cargoRequest.sender_name ?? '—'} />
              <DetailRow label="Contact entreprise" value={cargoRequest.sender_contact_name ?? '—'} />
              <DetailRow label="Destinataire" value={cargoRequest.receiver_name ?? '—'} />
              <DetailRow label="Destination" value={cargoRequest.destination_name ?? '—'} />
              <DetailRow label="Imputation" value={cargoRequest.imputation_reference_name ? `${cargoRequest.imputation_reference_code ?? ''} ${cargoRequest.imputation_reference_name}`.trim() : '—'} />
              <DetailRow label="Demandeur" value={cargoRequest.requester_display_name ?? cargoRequest.requester_name ?? '—'} />
              <DetailRow label="Nombre de colis" value={String(cargoRequest.cargo_count ?? 0)} />
              <DetailRow label="Créée le" value={new Date(cargoRequest.created_at).toLocaleString('fr-FR')} />
            </FormSection>

            <FormSection title="Complétude de la demande" collapsible defaultExpanded>
              <div className="space-y-3">
                <div className={`rounded-lg border px-3 py-2 text-xs ${cargoRequest.is_ready_for_submission ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                  {cargoRequest.is_ready_for_submission ? 'La demande est prête pour soumission.' : 'La demande n’est pas encore prête pour soumission.'}
                </div>
                {missingRequirements.length > 0 ? (
                  <div className="space-y-1">
                    {missingRequirements.map((item) => (
                      <div key={item} className="rounded-lg border border-border/60 bg-card px-3 py-2 text-xs text-muted-foreground">
                        {REQUIREMENT_LABELS[item] ?? item}
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
                  {(loadingOptions ?? []).map((option) => (
                    <div key={option.voyage_id} className="rounded-lg border border-border/60 bg-card px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{option.voyage_code}</p>
                          <p className="text-xs text-muted-foreground">{option.vector_name ?? 'Vecteur'} · départ {new Date(option.scheduled_departure).toLocaleString('fr-FR')}</p>
                          <p className="text-xs text-muted-foreground">Base: {option.departure_base_name ?? '—'} · reste {option.remaining_weight_kg != null ? `${option.remaining_weight_kg.toLocaleString('fr-FR')} kg` : 'poids non borné'}</p>
                          <p className="text-xs text-muted-foreground">Demande: {option.total_request_weight_kg.toLocaleString('fr-FR')} kg · destination {option.destination_match ? 'compatible' : 'non compatible'}</p>
                          <p className="text-xs text-muted-foreground">Surface estimée: {option.total_request_surface_m2.toLocaleString('fr-FR')} m² · {option.all_items_stackable ? 'empilable' : 'non empilable'}</p>
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
                          <PanelActionButton variant="primary" onClick={() => handleApplyLoadingOption(option.voyage_id)} disabled={!option.can_load || applyLoadingOption.isPending || cargoRequest.status !== 'approved'}>
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
