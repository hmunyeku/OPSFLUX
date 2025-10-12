"""
Modèles de base abstraits pour tous les modèles de l'application.
Fournit les fonctionnalités communes: UUID, audit trail, soft delete, external_id.
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class AbstractBaseModel(SQLModel):
    """
    Modèle de base abstrait pour tous les modèles de l'application.

    Fonctionnalités:
    - UUID comme clé primaire
    - external_id pour intégration systèmes tiers
    - Audit trail complet (created_at, updated_at, created_by, updated_by)
    - Soft delete (deleted_at, deleted_by)

    Tous les modèles métiers doivent hériter de cette classe.
    """

    # Identifiant unique (UUID v4)
    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        nullable=False
    )

    # Identifiant externe pour intégration avec systèmes tiers
    # Permet de mapper des entités entre OPSFLUX et ERP/WMS/TMS externes
    external_id: Optional[str] = Field(
        default=None,
        max_length=255,
        unique=True,
        index=True,
        nullable=True,
        description="Identifiant externe pour intégrations"
    )

    # Audit trail - Création
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        nullable=False,
        description="Date de création"
    )

    created_by_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        description="ID utilisateur créateur"
    )

    # Audit trail - Modification
    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        nullable=False,
        description="Date dernière modification"
    )

    updated_by_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        description="ID utilisateur modificateur"
    )

    # Soft delete
    deleted_at: Optional[datetime] = Field(
        default=None,
        nullable=True,
        description="Date de suppression (soft delete)"
    )

    deleted_by_id: Optional[uuid.UUID] = Field(
        default=None,
        nullable=True,
        description="ID utilisateur ayant supprimé"
    )

    class Config:
        # Ne pas créer de table pour cette classe (modèle abstrait)
        # Les classes héritant créeront leurs propres tables
        from_attributes = True

    def soft_delete(self, deleted_by_id: Optional[uuid.UUID] = None) -> None:
        """
        Effectue une suppression soft (logique) de l'entité.

        Args:
            deleted_by_id: ID de l'utilisateur effectuant la suppression
        """
        self.deleted_at = datetime.utcnow()
        self.deleted_by_id = deleted_by_id

    def restore(self) -> None:
        """
        Restaure une entité supprimée (annule le soft delete).
        """
        self.deleted_at = None
        self.deleted_by_id = None

    def is_deleted(self) -> bool:
        """
        Vérifie si l'entité est supprimée (soft delete).

        Returns:
            True si l'entité est supprimée, False sinon
        """
        return self.deleted_at is not None

    def update_audit_trail(self, updated_by_id: Optional[uuid.UUID] = None) -> None:
        """
        Met à jour le timestamp et l'utilisateur de dernière modification.

        Args:
            updated_by_id: ID de l'utilisateur effectuant la modification
        """
        self.updated_at = datetime.utcnow()
        if updated_by_id:
            self.updated_by_id = updated_by_id


class AbstractNamedModel(AbstractBaseModel):
    """
    Modèle de base abstrait avec champs name, code, description.

    Utilisé pour les entités qui ont besoin d'un nom, code et description
    (ex: Category, Tag, Currency, etc.)
    """

    # Code court unique (ex: "USD", "EUR", "POB_MGMT")
    code: str = Field(
        max_length=50,
        unique=True,
        index=True,
        nullable=False,
        description="Code unique court"
    )

    # Nom complet
    name: str = Field(
        max_length=255,
        nullable=False,
        description="Nom complet"
    )

    # Description optionnelle
    description: Optional[str] = Field(
        default=None,
        max_length=1000,
        nullable=True,
        description="Description détaillée"
    )

    # Actif/Inactif
    is_active: bool = Field(
        default=True,
        nullable=False,
        description="Entité active ou désactivée"
    )
