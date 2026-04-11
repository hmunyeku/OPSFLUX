"""PackLog Pydantic schemas.

PackLog owns cargo request, cargo item, tracking, and evidence contracts.
TravelWiz may still consume some of these contracts during the migration.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import OpsFluxSchema


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


class PackageElementReturnUpdate(BaseModel):
    quantity_returned: float = Field(..., ge=0)
    return_notes: str | None = None


class PackageElementDispositionUpdate(BaseModel):
    return_status: str = Field(
        ...,
        pattern=r"^(returned|reintegrated|scrapped|yard_storage)$",
    )
    return_notes: str | None = None


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
    planned_zone_id: UUID | None = None
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
    planned_zone_id: UUID | None = None
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
        pattern=r"^(registered|ready|ready_for_loading|loaded|in_transit|delivered_intermediate|delivered_final|damaged|missing|return_declared|return_in_transit|returned|reintegrated|scrapped)$",
    )
    damage_notes: str | None = None


class CargoReceiptConfirm(BaseModel):
    received_quantity: float | None = Field(default=None, ge=0)
    declared_quantity: float | None = Field(default=None, ge=0)
    recipient_available: bool = True
    signature_collected: bool = True
    damage_notes: str | None = None
    photo_evidence_count: int = Field(default=0, ge=0)
    notes: str | None = None


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
    planned_zone_id: UUID | None = None
    sap_article_code: str | None = None
    hazmat_validated: bool
    received_by: UUID | None = None
    received_at: datetime | None = None
    damage_notes: str | None = None
    registered_by: UUID
    active: bool
    created_at: datetime
    sender_name: str | None = None
    destination_name: str | None = None
    imputation_reference_code: str | None = None
    imputation_reference_name: str | None = None
    pickup_contact_display_name: str | None = None
    request_code: str | None = None
    request_title: str | None = None
    planned_zone_name: str | None = None


class CargoRequestCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    project_id: UUID | None = None
    imputation_reference_id: UUID | None = None
    sender_tier_id: UUID | None = None
    sender_contact_tier_contact_id: UUID | None = None
    receiver_name: str | None = Field(None, max_length=200)
    destination_asset_id: UUID | None = None
    requester_user_id: UUID | None = None
    requester_name: str | None = Field(None, max_length=200)


class CargoRequestUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    status: str | None = Field(None, pattern=r"^(draft|submitted|approved|assigned|in_progress|closed|cancelled)$")
    project_id: UUID | None = None
    imputation_reference_id: UUID | None = None
    sender_tier_id: UUID | None = None
    sender_contact_tier_contact_id: UUID | None = None
    receiver_name: str | None = None
    destination_asset_id: UUID | None = None
    requester_user_id: UUID | None = None
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
    sender_contact_tier_contact_id: UUID | None = None
    receiver_name: str | None = None
    destination_asset_id: UUID | None = None
    requester_user_id: UUID | None = None
    requester_name: str | None = None
    requester_display_name: str | None = None
    sender_contact_name: str | None = None
    requested_by: UUID
    active: bool
    created_at: datetime
    cargo_count: int = 0
    sender_name: str | None = None
    destination_name: str | None = None
    imputation_reference_code: str | None = None
    imputation_reference_name: str | None = None
    is_ready_for_submission: bool = False
    missing_requirements: list[str] = []


class CargoLoadingOptionRead(OpsFluxSchema):
    voyage_id: UUID
    voyage_code: str
    voyage_status: str
    scheduled_departure: datetime
    vector_id: UUID
    vector_name: str | None = None
    departure_base_name: str | None = None
    manifest_id: UUID | None = None
    manifest_status: str | None = None
    destination_match: bool = False
    remaining_weight_kg: float | None = None
    total_request_weight_kg: float = 0
    total_request_surface_m2: float = 0
    all_items_stackable: bool = False
    compatible_zones: list[dict[str, Any]] = []
    requires_manifest_creation: bool = False
    can_load: bool = False
    blocking_reasons: list[str] = []


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
