/**
 * Detail panels for Asset Registry entities.
 * Each panel follows the DynamicPanelShell pattern with:
 * - Header with entity-type icon + title + status badge
 * - Semantic tab icons: Info, Paperclip, MessageSquare, ExternalLink
 * - 4 tabs: Détails | Fichiers | Notes | Références
 * - FK fields rendered as CrossModuleLink
 * - ExternalRefManager in the Références tab
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MapPin,
  Factory,
  Landmark,
  Wrench,
  Info,
  Paperclip,
  MessageSquare,
  ExternalLink,
  ArrowRight,
  History,
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
import { GeoEditor } from '@/components/shared/GeoEditor'
import { TagManager } from '@/components/shared/TagManager'
import { FieldLicenseManager } from '@/components/shared/FieldLicenseManager'
import { InstallationDeckManager } from '@/components/shared/InstallationDeckManager'
import { InstallationSubDetails } from './InstallationSubDetails'
import { AssetEntityChangeLog } from './AssetChangeHistory'
import { apiGeoToEditorValue, editorValueToApiGeo, latLonToPointValue } from '@/utils/geoHelpers'
import { usePermission } from '@/hooks/usePermission'
import { useUIStore } from '@/stores/uiStore'
import {
  useField, useUpdateField, useDeleteField,
  useSite, useSites, useUpdateSite, useDeleteSite,
  useInstallation, useInstallations, useUpdateInstallation, useDeleteInstallation,
  useEquipmentList,
} from '@/hooks/useAssetRegistry'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import {
  CreateFieldPanel,
  CreateSitePanel,
  CreateInstallationPanel,
  CreateEquipmentPanel,
  CreatePipelinePanel,
} from './CreatePanels'
import { formatDate } from '@/lib/i18n'
import { EquipmentDetailPanel, PipelineDetailPanel } from './DetailPanelsEquipmentPipeline'
// Re-export so AssetRegistryPage can keep its single-import convenience.
export { EquipmentDetailPanel, PipelineDetailPanel }


// ── Helpers ─────────────────────────────────────────────────

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

/** AR status options from dictionary with fallback to hardcoded. */
function useArStatusOptions() {
  const dictOpts = useDictionaryOptions('ar_status')
  return dictOpts.length ? dictOpts : STATUS_OPTIONS_FALLBACK
}

const BOOL_OPTIONS = [
  { value: 'true', label: 'Oui' },
  { value: 'false', label: 'Non' },
]

const ENVIRONMENT_OPTIONS = [
  { value: 'ONSHORE', label: 'Onshore' },
  { value: 'OFFSHORE', label: 'Offshore' },
  { value: 'SWAMP', label: 'Marécage' },
  { value: 'SHALLOW_WATER', label: 'Eaux peu profondes' },
  { value: 'DEEP_WATER', label: 'Eaux profondes' },
  { value: 'ULTRA_DEEP_WATER', label: 'Eaux ultra-profondes' },
]

const SITE_TYPE_OPTIONS = [
  { value: 'PLATFORM', label: 'Plateforme' },
  { value: 'FPSO', label: 'FPSO' },
  { value: 'WELLHEAD', label: 'Wellhead' },
  { value: 'ONSHORE_TERMINAL', label: 'Terminal terrestre' },
  { value: 'ONSHORE_PLANT', label: 'Usine terrestre' },
  { value: 'STORAGE', label: 'Stockage' },
  { value: 'CAMP', label: 'Camp' },
  { value: 'OTHER', label: 'Autre' },
]

const INSTALLATION_TYPE_OPTIONS = [
  { value: 'FIXED_PLATFORM', label: 'Plateforme fixe' },
  { value: 'FLOATING_UNIT', label: 'Unité flottante' },
  { value: 'SUBSEA', label: 'Sous-marin' },
  { value: 'WELLHEAD_PLATFORM', label: 'Plateforme wellhead' },
  { value: 'PROCESSING_PLATFORM', label: 'Plateforme de traitement' },
  { value: 'LIVING_QUARTERS', label: 'Quartiers de vie' },
  { value: 'COMPRESSION_MODULE', label: 'Module compression' },
  { value: 'ONSHORE_PLANT', label: 'Usine terrestre' },
  { value: 'TERMINAL', label: 'Terminal' },
  { value: 'PIPELINE_RISER', label: 'Pipeline Riser' },
  { value: 'OTHER', label: 'Autre' },
]



function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted-foreground">—</span>
  return (
    <span className={cn('gl-badge', STATUS_COLORS[status] || 'gl-badge-neutral')}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

type PanelTab = 'details' | 'files' | 'notes' | 'refs' | 'history'

function fmtBool(val: boolean | undefined | null, t: (k: string) => string) {
  return val ? t('common.yes') : t('common.no')
}

function fmtDate(val: string | null | undefined) {
  if (!val) return '—'
  try { return formatDate(val) } catch { return val }
}

function fmtNum(val: number | null | undefined, unit?: string) {
  if (val == null) return '—'
  return unit ? `${val} ${unit}` : String(val)
}


// ── Children / Cross-module links ────────────────────────────

interface ChildLinkProps {
  icon: typeof Landmark
  label: string
  count: number | undefined
  isLoading: boolean
  onClick: () => void
  iconColor: string
}

function ChildLink({ icon: Icon, label, count, isLoading, onClick, iconColor }: ChildLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="gl-button gl-button-sm gl-button-default flex w-full group"
    >
      <Icon size={14} className={iconColor} />
      <span className="text-foreground font-medium">{label}</span>
      <span className="ml-auto flex items-center gap-1">
        {isLoading ? (
          <span className="text-muted-foreground">...</span>
        ) : (
          <span className="gl-badge gl-badge-neutral font-semibold">{count ?? 0}</span>
        )}
        <ArrowRight size={12} className="text-muted-foreground group-hover:text-foreground transition-colors" />
      </span>
    </button>
  )
}


// ════════════════════════════════════════════════════════════════
// FIELD DETAIL
// ════════════════════════════════════════════════════════════════

export function FieldDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canUpdate = hasPermission('asset.update')
  const canDelete = hasPermission('asset.delete')
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const statusOptions = useArStatusOptions()
  const { data: field } = useField(id)
  const updateField = useUpdateField()
  const deleteField = useDeleteField()
  const [tab, setTab] = useState<PanelTab>('details')

  // Child count: sites belonging to this field
  const { data: childSites, isLoading: childSitesLoading } = useSites({ field_id: id, page_size: 1 })

  if (!field) return null

  const handleSave = (key: string, value: unknown) => {
    updateField.mutate({ id, data: { [key]: value } })
  }

  const handleDelete = async () => {
    await deleteField.mutateAsync(id)
    closeDynamicPanel()
  }

  return (
    <DynamicPanelShell
      title={`${field.code} — ${field.name}`}
      subtitle={t('assets.field')}
      icon={<MapPin size={14} />}
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
                ? <InlineEditableRow label={t('common.name')} value={field.name} onSave={(v) => handleSave('name', v)} />
                : <ReadOnlyRow label={t('common.name')} value={field.name} />
              }
              <ReadOnlyRow label={t('common.code')} value={<span className="font-mono font-semibold">{field.code}</span>} />
              {canUpdate
                ? <InlineEditableTags label={t('common.status')} value={field.status} options={statusOptions} onSave={(v) => handleSave('status', v)} />
                : <ReadOnlyRow label={t('common.status')} value={<StatusBadge status={field.status} />} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.country')} value={field.country || ''} onSave={(v) => handleSave('country', v || null)} />
                : <ReadOnlyRow label={t('assets.country')} value={field.country} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.operator')} value={field.operator || ''} onSave={(v) => handleSave('operator', v || null)} />
                : <ReadOnlyRow label={t('assets.operator')} value={field.operator || '—'} />
              }
              {canUpdate
                ? <InlineEditableSelect label={t('assets.environment')} value={field.environment || ''} options={ENVIRONMENT_OPTIONS} onSave={(v) => handleSave('environment', v || null)} />
                : <ReadOnlyRow label={t('assets.environment')} value={field.environment || '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.regulator')} value={field.regulator || ''} onSave={(v) => handleSave('regulator', v || null)} />
                : <ReadOnlyRow label={t('assets.regulator')} value={field.regulator || '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.working_interest')} value={String(field.working_interest_pct ?? '')} onSave={(v) => handleSave('working_interest_pct', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.working_interest')} value={field.working_interest_pct ? `${field.working_interest_pct}%` : '—'} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.geology')} collapsible storageKey="panel.ar-field.sections" id="ar-field-geology">
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableRow label={t('assets.basin')} value={field.basin || ''} onSave={(v) => handleSave('basin', v || null)} />
                : <ReadOnlyRow label={t('assets.basin')} value={field.basin || '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.block_name')} value={field.block_name || ''} onSave={(v) => handleSave('block_name', v || null)} />
                : <ReadOnlyRow label={t('assets.block_name')} value={field.block_name || '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.discovery_year')} value={String(field.discovery_year ?? '')} onSave={(v) => handleSave('discovery_year', v ? parseInt(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.discovery_year')} value={field.discovery_year ?? '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.first_production_year')} value={String(field.first_production_year ?? '')} onSave={(v) => handleSave('first_production_year', v ? parseInt(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.first_production_year')} value={field.first_production_year ?? '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.reservoir_formation')} value={field.reservoir_formation || ''} onSave={(v) => handleSave('reservoir_formation', v || null)} />
                : <ReadOnlyRow label={t('assets.reservoir_formation')} value={field.reservoir_formation || '—'} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.location')} collapsible storageKey="panel.ar-field.sections" id="ar-field-location">
            <GeoEditor
              geoType="point"
              value={apiGeoToEditorValue(field.geom_centroid) ?? latLonToPointValue(field.centroid_latitude, field.centroid_longitude)}
              onChange={(val) => {
                const geo = editorValueToApiGeo(val)
                handleSave('geom_centroid', geo)
              }}
              readOnly={!canUpdate}
              height={200}
              showSearch={canUpdate}
              showToolbar={canUpdate}
            />
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableRow label={t('assets.centroid_latitude')} value={String(field.centroid_latitude ?? '')} onSave={(v) => handleSave('centroid_latitude', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.centroid_latitude')} value={field.centroid_latitude ?? '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.centroid_longitude')} value={String(field.centroid_longitude ?? '')} onSave={(v) => handleSave('centroid_longitude', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.centroid_longitude')} value={field.centroid_longitude ?? '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.area_km2')} value={String(field.area_km2 ?? '')} onSave={(v) => handleSave('area_km2', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.area_km2')} value={fmtNum(field.area_km2, 'km²')} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.reserves')} collapsible storageKey="panel.ar-field.sections" id="ar-field-reserves">
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableRow label={t('assets.original_oip')} value={String(field.original_oil_in_place_mmbo ?? '')} onSave={(v) => handleSave('original_oil_in_place_mmbo', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.original_oip')} value={fmtNum(field.original_oil_in_place_mmbo, 'MMbo')} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.recoverable_reserves')} value={String(field.recoverable_reserves_mmbo ?? '')} onSave={(v) => handleSave('recoverable_reserves_mmbo', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.recoverable_reserves')} value={fmtNum(field.recoverable_reserves_mmbo, 'MMbo')} />
              }
            </DetailFieldGrid>
          </FormSection>


          <FormSection title={t('assets.license')} collapsible storageKey="panel.ar-field.sections" id="ar-field-license">
            <FieldLicenseManager fieldId={id} compact />
          </FormSection>

          <FormSection title={t('common.tags')}>
            <TagManager ownerType="ar_field" ownerId={id} compact />
          </FormSection>

          <FormSection title={t('assets.children')}>
            <ChildLink
              icon={Landmark}
              label={t('assets.sites')}
              count={childSites?.total}
              isLoading={childSitesLoading}
              iconColor="text-blue-500"
              onClick={() => {
                closeDynamicPanel()
                // Dispatch event so AssetRegistryPage can switch tab + set filter
                window.dispatchEvent(new CustomEvent('ar:navigate-children', { detail: { tab: 'sites', filterKey: 'field_id', filterValue: id } }))
              }}
            />
          </FormSection>
        </PanelContentLayout>
      )}

      {tab === 'files' && <div className="p-4"><AttachmentManager ownerType="ar_field" ownerId={id} /></div>}
      {tab === 'notes' && <div className="p-4"><NoteManager ownerType="ar_field" ownerId={id} /></div>}
      {tab === 'refs' && <div className="p-4"><ExternalRefManager ownerType="ar_field" ownerId={id} /></div>}
      {tab === 'history' && <AssetEntityChangeLog entityType="ar_field" entityId={id} />}
    </DynamicPanelShell>
  )
}


// ════════════════════════════════════════════════════════════════
// SITE DETAIL
// ════════════════════════════════════════════════════════════════

export function SiteDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canUpdate = hasPermission('asset.update')
  const canDelete = hasPermission('asset.delete')
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const statusOptions = useArStatusOptions()
  const { data: site } = useSite(id)
  const { data: parentField } = useField(site?.field_id)
  const updateSite = useUpdateSite()

  // Child count: installations belonging to this site
  const { data: childInstallations, isLoading: childInstLoading } = useInstallations({ site_id: id, page_size: 1 })
  const deleteSite = useDeleteSite()
  const [tab, setTab] = useState<PanelTab>('details')

  if (!site) return null

  const handleSave = (key: string, value: unknown) => {
    updateSite.mutate({ id, data: { [key]: value } })
  }

  const handleDelete = async () => {
    await deleteSite.mutateAsync(id)
    closeDynamicPanel()
  }

  return (
    <DynamicPanelShell
      title={`${site.code} — ${site.name}`}
      subtitle={site.site_type ? site.site_type.replace(/_/g, ' ') : ''}
      icon={<Landmark size={14} />}
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
                ? <InlineEditableRow label={t('common.name')} value={site.name} onSave={(v) => handleSave('name', v)} />
                : <ReadOnlyRow label={t('common.name')} value={site.name} />
              }
              <ReadOnlyRow label={t('common.code')} value={<span className="font-mono font-semibold">{site.code}</span>} />
              {canUpdate
                ? <InlineEditableSelect label={t('common.type')} value={site.site_type} options={SITE_TYPE_OPTIONS} onSave={(v) => handleSave('site_type', v)} />
                : <ReadOnlyRow label={t('common.type')} value={site.site_type ? <span className="gl-badge gl-badge-neutral">{site.site_type.replace(/_/g, ' ')}</span> : '—'} />
              }
              {canUpdate
                ? <InlineEditableTags label={t('common.status')} value={site.status} options={statusOptions} onSave={(v) => handleSave('status', v)} />
                : <ReadOnlyRow label={t('common.status')} value={<StatusBadge status={site.status} />} />
              }
              <ReadOnlyRow label={t('assets.field_parent')} value={
                <CrossModuleLink module="ar-field" id={site.field_id} label={parentField ? `${parentField.code} — ${parentField.name}` : '...'} />
              } />
              {canUpdate
                ? <InlineEditableSelect label={t('assets.environment')} value={site.environment || ''} options={ENVIRONMENT_OPTIONS} onSave={(v) => handleSave('environment', v || null)} />
                : <ReadOnlyRow label={t('assets.environment')} value={site.environment} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.country')} value={site.country || ''} onSave={(v) => handleSave('country', v || null)} />
                : <ReadOnlyRow label={t('assets.country')} value={site.country} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.access')} collapsible storageKey="panel.ar-site.sections" id="ar-site-access">
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableSelect label={t('assets.manned')} value={site.manned ? 'true' : 'false'} options={BOOL_OPTIONS} onSave={(v) => handleSave('manned', v === 'true')} />
                : <ReadOnlyRow label={t('assets.manned')} value={fmtBool(site.manned, t)} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.pob_capacity')} value={String(site.pob_capacity ?? '')} onSave={(v) => handleSave('pob_capacity', v ? parseInt(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.pob_capacity')} value={site.pob_capacity ?? '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.water_depth')} value={String(site.water_depth_m ?? '')} onSave={(v) => handleSave('water_depth_m', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.water_depth')} value={fmtNum(site.water_depth_m, 'm')} />
              }
              {canUpdate
                ? <InlineEditableSelect label={t('assets.access_road')} value={site.access_road ? 'true' : 'false'} options={BOOL_OPTIONS} onSave={(v) => handleSave('access_road', v === 'true')} />
                : <ReadOnlyRow label={t('assets.access_road')} value={fmtBool(site.access_road, t)} />
              }
              {canUpdate
                ? <InlineEditableSelect label={t('assets.access_helicopter')} value={site.access_helicopter ? 'true' : 'false'} options={BOOL_OPTIONS} onSave={(v) => handleSave('access_helicopter', v === 'true')} />
                : <ReadOnlyRow label={t('assets.access_helicopter')} value={fmtBool(site.access_helicopter, t)} />
              }
              {canUpdate
                ? <InlineEditableSelect label={t('assets.access_vessel')} value={site.access_vessel ? 'true' : 'false'} options={BOOL_OPTIONS} onSave={(v) => handleSave('access_vessel', v === 'true')} />
                : <ReadOnlyRow label={t('assets.access_vessel')} value={fmtBool(site.access_vessel, t)} />
              }
              {canUpdate
                ? <InlineEditableSelect label={t('assets.helideck_available')} value={site.helideck_available ? 'true' : 'false'} options={BOOL_OPTIONS} onSave={(v) => handleSave('helideck_available', v === 'true')} />
                : <ReadOnlyRow label={t('assets.helideck_available')} value={fmtBool(site.helideck_available, t)} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.nearest_airport')} value={site.nearest_airport || ''} onSave={(v) => handleSave('nearest_airport', v || null)} />
                : <ReadOnlyRow label={t('assets.nearest_airport')} value={site.nearest_airport || '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.nearest_port')} value={site.nearest_port || ''} onSave={(v) => handleSave('nearest_port', v || null)} />
                : <ReadOnlyRow label={t('assets.nearest_port')} value={site.nearest_port || '—'} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.operations')} collapsible storageKey="panel.ar-site.sections" id="ar-site-operations">
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableRow label={t('assets.power_source')} value={site.power_source || ''} onSave={(v) => handleSave('power_source', v || null)} />
                : <ReadOnlyRow label={t('assets.power_source')} value={site.power_source || '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.comms_system')} value={site.comms_system || ''} onSave={(v) => handleSave('comms_system', v || null)} />
                : <ReadOnlyRow label={t('assets.comms_system')} value={site.comms_system || '—'} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.design_conditions')} collapsible storageKey="panel.ar-site.sections" id="ar-site-design">
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableRow label={t('assets.max_wind_speed')} value={String(site.max_wind_speed_ms ?? '')} onSave={(v) => handleSave('max_wind_speed_ms', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.max_wind_speed')} value={fmtNum(site.max_wind_speed_ms, 'm/s')} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.design_wave')} value={String(site.design_wave_height_m ?? '')} onSave={(v) => handleSave('design_wave_height_m', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.design_wave')} value={fmtNum(site.design_wave_height_m, 'm')} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.design_temp_max')} value={String(site.design_temp_max_c ?? '')} onSave={(v) => handleSave('design_temp_max_c', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.design_temp_max')} value={fmtNum(site.design_temp_max_c, '°C')} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.design_temp_min')} value={String(site.design_temp_min_c ?? '')} onSave={(v) => handleSave('design_temp_min_c', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.design_temp_min')} value={fmtNum(site.design_temp_min_c, '°C')} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.seismic_zone')} value={site.seismic_zone || ''} onSave={(v) => handleSave('seismic_zone', v || null)} />
                : <ReadOnlyRow label={t('assets.seismic_zone')} value={site.seismic_zone || '—'} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.location')} collapsible storageKey="panel.ar-site.sections" id="ar-site-location">
            <GeoEditor
              geoType="point"
              value={apiGeoToEditorValue(site.geom_point) ?? latLonToPointValue(site.latitude, site.longitude)}
              onChange={(val) => handleSave('geom_point', editorValueToApiGeo(val))}
              readOnly={!canUpdate}
              height={200}
              showSearch={canUpdate}
              showToolbar={canUpdate}
            />
            <DetailFieldGrid>
              <ReadOnlyRow label={t('common.latitude')} value={site.latitude ?? '—'} />
              <ReadOnlyRow label={t('common.longitude')} value={site.longitude ?? '—'} />
              {canUpdate
                ? <InlineEditableRow label={t('assets.region')} value={site.region || ''} onSave={(v) => handleSave('region', v || null)} />
                : <ReadOnlyRow label={t('assets.region')} value={site.region || '—'} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.key_dates')} collapsible storageKey="panel.ar-site.sections" id="ar-site-dates">
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableRow label={t('assets.commissioning_date')} value={site.commissioning_date || ''} onSave={(v) => handleSave('commissioning_date', v || null)} type="date" />
                : <ReadOnlyRow label={t('assets.commissioning_date')} value={fmtDate(site.commissioning_date)} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.first_oil_date')} value={site.first_oil_date || ''} onSave={(v) => handleSave('first_oil_date', v || null)} type="date" />
                : <ReadOnlyRow label={t('assets.first_oil_date')} value={fmtDate(site.first_oil_date)} />
              }
            </DetailFieldGrid>
          </FormSection>


          <FormSection title={t('common.tags')}>
            <TagManager ownerType="ar_site" ownerId={id} compact />
          </FormSection>

          <FormSection title={t('assets.children')}>
            <ChildLink
              icon={Factory}
              label={t('assets.installations')}
              count={childInstallations?.total}
              isLoading={childInstLoading}
              iconColor="text-orange-500"
              onClick={() => {
                closeDynamicPanel()
                window.dispatchEvent(new CustomEvent('ar:navigate-children', { detail: { tab: 'installations', filterKey: 'site_id', filterValue: id } }))
              }}
            />
          </FormSection>
        </PanelContentLayout>
      )}

      {tab === 'files' && <div className="p-4"><AttachmentManager ownerType="ar_site" ownerId={id} /></div>}
      {tab === 'notes' && <div className="p-4"><NoteManager ownerType="ar_site" ownerId={id} /></div>}
      {tab === 'refs' && <div className="p-4"><ExternalRefManager ownerType="ar_site" ownerId={id} /></div>}
      {tab === 'history' && <AssetEntityChangeLog entityType="ar_site" entityId={id} />}
    </DynamicPanelShell>
  )
}


// ════════════════════════════════════════════════════════════════
// INSTALLATION DETAIL
// ════════════════════════════════════════════════════════════════

export function InstallationDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canUpdate = hasPermission('asset.update')
  const canDelete = hasPermission('asset.delete')
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const statusOptions = useArStatusOptions()
  const { data: inst } = useInstallation(id)
  const { data: parentSite } = useSite(inst?.site_id)
  const updateInst = useUpdateInstallation()
  const deleteInst = useDeleteInstallation()

  // Child count: equipment belonging to this installation
  const { data: childEquipment, isLoading: childEquipLoading } = useEquipmentList({ installation_id: id, page_size: 1 })
  const [tab, setTab] = useState<PanelTab>('details')

  if (!inst) return null

  const handleSave = (key: string, value: unknown) => {
    updateInst.mutate({ id, data: { [key]: value } })
  }

  const handleDelete = async () => {
    await deleteInst.mutateAsync(id)
    closeDynamicPanel()
  }

  return (
    <DynamicPanelShell
      title={`${inst.code} — ${inst.name}`}
      subtitle={inst.installation_type ? inst.installation_type.replace(/_/g, ' ') : ''}
      icon={<Factory size={14} />}
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
                ? <InlineEditableRow label={t('common.name')} value={inst.name} onSave={(v) => handleSave('name', v)} />
                : <ReadOnlyRow label={t('common.name')} value={inst.name} />
              }
              <ReadOnlyRow label={t('common.code')} value={<span className="font-mono font-semibold">{inst.code}</span>} />
              {canUpdate
                ? <InlineEditableSelect label={t('common.type')} value={inst.installation_type} options={INSTALLATION_TYPE_OPTIONS} onSave={(v) => handleSave('installation_type', v)} />
                : <ReadOnlyRow label={t('common.type')} value={inst.installation_type ? <span className="gl-badge gl-badge-neutral">{inst.installation_type.replace(/_/g, ' ')}</span> : '—'} />
              }
              {canUpdate
                ? <InlineEditableTags label={t('common.status')} value={inst.status} options={statusOptions} onSave={(v) => handleSave('status', v)} />
                : <ReadOnlyRow label={t('common.status')} value={<StatusBadge status={inst.status} />} />
              }
              <ReadOnlyRow label={t('assets.site_parent')} value={
                <CrossModuleLink module="ar-site" id={inst.site_id} label={parentSite ? `${parentSite.code} — ${parentSite.name}` : '...'} />
              } />
              {canUpdate
                ? <InlineEditableSelect label={t('assets.environment')} value={inst.environment || ''} options={ENVIRONMENT_OPTIONS} onSave={(v) => handleSave('environment', v || null)} />
                : <ReadOnlyRow label={t('assets.environment')} value={inst.environment} />
              }
              {canUpdate
                ? <InlineEditableSelect label={t('assets.manned')} value={inst.is_manned ? 'true' : 'false'} options={BOOL_OPTIONS} onSave={(v) => handleSave('is_manned', v === 'true')} />
                : <ReadOnlyRow label={t('assets.manned')} value={fmtBool(inst.is_manned, t)} />
              }
              {canUpdate
                ? <InlineEditableSelect label={t('assets.is_normally_unmanned')} value={inst.is_normally_unmanned ? 'true' : 'false'} options={BOOL_OPTIONS} onSave={(v) => handleSave('is_normally_unmanned', v === 'true')} />
                : <ReadOnlyRow label={t('assets.is_normally_unmanned')} value={fmtBool(inst.is_normally_unmanned, t)} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.pob_capacity')} value={String(inst.pob_capacity ?? '')} onSave={(v) => handleSave('pob_capacity', v ? parseInt(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.pob_capacity')} value={inst.pob_capacity ?? '—'} />
              }
              {canUpdate
                ? <InlineEditableSelect label={t('assets.helideck_available')} value={inst.helideck_available ? 'true' : 'false'} options={BOOL_OPTIONS} onSave={(v) => handleSave('helideck_available', v === 'true')} />
                : <ReadOnlyRow label={t('assets.helideck_available')} value={fmtBool(inst.helideck_available, t)} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.lifeboat_capacity')} value={String(inst.lifeboat_capacity ?? '')} onSave={(v) => handleSave('lifeboat_capacity', v ? parseInt(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.lifeboat_capacity')} value={inst.lifeboat_capacity ?? '—'} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.location')} collapsible storageKey="panel.ar-inst.sections" id="ar-inst-location">
            <GeoEditor
              geoType="point"
              value={apiGeoToEditorValue(inst.geom_point) ?? latLonToPointValue(inst.latitude, inst.longitude)}
              onChange={(val) => handleSave('geom_point', editorValueToApiGeo(val))}
              readOnly={!canUpdate}
              height={200}
              showSearch={canUpdate}
              showToolbar={canUpdate}
            />
            <DetailFieldGrid>
              <ReadOnlyRow label={t('common.latitude')} value={inst.latitude ?? '—'} />
              <ReadOnlyRow label={t('common.longitude')} value={inst.longitude ?? '—'} />
              {canUpdate
                ? <InlineEditableRow label={t('assets.elevation_masl')} value={String(inst.elevation_masl ?? '')} onSave={(v) => handleSave('elevation_masl', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.elevation_masl')} value={fmtNum(inst.elevation_masl, 'm AMSL')} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.water_depth')} value={String(inst.water_depth_m ?? '')} onSave={(v) => handleSave('water_depth_m', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.water_depth')} value={fmtNum(inst.water_depth_m, 'm')} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.air_gap')} value={String(inst.air_gap_m ?? '')} onSave={(v) => handleSave('air_gap_m', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.air_gap')} value={fmtNum(inst.air_gap_m, 'm')} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.orientation')} value={String(inst.orientation_deg ?? '')} onSave={(v) => handleSave('orientation_deg', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.orientation')} value={fmtNum(inst.orientation_deg, '°')} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.design')} collapsible storageKey="panel.ar-inst.sections" id="ar-inst-design">
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableRow label={t('assets.design_life')} value={String(inst.design_life_years ?? '')} onSave={(v) => handleSave('design_life_years', v ? parseInt(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.design_life')} value={inst.design_life_years ? `${inst.design_life_years} ans` : '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.total_area_m2')} value={String(inst.total_area_m2 ?? '')} onSave={(v) => handleSave('total_area_m2', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.total_area_m2')} value={fmtNum(inst.total_area_m2, 'm²')} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.footprint_length')} value={String(inst.footprint_length_m ?? '')} onSave={(v) => handleSave('footprint_length_m', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.footprint_length')} value={fmtNum(inst.footprint_length_m, 'm')} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.footprint_width')} value={String(inst.footprint_width_m ?? '')} onSave={(v) => handleSave('footprint_width_m', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label={t('assets.footprint_width')} value={fmtNum(inst.footprint_width_m, 'm')} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.design_code')} value={inst.design_code || ''} onSave={(v) => handleSave('design_code', v || null)} />
                : <ReadOnlyRow label={t('assets.design_code')} value={inst.design_code || '—'} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.certification')} collapsible storageKey="panel.ar-inst.sections" id="ar-inst-cert">
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableRow label={t('assets.classification_society')} value={inst.classification_society || ''} onSave={(v) => handleSave('classification_society', v || null)} />
                : <ReadOnlyRow label={t('assets.classification_society')} value={inst.classification_society || '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.class_notation')} value={inst.class_notation || ''} onSave={(v) => handleSave('class_notation', v || null)} />
                : <ReadOnlyRow label={t('assets.class_notation')} value={inst.class_notation || '—'} />
              }
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.key_dates')} collapsible storageKey="panel.ar-inst.sections" id="ar-inst-dates">
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableRow label={t('assets.installation_date')} value={inst.installation_date || ''} onSave={(v) => handleSave('installation_date', v || null)} type="date" />
                : <ReadOnlyRow label={t('assets.installation_date')} value={fmtDate(inst.installation_date)} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.commissioning_date')} value={inst.commissioning_date || ''} onSave={(v) => handleSave('commissioning_date', v || null)} type="date" />
                : <ReadOnlyRow label={t('assets.commissioning_date')} value={fmtDate(inst.commissioning_date)} />
              }
              {canUpdate
                ? <InlineEditableRow label={t('assets.first_oil_date')} value={inst.first_oil_date || ''} onSave={(v) => handleSave('first_oil_date', v || null)} type="date" />
                : <ReadOnlyRow label={t('assets.first_oil_date')} value={fmtDate(inst.first_oil_date)} />
              }
            </DetailFieldGrid>
          </FormSection>


          <FormSection title={t('assets.inst_sub.decks')} collapsible storageKey="panel.ar-inst.sections" id="ar-inst-decks">
            <InstallationDeckManager installationId={id} compact />
          </FormSection>

          {/* Offshore / Onshore / Type-specific sub-details */}
          <InstallationSubDetails
            installationType={inst.installation_type}
            environment={inst.environment}
            offshoreDetails={inst.inst_offshore_details}
            onshoreDetails={inst.inst_onshore_details}
            typeDetails={inst.inst_type_details}
          />

          <FormSection title={t('common.tags')}>
            <TagManager ownerType="ar_installation" ownerId={id} compact />
          </FormSection>

          <FormSection title={t('assets.children')}>
            <ChildLink
              icon={Wrench}
              label={t('assets.equipment_tab')}
              count={childEquipment?.total}
              isLoading={childEquipLoading}
              iconColor="text-purple-500"
              onClick={() => {
                closeDynamicPanel()
                window.dispatchEvent(new CustomEvent('ar:navigate-children', { detail: { tab: 'equipment', filterKey: 'installation_id', filterValue: id } }))
              }}
            />
          </FormSection>
        </PanelContentLayout>
      )}

      {tab === 'files' && <div className="p-4"><AttachmentManager ownerType="ar_installation" ownerId={id} /></div>}
      {tab === 'notes' && <div className="p-4"><NoteManager ownerType="ar_installation" ownerId={id} /></div>}
      {tab === 'refs' && <div className="p-4"><ExternalRefManager ownerType="ar_installation" ownerId={id} /></div>}
      {tab === 'history' && <AssetEntityChangeLog entityType="ar_installation" entityId={id} />}
    </DynamicPanelShell>
  )
}


// ════════════════════════════════════════════════════════════════
// CRANE — Sub-model sections (configs, load chart, lift zones, hooks, reeving)


// ════════════════════════════════════════════════════════════════
// PANEL RENDERER REGISTRATIONS
// ════════════════════════════════════════════════════════════════

registerPanelRenderer('ar-field', (view) => {
  if (view.type === 'create') return <CreateFieldPanel />
  if ((view.type === 'detail' || view.type === 'edit') && 'id' in view) return <FieldDetailPanel id={view.id} />
  return null
})

registerPanelRenderer('ar-site', (view) => {
  if (view.type === 'create') return <CreateSitePanel />
  if ((view.type === 'detail' || view.type === 'edit') && 'id' in view) return <SiteDetailPanel id={view.id} />
  return null
})

registerPanelRenderer('ar-installation', (view) => {
  if (view.type === 'create') return <CreateInstallationPanel />
  if ((view.type === 'detail' || view.type === 'edit') && 'id' in view) return <InstallationDetailPanel id={view.id} />
  return null
})

registerPanelRenderer('ar-equipment', (view) => {
  if (view.type === 'create') return <CreateEquipmentPanel />
  if ((view.type === 'detail' || view.type === 'edit') && 'id' in view) return <EquipmentDetailPanel id={view.id} />
  return null
})

registerPanelRenderer('ar-pipeline', (view) => {
  if (view.type === 'create') return <CreatePipelinePanel />
  if ((view.type === 'detail' || view.type === 'edit') && 'id' in view) return <PipelineDetailPanel id={view.id} />
  return null
})
