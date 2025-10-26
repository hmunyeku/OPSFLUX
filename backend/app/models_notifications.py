"""
Modèles pour le système de notifications en temps réel.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Column, Field, JSON, SQLModel

from app.models import AbstractBaseModel


class NotificationType(str, Enum):
    """Types de notifications disponibles."""

    INFO = "info"
    SUCCESS = "success"
    WARNING = "warning"
    ERROR = "error"
    SYSTEM = "system"


class NotificationPriority(str, Enum):
    """Priorités des notifications."""

    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class NotificationBase(SQLModel):
    """Base model for notifications."""

    title: str = Field(max_length=255)
    message: str = Field(max_length=1000)
    type: NotificationType = Field(default=NotificationType.INFO)
    priority: NotificationPriority = Field(default=NotificationPriority.NORMAL)
    read: bool = Field(default=False)
    action_url: Optional[str] = Field(default=None, max_length=500)
    expires_at: Optional[datetime] = Field(default=None)


class Notification(AbstractBaseModel, NotificationBase, table=True):
    """
    Modèle de notification avec audit trail complet.
    """

    __tablename__ = "notifications"

    user_id: UUID = Field(foreign_key="user.id", index=True)
    notification_metadata: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    read_at: Optional[datetime] = Field(default=None)


class NotificationCreate(SQLModel):
    """Schema for creating a notification."""

    user_id: UUID
    title: str = Field(max_length=255)
    message: str = Field(max_length=1000)
    type: NotificationType = Field(default=NotificationType.INFO)
    priority: NotificationPriority = Field(default=NotificationPriority.NORMAL)
    notification_metadata: Optional[dict] = None
    action_url: Optional[str] = None
    expires_at: Optional[datetime] = None


class NotificationPublic(NotificationBase):
    """Public notification model."""

    id: UUID
    user_id: UUID
    notification_metadata: Optional[dict] = None
    read_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class NotificationsPublic(SQLModel):
    """List of notifications."""

    data: list[NotificationPublic]
    count: int


class NotificationUpdate(SQLModel):
    """Schema for updating notification."""

    read: Optional[bool] = None


class WebSocketMessage(SQLModel):
    """WebSocket message format."""

    type: str  # "notification", "ping", "pong", "error"
    data: Optional[dict] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ========================================
# User Notification Preferences
# ========================================

class UserNotificationPreferences(AbstractBaseModel, table=True):
    """
    Préférences de notifications pour un utilisateur.
    Contrôle comment et quand l'utilisateur reçoit des notifications.
    """
    __tablename__ = "user_notification_preferences"

    user_id: UUID = Field(foreign_key="user.id", unique=True, index=True)

    # Type de notification (all, mentions, none)
    notification_type: str = Field(default="mentions", max_length=20)

    # Notifications mobiles
    mobile_enabled: bool = Field(default=False)

    # Types d'emails
    communication_emails: bool = Field(default=False)
    social_emails: bool = Field(default=True)
    marketing_emails: bool = Field(default=False)
    security_emails: bool = Field(default=True)  # Toujours activé (sécurité)


class NotificationPreferencesBase(SQLModel):
    """Base pour les préférences de notifications."""
    notification_type: str = Field(default="mentions", max_length=20)
    mobile_enabled: bool = Field(default=False)
    communication_emails: bool = Field(default=False)
    social_emails: bool = Field(default=True)
    marketing_emails: bool = Field(default=False)
    security_emails: bool = Field(default=True)


class NotificationPreferencesUpdate(NotificationPreferencesBase):
    """Mise à jour de préférences (tous les champs optionnels)."""
    notification_type: Optional[str] = Field(default=None, max_length=20)
    mobile_enabled: Optional[bool] = None
    communication_emails: Optional[bool] = None
    social_emails: Optional[bool] = None
    marketing_emails: Optional[bool] = None
    security_emails: Optional[bool] = None


class NotificationPreferencesPublic(NotificationPreferencesBase):
    """Préférences publiques (réponse API)."""
    user_id: UUID
    created_at: datetime
    updated_at: datetime
