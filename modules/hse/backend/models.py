"""
Modèles pour le module HSE.

Ce module EXPLOITE les modèles de base du CORE (AbstractBaseModel).
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from sqlmodel import Field, SQLModel

# Import du modèle de base CORE
from app.core.models.base import AbstractBaseModel


class IncidentType(str, Enum):
    """Type d'incident HSE"""
    NEAR_MISS = "near_miss"
    INJURY = "injury"
    ENVIRONMENTAL = "environmental"
    EQUIPMENT = "equipment"
    PROPERTY_DAMAGE = "property_damage"


class IncidentSeverity(str, Enum):
    """Sévérité de l'incident"""
    LOW = "low"          # 1-3
    MEDIUM = "medium"    # 4-6
    HIGH = "high"        # 7-8
    CRITICAL = "critical"  # 9-10


class Incident(AbstractBaseModel, table=True):
    """
    Incident HSE.

    Hérite de AbstractBaseModel du CORE pour avoir :
    - id (UUID)
    - external_id
    - created_at, updated_at, deleted_at
    - created_by_id, updated_by_id, deleted_by_id
    """
    __tablename__ = "hse_incident"

    # Numérotation
    number: str = Field(max_length=50, unique=True, index=True)  # HSE-2024-001

    # Classification
    type: IncidentType = Field(default=IncidentType.NEAR_MISS)
    severity: int = Field(default=1)  # 1-10
    severity_level: IncidentSeverity = Field(default=IncidentSeverity.LOW)

    # Détails
    title: str = Field(max_length=255)
    description: str = Field(sa_column_kwargs={"type_": "TEXT"})

    # Localisation
    location: str = Field(max_length=255)
    site_id: Optional[UUID] = Field(default=None, foreign_key="business_unit.id")

    # Date et heure
    incident_date: datetime = Field(default_factory=datetime.utcnow)

    # Personnes impliquées
    reported_by_id: Optional[UUID] = Field(default=None, foreign_key="user.id")
    witnesses: Optional[str] = Field(default=None, sa_column_kwargs={"type_": "TEXT"})
    injured_persons: Optional[str] = Field(default=None, sa_column_kwargs={"type_": "TEXT"})

    # Investigation
    requires_investigation: bool = Field(default=False)
    investigation_started_at: Optional[datetime] = Field(default=None)
    investigation_completed_at: Optional[datetime] = Field(default=None)
    investigation_notes: Optional[str] = Field(default=None, sa_column_kwargs={"type_": "TEXT"})

    # Actions correctives
    corrective_actions: Optional[str] = Field(default=None, sa_column_kwargs={"type_": "TEXT"})
    preventive_actions: Optional[str] = Field(default=None, sa_column_kwargs={"type_": "TEXT"})

    # Statut
    is_closed: bool = Field(default=False)
    closed_at: Optional[datetime] = Field(default=None)
    closed_by_id: Optional[UUID] = Field(default=None, foreign_key="user.id")


# Schemas Pydantic pour l'API

class IncidentBase(SQLModel):
    """Base schema pour Incident"""
    type: IncidentType
    severity: int
    title: str
    description: str
    location: str
    incident_date: datetime
    site_id: Optional[UUID] = None
    witnesses: Optional[str] = None
    injured_persons: Optional[str] = None


class IncidentCreate(IncidentBase):
    """Schema pour créer un incident"""
    pass


class IncidentUpdate(SQLModel):
    """Schema pour mettre à jour un incident"""
    type: Optional[IncidentType] = None
    severity: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    incident_date: Optional[datetime] = None
    witnesses: Optional[str] = None
    injured_persons: Optional[str] = None
    investigation_notes: Optional[str] = None
    corrective_actions: Optional[str] = None
    preventive_actions: Optional[str] = None
    is_closed: Optional[bool] = None


class IncidentPublic(IncidentBase):
    """Schema public pour Incident"""
    id: UUID
    number: str
    severity_level: IncidentSeverity
    requires_investigation: bool
    is_closed: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class IncidentsPublic(SQLModel):
    """Liste paginée d'incidents"""
    data: list[IncidentPublic]
    count: int
