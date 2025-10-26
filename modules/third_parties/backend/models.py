"""
Modèles pour le module de gestion de tiers (Third Parties Management).

Ce module permet de gérer:
- Companies: Entreprises / Tiers
- Contacts: Employés / Contacts associés aux entreprises
- ContactInvitations: Invitations pour que les contacts complètent leur profil
"""

import uuid
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, TYPE_CHECKING

from sqlmodel import Field, SQLModel, Column
from sqlalchemy import Text, Index
from sqlalchemy.dialects.postgresql import JSONB

from app.core.models import AbstractBaseModel

if TYPE_CHECKING:
    from app.models import User


class CompanyType(str, Enum):
    """Type d'entreprise"""
    CLIENT = "client"  # Client
    SUPPLIER = "supplier"  # Fournisseur
    PARTNER = "partner"  # Partenaire
    CONTRACTOR = "contractor"  # Sous-traitant
    COMPETITOR = "competitor"  # Concurrent
    OTHER = "other"  # Autre


class CompanyStatus(str, Enum):
    """Statut d'une entreprise"""
    ACTIVE = "active"  # Actif
    INACTIVE = "inactive"  # Inactif
    PROSPECT = "prospect"  # Prospect
    ARCHIVED = "archived"  # Archivé


class ContactStatus(str, Enum):
    """Statut d'un contact"""
    ACTIVE = "active"  # Actif
    INACTIVE = "inactive"  # Inactif
    INVITED = "invited"  # Invité (en attente de complétion du profil)
    ARCHIVED = "archived"  # Archivé


class ContactRole(str, Enum):
    """Rôle d'un contact dans l'entreprise"""
    CEO = "ceo"  # Directeur Général
    MANAGER = "manager"  # Manager / Responsable
    EMPLOYEE = "employee"  # Employé
    CONSULTANT = "consultant"  # Consultant
    TECHNICAL = "technical"  # Technique
    COMMERCIAL = "commercial"  # Commercial
    ADMIN = "admin"  # Administratif
    OTHER = "other"  # Autre


class InvitationStatus(str, Enum):
    """Statut d'une invitation"""
    PENDING = "pending"  # En attente
    ACCEPTED = "accepted"  # Acceptée
    EXPIRED = "expired"  # Expirée
    REVOKED = "revoked"  # Révoquée


# ==================== COMPANY ====================

class CompanyBase(SQLModel):
    """Propriétés de base pour Company"""
    # Identification
    name: str = Field(max_length=255, index=True, description="Nom de l'entreprise")
    legal_name: Optional[str] = Field(default=None, max_length=255, description="Raison sociale")
    registration_number: Optional[str] = Field(default=None, max_length=100, index=True, description="SIRET/SIREN")
    vat_number: Optional[str] = Field(default=None, max_length=50, description="Numéro de TVA")

    # Type et statut
    company_type: CompanyType = Field(default=CompanyType.OTHER, description="Type d'entreprise")
    status: CompanyStatus = Field(default=CompanyStatus.PROSPECT, description="Statut")

    # Contact
    email: Optional[str] = Field(default=None, max_length=255, description="Email principal")
    phone: Optional[str] = Field(default=None, max_length=50, description="Téléphone principal")
    website: Optional[str] = Field(default=None, max_length=500, description="Site web")

    # Adresse
    address_line1: Optional[str] = Field(default=None, max_length=255, description="Adresse ligne 1")
    address_line2: Optional[str] = Field(default=None, max_length=255, description="Adresse ligne 2")
    city: Optional[str] = Field(default=None, max_length=100, description="Ville")
    postal_code: Optional[str] = Field(default=None, max_length=20, description="Code postal")
    state: Optional[str] = Field(default=None, max_length=100, description="État/Région")
    country: Optional[str] = Field(default=None, max_length=100, description="Pays")

    # Description
    description: Optional[str] = Field(default=None, max_length=1000, description="Description")
    notes: Optional[str] = Field(default=None, description="Notes internes")

    # Logo
    logo_url: Optional[str] = Field(default=None, max_length=500, description="URL du logo")

    # Métadonnées
    industry: Optional[str] = Field(default=None, max_length=100, description="Secteur d'activité")
    employee_count: Optional[int] = Field(default=None, description="Nombre d'employés")
    annual_revenue: Optional[float] = Field(default=None, description="Chiffre d'affaires annuel")

    # Tags
    tags: list[str] = Field(default_factory=list, sa_column=Column(JSONB), description="Tags")

    # Métadonnées supplémentaires (flexible) - renamed from 'metadata' to avoid SQLModel conflict
    extra_metadata: dict = Field(default_factory=dict, sa_column=Column(JSONB), description="Métadonnées")


class CompanyCreate(CompanyBase):
    """Schema pour créer une entreprise"""
    pass


class CompanyUpdate(SQLModel):
    """Schema pour mettre à jour une entreprise"""
    name: Optional[str] = None
    legal_name: Optional[str] = None
    registration_number: Optional[str] = None
    vat_number: Optional[str] = None
    company_type: Optional[CompanyType] = None
    status: Optional[CompanyStatus] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    logo_url: Optional[str] = None
    industry: Optional[str] = None
    employee_count: Optional[int] = None
    annual_revenue: Optional[float] = None
    tags: Optional[list[str]] = None
    extra_metadata: Optional[dict] = None


class Company(AbstractBaseModel, CompanyBase, table=True):
    """
    Entreprise / Tiers.

    Représente une entreprise (client, fournisseur, partenaire, etc.)
    avec laquelle l'organisation interagit.
    """
    __tablename__ = "company"

    # Créateur
    created_by_id: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    updated_by_id: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")


class CompanyPublic(CompanyBase):
    """Schema public pour Company"""
    id: uuid.UUID
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by_id: Optional[uuid.UUID] = None
    updated_by_id: Optional[uuid.UUID] = None
    contact_count: Optional[int] = 0


class CompaniesPublic(SQLModel):
    """Liste paginée d'entreprises"""
    data: list[CompanyPublic]
    count: int


# ==================== CONTACT ====================

class ContactBase(SQLModel):
    """Propriétés de base pour Contact"""
    # Entreprise
    company_id: uuid.UUID = Field(foreign_key="company.id", index=True, description="Entreprise associée")

    # Identification
    first_name: str = Field(max_length=100, description="Prénom")
    last_name: str = Field(max_length=100, description="Nom")
    civility: Optional[str] = Field(default=None, max_length=10, description="Civilité (M., Mme, Dr.)")
    job_title: Optional[str] = Field(default=None, max_length=255, description="Poste")
    department: Optional[str] = Field(default=None, max_length=100, description="Département")
    role: ContactRole = Field(default=ContactRole.OTHER, description="Rôle")

    # Contact
    email: str = Field(max_length=255, index=True, description="Email professionnel")
    phone: Optional[str] = Field(default=None, max_length=50, description="Téléphone")
    mobile: Optional[str] = Field(default=None, max_length=50, description="Mobile")
    extension: Optional[str] = Field(default=None, max_length=20, description="Extension")

    # Social
    linkedin_url: Optional[str] = Field(default=None, max_length=500, description="LinkedIn")
    twitter_handle: Optional[str] = Field(default=None, max_length=100, description="Twitter")

    # Statut
    status: ContactStatus = Field(default=ContactStatus.ACTIVE, description="Statut")

    # Photo
    avatar_url: Optional[str] = Field(default=None, max_length=500, description="URL de la photo")

    # Notes
    notes: Optional[str] = Field(default=None, description="Notes")

    # Contact principal
    is_primary: bool = Field(default=False, description="Contact principal de l'entreprise")

    # Métadonnées - renamed from 'metadata' to avoid SQLModel conflict
    extra_metadata: dict = Field(default_factory=dict, sa_column=Column(JSONB), description="Métadonnées")


class ContactCreate(ContactBase):
    """Schema pour créer un contact"""
    pass


class ContactUpdate(SQLModel):
    """Schema pour mettre à jour un contact"""
    company_id: Optional[uuid.UUID] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    civility: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    role: Optional[ContactRole] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    extension: Optional[str] = None
    linkedin_url: Optional[str] = None
    twitter_handle: Optional[str] = None
    status: Optional[ContactStatus] = None
    avatar_url: Optional[str] = None
    notes: Optional[str] = None
    is_primary: Optional[bool] = None
    extra_metadata: Optional[dict] = None


class Contact(AbstractBaseModel, ContactBase, table=True):
    """
    Contact / Employé d'une entreprise.

    Représente une personne physique travaillant pour une entreprise.
    Peut être associé à un compte utilisateur administrateur.
    """
    __tablename__ = "contact"

    # Compte utilisateur associé (si le contact devient administrateur)
    user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id", index=True, unique=True)

    # Créateur
    created_by_id: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    updated_by_id: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")


# Index composite pour recherche rapide
Index("ix_contact_name", Contact.first_name, Contact.last_name)
Index("ix_contact_company_email", Contact.company_id, Contact.email)


class ContactPublic(ContactBase):
    """Schema public pour Contact"""
    id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by_id: Optional[uuid.UUID] = None
    updated_by_id: Optional[uuid.UUID] = None
    full_name: Optional[str] = None
    has_user_account: bool = False


class ContactsPublic(SQLModel):
    """Liste paginée de contacts"""
    data: list[ContactPublic]
    count: int


class ContactWithCompany(ContactPublic):
    """Contact avec les informations de l'entreprise"""
    company: CompanyPublic


# ==================== CONTACT INVITATION ====================

class ContactInvitationBase(SQLModel):
    """Propriétés de base pour ContactInvitation"""
    contact_id: uuid.UUID = Field(foreign_key="contact.id", index=True, description="Contact invité")

    # Message d'invitation
    message: Optional[str] = Field(default=None, max_length=1000, description="Message personnalisé")

    # Expiration
    expires_at: datetime = Field(description="Date d'expiration")

    # Permissions
    can_be_admin: bool = Field(default=False, description="Peut devenir administrateur")
    initial_permissions: list[str] = Field(default_factory=list, sa_column=Column(JSONB), description="Permissions initiales")


class ContactInvitationCreate(SQLModel):
    """Schema pour créer une invitation"""
    contact_id: uuid.UUID
    message: Optional[str] = None
    expires_in_days: int = Field(default=7, description="Expire dans X jours")
    can_be_admin: bool = False
    initial_permissions: Optional[list[str]] = []


class ContactInvitation(AbstractBaseModel, ContactInvitationBase, table=True):
    """
    Invitation pour un contact à compléter son profil.

    Permet d'envoyer un lien sécurisé à un contact externe pour qu'il puisse:
    - Compléter son profil
    - Configurer l'authentification 2FA
    - Optionnellement devenir administrateur
    """
    __tablename__ = "contact_invitation"

    # Token sécurisé
    token: str = Field(max_length=255, unique=True, index=True, description="Token d'invitation")

    # Statut
    status: InvitationStatus = Field(default=InvitationStatus.PENDING, index=True, description="Statut")

    # Acceptation
    accepted_at: Optional[datetime] = Field(default=None, description="Date d'acceptation")
    revoked_at: Optional[datetime] = Field(default=None, description="Date de révocation")
    revoked_reason: Optional[str] = Field(default=None, max_length=500, description="Raison de la révocation")

    # Vérification 2FA
    two_factor_verified: bool = Field(default=False, description="2FA vérifié")
    two_factor_verified_at: Optional[datetime] = Field(default=None, description="Date de vérification 2FA")

    # Métadonnées
    ip_address: Optional[str] = Field(default=None, max_length=45, description="Adresse IP d'acceptation")
    user_agent: Optional[str] = Field(default=None, max_length=500, description="User agent d'acceptation")

    # Créateur
    created_by_id: uuid.UUID = Field(foreign_key="user.id", index=True, description="Créateur de l'invitation")


class ContactInvitationPublic(ContactInvitationBase):
    """Schema public pour ContactInvitation"""
    id: uuid.UUID
    token: str
    status: InvitationStatus
    accepted_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    two_factor_verified: bool
    created_at: Optional[datetime] = None
    created_by_id: uuid.UUID


class ContactInvitationsPublic(SQLModel):
    """Liste paginée d'invitations"""
    data: list[ContactInvitationPublic]
    count: int


class ContactInvitationAccept(SQLModel):
    """Schema pour accepter une invitation"""
    token: str
    password: str = Field(min_length=8, max_length=40, description="Mot de passe")
    two_factor_method: str = Field(description="Méthode 2FA (email ou app)")
    profile_data: Optional[dict] = Field(default=None, description="Données de profil supplémentaires")


class ContactInvitationVerify2FA(SQLModel):
    """Schema pour vérifier le 2FA lors de l'acceptation"""
    token: str
    code: str = Field(min_length=6, max_length=6, description="Code 2FA")
