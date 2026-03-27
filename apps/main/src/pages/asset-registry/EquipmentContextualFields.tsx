/**
 * EquipmentContextualFields — renders specialized sub-table fields
 * based on equipment_class inside the Equipment detail panel.
 *
 * Uses a field-definition map per equipment class.
 * Classes without an explicit definition fall back to a generic renderer
 * that displays all keys from specialized_data.
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
  /** i18n key under 'assets.spec.' namespace */
  i18n: string
  /** Unit suffix (e.g. 'mm', 'barg', 'kW') */
  unit?: string
  /** Render as boolean yes/no */
  bool?: boolean
}

interface SectionDef {
  /** i18n key for section title under 'assets.spec_section.' */
  titleKey: string
  fields: FieldDef[]
}

type SpecLayoutMap = Record<string, SectionDef[]>

// ── Helpers ──────────────────────────────────────────────────

function fmtVal(val: unknown, unit?: string, bool?: boolean, t?: (k: string) => string): React.ReactNode {
  if (val == null || val === '') return '—'
  if (bool && t) return val ? t('common.yes') : t('common.no')
  if (typeof val === 'number') return unit ? `${val} ${unit}` : String(val)
  if (typeof val === 'boolean' && t) return val ? t('common.yes') : t('common.no')
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

function humanize(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── Field definitions per equipment class ────────────────────

const SPEC_LAYOUTS: SpecLayoutMap = {
  CRANE: [
    {
      titleKey: 'crane_general',
      fields: [
        { key: 'crane_type', i18n: 'crane_type' },
        { key: 'boom_structure', i18n: 'boom_structure' },
        { key: 'mobility', i18n: 'mobility' },
        { key: 'is_offshore_rated', i18n: 'is_offshore_rated', bool: true },
        { key: 'swl_tonnes', i18n: 'swl_tonnes', unit: 't' },
        { key: 'max_capacity_tonnes', i18n: 'max_capacity_tonnes', unit: 't' },
      ],
    },
    {
      titleKey: 'crane_boom',
      fields: [
        { key: 'boom_min_length_m', i18n: 'boom_min_length', unit: 'm' },
        { key: 'boom_max_length_m', i18n: 'boom_max_length', unit: 'm' },
        { key: 'boom_min_angle_deg', i18n: 'boom_min_angle', unit: '°' },
        { key: 'boom_max_angle_deg', i18n: 'boom_max_angle', unit: '°' },
        { key: 'radius_min_m', i18n: 'radius_min', unit: 'm' },
        { key: 'radius_max_m', i18n: 'radius_max', unit: 'm' },
        { key: 'max_hook_height_m', i18n: 'max_hook_height', unit: 'm' },
      ],
    },
    {
      titleKey: 'crane_jib_slewing',
      fields: [
        { key: 'has_jib', i18n: 'has_jib', bool: true },
        { key: 'jib_max_length_m', i18n: 'jib_max_length', unit: 'm' },
        { key: 'slewing_full_rotation', i18n: 'slewing_full_rotation', bool: true },
        { key: 'slewing_arc_deg', i18n: 'slewing_arc', unit: '°' },
        { key: 'slewing_speed_rpm', i18n: 'slewing_speed', unit: 'rpm' },
      ],
    },
    {
      titleKey: 'crane_speeds_masses',
      fields: [
        { key: 'hoist_speed_rated_mpm', i18n: 'hoist_speed_rated', unit: 'm/min' },
        { key: 'hoist_speed_empty_mpm', i18n: 'hoist_speed_empty', unit: 'm/min' },
        { key: 'gross_weight_kg', i18n: 'gross_weight', unit: 'kg' },
        { key: 'counterweight_kg', i18n: 'counterweight', unit: 'kg' },
      ],
    },
    {
      titleKey: 'crane_wire_rope',
      fields: [
        { key: 'wire_rope_diameter_mm', i18n: 'wire_rope_diameter', unit: 'mm' },
        { key: 'wire_rope_length_m', i18n: 'wire_rope_length', unit: 'm' },
        { key: 'wire_rope_grade', i18n: 'wire_rope_grade' },
        { key: 'wire_rope_mbl_kn', i18n: 'wire_rope_mbl', unit: 'kN' },
        { key: 'reeving_main_max', i18n: 'reeving_main_max' },
      ],
    },
    {
      titleKey: 'crane_operating_conditions',
      fields: [
        { key: 'max_wind_speed_op_ms', i18n: 'max_wind_speed_op', unit: 'm/s' },
        { key: 'max_wind_speed_survival_ms', i18n: 'max_wind_speed_survival', unit: 'm/s' },
        { key: 'max_wave_height_op_m', i18n: 'max_wave_height_op', unit: 'm' },
        { key: 'max_heel_deg', i18n: 'max_heel', unit: '°' },
        { key: 'max_trim_deg', i18n: 'max_trim', unit: '°' },
        { key: 'installed_power_kw', i18n: 'installed_power', unit: 'kW' },
        { key: 'design_standard', i18n: 'design_standard' },
        { key: 'operation_standard', i18n: 'operation_standard' },
      ],
    },
  ],

  SEPARATOR: [
    {
      titleKey: 'separator_general',
      fields: [
        { key: 'separator_type', i18n: 'separator_type' },
        { key: 'orientation', i18n: 'orientation' },
        { key: 'separation_stage', i18n: 'separation_stage' },
        { key: 'train_id', i18n: 'train_id' },
        { key: 'is_test_separator', i18n: 'is_test_separator', bool: true },
      ],
    },
    {
      titleKey: 'separator_geometry',
      fields: [
        { key: 'shell_id_mm', i18n: 'shell_id', unit: 'mm' },
        { key: 'shell_od_mm', i18n: 'shell_od', unit: 'mm' },
        { key: 'tan_to_tan_mm', i18n: 'tan_to_tan', unit: 'mm' },
        { key: 'overall_length_mm', i18n: 'overall_length', unit: 'mm' },
        { key: 'head_type', i18n: 'head_type' },
        { key: 'total_volume_m3', i18n: 'total_volume', unit: 'm³' },
        { key: 'liquid_volume_m3', i18n: 'liquid_volume', unit: 'm³' },
        { key: 'gas_volume_m3', i18n: 'gas_volume', unit: 'm³' },
      ],
    },
    {
      titleKey: 'separator_design',
      fields: [
        { key: 'design_pressure_barg', i18n: 'design_pressure', unit: 'barg' },
        { key: 'mawp_barg', i18n: 'mawp', unit: 'barg' },
        { key: 'design_temp_max_c', i18n: 'design_temp_max', unit: '°C' },
        { key: 'design_temp_min_c', i18n: 'design_temp_min', unit: '°C' },
        { key: 'hydro_test_pressure_barg', i18n: 'hydro_test_pressure', unit: 'barg' },
        { key: 'op_pressure_barg', i18n: 'op_pressure', unit: 'barg' },
        { key: 'op_temp_c', i18n: 'op_temp', unit: '°C' },
        { key: 'shell_material', i18n: 'shell_material' },
        { key: 'design_code', i18n: 'design_code' },
        { key: 'corrosion_allowance_mm', i18n: 'corrosion_allowance', unit: 'mm' },
      ],
    },
    {
      titleKey: 'separator_weights',
      fields: [
        { key: 'weight_empty_kg', i18n: 'weight_empty', unit: 'kg' },
        { key: 'weight_operating_kg', i18n: 'weight_operating', unit: 'kg' },
        { key: 'weight_hydrotest_kg', i18n: 'weight_hydrotest', unit: 'kg' },
      ],
    },
    {
      titleKey: 'separator_fluid',
      fields: [
        { key: 'fluid_service', i18n: 'fluid_service' },
        { key: 'h2s_ppm', i18n: 'h2s_ppm', unit: 'ppm' },
        { key: 'co2_mol_pct', i18n: 'co2_mol_pct', unit: 'mol%' },
        { key: 'is_sour_service', i18n: 'is_sour_service', bool: true },
        { key: 'gas_flow_mmscfd', i18n: 'gas_flow', unit: 'MMscfd' },
        { key: 'oil_flow_sm3d', i18n: 'oil_flow', unit: 'Sm³/d' },
        { key: 'water_flow_sm3d', i18n: 'water_flow', unit: 'Sm³/d' },
      ],
    },
    {
      titleKey: 'separator_internals',
      fields: [
        { key: 'inlet_device', i18n: 'inlet_device' },
        { key: 'mist_eliminator_type', i18n: 'mist_eliminator_type' },
        { key: 'weir_plate_installed', i18n: 'weir_plate_installed', bool: true },
        { key: 'sand_jetting_system', i18n: 'sand_jetting_system', bool: true },
      ],
    },
    {
      titleKey: 'separator_safety',
      fields: [
        { key: 'psv_count', i18n: 'psv_count' },
        { key: 'primary_psv_tag', i18n: 'primary_psv_tag' },
        { key: 'primary_psv_set_barg', i18n: 'primary_psv_set', unit: 'barg' },
        { key: 'bdv_tag', i18n: 'bdv_tag' },
      ],
    },
  ],

  PUMP: [
    {
      titleKey: 'pump_general',
      fields: [
        { key: 'pump_type', i18n: 'pump_type' },
        { key: 'api_type_designation', i18n: 'api_type_designation' },
        { key: 'pump_service', i18n: 'pump_service' },
        { key: 'number_of_stages', i18n: 'number_of_stages' },
        { key: 'orientation', i18n: 'orientation' },
        { key: 'duty_standby', i18n: 'duty_standby' },
        { key: 'paired_pump_tag', i18n: 'paired_pump_tag' },
      ],
    },
    {
      titleKey: 'pump_fluid',
      fields: [
        { key: 'fluid_description', i18n: 'fluid_description' },
        { key: 'fluid_density_kgm3', i18n: 'fluid_density', unit: 'kg/m³' },
        { key: 'fluid_viscosity_cst', i18n: 'fluid_viscosity', unit: 'cSt' },
        { key: 'h2s_ppm', i18n: 'h2s_ppm', unit: 'ppm' },
        { key: 'is_sour_service', i18n: 'is_sour_service', bool: true },
      ],
    },
    {
      titleKey: 'pump_performance',
      fields: [
        { key: 'flow_rated_m3h', i18n: 'flow_rated', unit: 'm³/h' },
        { key: 'flow_min_m3h', i18n: 'flow_min', unit: 'm³/h' },
        { key: 'flow_max_m3h', i18n: 'flow_max', unit: 'm³/h' },
        { key: 'head_rated_m', i18n: 'head_rated', unit: 'm' },
        { key: 'differential_pressure_barg', i18n: 'differential_pressure', unit: 'barg' },
        { key: 'suction_pressure_barg', i18n: 'suction_pressure', unit: 'barg' },
        { key: 'discharge_pressure_barg', i18n: 'discharge_pressure', unit: 'barg' },
        { key: 'npsha_m', i18n: 'npsha', unit: 'm' },
        { key: 'npshr_m', i18n: 'npshr', unit: 'm' },
        { key: 'efficiency_rated_pct', i18n: 'efficiency_rated', unit: '%' },
      ],
    },
    {
      titleKey: 'pump_motor_mechanical',
      fields: [
        { key: 'motor_rated_power_kw', i18n: 'motor_rated_power', unit: 'kW' },
        { key: 'motor_voltage_v', i18n: 'motor_voltage', unit: 'V' },
        { key: 'motor_speed_rpm', i18n: 'motor_speed', unit: 'rpm' },
        { key: 'vfd_installed', i18n: 'vfd_installed', bool: true },
        { key: 'pump_speed_rpm', i18n: 'pump_speed', unit: 'rpm' },
        { key: 'impeller_diameter_mm', i18n: 'impeller_diameter', unit: 'mm' },
        { key: 'impeller_material', i18n: 'impeller_material' },
        { key: 'casing_material', i18n: 'casing_material' },
        { key: 'seal_type', i18n: 'seal_type' },
        { key: 'design_code', i18n: 'design_code' },
      ],
    },
  ],

  GAS_COMPRESSOR: [
    {
      titleKey: 'compressor_general',
      fields: [
        { key: 'compressor_type', i18n: 'compressor_type' },
        { key: 'service', i18n: 'service' },
        { key: 'number_of_stages', i18n: 'number_of_stages' },
      ],
    },
    {
      titleKey: 'compressor_gas',
      fields: [
        { key: 'gas_description', i18n: 'gas_description' },
        { key: 'mole_weight_kgkmol', i18n: 'mole_weight', unit: 'kg/kmol' },
        { key: 'h2s_ppm', i18n: 'h2s_ppm', unit: 'ppm' },
        { key: 'co2_mol_pct', i18n: 'co2_mol_pct', unit: 'mol%' },
      ],
    },
    {
      titleKey: 'compressor_performance',
      fields: [
        { key: 'flow_mmscfd', i18n: 'flow_mmscfd', unit: 'MMscfd' },
        { key: 'suction_pressure_barg', i18n: 'suction_pressure', unit: 'barg' },
        { key: 'discharge_pressure_barg', i18n: 'discharge_pressure', unit: 'barg' },
        { key: 'compression_ratio', i18n: 'compression_ratio' },
        { key: 'suction_temp_c', i18n: 'suction_temp', unit: '°C' },
        { key: 'discharge_temp_c', i18n: 'discharge_temp', unit: '°C' },
        { key: 'polytropic_efficiency_pct', i18n: 'polytropic_efficiency', unit: '%' },
        { key: 'shaft_power_kw', i18n: 'shaft_power', unit: 'kW' },
      ],
    },
    {
      titleKey: 'compressor_driver',
      fields: [
        { key: 'driver_type', i18n: 'driver_type' },
        { key: 'driver_tag', i18n: 'driver_tag' },
        { key: 'driver_rated_power_kw', i18n: 'driver_rated_power', unit: 'kW' },
        { key: 'compressor_speed_rpm', i18n: 'compressor_speed', unit: 'rpm' },
        { key: 'number_of_impellers', i18n: 'number_of_impellers' },
        { key: 'surge_margin_pct', i18n: 'surge_margin', unit: '%' },
        { key: 'anti_surge_valve_tag', i18n: 'anti_surge_valve_tag' },
        { key: 'dgs_installed', i18n: 'dgs_installed', bool: true },
        { key: 'design_code', i18n: 'design_code' },
      ],
    },
  ],

  DIESEL_GENERATOR: [
    {
      titleKey: 'generator_general',
      fields: [
        { key: 'is_emergency_generator', i18n: 'is_emergency_generator', bool: true },
        { key: 'generator_class', i18n: 'generator_class' },
      ],
    },
    {
      titleKey: 'generator_engine',
      fields: [
        { key: 'engine_manufacturer', i18n: 'engine_manufacturer' },
        { key: 'engine_model', i18n: 'engine_model' },
        { key: 'engine_speed_rpm', i18n: 'engine_speed', unit: 'rpm' },
        { key: 'engine_cylinders', i18n: 'engine_cylinders' },
      ],
    },
    {
      titleKey: 'generator_output',
      fields: [
        { key: 'rated_power_kw', i18n: 'rated_power', unit: 'kW' },
        { key: 'standby_power_kw', i18n: 'standby_power', unit: 'kW' },
        { key: 'voltage_v', i18n: 'voltage', unit: 'V' },
        { key: 'frequency_hz', i18n: 'frequency', unit: 'Hz' },
        { key: 'power_factor', i18n: 'power_factor' },
      ],
    },
    {
      titleKey: 'generator_fuel',
      fields: [
        { key: 'fuel_type', i18n: 'fuel_type' },
        { key: 'fuel_consumption_at_100_lph', i18n: 'fuel_consumption_100', unit: 'L/h' },
        { key: 'base_tank_capacity_l', i18n: 'base_tank_capacity', unit: 'L' },
        { key: 'fuel_autonomy_at_full_load_h', i18n: 'fuel_autonomy', unit: 'h' },
      ],
    },
    {
      titleKey: 'generator_controls',
      fields: [
        { key: 'auto_start_on_mains_failure', i18n: 'auto_start_mains_failure', bool: true },
        { key: 'parallel_operation', i18n: 'parallel_operation', bool: true },
        { key: 'design_code', i18n: 'design_code' },
      ],
    },
  ],

  STORAGE_TANK: [
    {
      titleKey: 'tank_general',
      fields: [
        { key: 'tank_type', i18n: 'tank_type' },
        { key: 'tank_service', i18n: 'tank_service' },
        { key: 'api_standard', i18n: 'api_standard' },
      ],
    },
    {
      titleKey: 'tank_capacity_geometry',
      fields: [
        { key: 'nominal_capacity_m3', i18n: 'nominal_capacity', unit: 'm³' },
        { key: 'usable_capacity_m3', i18n: 'usable_capacity', unit: 'm³' },
        { key: 'shell_diameter_m', i18n: 'shell_diameter', unit: 'm' },
        { key: 'shell_height_m', i18n: 'shell_height', unit: 'm' },
        { key: 'shell_courses', i18n: 'shell_courses' },
      ],
    },
    {
      titleKey: 'tank_design',
      fields: [
        { key: 'design_pressure_mbarg', i18n: 'design_pressure_mbarg', unit: 'mbarg' },
        { key: 'design_temp_max_c', i18n: 'design_temp_max', unit: '°C' },
        { key: 'specific_gravity_product', i18n: 'specific_gravity' },
        { key: 'shell_material', i18n: 'shell_material' },
        { key: 'internal_coating', i18n: 'internal_coating' },
        { key: 'external_coating', i18n: 'external_coating' },
        { key: 'foundation_type', i18n: 'foundation_type' },
      ],
    },
    {
      titleKey: 'tank_safety',
      fields: [
        { key: 'bund_provided', i18n: 'bund_provided', bool: true },
        { key: 'bund_capacity_m3', i18n: 'bund_capacity', unit: 'm³' },
        { key: 'gesip_compliant', i18n: 'gesip_compliant', bool: true },
        { key: 'foam_system_type', i18n: 'foam_system_type' },
        { key: 'internal_inspection_interval_y', i18n: 'internal_inspection_interval', unit: 'ans' },
      ],
    },
  ],
}

// ── Component ────────────────────────────────────────────────

interface EquipmentContextualFieldsProps {
  equipmentClass: string
  specializedData: Record<string, unknown> | null | undefined
}

export function EquipmentContextualFields({ equipmentClass, specializedData }: EquipmentContextualFieldsProps) {
  const { t } = useTranslation()

  if (!specializedData || Object.keys(specializedData).length === 0) return null

  const layout = SPEC_LAYOUTS[equipmentClass]

  // If we have a layout definition, render structured sections
  if (layout) {
    return (
      <>
        {layout.map((section) => {
          // Only render section if at least one field has data
          const hasData = section.fields.some((f) => specializedData[f.key] != null && specializedData[f.key] !== '')
          if (!hasData) return null
          return (
            <FormSection
              key={section.titleKey}
              title={t(`assets.spec_section.${section.titleKey}`)}
              collapsible
              storageKey="panel.ar-equip.sections"
              id={`ar-equip-spec-${section.titleKey}`}
            >
              <DetailFieldGrid>
                {section.fields.map((f) => {
                  const val = specializedData[f.key]
                  if (val === null || val === undefined) return null
                  return (
                    <ReadOnlyRow
                      key={f.key}
                      label={t(`assets.spec.${f.i18n}`)}
                      value={fmtVal(val, f.unit, f.bool, t)}
                    />
                  )
                })}
              </DetailFieldGrid>
            </FormSection>
          )
        })}
      </>
    )
  }

  // Generic fallback: render all fields from specialized_data
  const entries = Object.entries(specializedData).filter(([, v]) => v != null && v !== '')
  if (entries.length === 0) return null

  return (
    <FormSection
      title={t('assets.spec_section.specialized_data')}
      collapsible
      storageKey="panel.ar-equip.sections"
      id="ar-equip-spec-generic"
    >
      <DetailFieldGrid>
        {entries.map(([key, val]) => (
          <ReadOnlyRow
            key={key}
            label={humanize(key)}
            value={fmtVal(val)}
          />
        ))}
      </DetailFieldGrid>
    </FormSection>
  )
}
