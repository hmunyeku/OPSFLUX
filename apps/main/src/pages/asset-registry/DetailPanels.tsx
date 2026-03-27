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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TabBar, TabButton } from '@/components/ui/Tabs'
import {
  DynamicPanelShell,
  FormSection,
  PanelContentLayout,
  ReadOnlyRow,
  InlineEditableRow,
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
import { apiGeoToEditorValue, editorValueToApiGeo, latLonToPointValue } from '@/utils/geoHelpers'
import { usePermission } from '@/hooks/usePermission'
import { useUIStore } from '@/stores/uiStore'
import {
  useField, useUpdateField, useDeleteField,
  useSite, useUpdateSite, useDeleteSite,
  useInstallation, useUpdateInstallation, useDeleteInstallation,
  useEquipmentItem, useUpdateEquipment, useDeleteEquipment,
  usePipeline, useUpdatePipeline, useDeletePipeline,
} from '@/hooks/useAssetRegistry'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import {
  CreateFieldPanel,
  CreateSitePanel,
  CreateInstallationPanel,
  CreateEquipmentPanel,
  CreatePipelinePanel,
} from './CreatePanels'


// ── Helpers ─────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  OPERATIONAL: 'gl-badge-success',
  STANDBY: 'gl-badge-warning',
  UNDER_CONSTRUCTION: 'gl-badge-info',
  SUSPENDED: 'gl-badge-neutral',
  DECOMMISSIONED: 'gl-badge-danger',
  ABANDONED: 'gl-badge-danger',
}

const STATUS_OPTIONS = [
  { value: 'OPERATIONAL', label: 'Opérationnel' },
  { value: 'STANDBY', label: 'En attente' },
  { value: 'UNDER_CONSTRUCTION', label: 'En construction' },
  { value: 'SUSPENDED', label: 'Suspendu' },
  { value: 'DECOMMISSIONED', label: 'Décommissionné' },
  { value: 'ABANDONED', label: 'Abandonné' },
]

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('gl-badge', STATUS_COLORS[status] || 'gl-badge-neutral')}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

type PanelTab = 'details' | 'files' | 'notes' | 'refs'

function fmtBool(val: boolean | undefined | null, t: (k: string) => string) {
  return val ? t('common.yes') : t('common.no')
}

function fmtDate(val: string | null | undefined) {
  if (!val) return '—'
  try { return new Date(val).toLocaleDateString('fr-FR') } catch { return val }
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


// ════════════════════════════════════════════════════════════════
// FIELD DETAIL
// ════════════════════════════════════════════════════════════════

export function FieldDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canUpdate = hasPermission('asset.update')
  const canDelete = hasPermission('asset.delete')
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data: field } = useField(id)
  const updateField = useUpdateField()
  const deleteField = useDeleteField()
  const [tab, setTab] = useState<PanelTab>('details')

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
      icon={<MapPin size={16} />}
      headerRight={
        canDelete ? (
          <DangerConfirmButton confirmLabel={t('common.confirm_delete')} onConfirm={handleDelete}>{t('common.delete')}</DangerConfirmButton>
        ) : undefined
      }
    >
      <div className="border-b border-border px-3">
        <TabBar>
          <TabButton icon={Info} label={t('common.details')} active={tab === 'details'} onClick={() => setTab('details')} />
          <TabButton icon={Paperclip} label={t('common.files')} active={tab === 'files'} onClick={() => setTab('files')} />
          <TabButton icon={MessageSquare} label={t('common.notes')} active={tab === 'notes'} onClick={() => setTab('notes')} />
          <TabButton icon={ExternalLink} label={t('assets.references')} active={tab === 'refs'} onClick={() => setTab('refs')} />
        </TabBar>
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
                ? <InlineEditableTags label={t('common.status')} value={field.status} options={STATUS_OPTIONS} onSave={(v) => handleSave('status', v)} />
                : <ReadOnlyRow label={t('common.status')} value={<StatusBadge status={field.status} />} />
              }
              <ReadOnlyRow label={t('assets.country')} value={field.country} />
              {canUpdate
                ? <InlineEditableRow label={t('assets.operator')} value={field.operator || ''} onSave={(v) => handleSave('operator', v || null)} />
                : <ReadOnlyRow label={t('assets.operator')} value={field.operator || '—'} />
              }
              <ReadOnlyRow label={t('assets.environment')} value={field.environment || '—'} />
              {canUpdate
                ? <InlineEditableRow label={t('assets.regulator')} value={field.regulator || ''} onSave={(v) => handleSave('regulator', v || null)} />
                : <ReadOnlyRow label={t('assets.regulator')} value={field.regulator || '—'} />
              }
              <ReadOnlyRow label={t('assets.working_interest')} value={field.working_interest_pct ? `${field.working_interest_pct}%` : '—'} />
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.geology')} collapsible storageKey="panel.ar-field.sections" id="ar-field-geology">
            <DetailFieldGrid>
              <ReadOnlyRow label={t('assets.basin')} value={field.basin || '—'} />
              <ReadOnlyRow label={t('assets.block_name')} value={field.block_name || '—'} />
              <ReadOnlyRow label={t('assets.discovery_year')} value={field.discovery_year || '—'} />
              <ReadOnlyRow label={t('assets.first_production_year')} value={field.first_production_year || '—'} />
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
              <ReadOnlyRow label={t('assets.centroid_latitude')} value={field.centroid_latitude ?? '—'} />
              <ReadOnlyRow label={t('assets.centroid_longitude')} value={field.centroid_longitude ?? '—'} />
              <ReadOnlyRow label={t('assets.area_km2')} value={fmtNum(field.area_km2, 'km²')} />
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.reserves')} collapsible storageKey="panel.ar-field.sections" id="ar-field-reserves">
            <DetailFieldGrid>
              <ReadOnlyRow label={t('assets.original_oip')} value={fmtNum(field.original_oil_in_place_mmbo, 'MMbo')} />
              <ReadOnlyRow label={t('assets.recoverable_reserves')} value={fmtNum(field.recoverable_reserves_mmbo, 'MMbo')} />
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.license')} collapsible storageKey="panel.ar-field.sections" id="ar-field-license">
            <FieldLicenseManager fieldId={id} compact />
          </FormSection>

          <FormSection title="Tags">
            <TagManager ownerType="ar_field" ownerId={id} compact />
          </FormSection>
        </PanelContentLayout>
      )}

      {tab === 'files' && <div className="p-4"><AttachmentManager ownerType="ar_field" ownerId={id} /></div>}
      {tab === 'notes' && <div className="p-4"><NoteManager ownerType="ar_field" ownerId={id} /></div>}
      {tab === 'refs' && <div className="p-4"><ExternalRefManager ownerType="ar_field" ownerId={id} /></div>}
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
  const { data: site } = useSite(id)
  const { data: parentField } = useField(site?.field_id)
  const updateSite = useUpdateSite()
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
      subtitle={site.site_type.replace(/_/g, ' ')}
      icon={<Landmark size={16} />}
      headerRight={
        canDelete ? (
          <DangerConfirmButton confirmLabel={t('common.confirm_delete')} onConfirm={handleDelete}>{t('common.delete')}</DangerConfirmButton>
        ) : undefined
      }
    >
      <div className="border-b border-border px-3">
        <TabBar>
          <TabButton icon={Info} label={t('common.details')} active={tab === 'details'} onClick={() => setTab('details')} />
          <TabButton icon={Paperclip} label={t('common.files')} active={tab === 'files'} onClick={() => setTab('files')} />
          <TabButton icon={MessageSquare} label={t('common.notes')} active={tab === 'notes'} onClick={() => setTab('notes')} />
          <TabButton icon={ExternalLink} label={t('assets.references')} active={tab === 'refs'} onClick={() => setTab('refs')} />
        </TabBar>
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
              <ReadOnlyRow label={t('common.type')} value={<span className="gl-badge gl-badge-neutral">{site.site_type.replace(/_/g, ' ')}</span>} />
              {canUpdate
                ? <InlineEditableTags label={t('common.status')} value={site.status} options={STATUS_OPTIONS} onSave={(v) => handleSave('status', v)} />
                : <ReadOnlyRow label={t('common.status')} value={<StatusBadge status={site.status} />} />
              }
              <ReadOnlyRow label={t('assets.field_parent')} value={
                <CrossModuleLink module="ar-field" id={site.field_id} label={parentField ? `${parentField.code} — ${parentField.name}` : '...'} />
              } />
              <ReadOnlyRow label={t('assets.environment')} value={site.environment} />
              <ReadOnlyRow label={t('assets.country')} value={site.country} />
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.access')} collapsible storageKey="panel.ar-site.sections" id="ar-site-access">
            <DetailFieldGrid>
              <ReadOnlyRow label={t('assets.manned')} value={fmtBool(site.manned, t)} />
              <ReadOnlyRow label={t('assets.pob_capacity')} value={site.pob_capacity ?? '—'} />
              <ReadOnlyRow label={t('assets.water_depth')} value={fmtNum(site.water_depth_m, 'm')} />
              <ReadOnlyRow label={t('assets.access_road')} value={fmtBool(site.access_road, t)} />
              <ReadOnlyRow label={t('assets.access_helicopter')} value={fmtBool(site.access_helicopter, t)} />
              <ReadOnlyRow label={t('assets.access_vessel')} value={fmtBool(site.access_vessel, t)} />
              <ReadOnlyRow label={t('assets.helideck_available')} value={fmtBool(site.helideck_available, t)} />
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
              <ReadOnlyRow label={t('assets.max_wind_speed')} value={fmtNum(site.max_wind_speed_ms, 'm/s')} />
              <ReadOnlyRow label={t('assets.design_wave')} value={fmtNum(site.design_wave_height_m, 'm')} />
              <ReadOnlyRow label={t('assets.design_temp_max')} value={fmtNum(site.design_temp_max_c, '°C')} />
              <ReadOnlyRow label={t('assets.design_temp_min')} value={fmtNum(site.design_temp_min_c, '°C')} />
              <ReadOnlyRow label={t('assets.seismic_zone')} value={site.seismic_zone || '—'} />
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
              <ReadOnlyRow label={t('assets.region')} value={site.region || '—'} />
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.key_dates')} collapsible storageKey="panel.ar-site.sections" id="ar-site-dates">
            <DetailFieldGrid>
              <ReadOnlyRow label={t('assets.commissioning_date')} value={fmtDate(site.commissioning_date)} />
              <ReadOnlyRow label={t('assets.first_oil_date')} value={fmtDate(site.first_oil_date)} />
            </DetailFieldGrid>
          </FormSection>

          <FormSection title="Tags">
            <TagManager ownerType="ar_site" ownerId={id} compact />
          </FormSection>
        </PanelContentLayout>
      )}

      {tab === 'files' && <div className="p-4"><AttachmentManager ownerType="ar_site" ownerId={id} /></div>}
      {tab === 'notes' && <div className="p-4"><NoteManager ownerType="ar_site" ownerId={id} /></div>}
      {tab === 'refs' && <div className="p-4"><ExternalRefManager ownerType="ar_site" ownerId={id} /></div>}
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
  const { data: inst } = useInstallation(id)
  const { data: parentSite } = useSite(inst?.site_id)
  const updateInst = useUpdateInstallation()
  const deleteInst = useDeleteInstallation()
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
      subtitle={inst.installation_type.replace(/_/g, ' ')}
      icon={<Factory size={16} />}
      headerRight={
        canDelete ? (
          <DangerConfirmButton confirmLabel={t('common.confirm_delete')} onConfirm={handleDelete}>{t('common.delete')}</DangerConfirmButton>
        ) : undefined
      }
    >
      <div className="border-b border-border px-3">
        <TabBar>
          <TabButton icon={Info} label={t('common.details')} active={tab === 'details'} onClick={() => setTab('details')} />
          <TabButton icon={Paperclip} label={t('common.files')} active={tab === 'files'} onClick={() => setTab('files')} />
          <TabButton icon={MessageSquare} label={t('common.notes')} active={tab === 'notes'} onClick={() => setTab('notes')} />
          <TabButton icon={ExternalLink} label={t('assets.references')} active={tab === 'refs'} onClick={() => setTab('refs')} />
        </TabBar>
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
              <ReadOnlyRow label={t('common.type')} value={<span className="gl-badge gl-badge-neutral">{inst.installation_type.replace(/_/g, ' ')}</span>} />
              {canUpdate
                ? <InlineEditableTags label={t('common.status')} value={inst.status} options={STATUS_OPTIONS} onSave={(v) => handleSave('status', v)} />
                : <ReadOnlyRow label={t('common.status')} value={<StatusBadge status={inst.status} />} />
              }
              <ReadOnlyRow label={t('assets.site_parent')} value={
                <CrossModuleLink module="ar-site" id={inst.site_id} label={parentSite ? `${parentSite.code} — ${parentSite.name}` : '...'} />
              } />
              <ReadOnlyRow label={t('assets.environment')} value={inst.environment} />
              <ReadOnlyRow label={t('assets.manned')} value={fmtBool(inst.is_manned, t)} />
              <ReadOnlyRow label={t('assets.is_normally_unmanned')} value={fmtBool(inst.is_normally_unmanned, t)} />
              <ReadOnlyRow label={t('assets.pob_capacity')} value={inst.pob_max ?? '—'} />
              <ReadOnlyRow label={t('assets.helideck_available')} value={fmtBool(inst.helideck_available, t)} />
              <ReadOnlyRow label={t('assets.lifeboat_capacity')} value={inst.lifeboat_capacity ?? '—'} />
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
              <ReadOnlyRow label={t('assets.elevation_masl')} value={fmtNum(inst.elevation_masl, 'm AMSL')} />
              <ReadOnlyRow label={t('assets.water_depth')} value={fmtNum(inst.water_depth_m, 'm')} />
              <ReadOnlyRow label={t('assets.air_gap')} value={fmtNum(inst.air_gap_m, 'm')} />
              <ReadOnlyRow label={t('assets.orientation')} value={fmtNum(inst.orientation_deg, '°')} />
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.design')} collapsible storageKey="panel.ar-inst.sections" id="ar-inst-design">
            <DetailFieldGrid>
              <ReadOnlyRow label={t('assets.design_life')} value={inst.design_life_years ? `${inst.design_life_years} ans` : '—'} />
              <ReadOnlyRow label={t('assets.total_area_m2')} value={fmtNum(inst.total_area_m2, 'm²')} />
              <ReadOnlyRow label={t('assets.footprint_length')} value={fmtNum(inst.footprint_length_m, 'm')} />
              <ReadOnlyRow label={t('assets.footprint_width')} value={fmtNum(inst.footprint_width_m, 'm')} />
              <ReadOnlyRow label={t('assets.design_code')} value={inst.design_code || '—'} />
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.certification')} collapsible storageKey="panel.ar-inst.sections" id="ar-inst-cert">
            <DetailFieldGrid>
              <ReadOnlyRow label={t('assets.classification_society')} value={inst.classification_society || '—'} />
              <ReadOnlyRow label={t('assets.class_notation')} value={inst.class_notation || '—'} />
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.key_dates')} collapsible storageKey="panel.ar-inst.sections" id="ar-inst-dates">
            <DetailFieldGrid>
              <ReadOnlyRow label={t('assets.installation_date')} value={fmtDate(inst.installation_date)} />
              <ReadOnlyRow label={t('assets.commissioning_date')} value={fmtDate(inst.commissioning_date)} />
              <ReadOnlyRow label={t('assets.first_oil_date')} value={fmtDate(inst.first_oil_date)} />
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
        </PanelContentLayout>
      )}

      {tab === 'files' && <div className="p-4"><AttachmentManager ownerType="ar_installation" ownerId={id} /></div>}
      {tab === 'notes' && <div className="p-4"><NoteManager ownerType="ar_installation" ownerId={id} /></div>}
      {tab === 'refs' && <div className="p-4"><ExternalRefManager ownerType="ar_installation" ownerId={id} /></div>}
    </DynamicPanelShell>
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
      subtitle={`${equip.name} — ${equip.equipment_class.replace(/_/g, ' ')}`}
      icon={<Wrench size={16} />}
      headerRight={
        canDelete ? (
          <DangerConfirmButton confirmLabel={t('common.confirm_delete')} onConfirm={handleDelete}>{t('common.delete')}</DangerConfirmButton>
        ) : undefined
      }
    >
      <div className="border-b border-border px-3">
        <TabBar>
          <TabButton icon={Info} label={t('common.details')} active={tab === 'details'} onClick={() => setTab('details')} />
          <TabButton icon={Paperclip} label={t('common.files')} active={tab === 'files'} onClick={() => setTab('files')} />
          <TabButton icon={MessageSquare} label={t('common.notes')} active={tab === 'notes'} onClick={() => setTab('notes')} />
          <TabButton icon={ExternalLink} label={t('assets.references')} active={tab === 'refs'} onClick={() => setTab('refs')} />
        </TabBar>
      </div>

      {tab === 'details' && (
        <PanelContentLayout>
          <FormSection title={t('common.details')}>
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableRow label={t('common.name')} value={equip.name} onSave={(v) => handleSave('name', v)} />
                : <ReadOnlyRow label={t('common.name')} value={equip.name} />
              }
              <ReadOnlyRow label="Tag" value={<span className="font-mono font-semibold">{equip.tag_number}</span>} />
              <ReadOnlyRow label={t('assets.equipment_class')} value={<span className="gl-badge gl-badge-neutral">{equip.equipment_class.replace(/_/g, ' ')}</span>} />
              {canUpdate
                ? <InlineEditableTags label={t('common.status')} value={equip.status} options={STATUS_OPTIONS} onSave={(v) => handleSave('status', v)} />
                : <ReadOnlyRow label={t('common.status')} value={<StatusBadge status={equip.status} />} />
              }
              {equip.installation_id && (
                <ReadOnlyRow label={t('assets.installation_parent')} value={
                  <CrossModuleLink module="ar-installation" id={equip.installation_id} label={parentInstallation ? `${parentInstallation.code} — ${parentInstallation.name}` : '...'} />
                } />
              )}
              {equip.criticality && (
                <ReadOnlyRow label={t('assets.criticality')} value={
                  <span className={cn('gl-badge', equip.criticality === 'A' ? 'gl-badge-danger' : equip.criticality === 'B' ? 'gl-badge-warning' : 'gl-badge-neutral')}>
                    {equip.criticality}
                  </span>
                } />
              )}
              <ReadOnlyRow label={t('assets.safety_function')} value={fmtBool(equip.safety_function, t)} />
              <ReadOnlyRow label={t('assets.is_mobile')} value={fmtBool(equip.is_mobile, t)} />
              <ReadOnlyRow label={t('assets.area')} value={equip.area || '—'} />
              {equip.sub_area && <ReadOnlyRow label={t('assets.sub_area')} value={equip.sub_area} />}
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
              <ReadOnlyRow label={t('assets.year_manufactured')} value={equip.year_manufactured ?? '—'} />
              <ReadOnlyRow label={t('assets.year_installed')} value={equip.year_installed ?? '—'} />
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.technical_details')} collapsible storageKey="panel.ar-equip.sections" id="ar-equip-tech">
            <DetailFieldGrid>
              {equip.cert_number && <ReadOnlyRow label={t('assets.cert_number')} value={equip.cert_number} />}
              {equip.cert_authority && <ReadOnlyRow label={t('assets.cert_authority')} value={equip.cert_authority} />}
              {equip.drawing_number && <ReadOnlyRow label={t('assets.drawing_number')} value={equip.drawing_number} />}
              {equip.p_and_id_ref && <ReadOnlyRow label={t('assets.p_and_id_ref')} value={equip.p_and_id_ref} />}
              {equip.asset_number && <ReadOnlyRow label={t('assets.asset_number')} value={equip.asset_number} />}
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
              <ReadOnlyRow label={t('assets.grid_reference')} value={equip.grid_reference || '—'} />
              <ReadOnlyRow label="Latitude" value={equip.latitude ?? '—'} />
              <ReadOnlyRow label="Longitude" value={equip.longitude ?? '—'} />
              <ReadOnlyRow label={t('assets.elevation')} value={fmtNum(equip.elevation_m, 'm')} />
              <ReadOnlyRow label={t('assets.local_xyz')} value={
                equip.local_x_m != null || equip.local_y_m != null || equip.local_z_m != null
                  ? `${equip.local_x_m ?? '—'} / ${equip.local_y_m ?? '—'} / ${equip.local_z_m ?? '—'}`
                  : '—'
              } />
              <ReadOnlyRow label={t('assets.orientation')} value={fmtNum(equip.orientation_deg, '°')} />
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.finance')} collapsible storageKey="panel.ar-equip.sections" id="ar-equip-finance">
            <DetailFieldGrid>
              {canUpdate
                ? <InlineEditableRow label={t('assets.owner_company')} value={equip.owner_company || ''} onSave={(v) => handleSave('owner_company', v || null)} />
                : <ReadOnlyRow label={t('assets.owner_company')} value={equip.owner_company || '—'} />
              }
              <ReadOnlyRow label={t('assets.purchase_date')} value={fmtDate(equip.purchase_date)} />
              <ReadOnlyRow label={t('assets.purchase_cost')} value={fmtCurrency(equip.purchase_cost_usd)} />
              <ReadOnlyRow label={t('assets.replacement_cost')} value={fmtCurrency(equip.replacement_cost_usd)} />
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.documents_urls')} collapsible storageKey="panel.ar-equip.sections" id="ar-equip-docs">
            <DetailFieldGrid>
              <ReadOnlyRow label={t('assets.datasheet_url')} value={<UrlLink url={equip.datasheet_url} label={t('assets.datasheet_url')} />} />
              <ReadOnlyRow label={t('assets.manual_url')} value={<UrlLink url={equip.manual_url} label={t('assets.manual_url')} />} />
              <ReadOnlyRow label={t('assets.cert_document_url')} value={<UrlLink url={equip.cert_document_url} label={t('assets.cert_document_url')} />} />
            </DetailFieldGrid>
          </FormSection>

          {/* Specialized equipment sub-type fields */}
          <EquipmentContextualFields
            equipmentClass={equip.equipment_class}
            specializedData={equip.specialized_data}
            equipmentId={id}
          />

          <FormSection title="Tags">
            <TagManager ownerType="ar_equipment" ownerId={id} compact />
          </FormSection>
        </PanelContentLayout>
      )}

      {tab === 'files' && <div className="p-4"><AttachmentManager ownerType="ar_equipment" ownerId={id} /></div>}
      {tab === 'notes' && <div className="p-4"><NoteManager ownerType="ar_equipment" ownerId={id} /></div>}
      {tab === 'refs' && <div className="p-4"><ExternalRefManager ownerType="ar_equipment" ownerId={id} /></div>}
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
      icon={<Ship size={16} />}
      headerRight={
        canDelete ? (
          <DangerConfirmButton confirmLabel={t('common.confirm_delete')} onConfirm={handleDelete}>{t('common.delete')}</DangerConfirmButton>
        ) : undefined
      }
    >
      <div className="border-b border-border px-3">
        <TabBar>
          <TabButton icon={Info} label={t('common.details')} active={tab === 'details'} onClick={() => setTab('details')} />
          <TabButton icon={Paperclip} label={t('common.files')} active={tab === 'files'} onClick={() => setTab('files')} />
          <TabButton icon={MessageSquare} label={t('common.notes')} active={tab === 'notes'} onClick={() => setTab('notes')} />
          <TabButton icon={ExternalLink} label={t('assets.references')} active={tab === 'refs'} onClick={() => setTab('refs')} />
        </TabBar>
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
              <ReadOnlyRow label={t('assets.service')} value={<span className="gl-badge gl-badge-info">{pipe.service.replace(/_/g, ' ')}</span>} />
              {canUpdate
                ? <InlineEditableTags label={t('common.status')} value={pipe.status} options={STATUS_OPTIONS} onSave={(v) => handleSave('status', v)} />
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
              <ReadOnlyRow label={t('assets.from_node')} value={pipe.from_node_description || '—'} />
              <ReadOnlyRow label={t('assets.to_node')} value={pipe.to_node_description || '—'} />
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.dimensions_materials')} collapsible storageKey="panel.ar-pipe.sections" id="ar-pipe-dims">
            <DetailFieldGrid>
              <ReadOnlyRow label="DN (pouces)" value={`${pipe.nominal_diameter_in}"`} />
              <ReadOnlyRow label={t('assets.od_mm')} value={fmtNum(pipe.od_mm, 'mm')} />
              <ReadOnlyRow label={t('assets.wall_thickness')} value={fmtNum(pipe.wall_thickness_mm, 'mm')} />
              <ReadOnlyRow label={t('assets.pipeline_length')} value={fmtNum(pipe.total_length_km, 'km')} />
              <ReadOnlyRow label={t('assets.onshore_length')} value={fmtNum(pipe.onshore_length_km, 'km')} />
              <ReadOnlyRow label={t('assets.offshore_length')} value={fmtNum(pipe.offshore_length_km, 'km')} />
              <ReadOnlyRow label={t('assets.pipe_material')} value={pipe.pipe_material || '—'} />
              <ReadOnlyRow label={t('assets.pipe_grade')} value={pipe.pipe_grade || '—'} />
              <ReadOnlyRow label={t('assets.coating_external')} value={pipe.coating_external || '—'} />
              <ReadOnlyRow label={t('assets.coating_internal')} value={pipe.coating_internal || '—'} />
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.pressure_temp')} collapsible storageKey="panel.ar-pipe.sections" id="ar-pipe-pt">
            <DetailFieldGrid>
              <ReadOnlyRow label={t('assets.design_pressure')} value={`${pipe.design_pressure_barg} barg`} />
              <ReadOnlyRow label={t('assets.design_temp_max')} value={`${pipe.design_temp_max_c} °C`} />
              <ReadOnlyRow label={t('assets.design_temp_min')} value={fmtNum(pipe.design_temp_min_c, '°C')} />
              <ReadOnlyRow label={t('assets.maop')} value={fmtNum(pipe.maop_barg, 'barg')} />
              <ReadOnlyRow label={t('assets.test_pressure')} value={fmtNum(pipe.test_pressure_barg, 'barg')} />
              <ReadOnlyRow label={t('assets.max_water_depth')} value={fmtNum(pipe.max_water_depth_m, 'm')} />
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.fluid')} collapsible storageKey="panel.ar-pipe.sections" id="ar-pipe-fluid">
            <DetailFieldGrid>
              <ReadOnlyRow label={t('assets.fluid_description')} value={pipe.fluid_description || '—'} />
              <ReadOnlyRow label={t('assets.h2s_ppm')} value={fmtNum(pipe.h2s_ppm, 'ppm')} />
              <ReadOnlyRow label={t('assets.co2_mol_pct')} value={fmtNum(pipe.co2_mol_pct, 'mol%')} />
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.pigging')} collapsible storageKey="panel.ar-pipe.sections" id="ar-pipe-pigging">
            <DetailFieldGrid>
              <ReadOnlyRow label={t('assets.piggable')} value={fmtBool(pipe.piggable, t)} />
              <ReadOnlyRow label={t('assets.pig_launcher')} value={pipe.pig_launcher_tag || '—'} />
              <ReadOnlyRow label={t('assets.pig_receiver')} value={pipe.pig_receiver_tag || '—'} />
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.cathodic_protection')} collapsible storageKey="panel.ar-pipe.sections" id="ar-pipe-cp">
            <DetailFieldGrid>
              <ReadOnlyRow label={t('assets.cp_required')} value={fmtBool(pipe.cp_required, t)} />
              <ReadOnlyRow label={t('assets.cp_type')} value={pipe.cp_type || '—'} />
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.integrity')} collapsible storageKey="panel.ar-pipe.sections" id="ar-pipe-integrity">
            <DetailFieldGrid>
              <ReadOnlyRow label={t('assets.design_code')} value={pipe.design_code || '—'} />
              <ReadOnlyRow label={t('assets.design_life')} value={pipe.design_life_years ? `${pipe.design_life_years} ans` : '—'} />
              <ReadOnlyRow label={t('assets.installation_year')} value={pipe.installation_year ?? '—'} />
              <ReadOnlyRow label={t('assets.corrosion_allowance')} value={fmtNum(pipe.corrosion_allowance_mm, 'mm')} />
            </DetailFieldGrid>
          </FormSection>

          <FormSection title={t('assets.regulatory')} collapsible storageKey="panel.ar-pipe.sections" id="ar-pipe-regulatory">
            <DetailFieldGrid>
              <ReadOnlyRow label={t('assets.permit_number')} value={pipe.permit_number || '—'} />
              <ReadOnlyRow label={t('assets.regulator')} value={pipe.regulator || '—'} />
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
