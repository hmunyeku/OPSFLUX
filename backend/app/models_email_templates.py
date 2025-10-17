"""
Modèles pour les templates d'email.
Permet de créer et gérer des templates d'email réutilisables avec variables dynamiques.
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from sqlmodel import Field, SQLModel, Column
from sqlalchemy.dialects.postgresql import JSONB
import sqlalchemy as sa

from app.core.models.base import AbstractBaseModel


class EmailTemplateCategory(str, Enum):
    """Catégorie de template d'email"""
    TRANSACTIONAL = "transactional"  # Emails transactionnels (reset password, etc.)
    NOTIFICATION = "notification"    # Notifications système
    MARKETING = "marketing"          # Emails marketing
    SYSTEM = "system"                # Emails système
    CUSTOM = "custom"                # Templates personnalisés


class EmailTemplate(AbstractBaseModel, table=True):
    """
    Template d'email réutilisable.

    Permet de définir des templates avec variables dynamiques pour l'envoi d'emails.
    """
    __tablename__ = "email_template"

    # Identification
    name: str = Field(max_length=255, index=True)  # "password_reset"
    slug: str = Field(max_length=255, unique=True, index=True)  # "password-reset"

    # Description
    description: Optional[str] = Field(default=None, max_length=500)
    category: EmailTemplateCategory = Field(default=EmailTemplateCategory.CUSTOM, index=True)

    # Contenu du template
    subject: str = Field(max_length=255)  # "Réinitialisation de votre mot de passe"
    html_content: str = Field(sa_column=Column(sa.Text))  # Contenu HTML complet
    text_content: Optional[str] = Field(default=None, sa_column=Column(sa.Text))  # Version texte (fallback)

    # Variables disponibles dans le template
    available_variables: list[str] = Field(default=[], sa_column=Column(JSONB))
    # Ex: ["user_name", "reset_link", "expiry_hours"]

    # Métadonnées
    is_active: bool = Field(default=True)
    is_system: bool = Field(default=False)  # Template système (ne peut être supprimé)

    # Preview data (pour tester le rendu)
    preview_data: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    # Ex: {"user_name": "John Doe", "reset_link": "https://...", "expiry_hours": "48"}

    # Statistiques
    sent_count: int = Field(default=0)  # Nombre d'emails envoyés avec ce template
    last_sent_at: Optional[datetime] = Field(default=None)


# --- Pydantic Schemas pour l'API ---

class EmailTemplateBase(SQLModel):
    """Base schema pour EmailTemplate"""
    name: str
    slug: str
    description: Optional[str] = None
    category: EmailTemplateCategory = EmailTemplateCategory.CUSTOM
    subject: str
    html_content: str
    text_content: Optional[str] = None
    available_variables: list[str] = []
    preview_data: Optional[dict] = None
    is_active: bool = True


class EmailTemplateCreate(EmailTemplateBase):
    """Schema pour créer un template"""
    pass


class EmailTemplateUpdate(SQLModel):
    """Schema pour mettre à jour un template"""
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    category: Optional[EmailTemplateCategory] = None
    subject: Optional[str] = None
    html_content: Optional[str] = None
    text_content: Optional[str] = None
    available_variables: Optional[list[str]] = None
    preview_data: Optional[dict] = None
    is_active: Optional[bool] = None


class EmailTemplatePublic(EmailTemplateBase):
    """Schema public pour EmailTemplate"""
    id: UUID
    is_system: bool
    sent_count: int
    last_sent_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class EmailTemplatesPublic(SQLModel):
    """Liste paginée de templates"""
    data: list[EmailTemplatePublic]
    count: int


class EmailTemplateSendTestRequest(SQLModel):
    """Requête pour envoyer un email de test"""
    template_id: UUID
    to_email: str = Field(max_length=255)
    test_data: dict = {}  # Variables de test pour le rendu


class EmailTemplateSendTestResponse(SQLModel):
    """Réponse après envoi d'email de test"""
    success: bool
    message: str
