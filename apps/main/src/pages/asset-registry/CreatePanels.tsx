/**
 * Create panels for Asset Registry entities.
 *
 * Each panel uses:
 * - DynamicPanelShell for the shell
 * - FormGrid / DynamicPanelField for 2-column layout
 * - panelInputClass for input styling
 * - PanelActionButton for submit
 * - TagSelector for status / enum selectors
 * - CountrySelect for country fields
 * - useToast on success
 * - closeDynamicPanel after create
 * - Dictionary-driven dropdowns with autocomplete fallback
 * - All labels translated with t()
 *
 * Exported as named components — DetailPanels.tsx imports them
 * and dispatches based on `view.type === 'create'`.
 */
import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, MapPin, Landmark, Factory, Wrench, Ship } from 'lucide-react'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormGrid,
  FormSection,
  PanelActionButton,
  TagSelector,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { CountrySelect } from '@/components/shared/CountrySelect'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import {
  useCreateField,
  useCreateSite,
  useCreateInstallation,
  useCreateEquipment,
  useCreatePipeline,
  useFields,
  useSites,
  useInstallations,
} from '@/hooks/useAssetRegistry'
import type {
  OilFieldCreate,
  OilSiteCreate,
  InstallationCreate,
  EquipmentCreate,
  PipelineCreate,
} from '@/types/assetRegistry'


// ── Shared fallback option arrays ────────────────────────────────

const ENVIRONMENT_FALLBACK = [
  { value: 'ONSHORE', label: 'Onshore' },
  { value: 'OFFSHORE', label: 'Offshore' },
  { value: 'SWAMP', label: 'Swamp' },
  { value: 'SHALLOW_WATER', label: 'Shallow Water' },
  { value: 'DEEPWATER', label: 'Deepwater' },
  { value: 'SUBSEA', label: 'Subsea' },
]

const STATUS_OPTIONS = [
  { value: 'OPERATIONAL', label: 'Opérationnel' },
  { value: 'STANDBY', label: 'En attente' },
  { value: 'UNDER_CONSTRUCTION', label: 'En construction' },
  { value: 'SUSPENDED', label: 'Suspendu' },
  { value: 'DECOMMISSIONED', label: 'Décommissionné' },
  { value: 'ABANDONED', label: 'Abandonné' },
]

const CRITICALITY_FALLBACK = [
  { value: 'A', label: 'A — Critique' },
  { value: 'B', label: 'B — Majeur' },
  { value: 'C', label: 'C — Mineur' },
]

const SITE_TYPE_FALLBACK = [
  { value: 'PRODUCTION', label: 'Production' },
  { value: 'DRILLING', label: 'Forage' },
  { value: 'PROCESSING', label: 'Traitement' },
  { value: 'STORAGE', label: 'Stockage' },
  { value: 'EXPORT_TERMINAL', label: 'Terminal export' },
  { value: 'LIVING_QUARTERS', label: 'Base vie' },
  { value: 'SHORE_BASE', label: 'Base terrestre' },
  { value: 'LOGISTICS', label: 'Logistique' },
]

const INSTALLATION_TYPE_FALLBACK = [
  { value: 'FIXED_PLATFORM', label: 'Plateforme fixe' },
  { value: 'FPSO', label: 'FPSO' },
  { value: 'FSO', label: 'FSO' },
  { value: 'JACK_UP', label: 'Jack-up' },
  { value: 'SEMI_SUBMERSIBLE', label: 'Semi-submersible' },
  { value: 'SPAR', label: 'Spar' },
  { value: 'TLP', label: 'TLP' },
  { value: 'SUBSEA_TEMPLATE', label: 'Template sous-marin' },
  { value: 'WELLHEAD_PLATFORM', label: 'Plateforme tête de puits' },
  { value: 'CPF', label: 'CPF' },
  { value: 'ONSHORE_PLANT', label: 'Usine terrestre' },
  { value: 'MANIFOLD', label: 'Manifold' },
]

const EQUIPMENT_CLASS_FALLBACK = [
  { value: 'CRANE', label: 'Grue' },
  { value: 'SEPARATOR', label: 'Séparateur' },
  { value: 'PUMP', label: 'Pompe' },
  { value: 'GAS_COMPRESSOR', label: 'Compresseur gaz' },
  { value: 'GAS_TURBINE', label: 'Turbine gaz' },
  { value: 'DIESEL_GENERATOR', label: 'Groupe électrogène' },
  { value: 'STORAGE_TANK', label: 'Bac' },
  { value: 'HEAT_EXCHANGER', label: 'Échangeur' },
  { value: 'INSTRUMENT', label: 'Instrument' },
  { value: 'WELLHEAD', label: 'Tête de puits' },
  { value: 'VALVE', label: 'Vanne' },
  { value: 'VESSEL', label: 'Ballon / Capacité' },
  { value: 'TRANSFORMER', label: 'Transformateur' },
  { value: 'MOTOR', label: 'Moteur' },
  { value: 'PIPING', label: 'Tuyauterie' },
]

const SERVICE_FALLBACK = [
  { value: 'OIL', label: 'Huile' },
  { value: 'GAS', label: 'Gaz' },
  { value: 'WATER', label: 'Eau' },
  { value: 'CONDENSATE', label: 'Condensat' },
  { value: 'MULTIPHASE', label: 'Multiphase' },
  { value: 'GAS_LIFT', label: 'Gas lift' },
  { value: 'CHEMICAL', label: 'Chimique' },
  { value: 'HYDRAULIC', label: 'Hydraulique' },
  { value: 'POWER_CABLE', label: 'Câble énergie' },
  { value: 'UMBILICAL', label: 'Ombilical' },
]

const CRANE_TYPE_FALLBACK = [
  { value: 'PEDESTAL', label: 'Pedestal' },
  { value: 'LATTICE_BOOM', label: 'Lattice Boom' },
  { value: 'TELESCOPIC', label: 'Telescopic' },
  { value: 'KNUCKLE_BOOM', label: 'Knuckle Boom' },
  { value: 'OVERHEAD', label: 'Overhead' },
]

const SEPARATOR_TYPE_FALLBACK = [
  { value: 'TWO_PHASE', label: '2-Phase' },
  { value: 'THREE_PHASE', label: '3-Phase' },
  { value: 'TEST', label: 'Test' },
  { value: 'SLUG_CATCHER', label: 'Slug Catcher' },
]

const ORIENTATION_FALLBACK = [
  { value: 'HORIZONTAL', label: 'Horizontal' },
  { value: 'VERTICAL', label: 'Vertical' },
]

const PUMP_TYPE_FALLBACK = [
  { value: 'CENTRIFUGAL', label: 'Centrifugal' },
  { value: 'RECIPROCATING', label: 'Reciprocating' },
  { value: 'SCREW', label: 'Screw' },
  { value: 'DIAPHRAGM', label: 'Diaphragm' },
  { value: 'SUBMERSIBLE', label: 'Submersible' },
]

const TANK_TYPE_FALLBACK = [
  { value: 'FIXED_ROOF', label: 'Fixed Roof' },
  { value: 'FLOATING_ROOF', label: 'Floating Roof' },
  { value: 'PRESSURISED', label: 'Pressurised' },
  { value: 'UNDERGROUND', label: 'Underground' },
]


// ════════════════════════════════════════════════════════════════
// CREATE FIELD
// ════════════════════════════════════════════════════════════════

export function CreateFieldPanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const createField = useCreateField()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)

  // Dictionary-driven options with fallback
  const dictEnv = useDictionaryOptions('environment_type')
  const envOptions = dictEnv.length > 0 ? dictEnv : ENVIRONMENT_FALLBACK

  const [form, setForm] = useState<Partial<OilFieldCreate>>({
    code: '',
    name: '',
    country: 'CM',
    operator: 'Perenco',
    environment: undefined,
    basin: '',
    block_name: '',
    license_number: '',
    license_type: '',
    license_expiry_date: undefined,
    working_interest_pct: undefined,
    regulator: '',
    centroid_latitude: undefined,
    centroid_longitude: undefined,
    area_km2: undefined,
    discovery_year: undefined,
    first_production_year: undefined,
    reservoir_formation: '',
    original_oil_in_place_mmbo: undefined,
    recoverable_reserves_mmbo: undefined,
    status: 'OPERATIONAL',
    notes: '',
  })

  const set = useCallback((patch: Partial<OilFieldCreate>) => setForm((f) => ({ ...f, ...patch })), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload: OilFieldCreate = {
      code: form.code!,
      name: form.name!,
      country: form.country!,
      basin: form.basin || null,
      block_name: form.block_name || null,
      license_number: form.license_number || null,
      operator: form.operator || null,
      environment: form.environment || null,
      status: form.status || 'OPERATIONAL',
      notes: form.notes || null,
    } as OilFieldCreate
    if (form.license_type) (payload as any).license_type = form.license_type
    if (form.license_expiry_date) (payload as any).license_expiry_date = form.license_expiry_date
    if (form.working_interest_pct != null) (payload as any).working_interest_pct = form.working_interest_pct
    if (form.regulator) (payload as any).regulator = form.regulator
    if (form.centroid_latitude != null) (payload as any).centroid_latitude = form.centroid_latitude
    if (form.centroid_longitude != null) (payload as any).centroid_longitude = form.centroid_longitude
    if (form.area_km2 != null) (payload as any).area_km2 = form.area_km2
    if (form.discovery_year != null) (payload as any).discovery_year = form.discovery_year
    if (form.first_production_year != null) (payload as any).first_production_year = form.first_production_year
    if (form.reservoir_formation) (payload as any).reservoir_formation = form.reservoir_formation
    if (form.original_oil_in_place_mmbo != null) (payload as any).original_oil_in_place_mmbo = form.original_oil_in_place_mmbo
    if (form.recoverable_reserves_mmbo != null) (payload as any).recoverable_reserves_mmbo = form.recoverable_reserves_mmbo

    await createField.mutateAsync(payload as any)
    toast({ title: t('assets.field_created'), variant: 'success' })
    closeDynamicPanel()
  }

  return (
    <DynamicPanelShell
      title={t('assets.create_field')}
      subtitle={t('assets.field')}
      icon={<MapPin size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>
            {t('common.cancel')}
          </PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createField.isPending}
            onClick={() => (document.getElementById('create-field-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createField.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-field-form" onSubmit={handleSubmit} className="p-4 space-y-5">
        {/* ── Identity ── */}
        <FormSection title={t('assets.identity')}>
          <FormGrid>
            <DynamicPanelField label={t('common.code')} required>
              <input type="text" required maxLength={30} value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} className={panelInputClass} placeholder="RIO-DEL-REY" />
            </DynamicPanelField>
            <DynamicPanelField label={t('common.name')} required>
              <input type="text" required maxLength={200} value={form.name} onChange={(e) => set({ name: e.target.value })} className={panelInputClass} placeholder="Rio Del Rey" />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.country')} required>
              <CountrySelect value={form.country || null} onChange={(v) => set({ country: v })} />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.operator')}>
              <input type="text" value={form.operator || ''} onChange={(e) => set({ operator: e.target.value })} className={panelInputClass} placeholder="Perenco" />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.environment')}>
              <select value={form.environment || ''} onChange={(e) => set({ environment: e.target.value || undefined })} className={panelInputClass}>
                <option value="">—</option>
                {envOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('common.status')}>
              <TagSelector options={STATUS_OPTIONS} value={form.status || 'OPERATIONAL'} onChange={(v) => set({ status: v as any })} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        {/* ── Geology ── */}
        <FormSection title={t('assets.geology')}>
          <FormGrid>
            <DynamicPanelField label={t('assets.basin')}>
              <input type="text" value={form.basin || ''} onChange={(e) => set({ basin: e.target.value })} className={panelInputClass} placeholder="Rio Del Rey Basin" />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.block_name')}>
              <input type="text" value={form.block_name || ''} onChange={(e) => set({ block_name: e.target.value })} className={panelInputClass} placeholder="Block A" />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.discovery_year')}>
              <input type="number" min={1900} max={2100} value={form.discovery_year ?? ''} onChange={(e) => set({ discovery_year: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.first_production_year')}>
              <input type="number" min={1900} max={2100} value={form.first_production_year ?? ''} onChange={(e) => set({ first_production_year: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.reservoir_formation')}>
              <input type="text" value={form.reservoir_formation || ''} onChange={(e) => set({ reservoir_formation: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        {/* ── License ── */}
        <FormSection title={t('assets.license')}>
          <FormGrid>
            <DynamicPanelField label={t('assets.license_number')}>
              <input type="text" value={form.license_number || ''} onChange={(e) => set({ license_number: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.license_type')}>
              <input type="text" value={form.license_type || ''} onChange={(e) => set({ license_type: e.target.value })} className={panelInputClass} placeholder="Exploitation" />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.license_expiry')}>
              <input type="date" value={form.license_expiry_date || ''} onChange={(e) => set({ license_expiry_date: e.target.value || undefined })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.working_interest')}>
              <input type="number" step="0.01" min={0} max={100} value={form.working_interest_pct ?? ''} onChange={(e) => set({ working_interest_pct: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder="%" />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.regulator')}>
              <input type="text" value={form.regulator || ''} onChange={(e) => set({ regulator: e.target.value })} className={panelInputClass} placeholder="SNH" />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        {/* ── Location ── */}
        <FormSection title={t('assets.location')}>
          <FormGrid>
            <DynamicPanelField label={t('assets.centroid_latitude')}>
              <input type="number" step="0.000001" value={form.centroid_latitude ?? ''} onChange={(e) => set({ centroid_latitude: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.centroid_longitude')}>
              <input type="number" step="0.000001" value={form.centroid_longitude ?? ''} onChange={(e) => set({ centroid_longitude: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.area_km2')}>
              <input type="number" step="0.01" min={0} value={form.area_km2 ?? ''} onChange={(e) => set({ area_km2: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder="km²" />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        {/* ── Reserves ── */}
        <FormSection title={t('assets.reserves')}>
          <FormGrid>
            <DynamicPanelField label={t('assets.ooip_mmbo')}>
              <input type="number" step="0.01" min={0} value={form.original_oil_in_place_mmbo ?? ''} onChange={(e) => set({ original_oil_in_place_mmbo: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder="MMbo" />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.recoverable_mmbo')}>
              <input type="number" step="0.01" min={0} value={form.recoverable_reserves_mmbo ?? ''} onChange={(e) => set({ recoverable_reserves_mmbo: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder="MMbo" />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        {/* ── Notes ── */}
        <FormSection title={t('common.notes')}>
          <DynamicPanelField label={t('common.notes')} span="full">
            <textarea rows={3} value={form.notes || ''} onChange={(e) => set({ notes: e.target.value })} className={panelInputClass} />
          </DynamicPanelField>
        </FormSection>
      </form>
    </DynamicPanelShell>
  )
}


// ════════════════════════════════════════════════════════════════
// CREATE SITE
// ════════════════════════════════════════════════════════════════

export function CreateSitePanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const createSite = useCreateSite()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)

  // Parent data
  const { data: fieldsData } = useFields({ page: 1, page_size: 500 })

  // Dictionary-driven options with fallback
  const dictEnv = useDictionaryOptions('environment_type')
  const dictSiteType = useDictionaryOptions('site_type')
  const envOptions = dictEnv.length > 0 ? dictEnv : ENVIRONMENT_FALLBACK
  const siteTypeOptions = dictSiteType.length > 0 ? dictSiteType : SITE_TYPE_FALLBACK

  const [form, setForm] = useState<Partial<OilSiteCreate>>({
    field_id: '',
    code: '',
    name: '',
    site_type: '',
    environment: '',
    country: 'CM',
    latitude: undefined,
    longitude: undefined,
    region: '',
    water_depth_m: undefined,
    manned: true,
    pob_capacity: undefined,
    status: 'OPERATIONAL',
    notes: '',
  })

  const set = useCallback((patch: Partial<OilSiteCreate>) => setForm((f) => ({ ...f, ...patch })), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload: OilSiteCreate = {
      field_id: form.field_id!,
      code: form.code!,
      name: form.name!,
      site_type: form.site_type!,
      environment: form.environment!,
      country: form.country!,
      latitude: form.latitude ?? null,
      longitude: form.longitude ?? null,
      region: form.region || null,
      water_depth_m: form.water_depth_m ?? null,
      manned: form.manned ?? true,
      pob_capacity: form.pob_capacity ?? null,
      status: (form.status || 'OPERATIONAL') as any,
      notes: form.notes || null,
    }
    await createSite.mutateAsync(payload as any)
    toast({ title: t('assets.site_created'), variant: 'success' })
    closeDynamicPanel()
  }

  return (
    <DynamicPanelShell
      title={t('assets.create_site')}
      subtitle={t('assets.site')}
      icon={<Landmark size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>
            {t('common.cancel')}
          </PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createSite.isPending}
            onClick={() => (document.getElementById('create-site-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createSite.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-site-form" onSubmit={handleSubmit} className="p-4 space-y-5">
        {/* ── Parent & Identity ── */}
        <FormSection title={t('assets.identity')}>
          <FormGrid>
            <DynamicPanelField label={t('assets.field')} required>
              <select required value={form.field_id || ''} onChange={(e) => set({ field_id: e.target.value })} className={panelInputClass}>
                <option value="">{t('common.select')}...</option>
                {(fieldsData?.items ?? []).map((f) => (
                  <option key={f.id} value={f.id}>{f.code} — {f.name}</option>
                ))}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('common.code')} required>
              <input type="text" required maxLength={30} value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} className={panelInputClass} placeholder="EBOME-MLF" />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('common.name')} required>
              <input type="text" required maxLength={200} value={form.name} onChange={(e) => set({ name: e.target.value })} className={panelInputClass} placeholder="Ebome Marine Loading Facility" />
            </DynamicPanelField>
            <DynamicPanelField label={t('common.type')} required>
              <select required value={form.site_type || ''} onChange={(e) => set({ site_type: e.target.value })} className={panelInputClass}>
                <option value="">{t('common.select')}...</option>
                {siteTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.environment')} required>
              <select required value={form.environment || ''} onChange={(e) => set({ environment: e.target.value })} className={panelInputClass}>
                <option value="">{t('common.select')}...</option>
                {envOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.country')} required>
              <CountrySelect value={form.country || null} onChange={(v) => set({ country: v })} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.region')}>
              <input type="text" value={form.region || ''} onChange={(e) => set({ region: e.target.value })} className={panelInputClass} placeholder="Sud-Ouest" />
            </DynamicPanelField>
            <DynamicPanelField label={t('common.status')}>
              <TagSelector options={STATUS_OPTIONS} value={form.status || 'OPERATIONAL'} onChange={(v) => set({ status: v as any })} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        {/* ── Location ── */}
        <FormSection title={t('assets.location')}>
          <FormGrid>
            <DynamicPanelField label={t('assets.centroid_latitude')}>
              <input type="number" step="0.000001" value={form.latitude ?? ''} onChange={(e) => set({ latitude: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.centroid_longitude')}>
              <input type="number" step="0.000001" value={form.longitude ?? ''} onChange={(e) => set({ longitude: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.water_depth')}>
              <input type="number" step="0.1" min={0} value={form.water_depth_m ?? ''} onChange={(e) => set({ water_depth_m: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder="m" />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        {/* ── Access & Capacity ── */}
        <FormSection title={t('assets.access')}>
          <FormGrid>
            <DynamicPanelField label={t('assets.manned')}>
              <label className="flex items-center gap-2.5 cursor-pointer group mt-1">
                <input type="checkbox" checked={form.manned ?? true} onChange={(e) => set({ manned: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                <span className="text-sm text-foreground group-hover:text-primary transition-colors">{t('common.yes')}</span>
              </label>
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.pob_capacity')}>
              <input type="number" min={0} value={form.pob_capacity ?? ''} onChange={(e) => set({ pob_capacity: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        {/* ── Notes ── */}
        <FormSection title={t('common.notes')}>
          <DynamicPanelField label={t('common.notes')} span="full">
            <textarea rows={3} value={form.notes || ''} onChange={(e) => set({ notes: e.target.value })} className={panelInputClass} />
          </DynamicPanelField>
        </FormSection>
      </form>
    </DynamicPanelShell>
  )
}


// ════════════════════════════════════════════════════════════════
// CREATE INSTALLATION
// ════════════════════════════════════════════════════════════════

export function CreateInstallationPanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const createInstallation = useCreateInstallation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)

  // Parent data
  const { data: sitesData } = useSites({ page: 1, page_size: 500 })

  // Dictionary-driven options with fallback
  const dictEnv = useDictionaryOptions('environment_type')
  const dictInstType = useDictionaryOptions('installation_type')
  const envOptions = dictEnv.length > 0 ? dictEnv : ENVIRONMENT_FALLBACK
  const instTypeOptions = dictInstType.length > 0 ? dictInstType : INSTALLATION_TYPE_FALLBACK

  const [form, setForm] = useState<Partial<InstallationCreate>>({
    site_id: '',
    code: '',
    name: '',
    installation_type: '',
    environment: '',
    latitude: undefined,
    longitude: undefined,
    water_depth_m: undefined,
    status: 'OPERATIONAL',
    is_manned: true,
    pob_max: undefined,
    design_life_years: undefined,
    notes: '',
  })

  const set = useCallback((patch: Partial<InstallationCreate>) => setForm((f) => ({ ...f, ...patch })), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload: InstallationCreate = {
      site_id: form.site_id!,
      code: form.code!,
      name: form.name!,
      installation_type: form.installation_type!,
      environment: form.environment!,
      latitude: form.latitude ?? null,
      longitude: form.longitude ?? null,
      water_depth_m: form.water_depth_m ?? null,
      status: (form.status || 'OPERATIONAL') as any,
      is_manned: form.is_manned ?? true,
      pob_max: form.pob_max ?? null,
      design_life_years: form.design_life_years ?? null,
      notes: form.notes || null,
    }
    await createInstallation.mutateAsync(payload as any)
    toast({ title: t('assets.installation_created'), variant: 'success' })
    closeDynamicPanel()
  }

  return (
    <DynamicPanelShell
      title={t('assets.create_installation')}
      subtitle={t('assets.installation')}
      icon={<Factory size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>
            {t('common.cancel')}
          </PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createInstallation.isPending}
            onClick={() => (document.getElementById('create-installation-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createInstallation.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-installation-form" onSubmit={handleSubmit} className="p-4 space-y-5">
        {/* ── Parent & Identity ── */}
        <FormSection title={t('assets.identity')}>
          <FormGrid>
            <DynamicPanelField label={t('assets.site')} required>
              <select required value={form.site_id || ''} onChange={(e) => set({ site_id: e.target.value })} className={panelInputClass}>
                <option value="">{t('common.select')}...</option>
                {(sitesData?.items ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                ))}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('common.code')} required>
              <input type="text" required maxLength={30} value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} className={panelInputClass} placeholder="EBOME-P1" />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('common.name')} required>
              <input type="text" required maxLength={200} value={form.name} onChange={(e) => set({ name: e.target.value })} className={panelInputClass} placeholder="Platform Ebome 1" />
            </DynamicPanelField>
            <DynamicPanelField label={t('common.type')} required>
              <select required value={form.installation_type || ''} onChange={(e) => set({ installation_type: e.target.value })} className={panelInputClass}>
                <option value="">{t('common.select')}...</option>
                {instTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.environment')} required>
              <select required value={form.environment || ''} onChange={(e) => set({ environment: e.target.value })} className={panelInputClass}>
                <option value="">{t('common.select')}...</option>
                {envOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('common.status')}>
              <TagSelector options={STATUS_OPTIONS} value={form.status || 'OPERATIONAL'} onChange={(v) => set({ status: v as any })} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        {/* ── Manning ── */}
        <FormSection title={t('assets.manning')}>
          <FormGrid>
            <DynamicPanelField label={t('assets.manned')}>
              <label className="flex items-center gap-2.5 cursor-pointer group mt-1">
                <input type="checkbox" checked={form.is_manned ?? true} onChange={(e) => set({ is_manned: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                <span className="text-sm text-foreground group-hover:text-primary transition-colors">{t('common.yes')}</span>
              </label>
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.pob_capacity')}>
              <input type="number" min={0} value={form.pob_max ?? ''} onChange={(e) => set({ pob_max: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        {/* ── Location ── */}
        <FormSection title={t('assets.location')}>
          <FormGrid>
            <DynamicPanelField label={t('assets.centroid_latitude')}>
              <input type="number" step="0.000001" value={form.latitude ?? ''} onChange={(e) => set({ latitude: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.centroid_longitude')}>
              <input type="number" step="0.000001" value={form.longitude ?? ''} onChange={(e) => set({ longitude: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.water_depth')}>
              <input type="number" step="0.1" min={0} value={form.water_depth_m ?? ''} onChange={(e) => set({ water_depth_m: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder="m" />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        {/* ── Design ── */}
        <FormSection title={t('assets.design')}>
          <FormGrid>
            <DynamicPanelField label={t('assets.design_life')}>
              <input type="number" min={0} value={form.design_life_years ?? ''} onChange={(e) => set({ design_life_years: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder={t('common.years')} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        {/* ── Notes ── */}
        <FormSection title={t('common.notes')}>
          <DynamicPanelField label={t('common.notes')} span="full">
            <textarea rows={3} value={form.notes || ''} onChange={(e) => set({ notes: e.target.value })} className={panelInputClass} />
          </DynamicPanelField>
        </FormSection>
      </form>
    </DynamicPanelShell>
  )
}


// ════════════════════════════════════════════════════════════════
// CREATE EQUIPMENT (contextual by equipment_class)
// ════════════════════════════════════════════════════════════════

export function CreateEquipmentPanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const createEquipment = useCreateEquipment()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)

  // Parent data
  const { data: installationsData } = useInstallations({ page: 1, page_size: 500 })

  // Dictionary-driven options with fallback
  const dictClass = useDictionaryOptions('equipment_class')
  const dictCriticality = useDictionaryOptions('criticality')
  const dictCraneType = useDictionaryOptions('crane_type')
  const dictSeparatorType = useDictionaryOptions('separator_type')
  const dictOrientation = useDictionaryOptions('orientation')
  const dictPumpType = useDictionaryOptions('pump_type')
  const dictTankType = useDictionaryOptions('tank_type')

  const classOptions = dictClass.length > 0 ? dictClass : EQUIPMENT_CLASS_FALLBACK
  const criticalityOptions = dictCriticality.length > 0 ? dictCriticality : CRITICALITY_FALLBACK
  const craneTypeOptions = dictCraneType.length > 0 ? dictCraneType : CRANE_TYPE_FALLBACK
  const separatorTypeOptions = dictSeparatorType.length > 0 ? dictSeparatorType : SEPARATOR_TYPE_FALLBACK
  const orientationOptions = dictOrientation.length > 0 ? dictOrientation : ORIENTATION_FALLBACK
  const pumpTypeOptions = dictPumpType.length > 0 ? dictPumpType : PUMP_TYPE_FALLBACK
  const tankTypeOptions = dictTankType.length > 0 ? dictTankType : TANK_TYPE_FALLBACK

  const [form, setForm] = useState<Record<string, any>>({
    tag_number: '',
    name: '',
    equipment_class: '',
    installation_id: '',
    manufacturer: '',
    model: '',
    serial_number: '',
    year_manufactured: undefined,
    year_installed: undefined,
    status: 'OPERATIONAL',
    criticality: undefined,
    safety_function: false,
    notes: '',
    // Crane-specific
    crane_mount_type: '',
    crane_swl_tonnes: undefined,
    crane_boom_max_length_m: undefined,
    crane_max_range_m: undefined,
    // Separator-specific
    separator_type: '',
    separator_orientation: '',
    separator_shell_id_mm: undefined,
    separator_design_pressure_barg: undefined,
    separator_design_temp_max_c: undefined,
    // Pump-specific
    pump_type: '',
    pump_flow_rated_m3h: undefined,
    pump_head_rated_m: undefined,
    pump_motor_power_kw: undefined,
    // Storage tank-specific
    tank_type: '',
    tank_nominal_capacity_m3: undefined,
    tank_shell_diameter_m: undefined,
  })

  const set = useCallback((patch: Record<string, any>) => setForm((f) => ({ ...f, ...patch })), [])

  const eqClass = form.equipment_class as string

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload: EquipmentCreate = {
      tag_number: form.tag_number,
      name: form.name,
      equipment_class: form.equipment_class,
      installation_id: form.installation_id || null,
      manufacturer: form.manufacturer || null,
      model: form.model || null,
      serial_number: form.serial_number || null,
      year_manufactured: form.year_manufactured ?? null,
      year_installed: form.year_installed ?? null,
      status: (form.status || 'OPERATIONAL') as any,
      criticality: (form.criticality as any) || null,
      safety_function: form.safety_function ?? false,
      notes: form.notes || null,
    }

    // Add contextual fields as extra_data depending on class
    const extra: Record<string, any> = {}
    if (eqClass === 'CRANE') {
      if (form.crane_mount_type) extra.mount_type = form.crane_mount_type
      if (form.crane_swl_tonnes != null) extra.swl_tonnes = form.crane_swl_tonnes
      if (form.crane_boom_max_length_m != null) extra.boom_max_length_m = form.crane_boom_max_length_m
      if (form.crane_max_range_m != null) extra.max_range_m = form.crane_max_range_m
    } else if (eqClass === 'SEPARATOR') {
      if (form.separator_type) extra.separator_type = form.separator_type
      if (form.separator_orientation) extra.orientation = form.separator_orientation
      if (form.separator_shell_id_mm != null) extra.shell_id_mm = form.separator_shell_id_mm
      if (form.separator_design_pressure_barg != null) extra.design_pressure_barg = form.separator_design_pressure_barg
      if (form.separator_design_temp_max_c != null) extra.design_temp_max_c = form.separator_design_temp_max_c
    } else if (eqClass === 'PUMP') {
      if (form.pump_type) extra.pump_type = form.pump_type
      if (form.pump_flow_rated_m3h != null) extra.flow_rated_m3h = form.pump_flow_rated_m3h
      if (form.pump_head_rated_m != null) extra.head_rated_m = form.pump_head_rated_m
      if (form.pump_motor_power_kw != null) extra.motor_power_kw = form.pump_motor_power_kw
    } else if (eqClass === 'STORAGE_TANK') {
      if (form.tank_type) extra.tank_type = form.tank_type
      if (form.tank_nominal_capacity_m3 != null) extra.nominal_capacity_m3 = form.tank_nominal_capacity_m3
      if (form.tank_shell_diameter_m != null) extra.shell_diameter_m = form.tank_shell_diameter_m
    }

    const fullPayload = Object.keys(extra).length > 0
      ? { ...payload, ...extra }
      : payload

    await createEquipment.mutateAsync(fullPayload as any)
    toast({ title: t('assets.equipment_created'), variant: 'success' })
    closeDynamicPanel()
  }

  return (
    <DynamicPanelShell
      title={t('assets.create_equipment')}
      subtitle={t('assets.equipment_tab')}
      icon={<Wrench size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>
            {t('common.cancel')}
          </PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createEquipment.isPending}
            onClick={() => (document.getElementById('create-equipment-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createEquipment.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-equipment-form" onSubmit={handleSubmit} className="p-4 space-y-5">
        {/* ── Identity ── */}
        <FormSection title={t('assets.identity')}>
          <FormGrid>
            <DynamicPanelField label={t('assets.tag_number')} required>
              <input type="text" required maxLength={50} value={form.tag_number} onChange={(e) => set({ tag_number: e.target.value.toUpperCase() })} className={panelInputClass} placeholder="21-PA-001" />
            </DynamicPanelField>
            <DynamicPanelField label={t('common.name')} required>
              <input type="text" required maxLength={200} value={form.name} onChange={(e) => set({ name: e.target.value })} className={panelInputClass} placeholder="Crude Oil Export Pump A" />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.equipment_class')} required>
              <select required value={form.equipment_class || ''} onChange={(e) => set({ equipment_class: e.target.value })} className={panelInputClass}>
                <option value="">{t('common.select')}...</option>
                {classOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.installation')}>
              <select value={form.installation_id || ''} onChange={(e) => set({ installation_id: e.target.value || undefined })} className={panelInputClass}>
                <option value="">{t('common.select')}...</option>
                {(installationsData?.items ?? []).map((i) => (
                  <option key={i.id} value={i.id}>{i.code} — {i.name}</option>
                ))}
              </select>
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('common.status')}>
              <TagSelector options={STATUS_OPTIONS} value={form.status || 'OPERATIONAL'} onChange={(v) => set({ status: v })} />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.criticality')}>
              <select value={form.criticality || ''} onChange={(e) => set({ criticality: e.target.value || undefined })} className={panelInputClass}>
                <option value="">—</option>
                {criticalityOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.safety_function')}>
              <label className="flex items-center gap-2.5 cursor-pointer group mt-1">
                <input type="checkbox" checked={form.safety_function ?? false} onChange={(e) => set({ safety_function: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                <span className="text-sm text-foreground group-hover:text-primary transition-colors">{t('common.yes')}</span>
              </label>
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        {/* ── Contextual: CRANE ── */}
        {eqClass === 'CRANE' && (
          <FormSection title={t('assets.crane_details')}>
            <FormGrid>
              <DynamicPanelField label={t('assets.crane_mount_type')}>
                <select value={form.crane_mount_type || ''} onChange={(e) => set({ crane_mount_type: e.target.value || undefined })} className={panelInputClass}>
                  <option value="">—</option>
                  {craneTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label={t('assets.swl_tonnes')}>
                <input type="number" step="0.1" min={0} value={form.crane_swl_tonnes ?? ''} onChange={(e) => set({ crane_swl_tonnes: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder="t" />
              </DynamicPanelField>
            </FormGrid>
            <FormGrid>
              <DynamicPanelField label={t('assets.boom_max_length')}>
                <input type="number" step="0.1" min={0} value={form.crane_boom_max_length_m ?? ''} onChange={(e) => set({ crane_boom_max_length_m: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder="m" />
              </DynamicPanelField>
              <DynamicPanelField label={t('assets.max_range')}>
                <input type="number" step="0.1" min={0} value={form.crane_max_range_m ?? ''} onChange={(e) => set({ crane_max_range_m: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder="m" />
              </DynamicPanelField>
            </FormGrid>
            <FormGrid>
              <DynamicPanelField label={t('assets.manufacturer')}>
                <input type="text" value={form.manufacturer || ''} onChange={(e) => set({ manufacturer: e.target.value })} className={panelInputClass} placeholder="Liebherr" />
              </DynamicPanelField>
              <DynamicPanelField label={t('assets.model_ref')}>
                <input type="text" value={form.model || ''} onChange={(e) => set({ model: e.target.value })} className={panelInputClass} placeholder="HMC 205" />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
        )}

        {/* ── Contextual: SEPARATOR ── */}
        {eqClass === 'SEPARATOR' && (
          <FormSection title={t('assets.separator_details')}>
            <FormGrid>
              <DynamicPanelField label={t('assets.separator_type')}>
                <select value={form.separator_type || ''} onChange={(e) => set({ separator_type: e.target.value || undefined })} className={panelInputClass}>
                  <option value="">—</option>
                  {separatorTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label={t('assets.orientation')}>
                <select value={form.separator_orientation || ''} onChange={(e) => set({ separator_orientation: e.target.value || undefined })} className={panelInputClass}>
                  <option value="">—</option>
                  {orientationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </DynamicPanelField>
            </FormGrid>
            <FormGrid>
              <DynamicPanelField label={t('assets.shell_id_mm')}>
                <input type="number" step="0.1" min={0} value={form.separator_shell_id_mm ?? ''} onChange={(e) => set({ separator_shell_id_mm: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder="mm" />
              </DynamicPanelField>
              <DynamicPanelField label={t('assets.design_pressure')}>
                <input type="number" step="0.1" min={0} value={form.separator_design_pressure_barg ?? ''} onChange={(e) => set({ separator_design_pressure_barg: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder="barg" />
              </DynamicPanelField>
            </FormGrid>
            <FormGrid>
              <DynamicPanelField label={t('assets.design_temp')}>
                <input type="number" step="0.1" value={form.separator_design_temp_max_c ?? ''} onChange={(e) => set({ separator_design_temp_max_c: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder="°C" />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
        )}

        {/* ── Contextual: PUMP ── */}
        {eqClass === 'PUMP' && (
          <FormSection title={t('assets.pump_details')}>
            <FormGrid>
              <DynamicPanelField label={t('assets.pump_type')}>
                <select value={form.pump_type || ''} onChange={(e) => set({ pump_type: e.target.value || undefined })} className={panelInputClass}>
                  <option value="">—</option>
                  {pumpTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label={t('assets.flow_rated_m3h')}>
                <input type="number" step="0.1" min={0} value={form.pump_flow_rated_m3h ?? ''} onChange={(e) => set({ pump_flow_rated_m3h: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder="m³/h" />
              </DynamicPanelField>
            </FormGrid>
            <FormGrid>
              <DynamicPanelField label={t('assets.head_rated_m')}>
                <input type="number" step="0.1" min={0} value={form.pump_head_rated_m ?? ''} onChange={(e) => set({ pump_head_rated_m: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder="m" />
              </DynamicPanelField>
              <DynamicPanelField label={t('assets.motor_power_kw')}>
                <input type="number" step="0.1" min={0} value={form.pump_motor_power_kw ?? ''} onChange={(e) => set({ pump_motor_power_kw: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder="kW" />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
        )}

        {/* ── Contextual: STORAGE_TANK ── */}
        {eqClass === 'STORAGE_TANK' && (
          <FormSection title={t('assets.tank_details')}>
            <FormGrid>
              <DynamicPanelField label={t('assets.tank_type')}>
                <select value={form.tank_type || ''} onChange={(e) => set({ tank_type: e.target.value || undefined })} className={panelInputClass}>
                  <option value="">—</option>
                  {tankTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </DynamicPanelField>
              <DynamicPanelField label={t('assets.nominal_capacity_m3')}>
                <input type="number" step="0.1" min={0} value={form.tank_nominal_capacity_m3 ?? ''} onChange={(e) => set({ tank_nominal_capacity_m3: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder="m³" />
              </DynamicPanelField>
            </FormGrid>
            <FormGrid>
              <DynamicPanelField label={t('assets.shell_diameter_m')}>
                <input type="number" step="0.01" min={0} value={form.tank_shell_diameter_m ?? ''} onChange={(e) => set({ tank_shell_diameter_m: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder="m" />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
        )}

        {/* ── Manufacturer (generic, shown for all OTHER classes without contextual section) ── */}
        {eqClass !== 'CRANE' && (
          <FormSection title={t('assets.manufacturer_info')}>
            <FormGrid>
              <DynamicPanelField label={t('assets.manufacturer')}>
                <input type="text" value={form.manufacturer || ''} onChange={(e) => set({ manufacturer: e.target.value })} className={panelInputClass} placeholder="Flowserve" />
              </DynamicPanelField>
              <DynamicPanelField label={t('assets.model_ref')}>
                <input type="text" value={form.model || ''} onChange={(e) => set({ model: e.target.value })} className={panelInputClass} placeholder="HPX-200" />
              </DynamicPanelField>
            </FormGrid>
            <FormGrid>
              <DynamicPanelField label={t('assets.serial_number')}>
                <input type="text" value={form.serial_number || ''} onChange={(e) => set({ serial_number: e.target.value })} className={panelInputClass} />
              </DynamicPanelField>
            </FormGrid>
            <FormGrid>
              <DynamicPanelField label={t('assets.year_manufactured')}>
                <input type="number" min={1900} max={2100} value={form.year_manufactured ?? ''} onChange={(e) => set({ year_manufactured: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} />
              </DynamicPanelField>
              <DynamicPanelField label={t('assets.year_installed')}>
                <input type="number" min={1900} max={2100} value={form.year_installed ?? ''} onChange={(e) => set({ year_installed: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>
        )}

        {/* ── Notes ── */}
        <FormSection title={t('common.notes')}>
          <DynamicPanelField label={t('common.notes')} span="full">
            <textarea rows={3} value={form.notes || ''} onChange={(e) => set({ notes: e.target.value })} className={panelInputClass} />
          </DynamicPanelField>
        </FormSection>
      </form>
    </DynamicPanelShell>
  )
}


// ════════════════════════════════════════════════════════════════
// CREATE PIPELINE
// ════════════════════════════════════════════════════════════════

export function CreatePipelinePanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const createPipeline = useCreatePipeline()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)

  // Parent data
  const { data: installationsData } = useInstallations({ page: 1, page_size: 500 })

  // Dictionary-driven options with fallback
  const dictService = useDictionaryOptions('pipeline_service')
  const serviceOptions = dictService.length > 0 ? dictService : SERVICE_FALLBACK

  const [form, setForm] = useState<Partial<PipelineCreate>>({
    pipeline_id: '',
    name: '',
    service: '',
    from_installation_id: '',
    to_installation_id: '',
    from_node_description: '',
    to_node_description: '',
    nominal_diameter_in: undefined,
    design_pressure_barg: undefined,
    design_temp_max_c: undefined,
    status: 'OPERATIONAL',
    pipe_material: '',
    pipe_grade: '',
    total_length_km: undefined,
    wall_thickness_mm: undefined,
    fluid_description: '',
    h2s_ppm: undefined,
    piggable: false,
    design_code: '',
    design_life_years: undefined,
    installation_year: undefined,
    notes: '',
  })

  const set = useCallback((patch: Partial<PipelineCreate>) => setForm((f) => ({ ...f, ...patch })), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload: PipelineCreate = {
      pipeline_id: form.pipeline_id!,
      name: form.name!,
      service: form.service!,
      from_installation_id: form.from_installation_id!,
      to_installation_id: form.to_installation_id!,
      nominal_diameter_in: form.nominal_diameter_in!,
      design_pressure_barg: form.design_pressure_barg!,
      design_temp_max_c: form.design_temp_max_c!,
      status: (form.status || 'OPERATIONAL') as any,
      pipe_material: form.pipe_material || null,
      total_length_km: form.total_length_km ?? null,
      notes: form.notes || null,
    }
    if (form.from_node_description) (payload as any).from_node_description = form.from_node_description
    if (form.to_node_description) (payload as any).to_node_description = form.to_node_description
    if (form.pipe_grade) (payload as any).pipe_grade = form.pipe_grade
    if (form.wall_thickness_mm != null) (payload as any).wall_thickness_mm = form.wall_thickness_mm
    if (form.fluid_description) (payload as any).fluid_description = form.fluid_description
    if (form.h2s_ppm != null) (payload as any).h2s_ppm = form.h2s_ppm
    if (form.piggable) (payload as any).piggable = form.piggable
    if (form.design_code) (payload as any).design_code = form.design_code
    if (form.design_life_years != null) (payload as any).design_life_years = form.design_life_years
    if (form.installation_year != null) (payload as any).installation_year = form.installation_year

    await createPipeline.mutateAsync(payload as any)
    toast({ title: t('assets.pipeline_created'), variant: 'success' })
    closeDynamicPanel()
  }

  return (
    <DynamicPanelShell
      title={t('assets.create_pipeline')}
      subtitle={t('assets.pipeline')}
      icon={<Ship size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>
            {t('common.cancel')}
          </PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createPipeline.isPending}
            onClick={() => (document.getElementById('create-pipeline-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createPipeline.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-pipeline-form" onSubmit={handleSubmit} className="p-4 space-y-5">
        {/* ── Identity ── */}
        <FormSection title={t('assets.identity')}>
          <FormGrid>
            <DynamicPanelField label={t('assets.pipeline_id')} required>
              <input type="text" required maxLength={50} value={form.pipeline_id} onChange={(e) => set({ pipeline_id: e.target.value.toUpperCase() })} className={panelInputClass} placeholder="PL-EBOME-MLF-01" />
            </DynamicPanelField>
            <DynamicPanelField label={t('common.name')} required>
              <input type="text" required maxLength={200} value={form.name} onChange={(e) => set({ name: e.target.value })} className={panelInputClass} placeholder="Crude Oil Export Pipeline" />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.service')} required>
              <select required value={form.service || ''} onChange={(e) => set({ service: e.target.value })} className={panelInputClass}>
                <option value="">{t('common.select')}...</option>
                {serviceOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('common.status')}>
              <TagSelector options={STATUS_OPTIONS} value={form.status || 'OPERATIONAL'} onChange={(v) => set({ status: v as any })} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        {/* ── Routing ── */}
        <FormSection title={t('assets.routing')}>
          <FormGrid>
            <DynamicPanelField label={t('assets.from_installation')} required>
              <select required value={form.from_installation_id || ''} onChange={(e) => set({ from_installation_id: e.target.value })} className={panelInputClass}>
                <option value="">{t('common.select')}...</option>
                {(installationsData?.items ?? []).map((i) => (
                  <option key={i.id} value={i.id}>{i.code} — {i.name}</option>
                ))}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.to_installation')} required>
              <select required value={form.to_installation_id || ''} onChange={(e) => set({ to_installation_id: e.target.value })} className={panelInputClass}>
                <option value="">{t('common.select')}...</option>
                {(installationsData?.items ?? []).map((i) => (
                  <option key={i.id} value={i.id}>{i.code} — {i.name}</option>
                ))}
              </select>
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.from_node_desc')}>
              <input type="text" value={form.from_node_description || ''} onChange={(e) => set({ from_node_description: e.target.value })} className={panelInputClass} placeholder="Platform riser" />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.to_node_desc')}>
              <input type="text" value={form.to_node_description || ''} onChange={(e) => set({ to_node_description: e.target.value })} className={panelInputClass} placeholder="Onshore pig receiver" />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        {/* ── Dimensions ── */}
        <FormSection title={t('assets.dimensions')}>
          <FormGrid>
            <DynamicPanelField label={t('assets.nominal_diameter')} required>
              <input type="number" required step="0.1" min={0} value={form.nominal_diameter_in ?? ''} onChange={(e) => set({ nominal_diameter_in: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder='pouces (")'  />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.pipeline_length')}>
              <input type="number" step="0.01" min={0} value={form.total_length_km ?? ''} onChange={(e) => set({ total_length_km: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder="km" />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.wall_thickness')}>
              <input type="number" step="0.1" min={0} value={form.wall_thickness_mm ?? ''} onChange={(e) => set({ wall_thickness_mm: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder="mm" />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        {/* ── Design ── */}
        <FormSection title={t('assets.design')}>
          <FormGrid>
            <DynamicPanelField label={t('assets.design_pressure')} required>
              <input type="number" required step="0.1" min={0} value={form.design_pressure_barg ?? ''} onChange={(e) => set({ design_pressure_barg: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder="barg" />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.design_temp')} required>
              <input type="number" required step="0.1" value={form.design_temp_max_c ?? ''} onChange={(e) => set({ design_temp_max_c: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder="°C" />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.pipe_material')}>
              <input type="text" value={form.pipe_material || ''} onChange={(e) => set({ pipe_material: e.target.value })} className={panelInputClass} placeholder="Carbon Steel" />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.pipe_grade')}>
              <input type="text" value={form.pipe_grade || ''} onChange={(e) => set({ pipe_grade: e.target.value })} className={panelInputClass} placeholder="API 5L X65" />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.design_code')}>
              <input type="text" value={form.design_code || ''} onChange={(e) => set({ design_code: e.target.value })} className={panelInputClass} placeholder="DNV-OS-F101" />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.design_life')}>
              <input type="number" min={0} value={form.design_life_years ?? ''} onChange={(e) => set({ design_life_years: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder={t('common.years')} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        {/* ── Fluid ── */}
        <FormSection title={t('assets.fluid')}>
          <FormGrid>
            <DynamicPanelField label={t('assets.fluid_description')}>
              <input type="text" value={form.fluid_description || ''} onChange={(e) => set({ fluid_description: e.target.value })} className={panelInputClass} placeholder="Crude oil + produced water" />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.h2s_ppm')}>
              <input type="number" step="0.1" min={0} value={form.h2s_ppm ?? ''} onChange={(e) => set({ h2s_ppm: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.piggable')}>
              <label className="flex items-center gap-2.5 cursor-pointer group mt-1">
                <input type="checkbox" checked={form.piggable ?? false} onChange={(e) => set({ piggable: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                <span className="text-sm text-foreground group-hover:text-primary transition-colors">{t('common.yes')}</span>
              </label>
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.installation_year')}>
              <input type="number" min={1900} max={2100} value={form.installation_year ?? ''} onChange={(e) => set({ installation_year: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        {/* ── Notes ── */}
        <FormSection title={t('common.notes')}>
          <DynamicPanelField label={t('common.notes')} span="full">
            <textarea rows={3} value={form.notes || ''} onChange={(e) => set({ notes: e.target.value })} className={panelInputClass} />
          </DynamicPanelField>
        </FormSection>
      </form>
    </DynamicPanelShell>
  )
}
