"""
Modèles pour la gestion des adresses avec géolocalisation.
Supporte différents types d'adresse configurables et associations polymorphes.
"""

import uuid
from typing import Optional
from enum import Enum

from sqlmodel import Field, Relationship, SQLModel, Column, String
from sqlalchemy import Index, UniqueConstraint

from app.core.models import AbstractBaseModel, AbstractNamedModel


class AddressTypeCode(str, Enum):
    """Types d'adresse prédéfinis"""
    BUREAU = "BUREAU"
    DOMICILE = "DOMICILE"
    ATELIER = "ATELIER"
    ENTREPOT = "ENTREPOT"
    LIVRAISON = "LIVRAISON"
    FACTURATION = "FACTURATION"
    AUTRE = "AUTRE"


# ==================== ADDRESS TYPE ====================

class AddressTypeBase(SQLModel):
    """Propriétés de base pour AddressType"""
    code: str = Field(max_length=50, index=True, description="Code unique du type d'adresse")
    name: str = Field(max_length=255, description="Nom du type d'adresse")
    description: Optional[str] = Field(default=None, max_length=1000)
    is_active: bool = Field(default=True, description="Type d'adresse actif ou désactivé")
    icon: Optional[str] = Field(default=None, max_length=100, description="Icône pour l'UI (ex: lucide icon name)")
    color: Optional[str] = Field(default=None, max_length=50, description="Couleur pour l'UI (ex: hex ou tailwind class)")


class AddressTypeCreate(AddressTypeBase):
    """Schéma pour créer un type d'adresse"""
    pass


class AddressTypeUpdate(AddressTypeBase):
    """Schéma pour mettre à jour un type d'adresse"""
    code: Optional[str] = Field(default=None, max_length=50)
    name: Optional[str] = Field(default=None, max_length=255)
    is_active: Optional[bool] = None


class AddressType(AbstractBaseModel, AddressTypeBase, table=True):
    """
    Modèle pour les types d'adresse configurables.
    Permet à l'admin de définir les types d'adresse utilisés dans le système.
    """
    __tablename__ = "address_type"
    __table_args__ = (
        UniqueConstraint("code", name="uq_address_type_code"),
        Index("ix_address_type_code", "code"),
        Index("ix_address_type_is_active", "is_active"),
    )

    # Relations
    addresses: list["Address"] = Relationship(back_populates="address_type")


class AddressTypePublic(AddressTypeBase):
    """Schéma public pour AddressType"""
    id: uuid.UUID


class AddressTypesPublic(SQLModel):
    """Liste de types d'adresse"""
    data: list[AddressTypePublic]
    count: int


# ==================== ADDRESS ====================

class AddressBase(SQLModel):
    """Propriétés de base pour Address"""
    # Type d'adresse
    address_type_id: uuid.UUID = Field(foreign_key="address_type.id", description="Type d'adresse")

    # Label personnalisé (ex: "Siège social", "Bureau Paris", "Domicile principal")
    label: Optional[str] = Field(default=None, max_length=255, description="Label personnalisé")

    # Adresse structurée
    street_line1: str = Field(max_length=255, description="Ligne d'adresse 1")
    street_line2: Optional[str] = Field(default=None, max_length=255, description="Ligne d'adresse 2 (complément)")
    city: str = Field(max_length=100, description="Ville")
    state: Optional[str] = Field(default=None, max_length=100, description="État/Région/Province")
    postal_code: str = Field(max_length=20, description="Code postal")
    country: str = Field(max_length=2, description="Code pays ISO 3166-1 alpha-2 (ex: FR, US)")

    # Géolocalisation (Google Maps)
    latitude: Optional[float] = Field(default=None, description="Latitude")
    longitude: Optional[float] = Field(default=None, description="Longitude")
    place_id: Optional[str] = Field(default=None, max_length=255, description="Google Place ID")
    formatted_address: Optional[str] = Field(default=None, max_length=500, description="Adresse formatée Google")

    # Contact
    phone: Optional[str] = Field(default=None, max_length=50, description="Téléphone")
    email: Optional[str] = Field(default=None, max_length=255, description="Email")

    # Informations complémentaires
    notes: Optional[str] = Field(default=None, max_length=1000, description="Notes/instructions supplémentaires")
    is_default: bool = Field(default=False, description="Adresse par défaut pour ce type")
    is_active: bool = Field(default=True, description="Adresse active")


class AddressCreate(AddressBase):
    """Schéma pour créer une adresse"""
    # Association polymorphe
    entity_type: str = Field(max_length=50, description="Type d'entité (user, company, etc.)")
    entity_id: uuid.UUID = Field(description="ID de l'entité associée")


class AddressUpdate(AddressBase):
    """Schéma pour mettre à jour une adresse"""
    address_type_id: Optional[uuid.UUID] = None
    street_line1: Optional[str] = Field(default=None, max_length=255)
    city: Optional[str] = Field(default=None, max_length=100)
    postal_code: Optional[str] = Field(default=None, max_length=20)
    country: Optional[str] = Field(default=None, max_length=2)
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None


class Address(AbstractBaseModel, AddressBase, table=True):
    """
    Modèle pour les adresses avec géolocalisation.
    Utilise une association polymorphe pour être lié à différentes entités.
    """
    __tablename__ = "address"
    __table_args__ = (
        Index("ix_address_entity", "entity_type", "entity_id"),
        Index("ix_address_type", "address_type_id"),
        Index("ix_address_country", "country"),
        Index("ix_address_postal_code", "postal_code"),
        Index("ix_address_is_default", "is_default"),
        Index("ix_address_geo", "latitude", "longitude"),
    )

    # Association polymorphe - permet d'associer une adresse à n'importe quelle entité
    entity_type: str = Field(
        sa_column=Column(String(50), nullable=False, index=True),
        description="Type d'entité (user, company, warehouse, etc.)"
    )
    entity_id: uuid.UUID = Field(
        nullable=False,
        index=True,
        description="ID de l'entité associée"
    )

    # Relations
    address_type: Optional[AddressType] = Relationship(back_populates="addresses")


class AddressPublic(AddressBase):
    """Schéma public pour Address"""
    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    address_type: Optional[AddressTypePublic] = None


class AddressesPublic(SQLModel):
    """Liste d'adresses"""
    data: list[AddressPublic]
    count: int


# ==================== ADDRESS VALIDATION ====================

class AddressValidationRequest(SQLModel):
    """Requête pour valider une adresse via Google Maps"""
    street_line1: str
    street_line2: Optional[str] = None
    city: str
    state: Optional[str] = None
    postal_code: str
    country: str


class AddressValidationResponse(SQLModel):
    """Réponse de validation d'adresse"""
    is_valid: bool
    formatted_address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    place_id: Optional[str] = None
    suggestions: Optional[list[str]] = None
    error: Optional[str] = None


# ==================== GEOCODING ====================

class GeocodeRequest(SQLModel):
    """Requête pour géocoder une adresse"""
    address: str


class GeocodeResponse(SQLModel):
    """Réponse de géocodage"""
    latitude: float
    longitude: float
    formatted_address: str
    place_id: str
    address_components: dict


# ==================== MESSAGE ====================

class Message(SQLModel):
    """Generic message response"""
    message: str
