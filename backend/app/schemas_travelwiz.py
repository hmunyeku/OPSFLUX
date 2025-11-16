"""
TravelWiz - Back Cargo System Schemas
Schémas Pydantic pour validation API
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models_travelwiz import (
    BackCargoTypeEnum,
    DestinationAreaEnum,
    DestinationTypeEnum,
    DiscrepancyTypeEnum,
    ManifestStatusEnum,
    PackagingTypeEnum,
    SeverityEnum,
    SourceTypeEnum,
    ValidationStatusEnum,
    VesselArrivalStatusEnum,
    VesselTypeEnum,
    YardDispatchStatusEnum,
)


# ============================================================================
# SHARED SCHEMAS
# ============================================================================

class CargoItemBase(BaseModel):
    """Base cargo item schema"""
    item_number: str = Field(max_length=50)
    packaging: PackagingTypeEnum
    packaging_number: Optional[str] = None
    quantity: int = Field(gt=0)
    designation: str = Field(max_length=500)
    weight: float = Field(gt=0)
    observations: Optional[str] = None
    cargo_win_number: Optional[str] = None
    cargo_nature: Optional[str] = None
    sap_code: Optional[str] = None
    sender: Optional[str] = None
    recipient: Optional[str] = None
    cargo_owner: Optional[str] = None
    slip_number: Optional[str] = None
    cost_imputation: Optional[str] = None
    picture_urls: Optional[list[str]] = None


class CargoItemCreate(CargoItemBase):
    """Schema for creating a cargo item"""
    pass


class CargoItemPublic(CargoItemBase):
    """Public cargo item schema"""
    id: UUID
    qr_code: Optional[str] = None
    label_printed: bool = False
    scanned_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class StepValidationSchema(BaseModel):
    """Validation d'une étape"""
    status: ValidationStatusEnum
    validator: Optional[str] = None
    validator_role: Optional[str] = None
    date: Optional[datetime] = None
    signature: Optional[str] = None
    comments: Optional[str] = None
    location: Optional[str] = None


# ============================================================================
# LOADING MANIFEST SCHEMAS
# ============================================================================

class LoadingManifestBase(BaseModel):
    """Base loading manifest schema"""
    pickup_location: str = Field(max_length=200)
    availability_date: datetime
    requested_delivery_date: datetime
    vessel: VesselTypeEnum
    destination: DestinationTypeEnum
    destination_code: str = Field(max_length=50)
    service: str = Field(max_length=200)
    recipient_name: str = Field(max_length=200)
    recipient_contact: Optional[str] = None
    source: SourceTypeEnum
    external_provider: Optional[str] = None
    emitter_service: str = Field(max_length=200)
    emitter_name: str = Field(max_length=200)
    emitter_contact: Optional[str] = None
    emitter_date: datetime
    notes: Optional[str] = None


class LoadingManifestCreate(LoadingManifestBase):
    """Schema for creating a loading manifest"""
    items: list[CargoItemCreate] = Field(min_length=1)


class LoadingManifestUpdate(BaseModel):
    """Schema for updating a loading manifest"""
    pickup_location: Optional[str] = None
    availability_date: Optional[datetime] = None
    requested_delivery_date: Optional[datetime] = None
    vessel: Optional[VesselTypeEnum] = None
    destination: Optional[DestinationTypeEnum] = None
    service: Optional[str] = None
    recipient_name: Optional[str] = None
    recipient_contact: Optional[str] = None
    status: Optional[ManifestStatusEnum] = None
    loading_validation: Optional[StepValidationSchema] = None
    vessel_validation: Optional[StepValidationSchema] = None
    unloading_validation: Optional[StepValidationSchema] = None
    loading_date: Optional[datetime] = None
    departure_date: Optional[datetime] = None
    arrival_date: Optional[datetime] = None
    unloading_date: Optional[datetime] = None
    notes: Optional[str] = None


class LoadingManifestPublic(LoadingManifestBase):
    """Public loading manifest schema"""
    id: UUID
    manifest_number: str
    status: ManifestStatusEnum
    total_weight: float
    total_packages: int
    emitter_signature: Optional[str] = None
    loading_validation: Optional[dict] = None
    vessel_validation: Optional[dict] = None
    unloading_validation: Optional[dict] = None
    loading_date: Optional[datetime] = None
    departure_date: Optional[datetime] = None
    arrival_date: Optional[datetime] = None
    unloading_date: Optional[datetime] = None
    distribution_list: Optional[list[str]] = None
    created_at: datetime
    updated_at: datetime


class LoadingManifestsPublic(BaseModel):
    """List of loading manifests"""
    data: list[LoadingManifestPublic]
    count: int


# ============================================================================
# BACK CARGO MANIFEST SCHEMAS
# ============================================================================

class BackCargoManifestBase(BaseModel):
    """Base back cargo manifest schema"""
    type: BackCargoTypeEnum
    origin_site: DestinationTypeEnum
    origin_rig: Optional[str] = None
    vessel: VesselTypeEnum
    arrival_date: datetime
    company_man: Optional[str] = None
    omaa_delegate: Optional[str] = None
    subcontractor_name: Optional[str] = None
    has_inventory: bool = False
    has_exit_pass: bool = False
    marked_bins: bool = False
    has_scrap_mention: bool = False
    has_yard_storage_mention: bool = False
    destination_service: Optional[str] = None
    destination_area: Optional[DestinationAreaEnum] = None
    storage_reason: Optional[str] = None
    notes: Optional[str] = None


class BackCargoManifestCreate(BackCargoManifestBase):
    """Schema for creating a back cargo manifest"""
    items: list[CargoItemCreate] = Field(min_length=1)


class BackCargoManifestUpdate(BaseModel):
    """Schema for updating a back cargo manifest"""
    type: Optional[BackCargoTypeEnum] = None
    origin_site: Optional[DestinationTypeEnum] = None
    origin_rig: Optional[str] = None
    vessel: Optional[VesselTypeEnum] = None
    arrival_date: Optional[datetime] = None
    status: Optional[ManifestStatusEnum] = None
    company_man: Optional[str] = None
    company_man_signature: Optional[StepValidationSchema] = None
    omaa_delegate: Optional[str] = None
    omaa_delegate_signature: Optional[StepValidationSchema] = None
    captain_signature: Optional[StepValidationSchema] = None
    subcontractor_name: Optional[str] = None
    subcontractor_signature: Optional[StepValidationSchema] = None
    yard_officer_signature: Optional[StepValidationSchema] = None
    has_inventory: Optional[bool] = None
    has_exit_pass: Optional[bool] = None
    marked_bins: Optional[bool] = None
    has_scrap_mention: Optional[bool] = None
    has_yard_storage_mention: Optional[bool] = None
    destination_service: Optional[str] = None
    destination_area: Optional[DestinationAreaEnum] = None
    storage_reason: Optional[str] = None
    discrepancies: Optional[list[str]] = None
    discrepancy_photos: Optional[list[str]] = None
    pending_approval: Optional[bool] = None
    approval_reason: Optional[str] = None
    yard_reception_date: Optional[datetime] = None
    yard_reception_by: Optional[str] = None
    yard_location: Optional[str] = None
    notes: Optional[str] = None


class BackCargoManifestPublic(BackCargoManifestBase):
    """Public back cargo manifest schema"""
    id: UUID
    back_cargo_number: str
    status: ManifestStatusEnum
    total_weight: float
    total_packages: int
    compliance_rules: dict
    company_man_signature: Optional[dict] = None
    omaa_delegate_signature: Optional[dict] = None
    captain_signature: Optional[dict] = None
    subcontractor_signature: Optional[dict] = None
    yard_officer_signature: Optional[dict] = None
    discrepancies: Optional[list[str]] = None
    discrepancy_photos: Optional[list[str]] = None
    pending_approval: bool = False
    approval_reason: Optional[str] = None
    yard_reception_date: Optional[datetime] = None
    yard_reception_by: Optional[str] = None
    yard_location: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class BackCargoManifestsPublic(BaseModel):
    """List of back cargo manifests"""
    data: list[BackCargoManifestPublic]
    count: int


# ============================================================================
# UNLOADING DISCREPANCY SCHEMAS
# ============================================================================

class UnloadingDiscrepancyBase(BaseModel):
    """Base unloading discrepancy schema"""
    type: DiscrepancyTypeEnum
    manifest_id: Optional[str] = None
    package_number: Optional[str] = None
    description: str = Field(max_length=2000)
    expected_value: Optional[str] = None
    actual_value: Optional[str] = None
    severity: SeverityEnum
    photos: Optional[list[str]] = None
    detected_by: str
    detected_at: datetime


class UnloadingDiscrepancyCreate(UnloadingDiscrepancyBase):
    """Schema for creating an unloading discrepancy"""
    vessel_arrival_id: UUID


class UnloadingDiscrepancyUpdate(BaseModel):
    """Schema for updating an unloading discrepancy"""
    resolved: Optional[bool] = None
    resolution_note: Optional[str] = None
    resolution_date: Optional[datetime] = None


class UnloadingDiscrepancyPublic(UnloadingDiscrepancyBase):
    """Public unloading discrepancy schema"""
    id: UUID
    vessel_arrival_id: UUID
    resolved: bool = False
    resolution_note: Optional[str] = None
    resolution_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class UnloadingDiscrepanciesPublic(BaseModel):
    """List of unloading discrepancies"""
    data: list[UnloadingDiscrepancyPublic]
    count: int


# ============================================================================
# VESSEL ARRIVAL SCHEMAS
# ============================================================================

class VesselArrivalBase(BaseModel):
    """Base vessel arrival schema"""
    vessel: VesselTypeEnum
    eta: datetime


class VesselArrivalCreate(VesselArrivalBase):
    """Schema for creating a vessel arrival"""
    expected_manifests: int = Field(ge=0)
    expected_packages: int = Field(ge=0)
    expected_weight: float = Field(ge=0)


class VesselArrivalUpdate(BaseModel):
    """Schema for updating a vessel arrival"""
    status: Optional[VesselArrivalStatusEnum] = None
    eta: Optional[datetime] = None
    ata: Optional[datetime] = None
    etd: Optional[datetime] = None
    atd: Optional[datetime] = None
    received_manifests: Optional[int] = None
    received_packages: Optional[int] = None
    received_weight: Optional[float] = None
    physical_check_completed: Optional[bool] = None
    slips_recovered: Optional[bool] = None
    weights_verified: Optional[bool] = None
    riggings_verified: Optional[bool] = None
    manifest_compared: Optional[bool] = None
    inspector_name: Optional[str] = None
    inspection_date: Optional[datetime] = None
    inspection_notes: Optional[str] = None
    unloading_completed: Optional[bool] = None
    unloading_notes: Optional[str] = None
    report_generated: Optional[bool] = None
    report_url: Optional[str] = None
    report_sent: Optional[bool] = None
    report_recipients: Optional[list[str]] = None


class VesselArrivalPublic(VesselArrivalBase):
    """Public vessel arrival schema"""
    id: UUID
    status: VesselArrivalStatusEnum
    ata: Optional[datetime] = None
    etd: Optional[datetime] = None
    atd: Optional[datetime] = None
    expected_manifests: int
    received_manifests: int
    expected_packages: int
    received_packages: int
    expected_weight: float
    received_weight: float
    physical_check_completed: bool
    slips_recovered: bool
    weights_verified: bool
    riggings_verified: bool
    manifest_compared: bool
    inspector_name: Optional[str] = None
    inspection_date: Optional[datetime] = None
    inspection_notes: Optional[str] = None
    unloading_completed: bool
    unloading_notes: Optional[str] = None
    report_generated: bool
    report_url: Optional[str] = None
    report_sent: bool
    report_recipients: Optional[list[str]] = None
    created_at: datetime
    updated_at: datetime


class VesselArrivalsPublic(BaseModel):
    """List of vessel arrivals"""
    data: list[VesselArrivalPublic]
    count: int


# ============================================================================
# YARD DISPATCH SCHEMAS
# ============================================================================

class YardDispatchBase(BaseModel):
    """Base yard dispatch schema"""
    back_cargo_id: UUID


class YardDispatchCreate(YardDispatchBase):
    """Schema for creating a yard dispatch"""
    yard_officer: Optional[str] = None


class YardDispatchUpdate(BaseModel):
    """Schema for updating a yard dispatch"""
    status: Optional[YardDispatchStatusEnum] = None
    reception_date: Optional[datetime] = None
    yard_officer: Optional[str] = None
    verification_completed: Optional[bool] = None
    verification_notes: Optional[str] = None
    verification_anomalies: Optional[list[str]] = None
    is_compliant: Optional[bool] = None
    notification_sent: Optional[bool] = None
    notification_method: Optional[str] = None
    notification_message: Optional[str] = None
    notification_date: Optional[datetime] = None
    exit_pass_number: Optional[str] = None
    exit_pass_generated: Optional[bool] = None
    exit_pass_url: Optional[str] = None
    blue_copy_sent: Optional[bool] = None
    dispatch_location: Optional[str] = None
    dispatch_zone: Optional[str] = None
    dispatch_date: Optional[datetime] = None
    dispatch_notes: Optional[str] = None
    withdrawn: Optional[bool] = None
    withdrawn_date: Optional[datetime] = None
    withdrawn_by: Optional[str] = None
    withdrawn_signature: Optional[str] = None


class YardDispatchPublic(YardDispatchBase):
    """Public yard dispatch schema"""
    id: UUID
    status: YardDispatchStatusEnum
    reception_date: Optional[datetime] = None
    yard_officer: Optional[str] = None
    verification_completed: bool
    verification_notes: Optional[str] = None
    verification_anomalies: Optional[list[str]] = None
    is_compliant: bool
    notification_sent: bool
    notification_method: Optional[str] = None
    notification_message: Optional[str] = None
    notification_date: Optional[datetime] = None
    exit_pass_number: Optional[str] = None
    exit_pass_generated: bool
    exit_pass_url: Optional[str] = None
    blue_copy_sent: bool
    dispatch_location: Optional[str] = None
    dispatch_zone: Optional[str] = None
    dispatch_date: Optional[datetime] = None
    dispatch_notes: Optional[str] = None
    withdrawn: bool
    withdrawn_date: Optional[datetime] = None
    withdrawn_by: Optional[str] = None
    withdrawn_signature: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class YardDispatchesPublic(BaseModel):
    """List of yard dispatches"""
    data: list[YardDispatchPublic]
    count: int


# ============================================================================
# DASHBOARD SCHEMAS
# ============================================================================

class TravelWizStats(BaseModel):
    """TravelWiz dashboard statistics"""
    active_manifests: int
    vessels_expected_7_days: int
    back_cargo_to_dispatch: int
    compliance_rate: float
    total_packages_in_transit: int
    total_weight_in_transit: float


class TravelWizDashboard(BaseModel):
    """TravelWiz dashboard data"""
    stats: TravelWizStats
    recent_manifests: list[LoadingManifestPublic]
    recent_back_cargo: list[BackCargoManifestPublic]
    upcoming_vessels: list[VesselArrivalPublic]
    pending_dispatches: list[YardDispatchPublic]
