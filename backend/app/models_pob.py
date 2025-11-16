"""
POB (Personnel On Board) Management Models
Gestion des demandes de séjour sur site (platforms, sites offshore, etc.)
"""

from datetime import date, datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from sqlmodel import Field, Relationship, SQLModel

from app.core.models.base import AbstractBaseModel


class StayRequestStatus(str, Enum):
    """Status of a stay request"""
    DRAFT = "draft"
    PENDING = "pending"
    IN_VALIDATION = "in-validation"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class ValidatorStatus(str, Enum):
    """Status of a validator's decision"""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


# =====================================================
# Stay Request Validator (Join Table)
# =====================================================

class StayRequestValidatorBase(SQLModel):
    """Base model for stay request validators"""
    validator_name: str = Field(max_length=255, description="Name of the validator")
    validator_user_id: Optional[UUID] = Field(
        default=None,
        foreign_key="user.id",
        description="User ID of the validator (if registered user)"
    )
    level: int = Field(description="Validation level (1, 2, 3, etc.)")
    status: ValidatorStatus = Field(
        default=ValidatorStatus.PENDING,
        description="Validation status"
    )
    validation_date: Optional[datetime] = Field(
        default=None,
        description="Date when validation was performed"
    )
    validation_notes: Optional[str] = Field(
        default=None,
        description="Notes or comments from validator"
    )


class StayRequestValidator(AbstractBaseModel, StayRequestValidatorBase, table=True):
    """Stay request validator (many-to-one with stay request)"""
    __tablename__ = "stay_request_validators"

    stay_request_id: UUID = Field(foreign_key="stay_requests.id")

    # Relationships
    stay_request: Optional["StayRequest"] = Relationship(back_populates="validators")


class StayRequestValidatorPublic(StayRequestValidatorBase):
    """Public model for stay request validator"""
    id: UUID
    stay_request_id: UUID
    created_at: datetime
    updated_at: Optional[datetime] = None


class StayRequestValidatorCreate(StayRequestValidatorBase):
    """Create model for stay request validator"""
    stay_request_id: UUID


class StayRequestValidatorUpdate(SQLModel):
    """Update model for stay request validator"""
    validator_name: Optional[str] = None
    validator_user_id: Optional[UUID] = None
    level: Optional[int] = None
    status: Optional[ValidatorStatus] = None
    validation_date: Optional[datetime] = None
    validation_notes: Optional[str] = None


# =====================================================
# Training Models (for stay requests)
# =====================================================

class StayRequestTrainingBase(SQLModel):
    """Base model for trainings associated with stay requests"""
    type: str = Field(max_length=255, description="Training type (e.g., Induction, SST)")
    training_date: Optional[date] = Field(default=None, description="Date when training was obtained")
    validity_date: Optional[date] = Field(default=None, description="Training validity expiration date")
    mandatory: bool = Field(default=False, description="Is this training mandatory")


class StayRequestTraining(AbstractBaseModel, StayRequestTrainingBase, table=True):
    """Training record for stay request"""
    __tablename__ = "stay_request_trainings"

    stay_request_id: UUID = Field(foreign_key="stay_requests.id")

    # Relationships
    stay_request: Optional["StayRequest"] = Relationship(back_populates="trainings")


class StayRequestTrainingPublic(StayRequestTrainingBase):
    """Public model for stay request training"""
    id: UUID
    stay_request_id: UUID
    created_at: datetime
    updated_at: Optional[datetime] = None


class StayRequestTrainingCreate(StayRequestTrainingBase):
    """Create model for stay request training"""
    pass


class StayRequestTrainingUpdate(SQLModel):
    """Update model for stay request training"""
    type: Optional[str] = None
    training_date: Optional[date] = None
    validity_date: Optional[date] = None
    mandatory: Optional[bool] = None


# =====================================================
# Certification Models (for stay requests)
# =====================================================

class StayRequestCertificationBase(SQLModel):
    """Base model for certifications associated with stay requests"""
    type: str = Field(max_length=255, description="Certification type")
    certification_date: Optional[date] = Field(default=None, description="Date when certification was obtained")
    validity_date: Optional[date] = Field(default=None, description="Certification validity expiration date")


class StayRequestCertification(AbstractBaseModel, StayRequestCertificationBase, table=True):
    """Certification record for stay request"""
    __tablename__ = "stay_request_certifications"

    stay_request_id: UUID = Field(foreign_key="stay_requests.id")

    # Relationships
    stay_request: Optional["StayRequest"] = Relationship(back_populates="certifications")


class StayRequestCertificationPublic(StayRequestCertificationBase):
    """Public model for stay request certification"""
    id: UUID
    stay_request_id: UUID
    created_at: datetime
    updated_at: Optional[datetime] = None


class StayRequestCertificationCreate(StayRequestCertificationBase):
    """Create model for stay request certification"""
    pass


class StayRequestCertificationUpdate(SQLModel):
    """Update model for stay request certification"""
    type: Optional[str] = None
    certification_date: Optional[date] = None
    validity_date: Optional[date] = None


# =====================================================
# Additional Period Models (for stay requests)
# =====================================================

class StayRequestPeriodBase(SQLModel):
    """Base model for additional stay periods"""
    start_date: date = Field(description="Start date of additional period")
    end_date: date = Field(description="End date of additional period")


class StayRequestPeriod(AbstractBaseModel, StayRequestPeriodBase, table=True):
    """Additional period for stay request"""
    __tablename__ = "stay_request_periods"

    stay_request_id: UUID = Field(foreign_key="stay_requests.id")

    # Relationships
    stay_request: Optional["StayRequest"] = Relationship(back_populates="additional_periods")


class StayRequestPeriodPublic(StayRequestPeriodBase):
    """Public model for stay request period"""
    id: UUID
    stay_request_id: UUID
    created_at: datetime
    updated_at: Optional[datetime] = None


class StayRequestPeriodCreate(StayRequestPeriodBase):
    """Create model for stay request period"""
    pass


class StayRequestPeriodUpdate(SQLModel):
    """Update model for stay request period"""
    start_date: Optional[date] = None
    end_date: Optional[date] = None


# =====================================================
# Stay Request (Main Table)
# =====================================================

class StayRequestBase(SQLModel):
    """Base model for stay requests"""
    person_name: str = Field(max_length=255, description="Name of the person requesting stay")
    person_user_id: Optional[UUID] = Field(
        default=None,
        foreign_key="user.id",
        description="User ID if person is a registered user"
    )
    site: str = Field(max_length=255, description="Site/Platform name")
    start_date: date = Field(description="Start date of stay")
    end_date: date = Field(description="End date of stay")
    reason: Optional[str] = Field(default=None, description="Reason for stay request")
    project: str = Field(max_length=255, description="Associated project")
    status: StayRequestStatus = Field(
        default=StayRequestStatus.DRAFT,
        description="Current status of the request"
    )
    validation_level: int = Field(
        default=0,
        description="Current validation level (0 = not started)"
    )
    total_levels: int = Field(
        default=3,
        description="Total number of validation levels required"
    )

    # Additional fields
    company: Optional[str] = Field(default=None, max_length=255, description="Company name")
    function: Optional[str] = Field(default=None, max_length=255, description="Job function/position")
    accommodation: Optional[str] = Field(default=None, max_length=255, description="Accommodation/lodging")
    department: Optional[str] = Field(default=None, max_length=255, description="Department")
    cost_center: Optional[str] = Field(default=None, max_length=100, description="Cost center")
    is_first_stay: bool = Field(default=False, description="Is this the first stay for this person")
    pickup_location: Optional[str] = Field(default=None, max_length=255, description="Pickup point name")
    pickup_address: Optional[str] = Field(default=None, max_length=500, description="Pickup point address")
    emergency_contact: Optional[str] = Field(default=None, description="Emergency contact information")
    special_requirements: Optional[str] = Field(default=None, description="Special requirements or notes")


class StayRequest(AbstractBaseModel, StayRequestBase, table=True):
    """Stay request model"""
    __tablename__ = "stay_requests"

    # Relationships
    validators: list["StayRequestValidator"] = Relationship(
        back_populates="stay_request",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
    trainings: list["StayRequestTraining"] = Relationship(
        back_populates="stay_request",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
    certifications: list["StayRequestCertification"] = Relationship(
        back_populates="stay_request",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
    additional_periods: list["StayRequestPeriod"] = Relationship(
        back_populates="stay_request",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )


class StayRequestPublic(StayRequestBase):
    """Public model for stay request"""
    id: UUID
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by_id: Optional[UUID] = None
    validators: list[StayRequestValidatorPublic] = []
    trainings: list[StayRequestTrainingPublic] = []
    certifications: list[StayRequestCertificationPublic] = []
    additional_periods: list[StayRequestPeriodPublic] = []


class StayRequestCreate(StayRequestBase):
    """Create model for stay request"""
    validators: Optional[list[StayRequestValidatorCreate]] = []
    trainings: Optional[list[StayRequestTrainingCreate]] = []
    certifications: Optional[list[StayRequestCertificationCreate]] = []
    additional_periods: Optional[list[StayRequestPeriodCreate]] = []


class StayRequestUpdate(SQLModel):
    """Update model for stay request"""
    person_name: Optional[str] = None
    person_user_id: Optional[UUID] = None
    site: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    reason: Optional[str] = None
    project: Optional[str] = None
    status: Optional[StayRequestStatus] = None
    validation_level: Optional[int] = None
    total_levels: Optional[int] = None
    company: Optional[str] = None
    function: Optional[str] = None
    accommodation: Optional[str] = None
    department: Optional[str] = None
    cost_center: Optional[str] = None
    is_first_stay: Optional[bool] = None
    pickup_location: Optional[str] = None
    pickup_address: Optional[str] = None
    emergency_contact: Optional[str] = None
    special_requirements: Optional[str] = None


class StayRequestsPublic(SQLModel):
    """Public model for multiple stay requests"""
    data: list[StayRequestPublic]
    count: int
