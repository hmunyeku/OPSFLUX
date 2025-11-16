"""
Tiers (Third Parties) Models
Models for managing companies and contacts
Created: 2025-11-02
"""

import enum
from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import JSON, Column
from sqlmodel import Field, Relationship, SQLModel

from app.models import AbstractBaseModel


# =====================================================
# Enums
# =====================================================

class CompanyType(str, enum.Enum):
    """Types of companies"""
    CLIENT = "client"
    SUPPLIER = "supplier"
    PARTNER = "partner"
    COMPETITOR = "competitor"


class CompanyStatus(str, enum.Enum):
    """Status of a company"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    PROSPECT = "prospect"


class ContactStatus(str, enum.Enum):
    """Status of a contact"""
    ACTIVE = "active"
    INACTIVE = "inactive"


class PreferredContact(str, enum.Enum):
    """Preferred contact method"""
    EMAIL = "email"
    PHONE = "phone"
    MOBILE = "mobile"


# =====================================================
# Company Models
# =====================================================

class CompanyBase(SQLModel):
    """Base model for companies"""
    name: str = Field(max_length=255, index=True)
    legal_name: str = Field(max_length=255)
    siret: str = Field(max_length=50, unique=True, index=True)
    status: CompanyStatus = Field(default=CompanyStatus.PROSPECT)
    sector: str = Field(max_length=255)
    address: str = Field(max_length=500)
    city: str = Field(max_length=255)
    country: str = Field(max_length=255, default="France")
    phone: str = Field(max_length=50)
    email: str = Field(max_length=255)
    website: Optional[str] = Field(default=None, max_length=255)
    logo: Optional[str] = Field(default=None, max_length=500)
    revenue: Optional[float] = Field(default=None)
    rating: int = Field(default=0, ge=0, le=5)
    last_interaction: Optional[datetime] = Field(default=None)


class Company(AbstractBaseModel, CompanyBase, table=True):
    """Company model"""
    __tablename__ = "companies"

    # Array fields stored as JSON
    types: list[str] = Field(default=[], sa_column=Column(JSON, nullable=False))
    tags: list[str] = Field(default=[], sa_column=Column(JSON, nullable=False))

    # Relationships
    contacts: list["Contact"] = Relationship(
        back_populates="company_rel",
        sa_relationship_kwargs={"lazy": "selectin"}
    )


class CompanyCreate(CompanyBase):
    """Model for creating a company"""
    types: list[CompanyType] = Field(default=[], sa_column=None)
    tags: list[str] = Field(default=[], sa_column=None)


class CompanyUpdate(SQLModel):
    """Model for updating a company"""
    name: Optional[str] = Field(default=None, max_length=255)
    legal_name: Optional[str] = Field(default=None, max_length=255)
    siret: Optional[str] = Field(default=None, max_length=50)
    types: Optional[list[CompanyType]] = Field(default=None)
    status: Optional[CompanyStatus] = Field(default=None)
    sector: Optional[str] = Field(default=None, max_length=255)
    address: Optional[str] = Field(default=None, max_length=500)
    city: Optional[str] = Field(default=None, max_length=255)
    country: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=50)
    email: Optional[str] = Field(default=None, max_length=255)
    website: Optional[str] = Field(default=None, max_length=255)
    logo: Optional[str] = Field(default=None, max_length=500)
    revenue: Optional[float] = Field(default=None)
    rating: Optional[int] = Field(default=None, ge=0, le=5)
    last_interaction: Optional[datetime] = Field(default=None)
    tags: Optional[list[str]] = Field(default=None, sa_column=None)


class CompanyPublic(CompanyBase):
    """Model for public API responses"""
    id: UUID
    types: list[str]
    tags: list[str]
    contacts_count: int = Field(default=0)
    projects_count: int = Field(default=0)
    created_at: datetime
    updated_at: datetime


class CompaniesPublic(SQLModel):
    """Model for paginated companies list"""
    data: list[CompanyPublic]
    count: int


# =====================================================
# Contact Models
# =====================================================

class ContactBase(SQLModel):
    """Base model for contacts"""
    first_name: str = Field(max_length=255)
    last_name: str = Field(max_length=255, index=True)
    email: str = Field(max_length=255, index=True)
    phone: str = Field(max_length=50)
    mobile: Optional[str] = Field(default=None, max_length=50)
    position: str = Field(max_length=255)
    department: Optional[str] = Field(default=None, max_length=255)
    preferred_contact: PreferredContact = Field(default=PreferredContact.EMAIL)
    last_contact: Optional[datetime] = Field(default=None)
    notes: Optional[str] = Field(default=None, max_length=2000)
    avatar: Optional[str] = Field(default=None, max_length=500)
    linked_in: Optional[str] = Field(default=None, max_length=255)
    status: ContactStatus = Field(default=ContactStatus.ACTIVE)


class Contact(AbstractBaseModel, ContactBase, table=True):
    """Contact model"""
    __tablename__ = "contacts"

    # Foreign key to company
    company_id: UUID = Field(foreign_key="companies.id", index=True)

    # Array field stored as JSON
    tags: list[str] = Field(default=[], sa_column=Column(JSON, nullable=False))

    # Relationships
    company_rel: Optional[Company] = Relationship(back_populates="contacts")


class ContactCreate(ContactBase):
    """Model for creating a contact"""
    company_id: UUID
    tags: list[str] = Field(default=[], sa_column=None)


class ContactUpdate(SQLModel):
    """Model for updating a contact"""
    first_name: Optional[str] = Field(default=None, max_length=255)
    last_name: Optional[str] = Field(default=None, max_length=255)
    email: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=50)
    mobile: Optional[str] = Field(default=None, max_length=50)
    position: Optional[str] = Field(default=None, max_length=255)
    company_id: Optional[UUID] = Field(default=None)
    department: Optional[str] = Field(default=None, max_length=255)
    preferred_contact: Optional[PreferredContact] = Field(default=None)
    last_contact: Optional[datetime] = Field(default=None)
    notes: Optional[str] = Field(default=None, max_length=2000)
    avatar: Optional[str] = Field(default=None, max_length=500)
    linked_in: Optional[str] = Field(default=None, max_length=255)
    status: Optional[ContactStatus] = Field(default=None)
    tags: Optional[list[str]] = Field(default=None, sa_column=None)


class ContactPublic(ContactBase):
    """Model for public API responses"""
    id: UUID
    company_id: UUID
    company_name: str = Field(default="")
    tags: list[str]
    created_at: datetime
    updated_at: datetime


class ContactsPublic(SQLModel):
    """Model for paginated contacts list"""
    data: list[ContactPublic]
    count: int
