/**
 * Create panels for Asset Registry entities — SIMPLIFIED.
 *
 * Each form collects only the essential identity fields.
 * All extra details (coordinates, geology, reserves, licence, manufacturer,
 * notes, fichiers, references) are added AFTER creation via detail-panel tabs.
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


// ════════════════════════════════════════════════════════════════
// CREATE FIELD — code, name, country, operator, environment, status
// ════════════════════════════════════════════════════════════════

export function CreateFieldPanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const createField = useCreateField()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)

  const dictEnv = useDictionaryOptions('environment_type')
  const envOptions = dictEnv.length > 0 ? dictEnv : ENVIRONMENT_FALLBACK

  const [form, setForm] = useState<Partial<OilFieldCreate>>({
    code: '',
    name: '',
    country: 'CM',
    operator: 'Perenco',
    environment: undefined,
    status: 'OPERATIONAL',
  })

  const set = useCallback((patch: Partial<OilFieldCreate>) => setForm((f) => ({ ...f, ...patch })), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createField.mutateAsync({
      code: form.code!,
      name: form.name!,
      country: form.country!,
      operator: form.operator || null,
      environment: form.environment || null,
      status: form.status || 'OPERATIONAL',
    } as OilFieldCreate)
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
      </form>
    </DynamicPanelShell>
  )
}


// ════════════════════════════════════════════════════════════════
// CREATE SITE — field_id, code, name, site_type, country, environment, status
// ════════════════════════════════════════════════════════════════

export function CreateSitePanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const createSite = useCreateSite()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)

  const { data: fieldsData } = useFields({ page: 1, page_size: 500 })

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
    status: 'OPERATIONAL',
  })

  const set = useCallback((patch: Partial<OilSiteCreate>) => setForm((f) => ({ ...f, ...patch })), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createSite.mutateAsync({
      field_id: form.field_id!,
      code: form.code!,
      name: form.name!,
      site_type: form.site_type!,
      environment: form.environment!,
      country: form.country!,
      manned: true,
      status: (form.status || 'OPERATIONAL') as any,
    } as OilSiteCreate)
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
            <DynamicPanelField label={t('common.status')}>
              <TagSelector options={STATUS_OPTIONS} value={form.status || 'OPERATIONAL'} onChange={(v) => set({ status: v as any })} />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>
      </form>
    </DynamicPanelShell>
  )
}


// ════════════════════════════════════════════════════════════════
// CREATE INSTALLATION — site_id, code, name, type, environment, status
// ════════════════════════════════════════════════════════════════

export function CreateInstallationPanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const createInstallation = useCreateInstallation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)

  const { data: sitesData } = useSites({ page: 1, page_size: 500 })

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
    status: 'OPERATIONAL',
  })

  const set = useCallback((patch: Partial<InstallationCreate>) => setForm((f) => ({ ...f, ...patch })), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createInstallation.mutateAsync({
      site_id: form.site_id!,
      code: form.code!,
      name: form.name!,
      installation_type: form.installation_type!,
      environment: form.environment!,
      is_manned: true,
      status: (form.status || 'OPERATIONAL') as any,
    } as InstallationCreate)
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
      </form>
    </DynamicPanelShell>
  )
}


// ════════════════════════════════════════════════════════════════
// CREATE EQUIPMENT — tag_number, name, class, installation, status, criticality
// ════════════════════════════════════════════════════════════════

export function CreateEquipmentPanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const createEquipment = useCreateEquipment()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)

  const { data: installationsData } = useInstallations({ page: 1, page_size: 500 })

  const dictClass = useDictionaryOptions('equipment_class')
  const dictCriticality = useDictionaryOptions('criticality')
  const classOptions = dictClass.length > 0 ? dictClass : EQUIPMENT_CLASS_FALLBACK
  const criticalityOptions = dictCriticality.length > 0 ? dictCriticality : CRITICALITY_FALLBACK

  const [form, setForm] = useState<Record<string, any>>({
    tag_number: '',
    name: '',
    equipment_class: '',
    installation_id: '',
    status: 'OPERATIONAL',
    criticality: undefined,
  })

  const set = useCallback((patch: Record<string, any>) => setForm((f) => ({ ...f, ...patch })), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createEquipment.mutateAsync({
      tag_number: form.tag_number,
      name: form.name,
      equipment_class: form.equipment_class,
      installation_id: form.installation_id || null,
      status: (form.status || 'OPERATIONAL') as any,
      criticality: (form.criticality as any) || null,
      safety_function: false,
    } as EquipmentCreate)
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
        </FormSection>
      </form>
    </DynamicPanelShell>
  )
}


// ════════════════════════════════════════════════════════════════
// CREATE PIPELINE — pipeline_id, name, service, from/to, diameter, pressure, temp, status
// ════════════════════════════════════════════════════════════════

export function CreatePipelinePanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const createPipeline = useCreatePipeline()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)

  const { data: installationsData } = useInstallations({ page: 1, page_size: 500 })

  const dictService = useDictionaryOptions('pipeline_service')
  const serviceOptions = dictService.length > 0 ? dictService : SERVICE_FALLBACK

  const [form, setForm] = useState<Partial<PipelineCreate>>({
    pipeline_id: '',
    name: '',
    service: '',
    from_installation_id: '',
    to_installation_id: '',
    nominal_diameter_in: undefined,
    design_pressure_barg: undefined,
    design_temp_max_c: undefined,
    status: 'OPERATIONAL',
  })

  const set = useCallback((patch: Partial<PipelineCreate>) => setForm((f) => ({ ...f, ...patch })), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createPipeline.mutateAsync({
      pipeline_id: form.pipeline_id!,
      name: form.name!,
      service: form.service!,
      from_installation_id: form.from_installation_id!,
      to_installation_id: form.to_installation_id!,
      nominal_diameter_in: form.nominal_diameter_in!,
      design_pressure_barg: form.design_pressure_barg!,
      design_temp_max_c: form.design_temp_max_c!,
      status: (form.status || 'OPERATIONAL') as any,
    } as PipelineCreate)
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
        </FormSection>

        <FormSection title={t('assets.design')}>
          <FormGrid>
            <DynamicPanelField label={t('assets.nominal_diameter')} required>
              <input type="number" required step="0.1" min={0} value={form.nominal_diameter_in ?? ''} onChange={(e) => set({ nominal_diameter_in: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder='pouces (")' />
            </DynamicPanelField>
            <DynamicPanelField label={t('assets.design_pressure')} required>
              <input type="number" required step="0.1" min={0} value={form.design_pressure_barg ?? ''} onChange={(e) => set({ design_pressure_barg: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder="barg" />
            </DynamicPanelField>
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('assets.design_temp')} required>
              <input type="number" required step="0.1" value={form.design_temp_max_c ?? ''} onChange={(e) => set({ design_temp_max_c: e.target.value ? Number(e.target.value) : undefined })} className={panelInputClass} placeholder="°C" />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>
      </form>
    </DynamicPanelShell>
  )
}
