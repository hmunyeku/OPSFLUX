/**
 * Detail panels for Asset Registry entities.
 * Each panel follows the DynamicPanelShell pattern with:
 * - Header with title + status badge
 * - Inline editable fields (if permission)
 * - Tabs: Fichiers | Notes
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapPin, Factory, Landmark, Wrench, Ship } from 'lucide-react'
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
} from '@/components/layout/DynamicPanel'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { TagManager } from '@/components/shared/TagManager'
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


// ── Status helpers ──────────────────────────────────────────

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

type PanelTab = 'details' | 'files' | 'notes'


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
          <DangerConfirmButton
            confirmLabel={t('common.confirm_delete')}
            onConfirm={handleDelete}
          >
            {t('common.delete')}
          </DangerConfirmButton>
        ) : undefined
      }
    >
      <div className="border-b border-border px-3">
        <TabBar>
          <TabButton icon={MapPin} label={t('common.details')} active={tab === 'details'} onClick={() => setTab('details')} />
          <TabButton icon={Landmark} label={t('common.files')} active={tab === 'files'} onClick={() => setTab('files')} />
          <TabButton icon={Factory} label={t('common.notes')} active={tab === 'notes'} onClick={() => setTab('notes')} />
        </TabBar>
      </div>

      {tab === 'details' && (
        <PanelContentLayout>
          <FormSection title={t('common.details')}>
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
          </FormSection>

          <FormSection title={t('assets.geology')} collapsible storageKey="panel.ar-field.sections" id="ar-field-geology">
            <ReadOnlyRow label={t('assets.basin')} value={field.basin || '—'} />
            <ReadOnlyRow label={t('assets.block_name')} value={field.block_name || '—'} />
            <ReadOnlyRow label={t('assets.discovery_year')} value={field.discovery_year || '—'} />
            <ReadOnlyRow label={t('assets.first_production_year')} value={field.first_production_year || '—'} />
          </FormSection>

          <FormSection title={t('assets.license')} collapsible storageKey="panel.ar-field.sections" id="ar-field-license">
            <ReadOnlyRow label={t('assets.license_number')} value={field.license_number || '—'} />
          </FormSection>

          <FormSection title="Tags">
            <TagManager ownerType="ar_field" ownerId={id} compact />
          </FormSection>
        </PanelContentLayout>
      )}

      {tab === 'files' && (
        <div className="p-4">
          <AttachmentManager ownerType="ar_field" ownerId={id} />
        </div>
      )}

      {tab === 'notes' && (
        <div className="p-4">
          <NoteManager ownerType="ar_field" ownerId={id} />
        </div>
      )}
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
          <TabButton icon={Landmark} label={t('common.details')} active={tab === 'details'} onClick={() => setTab('details')} />
          <TabButton icon={Landmark} label={t('common.files')} active={tab === 'files'} onClick={() => setTab('files')} />
          <TabButton icon={Landmark} label={t('common.notes')} active={tab === 'notes'} onClick={() => setTab('notes')} />
        </TabBar>
      </div>

      {tab === 'details' && (
        <PanelContentLayout>
          <FormSection title={t('common.details')}>
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
            <ReadOnlyRow label={t('assets.environment')} value={site.environment} />
            <ReadOnlyRow label={t('assets.country')} value={site.country} />
          </FormSection>

          <FormSection title={t('assets.access')} collapsible storageKey="panel.ar-site.sections" id="ar-site-access">
            <ReadOnlyRow label={t('assets.manned')} value={site.manned ? t('common.yes') : t('common.no')} />
            <ReadOnlyRow label={t('assets.pob_capacity')} value={site.pob_capacity ?? '—'} />
            <ReadOnlyRow label={t('assets.water_depth')} value={site.water_depth_m ? `${site.water_depth_m} m` : '—'} />
          </FormSection>

          <FormSection title="Tags">
            <TagManager ownerType="ar_site" ownerId={id} compact />
          </FormSection>
        </PanelContentLayout>
      )}

      {tab === 'files' && <div className="p-4"><AttachmentManager ownerType="ar_site" ownerId={id} /></div>}
      {tab === 'notes' && <div className="p-4"><NoteManager ownerType="ar_site" ownerId={id} /></div>}
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
          <TabButton icon={Factory} label={t('common.details')} active={tab === 'details'} onClick={() => setTab('details')} />
          <TabButton icon={Factory} label={t('common.files')} active={tab === 'files'} onClick={() => setTab('files')} />
          <TabButton icon={Factory} label={t('common.notes')} active={tab === 'notes'} onClick={() => setTab('notes')} />
        </TabBar>
      </div>

      {tab === 'details' && (
        <PanelContentLayout>
          <FormSection title={t('common.details')}>
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
            <ReadOnlyRow label={t('assets.environment')} value={inst.environment} />
            <ReadOnlyRow label={t('assets.manned')} value={inst.is_manned ? t('common.yes') : t('common.no')} />
            <ReadOnlyRow label={t('assets.pob_capacity')} value={inst.pob_max ?? '—'} />
          </FormSection>

          <FormSection title={t('assets.location')} collapsible storageKey="panel.ar-inst.sections" id="ar-inst-location">
            <ReadOnlyRow label="Latitude" value={inst.latitude ?? '—'} />
            <ReadOnlyRow label="Longitude" value={inst.longitude ?? '—'} />
            <ReadOnlyRow label={t('assets.water_depth')} value={inst.water_depth_m ? `${inst.water_depth_m} m` : '—'} />
          </FormSection>

          <FormSection title={t('assets.design')} collapsible storageKey="panel.ar-inst.sections" id="ar-inst-design">
            <ReadOnlyRow label={t('assets.design_life')} value={inst.design_life_years ? `${inst.design_life_years} ans` : '—'} />
          </FormSection>

          <FormSection title="Tags">
            <TagManager ownerType="ar_installation" ownerId={id} compact />
          </FormSection>
        </PanelContentLayout>
      )}

      {tab === 'files' && <div className="p-4"><AttachmentManager ownerType="ar_installation" ownerId={id} /></div>}
      {tab === 'notes' && <div className="p-4"><NoteManager ownerType="ar_installation" ownerId={id} /></div>}
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
          <TabButton icon={Wrench} label={t('common.details')} active={tab === 'details'} onClick={() => setTab('details')} />
          <TabButton icon={Wrench} label={t('common.files')} active={tab === 'files'} onClick={() => setTab('files')} />
          <TabButton icon={Wrench} label={t('common.notes')} active={tab === 'notes'} onClick={() => setTab('notes')} />
        </TabBar>
      </div>

      {tab === 'details' && (
        <PanelContentLayout>
          <FormSection title={t('common.details')}>
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
            {equip.criticality && (
              <ReadOnlyRow label={t('assets.criticality')} value={
                <span className={cn('gl-badge', equip.criticality === 'A' ? 'gl-badge-danger' : equip.criticality === 'B' ? 'gl-badge-warning' : 'gl-badge-neutral')}>
                  {equip.criticality}
                </span>
              } />
            )}
            <ReadOnlyRow label={t('assets.safety_function')} value={equip.safety_function ? t('common.yes') : t('common.no')} />
          </FormSection>

          <FormSection title={t('assets.manufacturer_info')} collapsible storageKey="panel.ar-equip.sections" id="ar-equip-mfg">
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
          </FormSection>

          <FormSection title="Tags">
            <TagManager ownerType="ar_equipment" ownerId={id} compact />
          </FormSection>
        </PanelContentLayout>
      )}

      {tab === 'files' && <div className="p-4"><AttachmentManager ownerType="ar_equipment" ownerId={id} /></div>}
      {tab === 'notes' && <div className="p-4"><NoteManager ownerType="ar_equipment" ownerId={id} /></div>}
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
          <TabButton icon={Ship} label={t('common.details')} active={tab === 'details'} onClick={() => setTab('details')} />
          <TabButton icon={Ship} label={t('common.files')} active={tab === 'files'} onClick={() => setTab('files')} />
          <TabButton icon={Ship} label={t('common.notes')} active={tab === 'notes'} onClick={() => setTab('notes')} />
        </TabBar>
      </div>

      {tab === 'details' && (
        <PanelContentLayout>
          <FormSection title={t('common.details')}>
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
          </FormSection>

          <FormSection title={t('assets.dimensions')} collapsible storageKey="panel.ar-pipe.sections" id="ar-pipe-dims">
            <ReadOnlyRow label="DN (pouces)" value={`${pipe.nominal_diameter_in}"`} />
            <ReadOnlyRow label={t('assets.pipeline_length')} value={pipe.total_length_km ? `${pipe.total_length_km} km` : '—'} />
            <ReadOnlyRow label={t('assets.design_pressure')} value={`${pipe.design_pressure_barg} barg`} />
            <ReadOnlyRow label={t('assets.design_temp')} value={`${pipe.design_temp_max_c} °C`} />
            <ReadOnlyRow label={t('assets.pipe_material')} value={pipe.pipe_material || '—'} />
          </FormSection>

          {pipe.waypoints && pipe.waypoints.length > 0 && (
            <FormSection title={t('assets.waypoints')} collapsible storageKey="panel.ar-pipe.sections" id="ar-pipe-wpts">
              <div className="text-xs text-muted-foreground">
                {pipe.waypoints.length} point(s)
              </div>
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
