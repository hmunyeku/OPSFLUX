"""TravelWiz Pydantic schemas — request/response models for transport logistics."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import OpsFluxSchema


# ─── Transport Vectors ──────────────────────────────────────────────────────


class VectorCreate(BaseModel):
    registration: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=200)
    type: str = Field(..., pattern=r"^(helicopter|ship|bus|surfer|barge|commercial_flight|vehicle)$")
    mode: str = Field(..., pattern=r"^(air|sea|road)$")
    pax_capacity: int = Field(default=0, ge=0)
    weight_capacity_kg: float | None = None
    volume_capacity_m3: float | None = None
    home_base_id: UUID | None = None
    requires_weighing: bool = False
    mmsi_number: str | None = Field(None, max_length=20)


class VectorUpdate(BaseModel):
    registration: str | None = None
    name: str | None = None
    type: str | None = None
    mode: str | None = None
    pax_capacity: int | None = None
    weight_capacity_kg: float | None = None
    volume_capacity_m3: float | None = None
    home_base_id: UUID | None = None
    requires_weighing: bool | None = None
    mmsi_number: str | None = None
    active: bool | None = None


class VectorRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    registration: str
    name: str
    type: str
    mode: str
    pax_capacity: int
    weight_capacity_kg: float | None = None
    volume_capacity_m3: float | None = None
    home_base_id: UUID | None = None
    requires_weighing: bool
    mmsi_number: str | None = None
    active: bool
    created_at: datetime
    # Enriched
    home_base_name: str | None = None
    zone_count: int = 0
    voyage_count: int = 0


# ─── Transport Vector Zones ─────────────────────────────────────────────────


class VectorZoneCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    zone_type: str = Field(..., pattern=r"^(main_deck|rear_deck|hold|cabin)$")
    max_weight_kg: float | None = None
    width_m: float | None = None
    length_m: float | None = None
    exclusion_zones: list[dict[str, Any]] | None = None


class VectorZoneUpdate(BaseModel):
    name: str | None = None
    zone_type: str | None = None
    max_weight_kg: float | None = None
    width_m: float | None = None
    length_m: float | None = None
    exclusion_zones: list[dict[str, Any]] | None = None
    active: bool | None = None


class VectorZoneRead(OpsFluxSchema):
    id: UUID
    vector_id: UUID
    name: str
    zone_type: str
    max_weight_kg: float | None = None
    width_m: float | None = None
    length_m: float | None = None
    exclusion_zones: list[dict[str, Any]] | None = None
    active: bool
    created_at: datetime


# ─── Transport Rotations ────────────────────────────────────────────────────


class RotationCreate(BaseModel):
    vector_id: UUID
    name: str = Field(..., min_length=1, max_length=200)
    departure_base_id: UUID
    schedule_cron: str | None = Field(None, max_length=100)
    schedule_description: str | None = Field(None, max_length=300)


class RotationUpdate(BaseModel):
    vector_id: UUID | None = None
    name: str | None = None
    departure_base_id: UUID | None = None
    schedule_cron: str | None = None
    schedule_description: str | None = None
    active: bool | None = None


class RotationRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    vector_id: UUID
    name: str
    departure_base_id: UUID
    schedule_cron: str | None = None
    schedule_description: str | None = None
    active: bool
    created_at: datetime
    # Enriched
    vector_name: str | None = None
    departure_base_name: str | None = None


# ─── Voyages ────────────────────────────────────────────────────────────────


class VoyageCreate(BaseModel):
    vector_id: UUID
    departure_base_id: UUID
    scheduled_departure: datetime
    scheduled_arrival: datetime | None = None
    rotation_id: UUID | None = None


class VoyageUpdate(BaseModel):
    vector_id: UUID | None = None
    departure_base_id: UUID | None = None
    scheduled_departure: datetime | None = None
    scheduled_arrival: datetime | None = None
    rotation_id: UUID | None = None


class VoyageStatusUpdate(BaseModel):
    status: str = Field(..., pattern=r"^(planned|confirmed|boarding|departed|arrived|closed|delayed|cancelled)$")
    delay_reason: str | None = None
    actual_departure: datetime | None = None
    actual_arrival: datetime | None = None


class VoyageReassignRequest(BaseModel):
    target_voyage_id: UUID


class VoyageRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    vector_id: UUID
    code: str
    status: str
    departure_base_id: UUID
    scheduled_departure: datetime
    scheduled_arrival: datetime | None = None
    actual_departure: datetime | None = None
    actual_arrival: datetime | None = None
    delay_reason: str | None = None
    rotation_id: UUID | None = None
    created_by: UUID
    active: bool
    created_at: datetime
    # Enriched
    vector_name: str | None = None
    vector_type: str | None = None
    departure_base_name: str | None = None
    stop_count: int = 0
    pax_count: int = 0
    cargo_count: int = 0


# ─── Voyage Stops ───────────────────────────────────────────────────────────


class VoyageStopCreate(BaseModel):
    asset_id: UUID
    stop_order: int = Field(..., ge=1)
    scheduled_arrival: datetime | None = None


class VoyageStopUpdate(BaseModel):
    asset_id: UUID | None = None
    stop_order: int | None = None
    scheduled_arrival: datetime | None = None
    actual_arrival: datetime | None = None
    active: bool | None = None


class VoyageStopRead(OpsFluxSchema):
    id: UUID
    voyage_id: UUID
    asset_id: UUID
    stop_order: int
    scheduled_arrival: datetime | None = None
    actual_arrival: datetime | None = None
    active: bool
    # Enriched
    asset_name: str | None = None


# ─── Voyage Manifests ───────────────────────────────────────────────────────


class ManifestCreate(BaseModel):
    manifest_type: str = Field(default="pax", pattern=r"^(pax|cargo)$")


class ManifestRead(OpsFluxSchema):
    id: UUID
    voyage_id: UUID
    manifest_type: str
    status: str
    validated_by: UUID | None = None
    validated_at: datetime | None = None
    active: bool
    created_at: datetime
    # Enriched
    passenger_count: int = 0
    cargo_count: int = 0
    validated_by_name: str | None = None


# ─── Manifest Passengers ────────────────────────────────────────────────────


class PassengerCreate(BaseModel):
    pax_profile_id: UUID | None = None
    name: str = Field(..., min_length=1, max_length=200)
    company: str | None = Field(None, max_length=200)
    destination_stop_id: UUID | None = None
    declared_weight_kg: float | None = None
    priority_score: int = 0
    standby: bool = False


class PassengerUpdate(BaseModel):
    name: str | None = None
    company: str | None = None
    destination_stop_id: UUID | None = None
    declared_weight_kg: float | None = None
    actual_weight_kg: float | None = None
    boarding_status: str | None = None
    priority_score: int | None = None
    standby: bool | None = None


class PassengerRead(OpsFluxSchema):
    id: UUID
    manifest_id: UUID
    pax_profile_id: UUID | None = None
    name: str
    company: str | None = None
    destination_stop_id: UUID | None = None
    declared_weight_kg: float | None = None
    actual_weight_kg: float | None = None
    boarding_status: str
    boarded_at: datetime | None = None
    priority_score: int
    standby: bool
    active: bool
    created_at: datetime


# ─── Cargo Items ────────────────────────────────────────────────────────────


class CargoCreate(BaseModel):
    description: str = Field(..., min_length=1, max_length=500)
    cargo_type: str = Field(..., pattern=r"^(unit|bulk|consumable|packaging|waste|hazmat)$")
    weight_kg: float = Field(..., gt=0)
    width_cm: float | None = None
    length_cm: float | None = None
    height_cm: float | None = None
    sender_tier_id: UUID | None = None
    receiver_name: str | None = Field(None, max_length=200)
    destination_asset_id: UUID | None = None
    project_id: UUID | None = None
    manifest_id: UUID | None = None
    sap_article_code: str | None = Field(None, max_length=50)
    hazmat_validated: bool = False


class CargoUpdate(BaseModel):
    description: str | None = None
    cargo_type: str | None = None
    weight_kg: float | None = None
    width_cm: float | None = None
    length_cm: float | None = None
    height_cm: float | None = None
    sender_tier_id: UUID | None = None
    receiver_name: str | None = None
    destination_asset_id: UUID | None = None
    project_id: UUID | None = None
    manifest_id: UUID | None = None
    sap_article_code: str | None = None
    hazmat_validated: bool | None = None


class CargoStatusUpdate(BaseModel):
    status: str = Field(
        ...,
        pattern=r"^(registered|ready|loaded|in_transit|delivered_intermediate|delivered_final|damaged|missing)$",
    )
    damage_notes: str | None = None


class CargoRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    tracking_code: str
    description: str
    cargo_type: str
    weight_kg: float
    width_cm: float | None = None
    length_cm: float | None = None
    height_cm: float | None = None
    sender_tier_id: UUID | None = None
    receiver_name: str | None = None
    destination_asset_id: UUID | None = None
    project_id: UUID | None = None
    status: str
    manifest_id: UUID | None = None
    sap_article_code: str | None = None
    hazmat_validated: bool
    received_by: UUID | None = None
    received_at: datetime | None = None
    damage_notes: str | None = None
    registered_by: UUID
    active: bool
    created_at: datetime
    # Enriched
    sender_name: str | None = None
    destination_name: str | None = None


# ─── Captain Logs ───────────────────────────────────────────────────────────


class CaptainLogCreate(BaseModel):
    event_type: str = Field(
        ...,
        pattern=r"^(departure|arrival|weather|technical|fuel|safety|incident)$",
    )
    timestamp: datetime
    description: str = Field(..., min_length=1)
    weather_conditions: dict[str, Any] | None = None
    fuel_consumption_liters: float | None = None
    created_by_name: str | None = Field(None, max_length=200)


class CaptainLogRead(OpsFluxSchema):
    id: UUID
    voyage_id: UUID
    event_type: str
    timestamp: datetime
    description: str
    weather_conditions: dict[str, Any] | None = None
    fuel_consumption_liters: float | None = None
    created_by_name: str | None = None
    active: bool


# ─── Vector Positions ───────────────────────────────────────────────────────


class VectorPositionRead(OpsFluxSchema):
    id: UUID
    vector_id: UUID
    latitude: float
    longitude: float
    source: str
    recorded_at: datetime
    speed_knots: float | None = None


# ─── Capacity Check ─────────────────────────────────────────────────────────


class CapacityCheckResult(BaseModel):
    vector_id: UUID
    vector_name: str
    pax_capacity: int
    current_pax: int
    remaining_pax: int
    weight_capacity_kg: float | None = None
    current_weight_kg: float
    remaining_weight_kg: float | None = None
    weight_alert_ratio: float | None = None
    weight_alert_threshold_kg: float | None = None
    weight_alert_reached: bool = False
    weight_blocked: bool = False
    is_over_capacity: bool
