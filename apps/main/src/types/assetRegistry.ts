/**
 * Asset Registry types — O&G hierarchy: Field > Site > Installation > Deck > Equipment / Pipeline.
 */

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
  created_at: string
  updated_at: string
}

export type OilFieldCreate = Omit<OilField, 'id' | 'entity_id' | 'created_at' | 'updated_at'>
export type OilFieldUpdate = Partial<OilFieldCreate>

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
  manned: boolean
  pob_capacity?: number | null
  status: OperationalStatus
  notes?: string | null
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
  water_depth_m?: number | null
  status: OperationalStatus
  is_manned: boolean
  pob_max?: number | null
  design_life_years?: number | null
  notes?: string | null
  created_at: string
  updated_at: string
}

export type InstallationCreate = Omit<Installation, 'id' | 'entity_id' | 'created_at' | 'updated_at'>
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
  manufacturer?: string | null
  model?: string | null
  serial_number?: string | null
  year_manufactured?: number | null
  year_installed?: number | null
  status: OperationalStatus
  criticality?: 'A' | 'B' | 'C' | null
  safety_function: boolean
  notes?: string | null
  created_at: string
  updated_at: string
}

export type EquipmentCreate = Omit<RegistryEquipment, 'id' | 'entity_id' | 'created_at' | 'updated_at'>
export type EquipmentUpdate = Partial<EquipmentCreate>

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
  design_code?: string | null
  design_life_years?: number | null
  installation_year?: number | null
  corrosion_allowance_mm?: number | null
  notes?: string | null
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
export interface HierarchyNode {
  field_id: string
  field_code: string
  field_name: string
  sites: {
    site_id: string
    site_code: string
    site_name: string
    installations: {
      installation_id: string
      installation_code: string
      installation_name: string
      equipment_count: number
    }[]
  }[]
}

// ── Stats ────────────────────────────────────────────────────
export interface AssetRegistryStats {
  total_fields: number
  total_sites: number
  total_installations: number
  total_equipment: number
  total_pipelines: number
  by_status: { status: OperationalStatus; count: number }[]
  by_equipment_class: { equipment_class: string; count: number }[]
}
