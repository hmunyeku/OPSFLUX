"""Asset Registry — O&G hierarchical asset data model.

Hiérarchie: Field → Site → Installation → Equipment
Extensions: PostGIS (geography), JSONB, equipment_class enum
Standards: API, ASME, ISO, EN, DNV, NORSOK

This module coexists with the legacy `assets` table in common.py.
New features should use these normalized tables; the old table is
retained for backward compatibility during migration.
"""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID as PyUUID

from geoalchemy2 import Geography
from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, Enum, Float, ForeignKey,
    Index, Integer, Numeric, String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


# ================================================================
# SECTION 1 — ENUMS
# ================================================================

import enum


class OperationalStatus(str, enum.Enum):
    OPERATIONAL = "OPERATIONAL"
    STANDBY = "STANDBY"
    UNDER_CONSTRUCTION = "UNDER_CONSTRUCTION"
    SUSPENDED = "SUSPENDED"
    DECOMMISSIONED = "DECOMMISSIONED"
    ABANDONED = "ABANDONED"


class EnvironmentType(str, enum.Enum):
    ONSHORE = "ONSHORE"
    OFFSHORE = "OFFSHORE"
    SWAMP = "SWAMP"
    SHALLOW_WATER = "SHALLOW_WATER"
    DEEPWATER = "DEEPWATER"
    SUBSEA = "SUBSEA"


class EquipmentClassEnum(str, enum.Enum):
    # Levage
    CRANE = "CRANE"
    HOIST = "HOIST"
    DAVIT = "DAVIT"
    LIFTING_ACCESSORY = "LIFTING_ACCESSORY"
    # Séparation / Vessels
    SEPARATOR = "SEPARATOR"
    PRESSURE_VESSEL = "PRESSURE_VESSEL"
    PROCESS_COLUMN = "PROCESS_COLUMN"
    STORAGE_TANK = "STORAGE_TANK"
    FILTER = "FILTER"
    # Machines rotatives
    PUMP = "PUMP"
    GAS_COMPRESSOR = "GAS_COMPRESSOR"
    AIR_COMPRESSOR = "AIR_COMPRESSOR"
    GAS_TURBINE = "GAS_TURBINE"
    DIESEL_GENERATOR = "DIESEL_GENERATOR"
    STEAM_TURBINE = "STEAM_TURBINE"
    FAN_BLOWER = "FAN_BLOWER"
    TURBOEXPANDER = "TURBOEXPANDER"
    # Thermique
    HEAT_EXCHANGER = "HEAT_EXCHANGER"
    FIRED_HEATER = "FIRED_HEATER"
    # Safety
    PSV = "PSV"
    RUPTURE_DISK = "RUPTURE_DISK"
    ESD_SYSTEM = "ESD_SYSTEM"
    FIRE_GAS_SYSTEM = "FIRE_GAS_SYSTEM"
    FIRE_WATER_SYSTEM = "FIRE_WATER_SYSTEM"
    FLARE_SYSTEM = "FLARE_SYSTEM"
    # Instrumentation
    INSTRUMENT = "INSTRUMENT"
    METERING_SKID = "METERING_SKID"
    # Process
    CHEMICAL_INJECTION = "CHEMICAL_INJECTION"
    GAS_DEHYDRATION = "GAS_DEHYDRATION"
    WATER_TREATMENT = "WATER_TREATMENT"
    NITROGEN_UNIT = "NITROGEN_UNIT"
    HPU = "HPU"
    # Utilities
    HVAC = "HVAC"
    UPS = "UPS"
    TELECOM = "TELECOM"
    # Électrique
    TRANSFORMER = "TRANSFORMER"
    SWITCHGEAR = "SWITCHGEAR"
    MCC = "MCC"
    # Tuyauterie
    PIPING_LINE = "PIPING_LINE"
    MANIFOLD = "MANIFOLD"
    PIG_STATION = "PIG_STATION"
    # Puits
    WELLHEAD = "WELLHEAD"
    DOWNHOLE_COMPLETION = "DOWNHOLE_COMPLETION"
    # Subsea
    SUBSEA_XT = "SUBSEA_XT"
    SUBSEA_UMBILICAL = "SUBSEA_UMBILICAL"
    SUBSEA_PLEM_PLET = "SUBSEA_PLEM_PLET"
    RISER = "RISER"
    SUBSEA_CONTROL_SYSTEM = "SUBSEA_CONTROL_SYSTEM"
    # Marine
    MARINE_LOADING_ARM = "MARINE_LOADING_ARM"
    MOORING_SYSTEM = "MOORING_SYSTEM"
    SURVIVAL_CRAFT = "SURVIVAL_CRAFT"
    # Civil
    BUILDING = "BUILDING"
    STRUCTURAL_ELEMENT = "STRUCTURAL_ELEMENT"
    # Utilities eau
    POTABLE_WATER_SYSTEM = "POTABLE_WATER_SYSTEM"
    SEWAGE_SYSTEM = "SEWAGE_SYSTEM"
    COOLING_WATER_SYSTEM = "COOLING_WATER_SYSTEM"
    DRAINAGE_SYSTEM = "DRAINAGE_SYSTEM"
    # CP
    CATHODIC_PROTECTION = "CATHODIC_PROTECTION"
    # Divers
    VEHICLE = "VEHICLE"
    PORTABLE_EQUIPMENT = "PORTABLE_EQUIPMENT"


class SiteType(str, enum.Enum):
    OFFSHORE_PLATFORM_COMPLEX = "OFFSHORE_PLATFORM_COMPLEX"
    ONSHORE_TERMINAL = "ONSHORE_TERMINAL"
    ONSHORE_FIELD_AREA = "ONSHORE_FIELD_AREA"
    EXPORT_TERMINAL = "EXPORT_TERMINAL"
    LOGISTICS_BASE = "LOGISTICS_BASE"
    SUBSEA_FIELD = "SUBSEA_FIELD"


class InstallationType(str, enum.Enum):
    # Offshore
    FIXED_JACKET_PLATFORM = "FIXED_JACKET_PLATFORM"
    FIXED_CONCRETE_PLATFORM = "FIXED_CONCRETE_PLATFORM"
    SEMI_SUBMERSIBLE = "SEMI_SUBMERSIBLE"
    FPSO = "FPSO"
    FSO = "FSO"
    SPAR = "SPAR"
    TLP = "TLP"
    JACK_UP = "JACK_UP"
    WELLHEAD_BUOY = "WELLHEAD_BUOY"
    SUBSEA_TEMPLATE = "SUBSEA_TEMPLATE"
    FLARE_TOWER_OFFSHORE = "FLARE_TOWER_OFFSHORE"
    RISER_PLATFORM = "RISER_PLATFORM"
    # Onshore
    ONSHORE_WELL_PAD = "ONSHORE_WELL_PAD"
    ONSHORE_GATHERING_STATION = "ONSHORE_GATHERING_STATION"
    ONSHORE_CPF = "ONSHORE_CPF"
    ONSHORE_TERMINAL = "ONSHORE_TERMINAL"
    ONSHORE_PUMPING_STATION = "ONSHORE_PUMPING_STATION"
    ONSHORE_COMPRESSION_STATION = "ONSHORE_COMPRESSION_STATION"
    ONSHORE_METERING_STATION = "ONSHORE_METERING_STATION"
    ONSHORE_PIG_STATION = "ONSHORE_PIG_STATION"
    ONSHORE_STORAGE_TANK_FARM = "ONSHORE_STORAGE_TANK_FARM"
    ONSHORE_FLARE_SYSTEM = "ONSHORE_FLARE_SYSTEM"
    ONSHORE_WATER_TREATMENT = "ONSHORE_WATER_TREATMENT"
    ONSHORE_POWER_PLANT = "ONSHORE_POWER_PLANT"
    LOGISTICS_BASE = "LOGISTICS_BASE"
    CAMP = "CAMP"
    HELIPAD = "HELIPAD"
    JETTY_PIER = "JETTY_PIER"


class CraneTypeEnum(str, enum.Enum):
    LATTICE_PEDESTAL = "LATTICE_PEDESTAL"
    LATTICE_CRAWLER = "LATTICE_CRAWLER"
    LATTICE_TRUCK = "LATTICE_TRUCK"
    LATTICE_RING = "LATTICE_RING"
    TELESCOPIC_TRUCK = "TELESCOPIC_TRUCK"
    TELESCOPIC_ROUGH_TERRAIN = "TELESCOPIC_ROUGH_TERRAIN"
    TELESCOPIC_ALL_TERRAIN = "TELESCOPIC_ALL_TERRAIN"
    TELESCOPIC_PEDESTAL = "TELESCOPIC_PEDESTAL"
    KNUCKLE_BOOM_TRUCK = "KNUCKLE_BOOM_TRUCK"
    KNUCKLE_BOOM_PEDESTAL = "KNUCKLE_BOOM_PEDESTAL"
    KNUCKLE_BOOM_MARINE = "KNUCKLE_BOOM_MARINE"
    COLUMN_SLEWING = "COLUMN_SLEWING"
    COLUMN_FIXED = "COLUMN_FIXED"
    OVERHEAD_BRIDGE = "OVERHEAD_BRIDGE"
    GANTRY = "GANTRY"
    SEMI_GANTRY = "SEMI_GANTRY"
    MONORAIL = "MONORAIL"
    RAIL_MOUNTED_SLEWING = "RAIL_MOUNTED_SLEWING"
    TOWER_FIXED = "TOWER_FIXED"
    TOWER_LUFFING = "TOWER_LUFFING"
    DAVIT = "DAVIT"
    A_FRAME = "A_FRAME"
    FLOATING_CRANE = "FLOATING_CRANE"
    DERRICK = "DERRICK"


class PipelineServiceType(str, enum.Enum):
    EXPORT_OIL = "EXPORT_OIL"
    EXPORT_GAS = "EXPORT_GAS"
    INJECTION_WATER = "INJECTION_WATER"
    INJECTION_GAS = "INJECTION_GAS"
    GAS_LIFT = "GAS_LIFT"
    INFIELD_FLOWLINE = "INFIELD_FLOWLINE"
    INFIELD_TRUNKLINE = "INFIELD_TRUNKLINE"
    INTERFIELD_TRUNK = "INTERFIELD_TRUNK"
    FUEL_GAS = "FUEL_GAS"
    PRODUCED_WATER = "PRODUCED_WATER"
    CHEMICAL_LINE = "CHEMICAL_LINE"
    UTILITY_LINE = "UTILITY_LINE"
    SUBSEA_UMBILICAL = "SUBSEA_UMBILICAL"
    RISER = "RISER"


# ================================================================
# SECTION 2 — HIERARCHY: Field → Site → Installation
# ================================================================

class OilField(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Oil/gas field — top-level geographic grouping."""
    __tablename__ = "ar_fields"
    __table_args__ = (
        UniqueConstraint("entity_id", "code", name="uq_ar_fields_entity_code"),
        Index("idx_ar_fields_entity", "entity_id"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    country: Mapped[str] = mapped_column(String(3), nullable=False)
    basin: Mapped[str | None] = mapped_column(String(100))
    block_name: Mapped[str | None] = mapped_column(String(100))
    license_number: Mapped[str | None] = mapped_column(String(100))
    license_type: Mapped[str | None] = mapped_column(String(30))
    license_expiry_date: Mapped[date | None] = mapped_column(Date)
    operator: Mapped[str | None] = mapped_column(String(100), default="Perenco")
    working_interest_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    regulator: Mapped[str | None] = mapped_column(String(100))
    environment: Mapped[str | None] = mapped_column(String(30))
    # Geography
    centroid_latitude: Mapped[Decimal | None] = mapped_column(Numeric(12, 8))
    centroid_longitude: Mapped[Decimal | None] = mapped_column(Numeric(12, 8))
    geom_centroid: Mapped[str | None] = mapped_column(Geography("POINT", srid=4326))
    geom_boundary: Mapped[str | None] = mapped_column(Geography("POLYGON", srid=4326))
    area_km2: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    # Reservoir
    discovery_year: Mapped[int | None] = mapped_column(Integer)
    first_production_year: Mapped[int | None] = mapped_column(Integer)
    reservoir_formation: Mapped[str | None] = mapped_column(String(100))
    original_oil_in_place_mmbo: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    recoverable_reserves_mmbo: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    # Status
    status: Mapped[str] = mapped_column(String(30), default="OPERATIONAL", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    # Relationships
    sites: Mapped[list["OilSite"]] = relationship(back_populates="field", cascade="all, delete-orphan")


class OilSite(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Site — geographic area within a field."""
    __tablename__ = "ar_sites"
    __table_args__ = (
        UniqueConstraint("entity_id", "code", name="uq_ar_sites_entity_code"),
        Index("idx_ar_sites_entity", "entity_id"),
        Index("idx_ar_sites_field", "field_id"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)
    field_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_fields.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    site_type: Mapped[str] = mapped_column(String(50), nullable=False)
    environment: Mapped[str] = mapped_column(String(30), nullable=False)
    # Geography
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(12, 8))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(12, 8))
    geom_point: Mapped[str | None] = mapped_column(Geography("POINT", srid=4326))
    geom_boundary: Mapped[str | None] = mapped_column(Geography("POLYGON", srid=4326))
    country: Mapped[str] = mapped_column(String(3), nullable=False)
    region: Mapped[str | None] = mapped_column(String(100))
    water_depth_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    # Access
    access_road: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    access_helicopter: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    access_vessel: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    helideck_available: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    nearest_airport: Mapped[str | None] = mapped_column(String(100))
    nearest_port: Mapped[str | None] = mapped_column(String(100))
    # Operations
    manned: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    pob_capacity: Mapped[int | None] = mapped_column(Integer)
    power_source: Mapped[str | None] = mapped_column(String(100))
    comms_system: Mapped[str | None] = mapped_column(String(200))
    # Design conditions
    max_wind_speed_ms: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    design_wave_height_m: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    design_temp_max_c: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    design_temp_min_c: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    seismic_zone: Mapped[str | None] = mapped_column(String(20))
    # Status
    status: Mapped[str] = mapped_column(String(30), default="OPERATIONAL", nullable=False)
    commissioning_date: Mapped[date | None] = mapped_column(Date)
    first_oil_date: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)

    # Relationships
    field: Mapped["OilField"] = relationship(back_populates="sites")
    installations: Mapped[list["Installation"]] = relationship(back_populates="site", cascade="all, delete-orphan")


class Installation(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Physical installation — platform, terminal, well pad, etc."""
    __tablename__ = "ar_installations"
    __table_args__ = (
        UniqueConstraint("entity_id", "code", name="uq_ar_installations_entity_code"),
        Index("idx_ar_installations_entity", "entity_id"),
        Index("idx_ar_installations_site", "site_id"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)
    site_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_sites.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    installation_type: Mapped[str] = mapped_column(String(60), nullable=False)
    environment: Mapped[str] = mapped_column(String(30), nullable=False)
    # Geography
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(12, 8))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(12, 8))
    geom_point: Mapped[str | None] = mapped_column(Geography("POINT", srid=4326))
    geom_footprint: Mapped[str | None] = mapped_column(Geography("POLYGON", srid=4326))
    elevation_masl: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    water_depth_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    air_gap_m: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    orientation_deg: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    # Local reference frame
    local_origin_lat: Mapped[Decimal | None] = mapped_column(Numeric(12, 8))
    local_origin_lon: Mapped[Decimal | None] = mapped_column(Numeric(12, 8))
    local_origin_elev_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    # Status
    status: Mapped[str] = mapped_column(String(30), default="OPERATIONAL", nullable=False)
    installation_date: Mapped[date | None] = mapped_column(Date)
    commissioning_date: Mapped[date | None] = mapped_column(Date)
    first_oil_date: Mapped[date | None] = mapped_column(Date)
    design_life_years: Mapped[int | None] = mapped_column(Integer)
    # Characteristics
    is_manned: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_normally_unmanned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pob_max: Mapped[int | None] = mapped_column(Integer)
    helideck_available: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    lifeboat_capacity: Mapped[int | None] = mapped_column(Integer)
    total_area_m2: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    footprint_length_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    footprint_width_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    # Certification
    design_code: Mapped[str | None] = mapped_column(String(100))
    classification_society: Mapped[str | None] = mapped_column(String(30))
    class_notation: Mapped[str | None] = mapped_column(String(100))
    # Contact
    installation_manager: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True))
    notes: Mapped[str | None] = mapped_column(Text)

    # Relationships
    site: Mapped["OilSite"] = relationship(back_populates="installations")
    decks: Mapped[list["InstallationDeck"]] = relationship(back_populates="installation", cascade="all, delete-orphan")
    offshore_details: Mapped["InstallationOffshoreDetails | None"] = relationship(back_populates="installation", uselist=False, cascade="all, delete-orphan")
    onshore_details: Mapped["InstallationOnshoreDetails | None"] = relationship(back_populates="installation", uselist=False, cascade="all, delete-orphan")
    equipment_list: Mapped[list["RegistryEquipment"]] = relationship(back_populates="installation", cascade="all, delete-orphan")


# ================================================================
# SECTION 2a — INSTALLATION DETAILS (1:1 extensions)
# ================================================================

class InstallationOffshoreDetails(Base):
    """Offshore-specific installation details (1:1)."""
    __tablename__ = "ar_installation_offshore_details"

    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_installations.id", ondelete="CASCADE"), primary_key=True)
    structure_type: Mapped[str | None] = mapped_column(String(30))
    jacket_leg_count: Mapped[int | None] = mapped_column(Integer)
    topsides_weight_tonnes: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    total_weight_tonnes: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    number_of_decks: Mapped[int | None] = mapped_column(Integer)
    main_deck_elevation_m: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    cellar_deck_elevation_m: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    top_deck_elevation_m: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    max_deck_load_tm2: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    # Mooring
    mooring_type: Mapped[str | None] = mapped_column(String(30))
    number_of_mooring_lines: Mapped[int | None] = mapped_column(Integer)
    # Foundation
    pile_count: Mapped[int | None] = mapped_column(Integer)
    pile_diameter_mm: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    pile_penetration_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    # Conductors
    conductor_slots_total: Mapped[int | None] = mapped_column(Integer)
    conductor_slots_used: Mapped[int | None] = mapped_column(Integer)
    # FPSO
    vessel_length_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    vessel_beam_m: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    storage_capacity_bbl: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    # CP
    cp_type: Mapped[str | None] = mapped_column(String(30))
    cp_design_life_years: Mapped[int | None] = mapped_column(Integer)

    installation: Mapped["Installation"] = relationship(back_populates="offshore_details")


class InstallationOnshoreDetails(Base):
    """Onshore-specific installation details (1:1)."""
    __tablename__ = "ar_installation_onshore_details"

    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_installations.id", ondelete="CASCADE"), primary_key=True)
    land_area_m2: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    fenced_area_m2: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    process_area_m2: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    terrain_type: Mapped[str | None] = mapped_column(String(30))
    ground_bearing_capacity_kpa: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    flood_risk: Mapped[str | None] = mapped_column(String(10))
    # Access
    access_road_type: Mapped[str | None] = mapped_column(String(30))
    access_road_length_km: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))
    max_truck_tonnage_tonnes: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    # Utilities
    power_supply_type: Mapped[str | None] = mapped_column(String(30))
    power_supply_kva: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    water_supply_type: Mapped[str | None] = mapped_column(String(30))
    water_storage_m3: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    internet_connectivity: Mapped[str | None] = mapped_column(String(30))
    # Buildings
    has_control_room: Mapped[bool] = mapped_column(Boolean, default=False)
    has_workshop: Mapped[bool] = mapped_column(Boolean, default=False)
    has_warehouse: Mapped[bool] = mapped_column(Boolean, default=False)
    has_accommodation: Mapped[bool] = mapped_column(Boolean, default=False)
    accommodation_beds: Mapped[int | None] = mapped_column(Integer)
    has_medical_room: Mapped[bool] = mapped_column(Boolean, default=False)
    # Layout
    layout_drawing_ref: Mapped[str | None] = mapped_column(String(100))
    # HSE
    bunding_provided: Mapped[bool] = mapped_column(Boolean, default=False)
    total_bunding_volume_m3: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    wind_rose_dominant_dir: Mapped[str | None] = mapped_column(String(10))
    # Permits
    environmental_permit_ref: Mapped[str | None] = mapped_column(String(100))
    operating_permit_ref: Mapped[str | None] = mapped_column(String(100))
    land_title_ref: Mapped[str | None] = mapped_column(String(100))

    installation: Mapped["Installation"] = relationship(back_populates="onshore_details")


class InstallationDeck(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Deck level on an installation (platform)."""
    __tablename__ = "ar_installation_decks"
    __table_args__ = (
        UniqueConstraint("installation_id", "deck_code", name="uq_ar_installation_decks_code"),
        Index("idx_ar_installation_decks_inst", "installation_id"),
    )

    installation_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_installations.id", ondelete="CASCADE"), nullable=False)
    deck_name: Mapped[str] = mapped_column(String(50), nullable=False)
    deck_code: Mapped[str | None] = mapped_column(String(10))
    deck_order: Mapped[int] = mapped_column(Integer, nullable=False)
    elevation_m: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False)
    deck_length_m: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    deck_width_m: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    deck_area_m2: Mapped[Decimal | None] = mapped_column(Numeric(9, 2))
    max_deck_load_tm2: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    deck_function: Mapped[str | None] = mapped_column(String(100))
    geom_footprint: Mapped[str | None] = mapped_column(Geography("POLYGON", srid=4326))
    notes: Mapped[str | None] = mapped_column(Text)

    installation: Mapped["Installation"] = relationship(back_populates="decks")


# ================================================================
# SECTION 3 — EQUIPMENT (Base commune)
# ================================================================

class RegistryEquipment(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Equipment — base table for all equipment types. Specialized specs
    are in child tables linked 1:1 via PK=FK (e.g. ar_cranes.id → ar_equipment.id)."""
    __tablename__ = "ar_equipment"
    __table_args__ = (
        UniqueConstraint("entity_id", "tag_number", name="uq_ar_equipment_entity_tag"),
        Index("idx_ar_equipment_entity", "entity_id"),
        Index("idx_ar_equipment_class", "equipment_class"),
        Index("idx_ar_equipment_install", "installation_id"),
        Index("idx_ar_equipment_status", "status"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)
    # Identification
    tag_number: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    equipment_class: Mapped[str] = mapped_column(String(50), nullable=False)
    # Location
    installation_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_installations.id"))
    deck_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_installation_decks.id"))
    area: Mapped[str | None] = mapped_column(String(100))
    sub_area: Mapped[str | None] = mapped_column(String(100))
    grid_reference: Mapped[str | None] = mapped_column(String(20))
    # GPS
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(12, 8))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(12, 8))
    elevation_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    geom_point: Mapped[str | None] = mapped_column(Geography("POINT", srid=4326))
    # Local frame
    local_x_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    local_y_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    local_z_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    orientation_deg: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    # Mobility
    is_mobile: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Manufacturer
    manufacturer: Mapped[str | None] = mapped_column(String(100))
    model: Mapped[str | None] = mapped_column(String(100))
    serial_number: Mapped[str | None] = mapped_column(String(100))
    year_manufactured: Mapped[int | None] = mapped_column(Integer)
    year_installed: Mapped[int | None] = mapped_column(Integer)
    # Status
    status: Mapped[str] = mapped_column(String(30), default="OPERATIONAL", nullable=False)
    criticality: Mapped[str | None] = mapped_column(String(1))  # A/B/C
    safety_function: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Certification
    cert_number: Mapped[str | None] = mapped_column(String(100))
    cert_authority: Mapped[str | None] = mapped_column(String(100))
    # Documents
    datasheet_url: Mapped[str | None] = mapped_column(String(500))
    manual_url: Mapped[str | None] = mapped_column(String(500))
    cert_document_url: Mapped[str | None] = mapped_column(String(500))
    drawing_number: Mapped[str | None] = mapped_column(String(100))
    p_and_id_ref: Mapped[str | None] = mapped_column(String(100))
    # Finance
    owner_company: Mapped[str | None] = mapped_column(String(100))
    asset_number: Mapped[str | None] = mapped_column(String(100))
    purchase_date: Mapped[date | None] = mapped_column(Date)
    purchase_cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    replacement_cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(15, 2))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True))

    # Relationships
    installation: Mapped["Installation | None"] = relationship(back_populates="equipment_list")
    deck: Mapped["InstallationDeck | None"] = relationship(foreign_keys=[deck_id])
    documents: Mapped[list["EquipmentDocument"]] = relationship(back_populates="equipment", cascade="all, delete-orphan")
    assignments: Mapped[list["EquipmentAssignment"]] = relationship(back_populates="equipment", cascade="all, delete-orphan")


class EquipmentDocument(UUIDPrimaryKeyMixin, Base):
    """Document attached to an equipment item."""
    __tablename__ = "ar_equipment_documents"

    equipment_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), nullable=False)
    document_type: Mapped[str | None] = mapped_column(String(30))
    document_title: Mapped[str | None] = mapped_column(String(200))
    document_number: Mapped[str | None] = mapped_column(String(100))
    revision: Mapped[str | None] = mapped_column(String(10))
    file_url: Mapped[str | None] = mapped_column(String(500))
    issued_by: Mapped[str | None] = mapped_column(String(100))
    issue_date: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)

    equipment: Mapped["RegistryEquipment"] = relationship(back_populates="documents")


class EquipmentAssignment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Assignment history for mobile equipment."""
    __tablename__ = "ar_equipment_assignments"

    equipment_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id"), nullable=False)
    installation_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_installations.id"), nullable=False)
    assigned_from: Mapped[date] = mapped_column(Date, nullable=False)
    assigned_to: Mapped[date | None] = mapped_column(Date)
    assignment_reason: Mapped[str | None] = mapped_column(Text)
    work_order_ref: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)

    equipment: Mapped["RegistryEquipment"] = relationship(back_populates="assignments")


# ================================================================
# SECTION 4 — PIPELINE
# ================================================================

class RegistryPipeline(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Pipeline connecting two installations."""
    __tablename__ = "ar_pipelines"
    __table_args__ = (
        UniqueConstraint("entity_id", "pipeline_id", name="uq_ar_pipelines_entity_pid"),
        Index("idx_ar_pipelines_entity", "entity_id"),
        Index("idx_ar_pipelines_from", "from_installation_id"),
        Index("idx_ar_pipelines_to", "to_installation_id"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)
    pipeline_id: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    service: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="OPERATIONAL", nullable=False)
    # Connection A→B
    from_installation_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_installations.id"), nullable=False)
    to_installation_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_installations.id"), nullable=False)
    from_node_description: Mapped[str | None] = mapped_column(String(200))
    to_node_description: Mapped[str | None] = mapped_column(String(200))
    # Routing
    geom_route: Mapped[str | None] = mapped_column(Geography("LINESTRING", srid=4326))
    total_length_km: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    onshore_length_km: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    offshore_length_km: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    # Dimensional
    nominal_diameter_in: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    od_mm: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))
    wall_thickness_mm: Mapped[Decimal | None] = mapped_column(Numeric(6, 3))
    # Materials
    pipe_material: Mapped[str | None] = mapped_column(String(100))
    pipe_grade: Mapped[str | None] = mapped_column(String(30))
    coating_external: Mapped[str | None] = mapped_column(String(50))
    coating_internal: Mapped[str | None] = mapped_column(String(50))
    # Design conditions
    design_pressure_barg: Mapped[Decimal] = mapped_column(Numeric(9, 3), nullable=False)
    design_temp_max_c: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False)
    design_temp_min_c: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    maop_barg: Mapped[Decimal | None] = mapped_column(Numeric(9, 3))
    test_pressure_barg: Mapped[Decimal | None] = mapped_column(Numeric(9, 3))
    # Profile
    max_water_depth_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    # Fluid
    fluid_description: Mapped[str | None] = mapped_column(String(100))
    h2s_ppm: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    co2_mol_pct: Mapped[Decimal | None] = mapped_column(Numeric(6, 3))
    # CP
    cp_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    cp_type: Mapped[str | None] = mapped_column(String(30))
    # Pigging
    piggable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pig_launcher_tag: Mapped[str | None] = mapped_column(String(50))
    pig_receiver_tag: Mapped[str | None] = mapped_column(String(50))
    # Integrity
    design_code: Mapped[str | None] = mapped_column(String(30))
    design_life_years: Mapped[int | None] = mapped_column(Integer)
    installation_year: Mapped[int | None] = mapped_column(Integer)
    corrosion_allowance_mm: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    # Regulatory
    permit_number: Mapped[str | None] = mapped_column(String(100))
    regulator: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)

    # Relationships
    from_installation: Mapped["Installation"] = relationship(foreign_keys=[from_installation_id])
    to_installation: Mapped["Installation"] = relationship(foreign_keys=[to_installation_id])
    waypoints: Mapped[list["PipelineWaypoint"]] = relationship(back_populates="pipeline", cascade="all, delete-orphan")


class PipelineWaypoint(UUIDPrimaryKeyMixin, Base):
    """GPS waypoint along a pipeline route."""
    __tablename__ = "ar_pipeline_waypoints"
    __table_args__ = (
        UniqueConstraint("pipeline_id", "sequence_no", name="uq_ar_pipeline_waypoints_seq"),
        Index("idx_ar_pipeline_waypoints_pipe", "pipeline_id", "sequence_no"),
    )

    pipeline_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_pipelines.id", ondelete="CASCADE"), nullable=False)
    sequence_no: Mapped[int] = mapped_column(Integer, nullable=False)
    latitude: Mapped[Decimal] = mapped_column(Numeric(12, 8), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(12, 8), nullable=False)
    elevation_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    geom_point: Mapped[str | None] = mapped_column(Geography("POINT", srid=4326))
    chainage_km: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    environment: Mapped[str | None] = mapped_column(String(30))
    water_depth_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    burial_depth_m: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    waypoint_type: Mapped[str | None] = mapped_column(String(20))
    waypoint_name: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)

    pipeline: Mapped["RegistryPipeline"] = relationship(back_populates="waypoints")


class InstallationConnection(UUIDPrimaryKeyMixin, Base):
    """Non-pipeline connection between installations (bridges, cables, etc.)."""
    __tablename__ = "ar_installation_connections"

    from_installation_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_installations.id"), nullable=False)
    to_installation_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_installations.id"), nullable=False)
    connection_type: Mapped[str | None] = mapped_column(String(30))
    tag_number: Mapped[str | None] = mapped_column(String(50))
    name: Mapped[str | None] = mapped_column(String(200))
    length_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    capacity: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(30), default="OPERATIONAL", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)


# ================================================================
# SECTION 5 — SPECIALIZED EQUIPMENT TABLES
# All linked 1:1 via PK=FK to ar_equipment.id
# ================================================================

# ── 5.1 CRANE ────────────────────────────────────────────────────

class Crane(Base):
    """Crane specialized specs."""
    __tablename__ = "ar_cranes"

    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    crane_type: Mapped[str] = mapped_column(String(50), nullable=False)
    boom_structure: Mapped[str | None] = mapped_column(String(30))
    mobility: Mapped[str | None] = mapped_column(String(30))
    is_offshore_rated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Capacity
    swl_tonnes: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    max_capacity_tonnes: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    # Boom
    boom_min_length_m: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    boom_max_length_m: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    boom_min_angle_deg: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    boom_max_angle_deg: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    # Radius / height
    radius_min_m: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    radius_max_m: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    max_hook_height_m: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    # Jib
    has_jib: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    jib_max_length_m: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    jib_offset_deg: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    # Slewing
    slewing_full_rotation: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    slewing_arc_deg: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    slewing_speed_rpm: Mapped[Decimal | None] = mapped_column(Numeric(6, 3))
    # Speeds
    hoist_speed_rated_mpm: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    hoist_speed_empty_mpm: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    lowering_speed_mpm: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    # Masses
    gross_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    counterweight_kg: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    hook_block_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    # Wire rope
    wire_rope_diameter_mm: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    wire_rope_length_m: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    wire_rope_grade: Mapped[str | None] = mapped_column(String(30))
    wire_rope_mbl_kn: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    reeving_main_max: Mapped[int | None] = mapped_column(Integer)
    # Pedestal (offshore)
    pedestal_diameter_mm: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    pedestal_height_m: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    base_bolt_circle_mm: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    base_bolt_count: Mapped[int | None] = mapped_column(Integer)
    base_bolt_size: Mapped[str | None] = mapped_column(String(10))
    # Mobile
    carrier_axles: Mapped[int | None] = mapped_column(Integer)
    outrigger_spread_m: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    # Overhead
    span_m: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    runway_length_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    # Operating conditions
    max_wind_speed_op_ms: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    max_wind_speed_survival_ms: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    max_wave_height_op_m: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    max_heel_deg: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))
    max_trim_deg: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))
    # Power
    power_supply_voltage_v: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    installed_power_kw: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    hydraulic_pressure_bar: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    # Lifting moment
    lifting_moment_knm: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    lifting_moment_mt: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    # Standards
    design_standard: Mapped[str | None] = mapped_column(String(50))
    operation_standard: Mapped[str | None] = mapped_column(String(50))
    load_chart_reference: Mapped[str | None] = mapped_column(String(100))
    load_chart_unit: Mapped[str] = mapped_column(String(10), default="TONNES", nullable=False)
    requires_operator_cert: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    operator_cert_standard: Mapped[str | None] = mapped_column(String(50))
    thorough_exam_interval_months: Mapped[int | None] = mapped_column(Integer, default=6)

    # Sub-tables
    configurations: Mapped[list["CraneConfiguration"]] = relationship(back_populates="crane", cascade="all, delete-orphan")
    hook_blocks: Mapped[list["CraneHookBlock"]] = relationship(back_populates="crane", cascade="all, delete-orphan")
    reeving_guide: Mapped[list["CraneReevingGuide"]] = relationship(back_populates="crane", cascade="all, delete-orphan")


class CraneConfiguration(UUIDPrimaryKeyMixin, Base):
    """Crane configuration (boom + reeving + counterweight)."""
    __tablename__ = "ar_crane_configurations"
    __table_args__ = (
        UniqueConstraint("crane_id", "config_code", name="uq_ar_crane_config_code"),
    )

    crane_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_cranes.id", ondelete="CASCADE"), nullable=False)
    config_code: Mapped[str] = mapped_column(String(30), nullable=False)
    config_name: Mapped[str | None] = mapped_column(String(200))
    is_default_config: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    config_order: Mapped[int | None] = mapped_column(Integer)
    boom_length_m: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    boom_length_ft: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    jib_installed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    jib_length_m: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    jib_offset_deg: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    jib_type: Mapped[str | None] = mapped_column(String(20))
    counterweight_tonnes: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    outrigger_state: Mapped[str | None] = mapped_column(String(20), default="NOT_APPLICABLE")
    outrigger_length_m: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    reeving_parts: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    reeving_line_pull_kn: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    hook_block_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    slewing_zone_description: Mapped[str | None] = mapped_column(String(100))
    blind_zone_start_deg: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    blind_zone_end_deg: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    config_max_capacity_tonnes: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    config_max_radius_m: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    notes: Mapped[str | None] = mapped_column(Text)

    crane: Mapped["Crane"] = relationship(back_populates="configurations")
    load_chart_points: Mapped[list["CraneLoadChartPoint"]] = relationship(back_populates="config", cascade="all, delete-orphan")
    lift_zones: Mapped[list["CraneLiftZone"]] = relationship(back_populates="config", cascade="all, delete-orphan")


class CraneLoadChartPoint(UUIDPrimaryKeyMixin, Base):
    """Load chart data point (manufacturer's load chart)."""
    __tablename__ = "ar_crane_load_chart_points"
    __table_args__ = (
        UniqueConstraint("config_id", "radius_m", "hook_type", name="uq_ar_crane_lcp"),
        Index("idx_ar_crane_lcp_config", "config_id", "radius_m"),
    )

    config_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_crane_configurations.id", ondelete="CASCADE"), nullable=False)
    radius_m: Mapped[Decimal] = mapped_column(Numeric(7, 3), nullable=False)
    max_load_tonnes: Mapped[Decimal] = mapped_column(Numeric(8, 3), nullable=False)
    hook_height_m: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    boom_angle_deg: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    load_raw: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    load_unit_source: Mapped[str | None] = mapped_column(String(10))
    hook_type: Mapped[str] = mapped_column(String(15), default="MAIN_HOOK", nullable=False)
    row_order: Mapped[int | None] = mapped_column(Integer)
    is_derated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    config: Mapped["CraneConfiguration"] = relationship(back_populates="load_chart_points")


class CraneLiftZone(UUIDPrimaryKeyMixin, Base):
    """Angular derating zone for crane operations."""
    __tablename__ = "ar_crane_lift_zones"

    config_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_crane_configurations.id", ondelete="CASCADE"), nullable=False)
    zone_name: Mapped[str] = mapped_column(String(100), nullable=False)
    angle_start_deg: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    angle_end_deg: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    angle_reference: Mapped[str] = mapped_column(String(20), default="BOW", nullable=False)
    derating_factor: Mapped[Decimal] = mapped_column(Numeric(5, 4), default=1.0, nullable=False)
    derating_reason: Mapped[str | None] = mapped_column(String(200))
    max_load_override_tonnes: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    max_radius_override_m: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    notes: Mapped[str | None] = mapped_column(Text)

    config: Mapped["CraneConfiguration"] = relationship(back_populates="lift_zones")


class CraneHookBlock(UUIDPrimaryKeyMixin, Base):
    """Hook block / sheave block catalog."""
    __tablename__ = "ar_crane_hook_blocks"

    crane_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_cranes.id", ondelete="CASCADE"), nullable=False)
    block_reference: Mapped[str | None] = mapped_column(String(100))
    block_tag: Mapped[str | None] = mapped_column(String(50))
    sheave_count: Mapped[int | None] = mapped_column(Integer)
    swivel_type: Mapped[str | None] = mapped_column(String(30))
    rated_capacity_tonnes: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    compatible_reeving_max: Mapped[int | None] = mapped_column(Integer)
    block_weight_kg: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    hook_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    rope_diameter_mm: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    certificate_number: Mapped[str | None] = mapped_column(String(100))
    is_main_hook: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_current_fit: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    crane: Mapped["Crane"] = relationship(back_populates="hook_blocks")


class CraneReevingGuide(UUIDPrimaryKeyMixin, Base):
    """Reeving selection guide (load range → number of parts)."""
    __tablename__ = "ar_crane_reeving_guide"
    __table_args__ = (
        UniqueConstraint("crane_id", "reeving_parts", name="uq_ar_crane_reeving"),
    )

    crane_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_cranes.id", ondelete="CASCADE"), nullable=False)
    boom_config_ref: Mapped[str | None] = mapped_column(String(100))
    load_min_tonnes: Mapped[Decimal] = mapped_column(Numeric(8, 3), nullable=False)
    load_max_tonnes: Mapped[Decimal] = mapped_column(Numeric(8, 3), nullable=False)
    reeving_parts: Mapped[int] = mapped_column(Integer, nullable=False)
    config_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_crane_configurations.id"))

    crane: Mapped["Crane"] = relationship(back_populates="reeving_guide")


# ── 5.2 SEPARATOR ────────────────────────────────────────────────

class Separator(Base):
    """Separator specialized specs (2-phase, 3-phase, test separator, etc.)."""
    __tablename__ = "ar_separators"

    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    separator_type: Mapped[str] = mapped_column(String(30), nullable=False)
    orientation: Mapped[str] = mapped_column(String(20), nullable=False)
    separation_stage: Mapped[int | None] = mapped_column(Integer)
    train_id: Mapped[str | None] = mapped_column(String(10))
    is_test_separator: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Geometry
    shell_id_mm: Mapped[Decimal] = mapped_column(Numeric(9, 2), nullable=False)
    shell_od_mm: Mapped[Decimal | None] = mapped_column(Numeric(9, 2))
    tan_to_tan_mm: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    overall_length_mm: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    head_type: Mapped[str | None] = mapped_column(String(30))
    total_volume_m3: Mapped[Decimal | None] = mapped_column(Numeric(9, 4))
    liquid_volume_m3: Mapped[Decimal | None] = mapped_column(Numeric(9, 4))
    gas_volume_m3: Mapped[Decimal | None] = mapped_column(Numeric(9, 4))
    # Weights
    weight_empty_kg: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    weight_operating_kg: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    weight_hydrotest_kg: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    # Design
    design_pressure_barg: Mapped[Decimal] = mapped_column(Numeric(9, 3), nullable=False)
    mawp_barg: Mapped[Decimal | None] = mapped_column(Numeric(9, 3))
    design_temp_max_c: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False)
    design_temp_min_c: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    mdmt_c: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    hydro_test_pressure_barg: Mapped[Decimal | None] = mapped_column(Numeric(9, 3))
    # Operating
    op_pressure_barg: Mapped[Decimal | None] = mapped_column(Numeric(9, 3))
    op_temp_c: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    # Construction
    shell_material: Mapped[str | None] = mapped_column(String(100))
    design_code: Mapped[str] = mapped_column(String(50), nullable=False)
    corrosion_allowance_mm: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    wall_thickness_nominal_mm: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    pwht_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    u_stamp: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    support_type: Mapped[str | None] = mapped_column(String(20))
    skirt_height_m: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    # Internals
    inlet_device: Mapped[str | None] = mapped_column(String(30))
    mist_eliminator_type: Mapped[str | None] = mapped_column(String(20), default="MESH_PAD")
    weir_plate_installed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sand_jetting_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Fluid
    fluid_service: Mapped[str | None] = mapped_column(String(100))
    h2s_ppm: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    co2_mol_pct: Mapped[Decimal | None] = mapped_column(Numeric(7, 4))
    is_sour_service: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    nace_mr0175_applicable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Design flows
    gas_flow_mmscfd: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    oil_flow_sm3d: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    water_flow_sm3d: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    # Safety
    psv_count: Mapped[int | None] = mapped_column(Integer, default=1)
    primary_psv_tag: Mapped[str | None] = mapped_column(String(50))
    primary_psv_set_barg: Mapped[Decimal | None] = mapped_column(Numeric(9, 3))
    bdv_tag: Mapped[str | None] = mapped_column(String(50))
    # Inspection
    internal_inspection_interval_y: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)

    nozzles: Mapped[list["SeparatorNozzle"]] = relationship(back_populates="separator", cascade="all, delete-orphan")
    process_cases: Mapped[list["SeparatorProcessCase"]] = relationship(back_populates="separator", cascade="all, delete-orphan")


class SeparatorNozzle(UUIDPrimaryKeyMixin, Base):
    """Separator nozzle schedule."""
    __tablename__ = "ar_separator_nozzles"
    __table_args__ = (
        UniqueConstraint("separator_id", "nozzle_mark", name="uq_ar_sep_nozzle_mark"),
    )

    separator_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_separators.id", ondelete="CASCADE"), nullable=False)
    nozzle_mark: Mapped[str] = mapped_column(String(10), nullable=False)
    nozzle_service: Mapped[str] = mapped_column(String(30), nullable=False)
    description: Mapped[str | None] = mapped_column(String(200))
    nominal_size_in: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    schedule: Mapped[str | None] = mapped_column(String(20))
    connection_type: Mapped[str | None] = mapped_column(String(20))
    flange_rating: Mapped[str | None] = mapped_column(String(10))
    nozzle_material: Mapped[str | None] = mapped_column(String(100))
    connected_to_tag: Mapped[str | None] = mapped_column(String(50))

    separator: Mapped["Separator"] = relationship(back_populates="nozzles")


class SeparatorProcessCase(UUIDPrimaryKeyMixin, Base):
    """Separator process case (design/normal/turndown/upset)."""
    __tablename__ = "ar_separator_process_cases"
    __table_args__ = (
        UniqueConstraint("separator_id", "case_name", name="uq_ar_sep_case_name"),
    )

    separator_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_separators.id", ondelete="CASCADE"), nullable=False)
    case_name: Mapped[str] = mapped_column(String(20), nullable=False)
    case_description: Mapped[str | None] = mapped_column(String(200))
    inlet_pressure_barg: Mapped[Decimal | None] = mapped_column(Numeric(9, 3))
    inlet_temp_c: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    inlet_gas_flow_mmscfd: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    inlet_oil_flow_sm3d: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    inlet_water_flow_sm3d: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    op_pressure_barg: Mapped[Decimal | None] = mapped_column(Numeric(9, 3))
    op_temp_c: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    simulation_tool: Mapped[str | None] = mapped_column(String(30))
    simulation_case_ref: Mapped[str | None] = mapped_column(String(100))

    separator: Mapped["Separator"] = relationship(back_populates="process_cases")


# ── 5.3 PUMP ─────────────────────────────────────────────────────

class Pump(Base):
    """Pump specialized specs."""
    __tablename__ = "ar_pumps"

    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    pump_type: Mapped[str] = mapped_column(String(30), nullable=False)
    api_type_designation: Mapped[str | None] = mapped_column(String(10))
    pump_service: Mapped[str | None] = mapped_column(String(100))
    number_of_stages: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    orientation: Mapped[str | None] = mapped_column(String(20))
    duty_standby: Mapped[str | None] = mapped_column(String(10))
    paired_pump_tag: Mapped[str | None] = mapped_column(String(50))
    # Fluid
    fluid_description: Mapped[str | None] = mapped_column(String(200))
    fluid_density_kgm3: Mapped[Decimal] = mapped_column(Numeric(8, 3), nullable=False)
    fluid_viscosity_cst: Mapped[Decimal | None] = mapped_column(Numeric(10, 5))
    h2s_ppm: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    is_sour_service: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Performance
    flow_rated_m3h: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    flow_min_m3h: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    flow_max_m3h: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    head_rated_m: Mapped[Decimal] = mapped_column(Numeric(9, 2), nullable=False)
    differential_pressure_barg: Mapped[Decimal | None] = mapped_column(Numeric(9, 3))
    suction_pressure_barg: Mapped[Decimal | None] = mapped_column(Numeric(9, 3))
    discharge_pressure_barg: Mapped[Decimal | None] = mapped_column(Numeric(9, 3))
    npsha_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))
    npshr_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))
    efficiency_rated_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    # Design
    design_pressure_barg: Mapped[Decimal | None] = mapped_column(Numeric(9, 3))
    design_temp_max_c: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    # Motor
    motor_rated_power_kw: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    motor_voltage_v: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    motor_speed_rpm: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    vfd_installed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Mechanical
    pump_speed_rpm: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    impeller_diameter_mm: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    impeller_material: Mapped[str | None] = mapped_column(String(100))
    casing_material: Mapped[str | None] = mapped_column(String(100))
    seal_type: Mapped[str | None] = mapped_column(String(30))
    # Standard
    design_code: Mapped[str | None] = mapped_column(String(30))
    overhaul_interval_h: Mapped[int | None] = mapped_column(Integer)

    curve_points: Mapped[list["PumpCurvePoint"]] = relationship(back_populates="pump", cascade="all, delete-orphan")


class PumpCurvePoint(UUIDPrimaryKeyMixin, Base):
    """Pump characteristic curve point (manufacturer data)."""
    __tablename__ = "ar_pump_curve_points"
    __table_args__ = (
        UniqueConstraint("pump_id", "flow_m3h", "speed_rpm", name="uq_ar_pump_curve"),
    )

    pump_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_pumps.id", ondelete="CASCADE"), nullable=False)
    flow_m3h: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    head_m: Mapped[Decimal | None] = mapped_column(Numeric(9, 2))
    efficiency_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    power_kw: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    npshr_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))
    speed_rpm: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    source: Mapped[str] = mapped_column(String(20), default="MANUFACTURER", nullable=False)

    pump: Mapped["Pump"] = relationship(back_populates="curve_points")


# ── 5.4 GAS COMPRESSOR ───────────────────────────────────────────

class GasCompressor(Base):
    """Gas compressor specialized specs."""
    __tablename__ = "ar_gas_compressors"

    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    compressor_type: Mapped[str] = mapped_column(String(20), nullable=False)
    service: Mapped[str] = mapped_column(String(30), nullable=False)
    number_of_stages: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    # Gas
    gas_description: Mapped[str | None] = mapped_column(String(200))
    mole_weight_kgkmol: Mapped[Decimal | None] = mapped_column(Numeric(7, 3))
    h2s_ppm: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    co2_mol_pct: Mapped[Decimal | None] = mapped_column(Numeric(6, 3))
    gas_composition_json: Mapped[dict | None] = mapped_column(JSONB)
    # Performance
    flow_mmscfd: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    suction_pressure_barg: Mapped[Decimal] = mapped_column(Numeric(9, 3), nullable=False)
    discharge_pressure_barg: Mapped[Decimal] = mapped_column(Numeric(9, 3), nullable=False)
    compression_ratio: Mapped[Decimal | None] = mapped_column(Numeric(7, 4))
    suction_temp_c: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    discharge_temp_c: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    polytropic_efficiency_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    shaft_power_kw: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    # Driver
    driver_type: Mapped[str | None] = mapped_column(String(20))
    driver_tag: Mapped[str | None] = mapped_column(String(50))
    driver_rated_power_kw: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    compressor_speed_rpm: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    # Centrifugal
    number_of_impellers: Mapped[int | None] = mapped_column(Integer)
    surge_margin_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    anti_surge_valve_tag: Mapped[str | None] = mapped_column(String(50))
    dgs_installed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Standard
    design_code: Mapped[str | None] = mapped_column(String(20))
    overhaul_interval_h: Mapped[int | None] = mapped_column(Integer)


# ── 5.5 GAS TURBINE ──────────────────────────────────────────────

class GasTurbine(Base):
    """Gas turbine generator or mechanical drive."""
    __tablename__ = "ar_gas_turbines"

    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    application: Mapped[str] = mapped_column(String(20), nullable=False)
    turbine_class: Mapped[str | None] = mapped_column(String(20))
    number_of_shafts: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    model_designation: Mapped[str | None] = mapped_column(String(100))
    # ISO performance
    iso_power_kw: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    iso_heat_rate_kjkwh: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    iso_thermal_efficiency_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    # Site performance
    site_power_kw: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    site_ambient_temp_design_c: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    # Fuel
    primary_fuel_type: Mapped[str | None] = mapped_column(String(30))
    dual_fuel: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Compressor
    pressure_ratio: Mapped[Decimal] = mapped_column(Numeric(7, 4), nullable=False)
    # Output
    output_voltage_v: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    output_frequency_hz: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), default=50)
    output_rated_power_kw: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    driven_equipment_tag: Mapped[str | None] = mapped_column(String(50))
    # Maintenance OEM
    combustion_inspection_eoh: Mapped[int | None] = mapped_column(Integer)
    hot_section_inspection_eoh: Mapped[int | None] = mapped_column(Integer)
    major_overhaul_eoh: Mapped[int | None] = mapped_column(Integer)
    oem_ltsa_contract: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    design_code: Mapped[str | None] = mapped_column(String(30))


# ── 5.6 DIESEL GENERATOR ─────────────────────────────────────────

class DieselGenerator(Base):
    """Diesel generator specs."""
    __tablename__ = "ar_diesel_generators"

    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    is_emergency_generator: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    generator_class: Mapped[str | None] = mapped_column(String(5))
    engine_manufacturer: Mapped[str] = mapped_column(String(100), nullable=False)
    engine_model: Mapped[str] = mapped_column(String(100), nullable=False)
    engine_speed_rpm: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    engine_cylinders: Mapped[int | None] = mapped_column(Integer)
    rated_power_kw: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    standby_power_kw: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    voltage_v: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    frequency_hz: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), default=50)
    power_factor: Mapped[Decimal | None] = mapped_column(Numeric(4, 3), default=0.8)
    fuel_type: Mapped[str | None] = mapped_column(String(20), default="HSD")
    fuel_consumption_at_100_lph: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))
    base_tank_capacity_l: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    fuel_autonomy_at_full_load_h: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    auto_start_on_mains_failure: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    parallel_operation: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    design_code: Mapped[str | None] = mapped_column(String(50))


# ── 5.7 STORAGE TANK ─────────────────────────────────────────────

class StorageTank(Base):
    """Storage tank specs (API 650/620/2610)."""
    __tablename__ = "ar_storage_tanks"

    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    tank_type: Mapped[str] = mapped_column(String(30), nullable=False)
    tank_service: Mapped[str | None] = mapped_column(String(100))
    api_standard: Mapped[str | None] = mapped_column(String(10))
    nominal_capacity_m3: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    usable_capacity_m3: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    shell_diameter_m: Mapped[Decimal] = mapped_column(Numeric(9, 3), nullable=False)
    shell_height_m: Mapped[Decimal] = mapped_column(Numeric(8, 3), nullable=False)
    shell_courses: Mapped[int | None] = mapped_column(Integer)
    design_pressure_mbarg: Mapped[Decimal | None] = mapped_column(Numeric(8, 3), default=0)
    design_temp_max_c: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    specific_gravity_product: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    shell_material: Mapped[str | None] = mapped_column(String(100))
    internal_coating: Mapped[str | None] = mapped_column(String(100))
    external_coating: Mapped[str | None] = mapped_column(String(100))
    # Foundation
    foundation_type: Mapped[str | None] = mapped_column(String(20))
    # Bunding
    bund_provided: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    bund_capacity_m3: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    gesip_compliant: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Fire protection
    foam_system_type: Mapped[str | None] = mapped_column(String(20))
    # Inspection
    internal_inspection_interval_y: Mapped[int | None] = mapped_column(Integer, default=10)


# ── 5.8 HEAT EXCHANGER ───────────────────────────────────────────

class HeatExchanger(Base):
    """Heat exchanger / cooler / condenser."""
    __tablename__ = "ar_heat_exchangers"

    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    hx_type: Mapped[str] = mapped_column(String(20), nullable=False)
    service_description: Mapped[str | None] = mapped_column(String(200))
    tema_type: Mapped[str | None] = mapped_column(String(10))
    tema_class: Mapped[str | None] = mapped_column(String(5))
    # Shell side
    shell_fluid: Mapped[str | None] = mapped_column(String(100))
    shell_design_pressure_barg: Mapped[Decimal | None] = mapped_column(Numeric(9, 3))
    shell_design_temp_max_c: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    shell_material: Mapped[str | None] = mapped_column(String(100))
    # Tube side
    tube_fluid: Mapped[str | None] = mapped_column(String(100))
    tube_design_pressure_barg: Mapped[Decimal | None] = mapped_column(Numeric(9, 3))
    tube_material: Mapped[str | None] = mapped_column(String(100))
    tube_count: Mapped[int | None] = mapped_column(Integer)
    tube_length_m: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    number_of_passes: Mapped[int | None] = mapped_column(Integer, default=1)
    # Thermal
    duty_kw: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    heat_transfer_area_m2: Mapped[Decimal | None] = mapped_column(Numeric(9, 2))
    # Construction
    design_code: Mapped[str | None] = mapped_column(String(30))
    total_weight_dry_kg: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))


# ── 5.9 PRESSURE VESSEL ──────────────────────────────────────────

class PressureVessel(Base):
    """Generic pressure vessel (non-separator)."""
    __tablename__ = "ar_pressure_vessels"

    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    vessel_type: Mapped[str] = mapped_column(String(30), nullable=False)
    service_description: Mapped[str | None] = mapped_column(String(200))
    orientation: Mapped[str] = mapped_column(String(20), nullable=False)
    shell_id_mm: Mapped[Decimal] = mapped_column(Numeric(9, 2), nullable=False)
    tan_to_tan_mm: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    total_volume_m3: Mapped[Decimal | None] = mapped_column(Numeric(9, 4))
    weight_empty_kg: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    design_pressure_barg: Mapped[Decimal] = mapped_column(Numeric(9, 3), nullable=False)
    mawp_barg: Mapped[Decimal | None] = mapped_column(Numeric(9, 3))
    design_temp_max_c: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False)
    design_temp_min_c: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    shell_material: Mapped[str | None] = mapped_column(String(100))
    design_code: Mapped[str | None] = mapped_column(String(50))
    corrosion_allowance_mm: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    psv_tag: Mapped[str | None] = mapped_column(String(50))
    psv_set_barg: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))


# ── 5.10 INSTRUMENT ──────────────────────────────────────────────

class Instrument(Base):
    """Instrumentation (transmitters, control valves, detectors, etc.)."""
    __tablename__ = "ar_instruments"

    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    instrument_type: Mapped[str] = mapped_column(String(10), nullable=False)
    loop_number: Mapped[str | None] = mapped_column(String(50))
    loop_description: Mapped[str | None] = mapped_column(String(200))
    parent_equipment_tag: Mapped[str | None] = mapped_column(String(50))
    p_and_id_ref: Mapped[str | None] = mapped_column(String(100))
    fluid_service: Mapped[str | None] = mapped_column(String(100))
    # Measurement
    range_min: Mapped[Decimal | None] = mapped_column(Numeric(14, 5))
    range_max: Mapped[Decimal | None] = mapped_column(Numeric(14, 5))
    range_unit: Mapped[str | None] = mapped_column(String(30))
    # Signal
    signal_type: Mapped[str | None] = mapped_column(String(20))
    fail_safe_position: Mapped[str | None] = mapped_column(String(5))
    # Design
    design_pressure_barg: Mapped[Decimal | None] = mapped_column(Numeric(9, 3))
    design_temp_max_c: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    wetted_material: Mapped[str | None] = mapped_column(String(100))
    # ATEX
    hazardous_area_zone: Mapped[str | None] = mapped_column(String(10))
    atex_certificate_number: Mapped[str | None] = mapped_column(String(100))
    ip_rating: Mapped[str | None] = mapped_column(String(10))
    # Calibration
    calibration_interval_months: Mapped[int | None] = mapped_column(Integer, default=12)
    # SIL
    sil_rated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sil_level: Mapped[str | None] = mapped_column(String(5))
    # Control valve
    valve_body_size_in: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    valve_body_material: Mapped[str | None] = mapped_column(String(50))
    valve_actuator_type: Mapped[str | None] = mapped_column(String(20))
    valve_cv_rated: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))


# ── 5.11+ REMAINING SPECIALIZED TABLES (stubs — will be expanded) ──

class PipingLine(Base):
    """Piping line within installation."""
    __tablename__ = "ar_piping_lines"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    line_number: Mapped[str] = mapped_column(String(150), nullable=False)
    line_class: Mapped[str | None] = mapped_column(String(20))
    service_description: Mapped[str | None] = mapped_column(String(200))
    nominal_diameter_in: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    schedule: Mapped[str | None] = mapped_column(String(20))
    pipe_material_spec: Mapped[str | None] = mapped_column(String(100))
    design_pressure_barg: Mapped[Decimal] = mapped_column(Numeric(9, 3), nullable=False)
    design_temp_max_c: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False)
    design_code: Mapped[str | None] = mapped_column(String(20))
    geom_route: Mapped[str | None] = mapped_column(Geography("LINESTRING", srid=4326))


class Wellhead(Base):
    """Wellhead / Christmas tree."""
    __tablename__ = "ar_wellheads"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    well_tag: Mapped[str | None] = mapped_column(String(50))
    well_name: Mapped[str | None] = mapped_column(String(100))
    well_type: Mapped[str | None] = mapped_column(String(15))
    slot_number: Mapped[str | None] = mapped_column(String(20))
    wellhead_type: Mapped[str | None] = mapped_column(String(30))
    wp_class: Mapped[str | None] = mapped_column(String(15))
    design_pressure_psi: Mapped[Decimal | None] = mapped_column(Numeric(9, 2))
    design_pressure_barg: Mapped[Decimal | None] = mapped_column(Numeric(9, 3))
    h2s_service: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    xt_type: Mapped[str | None] = mapped_column(String(20))
    xt_manufacturer: Mapped[str | None] = mapped_column(String(100))
    xt_model: Mapped[str | None] = mapped_column(String(100))
    scssv_installed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    scssv_type: Mapped[str | None] = mapped_column(String(20))
    scssv_depth_m: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))


class FlareSystem(Base):
    """Flare system specs."""
    __tablename__ = "ar_flare_systems"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    flare_type: Mapped[str] = mapped_column(String(30), nullable=False)
    service: Mapped[str | None] = mapped_column(String(30))
    design_standard: Mapped[str | None] = mapped_column(String(30))
    tip_manufacturer: Mapped[str | None] = mapped_column(String(100))
    tip_diameter_in: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    stack_height_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    smokeless_capacity_mmscfd: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    max_relief_capacity_mmscfd: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    ignition_type: Mapped[str | None] = mapped_column(String(20))
    pilot_count: Mapped[int | None] = mapped_column(Integer)
    ko_drum_tag: Mapped[str | None] = mapped_column(String(50))
    seal_drum_tag: Mapped[str | None] = mapped_column(String(50))
    exclusion_zone_m: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))


class ESDSystem(Base):
    """Emergency Shutdown System."""
    __tablename__ = "ar_esd_systems"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    system_name: Mapped[str | None] = mapped_column(String(100))
    system_type: Mapped[str | None] = mapped_column(String(20))
    sil_level: Mapped[str] = mapped_column(String(5), nullable=False)
    iec_61511_compliant: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    logic_solver_manufacturer: Mapped[str | None] = mapped_column(String(50))
    logic_solver_model: Mapped[str | None] = mapped_column(String(50))
    voted_configuration: Mapped[str | None] = mapped_column(String(10))
    number_of_sifs: Mapped[int | None] = mapped_column(Integer)
    number_of_esd_valves: Mapped[int | None] = mapped_column(Integer)
    esd_levels: Mapped[dict | None] = mapped_column(JSONB)
    target_pfd: Mapped[Decimal | None] = mapped_column(Numeric(10, 8))
    design_code: Mapped[str | None] = mapped_column(String(30))


class FireWaterSystem(Base):
    """Fire water system."""
    __tablename__ = "ar_fire_water_systems"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    system_type: Mapped[str | None] = mapped_column(String(20))
    service_area: Mapped[str | None] = mapped_column(String(200))
    design_standard: Mapped[str | None] = mapped_column(String(30))
    ring_main_size_in: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    main_pump_tag: Mapped[str | None] = mapped_column(String(50))
    main_pump_flow_m3h: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    tank_tag: Mapped[str | None] = mapped_column(String(50))
    tank_capacity_m3: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    autonomy_min: Mapped[int | None] = mapped_column(Integer)
    deluge_zones: Mapped[int | None] = mapped_column(Integer)
    foam_concentrate_type: Mapped[str | None] = mapped_column(String(15))


class TransformerEquipment(Base):
    """Electrical transformer."""
    __tablename__ = "ar_transformers"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    transformer_type: Mapped[str | None] = mapped_column(String(25))
    cooling_type: Mapped[str | None] = mapped_column(String(15))
    primary_voltage_v: Mapped[Decimal] = mapped_column(Numeric(9, 2), nullable=False)
    secondary_voltage_v: Mapped[Decimal] = mapped_column(Numeric(9, 2), nullable=False)
    rated_power_kva: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    frequency_hz: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), default=50)
    vector_group: Mapped[str | None] = mapped_column(String(10))
    impedance_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    oil_volume_l: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    design_code: Mapped[str | None] = mapped_column(String(20))


class LiftingAccessory(Base):
    """Lifting accessory (slings, shackles, spreader beams, etc.)."""
    __tablename__ = "ar_lifting_accessories"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    accessory_type: Mapped[str] = mapped_column(String(25), nullable=False)
    is_part_of_set: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    set_reference: Mapped[str | None] = mapped_column(String(50))
    wll_tonnes: Mapped[Decimal] = mapped_column(Numeric(8, 3), nullable=False)
    swl_tonnes: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))
    safety_factor: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), default=4.0)
    number_of_legs: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    nominal_size_mm: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    length_m: Mapped[Decimal | None] = mapped_column(Numeric(7, 3))
    material: Mapped[str | None] = mapped_column(String(50))
    grade: Mapped[str | None] = mapped_column(String(20))
    self_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    colour_code: Mapped[str | None] = mapped_column(String(20))
    cert_standard: Mapped[str | None] = mapped_column(String(30))
    cert_number: Mapped[str | None] = mapped_column(String(100))
    examination_interval_months: Mapped[int | None] = mapped_column(Integer, default=6)
    storage_location: Mapped[str | None] = mapped_column(String(100))


# ════════════════════════════════════════════════════════════════
# MIGRATION 067 — REMAINING EQUIPMENT SPECIALIZATIONS
# ════════════════════════════════════════════════════════════════


class ProcessColumn(Base):
    __tablename__ = "ar_process_columns"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    column_type: Mapped[str] = mapped_column(String(30), nullable=False)
    service_description: Mapped[str | None] = mapped_column(String(200))
    shell_id_bottom_mm: Mapped[Decimal] = mapped_column(Numeric(9, 2), nullable=False)
    tan_to_tan_mm: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    design_temp_max_c: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False)
    shell_material: Mapped[str | None] = mapped_column(String(100))
    design_code: Mapped[str | None] = mapped_column(String(50))
    notes: Mapped[str | None] = mapped_column(Text)


class ColumnSection(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "ar_column_sections"
    __table_args__ = (UniqueConstraint("column_id", "section_number", name="uq_ar_column_sections_num"),)
    column_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_process_columns.id", ondelete="CASCADE"), nullable=False)
    section_number: Mapped[int] = mapped_column(Integer, nullable=False)
    section_name: Mapped[str | None] = mapped_column(String(50))
    internals_type: Mapped[str] = mapped_column(String(30), nullable=False)
    tray_count: Mapped[int | None] = mapped_column(Integer)
    packing_type: Mapped[str | None] = mapped_column(String(50))
    packing_height_m: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    notes: Mapped[str | None] = mapped_column(Text)


class PressureSafetyValve(Base):
    __tablename__ = "ar_pressure_safety_valves"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    psv_type: Mapped[str] = mapped_column(String(30), nullable=False)
    service_type: Mapped[str | None] = mapped_column(String(30))
    protected_equipment_tag: Mapped[str | None] = mapped_column(String(50))
    set_pressure_barg: Mapped[Decimal] = mapped_column(Numeric(9, 3), nullable=False)
    body_material: Mapped[str | None] = mapped_column(String(50))
    design_standard: Mapped[str | None] = mapped_column(String(20))
    test_interval_months: Mapped[int | None] = mapped_column(Integer)


class RuptureDisk(Base):
    __tablename__ = "ar_rupture_disks"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    disk_type: Mapped[str | None] = mapped_column(String(30))
    protected_equipment_tag: Mapped[str | None] = mapped_column(String(50))
    burst_pressure_barg: Mapped[Decimal] = mapped_column(Numeric(9, 3), nullable=False)
    disk_material: Mapped[str | None] = mapped_column(String(50))
    replacement_interval_months: Mapped[int | None] = mapped_column(Integer, default=24)
    design_standard: Mapped[str | None] = mapped_column(String(20))


class FiredHeater(Base):
    __tablename__ = "ar_fired_heaters"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    heater_type: Mapped[str] = mapped_column(String(20), nullable=False)
    service_description: Mapped[str | None] = mapped_column(String(200))
    duty_kw: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    fuel_type: Mapped[str | None] = mapped_column(String(20))
    design_code: Mapped[str | None] = mapped_column(String(20))


class FanBlower(Base):
    __tablename__ = "ar_fans_blowers"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    fan_type: Mapped[str] = mapped_column(String(30), nullable=False)
    flow_rate_m3h: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    motor_power_kw: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False)
    design_code: Mapped[str | None] = mapped_column(String(20))


class SteamTurbine(Base):
    __tablename__ = "ar_steam_turbines"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    turbine_type: Mapped[str] = mapped_column(String(30), nullable=False)
    inlet_steam_pressure_barg: Mapped[Decimal] = mapped_column(Numeric(8, 3), nullable=False)
    inlet_steam_temp_c: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False)
    shaft_power_kw: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    design_code: Mapped[str | None] = mapped_column(String(20))


class Turboexpander(Base):
    __tablename__ = "ar_turboexpanders"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    service_description: Mapped[str | None] = mapped_column(String(200))
    inlet_pressure_barg: Mapped[Decimal] = mapped_column(Numeric(9, 3), nullable=False)
    inlet_temp_c: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False)
    outlet_pressure_barg: Mapped[Decimal] = mapped_column(Numeric(9, 3), nullable=False)
    shaft_power_kw: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    design_code: Mapped[str | None] = mapped_column(String(20))


class AirCompressorPackage(Base):
    __tablename__ = "ar_air_compressor_packages"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    compressor_type: Mapped[str] = mapped_column(String(30), nullable=False)
    service: Mapped[str | None] = mapped_column(String(20))
    is_oil_free: Mapped[bool] = mapped_column(Boolean, default=True)
    flow_nm3h: Mapped[Decimal] = mapped_column(Numeric(8, 3), nullable=False)
    discharge_pressure_barg: Mapped[Decimal] = mapped_column(Numeric(7, 3), nullable=False)
    design_code: Mapped[str | None] = mapped_column(String(20))


class NitrogenUnit(Base):
    __tablename__ = "ar_nitrogen_units"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    n2_type: Mapped[str] = mapped_column(String(20), nullable=False)
    n2_flow_nm3h: Mapped[Decimal] = mapped_column(Numeric(8, 3), nullable=False)
    n2_purity_pct: Mapped[Decimal] = mapped_column(Numeric(7, 5), nullable=False)
    outlet_pressure_barg: Mapped[Decimal] = mapped_column(Numeric(7, 3), nullable=False)


class FiscalMeteringSkid(Base):
    __tablename__ = "ar_fiscal_metering_skids"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    metering_type: Mapped[str] = mapped_column(String(25), nullable=False)
    service: Mapped[str] = mapped_column(String(30), nullable=False)
    custody_transfer: Mapped[bool] = mapped_column(Boolean, default=True)
    design_flow_m3h: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    uncertainty_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))


class ChemicalInjectionSkid(Base):
    __tablename__ = "ar_chemical_injection_skids"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    chemical_type: Mapped[str] = mapped_column(String(30), nullable=False)
    chemical_name: Mapped[str | None] = mapped_column(String(100))
    storage_tank_volume_l: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    pump_type: Mapped[str | None] = mapped_column(String(20))
    flow_rate_design_lph: Mapped[Decimal | None] = mapped_column(Numeric(8, 4))
    discharge_pressure_barg: Mapped[Decimal | None] = mapped_column(Numeric(7, 3))


class GasDehydrationUnit(Base):
    __tablename__ = "ar_gas_dehydration_units"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    dehydration_type: Mapped[str] = mapped_column(String(20), nullable=False)
    service: Mapped[str | None] = mapped_column(String(100))
    inlet_flow_mmscfd: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    inlet_pressure_barg: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))
    outlet_dewpoint_c: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    design_code: Mapped[str | None] = mapped_column(String(30))


class ProducedWaterTreatmentUnit(Base):
    __tablename__ = "ar_produced_water_treatment_units"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    treatment_type: Mapped[str] = mapped_column(String(25), nullable=False)
    service: Mapped[str | None] = mapped_column(String(30))
    inlet_flow_m3h: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    outlet_oiw_spec_ppm: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))
    design_code: Mapped[str | None] = mapped_column(String(30))


class FireGasSystem(Base):
    __tablename__ = "ar_fire_gas_systems"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    system_name: Mapped[str | None] = mapped_column(String(100))
    system_standard: Mapped[str | None] = mapped_column(String(30))
    is_sil_rated: Mapped[bool] = mapped_column(Boolean, default=False)
    sil_level: Mapped[str | None] = mapped_column(String(5))
    total_fire_detectors: Mapped[int | None] = mapped_column(Integer)
    total_gas_detectors: Mapped[int | None] = mapped_column(Integer)
    design_code: Mapped[str | None] = mapped_column(String(30))


class HPUUnit(Base):
    __tablename__ = "ar_hpu_units"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    service: Mapped[str | None] = mapped_column(String(100))
    is_subsea_control: Mapped[bool] = mapped_column(Boolean, default=False)
    system_pressure_barg: Mapped[Decimal] = mapped_column(Numeric(8, 3), nullable=False)
    pump_count: Mapped[int] = mapped_column(Integer, default=2)
    reservoir_volume_l: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    design_code: Mapped[str | None] = mapped_column(String(20))


class HVACUnit(Base):
    __tablename__ = "ar_hvac_units"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    hvac_type: Mapped[str] = mapped_column(String(25), nullable=False)
    served_area: Mapped[str | None] = mapped_column(String(200))
    cooling_capacity_kw: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    heating_capacity_kw: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    total_power_kw: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    design_code: Mapped[str | None] = mapped_column(String(20))


class UPSSystem(Base):
    __tablename__ = "ar_ups_systems"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    ups_type: Mapped[str] = mapped_column(String(30), nullable=False)
    critical_load_served: Mapped[str | None] = mapped_column(String(200))
    rated_power_kva: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    battery_type: Mapped[str | None] = mapped_column(String(20))
    backup_time_min_at_full_load: Mapped[int | None] = mapped_column(Integer)
    design_code: Mapped[str | None] = mapped_column(String(30))


class TelecomSystem(Base):
    __tablename__ = "ar_telecom_systems"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    telecom_type: Mapped[str] = mapped_column(String(20), nullable=False)
    is_safety_critical: Mapped[bool] = mapped_column(Boolean, default=False)
    system_description: Mapped[str | None] = mapped_column(String(200))
    coverage_area: Mapped[str | None] = mapped_column(String(200))


class Switchgear(Base):
    __tablename__ = "ar_switchgear"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    switchgear_type: Mapped[str | None] = mapped_column(String(15))
    voltage_class: Mapped[str | None] = mapped_column(String(10))
    rated_voltage_v: Mapped[Decimal] = mapped_column(Numeric(9, 2), nullable=False)
    rated_current_a: Mapped[Decimal | None] = mapped_column(Numeric(9, 2))
    design_code: Mapped[str | None] = mapped_column(String(20))


class MotorControlCenter(Base):
    __tablename__ = "ar_motor_control_centers"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    voltage_v: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    frequency_hz: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=50)
    number_of_modules: Mapped[int | None] = mapped_column(Integer)
    design_code: Mapped[str | None] = mapped_column(String(20))


class Manifold(Base):
    __tablename__ = "ar_manifolds"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    manifold_type: Mapped[str | None] = mapped_column(String(20))
    number_of_inlets: Mapped[int | None] = mapped_column(Integer)
    number_of_outlets: Mapped[int | None] = mapped_column(Integer)
    header_size_in: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    design_pressure_barg: Mapped[Decimal] = mapped_column(Numeric(9, 3), nullable=False)
    is_subsea: Mapped[bool] = mapped_column(Boolean, default=False)
    design_code: Mapped[str | None] = mapped_column(String(20))


class PigStation(Base):
    __tablename__ = "ar_pig_stations"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    station_type: Mapped[str] = mapped_column(String(15), nullable=False)
    pipeline_tag: Mapped[str | None] = mapped_column(String(50))
    barrel_id_in: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False)
    design_pressure_barg: Mapped[Decimal] = mapped_column(Numeric(9, 3), nullable=False)
    design_code: Mapped[str | None] = mapped_column(String(20))


class DownholeCompletion(Base):
    __tablename__ = "ar_downhole_completions"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    well_tag: Mapped[str] = mapped_column(String(50), nullable=False)
    well_name: Mapped[str | None] = mapped_column(String(100))
    completion_type: Mapped[str | None] = mapped_column(String(20))
    completion_date: Mapped[date | None] = mapped_column(Date)
    tubing_od_in: Mapped[Decimal | None] = mapped_column(Numeric(5, 3))
    tubing_string_depth_m: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    notes: Mapped[str | None] = mapped_column(Text)
    gas_lift_mandrels: Mapped[list["GasLiftMandrel"]] = relationship(back_populates="completion", cascade="all, delete-orphan")
    esp_assemblies: Mapped[list["ESPAssembly"]] = relationship(back_populates="completion", cascade="all, delete-orphan")


class GasLiftMandrel(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "ar_gas_lift_mandrels"
    __table_args__ = (UniqueConstraint("completion_id", "mandrel_number", name="uq_ar_gas_lift_mandrels_num"),)
    completion_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_downhole_completions.id", ondelete="CASCADE"), nullable=False)
    mandrel_number: Mapped[int] = mapped_column(Integer, nullable=False)
    mandrel_depth_md_m: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    valve_type: Mapped[str | None] = mapped_column(String(10))
    dome_pressure_psig: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    completion: Mapped["DownholeCompletion"] = relationship(back_populates="gas_lift_mandrels")


class ESPAssembly(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "ar_esp_assemblies"
    completion_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_downhole_completions.id", ondelete="CASCADE"), nullable=False)
    pump_manufacturer: Mapped[str | None] = mapped_column(String(50))
    pump_model: Mapped[str | None] = mapped_column(String(50))
    pump_stages: Mapped[int | None] = mapped_column(Integer)
    pump_setting_depth_md_m: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    motor_rated_power_kw: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    installation_date: Mapped[date | None] = mapped_column(Date)
    completion: Mapped["DownholeCompletion"] = relationship(back_populates="esp_assemblies")


class SubseaChristmasTree(Base):
    __tablename__ = "ar_subsea_christmas_trees"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    well_tag: Mapped[str | None] = mapped_column(String(50))
    xt_type: Mapped[str | None] = mapped_column(String(20))
    xt_pressure_rating_psi: Mapped[Decimal | None] = mapped_column(Numeric(9, 2))
    water_depth_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    design_life_years: Mapped[int | None] = mapped_column(Integer)


class SubseaUmbilical(Base):
    __tablename__ = "ar_subsea_umbilicals"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    umbilical_type: Mapped[str | None] = mapped_column(String(20))
    function: Mapped[str | None] = mapped_column(String(20))
    installed_length_m: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    water_depth_max_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    design_life_years: Mapped[int | None] = mapped_column(Integer)


class SubseaPlemPlet(Base):
    __tablename__ = "ar_subsea_plem_plet"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    structure_type: Mapped[str | None] = mapped_column(String(5))
    water_depth_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    design_pressure_barg: Mapped[Decimal | None] = mapped_column(Numeric(9, 3))
    pipeline_size_in: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))


class Riser(Base):
    __tablename__ = "ar_risers"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    riser_type: Mapped[str | None] = mapped_column(String(20))
    service: Mapped[str | None] = mapped_column(String(30))
    installed_length_m: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    nominal_od_in: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    design_pressure_barg: Mapped[Decimal | None] = mapped_column(Numeric(9, 3))
    design_life_years: Mapped[int | None] = mapped_column(Integer)


class SubseaControlSystem(Base):
    __tablename__ = "ar_subsea_control_systems"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    system_type: Mapped[str | None] = mapped_column(String(15))
    manufacturer: Mapped[str | None] = mapped_column(String(50))
    number_of_wells_controlled: Mapped[int | None] = mapped_column(Integer)


class MarineLoadingArm(Base):
    __tablename__ = "ar_marine_loading_arms"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    mla_type: Mapped[str | None] = mapped_column(String(25))
    service: Mapped[str | None] = mapped_column(String(30))
    rated_flow_m3h: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    arm_size_in: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    design_pressure_barg: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))
    design_code: Mapped[str | None] = mapped_column(String(20))


class MooringSystem(Base):
    __tablename__ = "ar_mooring_systems"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    system_type: Mapped[str | None] = mapped_column(String(20))
    water_depth_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    number_of_lines: Mapped[int | None] = mapped_column(Integer)
    design_standard: Mapped[str | None] = mapped_column(String(30))


class SurvivalCraft(Base):
    __tablename__ = "ar_survival_craft"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    craft_type: Mapped[str] = mapped_column(String(30), nullable=False)
    purpose: Mapped[str | None] = mapped_column(String(15))
    person_capacity: Mapped[int | None] = mapped_column(Integer)
    solas_compliant: Mapped[bool] = mapped_column(Boolean, default=True)


class CathodicProtectionSystem(Base):
    __tablename__ = "ar_cathodic_protection_systems"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    cp_type: Mapped[str] = mapped_column(String(20), nullable=False)
    protected_structure_tag: Mapped[str | None] = mapped_column(String(50))
    design_life_years: Mapped[int] = mapped_column(Integer, nullable=False)
    anode_material: Mapped[str | None] = mapped_column(String(25))
    design_standard: Mapped[str | None] = mapped_column(String(30))


class Building(Base):
    __tablename__ = "ar_buildings"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    building_type: Mapped[str] = mapped_column(String(25), nullable=False)
    floor_area_m2: Mapped[Decimal | None] = mapped_column(Numeric(9, 2))
    floor_count: Mapped[int] = mapped_column(Integer, default=1)
    is_blast_resistant: Mapped[bool] = mapped_column(Boolean, default=False)
    is_fire_rated: Mapped[bool] = mapped_column(Boolean, default=False)


class StructuralElement(Base):
    __tablename__ = "ar_structural_elements"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    structural_type: Mapped[str] = mapped_column(String(25), nullable=False)
    parent_structure_tag: Mapped[str | None] = mapped_column(String(50))
    material: Mapped[str | None] = mapped_column(String(30))
    design_standard: Mapped[str | None] = mapped_column(String(30))
    weight_tonnes: Mapped[Decimal | None] = mapped_column(Numeric(9, 2))


class PotableWaterSystem(Base):
    __tablename__ = "ar_potable_water_systems"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    production_type: Mapped[str | None] = mapped_column(String(20))
    capacity_m3d: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))
    storage_capacity_m3: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))


class SewageTreatmentSystem(Base):
    __tablename__ = "ar_sewage_treatment_systems"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    system_type: Mapped[str | None] = mapped_column(String(25))
    capacity_m3d: Mapped[Decimal | None] = mapped_column(Numeric(7, 3))
    marpol_compliant: Mapped[bool] = mapped_column(Boolean, default=True)


class CoolingWaterSystem(Base):
    __tablename__ = "ar_cooling_water_systems"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    system_type: Mapped[str | None] = mapped_column(String(20))
    cooling_medium: Mapped[str | None] = mapped_column(String(20))
    total_flow_m3h: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))


class DrainageSystem(Base):
    __tablename__ = "ar_drainage_systems"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    system_type: Mapped[str | None] = mapped_column(String(20))
    service_area: Mapped[str | None] = mapped_column(String(200))
    design_capacity_m3h: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))
    design_code: Mapped[str | None] = mapped_column(String(20))


class ProcessFilter(Base):
    __tablename__ = "ar_process_filters"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_equipment.id", ondelete="CASCADE"), primary_key=True)
    filter_type: Mapped[str] = mapped_column(String(25), nullable=False)
    service_description: Mapped[str | None] = mapped_column(String(200))
    design_pressure_barg: Mapped[Decimal] = mapped_column(Numeric(9, 3), nullable=False)
    design_flow_m3h: Mapped[Decimal | None] = mapped_column(Numeric(9, 3))
    filtration_rating_micron: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))
    design_code: Mapped[str | None] = mapped_column(String(20))


class SeparatorDesalterDetails(Base):
    __tablename__ = "ar_separator_desalter_details"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_separators.id", ondelete="CASCADE"), primary_key=True)
    electric_field_type: Mapped[str | None] = mapped_column(String(10))
    electrode_voltage_kv: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))
    number_of_stages: Mapped[int] = mapped_column(Integer, default=1)
    desalting_efficiency_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))


# ── Installation subtypes ────────────────────────────────────

class InstallationWellPad(Base):
    __tablename__ = "ar_installation_well_pad"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_installations.id", ondelete="CASCADE"), primary_key=True)
    total_well_slots: Mapped[int | None] = mapped_column(Integer)
    active_well_slots: Mapped[int | None] = mapped_column(Integer)
    well_spacing_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))


class InstallationTerminal(Base):
    __tablename__ = "ar_installation_terminal"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_installations.id", ondelete="CASCADE"), primary_key=True)
    throughput_capacity_bopd: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    number_of_trains: Mapped[int | None] = mapped_column(Integer)
    export_method: Mapped[str | None] = mapped_column(String(30))


class InstallationTankFarm(Base):
    __tablename__ = "ar_installation_tank_farm"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_installations.id", ondelete="CASCADE"), primary_key=True)
    total_number_of_tanks: Mapped[int | None] = mapped_column(Integer)
    total_storage_capacity_m3: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    api_standard: Mapped[str | None] = mapped_column(String(10))


class InstallationJacketPlatform(Base):
    __tablename__ = "ar_installation_jacket_platform"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_installations.id", ondelete="CASCADE"), primary_key=True)
    platform_function: Mapped[str | None] = mapped_column(String(30))
    has_wellbay: Mapped[bool] = mapped_column(Boolean, default=False)
    wellbay_slot_count: Mapped[int | None] = mapped_column(Integer)
    bridge_connected_to: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_installations.id"))


class InstallationBuoy(Base):
    __tablename__ = "ar_installation_buoy"
    id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ar_installations.id", ondelete="CASCADE"), primary_key=True)
    buoy_type: Mapped[str | None] = mapped_column(String(20))
    design_tonnage_dwt: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    max_flow_rate_bph: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
