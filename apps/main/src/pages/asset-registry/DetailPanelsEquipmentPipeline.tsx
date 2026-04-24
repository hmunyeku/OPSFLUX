/**
 * Detail panels for Equipment and Pipeline entities in the Asset
 * Registry. Extracted from DetailPanels.tsx so the main file stays
 * focused on Field/Site/Installation.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Wrench, Ship, Info, Paperclip, MessageSquare, ExternalLink, History,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TabBar } from '@/components/ui/Tabs'
import {
  DynamicPanelShell,
  FormSection,
  PanelContentLayout,
  ReadOnlyRow,
  InlineEditableRow,
  InlineEditableSelect,
  InlineEditableTags,
  DangerConfirmButton,
  DetailFieldGrid,
} from '@/components/layout/DynamicPanel'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { ExternalRefManager } from '@/components/shared/ExternalRefManager'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { TagManager } from '@/components/shared/TagManager'
import { GeoEditor } from '@/components/shared/GeoEditor'
import { apiGeoToEditorValue, editorValueToApiGeo, latLonToPointValue } from '@/utils/geoHelpers'
import { EquipmentContextualFields } from './EquipmentContextualFields'
import {
  CraneConfigurationManager,
  CraneLoadChartPointManager,
  CraneLiftZoneManager,
  CraneHookBlockManager,
  CraneReevingGuideManager,
  SeparatorNozzleManager,
  SeparatorProcessCaseManager,
  PumpCurvePointManager,
  ColumnSectionManager,
} from './EquipmentSubModels'
import { AssetEntityChangeLog } from './AssetChangeHistory'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { usePermission } from '@/hooks/usePermission'
import { useUIStore } from '@/stores/uiStore'
import {
  useEquipmentItem, useUpdateEquipment, useDeleteEquipment,
  usePipeline, useUpdatePipeline, useDeletePipeline,
  useCraneConfigurations,
  useInstallation,
} from '@/hooks/useAssetRegistry'

// Asset criticality + bool options (also used in DetailPanels.tsx;
// duplicated here so this file stays self-contained).
const CRITICALITY_OPTIONS = [
  { value: 'critical', label: 'Critique' },
  { value: 'high', label: 'Haute' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'low', label: 'Basse' },
]
const BOOL_OPTIONS = [
  { value: 'true', label: 'Oui' },
  { value: 'false', label: 'Non' },
]

function fmtBool(val: boolean | undefined | null, t: (k: string) => string) {
  if (val == null) return '--'
  return val ? t('common.yes') : t('common.no')
}

function fmtCurrency(val: number | null | undefined) {
  if (val == null) return '--'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(val)
}

function UrlLink({ url, label }: { url?: string | null; label: string }) {
  if (!url) return <>--</>
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-[11px]">
      {label} <ExternalLink size={9} />
    </a>
  )
}

// Pipeline service kinds — fallback for when the dictionary is offline.
const PIPELINE_SERVICE_FALLBACK = [
  { value: 'oil', label: 'Huile' },
  { value: 'gas', label: 'Gaz' },
  { value: 'water', label: 'Eau' },
  { value: 'multiphase', label: 'Multiphasique' },
  { value: 'chemical', label: 'Chimique' },
]

type PanelTab = 'details' | 'files' | 'notes' | 'refs' | 'history'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import { formatDate } from '@/lib/i18n'

// Duplicated from DetailPanels.tsx to keep this file self-contained.
const STATUS_COLORS: Record<string, string> = {
  OPERATIONAL: 'gl-badge-success',
  STANDBY: 'gl-badge-warning',
  UNDER_CONSTRUCTION: 'gl-badge-info',
  SUSPENDED: 'gl-badge-neutral',
  DECOMMISSIONED: 'gl-badge-danger',
  ABANDONED: 'gl-badge-danger',
}
const STATUS_OPTIONS_FALLBACK = [
  { value: 'OPERATIONAL', label: 'Opérationnel' },
  { value: 'STANDBY', label: 'En attente' },
  { value: 'UNDER_CONSTRUCTION', label: 'En construction' },
  { value: 'SUSPENDED', label: 'Suspendu' },
  { value: 'DECOMMISSIONED', label: 'Décommissionné' },
  { value: 'ABANDONED', label: 'Abandonné' },
]

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null
  const cls = STATUS_COLORS[status] ?? 'gl-badge-neutral'
  return <span className={cn('gl-badge', cls)}>{status}</span>
}

function useArStatusOptions() {
  const dictOpts = useDictionaryOptions('ar_status')
  return dictOpts && dictOpts.length > 0 ? dictOpts : STATUS_OPTIONS_FALLBACK
}

function fmtDate(val: string | null | undefined) {
  if (!val) return '--'
  return formatDate(val)
}

function fmtNum(val: number | null | undefined, unit?: string) {
  if (val == null) return '--'
  return unit ? `${val} ${unit}` : String(val)
}

// ════════════════════════════════════════════════════════════════

function CraneSubModelSections({ equipmentId, canEdit }: { equipmentId: string; canEdit: boolean }) {
  const { data: configs } = useCraneConfigurations(equipmentId)
  const [selectedConfigId, setSelectedConfigId] = useState<string>('')

  return (
    <>
      <FormSection title="Configurations grue" collapsible storageKey="panel.ar-equip.sections" id="ar-equip-crane-configs">
        <CraneConfigurationManager equipmentId={equipmentId} canEdit={canEdit} />
      </FormSection>

      {/* Config-nested managers: load chart + lift zones */}
      {(configs?.length ?? 0) > 0 && (
        <>
          <FormSection title="Points courbe de charge" collapsible storageKey="panel.ar-equip.sections" id="ar-equip-crane-lcp">
            <div className="mb-3">
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">Configuration</label>
              <select
                value={selectedConfigId}
                onChange={(e) => setSelectedConfigId(e.target.value)}
                className="w-full h-7 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">Sélectionner une configuration...</option>
                {(configs ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.config_code}{c.config_name ? ` — ${c.config_name}` : ''}</option>
                ))}
              </select>
            </div>
            {selectedConfigId && (
              <CraneLoadChartPointManager equipmentId={equipmentId} configId={selectedConfigId} canEdit={canEdit} />
            )}
          </FormSection>

          <FormSection title="Zones de levage" collapsible storageKey="panel.ar-equip.sections" id="ar-equip-crane-lz">
            <div className="mb-3">
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">Configuration</label>
              <select
                value={selectedConfigId}
                onChange={(e) => setSelectedConfigId(e.target.value)}
                className="w-full h-7 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">Sélectionner une configuration...</option>
                {(configs ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.config_code}{c.config_name ? ` — ${c.config_name}` : ''}</option>
                ))}
              </select>
            </div>
            {selectedConfigId && (
              <CraneLiftZoneManager equipmentId={equipmentId} configId={selectedConfigId} canEdit={canEdit} />
            )}
          </FormSection>
        </>
      )}

      <FormSection title="Moufles / Hook Blocks" collapsible storageKey="panel.ar-equip.sections" id="ar-equip-crane-hooks">
        <CraneHookBlockManager equipmentId={equipmentId} canEdit={canEdit} />
      </FormSection>
      <FormSection title="Guide de mouflage" collapsible storageKey="panel.ar-equip.sections" id="ar-equip-crane-reeving">
        <CraneReevingGuideManager equipmentId={equipmentId} canEdit={canEdit} />
      </FormSection>
    </>
  )
}

// ════════════════════════════════════════════════════════════════
// EQUIPMENT DETAIL
// ════════════════════════════════════════════════════════════════

export function EquipmentDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canUpdate = hasPermission('asset.update')
  const canDelete = hasPermission('asset.delete')
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const statusOptions = useArStatusOptions()
  const { data: equip } = useEquipmentItem(id)
  const { data: parentInstallation } = useInstallation(equip?.installation_id ?? undefined)
  const updateEquip = useUpdateEquipment()
  const deleteEquip = useDeleteEquipment()
  const [tab, setTab] = useState<PanelTab>('details')

  if (!equip) return null

  const handleSave = (key: string, value: unknown) => {
    updateEquip.mutate({ id, data: { [key]: value } })
  }

  const handleDelete = async () => {
    await deleteEquip.mutateAsync(id)
    closeDynamicPanel()
  }

  return (
    <DynamicPanelShell
      title={equip.tag_number}
      subtitle={`${equip.name}${equip.equipment_class ? ` — ${equip.equipment_class.replace(/_/g, ' ')}` : ''}`}
      icon={<Wrench size={14} />}
      headerRight={
        canDelete ? (
          <DangerConfirmButton confirmLabel={t('common.confirm_delete')} onConfirm={handleDelete}>{t('common.delete')}</DangerConfirmButton>
        ) : undefined
      }
    >
      <div className="border-b border-border px-3">
        <TabBar
          items={[
            { id: 'details', label: t('common.details'), icon: Info },
            { id: 'files', label: t('common.files'), icon: Paperclip },
            { id: 'notes', label: t('common.notes'), icon: MessageSquare },
            { id: 'refs', label: t('assets.references'), icon: ExternalLink },
            { id: 'history', label: t('assets.history'), icon: History },
          ]}
          activeId={tab}
          onTabChange={(id) => setTab(id as typeof tab)}
        />
      </div>

      {tab === 'details' && (
        <ErrorBoundary>
        <PanelContentLayout>
          <FormSection title={t('common.details')}>
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableRow label={t('common.name')} value={equip.name} onSave={(v) => handleSave('name', v)} />
                : <ReadOnlyRow label={t('common.name')} value={equip.name} />
              }
              <ReadOnlyRow label={t('common.tag_field')} value={<span className="font-mono font-semibold">{equip.tag_number}</span>} />
              {canUpdate
                ? <InlineEditableRow label={t('assets.equipment_class')} value={equip.equipment_class || ''} onSave={(v) => handleSave('equipment_class', v || null)} />
                : <ReadOnlyRow label={t('assets.equipment_class')} value={equip.equipment_class ? <span className="gl-badge gl-badge-neutral">{equip.equipment_class.replace(/_/g, ' ')}</span> : '—'} />
              }
              {canUpdate
                ? <InlineEditableTags label={t('common.status')} value={equip.status} options={statusOptions} onSave={(v) => handleSave('status', v)} />
                : <ReadOnlyRow label={t('common.status')} value={<StatusBadge status={equip.status} />} />
              }
              {equip.installation_id && (
                <ReadOnlyRow label={t('assets.installation_parent')} value={
                  <CrossModuleLink module="ar-installation" id={equip.installation_id} label={parentInstallation ? `${parentInstallation.code} — ${parentInstallation.name}` : '...'} />
                } />
              )}
              {canUpdate
                ? <InlineEditableSelect label={t('assets.criticality')} value={equip.criticality || ''} options={CRITICALITY_OPTIONS} onSave={(v) => handleSave('criticality', v || null)} />
                : <ReadOnlyRow label={t('assets.criticality')} value={
                    equip.criticality
                      ? <span className={cn('gl-badge', equip.criticality === 'A' ? 'gl-badge-danger' : equip.criticality === 'B' ? 'gl-badge-warning' : 'gl-badge-neutral')}>{equip.criticality}</span>
                      : '—'
                  } />
              }
              {canUpdate
                ? <InlineEditableSelect label={t('assets.safety_function')} value={equip.safety_function ? 'true' : 'false'} options={BOOL_OPTIONS} onSave={(v) => handleSave('safety_function', v === 'true')} />
                : <ReadOnlyRow label={t('assets.safety_function')} value={fmtBool(equip.safety_function, t)} />
              }
              {canUpdate
                ? <InlineEditableSelect label={t('assets.is_mobile')} value={equip.is_mobile ? 'true' : 'false'} options={BOOL_OPTIONS} onSave={(v) => handleSave('is_mobile', v === 'true')} />
                : <ReadOnlyRow label={t('assets.is_mobile')} value={fmtBool(equip.is_mobile, t)} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.area')} value={equip.area || ''} onSave={(v) => handleSave('area', v || null)} />
                : <ReadOnlyRow label={t('assets.area')} value={equip.area || '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.sub_area')} value={equip.sub_area || ''} onSave={(v) => handleSave('sub_area', v || null)} />
                : <ReadOnlyRow label={t('assets.sub_area')} value={equip.sub_area || '—'} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.manufacturer_info')} collapsible storageKey="panel.ar-equip.sections" id="ar-equip-mfg">
            <DetailFieldGrid>
              {canUpdate ? (
                <>
                  <InlineEditableRow label={t('assets.manufacturer')} value={equip.manufacturer || ''} onSave={(v) => handleSave('manufacturer', v || null)} />
                  <InlineEditableRow label={t('assets.model_ref')} value={equip.model || ''} onSave={(v) => handleSave('model', v || null)} />
                  <InlineEditableRow label={t('assets.serial_number')} value={equip.serial_number || ''} onSave={(v) => handleSave('serial_number', v || null)} />
                </>
              ) : (
                <>
                  <ReadOnlyRow label={t('assets.manufacturer')} value={equip.manufacturer || '—'} />
                  <ReadOnlyRow label={t('assets.model_ref')} value={equip.model || '—'} />
                  <ReadOnlyRow label={t('assets.serial_number')} value={equip.serial_number || '—'} />
                </>
              )}
              {canUpdate
                ? <InlineEditableRow label={t('assets.year_manufactured')} value={String(equip.year_manufactured ?? '')} onSave={(v) => handleSave('year_manufactured', v ? parseInt(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.year_manufactured')} value={equip.year_manufactured ?? '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.year_installed')} value={String(equip.year_installed ?? '')} onSave={(v) => handleSave('year_installed', v ? parseInt(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.year_installed')} value={equip.year_installed ?? '—'} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.technical_details')} collapsible storageKey="panel.ar-equip.sections" id="ar-equip-tech">
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableRow label={t('assets.cert_number')} value={equip.cert_number || ''} onSave={(v) => handleSave('cert_number', v || null)} />
                : <ReadOnlyRow label={t('assets.cert_number')} value={equip.cert_number || '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.cert_authority')} value={equip.cert_authority || ''} onSave={(v) => handleSave('cert_authority', v || null)} />
                : <ReadOnlyRow label={t('assets.cert_authority')} value={equip.cert_authority || '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.drawing_number')} value={equip.drawing_number || ''} onSave={(v) => handleSave('drawing_number', v || null)} />
                : <ReadOnlyRow label={t('assets.drawing_number')} value={equip.drawing_number || '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.p_and_id_ref')} value={equip.p_and_id_ref || ''} onSave={(v) => handleSave('p_and_id_ref', v || null)} />
                : <ReadOnlyRow label={t('assets.p_and_id_ref')} value={equip.p_and_id_ref || '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.asset_number')} value={equip.asset_number || ''} onSave={(v) => handleSave('asset_number', v || null)} />
                : <ReadOnlyRow label={t('assets.asset_number')} value={equip.asset_number || '—'} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.location')} collapsible storageKey="panel.ar-equip.sections" id="ar-equip-location">
            <GeoEditor
              geoType="point"
              value={apiGeoToEditorValue(equip.geom_point) ?? latLonToPointValue(equip.latitude, equip.longitude)}
              onChange={(val) => handleSave('geom_point', editorValueToApiGeo(val))}
              readOnly={!canUpdate}
              height={180}
              showSearch={canUpdate}
              showToolbar={canUpdate}
            />
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableRow label={t('assets.grid_reference')} value={equip.grid_reference || ''} onSave={(v) => handleSave('grid_reference', v || null)} />
                : <ReadOnlyRow label={t('assets.grid_reference')} value={equip.grid_reference || '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label="Latitude" value={String(equip.latitude ?? '')} onSave={(v) => handleSave('latitude', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('common.latitude')} value={equip.latitude ?? '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label="Longitude" value={String(equip.longitude ?? '')} onSave={(v) => handleSave('longitude', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('common.longitude')} value={equip.longitude ?? '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.elevation')} value={String(equip.elevation_m ?? '')} onSave={(v) => handleSave('elevation_m', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.elevation')} value={fmtNum(equip.elevation_m, 'm')} />
              }
              <ReadOnlyRow label={t('assets.local_xyz')} value={
                equip.local_x_m != null || equip.local_y_m != null || equip.local_z_m != null
                  ? `${equip.local_x_m ?? '—'} / ${equip.local_y_m ?? '—'} / ${equip.local_z_m ?? '—'}`
                  : '—'
              } />
              {canUpdate
                ? <InlineEditableRow label={t('assets.orientation')} value={String(equip.orientation_deg ?? '')} onSave={(v) => handleSave('orientation_deg', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.orientation')} value={fmtNum(equip.orientation_deg, '°')} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.finance')} collapsible storageKey="panel.ar-equip.sections" id="ar-equip-finance">
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableRow label={t('assets.owner_company')} value={equip.owner_company || ''} onSave={(v) => handleSave('owner_company', v || null)} />
                : <ReadOnlyRow label={t('assets.owner_company')} value={equip.owner_company || '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.purchase_date')} value={equip.purchase_date || ''} onSave={(v) => handleSave('purchase_date', v || null)} type="date" />
                : <ReadOnlyRow label={t('assets.purchase_date')} value={fmtDate(equip.purchase_date)} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.purchase_cost')} value={String(equip.purchase_cost_usd ?? '')} onSave={(v) => handleSave('purchase_cost_usd', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.purchase_cost')} value={fmtCurrency(equip.purchase_cost_usd)} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.replacement_cost')} value={String(equip.replacement_cost_usd ?? '')} onSave={(v) => handleSave('replacement_cost_usd', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.replacement_cost')} value={fmtCurrency(equip.replacement_cost_usd)} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.documents_urls')} collapsible storageKey="panel.ar-equip.sections" id="ar-equip-docs">
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableRow label={t('assets.datasheet_url')} value={equip.datasheet_url || ''} onSave={(v) => handleSave('datasheet_url', v || null)} />
                : <ReadOnlyRow label={t('assets.datasheet_url')} value={<UrlLink url={equip.datasheet_url} label={t('assets.datasheet_url')} />} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.manual_url')} value={equip.manual_url || ''} onSave={(v) => handleSave('manual_url', v || null)} />
                : <ReadOnlyRow label={t('assets.manual_url')} value={<UrlLink url={equip.manual_url} label={t('assets.manual_url')} />} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.cert_document_url')} value={equip.cert_document_url || ''} onSave={(v) => handleSave('cert_document_url', v || null)} />
                : <ReadOnlyRow label={t('assets.cert_document_url')} value={<UrlLink url={equip.cert_document_url} label={t('assets.cert_document_url')} />} />
              }
            </DetailFieldGrid>
          </FormSection>


          {/* Specialized equipment sub-type fields — wrapped in ErrorBoundary to isolate
              crashes in data-dependent sub-components (e.g. when specialized_data shape
              diverges from the expected layout). */}
          <ErrorBoundary>
            <EquipmentContextualFields
              equipmentClass={equip.equipment_class}
              specializedData={equip.specialized_data}
              equipmentId={id}
            />
          </ErrorBoundary>

          {/* Equipment class-specific sub-model managers */}
          <ErrorBoundary>
            {equip.equipment_class === 'CRANE' && (
              <CraneSubModelSections equipmentId={id} canEdit={canUpdate} />
            )}
            {equip.equipment_class === 'SEPARATOR' && (
              <>
                <FormSection title="Piquages (Nozzles)" collapsible storageKey="panel.ar-equip.sections" id="ar-equip-sep-nozzles">
                  <SeparatorNozzleManager equipmentId={id} canEdit={canUpdate} />
                </FormSection>
                <FormSection title="Cas process" collapsible storageKey="panel.ar-equip.sections" id="ar-equip-sep-cases">
                  <SeparatorProcessCaseManager equipmentId={id} canEdit={canUpdate} />
                </FormSection>
              </>
            )}
            {equip.equipment_class === 'PUMP' && (
              <FormSection title="Courbe de pompe" collapsible storageKey="panel.ar-equip.sections" id="ar-equip-pump-curve">
                <PumpCurvePointManager equipmentId={id} canEdit={canUpdate} />
              </FormSection>
            )}
            {equip.equipment_class === 'PROCESS_COLUMN' && (
              <FormSection title="Sections colonne" collapsible storageKey="panel.ar-equip.sections" id="ar-equip-col-sections">
                <ColumnSectionManager equipmentId={id} canEdit={canUpdate} />
              </FormSection>
            )}
          </ErrorBoundary>

          <FormSection title={t('common.tags')}>
            <TagManager ownerType="ar_equipment" ownerId={id} compact />
          </FormSection>
        </PanelContentLayout>
        </ErrorBoundary>
      )}

      {tab === 'files' && <div className="p-4"><AttachmentManager ownerType="ar_equipment" ownerId={id} /></div>}
      {tab === 'notes' && <div className="p-4"><NoteManager ownerType="ar_equipment" ownerId={id} /></div>}
      {tab === 'refs' && <div className="p-4"><ExternalRefManager ownerType="ar_equipment" ownerId={id} /></div>}
      {tab === 'history' && <AssetEntityChangeLog entityType="ar_equipment" entityId={id} />}
    </DynamicPanelShell>
  )
}


// ════════════════════════════════════════════════════════════════
// PIPELINE DETAIL
// ════════════════════════════════════════════════════════════════

export function PipelineDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canUpdate = hasPermission('asset.update')
  const canDelete = hasPermission('asset.delete')
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const statusOptions = useArStatusOptions()
  const pipeServiceDict = useDictionaryOptions('pipeline_service')
  const pipelineServiceOptions = pipeServiceDict.length ? pipeServiceDict : PIPELINE_SERVICE_FALLBACK
  const { data: pipe } = usePipeline(id)
  const { data: fromInst } = useInstallation(pipe?.from_installation_id)
  const { data: toInst } = useInstallation(pipe?.to_installation_id)
  const updatePipe = useUpdatePipeline()
  const deletePipe = useDeletePipeline()
  const [tab, setTab] = useState<PanelTab>('details')

  if (!pipe) return null

  const handleSave = (key: string, value: unknown) => {
    updatePipe.mutate({ id, data: { [key]: value } })
  }

  const handleDelete = async () => {
    await deletePipe.mutateAsync(id)
    closeDynamicPanel()
  }

  return (
    <DynamicPanelShell
      title={pipe.pipeline_id}
      subtitle={pipe.name}
      icon={<Ship size={14} />}
      headerRight={
        canDelete ? (
          <DangerConfirmButton confirmLabel={t('common.confirm_delete')} onConfirm={handleDelete}>{t('common.delete')}</DangerConfirmButton>
        ) : undefined
      }
    >
      <div className="border-b border-border px-3">
        <TabBar
          items={[
            { id: 'details', label: t('common.details'), icon: Info },
            { id: 'files', label: t('common.files'), icon: Paperclip },
            { id: 'notes', label: t('common.notes'), icon: MessageSquare },
            { id: 'refs', label: t('assets.references'), icon: ExternalLink },
            { id: 'history', label: t('assets.history'), icon: History },
          ]}
          activeId={tab}
          onTabChange={(id) => setTab(id as typeof tab)}
        />
      </div>

      {tab === 'details' && (
        <PanelContentLayout>
          <FormSection title={t('common.details')}>
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableRow label={t('common.name')} value={pipe.name} onSave={(v) => handleSave('name', v)} />
                : <ReadOnlyRow label={t('common.name')} value={pipe.name} />
              }
              <ReadOnlyRow label="ID Pipeline" value={<span className="font-mono font-semibold">{pipe.pipeline_id}</span>} />
              {canUpdate
                ? <InlineEditableSelect label={t('assets.service')} value={pipe.service} options={pipelineServiceOptions} onSave={(v) => handleSave('service', v)} />
                : <ReadOnlyRow label={t('assets.service')} value={pipe.service ? <span className="gl-badge gl-badge-info">{pipe.service.replace(/_/g, ' ')}</span> : '—'} />
              }
              {canUpdate
                ? <InlineEditableTags label={t('common.status')} value={pipe.status} options={statusOptions} onSave={(v) => handleSave('status', v)} />
                : <ReadOnlyRow label={t('common.status')} value={<StatusBadge status={pipe.status} />} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.routing')} collapsible storageKey="panel.ar-pipe.sections" id="ar-pipe-routing">
            <GeoEditor
              geoType="linestring"
              value={apiGeoToEditorValue(pipe.geom_route)}
              onChange={(val) => handleSave('geom_route', editorValueToApiGeo(val))}
              readOnly={!canUpdate}
              height={200}
              showSearch={canUpdate}
              showToolbar={canUpdate}
              showCoordinateTable={false}
            />
            <DetailFieldGrid>
              <ReadOnlyRow label={t('assets.from_installation')} value={
                <CrossModuleLink module="ar-installation" id={pipe.from_installation_id} label={fromInst ? `${fromInst.code} — ${fromInst.name}` : '...'} />
              } />
              <ReadOnlyRow label={t('assets.to_installation')} value={
                <CrossModuleLink module="ar-installation" id={pipe.to_installation_id} label={toInst ? `${toInst.code} — ${toInst.name}` : '...'} />
              } />
              {canUpdate
                ? <InlineEditableRow label={t('assets.from_node')} value={pipe.from_node_description || ''} onSave={(v) => handleSave('from_node_description', v || null)} />
                : <ReadOnlyRow label={t('assets.from_node')} value={pipe.from_node_description || '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.to_node')} value={pipe.to_node_description || ''} onSave={(v) => handleSave('to_node_description', v || null)} />
                : <ReadOnlyRow label={t('assets.to_node')} value={pipe.to_node_description || '—'} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.dimensions_materials')} collapsible storageKey="panel.ar-pipe.sections" id="ar-pipe-dims">
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableRow label="DN (pouces)" value={String(pipe.nominal_diameter_in ?? '')} onSave={(v) => handleSave('nominal_diameter_in', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label="DN (pouces)" value={`${pipe.nominal_diameter_in}"`} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.od_mm')} value={String(pipe.od_mm ?? '')} onSave={(v) => handleSave('od_mm', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.od_mm')} value={fmtNum(pipe.od_mm, 'mm')} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.wall_thickness')} value={String(pipe.wall_thickness_mm ?? '')} onSave={(v) => handleSave('wall_thickness_mm', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.wall_thickness')} value={fmtNum(pipe.wall_thickness_mm, 'mm')} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.pipeline_length')} value={String(pipe.total_length_km ?? '')} onSave={(v) => handleSave('total_length_km', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.pipeline_length')} value={fmtNum(pipe.total_length_km, 'km')} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.onshore_length')} value={String(pipe.onshore_length_km ?? '')} onSave={(v) => handleSave('onshore_length_km', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.onshore_length')} value={fmtNum(pipe.onshore_length_km, 'km')} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.offshore_length')} value={String(pipe.offshore_length_km ?? '')} onSave={(v) => handleSave('offshore_length_km', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.offshore_length')} value={fmtNum(pipe.offshore_length_km, 'km')} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.pipe_material')} value={pipe.pipe_material || ''} onSave={(v) => handleSave('pipe_material', v || null)} />
                : <ReadOnlyRow label={t('assets.pipe_material')} value={pipe.pipe_material || '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.pipe_grade')} value={pipe.pipe_grade || ''} onSave={(v) => handleSave('pipe_grade', v || null)} />
                : <ReadOnlyRow label={t('assets.pipe_grade')} value={pipe.pipe_grade || '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.coating_external')} value={pipe.coating_external || ''} onSave={(v) => handleSave('coating_external', v || null)} />
                : <ReadOnlyRow label={t('assets.coating_external')} value={pipe.coating_external || '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.coating_internal')} value={pipe.coating_internal || ''} onSave={(v) => handleSave('coating_internal', v || null)} />
                : <ReadOnlyRow label={t('assets.coating_internal')} value={pipe.coating_internal || '—'} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.pressure_temp')} collapsible storageKey="panel.ar-pipe.sections" id="ar-pipe-pt">
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableRow label={t('assets.design_pressure')} value={String(pipe.design_pressure_barg ?? '')} onSave={(v) => handleSave('design_pressure_barg', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.design_pressure')} value={`${pipe.design_pressure_barg} barg`} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.design_temp_max')} value={String(pipe.design_temp_max_c ?? '')} onSave={(v) => handleSave('design_temp_max_c', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.design_temp_max')} value={`${pipe.design_temp_max_c} °C`} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.design_temp_min')} value={String(pipe.design_temp_min_c ?? '')} onSave={(v) => handleSave('design_temp_min_c', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.design_temp_min')} value={fmtNum(pipe.design_temp_min_c, '°C')} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.maop')} value={String(pipe.maop_barg ?? '')} onSave={(v) => handleSave('maop_barg', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.maop')} value={fmtNum(pipe.maop_barg, 'barg')} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.test_pressure')} value={String(pipe.test_pressure_barg ?? '')} onSave={(v) => handleSave('test_pressure_barg', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.test_pressure')} value={fmtNum(pipe.test_pressure_barg, 'barg')} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.max_water_depth')} value={String(pipe.max_water_depth_m ?? '')} onSave={(v) => handleSave('max_water_depth_m', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.max_water_depth')} value={fmtNum(pipe.max_water_depth_m, 'm')} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.fluid')} collapsible storageKey="panel.ar-pipe.sections" id="ar-pipe-fluid">
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableRow label={t('assets.fluid_description')} value={pipe.fluid_description || ''} onSave={(v) => handleSave('fluid_description', v || null)} />
                : <ReadOnlyRow label={t('assets.fluid_description')} value={pipe.fluid_description || '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.h2s_ppm')} value={String(pipe.h2s_ppm ?? '')} onSave={(v) => handleSave('h2s_ppm', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.h2s_ppm')} value={fmtNum(pipe.h2s_ppm, 'ppm')} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.co2_mol_pct')} value={String(pipe.co2_mol_pct ?? '')} onSave={(v) => handleSave('co2_mol_pct', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.co2_mol_pct')} value={fmtNum(pipe.co2_mol_pct, 'mol%')} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.pigging')} collapsible storageKey="panel.ar-pipe.sections" id="ar-pipe-pigging">
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableSelect label={t('assets.piggable')} value={pipe.piggable ? 'true' : 'false'} options={BOOL_OPTIONS} onSave={(v) => handleSave('piggable', v === 'true')} />
                : <ReadOnlyRow label={t('assets.piggable')} value={fmtBool(pipe.piggable, t)} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.pig_launcher')} value={pipe.pig_launcher_tag || ''} onSave={(v) => handleSave('pig_launcher_tag', v || null)} />
                : <ReadOnlyRow label={t('assets.pig_launcher')} value={pipe.pig_launcher_tag || '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.pig_receiver')} value={pipe.pig_receiver_tag || ''} onSave={(v) => handleSave('pig_receiver_tag', v || null)} />
                : <ReadOnlyRow label={t('assets.pig_receiver')} value={pipe.pig_receiver_tag || '—'} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.cathodic_protection')} collapsible storageKey="panel.ar-pipe.sections" id="ar-pipe-cp">
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableSelect label={t('assets.cp_required')} value={pipe.cp_required ? 'true' : 'false'} options={BOOL_OPTIONS} onSave={(v) => handleSave('cp_required', v === 'true')} />
                : <ReadOnlyRow label={t('assets.cp_required')} value={fmtBool(pipe.cp_required, t)} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.cp_type')} value={pipe.cp_type || ''} onSave={(v) => handleSave('cp_type', v || null)} />
                : <ReadOnlyRow label={t('assets.cp_type')} value={pipe.cp_type || '—'} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.integrity')} collapsible storageKey="panel.ar-pipe.sections" id="ar-pipe-integrity">
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableRow label={t('assets.design_code')} value={pipe.design_code || ''} onSave={(v) => handleSave('design_code', v || null)} />
                : <ReadOnlyRow label={t('assets.design_code')} value={pipe.design_code || '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.design_life')} value={String(pipe.design_life_years ?? '')} onSave={(v) => handleSave('design_life_years', v ? parseInt(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.design_life')} value={pipe.design_life_years ? `${pipe.design_life_years} ans` : '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.installation_year')} value={String(pipe.installation_year ?? '')} onSave={(v) => handleSave('installation_year', v ? parseInt(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.installation_year')} value={pipe.installation_year ?? '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.corrosion_allowance')} value={String(pipe.corrosion_allowance_mm ?? '')} onSave={(v) => handleSave('corrosion_allowance_mm', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.corrosion_allowance')} value={fmtNum(pipe.corrosion_allowance_mm, 'mm')} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.regulatory')} collapsible storageKey="panel.ar-pipe.sections" id="ar-pipe-regulatory">
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableRow label={t('assets.permit_number')} value={pipe.permit_number || ''} onSave={(v) => handleSave('permit_number', v || null)} />
                : <ReadOnlyRow label={t('assets.permit_number')} value={pipe.permit_number || '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.regulator')} value={pipe.regulator || ''} onSave={(v) => handleSave('regulator', v || null)} />
                : <ReadOnlyRow label={t('assets.regulator')} value={pipe.regulator || '—'} />
              }
            </DetailFieldGrid>
          </FormSection>


          {pipe.waypoints && pipe.waypoints.length > 0 && (
            <FormSection title={t('assets.waypoints')} collapsible storageKey="panel.ar-pipe.sections" id="ar-pipe-wpts">
              <div className="text-xs text-muted-foreground">{pipe.waypoints.length} point(s)</div>
              <div className="mt-2 max-h-40 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-1 px-1">#</th>
                      <th className="text-left py-1 px-1">Lat</th>
                      <th className="text-left py-1 px-1">Lon</th>
                      <th className="text-left py-1 px-1">KP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pipe.waypoints.map((wp) => (
                      <tr key={wp.id} className="border-b border-border/10">
                        <td className="py-1 px-1 font-mono">{wp.sequence_no}</td>
                        <td className="py-1 px-1 tabular-nums">{wp.latitude.toFixed(6)}</td>
                        <td className="py-1 px-1 tabular-nums">{wp.longitude.toFixed(6)}</td>
                        <td className="py-1 px-1 tabular-nums">{wp.chainage_km ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </FormSection>
          )}

          <FormSection title={t('common.tags')}>
            <TagManager ownerType="ar_pipeline" ownerId={id} compact />
          </FormSection>
        </PanelContentLayout>
      )}

      {tab === 'files' && <div className="p-4"><AttachmentManager ownerType="ar_pipeline" ownerId={id} /></div>}
      {tab === 'notes' && <div className="p-4"><NoteManager ownerType="ar_pipeline" ownerId={id} /></div>}
      {tab === 'refs' && <div className="p-4"><ExternalRefManager ownerType="ar_pipeline" ownerId={id} /></div>}
      {tab === 'history' && <AssetEntityChangeLog entityType="ar_pipeline" entityId={id} />}
    </DynamicPanelShell>
  )
}
