import { Box, Loader2, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import {
  FormSection,
  DynamicPanelField,
  DetailFieldGrid,
  ReadOnlyRow,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import type {
  CargoAttachmentEvidence,
  CargoItem,
  PackageElement,
  PackageElementDispositionUpdate,
} from '@/types/api'

export const CARGO_READINESS_LABELS: Record<string, string> = {
  description: 'Description',
  designation: 'Désignation',
  weight_kg: 'Poids',
  destination_asset_id: 'Installation de destination',
  pickup_location_label: 'Lieu d’enlèvement',
  pickup_contact: 'Contact d’enlèvement',
  available_from: 'Date de mise à disposition',
  imputation_reference_id: 'Imputation',
  cargo_photo: 'Photo du colis',
  weight_ticket: 'Ticket de pesée',
  transport_document: 'Document de transport',
  hazmat_document: 'Document HAZMAT',
  lifting_certificate: 'Certification levage',
  hazmat_validated: 'Validation HAZMAT',
  lifting_points_certified: 'Certification des oreilles de levage',
}

export const PACKAGE_DISPOSITION_VALUES: PackageElementDispositionUpdate['return_status'][] = [
  'returned',
  'reintegrated',
  'scrapped',
  'yard_storage',
]

export type PackageElementReturnDraft = {
  quantity_returned: number
  return_notes: string
  disposition: PackageElementDispositionUpdate['return_status']
}

export type CargoReturnDraft = {
  return_type: string
  notes: string
  waste_manifest_ref: string
  pass_number: string
  inventory_reference: string
  sap_code_confirmed: boolean
  photo_evidence_count: number
  double_signature_confirmed: boolean
  yard_justification: string
}

export function buildPickupMapUrl(latitude: number | null | undefined, longitude: number | null | undefined) {
  if (latitude == null || longitude == null) return null
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`
}

export function buildPickupMapEmbedUrl(latitude: number | null | undefined, longitude: number | null | undefined) {
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

export function getRequiredCargoEvidenceTypes(cargoType: string): CargoAttachmentEvidence['evidence_type'][] {
  const required: CargoAttachmentEvidence['evidence_type'][] = ['cargo_photo', 'weight_ticket', 'transport_document']
  if (['unit', 'bulk', 'hazmat'].includes(cargoType)) required.push('lifting_certificate')
  if (cargoType === 'hazmat') required.push('hazmat_document')
  return required
}

export function assessCargoReadiness(cargo: CargoItem): string[] {
  const missing: string[] = []
  if (!cargo.description) missing.push('description')
  if (!cargo.designation) missing.push('designation')
  if (!cargo.weight_kg) missing.push('weight_kg')
  if (!cargo.destination_asset_id) missing.push('destination_asset_id')
  if (!cargo.pickup_location_label) missing.push('pickup_location_label')
  if (!(cargo.pickup_contact_user_id || cargo.pickup_contact_tier_contact_id || cargo.pickup_contact_name)) missing.push('pickup_contact')
  if (!cargo.available_from) missing.push('available_from')
  if (!cargo.imputation_reference_id) missing.push('imputation_reference_id')
  if (cargo.cargo_type === 'hazmat' && !cargo.hazmat_validated) missing.push('hazmat_validated')
  if (['unit', 'bulk', 'hazmat'].includes(cargo.cargo_type) && !cargo.lifting_points_certified) missing.push('lifting_points_certified')
  return missing
}

export function CargoReadinessSection({
  missingRequirements,
  workflowBlockingItems,
}: {
  missingRequirements: string[]
  workflowBlockingItems: string[]
}) {
  const displayedItems = workflowBlockingItems.length > 0 ? workflowBlockingItems : missingRequirements
  return (
    <FormSection title="Complétude du dossier" collapsible defaultExpanded>
      <div className="space-y-2">
        <div
          className={cn(
            'rounded-lg border px-3 py-2 text-xs',
            missingRequirements.length === 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900',
          )}
        >
          {missingRequirements.length === 0
            ? 'Le dossier cargo contient les éléments minimums pour passer en revue/validation.'
            : `${missingRequirements.length} élément(s) bloquant(s) restent à compléter.`}
        </div>
        {displayedItems.length > 0 && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {displayedItems.map((item) => (
              <div key={item} className="rounded-lg border border-border/60 bg-card px-3 py-2 text-xs text-muted-foreground">
                {CARGO_READINESS_LABELS[item] ?? item}
              </div>
            ))}
          </div>
        )}
      </div>
    </FormSection>
  )
}

export function CargoLocationSection({
  pickupLocationLabel,
  pickupCoordinatesLabel,
  pickupMapUrl,
  pickupMapEmbedUrl,
}: {
  pickupLocationLabel: string | null | undefined
  pickupCoordinatesLabel: string
  pickupMapUrl: string | null
  pickupMapEmbedUrl: string | null
}) {
  return (
    <FormSection title="Localisation d’enlèvement" collapsible defaultExpanded>
      <div className="space-y-2">
        <DetailFieldGrid>
          <ReadOnlyRow label="Lieu" value={pickupLocationLabel ?? '—'} />
          <ReadOnlyRow label="Coordonnées" value={pickupCoordinatesLabel} />
        </DetailFieldGrid>
        {pickupMapEmbedUrl ? (
          <div className="space-y-2">
            <div className="overflow-hidden rounded-lg border border-border">
              <iframe
                title="Pickup location preview"
                src={pickupMapEmbedUrl}
                className="h-56 w-full bg-muted"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            {pickupMapUrl && (
              <a
                href={pickupMapUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-foreground hover:bg-muted/40"
              >
                <MapPin size={12} />
                Ouvrir la localisation sur la carte
              </a>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Aucune coordonnée cartographique renseignée.</p>
        )}
      </div>
    </FormSection>
  )
}

export function CargoFilesSection({
  cargoId,
  attachmentEvidence,
}: {
  cargoId: string
  attachmentEvidence: CargoAttachmentEvidence[] | undefined
}) {
  const photoCount = attachmentEvidence?.filter((item) => item.evidence_type === 'cargo_photo').length ?? 0
  const otherCount = attachmentEvidence?.filter((item) => item.evidence_type !== 'cargo_photo').length ?? 0
  return (
    <FormSection title="Fichiers opérationnels" collapsible defaultExpanded>
      <div className="space-y-3">
        <AttachmentManager ownerType="cargo_item" ownerId={cargoId} compact />
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Photos qualifiées</p>
            <p className="text-sm font-semibold text-foreground">{photoCount}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Autres preuves</p>
            <p className="text-sm font-semibold text-foreground">{otherCount}</p>
          </div>
        </div>
      </div>
    </FormSection>
  )
}

export function buildCargoReturnSummary(elements: PackageElement[] | undefined) {
  if (!elements || elements.length === 0) {
    return {
      totalSent: 0,
      totalReturned: 0,
      coverageRatio: 0,
      aggregateStatus: 'no_elements',
      aggregateDisposition: 'none',
      returnedElements: 0,
      partialElements: 0,
      pendingElements: 0,
      dispositionCounts: {} as Record<string, number>,
    }
  }

  const totalSent = elements.reduce((sum, element) => sum + (element.quantity ?? 0), 0)
  const totalReturned = elements.reduce((sum, element) => sum + (element.quantity_returned ?? 0), 0)
  const returnedElements = elements.filter((element) => (element.quantity_returned ?? 0) > 0).length
  const partialElements = elements.filter((element) => element.return_status === 'partial').length
  const pendingElements = elements.filter((element) => element.return_status === 'pending').length
  const dispositionCounts = elements.reduce<Record<string, number>>((acc, element) => {
    const key = element.return_status || 'pending'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  let aggregateStatus = 'not_started'
  if (totalReturned > 0 && totalReturned < totalSent) aggregateStatus = 'partial_return'
  if (totalSent > 0 && totalReturned >= totalSent) aggregateStatus = 'fully_returned'
  if (returnedElements === 0) aggregateStatus = 'not_started'

  const finalizedStatuses = ['reintegrated', 'scrapped', 'yard_storage']
  const finalizedCount = elements.filter((element) => finalizedStatuses.includes(element.return_status)).length
  let aggregateDisposition = 'not_dispatched'
  if (finalizedCount > 0 && finalizedCount < elements.length) aggregateDisposition = 'mixed'
  if (finalizedCount === elements.length) {
    const uniqueFinal = Array.from(new Set(elements.map((element) => element.return_status)))
    aggregateDisposition = uniqueFinal.length === 1 ? uniqueFinal[0] : 'mixed'
  }

  return {
    totalSent,
    totalReturned,
    coverageRatio: totalSent > 0 ? totalReturned / totalSent : 0,
    aggregateStatus,
    aggregateDisposition,
    returnedElements,
    partialElements,
    pendingElements,
    dispositionCounts,
  }
}

export function CargoPackageElementsSection({
  cargoStatus,
  elements,
  drafts,
  cargoStatusLabels,
  packageReturnStatusLabels,
  packageReturnStatusOptions,
  onDraftChange,
  onSubmitReturn,
  onSubmitDisposition,
  savingReturn,
  savingDisposition,
}: {
  cargoStatus: string
  elements: PackageElement[] | undefined
  drafts: Record<string, PackageElementReturnDraft>
  cargoStatusLabels: Record<string, string>
  packageReturnStatusLabels: Record<string, string>
  packageReturnStatusOptions: { value: string; label: string }[]
  onDraftChange: (elementId: string, patch: Partial<PackageElementReturnDraft>) => void
  onSubmitReturn: (element: PackageElement) => Promise<void>
  onSubmitDisposition: (element: PackageElement) => Promise<void>
  savingReturn: boolean
  savingDisposition: boolean
}) {
  return (
    <FormSection title={`Éléments du colis (${elements?.length ?? 0})`} collapsible defaultExpanded>
      {elements && elements.length > 0 ? (
        <div className="space-y-3">
          {elements.map((element) => {
            const draft = drafts[element.id] ?? {
              quantity_returned: element.quantity_returned ?? 0,
              return_notes: element.return_notes ?? '',
              disposition: 'returned' as PackageElementDispositionUpdate['return_status'],
            }
            const maxQuantity = element.quantity ?? 0
            const hasReturn = (element.quantity_returned ?? 0) > 0
            return (
              <div key={element.id} className="space-y-3 rounded-lg border border-border/60 bg-card p-3">
                <div className="flex items-start gap-3">
                  <Box size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{element.description}</p>
                      <span className="gl-badge gl-badge-neutral">{packageReturnStatusLabels[element.return_status] ?? element.return_status}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Expédié: {element.quantity}
                      {' • '}Retourné: {element.quantity_returned ?? 0}
                      {element.weight_kg ? ` • ${element.weight_kg} kg` : ''}
                      {element.sap_code ? ` • SAP: ${element.sap_code}` : ''}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,160px)_minmax(0,1fr)_auto]">
                  <DynamicPanelField label="Quantité de retour">
                    <input
                      type="number"
                      min={0}
                      max={maxQuantity}
                      step="any"
                      value={Number.isFinite(draft.quantity_returned) ? draft.quantity_returned : 0}
                      onChange={(e) => onDraftChange(element.id, { quantity_returned: e.target.value ? Number(e.target.value) : 0 })}
                      className={panelInputClass}
                    />
                  </DynamicPanelField>
                  <DynamicPanelField label="Notes retour">
                    <input
                      type="text"
                      value={draft.return_notes}
                      onChange={(e) => onDraftChange(element.id, { return_notes: e.target.value })}
                      className={panelInputClass}
                      placeholder="Observation retour / écarts / zone"
                    />
                  </DynamicPanelField>
                  <div className="flex items-end">
                    <button className="gl-button-sm gl-button-default text-xs" onClick={() => void onSubmitReturn(element)} disabled={savingReturn || draft.quantity_returned < 0}>
                      {savingReturn ? <Loader2 size={12} className="animate-spin" /> : 'Enregistrer retour'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto]">
                  <DynamicPanelField label="Disposition base">
                    <select
                      value={draft.disposition}
                      onChange={(e) => onDraftChange(element.id, { disposition: e.target.value as PackageElementDispositionUpdate['return_status'] })}
                      className={panelInputClass}
                    >
                      {packageReturnStatusOptions
                        .filter((option) => PACKAGE_DISPOSITION_VALUES.includes(option.value as PackageElementDispositionUpdate['return_status']))
                        .map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                  </DynamicPanelField>
                  <div className="flex items-center text-xs text-muted-foreground">
                    {hasReturn ? `Statut cargo actuel: ${cargoStatusLabels[cargoStatus] ?? cargoStatus}` : 'Déclare d’abord une quantité retournée avant le dispatch base.'}
                  </div>
                  <div className="flex items-end">
                    <button className="gl-button-sm gl-button-primary text-xs" onClick={() => void onSubmitDisposition(element)} disabled={savingDisposition || !hasReturn}>
                      {savingDisposition ? <Loader2 size={12} className="animate-spin" /> : 'Appliquer disposition'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Le suivi par élément permet maintenant de couvrir les retours totaux et partiels avant la disposition finale à la base.
          </div>
        </div>
      ) : (
        <p className="py-2 text-xs text-muted-foreground">
          Aucun élément détaillé. Ajoute des sous-éléments pour suivre les retours partiels, les réintégrations et les mises au rebut.
        </p>
      )}
    </FormSection>
  )
}

export function CargoBackReturnSection({
  isDelivered,
  returnDraft,
  returnTypeOptions,
  returnTypeLabels,
  onChange,
  onSubmit,
  isSubmitting,
}: {
  isDelivered: boolean
  returnDraft: CargoReturnDraft
  returnTypeOptions: Array<{ value: string; label: string }>
  returnTypeLabels: Record<string, string>
  onChange: (patch: Partial<CargoReturnDraft>) => void
  onSubmit: () => Promise<void>
  isSubmitting: boolean
}) {
  const returnType = returnDraft.return_type
  const needsWaste = returnType === 'waste'
  const needsContractor = returnType === 'contractor_return'
  const needsReintegration = returnType === 'stock_reintegration'
  const needsScrap = returnType === 'scrap'
  const needsYard = returnType === 'yard_storage'

  return (
    <FormSection title="Initiation back cargo" collapsible defaultExpanded={false}>
      {!isDelivered ? (
        <p className="text-xs text-muted-foreground">Le back cargo ne peut être initié qu’après une livraison finale ou intermédiaire.</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <DynamicPanelField label="Type de retour">
              <select value={returnDraft.return_type} onChange={(e) => onChange({ return_type: e.target.value })} className={panelInputClass}>
                {returnTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label="Photos de preuve">
              <input type="number" min={0} step={1} value={returnDraft.photo_evidence_count} onChange={(e) => onChange({ photo_evidence_count: e.target.value ? Number(e.target.value) : 0 })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Notes" span="full">
              <textarea value={returnDraft.notes} onChange={(e) => onChange({ notes: e.target.value })} className={`${panelInputClass} min-h-[72px] resize-y`} rows={3} placeholder={`Précise le contexte du retour ${returnTypeLabels[returnType] ?? ''}`.trim()} />
            </DynamicPanelField>
            {needsWaste && (
              <DynamicPanelField label="Bordereau déchet">
                <input type="text" value={returnDraft.waste_manifest_ref} onChange={(e) => onChange({ waste_manifest_ref: e.target.value })} className={panelInputClass} />
              </DynamicPanelField>
            )}
            {needsContractor && (
              <>
                <DynamicPanelField label="Laissez-passer">
                  <input type="text" value={returnDraft.pass_number} onChange={(e) => onChange({ pass_number: e.target.value })} className={panelInputClass} />
                </DynamicPanelField>
                <DynamicPanelField label="Référence inventaire">
                  <input type="text" value={returnDraft.inventory_reference} onChange={(e) => onChange({ inventory_reference: e.target.value })} className={panelInputClass} />
                </DynamicPanelField>
                <DynamicPanelField label="Double signature">
                  <label className="inline-flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={returnDraft.double_signature_confirmed} onChange={(e) => onChange({ double_signature_confirmed: e.target.checked })} />
                    Double signature confirmée
                  </label>
                </DynamicPanelField>
              </>
            )}
            {needsReintegration && (
              <>
                <DynamicPanelField label="Référence inventaire">
                  <input type="text" value={returnDraft.inventory_reference} onChange={(e) => onChange({ inventory_reference: e.target.value })} className={panelInputClass} />
                </DynamicPanelField>
                <DynamicPanelField label="Code SAP confirmé">
                  <label className="inline-flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={returnDraft.sap_code_confirmed} onChange={(e) => onChange({ sap_code_confirmed: e.target.checked })} />
                    Confirmation SAP reçue
                  </label>
                </DynamicPanelField>
              </>
            )}
            {needsYard && (
              <DynamicPanelField label="Justification stockage yard" span="full">
                <textarea value={returnDraft.yard_justification} onChange={(e) => onChange({ yard_justification: e.target.value })} className={`${panelInputClass} min-h-[72px] resize-y`} rows={3} />
              </DynamicPanelField>
            )}
            {needsScrap && (
              <div className="md:col-span-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Pour la ferraille, le backend exige soit la mention "ferraille" dans les notes, soit au moins une preuve photo.
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <button className="gl-button-sm gl-button-default text-xs" onClick={() => void onSubmit()} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 size={12} className="animate-spin" /> : 'Initier le back cargo'}
            </button>
          </div>
        </div>
      )}
    </FormSection>
  )
}

export function CargoReturnSummarySection({
  elements,
  packageReturnStatusLabels,
}: {
  elements: PackageElement[] | undefined
  packageReturnStatusLabels: Record<string, string>
}) {
  const { t } = useTranslation()
  const summary = buildCargoReturnSummary(elements)
  const aggregateStatusLabel = (() => {
    switch (summary.aggregateStatus) {
      case 'partial_return':
        return 'Retour partiel en cours'
      case 'fully_returned':
        return 'Retour déclaré sur 100% des quantités'
      case 'not_started':
        return 'Aucun retour saisi'
      default:
        return 'Aucun élément détaillé'
    }
  })()
  const aggregateDispositionLabel = (() => {
    switch (summary.aggregateDisposition) {
      case 'not_dispatched':
        return 'Aucune disposition finale'
      case 'mixed':
        return 'Disposition mixte'
      case 'reintegrated':
      case 'scrapped':
      case 'yard_storage':
        return packageReturnStatusLabels[summary.aggregateDisposition] ?? summary.aggregateDisposition
      default:
        return '—'
    }
  })()
  return (
    <FormSection title="Synthèse retour colis" collapsible defaultExpanded>
      {!elements || elements.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Aucun élément détaillé. La synthèse retour deviendra exploitable quand le colis sera découpé en sous-éléments.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Couverture retour</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{Math.round(summary.coverageRatio * 100)}%</p>
              <p className="text-xs text-muted-foreground">{summary.totalReturned} / {summary.totalSent} unités</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">État agrégé</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{aggregateStatusLabel}</p>
              <p className="text-xs text-muted-foreground">{summary.returnedElements} élément(s) avec retour saisi</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Disposition base</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{aggregateDispositionLabel}</p>
              <p className="text-xs text-muted-foreground">{summary.partialElements} partiel(s), {summary.pendingElements} en attente</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('common.distribution')}</p>
              <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                {Object.entries(summary.dispositionCounts).map(([status, count]) => (
                  <p key={status}>{packageReturnStatusLabels[status] ?? status}: {count}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </FormSection>
  )
}

export function CargoHistorySection({ cargoHistory }: { cargoHistory: Array<{ id: string; action: string; created_at: string; actor_name?: string | null; details?: Record<string, unknown> | null }> | undefined }) {
  const { t } = useTranslation()
  return (
    <FormSection title="Historique statut" collapsible defaultExpanded={false}>
      {cargoHistory && cargoHistory.length > 0 ? (
        <div className="space-y-2">
          {cargoHistory.map((entry) => {
            const details = entry.details ?? {}
            const fromStatus = typeof details.from_status === 'string' ? details.from_status : null
            const toStatus = typeof details.to_status === 'string' ? details.to_status : null
            const changedFields = details.changes && typeof details.changes === 'object' ? Object.keys(details.changes as Record<string, unknown>) : []
            return (
              <div key={entry.id} className="rounded-lg border border-border/60 bg-card px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">{entry.action}</p>
                  <p className="text-[11px] text-muted-foreground">{new Date(entry.created_at).toLocaleString('fr-FR')}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.actor_name || 'Système'}
                  {fromStatus && toStatus ? ` • ${fromStatus} -> ${toStatus}` : ''}
                  {!fromStatus && changedFields.length > 0 ? ` • Champs: ${changedFields.join(', ')}` : ''}
                </p>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="py-2 text-xs text-muted-foreground">{t('common.no_history_available')}</p>
      )}
    </FormSection>
  )
}

export function CargoEvidenceQualificationSection({
  cargoId,
  attachments,
  evidenceByAttachmentId,
  cargoEvidenceOptions,
  updateCargoAttachmentEvidence,
}: {
  cargoId: string
  attachments: Array<{ id: string; original_name: string; content_type?: string | null }> | undefined
  evidenceByAttachmentId: Map<string, CargoAttachmentEvidence['evidence_type']>
  cargoEvidenceOptions: Array<{ value: string; label: string }>
  updateCargoAttachmentEvidence: { mutate: (args: { cargoId: string; attachmentId: string; evidence_type: CargoAttachmentEvidence['evidence_type'] }) => void }
}) {
  return (
    <FormSection title="Qualification des preuves" collapsible defaultExpanded={false}>
      {attachments && attachments.length > 0 ? (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="rounded-lg border border-border/60 bg-card px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{attachment.original_name}</p>
                  <p className="text-[11px] text-muted-foreground">{attachment.content_type}</p>
                </div>
                <select
                  className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                  value={evidenceByAttachmentId.get(attachment.id) ?? 'other'}
                  onChange={(e) => updateCargoAttachmentEvidence.mutate({
                    cargoId,
                    attachmentId: attachment.id,
                    evidence_type: e.target.value as CargoAttachmentEvidence['evidence_type'],
                  })}
                >
                  {cargoEvidenceOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Aucune pièce jointe à qualifier.</p>
      )}
    </FormSection>
  )
}
