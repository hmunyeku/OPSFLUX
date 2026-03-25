/**
 * Assets page — Pajamas panel-based layout.
 *
 * Static Panel: PanelHeader + FilterBar + DataTable (list or tree).
 * Dynamic Panel (resizable): Create/Edit form with tabbed polymorphic components.
 *
 * Tabs: Tags inline, then Adresses | Fichiers | Notes with badge counters.
 */
import { useState, useMemo, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MapPin, Plus, List, GitBranch, Loader2, ChevronRight, ChevronDown,
  Trash2, Paperclip, MessageSquare,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import type { DataTablePagination, DataTableFilterDef } from '@/components/ui/DataTable/types'
import { cn } from '@/lib/utils'
import { TabBar, TabButton } from '@/components/ui/Tabs'
import { normalizeNames } from '@/lib/normalize'
import { useDebounce } from '@/hooks/useDebounce'
import { usePageSize } from '@/hooks/usePageSize'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormGrid,
  FormSection,
  PanelContentLayout,
  SectionColumns,
  InlineEditableRow,
  InlineEditableTags,
  ReadOnlyRow,
  PanelActionButton,
  DangerConfirmButton,
  TagSelector,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { TagManager } from '@/components/shared/TagManager'
import { AddressManager } from '@/components/shared/AddressManager'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { GeoEditor } from '@/components/shared/GeoEditor'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import type { GeoType, GeoValue } from '@/components/shared/GeoEditor'
import { usePermission } from '@/hooks/usePermission'
import { useUIStore } from '@/stores/uiStore'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { useAssets, useAsset, useAssetTree, useCreateAsset, useUpdateAsset, useArchiveAsset } from '@/hooks/useAssets'
import { useAddresses, useAttachments, useNotes } from '@/hooks/useSettings'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import { useProjects } from '@/hooks/useProjets'
import { useActivities } from '@/hooks/usePlanner'
import type { Asset, AssetTreeNode, AssetCreate } from '@/types/api'

// ── Tree node ───────────────────────────────────────────────
function TreeNode({ node, depth = 0 }: { node: AssetTreeNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = node.children && node.children.length > 0

  return (
    <div>
      <button
        onClick={() => hasChildren && setExpanded(!expanded)}
        className={cn(
          'flex w-full items-center gap-2 h-8 text-sm hover:bg-accent transition-colors',
          !hasChildren && 'cursor-default',
        )}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
      >
        {hasChildren ? (
          expanded
            ? <ChevronDown size={12} className="text-muted-foreground shrink-0" />
            : <ChevronRight size={12} className="text-muted-foreground shrink-0" />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <MapPin size={12} className="text-primary shrink-0" />
        <span className="font-semibold text-foreground">{node.code}</span>
        <span className="text-muted-foreground truncate">{node.name}</span>
        <span className="ml-auto text-xs text-muted-foreground uppercase shrink-0 pr-3">{node.type}</span>
      </button>
      {expanded && hasChildren && node.children.map((child) => (
        <TreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}

const FALLBACK_ASSET_TYPE_OPTIONS = [
  { value: 'field', label: 'Champ' },
  { value: 'site', label: 'Site' },
  { value: 'platform', label: 'Plateforme' },
  { value: 'crane', label: 'Grue' },
  { value: 'well', label: 'Puits' },
  { value: 'tank', label: 'Bac / Réservoir' },
  { value: 'separator', label: 'Séparateur' },
  { value: 'process_line', label: 'Ligne process' },
  { value: 'compressor', label: 'Compresseur' },
  { value: 'generator', label: 'Groupe électrogène' },
  { value: 'equipment', label: 'Autre équipement' },
  { value: 'pipeline', label: 'Pipeline' },
]

// Hierarchical type categories for create form
const ASSET_CATEGORIES = [
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'equipment', label: 'Équipement' },
] as const

const ASSET_SUBTYPES: Record<string, { value: string; label: string }[]> = {
  infrastructure: [
    { value: 'field', label: 'Champ' },
    { value: 'site', label: 'Site' },
    { value: 'platform', label: 'Plateforme' },
  ],
  equipment: [
    { value: 'crane', label: 'Grue' },
    { value: 'well', label: 'Puits' },
    { value: 'tank', label: 'Bac / Réservoir' },
    { value: 'separator', label: 'Séparateur' },
    { value: 'process_line', label: 'Ligne process' },
    { value: 'compressor', label: 'Compresseur' },
    { value: 'generator', label: 'Groupe électrogène' },
    { value: 'pipeline', label: 'Pipeline' },
    { value: 'equipment', label: 'Autre équipement' },
  ],
}

// const INFRASTRUCTURE_TYPES = new Set(['field', 'site', 'platform'])

const FALLBACK_CRANE_MOUNTS = [
  { value: 'SUR RAILS', label: 'Sur rails' },
  { value: 'SUR FUT', label: 'Sur fût' },
  { value: 'PEDESTAL', label: 'Piédestal' },
  { value: 'TREILLIS', label: 'Treillis' },
  { value: 'MAS PLEIN', label: 'Mâs plein' },
  { value: 'ARTICULEE', label: 'Articulée' },
  { value: 'POTENCE', label: 'Potence' },
]
// const PLATFORM_TYPES = new Set(['platform', 'site'])
const EQUIPMENT_TYPES = new Set(['crane', 'well', 'tank', 'separator', 'process_line', 'compressor', 'generator', 'equipment'])
const PIPELINE_TYPE = 'pipeline'

const FALLBACK_ASSET_STATUS_OPTIONS = [
  { value: 'operational', label: 'Opérationnel' },
  { value: 'maintenance', label: 'En maintenance' },
  { value: 'decommissioned', label: 'Décommissionné' },
  { value: 'construction', label: 'En construction' },
  { value: 'standby', label: 'En attente' },
]

// ── Geo-type mapping per asset type ─────────────────────────
function getGeoTypeForAssetType(assetType: string): GeoType {
  if (['pipeline', 'cable', 'road', 'flowline'].includes(assetType)) return 'linestring'
  if (['zone', 'area', 'field', 'concession', 'block'].includes(assetType)) return 'polygon'
  return 'point' // default for site, platform, building, equipment, well, etc.
}

// ── Detail tabs definition ──────────────────────────────────
const DETAIL_TABS = [
  { id: 'addresses', label: 'Adresses', icon: MapPin },
  { id: 'files', label: 'Fichiers', icon: Paperclip },
  { id: 'notes', label: 'Notes', icon: MessageSquare },
] as const
type DetailTabId = typeof DETAIL_TABS[number]['id']

// ── Create Asset Panel ──────────────────────────────────────
function CreateAssetPanel() {
  const { t } = useTranslation()
  const createAsset = useCreateAsset()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const dictCraneMounts = useDictionaryOptions('crane_mount_type')
  const [category, setCategory] = useState<string>('infrastructure')
  const [form, setForm] = useState<AssetCreate & Record<string, any>>({
    type: 'field', name: '',
    parent_id: undefined, allow_overlap: true, metadata: undefined,
    geometry: null,
  })

  const subtypes = ASSET_SUBTYPES[category] || []

  const handleCategoryChange = (cat: string) => {
    setCategory(cat)
    const firstType = ASSET_SUBTYPES[cat]?.[0]?.value || 'site'
    setForm({ ...form, type: firstType })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createAsset.mutateAsync(normalizeNames(form))
    closeDynamicPanel()
  }

  const updateField = (key: string, value: any) => setForm({ ...form, [key]: value })
  const isInfra = ['field', 'site', 'platform'].includes(form.type)
  const isPlatformOrSite = ['platform', 'site'].includes(form.type)
  const isEquipment = EQUIPMENT_TYPES.has(form.type)
  const isPipeline = form.type === PIPELINE_TYPE

  return (
    <DynamicPanelShell
      title={t('assets.create')}
      subtitle={t('assets.title')}
      icon={<MapPin size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>
            {t('common.cancel')}
          </PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createAsset.isPending}
            onClick={() => (document.getElementById('create-asset-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createAsset.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-asset-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          {/* ── Category + Type selectors ── */}
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <label className="gl-label mb-1">Catégorie</label>
              <TagSelector options={ASSET_CATEGORIES as any} value={category} onChange={handleCategoryChange} />
            </div>
            <div>
              <label className="gl-label mb-1">{t('common.type')}</label>
              <TagSelector options={subtypes} value={form.type} onChange={(v) => setForm({ ...form, type: v })} />
            </div>
          </div>

          <SectionColumns>
            {/* ══ Column 1: Identité + Champs techniques ══ */}
            <div className="@container space-y-5">

              {/* ── Identité (FormGrid 2-col) ── */}
              <FormSection title={t('common.details')}>
                <FormGrid>
                  <DynamicPanelField label={t('common.code')}>
                    <input type="text" value={form.code || ''} onChange={(e) => updateField('code', e.target.value || undefined)} className={panelInputClass} placeholder="Auto-généré si vide" />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('common.name')} required>
                    <input type="text" required value={form.name} onChange={(e) => updateField('name', e.target.value)} className={panelInputClass} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('assets.parent')}>
                    <AssetPicker value={form.parent_id || null} onChange={(id) => updateField('parent_id', id || undefined)} label={t('assets.parent')} placeholder={t('assets.none_root')} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('assets.year_installed')}>
                    <input type="number" value={form.year_installed || ''} onChange={(e) => updateField('year_installed', e.target.value ? Number(e.target.value) : undefined)} className={panelInputClass} placeholder="1983" />
                  </DynamicPanelField>
                </FormGrid>
                <DynamicPanelField label={t('common.description')}>
                  <textarea value={form.description || ''} onChange={(e) => updateField('description', e.target.value || undefined)} className={`${panelInputClass} min-h-[40px] resize-y`} placeholder="Description..." />
                </DynamicPanelField>
              </FormSection>

              {/* ── Plateforme / Site : Structure ── */}
              {isPlatformOrSite && (
                <FormSection title={t('assets.structure')}>
                  <FormGrid>
                    <DynamicPanelField label={t('assets.water_depth')}>
                      <input type="number" step="any" value={form.water_depth ?? ''} onChange={(e) => updateField('water_depth', e.target.value ? Number(e.target.value) : undefined)} className={panelInputClass} placeholder="15.4" />
                    </DynamicPanelField>
                    <DynamicPanelField label={t('assets.altitude')}>
                      <input type="number" step="any" value={form.altitude ?? ''} onChange={(e) => updateField('altitude', e.target.value ? Number(e.target.value) : undefined)} className={panelInputClass} />
                    </DynamicPanelField>
                    <DynamicPanelField label={t('assets.orientation')}>
                      <input type="text" value={form.orientation ?? ''} onChange={(e) => updateField('orientation', e.target.value || undefined)} className={panelInputClass} placeholder="27°30" />
                    </DynamicPanelField>
                    <DynamicPanelField label={t('assets.deck_level')}>
                      <input type="number" value={form.deck_level ?? ''} onChange={(e) => updateField('deck_level', e.target.value ? Number(e.target.value) : undefined)} className={panelInputClass} placeholder="4" />
                    </DynamicPanelField>
                    <DynamicPanelField label="Jacket L (m)">
                      <input type="number" step="any" value={form.jacket_length_m ?? ''} onChange={(e) => updateField('jacket_length_m', e.target.value ? Number(e.target.value) : undefined)} className={panelInputClass} placeholder="12" />
                    </DynamicPanelField>
                    <DynamicPanelField label="Jacket l (m)">
                      <input type="number" step="any" value={form.jacket_width_m ?? ''} onChange={(e) => updateField('jacket_width_m', e.target.value ? Number(e.target.value) : undefined)} className={panelInputClass} placeholder="14" />
                    </DynamicPanelField>
                    <DynamicPanelField label={t('assets.jacket_weight')}>
                      <input type="number" step="any" value={form.jacket_weight ?? ''} onChange={(e) => updateField('jacket_weight', e.target.value ? Number(e.target.value) : undefined)} className={panelInputClass} placeholder="254" />
                    </DynamicPanelField>
                    <DynamicPanelField label={t('assets.nb_piles')}>
                      <input type="number" value={form.nb_piles ?? ''} onChange={(e) => updateField('nb_piles', e.target.value ? Number(e.target.value) : undefined)} className={panelInputClass} placeholder="4" />
                    </DynamicPanelField>
                    <DynamicPanelField label="Diam. pieux (pouces)">
                      <input type="number" step="any" value={form.pile_diameter_inch ?? ''} onChange={(e) => updateField('pile_diameter_inch', e.target.value ? Number(e.target.value) : undefined)} className={panelInputClass} placeholder="30" />
                    </DynamicPanelField>
                    <DynamicPanelField label="Pieux par jambe">
                      <input type="number" value={form.pile_count_per_leg ?? ''} onChange={(e) => updateField('pile_count_per_leg', e.target.value ? Number(e.target.value) : undefined)} className={panelInputClass} placeholder="1" />
                    </DynamicPanelField>
                    <DynamicPanelField label={t('assets.top_deck_load')}>
                      <input type="number" step="any" value={form.top_deck_load ?? ''} onChange={(e) => updateField('top_deck_load', e.target.value ? Number(e.target.value) : undefined)} className={panelInputClass} placeholder="1" />
                    </DynamicPanelField>
                  </FormGrid>
                  <div className="flex items-center gap-6 mt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input type="checkbox" checked={form.has_winj ?? false} onChange={(e) => updateField('has_winj', e.target.checked)} className="h-4 w-4 rounded border-border text-primary" />
                      {t('assets.winj')}
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input type="checkbox" checked={form.has_power ?? false} onChange={(e) => updateField('has_power', e.target.checked)} className="h-4 w-4 rounded border-border text-primary" />
                      {t('assets.power')}
                    </label>
                  </div>
                </FormSection>
              )}

              {/* ── Grue ── */}
              {form.type === 'crane' && (
                <FormSection title="Grue">
                  <FormGrid>
                    <DynamicPanelField label="Type de montage">
                      <select value={form.equipment_subtype ?? ''} onChange={(e) => updateField('equipment_subtype', e.target.value || undefined)} className="gl-form-select text-sm">
                        <option value="">— Sélectionner —</option>
                        {(dictCraneMounts.length > 0 ? dictCraneMounts : FALLBACK_CRANE_MOUNTS).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </DynamicPanelField>
                    <DynamicPanelField label="Capacité (T)">
                      <input type="number" step="any" value={form.capacity ?? ''} onChange={(e) => updateField('capacity', e.target.value ? Number(e.target.value) : undefined)} className={panelInputClass} placeholder="10" />
                    </DynamicPanelField>
                    <DynamicPanelField label="Portée max (m)">
                      <input type="number" step="any" value={form.max_range ?? ''} onChange={(e) => updateField('max_range', e.target.value ? Number(e.target.value) : undefined)} className={panelInputClass} placeholder="8" />
                    </DynamicPanelField>
                    <DynamicPanelField label={t('assets.manufacturer')}>
                      <input type="text" value={form.manufacturer ?? ''} onChange={(e) => updateField('manufacturer', e.target.value || undefined)} className={panelInputClass} />
                    </DynamicPanelField>
                    <DynamicPanelField label={t('assets.model_ref')}>
                      <input type="text" value={form.model_ref ?? ''} onChange={(e) => updateField('model_ref', e.target.value || undefined)} className={panelInputClass} />
                    </DynamicPanelField>
                  </FormGrid>
                </FormSection>
              )}

              {/* ── Puits ── */}
              {form.type === 'well' && (
                <FormSection title="Puits">
                  <FormGrid>
                    <DynamicPanelField label="Type de puits">
                      <select value={form.equipment_subtype ?? ''} onChange={(e) => updateField('equipment_subtype', e.target.value || undefined)} className="gl-form-select text-sm">
                        <option value="">— Sélectionner —</option>
                        <option value="production">Production</option>
                        <option value="injection">Injection</option>
                        <option value="exploration">Exploration</option>
                        <option value="observation">Observation</option>
                      </select>
                    </DynamicPanelField>
                    <DynamicPanelField label="Profondeur (m)">
                      <input type="number" step="any" value={form.capacity ?? ''} onChange={(e) => updateField('capacity', e.target.value ? Number(e.target.value) : undefined)} className={panelInputClass} />
                    </DynamicPanelField>
                  </FormGrid>
                </FormSection>
              )}

              {/* ── Bac / Séparateur / Compresseur / Générateur ── */}
              {['tank', 'separator', 'compressor', 'generator'].includes(form.type) && (
                <FormSection title={t('assets.equipment')}>
                  <FormGrid>
                    <DynamicPanelField label="Sous-type">
                      <input type="text" value={form.equipment_subtype ?? ''} onChange={(e) => updateField('equipment_subtype', e.target.value || undefined)} className={panelInputClass} placeholder={form.type === 'separator' ? 'Biphasique, Triphasique' : form.type === 'compressor' ? 'Centrifuge, Alternatif' : ''} />
                    </DynamicPanelField>
                    <DynamicPanelField label={form.type === 'compressor' || form.type === 'generator' ? 'Puissance (kW)' : 'Capacité (m³)'}>
                      <input type="number" step="any" value={form.capacity ?? ''} onChange={(e) => updateField('capacity', e.target.value ? Number(e.target.value) : undefined)} className={panelInputClass} />
                    </DynamicPanelField>
                    <DynamicPanelField label={t('assets.manufacturer')}>
                      <input type="text" value={form.manufacturer ?? ''} onChange={(e) => updateField('manufacturer', e.target.value || undefined)} className={panelInputClass} />
                    </DynamicPanelField>
                    <DynamicPanelField label={t('assets.model_ref')}>
                      <input type="text" value={form.model_ref ?? ''} onChange={(e) => updateField('model_ref', e.target.value || undefined)} className={panelInputClass} />
                    </DynamicPanelField>
                  </FormGrid>
                </FormSection>
              )}

              {/* ── Pipeline ── */}
              {isPipeline && (
                <FormSection title={t('assets.pipeline')}>
                  <FormGrid>
                    <DynamicPanelField label="Type fluide">
                      <TagSelector options={[{value:'gas',label:'Gaz'},{value:'oil',label:'Huile'},{value:'water',label:'Eau'}]} value={form.pipeline_type ?? ''} onChange={(v) => updateField('pipeline_type', v)} />
                    </DynamicPanelField>
                    <DynamicPanelField label={t('assets.pipeline_diameter')}>
                      <input type="text" value={form.pipeline_diameter ?? ''} onChange={(e) => updateField('pipeline_diameter', e.target.value || undefined)} className={panelInputClass} placeholder='12"' />
                    </DynamicPanelField>
                    <DynamicPanelField label={t('assets.pipeline_length')}>
                      <input type="number" step="any" value={form.pipeline_length ?? ''} onChange={(e) => updateField('pipeline_length', e.target.value ? Number(e.target.value) : undefined)} className={panelInputClass} placeholder="2.5" />
                    </DynamicPanelField>
                  </FormGrid>
                </FormSection>
              )}

              {/* ── Dimensions (équipement + pipeline) ── */}
              {(isEquipment || isPipeline) && (
                <FormSection title={t('assets.dimensions')} collapsible defaultExpanded={false} storageKey="panel.asset.create" id="create-dims">
                  <FormGrid>
                    <DynamicPanelField label={t('assets.length')}>
                      <input type="number" step="any" value={form.length_m ?? ''} onChange={(e) => updateField('length_m', e.target.value ? Number(e.target.value) : undefined)} className={panelInputClass} />
                    </DynamicPanelField>
                    <DynamicPanelField label={t('assets.width')}>
                      <input type="number" step="any" value={form.width_m ?? ''} onChange={(e) => updateField('width_m', e.target.value ? Number(e.target.value) : undefined)} className={panelInputClass} />
                    </DynamicPanelField>
                    <DynamicPanelField label={t('assets.height')}>
                      <input type="number" step="any" value={form.height_m ?? ''} onChange={(e) => updateField('height_m', e.target.value ? Number(e.target.value) : undefined)} className={panelInputClass} />
                    </DynamicPanelField>
                    <DynamicPanelField label={t('assets.weight')}>
                      <input type="number" step="any" value={form.weight_t ?? ''} onChange={(e) => updateField('weight_t', e.target.value ? Number(e.target.value) : undefined)} className={panelInputClass} />
                    </DynamicPanelField>
                  </FormGrid>
                </FormSection>
              )}
            </div>

            {/* ══ Column 2: Localisation + Options ══ */}
            <div className="@container space-y-5">

              {/* Infrastructure (field/site/platform) → GeoEditor */}
              {isInfra && (
                <FormSection title={t('assets.localisation')}>
                  <GeoEditor
                    value={form.geometry || null}
                    onChange={(geo) => setForm({ ...form, geometry: geo })}
                    geoType={getGeoTypeForAssetType(form.type)}
                    height={300}
                    showCoordinateTable
                    showSearch
                  />
                </FormSection>
              )}

              {/* Pipeline → linestring GeoEditor */}
              {isPipeline && (
                <FormSection title="Tracé du pipeline">
                  <GeoEditor
                    value={form.geometry || null}
                    onChange={(geo) => setForm({ ...form, geometry: geo })}
                    geoType="linestring"
                    height={300}
                    showCoordinateTable
                    showSearch
                  />
                </FormSection>
              )}

              {/* Équipement → pas de carte, info deck */}
              {isEquipment && !isPipeline && (
                <FormSection title={t('assets.positioning')}>
                  <p className="text-xs text-muted-foreground mb-2">
                    La position de cet équipement sera définie par rapport au deck de sa plateforme parent.
                    Les decks sont configurables dans le détail de la plateforme.
                  </p>
                  <DynamicPanelField label={t('assets.elevation_msl')}>
                    <input type="number" step="any" value={form.elevation_msl ?? ''} onChange={(e) => updateField('elevation_msl', e.target.value ? Number(e.target.value) : undefined)} className={panelInputClass} placeholder="12.5" />
                  </DynamicPanelField>
                </FormSection>
              )}

              {/* Options */}
              <FormSection title={t('assets.options')} collapsible defaultExpanded={false} storageKey="panel.asset.create" id="create-options">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" checked={form.allow_overlap ?? true} onChange={(e) => updateField('allow_overlap', e.target.checked)} className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30" />
                  <span className="text-sm text-foreground group-hover:text-foreground/80">{t('assets.overlap_allowed')}</span>
                </label>
              </FormSection>
            </div>
          </SectionColumns>

          <p className="text-xs text-muted-foreground italic mt-2">
            Les decks, adresses, fichiers et notes pourront être ajoutés après la création.
          </p>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

// ── Asset Detail Panel ──────────────────────────────────────
function AssetDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canUpdate = hasPermission('asset.update')
  const canDelete = hasPermission('asset.delete')
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const archiveAsset = useArchiveAsset()
  const { data: asset } = useAsset(id)
  const dictTypes = useDictionaryOptions('asset_type')
  const ASSET_TYPE_OPTIONS = dictTypes.length > 0 ? dictTypes : FALLBACK_ASSET_TYPE_OPTIONS

  const updateAsset = useUpdateAsset()
  const handleInlineSave = useCallback((field: string, value: string | number | boolean | null) => {
    updateAsset.mutate({ id, payload: normalizeNames({ [field]: value }) })
  }, [id, updateAsset])

  const handleGeoChange = useCallback((geo: GeoValue | null) => {
    updateAsset.mutate({ id, payload: { geometry: geo } })
  }, [id, updateAsset])

  // Find parent asset name
  const { data: parentAsset } = useAsset(asset?.parent_id ?? '')

  // Tab state
  const [activeTab, setActiveTab] = useState<DetailTabId>('addresses')
  // When > 0, signals the active tab's component to open its add form
  const [addTrigger, setAddTrigger] = useState(0)

  // Fetch counts for tab badges
  const { data: addresses } = useAddresses('asset', id)
  const { data: attachments } = useAttachments('asset', id)
  const { data: notes } = useNotes('asset', id)

  // Related cross-module data
  const { data: relatedProjects } = useProjects({ asset_id: id, page_size: 10 })
  const { data: relatedActivities } = useActivities({ asset_id: id, page_size: 10 })

  const tabCounts = useMemo(() => ({
    addresses: addresses?.length ?? 0,
    files: attachments?.length ?? 0,
    notes: notes?.length ?? 0,
  }), [addresses, attachments, notes])

  if (!asset) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<MapPin size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={asset.code}
      subtitle={asset.name}
      icon={<MapPin size={14} className="text-primary" />}
      actions={
        canDelete ? (
          <DangerConfirmButton
            icon={<Trash2 size={12} />}
            onConfirm={() => { archiveAsset.mutate(id); closeDynamicPanel() }}
            confirmLabel="Supprimer ?"
          >
            {t('common.delete')}
          </DangerConfirmButton>
        ) : undefined
      }
    >
      <PanelContentLayout>
        {/* ── Identité ── */}
        <FormSection title={t('common.details')}>
          {canUpdate
            ? <InlineEditableRow label={t('common.name')} value={asset.name} onSave={(v) => handleInlineSave('name', v)} />
            : <ReadOnlyRow label={t('common.name')} value={asset.name} />
          }
          <ReadOnlyRow label={t('common.code')} value={<span className="text-sm font-mono font-medium">{asset.code || '—'}</span>} />
          {canUpdate
            ? <InlineEditableTags label={t('common.type')} value={asset.type} options={ASSET_TYPE_OPTIONS} onSave={(v) => handleInlineSave('type', v)} />
            : <ReadOnlyRow label={t('common.type')} value={<span className="gl-badge gl-badge-neutral">{asset.type}</span>} />
          }
          <ReadOnlyRow label={t('assets.parent')} value={
            parentAsset ? <CrossModuleLink module="assets" id={parentAsset.id} label={`${parentAsset.code} — ${parentAsset.name}`} /> : `— ${t('assets.root')}`
          } />
          {asset.year_installed && <ReadOnlyRow label={t('assets.year_installed')} value={asset.year_installed} />}
          {asset.orientation && (canUpdate
            ? <InlineEditableRow label={t('assets.orientation')} value={asset.orientation} onSave={(v) => handleInlineSave('orientation', v || null)} />
            : <ReadOnlyRow label={t('assets.orientation')} value={asset.orientation} />
          )}
          {asset.description && <ReadOnlyRow label={t('common.description')} value={asset.description} />}
          <ReadOnlyRow label={t('common.status')} value={
            <span className={cn('gl-badge', asset.active ? 'gl-badge-success' : 'gl-badge-neutral')}>
              {asset.active ? t('common.active') : t('common.archived')}
            </span>
          } />
        </FormSection>

        {/* ── Plateforme / Site : Structure ── */}
        {['platform', 'site'].includes(asset.type) && (
          <FormSection title={t('assets.structure')} collapsible storageKey="panel.asset.sections" id="asset-structure">
            {canUpdate ? (
              <>
                <InlineEditableRow label={t('assets.water_depth')} value={String(asset.water_depth ?? '')} onSave={(v) => handleInlineSave('water_depth', v ? Number(v) : null)} />
                <InlineEditableRow label={t('assets.altitude')} value={String(asset.altitude ?? '')} onSave={(v) => handleInlineSave('altitude', v ? Number(v) : null)} />
                <InlineEditableRow label="Jacket L (m)" value={String(asset.jacket_length_m ?? '')} onSave={(v) => handleInlineSave('jacket_length_m', v ? Number(v) : null)} />
                <InlineEditableRow label="Jacket l (m)" value={String(asset.jacket_width_m ?? '')} onSave={(v) => handleInlineSave('jacket_width_m', v ? Number(v) : null)} />
                <InlineEditableRow label={t('assets.jacket_weight')} value={String(asset.jacket_weight ?? '')} onSave={(v) => handleInlineSave('jacket_weight', v ? Number(v) : null)} />
                <InlineEditableRow label={t('assets.nb_piles')} value={String(asset.nb_piles ?? '')} onSave={(v) => handleInlineSave('nb_piles', v ? Number(v) : null)} />
                <InlineEditableRow label="Diam. pieux (pouces)" value={String(asset.pile_diameter_inch ?? '')} onSave={(v) => handleInlineSave('pile_diameter_inch', v ? Number(v) : null)} />
                <InlineEditableRow label="Pieux par jambe" value={String(asset.pile_count_per_leg ?? '')} onSave={(v) => handleInlineSave('pile_count_per_leg', v ? Number(v) : null)} />
                <InlineEditableRow label={t('assets.deck_level')} value={String(asset.deck_level ?? '')} onSave={(v) => handleInlineSave('deck_level', v ? Number(v) : null)} />
                <InlineEditableRow label={t('assets.top_deck_load')} value={String(asset.top_deck_load ?? '')} onSave={(v) => handleInlineSave('top_deck_load', v ? Number(v) : null)} />
              </>
            ) : (
              <>
                <ReadOnlyRow label={t('assets.water_depth')} value={asset.water_depth ?? '—'} />
                <ReadOnlyRow label={t('assets.altitude')} value={asset.altitude ?? '—'} />
                <ReadOnlyRow label="Jacket L × l (m)" value={asset.jacket_length_m ? `${asset.jacket_length_m} × ${asset.jacket_width_m}` : '—'} />
                <ReadOnlyRow label={t('assets.jacket_weight')} value={asset.jacket_weight ?? '—'} />
                <ReadOnlyRow label={t('assets.nb_piles')} value={asset.nb_piles ?? '—'} />
                <ReadOnlyRow label="Pieux" value={asset.pile_diameter_inch ? `${asset.pile_diameter_inch}" × ${asset.pile_count_per_leg}/jambe` : '—'} />
                <ReadOnlyRow label={t('assets.deck_level')} value={asset.deck_level ?? '—'} />
                <ReadOnlyRow label={t('assets.top_deck_load')} value={asset.top_deck_load ?? '—'} />
              </>
            )}
            <ReadOnlyRow label={t('assets.winj')} value={asset.has_winj ? 'Oui' : asset.has_winj === false ? 'Non' : '—'} />
            <ReadOnlyRow label={t('assets.power')} value={asset.has_power ? 'Oui' : asset.has_power === false ? 'Non' : '—'} />
          </FormSection>
        )}

        {/* ── Grue ── */}
        {asset.type === 'crane' && (
          <FormSection title="Grue" collapsible storageKey="panel.asset.sections" id="asset-crane">
            {canUpdate ? (
              <>
                <InlineEditableRow label="Type de montage" value={asset.equipment_subtype ?? ''} onSave={(v) => handleInlineSave('equipment_subtype', v || null)} />
                <InlineEditableRow label="Capacité (T)" value={String(asset.capacity ?? '')} onSave={(v) => handleInlineSave('capacity', v ? Number(v) : null)} />
                <InlineEditableRow label="Portée max (m)" value={String(asset.max_range ?? '')} onSave={(v) => handleInlineSave('max_range', v ? Number(v) : null)} />
                <InlineEditableRow label={t('assets.manufacturer')} value={asset.manufacturer ?? ''} onSave={(v) => handleInlineSave('manufacturer', v || null)} />
                <InlineEditableRow label={t('assets.model_ref')} value={asset.model_ref ?? ''} onSave={(v) => handleInlineSave('model_ref', v || null)} />
              </>
            ) : (
              <>
                <ReadOnlyRow label="Type de montage" value={asset.equipment_subtype ?? '—'} />
                <ReadOnlyRow label="Capacité (T)" value={asset.capacity ?? '—'} />
                <ReadOnlyRow label="Portée max (m)" value={asset.max_range ?? '—'} />
                <ReadOnlyRow label={t('assets.manufacturer')} value={asset.manufacturer ?? '—'} />
                <ReadOnlyRow label={t('assets.model_ref')} value={asset.model_ref ?? '—'} />
              </>
            )}
            <ReadOnlyRow label={t('assets.last_inspection')} value={asset.last_inspection ? new Date(asset.last_inspection).toLocaleDateString('fr-FR') : '—'} />
            <ReadOnlyRow label={t('assets.next_inspection')} value={asset.next_inspection ? new Date(asset.next_inspection).toLocaleDateString('fr-FR') : '—'} />
          </FormSection>
        )}

        {/* ── Puits / Bac / Séparateur / Compresseur / Générateur ── */}
        {['well', 'tank', 'separator', 'compressor', 'generator', 'equipment', 'process_line'].includes(asset.type) && (
          <FormSection title={t('assets.equipment')} collapsible storageKey="panel.asset.sections" id="asset-equipment">
            {canUpdate ? (
              <>
                <InlineEditableRow label={t('assets.equipment_subtype')} value={asset.equipment_subtype ?? ''} onSave={(v) => handleInlineSave('equipment_subtype', v || null)} />
                <InlineEditableRow label={t('assets.capacity')} value={String(asset.capacity ?? '')} onSave={(v) => handleInlineSave('capacity', v ? Number(v) : null)} />
                <InlineEditableRow label={t('assets.manufacturer')} value={asset.manufacturer ?? ''} onSave={(v) => handleInlineSave('manufacturer', v || null)} />
                <InlineEditableRow label={t('assets.model_ref')} value={asset.model_ref ?? ''} onSave={(v) => handleInlineSave('model_ref', v || null)} />
              </>
            ) : (
              <>
                <ReadOnlyRow label={t('assets.equipment_subtype')} value={asset.equipment_subtype ?? '—'} />
                <ReadOnlyRow label={t('assets.capacity')} value={asset.capacity ?? '—'} />
                <ReadOnlyRow label={t('assets.manufacturer')} value={asset.manufacturer ?? '—'} />
                <ReadOnlyRow label={t('assets.model_ref')} value={asset.model_ref ?? '—'} />
              </>
            )}
          </FormSection>
        )}

        {/* ── Pipeline ── */}
        {asset.type === 'pipeline' && (
          <FormSection title={t('assets.pipeline')} collapsible storageKey="panel.asset.sections" id="asset-pipeline">
            {canUpdate ? (
              <>
                <InlineEditableTags label={t('assets.pipeline_type')} value={asset.pipeline_type ?? ''} options={[{value:'gas',label:'Gaz'},{value:'oil',label:'Huile'},{value:'water',label:'Eau'}]} onSave={(v) => handleInlineSave('pipeline_type', v || null)} />
                <InlineEditableRow label={t('assets.pipeline_diameter')} value={asset.pipeline_diameter ?? ''} onSave={(v) => handleInlineSave('pipeline_diameter', v || null)} />
                <InlineEditableRow label={t('assets.pipeline_length')} value={String(asset.pipeline_length ?? '')} onSave={(v) => handleInlineSave('pipeline_length', v ? Number(v) : null)} />
              </>
            ) : (
              <>
                <ReadOnlyRow label={t('assets.pipeline_type')} value={asset.pipeline_type ?? '—'} />
                <ReadOnlyRow label={t('assets.pipeline_diameter')} value={asset.pipeline_diameter ?? '—'} />
                <ReadOnlyRow label={t('assets.pipeline_length')} value={asset.pipeline_length ?? '—'} />
              </>
            )}
          </FormSection>
        )}

        {/* ── Dimensions (équipement) ── */}
        {(asset.length_m || asset.width_m || asset.height_m || asset.weight_t) && (
          <FormSection title={t('assets.dimensions')} collapsible storageKey="panel.asset.sections" id="asset-dimensions">
            {asset.length_m != null && <ReadOnlyRow label={t('assets.length')} value={asset.length_m} />}
            {asset.width_m != null && <ReadOnlyRow label={t('assets.width')} value={asset.width_m} />}
            {asset.height_m != null && <ReadOnlyRow label={t('assets.height')} value={asset.height_m} />}
            {asset.weight_t != null && <ReadOnlyRow label={t('assets.weight')} value={asset.weight_t} />}
          </FormSection>
        )}

        {/* ── Positionnement deck ── */}
        {(asset.deck_id || asset.elevation_msl) && (
          <FormSection title={t('assets.positioning')} collapsible storageKey="panel.asset.sections" id="asset-position">
            <ReadOnlyRow label={t('assets.elevation_msl')} value={asset.elevation_msl ?? '—'} />
            {(asset.position_x != null || asset.position_y != null || asset.position_z != null) && (
              <ReadOnlyRow label={t('assets.position_xyz')} value={`${asset.position_x ?? '—'} / ${asset.position_y ?? '—'} / ${asset.position_z ?? '—'}`} />
            )}
          </FormSection>
        )}

        {/* ── Localisation (GeoEditor) — infrastructure + pipeline only ── */}
        {(['field', 'site', 'platform', 'pipeline'].includes(asset.type) || asset.geometry) && (
        <FormSection title={t('assets.localisation')} collapsible defaultExpanded={!!asset.geometry} storageKey="panel.asset.sections" id="asset-detail-geo">
          <GeoEditor
            value={(asset.geometry as GeoValue | null) || null}
            onChange={canUpdate ? handleGeoChange : () => {}}
            geoType={getGeoTypeForAssetType(asset.type)}
            height={300}
            showCoordinateTable
            showSearch
          />
        </FormSection>
        )}

        {/* ── Options ── */}
        <FormSection title={t('assets.options')} collapsible defaultExpanded={false} storageKey="panel.asset.sections" id="asset-options">
          <ReadOnlyRow label={t('assets.overlap')} value={
            <span className={cn('gl-badge', asset.allow_overlap ? 'gl-badge-success' : 'gl-badge-neutral')}>
              {asset.allow_overlap ? t('assets.overlap_allowed') : t('assets.overlap_denied')}
            </span>
          } />
          <ReadOnlyRow label={t('common.created_at')} value={new Date(asset.created_at).toLocaleDateString('fr-FR')} />
        </FormSection>

        {/* ── Tags (inline, always visible) ── */}
        <FormSection title="Tags">
          <TagManager ownerType="asset" ownerId={id} compact />
        </FormSection>

        {/* ── Cross-module links ── */}
        {((relatedProjects && relatedProjects.items.length > 0) || (relatedActivities && relatedActivities.items.length > 0)) && (
          <FormSection title="Liens" collapsible defaultExpanded={false} storageKey="panel.asset.sections" id="asset-liens">
            {relatedProjects && relatedProjects.items.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Projets ({relatedProjects.total})</span>
                <div className="space-y-1">
                  {relatedProjects.items.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-accent/50 transition-colors">
                      <CrossModuleLink module="projets" id={p.id} label={`${p.code} — ${p.name}`} mode="navigate" />
                      <span className={cn('gl-badge text-[10px]', p.status === 'active' ? 'gl-badge-success' : 'gl-badge-neutral')}>
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {relatedActivities && relatedActivities.items.length > 0 && (
              <div className="space-y-1 mt-2">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Activites planner ({relatedActivities.total})</span>
                <div className="space-y-1">
                  {relatedActivities.items.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-accent/50 transition-colors">
                      <CrossModuleLink module="planner" id={a.id} label={a.title} subtype="activity" mode="navigate" />
                      <span className={cn('gl-badge text-[10px]', a.status === 'validated' || a.status === 'completed' ? 'gl-badge-success' : 'gl-badge-neutral')}>
                        {a.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </FormSection>
        )}

        {/* ── Secondary tabs: Adresses | Fichiers | Notes ── */}
        <div className="border-t border-border pt-4">
          <TabBar className="mb-4">
            {DETAIL_TABS.map((tab) => {
              const count = tabCounts[tab.id as keyof typeof tabCounts] ?? 0
              const isActive = activeTab === tab.id

              return (
                <div key={tab.id} className="group/tab flex items-center">
                  <TabButton
                    icon={tab.icon}
                    label={tab.label}
                    active={isActive}
                    badge={count || undefined}
                    onClick={() => setActiveTab(tab.id)}
                  />
                  {/* + button appears on hover — click opens add form */}
                  <button
                    className="p-0.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all opacity-0 group-hover/tab:opacity-100 -ml-1 mr-1"
                    title={`Ajouter (${tab.label})`}
                    onClick={() => {
                      setActiveTab(tab.id)
                      setAddTrigger((v) => v + 1)
                    }}
                  >
                    <Plus size={13} />
                  </button>
                </div>
              )
            })}
          </TabBar>

          {/* Tab content — key includes addTrigger to force re-render with form open */}
          {activeTab === 'addresses' && (
            <AddressManager key={`addr-${addTrigger}`} ownerType="asset" ownerId={id} compact initialShowForm={addTrigger > 0} />
          )}
          {activeTab === 'files' && (
            <AttachmentManager key={`att-${addTrigger}`} ownerType="asset" ownerId={id} compact initialShowForm={addTrigger > 0} />
          )}
          {activeTab === 'notes' && (
            <NoteManager key={`note-${addTrigger}`} ownerType="asset" ownerId={id} compact initialShowForm={addTrigger > 0} />
          )}
        </div>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// ── Main Page ───────────────────────────────────────────────
export function AssetsPage() {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canCreate = hasPermission('asset.create')
  const canExport = hasPermission('asset.export')
  const canImport = hasPermission('asset.import')

  // Dictionary-driven options (fall back to hardcoded if dictionary not configured)
  const dictAssetTypes = useDictionaryOptions('asset_type')
  const dictAssetStatuses = useDictionaryOptions('asset_status')
  const ASSET_TYPE_OPTIONS = dictAssetTypes.length > 0 ? dictAssetTypes : FALLBACK_ASSET_TYPE_OPTIONS
  const ASSET_STATUS_OPTIONS = dictAssetStatuses.length > 0 ? dictAssetStatuses : FALLBACK_ASSET_STATUS_OPTIONS

  const [view, setView] = useState<'list' | 'tree'>('list')
  const [page, setPage] = useState(1)
  const { pageSize, setPageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>({})

  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)
  const setNavItems = useUIStore((s) => s.setDynamicPanelNavItems)

  const typeFilter = typeof activeFilters.type === 'string' ? activeFilters.type : undefined
  const { data: listData, isLoading: listLoading } = useAssets({
    page, page_size: pageSize,
    search: debouncedSearch || undefined,
    type: typeFilter,
  })

  // Reset page on search/filter change
  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilters])

  const assetFilters = useMemo<DataTableFilterDef[]>(() => [
    {
      id: 'type',
      label: t('common.type'),
      type: 'select',
      options: ASSET_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    },
    {
      id: 'status',
      label: t('common.status'),
      type: 'select',
      options: ASSET_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    },
  ], [t, ASSET_TYPE_OPTIONS, ASSET_STATUS_OPTIONS])

  const handleFilterChange = useCallback((filterId: string, value: unknown) => {
    setActiveFilters((prev) => {
      const next = { ...prev }
      if (value === undefined || value === null) delete next[filterId]
      else next[filterId] = value
      return next
    })
  }, [])
  const { data: treeData, isLoading: treeLoading } = useAssetTree()
  const items = listData?.items ?? []

  const columns = useMemo<ColumnDef<Asset, unknown>[]>(() => [
    {
      accessorKey: 'code',
      header: t('common.code'),
      cell: ({ row }) => <span className="font-semibold text-foreground">{row.original.code}</span>,
    },
    {
      accessorKey: 'name',
      header: t('common.name'),
      cell: ({ row }) => <span className="text-foreground">{row.original.name}</span>,
    },
    {
      accessorKey: 'type',
      header: t('common.type'),
      cell: ({ row }) => <span className="gl-badge gl-badge-neutral">{row.original.type}</span>,
    },
    {
      accessorKey: 'active',
      header: t('common.status'),
      cell: ({ row }) => (
        <span className={cn('gl-badge', row.original.active ? 'gl-badge-success' : 'gl-badge-neutral')}>
          {row.original.active ? t('common.active') : t('common.archived')}
        </span>
      ),
      size: 90,
    },
    {
      accessorKey: 'created_at',
      header: t('common.created_at'),
      cell: ({ row }) => <span className="text-muted-foreground">{new Date(row.original.created_at).toLocaleDateString()}</span>,
    },
  ], [t])

  const paginationState: DataTablePagination | undefined = listData ? {
    page: listData.page,
    pageSize,
    total: listData.total,
    pages: listData.pages,
  } : undefined

  // Set navigation items for the dynamic panel
  useEffect(() => {
    if (listData?.items) {
      setNavItems(listData.items.map((i) => i.id))
    }
    return () => setNavItems([])
  }, [listData?.items, setNavItems])

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'assets'

  return (
    <div className="flex h-full">
      {/* ── Static Panel (list) — hidden when dynamic panel is in full mode ── */}
      {!isFullPanel && <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <PanelHeader icon={MapPin} title={t('assets.title')} subtitle={t('assets.subtitle')}>
          {canCreate && (
            <ToolbarButton
              icon={Plus}
              label={t('assets.create')}
              variant="primary"
              onClick={() => openDynamicPanel({ type: 'create', module: 'assets' })}
            />
          )}
        </PanelHeader>

        {/* Toolbar bar */}
        <div className="flex items-center gap-2 border-b border-border px-3.5 h-9 shrink-0">
          <div className="flex gap-0.5 rounded border border-border p-0.5">
            <button
              onClick={() => setView('list')}
              className={cn(
                'gl-button-sm',
                view === 'list' ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <List size={12} /> {t('assets.list')}
            </button>
            <button
              onClick={() => setView('tree')}
              className={cn(
                'gl-button-sm',
                view === 'tree' ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <GitBranch size={12} /> {t('assets.hierarchy')}
            </button>
          </div>

          {view === 'list' && listData && (
            <span className="text-xs text-muted-foreground ml-auto">{listData.total} {t('assets.total')}</span>
          )}
        </div>

        <PanelContent>
          {view === 'list' && (
            <DataTable<Asset>
              columns={columns}
              data={items}
              isLoading={listLoading}
              pagination={paginationState}
              onPaginationChange={(p, size) => { setPage(p); if (size !== pageSize) setPageSize(size) }}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Rechercher par code, nom…"
              filters={assetFilters}
              activeFilters={activeFilters}
              onFilterChange={handleFilterChange}
              onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'assets', id: row.id })}
              emptyTitle={t('common.no_results')}
              importExport={(canExport || canImport) ? {
                exportFormats: canExport ? ['csv', 'xlsx'] : [],
                advancedExport: canExport,
                importWizardTarget: canImport ? 'asset' : undefined,
                filenamePrefix: 'assets',
              } : undefined}
              columnResizing
              columnPinning
              defaultPinnedColumns={{ left: ['code'] }}
              storageKey="assets"
            />
          )}

          {view === 'tree' && treeLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          )}

          {view === 'tree' && !treeLoading && (
            <>
              {!treeData || treeData.length === 0 ? (
                <EmptyState title={t('common.no_results')} variant="search" />
              ) : (
                <div className="py-1">
                  {treeData.map((node) => <TreeNode key={node.id} node={node} />)}
                </div>
              )}
            </>
          )}
        </PanelContent>
      </div>}

      {/* ── Dynamic Panel — create ── */}
      {dynamicPanel?.module === 'assets' && dynamicPanel.type === 'create' && <CreateAssetPanel />}

      {/* ── Dynamic Panel — detail ── */}
      {dynamicPanel?.module === 'assets' && dynamicPanel.type === 'detail' && <AssetDetailPanel id={dynamicPanel.id} />}
    </div>
  )
}

// ── Module-level renderer registration (after component definitions) ──
registerPanelRenderer('assets', (view) => {
  if (view.type === 'create') return <CreateAssetPanel />
  if (view.type === 'detail' && 'id' in view) return <AssetDetailPanel id={view.id} />
  return null
})
