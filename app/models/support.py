"""Support ORM models — tickets, comments, status history."""

from datetime import datetime
from uuid import UUID as PyUUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


# ─── Support Tickets ──────────────────────────────────────────────────────────

TICKET_TYPES = ("bug", "improvement", "question", "other")
TICKET_PRIORITIES = ("low", "medium", "high", "critical")
TICKET_STATUSES = ("open", "in_progress", "waiting_info", "resolved", "closed", "rejected")


class SupportTicket(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Support ticket — bug report, feature request, or question from a user."""
    __tablename__ = "support_tickets"
    __table_args__ = (
        CheckConstraint(f"ticket_type IN {TICKET_TYPES}", name="ck_ticket_type"),
        CheckConstraint(f"priority IN {TICKET_PRIORITIES}", name="ck_ticket_priority"),
        CheckConstraint(f"status IN {TICKET_STATUSES}", name="ck_ticket_status"),
        Index("idx_support_tickets_entity", "entity_id"),
        Index("idx_support_tickets_status", "status"),
        Index("idx_support_tickets_reporter", "reporter_id"),
        Index("idx_support_tickets_assignee", "assignee_id"),
        Index("idx_support_tickets_reference", "reference"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)
    reference: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    ticket_type: Mapped[str] = mapped_column(String(20), nullable=False, server_default="bug")
    priority: Mapped[str] = mapped_column(String(20), nullable=False, server_default="medium")
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="open")
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    browser_info: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    reporter_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    assignee_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Relationships
    comments = relationship("TicketComment", back_populates="ticket", cascade="all, delete-orphan", order_by="TicketComment.created_at")
    status_history = relationship("TicketStatusHistory", back_populates="ticket", cascade="all, delete-orphan", order_by="TicketStatusHistory.created_at.desc()")
    todos = relationship("TicketTodo", back_populates="ticket", cascade="all, delete-orphan", order_by="TicketTodo.order")


class TicketComment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Comment/reply on a support ticket."""
    __tablename__ = "ticket_comments"
    __table_args__ = (
        Index("idx_ticket_comments_ticket", "ticket_id"),
    )

    ticket_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False)
    author_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal: Mapped[bool] = mapped_column(Boolean, server_default="false")
    attachment_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Relationships
    ticket = relationship("SupportTicket", back_populates="comments")


class TicketStatusHistory(UUIDPrimaryKeyMixin, Base):
    """Audit trail for ticket status changes."""
    __tablename__ = "ticket_status_history"
    __table_args__ = (
        Index("idx_status_history_ticket", "ticket_id"),
    )

    ticket_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False)
    old_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    new_status: Mapped[str] = mapped_column(String(20), nullable=False)
    changed_by: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    ticket = relationship("SupportTicket", back_populates="status_history")


class TicketTodo(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Todo/checklist item attached to a support ticket (improvement tracking)."""
    __tablename__ = "ticket_todos"
    __table_args__ = (
        Index("idx_ticket_todos_ticket", "ticket_id"),
    )

    ticket_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean, server_default="false")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_by: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    order: Mapped[int] = mapped_column(Integer, server_default="0")

    # Relationships
    ticket = relationship("SupportTicket", back_populates="todos")
