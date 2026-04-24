/**
 * Create panels for Asset Registry entities — FULL FIELDS.
 *
 * Each form collects ALL fields from the Create schema.
 * Fields are grouped in sections (identity, location, technical, etc.)
 * matching the detail panels layout.
 */
import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, MapPin, Landmark, Factory, Wrench, Ship } from 'lucide-react'
import { DynamicPanelShell, DynamicPanelField, FormGrid, PanelActionButton, TagSelector, panelInputClass } from '@/components/layout/DynamicPanel'
import {
  SmartFormProvider,
  SmartFormSection,
  SmartFormToolbar,
  SmartFormSimpleHint,
  SmartFormWizardNav,
  SmartFormInlineHelpDrawer,
  useSmartForm,
} from '@/components/layout/SmartForm'
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
  useDecks,
} from '@/hooks/useAssetRegistry'
import type {
  OilFieldCreate,
  OilSiteCreate,
  InstallationCreate,
  EquipmentCreate,
  PipelineCreate,
} from '@/types/assetRegistry'


// ── Helper ─────────────────────────────────────────────────────
const numChange = (setter: (p: Record<string, any>) => void, key: string) =>
  (e: React.ChangeEvent<HTMLInputElement>) => setter({ [key]: e.target.value ? Number(e.target.value) : undefined })

// Yes/No labels are supplied by the caller via BoolSelect since this
// helper is module-level (no hook access). Callers pass t('common.yes')
// and t('common.no') explicitly.
function BoolSelect({ value, onChange, className, yesLabel, noLabel }: {
  value: boolean | undefined
  onChange: (v: boolean) => void
  className: string
  yesLabel: string
  noLabel: string
}) {
  return (
    <select value={value === true ? 'true' : value === false ? 'false' : ''} onChange={(e) => onChange(e.target.value === 'true')} className={className}>
      <option value="">—</option>
      <option value="true">{yesLabel}</option>
      <option value="false">{noLabel}</option>
    </select>
  )
}
const boolSelect = (value: boolean | undefined, onChange: (v: boolean) => void, cls: string, yesLabel = 'Oui', noLabel = 'Non') => (
  <BoolSelect value={value} onChange={onChange} className={cls} yesLabel={yesLabel} noLabel={noLabel} />
)

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


// ════════════════════════════════════════════════════════════════
// CREATE FIELD
// ════════════════════════════════════════════════════════════════

export function CreateFieldPanel() {
  return (
    <SmartFormProvider panelId="create-field" defaultMode="simple">
      <CreateFieldInner />
    </SmartFormProvider>
  )
}

function CreateFieldInner() {
  const _ctx = useSmartForm()
  const { t } = useTranslation()
  const { toast } = useToast()
  const createField = useCreateField()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  const dictEnv = useDictionaryOptions('environment_type')
  const envOptions = dictEnv.length > 0 ? dictEnv : ENVIRONMENT_FALLBACK

  const [form, setForm] = useState<Record<string, any>>({
    code: '', name: '', country: 'CM', operator: 'ACME Energy',
    environment: undefined, status: 'OPERATIONAL',
  })

  const set = useCallback((patch: Record<string, any>) => setForm((f) => ({ ...f, ...patch })), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const created = await createField.mutateAsync({
      code: form.code, name: form.name, country: form.country,
      operator: form.operator || null,
      basin: form.basin || null, block_name: form.block_name || null,
      license_number: form.license_number || null, license_type: form.license_type || null,
      license_expiry_date: form.license_expiry_date || null,
      working_interest_pct: form.working_interest_pct ?? null,
      regulator: form.regulator || null,
      environment: form.environment || null,
      centroid_latitude: form.centroid_latitude ?? null, centroid_longitude: form.centroid_longitude ?? null,
      area_km2: form.area_km2 ?? null,
      discovery_year: form.discovery_year ?? null, first_production_year: form.first_production_year ?? null,
      reservoir_formation: form.reservoir_formation || null,
      original_oil_in_place_mmbo: form.original_oil_in_place_mmbo ?? null,
      recoverable_reserves_mmbo: form.recoverable_reserves_mmbo ?? null,
      status: form.status || 'OPERATIONAL',
      notes: form.notes || null,
    } as OilFieldCreate)
    toast({ title: t('assets.field_created'), variant: 'success' })
    openDynamicPanel({ type: 'detail', module: 'ar-field', id: created.id })
  }

  return (
    <DynamicPanelShell
      title={t('assets.create_field')}
      subtitle={t('assets.field')}
      icon={<MapPin size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton variant="primary" disabled={createField.isPending}
            onClick={() => (document.getElementById('create-field-form') as HTMLFormElement)?.requestSubmit()}>
            {createField.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-field-form" onSubmit={handleSubmit} className="p-4 space-y-5">
        <SmartFormToolbar />
        <SmartFormSimpleHint />
        <SmartFormInlineHelpDrawer />
        <SmartFormSection id="t_assets_identity" title={t('assets.identity')} level="essential" help={{ description: t('assets.identity') }}>
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
              <input type="text" value={form.operator || ''} onChange={(e) => set({ operator: e.target.value })} className={panelInputClass} placeholder="ACME Energy" />
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
              <TagSelector options={STATUS_OPTIONS} value={form.status || 'OPERATIONAL'} onChange={(v) => set({ status: v })} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="Bassin">
              <input type="text" value={form.basin || ''} onChange={(e) => set({ basin: e.target.value })} className={panelInputClass} placeholder="Douala / Rio Del Rey" />
            </DynamicPanelField>
            <DynamicPanelField label="Bloc">
              <input type="text" value={form.block_name || ''} onChange={(e) => set({ block_name: e.target.value })} className={panelInputClass} placeholder="Block A" />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_common_license_concession" title={t('common.license_concession')} level="essential" collapsible help={{ description: t('common.license_concession') }}>
          <FormGrid>
            <DynamicPanelField label="N° licence">
              <input type="text" value={form.license_number || ''} onChange={(e) => set({ license_number: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Type licence">
              <input type="text" value={form.license_type || ''} onChange={(e) => set({ license_type: e.target.value })} className={panelInputClass} placeholder="Production" />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="Expiration licence">
              <input type="date" value={form.license_expiry_date || ''} onChange={(e) => set({ license_expiry_date: e.target.value || undefined })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Working interest (%)">
              <input type="number" step="0.01" min={0} max={100} value={form.working_interest_pct ?? ''} onChange={numChange(set, 'working_interest_pct')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.regulator')}>
              <input type="text" value={form.regulator || ''} onChange={(e) => set({ regulator: e.target.value })} className={panelInputClass} placeholder="SNH" />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_common_location" title={t('common.location')} level="essential" collapsible help={{ description: t('common.location') }}>
          <FormGrid>
            <DynamicPanelField label="Latitude centroid">
              <input type="number" step="0.000001" value={form.centroid_latitude ?? ''} onChange={numChange(set, 'centroid_latitude')} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Longitude centroid">
              <input type="number" step="0.000001" value={form.centroid_longitude ?? ''} onChange={numChange(set, 'centroid_longitude')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="Superficie (km2)">
              <input type="number" step="0.01" min={0} value={form.area_km2 ?? ''} onChange={numChange(set, 'area_km2')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_asset_registry_geologie_reserves" title={t('asset_registry.geologie_reserves')} level="essential" collapsible help={{ description: t('asset_registry.geologie_reserves') }}>
          <FormGrid>
            <DynamicPanelField label={t('asset_registry.annee_decouverte')}>
              <input type="number" min={1900} max={2100} value={form.discovery_year ?? ''} onChange={numChange(set, 'discovery_year')} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('asset_registry.annee_1ere_production')}>
              <input type="number" min={1900} max={2100} value={form.first_production_year ?? ''} onChange={numChange(set, 'first_production_year')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.reservoir_formation')}>
              <input type="text" value={form.reservoir_formation || ''} onChange={(e) => set({ reservoir_formation: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="OOIP (MMbbl)">
              <input type="number" step="0.01" min={0} value={form.original_oil_in_place_mmbo ?? ''} onChange={numChange(set, 'original_oil_in_place_mmbo')} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.recoverable_reserves')}>
              <input type="number" step="0.01" min={0} value={form.recoverable_reserves_mmbo ?? ''} onChange={numChange(set, 'recoverable_reserves_mmbo')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_common_notes" title={t('common.notes')} level="essential" collapsible help={{ description: t('common.notes') }}>
          <DynamicPanelField label={t('common.notes')}>
            <textarea value={form.notes || ''} onChange={(e) => set({ notes: e.target.value })} className={panelInputClass + ' min-h-[60px]'} rows={3} />
          </DynamicPanelField>
        </SmartFormSection>
        {_ctx?.mode === 'wizard' && (

          <SmartFormWizardNav

            onSubmit={() => document.querySelector('form')?.requestSubmit()}

            onCancel={() => {}}

          />

        )}

      </form>
    </DynamicPanelShell>
  )
}


// ════════════════════════════════════════════════════════════════
// CREATE SITE
// ════════════════════════════════════════════════════════════════

export function CreateSitePanel() {
  return (
    <SmartFormProvider panelId="create-site" defaultMode="simple">
      <CreateSiteInner />
    </SmartFormProvider>
  )
}

function CreateSiteInner() {
  const _ctx = useSmartForm()
  const { t } = useTranslation()
  const { toast } = useToast()
  const createSite = useCreateSite()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { data: fieldsData } = useFields({ page: 1, page_size: 500 })

  const dictEnv = useDictionaryOptions('environment_type')
  const dictSiteType = useDictionaryOptions('site_type')
  const envOptions = dictEnv.length > 0 ? dictEnv : ENVIRONMENT_FALLBACK
  const siteTypeOptions = dictSiteType.length > 0 ? dictSiteType : SITE_TYPE_FALLBACK

  const [form, setForm] = useState<Record<string, any>>({
    field_id: '', code: '', name: '', site_type: '', environment: '', country: 'CM', status: 'OPERATIONAL',
    manned: true, access_road: false, access_helicopter: false, access_vessel: false, helideck_available: false,
  })

  const set = useCallback((patch: Record<string, any>) => setForm((f) => ({ ...f, ...patch })), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const created = await createSite.mutateAsync({
      field_id: form.field_id, code: form.code, name: form.name,
      site_type: form.site_type, environment: form.environment, country: form.country,
      latitude: form.latitude ?? null, longitude: form.longitude ?? null,
      region: form.region || null, water_depth_m: form.water_depth_m ?? null,
      access_road: form.access_road ?? false, access_helicopter: form.access_helicopter ?? false,
      access_vessel: form.access_vessel ?? false, helideck_available: form.helideck_available ?? false,
      nearest_airport: form.nearest_airport || null, nearest_port: form.nearest_port || null,
      manned: form.manned ?? true, pob_capacity: form.pob_capacity ?? null,
      power_source: form.power_source || null, comms_system: form.comms_system || null,
      max_wind_speed_ms: form.max_wind_speed_ms ?? null, design_wave_height_m: form.design_wave_height_m ?? null,
      design_temp_max_c: form.design_temp_max_c ?? null, design_temp_min_c: form.design_temp_min_c ?? null,
      seismic_zone: form.seismic_zone || null,
      status: form.status || 'OPERATIONAL',
      commissioning_date: form.commissioning_date || null, first_oil_date: form.first_oil_date || null,
      notes: form.notes || null,
    } as OilSiteCreate)
    toast({ title: t('assets.site_created'), variant: 'success' })
    openDynamicPanel({ type: 'detail', module: 'ar-site', id: created.id })
  }

  return (
    <DynamicPanelShell
      title={t('assets.create_site')} subtitle={t('assets.site')}
      icon={<Landmark size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton variant="primary" disabled={createSite.isPending}
            onClick={() => (document.getElementById('create-site-form') as HTMLFormElement)?.requestSubmit()}>
            {createSite.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-site-form" onSubmit={handleSubmit} className="p-4 space-y-5">
        <SmartFormToolbar />
        <SmartFormSimpleHint />
        <SmartFormInlineHelpDrawer />
        <SmartFormSection id="t_assets_identity_2" title={t('assets.identity')} level="essential" help={{ description: t('assets.identity') }}>
          <FormGrid>
            <DynamicPanelField label={t('assets.field')} required>
              <select required value={form.field_id || ''} onChange={(e) => set({ field_id: e.target.value })} className={panelInputClass}>
                <option value="">{t('common.select')}...</option>
                {(fieldsData?.items ?? []).map((f) => <option key={f.id} value={f.id}>{f.code} — {f.name}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('common.code')} required>
              <input type="text" required maxLength={30} value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} className={panelInputClass} placeholder="SITE-MLF" />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('common.name')} required>
              <input type="text" required maxLength={200} value={form.name} onChange={(e) => set({ name: e.target.value })} className={panelInputClass} placeholder="Marine Loading Facility" />
            </DynamicPanelField>
            <DynamicPanelField label={t('common.type')} required>
              <select required value={form.site_type || ''} onChange={(e) => set({ site_type: e.target.value })} className={panelInputClass}>
                <option value="">{t('common.select')}...</option>
                {siteTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.country')} required>
              <CountrySelect value={form.country || null} onChange={(v) => set({ country: v })} />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.environment')} required>
              <select required value={form.environment || ''} onChange={(e) => set({ environment: e.target.value })} className={panelInputClass}>
                <option value="">{t('common.select')}...</option>
                {envOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.region')}>
              <input type="text" value={form.region || ''} onChange={(e) => set({ region: e.target.value })} className={panelInputClass} placeholder="Littoral" />
            </DynamicPanelField>
            <DynamicPanelField label={t('common.status')}>
              <TagSelector options={STATUS_OPTIONS} value={form.status || 'OPERATIONAL'} onChange={(v) => set({ status: v })} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_common_location_2" title={t('common.location')} level="essential" collapsible help={{ description: t('common.location') }}>
          <FormGrid>
            <DynamicPanelField label={t('common.latitude')}>
              <input type="number" step="0.000001" value={form.latitude ?? ''} onChange={numChange(set, 'latitude')} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('common.longitude')}>
              <input type="number" step="0.000001" value={form.longitude ?? ''} onChange={numChange(set, 'longitude')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('common.water_depth_m')}>
              <input type="number" step="0.1" min={0} value={form.water_depth_m ?? ''} onChange={numChange(set, 'water_depth_m')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_assets_access" title={t('assets.access')} level="essential" collapsible help={{ description: t('assets.access') }}>
          <FormGrid>
            <DynamicPanelField label={t('asset_registry.acces_route')}>{boolSelect(form.access_road, (v) => set({ access_road: v }), panelInputClass)}</DynamicPanelField>
            <DynamicPanelField label={t('assets.access_helicopter')}>{boolSelect(form.access_helicopter, (v) => set({ access_helicopter: v }), panelInputClass)}</DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('asset_registry.acces_bateau')}>{boolSelect(form.access_vessel, (v) => set({ access_vessel: v }), panelInputClass)}</DynamicPanelField>
            <DynamicPanelField label={t('asset_registry.helipad_disponible')}>{boolSelect(form.helideck_available, (v) => set({ helideck_available: v }), panelInputClass)}</DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.nearest_airport')}>
              <input type="text" value={form.nearest_airport || ''} onChange={(e) => set({ nearest_airport: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.nearest_port')}>
              <input type="text" value={form.nearest_port || ''} onChange={(e) => set({ nearest_port: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_assets_operations" title={t('assets.operations')} level="essential" collapsible help={{ description: t('assets.operations') }}>
          <FormGrid>
            <DynamicPanelField label={t('asset_registry.occupe_manned')}>{boolSelect(form.manned, (v) => set({ manned: v }), panelInputClass)}</DynamicPanelField>
            <DynamicPanelField label="POB max">
              <input type="number" min={0} value={form.pob_capacity ?? ''} onChange={numChange(set, 'pob_capacity')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('asset_registry.source_energie')}>
              <input type="text" value={form.power_source || ''} onChange={(e) => set({ power_source: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('asset_registry.systeme_comms')}>
              <input type="text" value={form.comms_system || ''} onChange={(e) => set({ comms_system: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_assets_design_conditions" title={t('assets.design_conditions')} level="essential" collapsible help={{ description: t('assets.design_conditions') }}>
          <FormGrid>
            <DynamicPanelField label="Vent max (m/s)">
              <input type="number" step="0.1" min={0} value={form.max_wind_speed_ms ?? ''} onChange={numChange(set, 'max_wind_speed_ms')} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Hauteur vague design (m)">
              <input type="number" step="0.1" min={0} value={form.design_wave_height_m ?? ''} onChange={numChange(set, 'design_wave_height_m')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="Temp max design (C)">
              <input type="number" step="0.1" value={form.design_temp_max_c ?? ''} onChange={numChange(set, 'design_temp_max_c')} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Temp min design (C)">
              <input type="number" step="0.1" value={form.design_temp_min_c ?? ''} onChange={numChange(set, 'design_temp_min_c')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="Zone sismique">
              <input type="text" value={form.seismic_zone || ''} onChange={(e) => set({ seismic_zone: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_common_dates" title={t('common.dates')} level="essential" collapsible help={{ description: t('common.dates') }}>
          <FormGrid>
            <DynamicPanelField label={t('common.commissioning_date')}>
              <input type="date" value={form.commissioning_date || ''} onChange={(e) => set({ commissioning_date: e.target.value || undefined })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('asset_registry.date_1er_petrole')}>
              <input type="date" value={form.first_oil_date || ''} onChange={(e) => set({ first_oil_date: e.target.value || undefined })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_common_notes_2" title={t('common.notes')} level="essential" collapsible help={{ description: t('common.notes') }}>
          <DynamicPanelField label={t('common.notes')}>
            <textarea value={form.notes || ''} onChange={(e) => set({ notes: e.target.value })} className={panelInputClass + ' min-h-[60px]'} rows={3} />
          </DynamicPanelField>
        </SmartFormSection>
        {_ctx?.mode === 'wizard' && (

          <SmartFormWizardNav

            onSubmit={() => document.querySelector('form')?.requestSubmit()}

            onCancel={() => {}}

          />

        )}

      </form>
    </DynamicPanelShell>
  )
}


// ════════════════════════════════════════════════════════════════
// CREATE INSTALLATION
// ════════════════════════════════════════════════════════════════

export function CreateInstallationPanel() {
  return (
    <SmartFormProvider panelId="create-installation" defaultMode="simple">
      <CreateInstallationInner />
    </SmartFormProvider>
  )
}

function CreateInstallationInner() {
  const _ctx = useSmartForm()
  const { t } = useTranslation()
  const { toast } = useToast()
  const createInstallation = useCreateInstallation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { data: sitesData } = useSites({ page: 1, page_size: 500 })

  const dictEnv = useDictionaryOptions('environment_type')
  const dictInstType = useDictionaryOptions('installation_type')
  const envOptions = dictEnv.length > 0 ? dictEnv : ENVIRONMENT_FALLBACK
  const instTypeOptions = dictInstType.length > 0 ? dictInstType : INSTALLATION_TYPE_FALLBACK

  const [form, setForm] = useState<Record<string, any>>({
    site_id: '', code: '', name: '', installation_type: '', environment: '', status: 'OPERATIONAL',
    is_manned: true, is_normally_unmanned: false, helideck_available: false,
  })

  const set = useCallback((patch: Record<string, any>) => setForm((f) => ({ ...f, ...patch })), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const created = await createInstallation.mutateAsync({
      site_id: form.site_id, code: form.code, name: form.name,
      installation_type: form.installation_type, environment: form.environment,
      latitude: form.latitude ?? null, longitude: form.longitude ?? null,
      elevation_masl: form.elevation_masl ?? null, water_depth_m: form.water_depth_m ?? null,
      air_gap_m: form.air_gap_m ?? null, orientation_deg: form.orientation_deg ?? null,
      status: form.status || 'OPERATIONAL',
      installation_date: form.installation_date || null, commissioning_date: form.commissioning_date || null,
      first_oil_date: form.first_oil_date || null, design_life_years: form.design_life_years ?? null,
      is_manned: form.is_manned ?? true, is_normally_unmanned: form.is_normally_unmanned ?? false,
      pob_capacity: form.pob_capacity ?? null, helideck_available: form.helideck_available ?? false,
      lifeboat_capacity: form.lifeboat_capacity ?? null,
      total_area_m2: form.total_area_m2 ?? null, footprint_length_m: form.footprint_length_m ?? null,
      footprint_width_m: form.footprint_width_m ?? null,
      design_code: form.design_code || null, classification_society: form.classification_society || null,
      class_notation: form.class_notation || null,
      notes: form.notes || null,
    } as InstallationCreate)
    toast({ title: t('assets.installation_created'), variant: 'success' })
    openDynamicPanel({ type: 'detail', module: 'ar-installation', id: created.id })
  }

  return (
    <DynamicPanelShell
      title={t('assets.create_installation')} subtitle={t('assets.installation')}
      icon={<Factory size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton variant="primary" disabled={createInstallation.isPending}
            onClick={() => (document.getElementById('create-installation-form') as HTMLFormElement)?.requestSubmit()}>
            {createInstallation.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-installation-form" onSubmit={handleSubmit} className="p-4 space-y-5">
        <SmartFormToolbar />
        <SmartFormSimpleHint />
        <SmartFormInlineHelpDrawer />
        <SmartFormSection id="t_assets_identity_3" title={t('assets.identity')} level="essential" help={{ description: t('assets.identity') }}>
          <FormGrid>
            <DynamicPanelField label={t('assets.site')} required>
              <select required value={form.site_id || ''} onChange={(e) => set({ site_id: e.target.value })} className={panelInputClass}>
                <option value="">{t('common.select')}...</option>
                {(sitesData?.items ?? []).map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('common.code')} required>
              <input type="text" required maxLength={30} value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} className={panelInputClass} placeholder="SITE-P1" />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('common.name')} required>
              <input type="text" required maxLength={200} value={form.name} onChange={(e) => set({ name: e.target.value })} className={panelInputClass} placeholder="Platform 1" />
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
              <TagSelector options={STATUS_OPTIONS} value={form.status || 'OPERATIONAL'} onChange={(v) => set({ status: v })} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_common_location_3" title={t('common.location')} level="essential" collapsible help={{ description: t('common.location') }}>
          <FormGrid>
            <DynamicPanelField label={t('common.latitude')}>
              <input type="number" step="0.000001" value={form.latitude ?? ''} onChange={numChange(set, 'latitude')} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('common.longitude')}>
              <input type="number" step="0.000001" value={form.longitude ?? ''} onChange={numChange(set, 'longitude')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('asset_registry.elevation_m_asl')}>
              <input type="number" step="0.1" value={form.elevation_masl ?? ''} onChange={numChange(set, 'elevation_masl')} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('common.water_depth_m')}>
              <input type="number" step="0.1" min={0} value={form.water_depth_m ?? ''} onChange={numChange(set, 'water_depth_m')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="Air gap (m)">
              <input type="number" step="0.1" min={0} value={form.air_gap_m ?? ''} onChange={numChange(set, 'air_gap_m')} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('common.orientation_deg')}>
              <input type="number" step="0.1" min={0} max={360} value={form.orientation_deg ?? ''} onChange={numChange(set, 'orientation_deg')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_common_dates_2" title={t('common.dates')} level="essential" collapsible help={{ description: t('common.dates') }}>
          <FormGrid>
            <DynamicPanelField label="Date installation">
              <input type="date" value={form.installation_date || ''} onChange={(e) => set({ installation_date: e.target.value || undefined })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('common.commissioning_date')}>
              <input type="date" value={form.commissioning_date || ''} onChange={(e) => set({ commissioning_date: e.target.value || undefined })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('asset_registry.date_1er_petrole')}>
              <input type="date" value={form.first_oil_date || ''} onChange={(e) => set({ first_oil_date: e.target.value || undefined })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('asset_registry.duree_de_vie_design_ans')}>
              <input type="number" min={0} value={form.design_life_years ?? ''} onChange={numChange(set, 'design_life_years')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_asset_registry_caracteristiques" title={t('asset_registry.caracteristiques')} level="essential" collapsible help={{ description: t('asset_registry.caracteristiques') }}>
          <FormGrid>
            <DynamicPanelField label={t('asset_registry.occupe_manned')}>{boolSelect(form.is_manned, (v) => set({ is_manned: v }), panelInputClass)}</DynamicPanelField>
            <DynamicPanelField label={t('asset_registry.normalement_non_occupe')}>{boolSelect(form.is_normally_unmanned, (v) => set({ is_normally_unmanned: v }), panelInputClass)}</DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="POB max">
              <input type="number" min={0} value={form.pob_capacity ?? ''} onChange={numChange(set, 'pob_capacity')} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('asset_registry.helipad_disponible')}>{boolSelect(form.helideck_available, (v) => set({ helideck_available: v }), panelInputClass)}</DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('asset_registry.capacite_canots_pers')}>
              <input type="number" min={0} value={form.lifeboat_capacity ?? ''} onChange={numChange(set, 'lifeboat_capacity')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_common_dimensions" title={t('common.dimensions')} level="essential" collapsible help={{ description: t('common.dimensions') }}>
          <FormGrid>
            <DynamicPanelField label="Surface totale (m2)">
              <input type="number" step="0.1" min={0} value={form.total_area_m2 ?? ''} onChange={numChange(set, 'total_area_m2')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="Longueur (m)">
              <input type="number" step="0.1" min={0} value={form.footprint_length_m ?? ''} onChange={numChange(set, 'footprint_length_m')} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Largeur (m)">
              <input type="number" step="0.1" min={0} value={form.footprint_width_m ?? ''} onChange={numChange(set, 'footprint_width_m')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_common_classification" title={t('common.classification')} level="essential" collapsible help={{ description: t('common.classification') }}>
          <FormGrid>
            <DynamicPanelField label={t('assets.design_code')}>
              <input type="text" value={form.design_code || ''} onChange={(e) => set({ design_code: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.classification_society')}>
              <input type="text" value={form.classification_society || ''} onChange={(e) => set({ classification_society: e.target.value })} className={panelInputClass} placeholder="Bureau Veritas" />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.class_notation')}>
              <input type="text" value={form.class_notation || ''} onChange={(e) => set({ class_notation: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_common_notes_3" title={t('common.notes')} level="essential" collapsible help={{ description: t('common.notes') }}>
          <DynamicPanelField label={t('common.notes')}>
            <textarea value={form.notes || ''} onChange={(e) => set({ notes: e.target.value })} className={panelInputClass + ' min-h-[60px]'} rows={3} />
          </DynamicPanelField>
        </SmartFormSection>
        {_ctx?.mode === 'wizard' && (

          <SmartFormWizardNav

            onSubmit={() => document.querySelector('form')?.requestSubmit()}

            onCancel={() => {}}

          />

        )}

      </form>
    </DynamicPanelShell>
  )
}


// ════════════════════════════════════════════════════════════════
// CREATE EQUIPMENT
// ════════════════════════════════════════════════════════════════

export function CreateEquipmentPanel() {
  return (
    <SmartFormProvider panelId="create-equipment" defaultMode="simple">
      <CreateEquipmentInner />
    </SmartFormProvider>
  )
}

function CreateEquipmentInner() {
  const _ctx = useSmartForm()
  const { t } = useTranslation()
  const { toast } = useToast()
  const createEquipment = useCreateEquipment()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  const { data: installationsData } = useInstallations({ page: 1, page_size: 500 })

  const dictClass = useDictionaryOptions('equipment_class')
  const dictCriticality = useDictionaryOptions('criticality')
  const classOptions = dictClass.length > 0 ? dictClass : EQUIPMENT_CLASS_FALLBACK
  const criticalityOptions = dictCriticality.length > 0 ? dictCriticality : CRITICALITY_FALLBACK

  const [form, setForm] = useState<Record<string, any>>({
    tag_number: '', name: '', equipment_class: '', installation_id: '',
    status: 'OPERATIONAL', criticality: undefined,
    is_mobile: false, safety_function: false,
  })

  // Load decks for selected installation
  const { data: decksData } = useDecks(form.installation_id || undefined)

  const set = useCallback((patch: Record<string, any>) => setForm((f) => ({ ...f, ...patch })), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const created = await createEquipment.mutateAsync({
      tag_number: form.tag_number, name: form.name, equipment_class: form.equipment_class,
      installation_id: form.installation_id || null, deck_id: form.deck_id || null,
      area: form.area || null, sub_area: form.sub_area || null,
      latitude: form.latitude ?? null, longitude: form.longitude ?? null,
      elevation_m: form.elevation_m ?? null,
      local_x_m: form.local_x_m ?? null, local_y_m: form.local_y_m ?? null, local_z_m: form.local_z_m ?? null,
      orientation_deg: form.orientation_deg ?? null,
      is_mobile: form.is_mobile ?? false,
      manufacturer: form.manufacturer || null, model: form.model || null,
      serial_number: form.serial_number || null,
      year_manufactured: form.year_manufactured ?? null, year_installed: form.year_installed ?? null,
      status: form.status || 'OPERATIONAL', criticality: form.criticality || null,
      safety_function: form.safety_function ?? false,
      cert_number: form.cert_number || null, cert_authority: form.cert_authority || null,
      drawing_number: form.drawing_number || null, p_and_id_ref: form.p_and_id_ref || null,
      owner_company: form.owner_company || null, asset_number: form.asset_number || null,
      purchase_date: form.purchase_date || null,
      purchase_cost_usd: form.purchase_cost_usd ?? null, replacement_cost_usd: form.replacement_cost_usd ?? null,
      grid_reference: form.grid_reference || null,
      datasheet_url: form.datasheet_url || null, manual_url: form.manual_url || null,
      cert_document_url: form.cert_document_url || null,
      notes: form.notes || null,
    } as EquipmentCreate)
    toast({ title: t('assets.equipment_created'), variant: 'success' })
    openDynamicPanel({ type: 'detail', module: 'ar-equipment', id: created.id })
  }

  return (
    <DynamicPanelShell
      title={t('assets.create_equipment')} subtitle={t('assets.equipment_tab')}
      icon={<Wrench size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton variant="primary" disabled={createEquipment.isPending}
            onClick={() => (document.getElementById('create-equipment-form') as HTMLFormElement)?.requestSubmit()}>
            {createEquipment.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-equipment-form" onSubmit={handleSubmit} className="p-4 space-y-5">
        <SmartFormToolbar />
        <SmartFormSimpleHint />
        <SmartFormInlineHelpDrawer />
        <SmartFormSection id="t_assets_identity_4" title={t('assets.identity')} level="essential" help={{ description: t('assets.identity') }}>
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
            <DynamicPanelField label={t('common.status')}>
              <TagSelector options={STATUS_OPTIONS} value={form.status || 'OPERATIONAL'} onChange={(v) => set({ status: v })} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.criticality')}>
              <select value={form.criticality || ''} onChange={(e) => set({ criticality: e.target.value || undefined })} className={panelInputClass}>
                <option value="">—</option>
                {criticalityOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.safety_function')}>{boolSelect(form.safety_function, (v) => set({ safety_function: v }), panelInputClass)}</DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_common_location_4" title={t('common.location')} level="essential" collapsible help={{ description: t('common.location') }}>
          <FormGrid>
            <DynamicPanelField label={t('assets.installation')}>
              <select value={form.installation_id || ''} onChange={(e) => set({ installation_id: e.target.value || undefined, deck_id: undefined })} className={panelInputClass}>
                <option value="">{t('common.select')}...</option>
                {(installationsData?.items ?? []).map((i) => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label="Deck">
              <select value={form.deck_id || ''} onChange={(e) => set({ deck_id: e.target.value || undefined })} className={panelInputClass} disabled={!form.installation_id}>
                <option value="">{t('common.select')}...</option>
                {(decksData ?? []).map((d) => <option key={d.id} value={d.id}>{d.deck_name}</option>)}
              </select>
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="Zone">
              <input type="text" value={form.area || ''} onChange={(e) => set({ area: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Sous-zone">
              <input type="text" value={form.sub_area || ''} onChange={(e) => set({ sub_area: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('asset_registry.ref_grille')}>
              <input type="text" value={form.grid_reference || ''} onChange={(e) => set({ grid_reference: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Mobile">{boolSelect(form.is_mobile, (v) => set({ is_mobile: v }), panelInputClass)}</DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('common.latitude')}>
              <input type="number" step="0.000001" value={form.latitude ?? ''} onChange={numChange(set, 'latitude')} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('common.longitude')}>
              <input type="number" step="0.000001" value={form.longitude ?? ''} onChange={numChange(set, 'longitude')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.elevation')}>
              <input type="number" step="0.1" value={form.elevation_m ?? ''} onChange={numChange(set, 'elevation_m')} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('common.orientation_deg')}>
              <input type="number" step="0.1" min={0} max={360} value={form.orientation_deg ?? ''} onChange={numChange(set, 'orientation_deg')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="X local (m)">
              <input type="number" step="0.01" value={form.local_x_m ?? ''} onChange={numChange(set, 'local_x_m')} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Y local (m)">
              <input type="number" step="0.01" value={form.local_y_m ?? ''} onChange={numChange(set, 'local_y_m')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="Z local (m)">
              <input type="number" step="0.01" value={form.local_z_m ?? ''} onChange={numChange(set, 'local_z_m')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_common_manufacturer" title={t('common.manufacturer')} level="essential" collapsible help={{ description: t('common.manufacturer') }}>
          <FormGrid>
            <DynamicPanelField label="Fabricant">
              <input type="text" value={form.manufacturer || ''} onChange={(e) => set({ manufacturer: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.model_ref')}>
              <input type="text" value={form.model || ''} onChange={(e) => set({ model: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.serial_number')}>
              <input type="text" value={form.serial_number || ''} onChange={(e) => set({ serial_number: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.year_manufactured')}>
              <input type="number" min={1900} max={2100} value={form.year_manufactured ?? ''} onChange={numChange(set, 'year_manufactured')} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.year_installed')}>
              <input type="number" min={1900} max={2100} value={form.year_installed ?? ''} onChange={numChange(set, 'year_installed')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_common_certification" title={t('common.certification')} level="essential" collapsible help={{ description: t('common.certification') }}>
          <FormGrid>
            <DynamicPanelField label="N° certificat">
              <input type="text" value={form.cert_number || ''} onChange={(e) => set({ cert_number: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.cert_authority')}>
              <input type="text" value={form.cert_authority || ''} onChange={(e) => set({ cert_authority: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_asset_registry_documents_references" title={t('asset_registry.documents_references')} level="essential" collapsible help={{ description: t('asset_registry.documents_references') }}>
          <FormGrid>
            <DynamicPanelField label="N° plan">
              <input type="text" value={form.drawing_number || ''} onChange={(e) => set({ drawing_number: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.p_and_id_ref')}>
              <input type="text" value={form.p_and_id_ref || ''} onChange={(e) => set({ p_and_id_ref: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="URL datasheet">
              <input type="url" value={form.datasheet_url || ''} onChange={(e) => set({ datasheet_url: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="URL manuel">
              <input type="url" value={form.manual_url || ''} onChange={(e) => set({ manual_url: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="URL certificat">
              <input type="url" value={form.cert_document_url || ''} onChange={(e) => set({ cert_document_url: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_assets_finance" title={t('assets.finance')} level="essential" collapsible help={{ description: t('assets.finance') }}>
          <FormGrid>
            <DynamicPanelField label={t('assets.owner_company')}>
              <input type="text" value={form.owner_company || ''} onChange={(e) => set({ owner_company: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="N° actif">
              <input type="text" value={form.asset_number || ''} onChange={(e) => set({ asset_number: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="Date achat">
              <input type="date" value={form.purchase_date || ''} onChange={(e) => set({ purchase_date: e.target.value || undefined })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="Prix achat (USD)">
              <input type="number" step="0.01" min={0} value={form.purchase_cost_usd ?? ''} onChange={numChange(set, 'purchase_cost_usd')} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Prix remplacement (USD)">
              <input type="number" step="0.01" min={0} value={form.replacement_cost_usd ?? ''} onChange={numChange(set, 'replacement_cost_usd')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_common_notes_4" title={t('common.notes')} level="essential" collapsible help={{ description: t('common.notes') }}>
          <DynamicPanelField label={t('common.notes')}>
            <textarea value={form.notes || ''} onChange={(e) => set({ notes: e.target.value })} className={panelInputClass + ' min-h-[60px]'} rows={3} />
          </DynamicPanelField>
        </SmartFormSection>
        {_ctx?.mode === 'wizard' && (

          <SmartFormWizardNav

            onSubmit={() => document.querySelector('form')?.requestSubmit()}

            onCancel={() => {}}

          />

        )}

      </form>
    </DynamicPanelShell>
  )
}


// ════════════════════════════════════════════════════════════════
// CREATE PIPELINE
// ════════════════════════════════════════════════════════════════

export function CreatePipelinePanel() {
  return (
    <SmartFormProvider panelId="create-pipeline" defaultMode="simple">
      <CreatePipelineInner />
    </SmartFormProvider>
  )
}

function CreatePipelineInner() {
  const _ctx = useSmartForm()
  const { t } = useTranslation()
  const { toast } = useToast()
  const createPipeline = useCreatePipeline()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { data: installationsData } = useInstallations({ page: 1, page_size: 500 })

  const dictService = useDictionaryOptions('pipeline_service')
  const serviceOptions = dictService.length > 0 ? dictService : SERVICE_FALLBACK

  const [form, setForm] = useState<Record<string, any>>({
    pipeline_id: '', name: '', service: '',
    from_installation_id: '', to_installation_id: '',
    nominal_diameter_in: undefined, design_pressure_barg: undefined, design_temp_max_c: undefined,
    status: 'OPERATIONAL', piggable: false, cp_required: false,
  })

  const set = useCallback((patch: Record<string, any>) => setForm((f) => ({ ...f, ...patch })), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const created = await createPipeline.mutateAsync({
      pipeline_id: form.pipeline_id, name: form.name, service: form.service,
      from_installation_id: form.from_installation_id, to_installation_id: form.to_installation_id,
      from_node_description: form.from_node_description || null, to_node_description: form.to_node_description || null,
      nominal_diameter_in: form.nominal_diameter_in, od_mm: form.od_mm ?? null,
      wall_thickness_mm: form.wall_thickness_mm ?? null,
      design_pressure_barg: form.design_pressure_barg, design_temp_max_c: form.design_temp_max_c,
      design_temp_min_c: form.design_temp_min_c ?? null, maop_barg: form.maop_barg ?? null,
      test_pressure_barg: form.test_pressure_barg ?? null,
      status: form.status || 'OPERATIONAL',
      pipe_material: form.pipe_material || null, pipe_grade: form.pipe_grade || null,
      coating_external: form.coating_external || null, coating_internal: form.coating_internal || null,
      total_length_km: form.total_length_km ?? null,
      onshore_length_km: form.onshore_length_km ?? null, offshore_length_km: form.offshore_length_km ?? null,
      max_water_depth_m: form.max_water_depth_m ?? null,
      fluid_description: form.fluid_description || null,
      h2s_ppm: form.h2s_ppm ?? null, co2_mol_pct: form.co2_mol_pct ?? null,
      piggable: form.piggable ?? false,
      pig_launcher_tag: form.pig_launcher_tag || null, pig_receiver_tag: form.pig_receiver_tag || null,
      cp_required: form.cp_required ?? false, cp_type: form.cp_type || null,
      corrosion_allowance_mm: form.corrosion_allowance_mm ?? null,
      design_code: form.design_code || null, design_life_years: form.design_life_years ?? null,
      installation_year: form.installation_year ?? null,
      permit_number: form.permit_number || null, regulator: form.regulator || null,
      notes: form.notes || null,
    } as PipelineCreate)
    toast({ title: t('assets.pipeline_created'), variant: 'success' })
    openDynamicPanel({ type: 'detail', module: 'ar-pipeline', id: created.id })
  }

  return (
    <DynamicPanelShell
      title={t('assets.create_pipeline')} subtitle={t('assets.pipeline')}
      icon={<Ship size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton variant="primary" disabled={createPipeline.isPending}
            onClick={() => (document.getElementById('create-pipeline-form') as HTMLFormElement)?.requestSubmit()}>
            {createPipeline.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-pipeline-form" onSubmit={handleSubmit} className="p-4 space-y-5">
        <SmartFormToolbar />
        <SmartFormSimpleHint />
        <SmartFormInlineHelpDrawer />
        <SmartFormSection id="t_assets_identity_5" title={t('assets.identity')} level="essential" help={{ description: t('assets.identity') }}>
          <FormGrid>
            <DynamicPanelField label={t('assets.pipeline_id')} required>
              <input type="text" required maxLength={50} value={form.pipeline_id} onChange={(e) => set({ pipeline_id: e.target.value.toUpperCase() })} className={panelInputClass} placeholder="PL-SITE-MLF-01" />
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
              <TagSelector options={STATUS_OPTIONS} value={form.status || 'OPERATIONAL'} onChange={(v) => set({ status: v })} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_assets_routing" title={t('assets.routing')} level="essential" help={{ description: t('assets.routing') }}>
          <FormGrid>
            <DynamicPanelField label={t('assets.from_installation')} required>
              <select required value={form.from_installation_id || ''} onChange={(e) => set({ from_installation_id: e.target.value })} className={panelInputClass}>
                <option value="">{t('common.select')}...</option>
                {(installationsData?.items ?? []).map((i) => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.to_installation')} required>
              <select required value={form.to_installation_id || ''} onChange={(e) => set({ to_installation_id: e.target.value })} className={panelInputClass}>
                <option value="">{t('common.select')}...</option>
                {(installationsData?.items ?? []).map((i) => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
              </select>
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="Description noeud amont">
              <input type="text" value={form.from_node_description || ''} onChange={(e) => set({ from_node_description: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Description noeud aval">
              <input type="text" value={form.to_node_description || ''} onChange={(e) => set({ to_node_description: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="Longueur totale (km)">
              <input type="number" step="0.01" min={0} value={form.total_length_km ?? ''} onChange={numChange(set, 'total_length_km')} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Prof. eau max (m)">
              <input type="number" step="0.1" min={0} value={form.max_water_depth_m ?? ''} onChange={numChange(set, 'max_water_depth_m')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="Longueur onshore (km)">
              <input type="number" step="0.01" min={0} value={form.onshore_length_km ?? ''} onChange={numChange(set, 'onshore_length_km')} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Longueur offshore (km)">
              <input type="number" step="0.01" min={0} value={form.offshore_length_km ?? ''} onChange={numChange(set, 'offshore_length_km')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_common_dimensions_2" title={t('common.dimensions')} level="essential" help={{ description: t('common.dimensions') }}>
          <FormGrid>
            <DynamicPanelField label={t('assets.nominal_diameter')} required>
              <input type="number" required step="0.1" min={0} value={form.nominal_diameter_in ?? ''} onChange={numChange(set, 'nominal_diameter_in')} className={panelInputClass} placeholder='pouces (")' />
            </DynamicPanelField>
            <DynamicPanelField label="OD (mm)">
              <input type="number" step="0.1" min={0} value={form.od_mm ?? ''} onChange={numChange(set, 'od_mm')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.wall_thickness')}>
              <input type="number" step="0.01" min={0} value={form.wall_thickness_mm ?? ''} onChange={numChange(set, 'wall_thickness_mm')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_assets_design" title={t('assets.design')} level="essential" help={{ description: t('assets.design') }}>
          <FormGrid>
            <DynamicPanelField label={t('assets.design_pressure')} required>
              <input type="number" required step="0.1" min={0} value={form.design_pressure_barg ?? ''} onChange={numChange(set, 'design_pressure_barg')} className={panelInputClass} placeholder="barg" />
            </DynamicPanelField>
            <DynamicPanelField label="MAOP (barg)">
              <input type="number" step="0.1" min={0} value={form.maop_barg ?? ''} onChange={numChange(set, 'maop_barg')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.design_temp') + ' max'} required>
              <input type="number" required step="0.1" value={form.design_temp_max_c ?? ''} onChange={numChange(set, 'design_temp_max_c')} className={panelInputClass} placeholder="°C" />
            </DynamicPanelField>
            <DynamicPanelField label="Temp design min (°C)">
              <input type="number" step="0.1" value={form.design_temp_min_c ?? ''} onChange={numChange(set, 'design_temp_min_c')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('asset_registry.pression_epreuve_barg')}>
              <input type="number" step="0.1" min={0} value={form.test_pressure_barg ?? ''} onChange={numChange(set, 'test_pressure_barg')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_asset_registry_materiaux_revetement" title={t('asset_registry.materiaux_revetement')} level="essential" collapsible help={{ description: t('asset_registry.materiaux_revetement') }}>
          <FormGrid>
            <DynamicPanelField label={t('asset_registry.materiau_tube')}>
              <input type="text" value={form.pipe_material || ''} onChange={(e) => set({ pipe_material: e.target.value })} className={panelInputClass} placeholder="CS API 5L" />
            </DynamicPanelField>
            <DynamicPanelField label="Grade tube">
              <input type="text" value={form.pipe_grade || ''} onChange={(e) => set({ pipe_grade: e.target.value })} className={panelInputClass} placeholder="X52" />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('asset_registry.revetement_ext')}>
              <input type="text" value={form.coating_external || ''} onChange={(e) => set({ coating_external: e.target.value })} className={panelInputClass} placeholder="3LPE" />
            </DynamicPanelField>
            <DynamicPanelField label={t('asset_registry.revetement_int')}>
              <input type="text" value={form.coating_internal || ''} onChange={(e) => set({ coating_internal: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.corrosion_allowance')}>
              <input type="number" step="0.1" min={0} value={form.corrosion_allowance_mm ?? ''} onChange={numChange(set, 'corrosion_allowance_mm')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_common_fluid" title={t('common.fluid')} level="essential" collapsible help={{ description: t('common.fluid') }}>
          <FormGrid>
            <DynamicPanelField label="Description fluide">
              <input type="text" value={form.fluid_description || ''} onChange={(e) => set({ fluid_description: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="H2S (ppm)">
              <input type="number" step="0.1" min={0} value={form.h2s_ppm ?? ''} onChange={numChange(set, 'h2s_ppm')} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="CO2 (mol %)">
              <input type="number" step="0.01" min={0} value={form.co2_mol_pct ?? ''} onChange={numChange(set, 'co2_mol_pct')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="section" title={'Section'} level="essential" collapsible help={{ description: 'Section' }}>
          <FormGrid>
            <DynamicPanelField label="Raclable">{boolSelect(form.piggable, (v) => set({ piggable: v }), panelInputClass)}</DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="Tag lanceur">
              <input type="text" value={form.pig_launcher_tag || ''} onChange={(e) => set({ pig_launcher_tag: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label="Tag receveur">
              <input type="text" value={form.pig_receiver_tag || ''} onChange={(e) => set({ pig_receiver_tag: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="section_2" title={'Section'} level="essential" collapsible help={{ description: 'Section' }}>
          <FormGrid>
            <DynamicPanelField label="CP requise">{boolSelect(form.cp_required, (v) => set({ cp_required: v }), panelInputClass)}</DynamicPanelField>
            <DynamicPanelField label="Type CP">
              <input type="text" value={form.cp_type || ''} onChange={(e) => set({ cp_type: e.target.value })} className={panelInputClass} placeholder="Anodes sacrificielles" />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_asset_registry_integrite_reglementaire" title={t('asset_registry.integrite_reglementaire')} level="essential" collapsible help={{ description: t('asset_registry.integrite_reglementaire') }}>
          <FormGrid>
            <DynamicPanelField label={t('assets.design_code')}>
              <input type="text" value={form.design_code || ''} onChange={(e) => set({ design_code: e.target.value })} className={panelInputClass} placeholder="ASME B31.8" />
            </DynamicPanelField>
            <DynamicPanelField label={t('asset_registry.duree_de_vie_design_ans')}>
              <input type="number" min={0} value={form.design_life_years ?? ''} onChange={numChange(set, 'design_life_years')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.year_installed')}>
              <input type="number" min={1900} max={2100} value={form.installation_year ?? ''} onChange={numChange(set, 'installation_year')} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label="N° permis">
              <input type="text" value={form.permit_number || ''} onChange={(e) => set({ permit_number: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.regulator')}>
              <input type="text" value={form.regulator || ''} onChange={(e) => set({ regulator: e.target.value })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
        </SmartFormSection>

        <SmartFormSection id="t_common_notes_5" title={t('common.notes')} level="essential" collapsible help={{ description: t('common.notes') }}>
          <DynamicPanelField label={t('common.notes')}>
            <textarea value={form.notes || ''} onChange={(e) => set({ notes: e.target.value })} className={panelInputClass + ' min-h-[60px]'} rows={3} />
          </DynamicPanelField>
        </SmartFormSection>
        {_ctx?.mode === 'wizard' && (

          <SmartFormWizardNav

            onSubmit={() => document.querySelector('form')?.requestSubmit()}

            onCancel={() => {}}

          />

        )}

      </form>
    </DynamicPanelShell>
  )
}
