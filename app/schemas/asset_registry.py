"""Asset Registry schemas — Pydantic CRUD models for the O&G hierarchy."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


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
    status: str | None = None
    notes: str | None = None

class OilFieldRead(OilFieldCreate, TimestampMixin, SoftDeleteMixin):
    id: UUID
    entity_id: UUID
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
    code: str | None = None
    name: str | None = None
    site_type: str | None = None
    environment: str | None = None
    country: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    status: str | None = None
    notes: str | None = None
    # Allow partial updates for all other fields
    manned: bool | None = None
    pob_capacity: int | None = None
    water_depth_m: Decimal | None = None

class OilSiteRead(OilSiteCreate, TimestampMixin, SoftDeleteMixin):
    id: UUID
    entity_id: UUID
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
    code: str | None = None
    name: str | None = None
    installation_type: str | None = None
    environment: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    status: str | None = None
    notes: str | None = None
    is_manned: bool | None = None
    pob_max: int | None = None
    water_depth_m: Decimal | None = None

class InstallationRead(InstallationCreate, TimestampMixin, SoftDeleteMixin):
    id: UUID
    entity_id: UUID
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
    notes: str | None = None

class EquipmentUpdate(BaseModel):
    tag_number: str | None = None
    name: str | None = None
    equipment_class: str | None = None
    installation_id: UUID | None = None
    deck_id: UUID | None = None
    area: str | None = None
    sub_area: str | None = None
    status: str | None = None
    criticality: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    serial_number: str | None = None
    notes: str | None = None

class EquipmentRead(EquipmentCreate, TimestampMixin, SoftDeleteMixin):
    id: UUID
    entity_id: UUID
    created_by: UUID | None = None
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
    piggable: bool = False
    design_code: str | None = None
    design_life_years: int | None = None
    installation_year: int | None = None
    notes: str | None = None

class PipelineUpdate(BaseModel):
    name: str | None = None
    service: str | None = None
    status: str | None = None
    total_length_km: Decimal | None = None
    notes: str | None = None

class PipelineRead(PipelineCreate, TimestampMixin, SoftDeleteMixin):
    id: UUID
    entity_id: UUID
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
