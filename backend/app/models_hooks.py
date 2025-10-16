"""
Modèles pour le système de Hooks & Triggers.
Permet d'exécuter des actions automatiquement lorsqu'un événement se produit.
"""

import uuid
from typing import Optional
from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel

from app.core.models import AbstractBaseModel


# Shared properties
class HookBase(SQLModel):
    """Propriétés de base pour un Hook"""
    name: str = Field(max_length=255, description="Nom du hook")
    event: str = Field(max_length=255, index=True, description="Nom de l'événement écouté (ex: 'incident.created')")
    is_active: bool = Field(default=True, description="Hook actif ou désactivé")
    priority: int = Field(default=0, description="Priorité d'exécution (plus élevé = exécuté en premier)")
    description: Optional[str] = Field(default=None, max_length=1000, description="Description du hook")


# Properties to receive via API on creation
class HookCreate(SQLModel):
    """Schéma pour créer un Hook"""
    name: str = Field(max_length=255)
    event: str = Field(max_length=255)
    is_active: bool = Field(default=True)
    priority: int = Field(default=0)
    description: Optional[str] = Field(default=None, max_length=1000)
    conditions: Optional[dict] = None  # JSON conditions
    actions: list[dict]  # JSON actions (au moins une action requise)


# Properties to receive via API on update
class HookUpdate(SQLModel):
    """Schéma pour mettre à jour un Hook"""
    name: Optional[str] = Field(default=None, max_length=255)
    event: Optional[str] = Field(default=None, max_length=255)
    is_active: Optional[bool] = None
    priority: Optional[int] = None
    description: Optional[str] = Field(default=None, max_length=1000)
    conditions: Optional[dict] = None
    actions: Optional[list[dict]] = None


# Database model
class Hook(AbstractBaseModel, HookBase, table=True):
    """
    Hook qui écoute un événement et exécute des actions.

    Exemples d'événements:
    - user.created, user.updated, user.deleted
    - incident.created, incident.submitted, incident.approved
    - task.assigned, task.completed
    - etc.

    Conditions (JSON) - optionnel:
    Permet de filtrer les événements selon le contexte.
    Exemples:
    - {"severity": "critical"} - uniquement si severity = critical
    - {"amount": {">=": 1000}} - uniquement si amount >= 1000
    - {"status": {"in": ["pending", "approved"]}} - si status in liste

    Actions (JSON) - requis (au moins une):
    Liste des actions à exécuter quand le hook matche.
    Exemples:
    - {"type": "send_notification", "config": {...}}
    - {"type": "send_email", "config": {...}}
    - {"type": "call_webhook", "config": {...}}
    - {"type": "execute_code", "config": {...}}
    - {"type": "create_task", "config": {...}}
    """
    __tablename__ = "hook"

    # Conditions (JSON) - null si aucune condition (le hook s'exécute toujours)
    conditions: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True),
        description="Conditions JSON pour filtrer l'exécution"
    )

    # Actions (JSON) - liste d'actions à exécuter
    actions: list[dict] = Field(
        sa_column=Column(JSON, nullable=False),
        description="Actions JSON à exécuter"
    )


# Properties to return via API
class HookPublic(HookBase):
    """Hook public (retourné par l'API)"""
    id: uuid.UUID
    conditions: Optional[dict] = None
    actions: list[dict]
    created_at: str | None = None
    updated_at: str | None = None


class HooksPublic(SQLModel):
    """Liste de Hooks"""
    data: list[HookPublic]
    count: int


# Hook Execution Log Models
class HookExecutionBase(SQLModel):
    """Propriétés de base pour un log d'exécution de Hook"""
    hook_id: uuid.UUID = Field(foreign_key="hook.id", nullable=False, ondelete="CASCADE")
    success: bool = Field(description="Exécution réussie ou échouée")
    duration_ms: int = Field(description="Durée d'exécution en millisecondes")
    error_message: Optional[str] = Field(default=None, max_length=2000, description="Message d'erreur si échec")


class HookExecutionCreate(SQLModel):
    """Schéma pour créer un log d'exécution"""
    hook_id: uuid.UUID
    event_context: dict  # Contexte de l'événement
    success: bool
    duration_ms: int
    error_message: Optional[str] = None


class HookExecution(AbstractBaseModel, HookExecutionBase, table=True):
    """
    Log d'exécution d'un hook.
    Conserve l'historique de toutes les exécutions pour audit et debugging.
    """
    __tablename__ = "hook_execution"

    # Contexte de l'événement qui a déclenché le hook (JSON)
    event_context: dict = Field(
        sa_column=Column(JSON, nullable=False),
        description="Contexte complet de l'événement"
    )


class HookExecutionPublic(HookExecutionBase):
    """Log d'exécution public"""
    id: uuid.UUID
    event_context: dict
    created_at: str | None = None


class HookExecutionsPublic(SQLModel):
    """Liste de logs d'exécution"""
    data: list[HookExecutionPublic]
    count: int
