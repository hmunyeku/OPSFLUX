"""SQLAlchemy 2.0 base model with common mixins."""

from datetime import datetime
from uuid import UUID as PyUUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


class TimestampMixin:
    """Mixin adding created_at and updated_at columns."""
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class SoftDeleteMixin:
    """Mixin adding archived boolean (never physical DELETE)."""
    archived: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default="false",
        nullable=False,
    )


class AuditUserMixin:
    """Adds created_by / updated_by FK columns pointing to users.id."""
    created_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    updated_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )


class VerifiableMixin:
    """Mixin for records that require verification before being considered valid.

    Workflow:
    - User creates/updates record → verification_status = 'pending'
    - Compliance officer reviews → 'verified' or 'rejected'
    - Once verified, record is locked (user cannot edit until expiry)
    - Only users with conformite.verify permission can modify verified records
    """
    verification_status: Mapped[str] = mapped_column(
        String(20), default="pending", server_default="pending", nullable=False,
    )  # pending | verified | rejected
    verified_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True,
    )
    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    rejection_reason: Mapped[str | None] = mapped_column(
        String(500), nullable=True,
    )

    @property
    def is_locked(self) -> bool:
        """A record is locked once verified — user cannot modify it."""
        return self.verification_status == "verified"


class UUIDPrimaryKeyMixin:
    """Mixin adding UUID primary key."""
    id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
