/**
 * Asset Registry types — O&G hierarchy: Field > Site > Installation > Deck > Equipment / Pipeline.
 */

// ── GeoJSON geometry (simplified) ────────────────────────────
export interface GeoJSONGeometry {
  type: string
  coordinates: number[] | number[][] | number[][][]
}

// ── Operational status (shared across hierarchy) ──────────────
export type OperationalStatus =
  | 'OPERATIONAL'
  | 'STANDBY'
  | 'UNDER_CONSTRUCTION'
  | 'SUSPENDED'
  | 'DECOMMISSIONED'
  | 'ABANDONED'

// ── Field ─────────────────────────────────────────────────────
export interface OilField {
  id: string
  entity_id: string
  code: string
  name: string
  country: string
  basin?: string | null
  block_name?: string | null
  license_number?: string | null
  license_type?: string | null
  license_expiry_date?: string | null
  operator?: string | null
  working_interest_pct?: number | null
  regulator?: string | null
  environment?: string | null
  centroid_latitude?: number | null
  centroid_longitude?: number | null
  area_km2?: number | null
  discovery_year?: number | null
  first_production_year?: number | null
  reservoir_formation?: string | null
  original_oil_in_place_mmbo?: number | null
  recoverable_reserves_mmbo?: number | null
  status: OperationalStatus
  notes?: string | null
  geom_centroid?: GeoJSONGeometry | null
  geom_boundary?: GeoJSONGeometry | null
  created_at: string
  updated_at: string
}

export type OilFieldCreate = Omit<OilField, 'id' | 'entity_id' | 'created_at' | 'updated_at'>
export type OilFieldUpdate = Partial<OilFieldCreate>

// ── Field License ────────────────────────────────────────────
export interface FieldLicense {
  id: string
  field_id: string
  license_type: string
  license_number: string
  authority?: string | null
  issue_date?: string | null
  expiry_date?: string | null
  working_interest_pct?: number | null
  status: string
  notes?: string | null
  created_at: string
  updated_at: string
}

export type FieldLicenseCreate = Omit<FieldLicense, 'id' | 'field_id' | 'created_at' | 'updated_at'>
export type FieldLicenseUpdate = Partial<FieldLicenseCreate>

// ── Site ──────────────────────────────────────────────────────
export interface OilSite {
  id: string
  entity_id: string
  field_id: string
  code: string
  name: string
  site_type: string
  environment: string
  latitude?: number | null
  longitude?: number | null
  country: string
  region?: string | null
  water_depth_m?: number | null
  access_road: boolean
  access_helicopter: boolean
  access_vessel: boolean
  helideck_available: boolean
  nearest_airport?: string | null
  nearest_port?: string | null
  manned: boolean
  pob_capacity?: number | null
  power_source?: string | null
  comms_system?: string | null
  max_wind_speed_ms?: number | null
  design_wave_height_m?: number | null
  design_temp_max_c?: number | null
  design_temp_min_c?: number | null
  seismic_zone?: string | null
  commissioning_date?: string | null
  first_oil_date?: string | null
  status: OperationalStatus
  notes?: string | null
  geom_point?: GeoJSONGeometry | null
  geom_boundary?: GeoJSONGeometry | null
  created_at: string
  updated_at: string
}

export type OilSiteCreate = Omit<OilSite, 'id' | 'entity_id' | 'created_at' | 'updated_at'>
export type OilSiteUpdate = Partial<Omit<OilSiteCreate, 'field_id'>>

// ── Installation ─────────────────────────────────────────────
export interface Installation {
  id: string
  entity_id: string
  site_id: string
  code: string
  name: string
  installation_type: string
  environment: string
  latitude?: number | null
  longitude?: number | null
  elevation_masl?: number | null
  water_depth_m?: number | null
  air_gap_m?: number | null
  orientation_deg?: number | null
  status: OperationalStatus
  installation_date?: string | null
  commissioning_date?: string | null
  first_oil_date?: string | null
  design_life_years?: number | null
  is_manned: boolean
  is_normally_unmanned: boolean
  pob_capacity?: number | null
  helideck_available: boolean
  lifeboat_capacity?: number | null
  total_area_m2?: number | null
  footprint_length_m?: number | null
  footprint_width_m?: number | null
  design_code?: string | null
  classification_society?: string | null
  class_notation?: string | null
  notes?: string | null
  geom_point?: GeoJSONGeometry | null
  geom_footprint?: GeoJSONGeometry | null
  inst_offshore_details?: Record<string, unknown> | null
  inst_onshore_details?: Record<string, unknown> | null
  inst_type_details?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type InstallationCreate = Omit<Installation, 'id' | 'entity_id' | 'created_at' | 'updated_at' | 'inst_offshore_details' | 'inst_onshore_details' | 'inst_type_details'>
export type InstallationUpdate = Partial<Omit<InstallationCreate, 'site_id'>>

// ── Installation Deck ────────────────────────────────────────
export interface InstallationDeck {
  id: string
  installation_id: string
  deck_name: string
  deck_code?: string | null
  deck_order: number
  elevation_m: number
  deck_length_m?: number | null
  deck_width_m?: number | null
  deck_area_m2?: number | null
  max_deck_load_tm2?: number | null
  deck_function?: string | null
  notes?: string | null
}

export type InstallationDeckCreate = Omit<InstallationDeck, 'id' | 'installation_id'>
export type InstallationDeckUpdate = Partial<InstallationDeckCreate>

// ── Equipment ────────────────────────────────────────────────
export interface RegistryEquipment {
  id: string
  entity_id: string
  tag_number: string
  name: string
  equipment_class: string
  installation_id?: string | null
  deck_id?: string | null
  area?: string | null
  sub_area?: string | null
  grid_reference?: string | null
  latitude?: number | null
  longitude?: number | null
  elevation_m?: number | null
  local_x_m?: number | null
  local_y_m?: number | null
  local_z_m?: number | null
  orientation_deg?: number | null
  is_mobile: boolean
  manufacturer?: string | null
  model?: string | null
  serial_number?: string | null
  year_manufactured?: number | null
  year_installed?: number | null
  status: OperationalStatus
  criticality?: 'A' | 'B' | 'C' | null
  safety_function: boolean
  cert_number?: string | null
  cert_authority?: string | null
  drawing_number?: string | null
  p_and_id_ref?: string | null
  owner_company?: string | null
  asset_number?: string | null
  purchase_date?: string | null
  purchase_cost_usd?: number | null
  replacement_cost_usd?: number | null
  datasheet_url?: string | null
  manual_url?: string | null
  cert_document_url?: string | null
  notes?: string | null
  geom_point?: GeoJSONGeometry | null
  specialized_data?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type EquipmentCreate = Omit<RegistryEquipment, 'id' | 'entity_id' | 'created_at' | 'updated_at' | 'specialized_data'>
export type EquipmentUpdate = Partial<EquipmentCreate>

// ── Equipment Sub-Models ─────────────────────────────────────

export interface CraneConfiguration {
  id: string
  crane_id: string
  config_code: string
  config_name?: string | null
  is_default_config: boolean
  config_order?: number | null
  boom_length_m?: number | null
  boom_length_ft?: number | null
  jib_installed: boolean
  jib_length_m?: number | null
  jib_offset_deg?: number | null
  jib_type?: string | null
  counterweight_tonnes?: number | null
  outrigger_state?: string | null
  outrigger_length_m?: number | null
  reeving_parts?: number | null
  reeving_line_pull_kn?: number | null
  hook_block_weight_kg?: number | null
  slewing_zone_description?: string | null
  blind_zone_start_deg?: number | null
  blind_zone_end_deg?: number | null
  config_max_capacity_tonnes?: number | null
  config_max_radius_m?: number | null
  notes?: string | null
  created_at: string
  updated_at: string
}
export type CraneConfigurationCreate = Omit<CraneConfiguration, 'id' | 'crane_id' | 'created_at' | 'updated_at'>
export type CraneConfigurationUpdate = Partial<CraneConfigurationCreate>

export interface CraneLoadChartPoint {
  id: string
  config_id: string
  radius_m: number
  max_load_tonnes: number
  hook_height_m?: number | null
  boom_angle_deg?: number | null
  load_raw?: number | null
  load_unit_source?: string | null
  hook_type: string
  row_order?: number | null
  is_derated: boolean
  created_at: string
  updated_at: string
}
export type CraneLoadChartPointCreate = Omit<CraneLoadChartPoint, 'id' | 'config_id' | 'created_at' | 'updated_at'>
export type CraneLoadChartPointUpdate = Partial<CraneLoadChartPointCreate>

export interface CraneLiftZone {
  id: string
  config_id: string
  zone_name: string
  angle_start_deg: number
  angle_end_deg: number
  angle_reference: string
  derating_factor: number
  derating_reason?: string | null
  max_load_override_tonnes?: number | null
  max_radius_override_m?: number | null
  notes?: string | null
  created_at: string
  updated_at: string
}
export type CraneLiftZoneCreate = Omit<CraneLiftZone, 'id' | 'config_id' | 'created_at' | 'updated_at'>
export type CraneLiftZoneUpdate = Partial<CraneLiftZoneCreate>

export interface CraneHookBlock {
  id: string
  crane_id: string
  block_reference?: string | null
  block_tag?: string | null
  sheave_count?: number | null
  swivel_type?: string | null
  rated_capacity_tonnes: number
  compatible_reeving_max?: number | null
  block_weight_kg?: number | null
  hook_weight_kg?: number | null
  rope_diameter_mm?: number | null
  certificate_number?: string | null
  is_main_hook: boolean
  is_current_fit: boolean
  created_at: string
  updated_at: string
}
export type CraneHookBlockCreate = Omit<CraneHookBlock, 'id' | 'crane_id' | 'created_at' | 'updated_at'>
export type CraneHookBlockUpdate = Partial<CraneHookBlockCreate>

export interface CraneReevingGuideEntry {
  id: string
  crane_id: string
  boom_config_ref?: string | null
  load_min_tonnes: number
  load_max_tonnes: number
  reeving_parts: number
  config_id?: string | null
  created_at: string
  updated_at: string
}
export type CraneReevingGuideCreate = Omit<CraneReevingGuideEntry, 'id' | 'crane_id' | 'created_at' | 'updated_at'>
export type CraneReevingGuideUpdate = Partial<CraneReevingGuideCreate>

export interface SeparatorNozzle {
  id: string
  separator_id: string
  nozzle_mark: string
  nozzle_service: string
  description?: string | null
  nominal_size_in: number
  schedule?: string | null
  connection_type?: string | null
  flange_rating?: string | null
  nozzle_material?: string | null
  connected_to_tag?: string | null
  created_at: string
  updated_at: string
}
export type SeparatorNozzleCreate = Omit<SeparatorNozzle, 'id' | 'separator_id' | 'created_at' | 'updated_at'>
export type SeparatorNozzleUpdate = Partial<SeparatorNozzleCreate>

export interface SeparatorProcessCase {
  id: string
  separator_id: string
  case_name: string
  case_description?: string | null
  inlet_pressure_barg?: number | null
  inlet_temp_c?: number | null
  inlet_gas_flow_mmscfd?: number | null
  inlet_oil_flow_sm3d?: number | null
  inlet_water_flow_sm3d?: number | null
  op_pressure_barg?: number | null
  op_temp_c?: number | null
  simulation_tool?: string | null
  simulation_case_ref?: string | null
  created_at: string
  updated_at: string
}
export type SeparatorProcessCaseCreate = Omit<SeparatorProcessCase, 'id' | 'separator_id' | 'created_at' | 'updated_at'>
export type SeparatorProcessCaseUpdate = Partial<SeparatorProcessCaseCreate>

export interface PumpCurvePoint {
  id: string
  pump_id: string
  flow_m3h: number
  head_m?: number | null
  efficiency_pct?: number | null
  power_kw?: number | null
  npshr_m?: number | null
  speed_rpm?: number | null
  source: string
  created_at: string
  updated_at: string
}
export type PumpCurvePointCreate = Omit<PumpCurvePoint, 'id' | 'pump_id' | 'created_at' | 'updated_at'>
export type PumpCurvePointUpdate = Partial<PumpCurvePointCreate>

export interface ColumnSection {
  id: string
  column_id: string
  section_number: number
  section_name?: string | null
  internals_type: string
  tray_count?: number | null
  packing_type?: string | null
  packing_height_m?: number | null
  notes?: string | null
  created_at: string
  updated_at: string
}
export type ColumnSectionCreate = Omit<ColumnSection, 'id' | 'column_id' | 'created_at' | 'updated_at'>
export type ColumnSectionUpdate = Partial<ColumnSectionCreate>

// ── Pipeline ─────────────────────────────────────────────────
export interface RegistryPipeline {
  id: string
  entity_id: string
  pipeline_id: string
  name: string
  service: string
  from_installation_id: string
  to_installation_id: string
  from_node_description?: string | null
  to_node_description?: string | null
  nominal_diameter_in: number
  od_mm?: number | null
  wall_thickness_mm?: number | null
  total_length_km?: number | null
  onshore_length_km?: number | null
  offshore_length_km?: number | null
  status: OperationalStatus
  pipe_material?: string | null
  pipe_grade?: string | null
  coating_external?: string | null
  coating_internal?: string | null
  design_pressure_barg: number
  design_temp_max_c: number
  design_temp_min_c?: number | null
  maop_barg?: number | null
  fluid_description?: string | null
  h2s_ppm?: number | null
  co2_mol_pct?: number | null
  piggable?: boolean
  pig_launcher_tag?: string | null
  pig_receiver_tag?: string | null
  cp_required?: boolean
  cp_type?: string | null
  test_pressure_barg?: number | null
  max_water_depth_m?: number | null
  permit_number?: string | null
  regulator?: string | null
  design_code?: string | null
  design_life_years?: number | null
  installation_year?: number | null
  corrosion_allowance_mm?: number | null
  notes?: string | null
  geom_route?: GeoJSONGeometry | null
  created_at: string
  updated_at: string
  waypoints?: PipelineWaypoint[]
}

export type PipelineCreate = Omit<RegistryPipeline, 'id' | 'entity_id' | 'created_at' | 'updated_at' | 'waypoints'>
export type PipelineUpdate = Partial<Omit<PipelineCreate, 'from_installation_id' | 'to_installation_id'>>

// ── Pipeline Waypoint ────────────────────────────────────────
export interface PipelineWaypoint {
  id: string
  pipeline_id: string
  sequence_no: number
  latitude: number
  longitude: number
  elevation_m?: number | null
  chainage_km?: number | null
  waypoint_type?: string | null
  waypoint_name?: string | null
}

// ── Hierarchy tree ───────────────────────────────────────────
export interface HierarchyInstallationNode {
  id: string
  code: string
  name: string
  installation_type: string
  status: string
  equipment_count: number
}

export interface HierarchySiteNode {
  id: string
  code: string
  name: string
  site_type: string
  status: string
  installation_count: number
  installations: HierarchyInstallationNode[]
}

export interface HierarchyFieldNode {
  id: string
  code: string
  name: string
  country: string
  status: string
  site_count: number
  sites: HierarchySiteNode[]
}

// ── Stats ────────────────────────────────────────────────────
export interface AssetRegistryStats {
  field_count: number
  site_count: number
  installation_count: number
  equipment_count: number
  pipeline_count: number
  equipment_by_class: { equipment_class: string; count: number }[]
  equipment_by_status: { status: string; count: number }[]
  sites_by_type: { site_type: string; count: number }[]
}

// ── Asset Change Log (audit trail) ──────────────────────────
export interface AssetChangeLogEntry {
  id: string
  tenant_id: string
  entity_type: string
  entity_id: string
  entity_code: string
  field_name: string
  old_value: string | null
  new_value: string | null
  change_type: string
  changed_by: string
  changed_at: string
  changed_by_name: string | null
}
