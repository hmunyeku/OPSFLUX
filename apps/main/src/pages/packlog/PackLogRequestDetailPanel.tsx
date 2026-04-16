import { useCallback, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Plus,
  Save,
  Truck,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import {
  DynamicPanelShell,
  PanelContentLayout,
  FormSection,
  FormGrid,
  DetailFieldGrid,
  DynamicPanelField,
  PanelActionButton,
  DetailRow,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import type { ActionItem } from '@/components/layout/DynamicPanel'
import { TabBar, TabButton } from '@/components/ui/Tabs'
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

type Tab = 'informations' | 'colis' | 'chargement'

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
  const [activeTab, setActiveTab] = useState<Tab>('informations')

  const requestCargo = requestCargoData?.items ?? []
  const missingRequirements = cargoRequest?.missing_requirements ?? []
  const totalWeightKg = requestCargo.reduce((sum, cargo) => sum + Number(cargo.weight_kg || 0), 0)
  const totalPackages = requestCargo.reduce((sum, cargo) => sum + Number(cargo.package_count || 0), 0)
  const deliveredCount = requestCargo.filter((cargo) => cargo.status === 'delivered_final').length
  const inTransitCount = requestCargo.filter((cargo) => cargo.status === 'in_transit').length
  const blockedCount = requestCargo.filter((cargo) => ['damaged', 'missing'].includes(cargo.status)).length
  const assignedCount = requestCargo.filter((cargo) => Boolean(cargo.manifest_id)).length
  const loadableOptions = (loadingOptions ?? []).filter((o) => o.can_load).length
  const completionRatio = Math.max(
    0,
    Math.min(
      100,
      cargoRequest?.is_ready_for_submission
        ? 100
        : Math.round((Math.max(7 - missingRequirements.length, 0) / 7) * 100),
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
      const missing = Array.isArray(
        (error as { response?: { data?: { detail?: { missing_requirements?: string[] } } } })
          ?.response?.data?.detail?.missing_requirements,
      )
        ? ((error as { response?: { data?: { detail?: { missing_requirements?: string[] } } } })
            .response?.data?.detail?.missing_requirements ?? [])
        : []
      toast({
        title:
          missing.length > 0
            ? `Demande incomplète: ${missing.map((item) => REQUIREMENT_LABELS[item] ?? item).join(', ')}`
            : 'Erreur lors de la mise à jour de la demande',
        variant: 'error',
      })
    }
  }

  const handleApplyLoadingOption = async (voyageId: string) => {
    try {
      await applyLoadingOption.mutateAsync({ id, voyageId })
      toast({ title: t('packlog.toast.loading_option_applied'), variant: 'success' })
    } catch (error) {
      const blockingReasons = Array.isArray(
        (error as { response?: { data?: { detail?: { blocking_reasons?: string[] } } } })
          ?.response?.data?.detail?.blocking_reasons,
      )
        ? ((error as { response?: { data?: { detail?: { blocking_reasons?: string[] } } } })
            .response?.data?.detail?.blocking_reasons ?? [])
        : []
      toast({
        title:
          blockingReasons.length > 0
            ? t('packlog.toast.loading_impossible', {
                details: blockingReasons
                  .map((item) => REASON_LABELS[item] ?? item)
                  .join(', '),
              })
            : t('packlog.toast.loading_assign_error'),
        variant: 'error',
      })
    }
  }

  const handlePrintLt = async () => {
    try {
      await downloadCargoRequestLtPdf.mutateAsync(id)
    } catch {
      toast({
        title: t('packlog.toast.print_lt_error'),
        description: t('packlog.toast.print_lt_error_description'),
        variant: 'error',
      })
    }
  }

  const actionItems = useMemo<ActionItem[]>(() => {
    if (!editing) {
      return [
        {
          id: 'add-colis',
          label: 'Ajouter un colis',
          icon: Plus,
          variant: 'primary',
          priority: 100,
          onClick: () =>
            useUIStore.getState().openDynamicPanel({
              type: 'create',
              module: panelModule,
              meta: {
                subtype: 'cargo',
                requestId: id,
                requestTitle: cargoRequest?.title,
                requestCode: cargoRequest?.request_code,
              },
            }),
        },
        {
          id: 'print-lt',
          label: 'Imprimer LT',
          icon: FileText,
          priority: 60,
          loading: downloadCargoRequestLtPdf.isPending,
          onClick: handlePrintLt,
        },
        {
          id: 'edit',
          label: 'Modifier',
          icon: Pencil,
          priority: 80,
          onClick: startEdit,
        },
      ]
    }
    return [
      {
        id: 'cancel',
        label: 'Annuler',
        priority: 40,
        onClick: () => setEditing(false),
      },
      {
        id: 'save',
        label: 'Enregistrer',
        icon: Save,
        variant: 'primary',
        priority: 100,
        loading: updateCargoRequest.isPending,
        onClick: handleSave,
      },
    ]
  }, [editing, panelModule, id, cargoRequest, downloadCargoRequestLtPdf.isPending, handlePrintLt, startEdit, updateCargoRequest.isPending, handleSave])

  if (isLoading || !cargoRequest) {
    return (
      <DynamicPanelShell
        title="Chargement..."
        icon={<FileText size={14} className="text-primary" />}
      >
        <div className="flex items-center justify-center py-16">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={cargoRequest.request_code}
      subtitle={cargoRequest.title}
      icon={<FileText size={14} className="text-primary" />}
      actionItems={actionItems}
    >
      {/* ── Compact summary header — always visible ────────────── */}
      <div className="border-b border-border/60 bg-card/50 px-4 py-3 @container">
        {/* Status badges row */}
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              'gl-badge',
              REQUEST_STATUS_BADGES[cargoRequest.status] ?? 'gl-badge-neutral',
            )}
          >
            {requestStatusLabels[cargoRequest.status] ?? cargoRequest.status}
          </span>
          <span
            className={cn(
              'gl-badge',
              cargoRequest.is_ready_for_submission ? 'gl-badge-success' : 'gl-badge-warning',
            )}
          >
            {cargoRequest.is_ready_for_submission ? 'Prête à soumettre' : 'À compléter'}
          </span>
          {missingRequirements.length > 0 && (
            <span className="gl-badge gl-badge-warning">
              {missingRequirements.length} manque(s)
            </span>
          )}
        </div>

        {/* KPI grid — container-query responsive */}
        <div className="grid grid-cols-2 gap-2 @[480px]:grid-cols-4">
          <div className="rounded-lg border border-border/50 bg-background/60 px-2.5 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Complétude
            </p>
            <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
              {completionRatio}%
            </p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/60 px-2.5 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Colis
            </p>
            <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
              {requestCargo.length}
            </p>
            <p className="text-[10px] text-muted-foreground">{totalPackages} pkg</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/60 px-2.5 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Poids
            </p>
            <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
              {totalWeightKg.toLocaleString('fr-FR')} kg
            </p>
            <p className="text-[10px] text-muted-foreground">{assignedCount} affectés</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/60 px-2.5 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Transit
            </p>
            <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
              {deliveredCount}
              <span className="text-xs font-normal text-muted-foreground"> livrés</span>
            </p>
            <p className="text-[10px] text-muted-foreground">
              {inTransitCount} transit · {blockedCount} bloqués
            </p>
          </div>
        </div>
      </div>

      {/* ── Tab bar — hidden when editing ──────────────────────── */}
      {!editing && (
        <TabBar>
          <TabButton
            icon={FileText}
            label="Informations"
            active={activeTab === 'informations'}
            onClick={() => setActiveTab('informations')}
          />
          <TabButton
            icon={Package}
            label="Colis"
            active={activeTab === 'colis'}
            onClick={() => setActiveTab('colis')}
            badge={requestCargo.length > 0 ? String(requestCargo.length) : undefined}
          />
          <TabButton
            icon={Truck}
            label="Chargement"
            active={activeTab === 'chargement'}
            onClick={() => setActiveTab('chargement')}
            badge={loadableOptions > 0 ? String(loadableOptions) : undefined}
          />
        </TabBar>
      )}

      {/* ── Content ────────────────────────────────────────────── */}
      <PanelContentLayout>
        {editing ? (
          /* ── Edit form ─────────────────────────────────────── */
          <FormSection title="Demande d'expédition">
            <FormGrid>
              <DynamicPanelField label="Intitulé">
                <input
                  type="text"
                  value={editForm.title ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className={panelInputClass}
                />
              </DynamicPanelField>
              <DynamicPanelField label="Statut">
                <select
                  value={editForm.status ?? ''}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      status: (e.target.value || null) as CargoRequestUpdate['status'],
                    })
                  }
                  className={panelInputClass}
                >
                  <option value="">Sélectionner...</option>
                  {requestStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label="Description" span="full">
                <textarea
                  value={editForm.description ?? ''}
                  onChange={(e) =>
                    setEditForm({ ...editForm, description: e.target.value || null })
                  }
                  className={`${panelInputClass} min-h-[72px] resize-y`}
                  rows={3}
                />
              </DynamicPanelField>
              <DynamicPanelField label="Entreprise expéditrice">
                <CompanyPicker
                  value={editForm.sender_tier_id ?? null}
                  onChange={(id) =>
                    setEditForm({
                      ...editForm,
                      sender_tier_id: id ?? null,
                      sender_contact_tier_contact_id: null,
                    })
                  }
                  placeholder="Sélectionner une entreprise..."
                />
              </DynamicPanelField>
              <DynamicPanelField label="Contact entreprise">
                <ContactPicker
                  value={editForm.sender_contact_tier_contact_id ?? null}
                  onChange={(id) =>
                    setEditForm({ ...editForm, sender_contact_tier_contact_id: id ?? null })
                  }
                  placeholder="Sélectionner un contact..."
                  tierId={editForm.sender_tier_id ?? null}
                />
              </DynamicPanelField>
              <DynamicPanelField label="Destinataire">
                <input
                  type="text"
                  value={editForm.receiver_name ?? ''}
                  onChange={(e) =>
                    setEditForm({ ...editForm, receiver_name: e.target.value || null })
                  }
                  className={panelInputClass}
                />
              </DynamicPanelField>
              <DynamicPanelField label="Imputation">
                <ImputationPicker
                  value={editForm.imputation_reference_id ?? null}
                  onChange={(id) =>
                    setEditForm({ ...editForm, imputation_reference_id: id ?? null })
                  }
                  placeholder="Sélectionner une imputation..."
                />
              </DynamicPanelField>
              <DynamicPanelField label="Demandeur">
                <UserPicker
                  value={editForm.requester_user_id ?? null}
                  onChange={(id) =>
                    setEditForm({ ...editForm, requester_user_id: id ?? null })
                  }
                  placeholder="Sélectionner un utilisateur..."
                />
              </DynamicPanelField>
              <DynamicPanelField label="Demandeur libre">
                <input
                  type="text"
                  value={editForm.requester_name ?? ''}
                  onChange={(e) =>
                    setEditForm({ ...editForm, requester_name: e.target.value || null })
                  }
                  className={panelInputClass}
                  placeholder="Fallback si pas dans le référentiel"
                />
              </DynamicPanelField>
              <DynamicPanelField label="Installation de destination" span="full">
                <AssetPicker
                  value={editForm.destination_asset_id ?? null}
                  onChange={(assetId) =>
                    setEditForm({ ...editForm, destination_asset_id: assetId ?? null })
                  }
                  clearable
                  placeholder="Sélectionner l'installation de destination..."
                />
              </DynamicPanelField>
              <DynamicPanelField label="Projet" span="full">
                <ProjectPicker
                  value={editForm.project_id ?? null}
                  onChange={(projectId) =>
                    setEditForm({ ...editForm, project_id: projectId ?? null })
                  }
                  clearable
                  placeholder="Sélectionner un projet..."
                />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
        ) : activeTab === 'informations' ? (
          /* ── Informations tab ──────────────────────────────── */
          <div className="space-y-5">
            {/* Identification & expédition */}
            <FormSection title="Identification">
              <DetailFieldGrid>
                <DetailRow label="Code" value={<span className="font-mono text-xs">{cargoRequest.request_code}</span>} />
                <DetailRow
                  label="Statut"
                  value={
                    <span className={cn('gl-badge', REQUEST_STATUS_BADGES[cargoRequest.status] ?? 'gl-badge-neutral')}>
                      {requestStatusLabels[cargoRequest.status] ?? cargoRequest.status}
                    </span>
                  }
                />
                <DetailRow label="Intitulé" value={cargoRequest.title} />
                <DetailRow
                  label="Créée le"
                  value={new Date(cargoRequest.created_at).toLocaleString('fr-FR')}
                />
              </DetailFieldGrid>
            </FormSection>

            {cargoRequest.description && (
              <FormSection title="Description">
                <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
                  {cargoRequest.description}
                </p>
              </FormSection>
            )}

            {/* Parties */}
            <FormSection title="Parties impliquées">
              <DetailFieldGrid>
                <DetailRow label="Expéditeur" value={cargoRequest.sender_name ?? '—'} />
                <DetailRow label="Contact" value={cargoRequest.sender_contact_name ?? '—'} />
                <DetailRow label="Destinataire" value={cargoRequest.receiver_name ?? '—'} />
                <DetailRow label="Destination" value={cargoRequest.destination_name ?? '—'} />
                <DetailRow
                  label="Demandeur"
                  value={cargoRequest.requester_display_name ?? cargoRequest.requester_name ?? '—'}
                />
                <DetailRow
                  label="Imputation"
                  value={
                    cargoRequest.imputation_reference_name
                      ? `${cargoRequest.imputation_reference_code ?? ''} ${cargoRequest.imputation_reference_name}`.trim()
                      : '—'
                  }
                />
              </DetailFieldGrid>
            </FormSection>

            {/* Complétude */}
            <FormSection title="Complétude de la demande" collapsible defaultExpanded>
              <div className="space-y-1.5">
                {/* Readiness banner */}
                <div
                  className={cn(
                    'mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium',
                    cargoRequest.is_ready_for_submission
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
                      : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400',
                  )}
                >
                  {cargoRequest.is_ready_for_submission ? (
                    <CheckCircle2 size={13} />
                  ) : (
                    <AlertTriangle size={13} />
                  )}
                  {cargoRequest.is_ready_for_submission
                    ? 'La demande est prête pour soumission.'
                    : `${missingRequirements.length} élément(s) manquant(s) avant soumission.`}
                </div>
                {/* Checklist */}
                <div className="grid grid-cols-1 gap-1 @[440px]:grid-cols-2">
                  {[
                    { label: 'Intitulé de la demande', done: Boolean(cargoRequest.title?.trim()) },
                    { label: 'Description', done: Boolean(cargoRequest.description?.trim()) },
                    { label: 'Entreprise expéditrice', done: Boolean(cargoRequest.sender_tier_id) },
                    { label: 'Contact entreprise', done: Boolean(cargoRequest.sender_contact_tier_contact_id) },
                    { label: 'Destinataire', done: Boolean(cargoRequest.receiver_name?.trim()) },
                    { label: 'Installation destination', done: Boolean(cargoRequest.destination_asset_id) },
                    { label: 'Imputation', done: Boolean(cargoRequest.imputation_reference_id) },
                    { label: 'Demandeur', done: Boolean(cargoRequest.requester_user_id || cargoRequest.requester_name?.trim()) },
                    { label: 'Au moins un colis', done: requestCargo.length > 0 },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-2 py-1 text-xs">
                      <span
                        className={cn(
                          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold',
                          item.done
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400',
                        )}
                      >
                        {item.done ? '✓' : '!'}
                      </span>
                      <span className={item.done ? 'text-foreground' : 'text-muted-foreground'}>
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </FormSection>
          </div>
        ) : activeTab === 'colis' ? (
          /* ── Colis tab ─────────────────────────────────────── */
          <div className="space-y-5">
            {requestCargo.length > 0 ? (
              <FormSection title={`${requestCargo.length} colis rattaché${requestCargo.length > 1 ? 's' : ''}`}>
                {/* Stats row */}
                <div className="mb-3 grid grid-cols-3 gap-2 @container">
                  <div className="rounded-md border border-border/50 bg-muted/30 px-2.5 py-1.5 text-center">
                    <p className="text-[10px] text-muted-foreground">Total</p>
                    <p className="text-sm font-semibold tabular-nums">{totalWeightKg.toLocaleString('fr-FR')} kg</p>
                  </div>
                  <div className="rounded-md border border-border/50 bg-muted/30 px-2.5 py-1.5 text-center">
                    <p className="text-[10px] text-muted-foreground">Packages</p>
                    <p className="text-sm font-semibold tabular-nums">{totalPackages}</p>
                  </div>
                  <div className="rounded-md border border-border/50 bg-muted/30 px-2.5 py-1.5 text-center">
                    <p className="text-[10px] text-muted-foreground">Livrés</p>
                    <p className="text-sm font-semibold tabular-nums">{deliveredCount}</p>
                  </div>
                </div>
                {/* Cargo list */}
                <div className="space-y-1.5">
                  {requestCargo.map((cargo) => (
                    <button
                      key={cargo.id}
                      onClick={() =>
                        useUIStore.getState().openDynamicPanel({
                          type: 'detail',
                          module: panelModule,
                          id: cargo.id,
                          meta: { subtype: 'cargo' },
                        })
                      }
                      className="group w-full rounded-lg border border-border/60 bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/40 hover:border-border"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {cargo.code}
                            </span>
                            {cargo.hazmat_validated && (
                              <span className="gl-badge gl-badge-danger text-[9px]">HAZMAT</span>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-sm font-medium text-foreground">
                            {cargo.designation || cargo.description || '—'}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xs font-medium tabular-nums text-foreground">
                            {Number(cargo.weight_kg).toLocaleString('fr-FR')} kg
                          </p>
                          <p className="text-[10px] text-muted-foreground">{cargo.status}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </FormSection>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border/60 bg-muted/30">
                  <Package size={22} strokeWidth={1.5} className="text-muted-foreground/60" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Aucun colis rattaché</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ajoutez le premier colis pour commencer.
                  </p>
                </div>
                <PanelActionButton
                  variant="primary"
                  onClick={() =>
                    useUIStore.getState().openDynamicPanel({
                      type: 'create',
                      module: panelModule,
                      meta: {
                        subtype: 'cargo',
                        requestId: id,
                        requestTitle: cargoRequest.title,
                        requestCode: cargoRequest.request_code,
                      },
                    })
                  }
                  icon={<Plus size={12} />}
                >
                  Ajouter le premier colis
                </PanelActionButton>
              </div>
            )}
          </div>
        ) : (
          /* ── Chargement tab ────────────────────────────────── */
          <div className="space-y-5">
            {(loadingOptions ?? []).length > 0 ? (
              <FormSection title={`${(loadingOptions ?? []).length} proposition(s) de chargement`}>
                <div className="space-y-3">
                  {(loadingOptions ?? []).map((option) => (
                    <div
                      key={option.voyage_id}
                      className="rounded-xl border border-border/60 bg-card p-3"
                    >
                      {/* Header row */}
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">
                            {option.voyage_code}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {option.vector_name ?? 'Vecteur'} ·{' '}
                            {new Date(option.scheduled_departure).toLocaleString('fr-FR')}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'gl-badge shrink-0',
                            option.can_load ? 'gl-badge-success' : 'gl-badge-warning',
                          )}
                        >
                          {option.can_load ? 'Chargeable' : 'Bloqué'}
                        </span>
                      </div>

                      {/* Details grid */}
                      <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs @[400px]:grid-cols-3">
                        <div>
                          <span className="text-muted-foreground">Base départ </span>
                          <span className="font-medium">{option.departure_base_name ?? '—'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Capacité rest. </span>
                          <span className="font-medium tabular-nums">
                            {option.remaining_weight_kg != null
                              ? `${option.remaining_weight_kg.toLocaleString('fr-FR')} kg`
                              : 'illimitée'}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Poids demande </span>
                          <span className="font-medium tabular-nums">
                            {option.total_request_weight_kg.toLocaleString('fr-FR')} kg
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Surface est. </span>
                          <span className="font-medium tabular-nums">
                            {option.total_request_surface_m2.toLocaleString('fr-FR')} m²
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Destination </span>
                          <span
                            className={cn(
                              'font-medium',
                              option.destination_match ? 'text-emerald-600' : 'text-amber-600',
                            )}
                          >
                            {option.destination_match ? 'Compatible' : 'Non compatible'}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Empilable </span>
                          <span className="font-medium">
                            {option.all_items_stackable ? 'Oui' : 'Non'}
                          </span>
                        </div>
                      </div>

                      {/* Compatible zones */}
                      {option.compatible_zones.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-1">
                          {option.compatible_zones.map((zone) => (
                            <span key={zone.zone_id} className="gl-badge gl-badge-neutral">
                              <MapPin size={9} className="mr-0.5" />
                              {zone.zone_name}
                              {zone.surface_m2 != null
                                ? ` · ${zone.surface_m2.toLocaleString('fr-FR')} m²`
                                : ''}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Blocking reasons */}
                      {option.blocking_reasons.length > 0 && (
                        <div className="mb-3 flex items-start gap-1.5 rounded-md border border-amber-200/60 bg-amber-50/60 px-2.5 py-1.5 text-xs text-amber-700 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-400">
                          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                          <span>
                            {option.blocking_reasons
                              .map(
                                (item) =>
                                  ({
                                    destination_mismatch: 'destination non desservie',
                                    manifest_not_draft: 'manifeste non draft',
                                    insufficient_weight_capacity: 'capacité poids insuffisante',
                                    no_zone_capacity_match: 'aucune zone compatible',
                                  }[item] ?? item),
                              )
                              .join(', ')}
                          </span>
                        </div>
                      )}

                      {/* Assign action */}
                      <PanelActionButton
                        variant="primary"
                        onClick={() => handleApplyLoadingOption(option.voyage_id)}
                        disabled={
                          !option.can_load ||
                          applyLoadingOption.isPending ||
                          cargoRequest.status !== 'approved'
                        }
                      >
                        {applyLoadingOption.isPending ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          'Affecter ce voyage'
                        )}
                      </PanelActionButton>
                    </div>
                  ))}
                </div>
              </FormSection>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border/60 bg-muted/30">
                  <Truck size={22} strokeWidth={1.5} className="text-muted-foreground/60" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Aucune proposition de chargement
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Les voyages compatibles apparaîtront ici.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}
