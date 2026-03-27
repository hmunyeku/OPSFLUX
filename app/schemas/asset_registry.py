"""Asset Registry schemas — Pydantic CRUD models for the O&G hierarchy."""

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


# ── GeoJSON helper ───────────────────────────────────────────

def _wkb_to_geojson(v: Any) -> dict | None:
    """Convert a geoalchemy2 WKBElement to a GeoJSON dict, or pass through if already a dict/None."""
    if v is None:
        return None
    if isinstance(v, dict):
        return v
    try:
        from geoalchemy2.shape import to_shape
        from shapely.geometry import mapping
        return mapping(to_shape(v))
    except Exception:
        return None


# ── Base mixins ───────────────────────────────────────────────

class TimestampMixin(BaseModel):
    created_at: datetime | None = None
    updated_at: datetime | None = None

class SoftDeleteMixin(BaseModel):
    deleted_at: datetime | None = None


# ════════════════════════════════════════════════════════════════
# FIELD
# ════════════════════════════════════════════════════════════════

class OilFieldCreate(BaseModel):
    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=200)
    country: str = Field(min_length=2, max_length=3)
    basin: str | None = None
    block_name: str | None = None
    license_number: str | None = None
    license_type: str | None = None
    license_expiry_date: date | None = None
    operator: str | None = "Perenco"
    working_interest_pct: Decimal | None = None
    regulator: str | None = None
    environment: str | None = None
    centroid_latitude: Decimal | None = None
    centroid_longitude: Decimal | None = None
    area_km2: Decimal | None = None
    discovery_year: int | None = None
    first_production_year: int | None = None
    reservoir_formation: str | None = None
    original_oil_in_place_mmbo: Decimal | None = None
    recoverable_reserves_mmbo: Decimal | None = None
    status: str = "OPERATIONAL"
    notes: str | None = None

class OilFieldUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    country: str | None = None
    basin: str | None = None
    block_name: str | None = None
    license_number: str | None = None
    license_type: str | None = None
    license_expiry_date: date | None = None
    operator: str | None = None
    working_interest_pct: Decimal | None = None
    regulator: str | None = None
    environment: str | None = None
    centroid_latitude: Decimal | None = None
    centroid_longitude: Decimal | None = None
    area_km2: Decimal | None = None
    discovery_year: int | None = None
    first_production_year: int | None = None
    reservoir_formation: str | None = None
    original_oil_in_place_mmbo: Decimal | None = None
    recoverable_reserves_mmbo: Decimal | None = None
    status: str | None = None
    notes: str | None = None

class OilFieldRead(OilFieldCreate, TimestampMixin, SoftDeleteMixin):
    id: UUID
    entity_id: UUID
    geom_centroid: dict | None = None
    geom_boundary: dict | None = None

    _convert_geom_centroid = field_validator("geom_centroid", mode="before")(_wkb_to_geojson)
    _convert_geom_boundary = field_validator("geom_boundary", mode="before")(_wkb_to_geojson)

    class Config:
        from_attributes = True


# ════════════════════════════════════════════════════════════════
# FIELD LICENSE
# ════════════════════════════════════════════════════════════════

class FieldLicenseCreate(BaseModel):
    license_type: str = Field(min_length=1, max_length=50)
    license_number: str = Field(min_length=1, max_length=100)
    authority: str | None = None
    issue_date: date | None = None
    expiry_date: date | None = None
    working_interest_pct: Decimal | None = None
    status: str = "ACTIVE"
    notes: str | None = None

class FieldLicenseUpdate(BaseModel):
    license_type: str | None = None
    license_number: str | None = None
    authority: str | None = None
    issue_date: date | None = None
    expiry_date: date | None = None
    working_interest_pct: Decimal | None = None
    status: str | None = None
    notes: str | None = None

class FieldLicenseRead(FieldLicenseCreate, TimestampMixin):
    id: UUID
    field_id: UUID
    class Config:
        from_attributes = True


# ════════════════════════════════════════════════════════════════
# SITE
# ════════════════════════════════════════════════════════════════

class OilSiteCreate(BaseModel):
    field_id: UUID
    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=200)
    site_type: str = Field(min_length=1, max_length=50)
    environment: str = Field(min_length=1, max_length=30)
    country: str = Field(min_length=2, max_length=3)
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    region: str | None = None
    water_depth_m: Decimal | None = None
    access_road: bool = False
    access_helicopter: bool = False
    access_vessel: bool = False
    helideck_available: bool = False
    nearest_airport: str | None = None
    nearest_port: str | None = None
    manned: bool = True
    pob_capacity: int | None = None
    power_source: str | None = None
    comms_system: str | None = None
    max_wind_speed_ms: Decimal | None = None
    design_wave_height_m: Decimal | None = None
    design_temp_max_c: Decimal | None = None
    design_temp_min_c: Decimal | None = None
    seismic_zone: str | None = None
    status: str = "OPERATIONAL"
    commissioning_date: date | None = None
    first_oil_date: date | None = None
    notes: str | None = None

class OilSiteUpdate(BaseModel):
    field_id: UUID | None = None
    code: str | None = None
    name: str | None = None
    site_type: str | None = None
    environment: str | None = None
    country: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    region: str | None = None
    water_depth_m: Decimal | None = None
    # Access
    access_road: bool | None = None
    access_helicopter: bool | None = None
    access_vessel: bool | None = None
    helideck_available: bool | None = None
    nearest_airport: str | None = None
    nearest_port: str | None = None
    # Operations
    manned: bool | None = None
    pob_capacity: int | None = None
    power_source: str | None = None
    comms_system: str | None = None
    # Design conditions
    max_wind_speed_ms: Decimal | None = None
    design_wave_height_m: Decimal | None = None
    design_temp_max_c: Decimal | None = None
    design_temp_min_c: Decimal | None = None
    seismic_zone: str | None = None
    # Status
    status: str | None = None
    commissioning_date: date | None = None
    first_oil_date: date | None = None
    notes: str | None = None

class OilSiteRead(OilSiteCreate, TimestampMixin, SoftDeleteMixin):
    id: UUID
    entity_id: UUID
    geom_point: dict | None = None
    geom_boundary: dict | None = None

    _convert_geom_point = field_validator("geom_point", mode="before")(_wkb_to_geojson)
    _convert_geom_boundary = field_validator("geom_boundary", mode="before")(_wkb_to_geojson)

    class Config:
        from_attributes = True


# ════════════════════════════════════════════════════════════════
# INSTALLATION
# ════════════════════════════════════════════════════════════════

class InstallationCreate(BaseModel):
    site_id: UUID
    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=200)
    installation_type: str = Field(min_length=1, max_length=60)
    environment: str = Field(min_length=1, max_length=30)
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    elevation_masl: Decimal | None = None
    water_depth_m: Decimal | None = None
    air_gap_m: Decimal | None = None
    orientation_deg: Decimal | None = None
    status: str = "OPERATIONAL"
    installation_date: date | None = None
    commissioning_date: date | None = None
    first_oil_date: date | None = None
    design_life_years: int | None = None
    is_manned: bool = True
    is_normally_unmanned: bool = False
    pob_max: int | None = None
    helideck_available: bool = False
    lifeboat_capacity: int | None = None
    total_area_m2: Decimal | None = None
    footprint_length_m: Decimal | None = None
    footprint_width_m: Decimal | None = None
    design_code: str | None = None
    classification_society: str | None = None
    class_notation: str | None = None
    notes: str | None = None

class InstallationUpdate(BaseModel):
    site_id: UUID | None = None
    code: str | None = None
    name: str | None = None
    installation_type: str | None = None
    environment: str | None = None
    # Geography
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    elevation_masl: Decimal | None = None
    water_depth_m: Decimal | None = None
    air_gap_m: Decimal | None = None
    orientation_deg: Decimal | None = None
    # Status
    status: str | None = None
    installation_date: date | None = None
    commissioning_date: date | None = None
    first_oil_date: date | None = None
    design_life_years: int | None = None
    # Characteristics
    is_manned: bool | None = None
    is_normally_unmanned: bool | None = None
    pob_max: int | None = None
    helideck_available: bool | None = None
    lifeboat_capacity: int | None = None
    total_area_m2: Decimal | None = None
    footprint_length_m: Decimal | None = None
    footprint_width_m: Decimal | None = None
    # Certification
    design_code: str | None = None
    classification_society: str | None = None
    class_notation: str | None = None
    # Contact
    installation_manager: UUID | None = None
    notes: str | None = None

class InstallationRead(InstallationCreate, TimestampMixin, SoftDeleteMixin):
    id: UUID
    entity_id: UUID
    geom_point: dict | None = None
    geom_footprint: dict | None = None
    inst_offshore_details: dict | None = None
    inst_onshore_details: dict | None = None
    inst_type_details: dict | None = None

    _convert_geom_point = field_validator("geom_point", mode="before")(_wkb_to_geojson)
    _convert_geom_footprint = field_validator("geom_footprint", mode="before")(_wkb_to_geojson)

    class Config:
        from_attributes = True


# ════════════════════════════════════════════════════════════════
# INSTALLATION DECK
# ════════════════════════════════════════════════════════════════

class InstallationDeckCreate(BaseModel):
    deck_name: str = Field(min_length=1, max_length=50)
    deck_code: str | None = None
    deck_order: int
    elevation_m: Decimal
    deck_length_m: Decimal | None = None
    deck_width_m: Decimal | None = None
    deck_area_m2: Decimal | None = None
    max_deck_load_tm2: Decimal | None = None
    deck_function: str | None = None
    notes: str | None = None

class InstallationDeckUpdate(BaseModel):
    deck_name: str | None = None
    deck_code: str | None = None
    deck_order: int | None = None
    elevation_m: Decimal | None = None
    deck_length_m: Decimal | None = None
    deck_width_m: Decimal | None = None
    deck_area_m2: Decimal | None = None
    max_deck_load_tm2: Decimal | None = None
    deck_function: str | None = None
    notes: str | None = None

class InstallationDeckRead(InstallationDeckCreate, TimestampMixin):
    id: UUID
    installation_id: UUID
    class Config:
        from_attributes = True


# ════════════════════════════════════════════════════════════════
# EQUIPMENT (base)
# ════════════════════════════════════════════════════════════════

class EquipmentCreate(BaseModel):
    tag_number: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=200)
    equipment_class: str = Field(min_length=1, max_length=50)
    installation_id: UUID | None = None
    deck_id: UUID | None = None
    area: str | None = None
    sub_area: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    elevation_m: Decimal | None = None
    local_x_m: Decimal | None = None
    local_y_m: Decimal | None = None
    local_z_m: Decimal | None = None
    orientation_deg: Decimal | None = None
    is_mobile: bool = False
    manufacturer: str | None = None
    model: str | None = None
    serial_number: str | None = None
    year_manufactured: int | None = None
    year_installed: int | None = None
    status: str = "OPERATIONAL"
    criticality: str | None = None
    safety_function: bool = False
    cert_number: str | None = None
    cert_authority: str | None = None
    drawing_number: str | None = None
    p_and_id_ref: str | None = None
    owner_company: str | None = None
    asset_number: str | None = None
    purchase_date: date | None = None
    purchase_cost_usd: Decimal | None = None
    replacement_cost_usd: Decimal | None = None
    grid_reference: str | None = None
    datasheet_url: str | None = None
    manual_url: str | None = None
    cert_document_url: str | None = None
    notes: str | None = None

class EquipmentUpdate(BaseModel):
    # Identification
    tag_number: str | None = None
    name: str | None = None
    equipment_class: str | None = None
    # Location
    installation_id: UUID | None = None
    deck_id: UUID | None = None
    area: str | None = None
    sub_area: str | None = None
    # GPS / position
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    elevation_m: Decimal | None = None
    local_x_m: Decimal | None = None
    local_y_m: Decimal | None = None
    local_z_m: Decimal | None = None
    orientation_deg: Decimal | None = None
    # Mobility
    is_mobile: bool | None = None
    # Manufacturer
    manufacturer: str | None = None
    model: str | None = None
    serial_number: str | None = None
    year_manufactured: int | None = None
    year_installed: int | None = None
    # Status
    status: str | None = None
    criticality: str | None = None
    safety_function: bool | None = None
    # Certification
    cert_number: str | None = None
    cert_authority: str | None = None
    # Documents
    drawing_number: str | None = None
    p_and_id_ref: str | None = None
    datasheet_url: str | None = None
    manual_url: str | None = None
    cert_document_url: str | None = None
    # Finance
    owner_company: str | None = None
    asset_number: str | None = None
    purchase_date: date | None = None
    purchase_cost_usd: Decimal | None = None
    replacement_cost_usd: Decimal | None = None
    grid_reference: str | None = None
    notes: str | None = None

class EquipmentRead(EquipmentCreate, TimestampMixin, SoftDeleteMixin):
    id: UUID
    entity_id: UUID
    created_by: UUID | None = None
    geom_point: dict | None = None
    specialized_data: dict | None = None

    _convert_geom_point = field_validator("geom_point", mode="before")(_wkb_to_geojson)

    class Config:
        from_attributes = True


# ════════════════════════════════════════════════════════════════
# PIPELINE
# ════════════════════════════════════════════════════════════════

class PipelineCreate(BaseModel):
    pipeline_id: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=200)
    service: str = Field(min_length=1, max_length=50)
    from_installation_id: UUID
    to_installation_id: UUID
    from_node_description: str | None = None
    to_node_description: str | None = None
    nominal_diameter_in: Decimal
    design_pressure_barg: Decimal
    design_temp_max_c: Decimal
    status: str = "OPERATIONAL"
    pipe_material: str | None = None
    pipe_grade: str | None = None
    total_length_km: Decimal | None = None
    wall_thickness_mm: Decimal | None = None
    fluid_description: str | None = None
    h2s_ppm: Decimal | None = None
    co2_mol_pct: Decimal | None = None
    piggable: bool = False
    pig_launcher_tag: str | None = None
    pig_receiver_tag: str | None = None
    cp_required: bool = False
    cp_type: str | None = None
    od_mm: Decimal | None = None
    onshore_length_km: Decimal | None = None
    offshore_length_km: Decimal | None = None
    coating_external: str | None = None
    coating_internal: str | None = None
    design_temp_min_c: Decimal | None = None
    maop_barg: Decimal | None = None
    test_pressure_barg: Decimal | None = None
    max_water_depth_m: Decimal | None = None
    corrosion_allowance_mm: Decimal | None = None
    design_code: str | None = None
    design_life_years: int | None = None
    installation_year: int | None = None
    permit_number: str | None = None
    regulator: str | None = None
    notes: str | None = None

class PipelineUpdate(BaseModel):
    pipeline_id: str | None = None
    name: str | None = None
    service: str | None = None
    # Connection A->B
    from_installation_id: UUID | None = None
    to_installation_id: UUID | None = None
    from_node_description: str | None = None
    to_node_description: str | None = None
    # Dimensional
    nominal_diameter_in: Decimal | None = None
    od_mm: Decimal | None = None
    wall_thickness_mm: Decimal | None = None
    # Design conditions
    design_pressure_barg: Decimal | None = None
    design_temp_max_c: Decimal | None = None
    design_temp_min_c: Decimal | None = None
    maop_barg: Decimal | None = None
    test_pressure_barg: Decimal | None = None
    # Status
    status: str | None = None
    # Materials
    pipe_material: str | None = None
    pipe_grade: str | None = None
    coating_external: str | None = None
    coating_internal: str | None = None
    # Routing
    total_length_km: Decimal | None = None
    onshore_length_km: Decimal | None = None
    offshore_length_km: Decimal | None = None
    max_water_depth_m: Decimal | None = None
    # Fluid
    fluid_description: str | None = None
    h2s_ppm: Decimal | None = None
    co2_mol_pct: Decimal | None = None
    # Pigging
    piggable: bool | None = None
    pig_launcher_tag: str | None = None
    pig_receiver_tag: str | None = None
    # CP
    cp_required: bool | None = None
    cp_type: str | None = None
    # Integrity
    corrosion_allowance_mm: Decimal | None = None
    design_code: str | None = None
    design_life_years: int | None = None
    installation_year: int | None = None
    # Regulatory
    permit_number: str | None = None
    regulator: str | None = None
    notes: str | None = None

class PipelineRead(PipelineCreate, TimestampMixin, SoftDeleteMixin):
    id: UUID
    entity_id: UUID
    geom_route: dict | None = None

    _convert_geom_route = field_validator("geom_route", mode="before")(_wkb_to_geojson)

    class Config:
        from_attributes = True


# ════════════════════════════════════════════════════════════════
# CRANE — CONFIGURATIONS
# ════════════════════════════════════════════════════════════════

class CraneConfigurationCreate(BaseModel):
    config_code: str = Field(min_length=1, max_length=20)
    config_name: str | None = None
    is_default_config: bool = False
    config_order: int | None = None
    boom_length_m: Decimal | None = None
    boom_length_ft: Decimal | None = None
    jib_installed: bool = False
    jib_length_m: Decimal | None = None
    jib_offset_deg: Decimal | None = None
    jib_type: str | None = None
    counterweight_tonnes: Decimal | None = None
    outrigger_state: str | None = None
    outrigger_length_m: Decimal | None = None
    reeving_parts: int | None = None
    reeving_line_pull_kn: Decimal | None = None
    hook_block_weight_kg: Decimal | None = None
    slewing_zone_description: str | None = None
    blind_zone_start_deg: Decimal | None = None
    blind_zone_end_deg: Decimal | None = None
    config_max_capacity_tonnes: Decimal | None = None
    config_max_radius_m: Decimal | None = None
    notes: str | None = None

class CraneConfigurationUpdate(BaseModel):
    config_code: str | None = None
    config_name: str | None = None
    is_default_config: bool | None = None
    config_order: int | None = None
    boom_length_m: Decimal | None = None
    jib_installed: bool | None = None
    jib_length_m: Decimal | None = None
    counterweight_tonnes: Decimal | None = None
    reeving_parts: int | None = None
    config_max_capacity_tonnes: Decimal | None = None
    config_max_radius_m: Decimal | None = None
    notes: str | None = None

class CraneConfigurationRead(CraneConfigurationCreate, TimestampMixin):
    id: UUID
    crane_id: UUID
    class Config:
        from_attributes = True


# ════════════════════════════════════════════════════════════════
# CRANE — HOOK BLOCKS
# ════════════════════════════════════════════════════════════════

class CraneHookBlockCreate(BaseModel):
    block_reference: str | None = None
    block_tag: str | None = None
    sheave_count: int | None = None
    swivel_type: str | None = None
    rated_capacity_tonnes: Decimal
    compatible_reeving_max: int | None = None
    block_weight_kg: Decimal | None = None
    hook_weight_kg: Decimal | None = None
    rope_diameter_mm: Decimal | None = None
    certificate_number: str | None = None
    is_main_hook: bool = True
    is_current_fit: bool = True

class CraneHookBlockUpdate(BaseModel):
    block_reference: str | None = None
    block_tag: str | None = None
    sheave_count: int | None = None
    rated_capacity_tonnes: Decimal | None = None
    block_weight_kg: Decimal | None = None
    hook_weight_kg: Decimal | None = None
    is_main_hook: bool | None = None
    is_current_fit: bool | None = None

class CraneHookBlockRead(CraneHookBlockCreate, TimestampMixin):
    id: UUID
    crane_id: UUID
    class Config:
        from_attributes = True


# ════════════════════════════════════════════════════════════════
# CRANE — REEVING GUIDE
# ════════════════════════════════════════════════════════════════

class CraneReevingGuideCreate(BaseModel):
    boom_config_ref: str | None = None
    load_min_tonnes: Decimal
    load_max_tonnes: Decimal
    reeving_parts: int
    config_id: UUID | None = None

class CraneReevingGuideUpdate(BaseModel):
    boom_config_ref: str | None = None
    load_min_tonnes: Decimal | None = None
    load_max_tonnes: Decimal | None = None
    reeving_parts: int | None = None

class CraneReevingGuideRead(CraneReevingGuideCreate, TimestampMixin):
    id: UUID
    crane_id: UUID
    class Config:
        from_attributes = True


# ════════════════════════════════════════════════════════════════
# SEPARATOR — NOZZLES
# ════════════════════════════════════════════════════════════════

class SeparatorNozzleCreate(BaseModel):
    nozzle_mark: str = Field(min_length=1, max_length=10)
    nozzle_service: str = Field(min_length=1, max_length=30)
    description: str | None = None
    nominal_size_in: Decimal
    schedule: str | None = None
    connection_type: str | None = None
    flange_rating: str | None = None
    nozzle_material: str | None = None
    connected_to_tag: str | None = None

class SeparatorNozzleUpdate(BaseModel):
    nozzle_mark: str | None = None
    nozzle_service: str | None = None
    description: str | None = None
    nominal_size_in: Decimal | None = None
    schedule: str | None = None
    connection_type: str | None = None
    flange_rating: str | None = None
    nozzle_material: str | None = None
    connected_to_tag: str | None = None

class SeparatorNozzleRead(SeparatorNozzleCreate, TimestampMixin):
    id: UUID
    separator_id: UUID
    class Config:
        from_attributes = True


# ════════════════════════════════════════════════════════════════
# SEPARATOR — PROCESS CASES
# ════════════════════════════════════════════════════════════════

class SeparatorProcessCaseCreate(BaseModel):
    case_name: str = Field(min_length=1, max_length=50)
    case_description: str | None = None
    inlet_pressure_barg: Decimal | None = None
    inlet_temp_c: Decimal | None = None
    inlet_gas_flow_mmscfd: Decimal | None = None
    inlet_oil_flow_sm3d: Decimal | None = None
    inlet_water_flow_sm3d: Decimal | None = None
    op_pressure_barg: Decimal | None = None
    op_temp_c: Decimal | None = None
    simulation_tool: str | None = None
    simulation_case_ref: str | None = None

class SeparatorProcessCaseUpdate(BaseModel):
    case_name: str | None = None
    case_description: str | None = None
    inlet_pressure_barg: Decimal | None = None
    inlet_temp_c: Decimal | None = None
    inlet_gas_flow_mmscfd: Decimal | None = None
    inlet_oil_flow_sm3d: Decimal | None = None
    inlet_water_flow_sm3d: Decimal | None = None
    op_pressure_barg: Decimal | None = None
    op_temp_c: Decimal | None = None
    simulation_tool: str | None = None
    simulation_case_ref: str | None = None

class SeparatorProcessCaseRead(SeparatorProcessCaseCreate, TimestampMixin):
    id: UUID
    separator_id: UUID
    class Config:
        from_attributes = True


# ════════════════════════════════════════════════════════════════
# PUMP — CURVE POINTS
# ════════════════════════════════════════════════════════════════

class PumpCurvePointCreate(BaseModel):
    flow_m3h: Decimal
    head_m: Decimal | None = None
    efficiency_pct: Decimal | None = None
    power_kw: Decimal | None = None
    npshr_m: Decimal | None = None
    speed_rpm: Decimal | None = None
    source: str = "MANUFACTURER"

class PumpCurvePointUpdate(BaseModel):
    flow_m3h: Decimal | None = None
    head_m: Decimal | None = None
    efficiency_pct: Decimal | None = None
    power_kw: Decimal | None = None
    npshr_m: Decimal | None = None
    speed_rpm: Decimal | None = None
    source: str | None = None

class PumpCurvePointRead(PumpCurvePointCreate, TimestampMixin):
    id: UUID
    pump_id: UUID
    class Config:
        from_attributes = True


# ════════════════════════════════════════════════════════════════
# PROCESS COLUMN — SECTIONS
# ════════════════════════════════════════════════════════════════

class ColumnSectionCreate(BaseModel):
    section_number: int
    section_name: str | None = None
    internals_type: str = Field(min_length=1, max_length=30)
    tray_count: int | None = None
    packing_type: str | None = None
    packing_height_m: Decimal | None = None
    notes: str | None = None

class ColumnSectionUpdate(BaseModel):
    section_number: int | None = None
    section_name: str | None = None
    internals_type: str | None = None
    tray_count: int | None = None
    packing_type: str | None = None
    packing_height_m: Decimal | None = None
    notes: str | None = None

class ColumnSectionRead(ColumnSectionCreate, TimestampMixin):
    id: UUID
    column_id: UUID
    class Config:
        from_attributes = True


# ════════════════════════════════════════════════════════════════
# PAGINATED RESPONSE (reuse pattern)
# ════════════════════════════════════════════════════════════════

from typing import Generic, TypeVar
T = TypeVar("T")

class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int = 0
