"""
Modèles pour le système de notifications en temps réel.
"""

from datetime import UTC, datetime
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
    metadata: Optional[dict] = Field(default=None, sa_column=Column(JSON, nullable=True))
    action_url: Optional[str] = Field(default=None, max_length=500)
    expires_at: Optional[datetime] = Field(default=None)


class Notification(AbstractBaseModel, NotificationBase, table=True):
    """
    Modèle de notification avec audit trail complet.
    """

    __tablename__ = "notifications"

    user_id: UUID = Field(foreign_key="user.id", index=True)
    read_at: Optional[datetime] = Field(default=None)


class NotificationCreate(SQLModel):
    """Schema for creating a notification."""

    user_id: UUID
    title: str = Field(max_length=255)
    message: str = Field(max_length=1000)
    type: NotificationType = Field(default=NotificationType.INFO)
    priority: NotificationPriority = Field(default=NotificationPriority.NORMAL)
    metadata: Optional[dict] = None
    action_url: Optional[str] = None
    expires_at: Optional[datetime] = None


class NotificationPublic(NotificationBase):
    """Public notification model."""

    id: UUID
    user_id: UUID
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
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
