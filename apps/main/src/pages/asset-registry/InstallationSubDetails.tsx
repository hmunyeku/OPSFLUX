/**
 * InstallationSubDetails — renders offshore/onshore/type-specific 1:1 detail sections
 * with ReadOnlyRow display (inline editing deferred — use upsert endpoints when ready).
 */
import { useTranslation } from 'react-i18next'
import {
  FormSection,
  ReadOnlyRow,
  DetailFieldGrid,
} from '@/components/layout/DynamicPanel'

// ── Types ────────────────────────────────────────────────────

interface FieldDef {
  key: string
  i18n: string
  unit?: string
  bool?: boolean
}

interface SectionDef {
  titleKey: string
  fields: FieldDef[]
}

// ── Helpers ──────────────────────────────────────────────────

function fmtVal(val: unknown, unit?: string, bool?: boolean, t?: (k: string) => string): React.ReactNode {
  if (val == null || val === '') return '—'
  if (bool && t) return val ? t('common.yes') : t('common.no')
  if (typeof val === 'number') return unit ? `${val} ${unit}` : String(val)
  if (typeof val === 'boolean' && t) return val ? t('common.yes') : t('common.no')
  return String(val)
}

function humanize(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── Field definitions ────────────────────────────────────────

const OFFSHORE_SECTIONS: SectionDef[] = [
  {
    titleKey: 'offshore_structure',
    fields: [
      { key: 'structure_type', i18n: 'structure_type' },
      { key: 'jacket_leg_count', i18n: 'jacket_leg_count' },
      { key: 'topsides_weight_tonnes', i18n: 'topsides_weight', unit: 't' },
      { key: 'total_weight_tonnes', i18n: 'total_weight', unit: 't' },
      { key: 'number_of_decks', i18n: 'number_of_decks' },
    ],
  },
  {
    titleKey: 'offshore_elevations',
    fields: [
      { key: 'main_deck_elevation_m', i18n: 'main_deck_elevation', unit: 'm' },
      { key: 'cellar_deck_elevation_m', i18n: 'cellar_deck_elevation', unit: 'm' },
      { key: 'top_deck_elevation_m', i18n: 'top_deck_elevation', unit: 'm' },
      { key: 'max_deck_load_tm2', i18n: 'max_deck_load', unit: 't/m²' },
    ],
  },
  {
    titleKey: 'offshore_mooring_piles',
    fields: [
      { key: 'mooring_type', i18n: 'mooring_type' },
      { key: 'number_of_mooring_lines', i18n: 'mooring_lines' },
      { key: 'pile_count', i18n: 'pile_count' },
      { key: 'pile_diameter_mm', i18n: 'pile_diameter', unit: 'mm' },
      { key: 'pile_penetration_m', i18n: 'pile_penetration', unit: 'm' },
    ],
  },
  {
    titleKey: 'offshore_conductors_vessel',
    fields: [
      { key: 'conductor_slots_total', i18n: 'conductor_slots_total' },
      { key: 'conductor_slots_used', i18n: 'conductor_slots_used' },
      { key: 'vessel_length_m', i18n: 'vessel_length', unit: 'm' },
      { key: 'vessel_beam_m', i18n: 'vessel_beam', unit: 'm' },
      { key: 'storage_capacity_bbl', i18n: 'storage_capacity', unit: 'bbl' },
      { key: 'cp_type', i18n: 'cp_type' },
      { key: 'cp_design_life_years', i18n: 'cp_design_life', unit: 'ans' },
    ],
  },
]

const ONSHORE_SECTIONS: SectionDef[] = [
  {
    titleKey: 'onshore_land',
    fields: [
      { key: 'land_area_m2', i18n: 'land_area', unit: 'm²' },
      { key: 'fenced_area_m2', i18n: 'fenced_area', unit: 'm²' },
      { key: 'process_area_m2', i18n: 'process_area', unit: 'm²' },
      { key: 'terrain_type', i18n: 'terrain_type' },
      { key: 'ground_bearing_capacity_kpa', i18n: 'ground_bearing', unit: 'kPa' },
      { key: 'flood_risk', i18n: 'flood_risk' },
    ],
  },
  {
    titleKey: 'onshore_access',
    fields: [
      { key: 'access_road_type', i18n: 'access_road_type' },
      { key: 'access_road_length_km', i18n: 'access_road_length', unit: 'km' },
      { key: 'max_truck_tonnage_tonnes', i18n: 'max_truck_tonnage', unit: 't' },
    ],
  },
  {
    titleKey: 'onshore_utilities',
    fields: [
      { key: 'power_supply_type', i18n: 'power_supply_type' },
      { key: 'power_supply_kva', i18n: 'power_supply_kva', unit: 'kVA' },
      { key: 'water_supply_type', i18n: 'water_supply_type' },
      { key: 'water_storage_m3', i18n: 'water_storage', unit: 'm³' },
      { key: 'internet_connectivity', i18n: 'internet_connectivity' },
    ],
  },
  {
    titleKey: 'onshore_facilities',
    fields: [
      { key: 'has_control_room', i18n: 'has_control_room', bool: true },
      { key: 'has_workshop', i18n: 'has_workshop', bool: true },
      { key: 'has_warehouse', i18n: 'has_warehouse', bool: true },
      { key: 'has_accommodation', i18n: 'has_accommodation', bool: true },
      { key: 'accommodation_beds', i18n: 'accommodation_beds' },
      { key: 'has_medical_room', i18n: 'has_medical_room', bool: true },
    ],
  },
  {
    titleKey: 'onshore_safety_permits',
    fields: [
      { key: 'bunding_provided', i18n: 'bunding_provided', bool: true },
      { key: 'total_bunding_volume_m3', i18n: 'total_bunding_volume', unit: 'm³' },
      { key: 'wind_rose_dominant_dir', i18n: 'wind_rose_dir' },
      { key: 'environmental_permit_ref', i18n: 'environmental_permit' },
      { key: 'operating_permit_ref', i18n: 'operating_permit' },
      { key: 'land_title_ref', i18n: 'land_title' },
    ],
  },
]

// ── Render helper ────────────────────────────────────────────

function renderSections(
  sections: SectionDef[],
  data: Record<string, unknown>,
  t: (k: string) => string,
  storageKey: string,
  idPrefix: string,
) {
  return sections.map((section) => (
    <FormSection
      key={section.titleKey}
      title={t(`assets.inst_detail.${section.titleKey}`)}
      collapsible
      storageKey={storageKey}
      id={`${idPrefix}-${section.titleKey}`}
    >
      <DetailFieldGrid>
        {section.fields.map((f) => (
          <ReadOnlyRow
            key={f.key}
            label={t(`assets.inst_detail.${f.i18n}`)}
            value={fmtVal(data[f.key], f.unit, f.bool, t)}
          />
        ))}
      </DetailFieldGrid>
    </FormSection>
  ))
}

// ── Generic fallback for type details ────────────────────────

function renderGenericDetails(
  data: Record<string, unknown>,
  _t: (k: string) => string,
  title: string,
) {
  const entries = Object.entries(data).filter(([, v]) => v != null && v !== '')
  if (entries.length === 0) return null
  return (
    <FormSection title={title} collapsible storageKey="panel.ar-inst.sections" id="ar-inst-type-details">
      <DetailFieldGrid>
        {entries.map(([key, val]) => (
          <ReadOnlyRow key={key} label={humanize(key)} value={fmtVal(val)} />
        ))}
      </DetailFieldGrid>
    </FormSection>
  )
}

// ── Component ────────────────────────────────────────────────

interface Props {
  installationType: string
  environment: string
  offshoreDetails: Record<string, unknown> | null | undefined
  onshoreDetails: Record<string, unknown> | null | undefined
  typeDetails: Record<string, unknown> | null | undefined
}

export function InstallationSubDetails({ environment, offshoreDetails, onshoreDetails, typeDetails }: Props) {
  const { t } = useTranslation()

  const isOffshore = ['OFFSHORE', 'DEEPWATER', 'SHALLOW_WATER'].includes(environment)
  const isOnshore = ['ONSHORE', 'SWAMP'].includes(environment)

  return (
    <>
      {/* Offshore details — always show for offshore environments */}
      {isOffshore && renderSections(
        OFFSHORE_SECTIONS,
        offshoreDetails ?? {},
        t,
        'panel.ar-inst.sections',
        'ar-inst-offshore',
      )}

      {/* Onshore details — always show for onshore environments */}
      {isOnshore && renderSections(
        ONSHORE_SECTIONS,
        onshoreDetails ?? {},
        t,
        'panel.ar-inst.sections',
        'ar-inst-onshore',
      )}

      {/* Type-specific details — generic renderer */}
      {typeDetails && Object.keys(typeDetails).length > 0 && renderGenericDetails(
        typeDetails,
        t,
        t('assets.inst_detail.type_specific'),
      )}
    </>
  )
}
