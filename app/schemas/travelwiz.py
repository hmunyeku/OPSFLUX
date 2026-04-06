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


class BackCargoReturnRequest(BaseModel):
    return_type: str = Field(
        ...,
        pattern=r"^(waste|contractor_return|stock_reintegration|scrap|yard_storage)$",
    )
    notes: str | None = None
    waste_manifest_ref: str | None = None
    pass_number: str | None = None
    inventory_reference: str | None = None
    sap_code_confirmed: bool = False
    photo_evidence_count: int = Field(default=0, ge=0)
    double_signature_confirmed: bool = False
    yard_justification: str | None = None


class PickupStopInput(BaseModel):
    asset_id: UUID
    pickup_order: int = Field(..., ge=1)
    scheduled_time: datetime | None = None
    pax_expected: int = Field(default=0, ge=0)
    manifest_passenger_ids: list[UUID] = Field(default_factory=list)


class PickupRoundCreate(BaseModel):
    trip_id: UUID
    route_name: str = Field(..., min_length=1, max_length=200)
    scheduled_departure: datetime
    driver_name: str | None = Field(default=None, max_length=200)
    driver_phone: str | None = Field(default=None, max_length=50)
    vehicle_registration: str | None = Field(default=None, max_length=100)
    notes: str | None = None
    stops: list[PickupStopInput] = Field(default_factory=list)


class PickupProgressUpdate(BaseModel):
    pax_picked_up: int = Field(default=0, ge=0)
    notes: str | None = None


class PickupNoShowReport(BaseModel):
    missing_pax_count: int = Field(default=1, ge=1)
    notes: str | None = None


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
    request_id: UUID | None = None
    description: str = Field(..., min_length=1, max_length=500)
    designation: str | None = Field(None, max_length=255)
    cargo_type: str = Field(..., pattern=r"^(unit|bulk|consumable|packaging|waste|hazmat)$")
    weight_kg: float = Field(..., gt=0)
    width_cm: float | None = None
    length_cm: float | None = None
    height_cm: float | None = None
    surface_m2: float | None = Field(None, ge=0)
    package_count: int = Field(default=1, ge=1)
    stackable: bool = False
    sender_tier_id: UUID | None = None
    receiver_name: str | None = Field(None, max_length=200)
    destination_asset_id: UUID | None = None
    project_id: UUID | None = None
    imputation_reference_id: UUID | None = None
    ownership_type: str | None = Field(None, pattern=r"^(rental|purchased|customer|internal)$")
    pickup_location_label: str | None = Field(None, max_length=255)
    pickup_latitude: float | None = None
    pickup_longitude: float | None = None
    requester_name: str | None = Field(None, max_length=200)
    document_prepared_at: datetime | None = None
    available_from: datetime | None = None
    pickup_contact_user_id: UUID | None = None
    pickup_contact_tier_contact_id: UUID | None = None
    pickup_contact_name: str | None = Field(None, max_length=200)
    pickup_contact_phone: str | None = Field(None, max_length=80)
    lifting_provider: str | None = Field(None, max_length=200)
    lifting_points_certified: bool = False
    weight_ticket_provided: bool = False
    photo_evidence_count: int = Field(default=0, ge=0)
    document_attachment_count: int = Field(default=0, ge=0)
    manifest_id: UUID | None = None
    sap_article_code: str | None = Field(None, max_length=50)
    hazmat_validated: bool = False


class CargoUpdate(BaseModel):
    request_id: UUID | None = None
    description: str | None = None
    designation: str | None = None
    cargo_type: str | None = None
    weight_kg: float | None = None
    width_cm: float | None = None
    length_cm: float | None = None
    height_cm: float | None = None
    surface_m2: float | None = None
    package_count: int | None = Field(None, ge=1)
    stackable: bool | None = None
    sender_tier_id: UUID | None = None
    receiver_name: str | None = None
    destination_asset_id: UUID | None = None
    project_id: UUID | None = None
    imputation_reference_id: UUID | None = None
    ownership_type: str | None = None
    pickup_location_label: str | None = None
    pickup_latitude: float | None = None
    pickup_longitude: float | None = None
    requester_name: str | None = None
    document_prepared_at: datetime | None = None
    available_from: datetime | None = None
    pickup_contact_user_id: UUID | None = None
    pickup_contact_tier_contact_id: UUID | None = None
    pickup_contact_name: str | None = None
    pickup_contact_phone: str | None = None
    lifting_provider: str | None = None
    lifting_points_certified: bool | None = None
    weight_ticket_provided: bool | None = None
    photo_evidence_count: int | None = Field(None, ge=0)
    document_attachment_count: int | None = Field(None, ge=0)
    manifest_id: UUID | None = None
    sap_article_code: str | None = None
    hazmat_validated: bool | None = None


class CargoWorkflowStatusUpdate(BaseModel):
    workflow_status: str = Field(
        ...,
        pattern=r"^(draft|prepared|ready_for_review|approved|rejected|assigned|in_transit|delivered|cancelled)$",
    )


class CargoStatusUpdate(BaseModel):
    status: str = Field(
        ...,
        pattern=r"^(registered|ready|loaded|in_transit|delivered_intermediate|delivered_final|damaged|missing)$",
    )
    damage_notes: str | None = None


class CargoRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    request_id: UUID | None = None
    tracking_code: str
    description: str
    designation: str | None = None
    cargo_type: str
    workflow_status: str
    weight_kg: float
    width_cm: float | None = None
    length_cm: float | None = None
    height_cm: float | None = None
    surface_m2: float | None = None
    package_count: int
    stackable: bool
    sender_tier_id: UUID | None = None
    receiver_name: str | None = None
    destination_asset_id: UUID | None = None
    project_id: UUID | None = None
    imputation_reference_id: UUID | None = None
    ownership_type: str | None = None
    pickup_location_label: str | None = None
    pickup_latitude: float | None = None
    pickup_longitude: float | None = None
    requester_name: str | None = None
    document_prepared_at: datetime | None = None
    available_from: datetime | None = None
    pickup_contact_user_id: UUID | None = None
    pickup_contact_tier_contact_id: UUID | None = None
    pickup_contact_name: str | None = None
    pickup_contact_phone: str | None = None
    lifting_provider: str | None = None
    lifting_points_certified: bool
    weight_ticket_provided: bool
    photo_evidence_count: int
    document_attachment_count: int
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
    imputation_reference_code: str | None = None
    imputation_reference_name: str | None = None
    pickup_contact_display_name: str | None = None
    request_code: str | None = None
    request_title: str | None = None


class CargoRequestCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    project_id: UUID | None = None
    imputation_reference_id: UUID | None = None
    sender_tier_id: UUID | None = None
    receiver_name: str | None = Field(None, max_length=200)
    destination_asset_id: UUID | None = None
    requester_name: str | None = Field(None, max_length=200)


class CargoRequestUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    status: str | None = Field(None, pattern=r"^(draft|submitted|approved|assigned|in_progress|closed|cancelled)$")
    project_id: UUID | None = None
    imputation_reference_id: UUID | None = None
    sender_tier_id: UUID | None = None
    receiver_name: str | None = None
    destination_asset_id: UUID | None = None
    requester_name: str | None = None


class CargoRequestRead(OpsFluxSchema):
    id: UUID
    entity_id: UUID
    request_code: str
    title: str
    description: str | None = None
    status: str
    project_id: UUID | None = None
    imputation_reference_id: UUID | None = None
    sender_tier_id: UUID | None = None
    receiver_name: str | None = None
    destination_asset_id: UUID | None = None
    requester_name: str | None = None
    requested_by: UUID
    active: bool
    created_at: datetime
    cargo_count: int = 0
    sender_name: str | None = None
    destination_name: str | None = None
    imputation_reference_code: str | None = None
    imputation_reference_name: str | None = None


class CargoAttachmentEvidenceUpdate(BaseModel):
    evidence_type: str = Field(
        ...,
        pattern=r"^(cargo_photo|weight_ticket|lifting_certificate|transport_document|hazmat_document|delivery_proof|other)$",
    )


class CargoAttachmentEvidenceRead(OpsFluxSchema):
    attachment_id: UUID
    evidence_type: str
    original_name: str
    content_type: str
    created_at: datetime


class CargoTrackingEventRead(BaseModel):
    code: str
    label: str
    occurred_at: datetime
    description: str | None = None


class CargoTrackingRead(BaseModel):
    tracking_code: str
    description: str
    cargo_type: str
    status: str
    status_label: str
    weight_kg: float
    width_cm: float | None = None
    length_cm: float | None = None
    height_cm: float | None = None
    sender_name: str | None = None
    receiver_name: str | None = None
    destination_name: str | None = None
    voyage_code: str | None = None
    received_at: datetime | None = None
    last_event_at: datetime | None = None
    events: list[CargoTrackingEventRead] = []


class VoyageCargoTrackingItemRead(BaseModel):
    tracking_code: str
    description: str
    cargo_type: str
    status: str
    status_label: str
    destination_name: str | None = None
    receiver_name: str | None = None
    weight_kg: float
    manifest_id: UUID | None = None
    last_event_at: datetime | None = None


class VoyageCargoTrackingRead(BaseModel):
    voyage_code: str
    voyage_status: str | None = None
    voyage_status_label: str | None = None
    scheduled_departure: datetime | None = None
    scheduled_arrival: datetime | None = None
    cargo_count: int
    items: list[VoyageCargoTrackingItemRead] = []


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
