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
  Ship,
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
import { apiGeoToEditorValue, editorValueToApiGeo, latLonToPointValue } from '@/utils/geoHelpers'
import { usePermission } from '@/hooks/usePermission'
import { useUIStore } from '@/stores/uiStore'
import {
  useField, useUpdateField, useDeleteField,
  useSite, useSites, useUpdateSite, useDeleteSite,
  useInstallation, useInstallations, useUpdateInstallation, useDeleteInstallation,
  useEquipmentItem, useEquipmentList, useUpdateEquipment, useDeleteEquipment,
  usePipeline, useUpdatePipeline, useDeletePipeline,
  useCraneConfigurations,
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

const CRITICALITY_OPTIONS = [
  { value: 'A', label: 'A — Critique' },
  { value: 'B', label: 'B — Majeur' },
  { value: 'C', label: 'C — Mineur' },
]

const PIPELINE_SERVICE_FALLBACK = [
  { value: 'OIL', label: 'Pétrole' },
  { value: 'GAS', label: 'Gaz' },
  { value: 'WATER', label: 'Eau' },
  { value: 'MULTIPHASE', label: 'Multiphasique' },
  { value: 'CONDENSATE', label: 'Condensat' },
  { value: 'INJECTION', label: 'Injection' },
  { value: 'CHEMICAL', label: 'Chimique' },
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

function fmtCurrency(val: number | null | undefined) {
  if (val == null) return '—'
  return `${Number(val).toLocaleString()} USD`
}

function UrlLink({ url, label }: { url?: string | null; label: string }) {
  if (!url) return <span className="text-muted-foreground">—</span>
  return <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate text-xs">{label}</a>
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
      className="flex items-center gap-2 w-full rounded-md px-3 py-2 text-xs hover:bg-accent/60 transition-colors group border border-border/50"
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

          <FormSection title="Tags">
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
              <ReadOnlyRow label="Latitude" value={site.latitude ?? '—'} />
              <ReadOnlyRow label="Longitude" value={site.longitude ?? '—'} />
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


          <FormSection title="Tags">
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
              <ReadOnlyRow label="Latitude" value={inst.latitude ?? '—'} />
              <ReadOnlyRow label="Longitude" value={inst.longitude ?? '—'} />
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

          <FormSection title="Tags">
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
              <ReadOnlyRow label="Tag" value={<span className="font-mono font-semibold">{equip.tag_number}</span>} />
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
                : <ReadOnlyRow label="Latitude" value={equip.latitude ?? '—'} />
              }
              {canUpdate
                ? <InlineEditableRow label="Longitude" value={String(equip.longitude ?? '')} onSave={(v) => handleSave('longitude', v ? parseFloat(v) : null)} type="text" />
                : <ReadOnlyRow label="Longitude" value={equip.longitude ?? '—'} />
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

          <FormSection title="Tags">
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

          <FormSection title="Tags">
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
