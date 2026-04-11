"""Papyrus ORM models — versioning, forms, external links and workflow projection."""

from datetime import datetime
from uuid import UUID as PyUUID

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class PapyrusVersion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Stores immutable snapshots or JSON patches for a document."""

    __tablename__ = "papyrus_versions"
    __table_args__ = (
        UniqueConstraint("document_id", "version", name="uq_papyrus_version_document_version"),
        CheckConstraint("patch_type IN ('snapshot', 'diff')", name="ck_papyrus_version_patch_type"),
        Index("idx_papyrus_versions_document_version", "document_id", "version"),
        Index("idx_papyrus_versions_entity_created", "entity_id", "created_at"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    document_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    revision_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("revisions.id", ondelete="SET NULL")
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    patch_type: Mapped[str] = mapped_column(String(16), nullable=False)
    payload: Mapped[dict | list] = mapped_column(JSONB, nullable=False)
    created_by: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    message: Mapped[str | None] = mapped_column(Text)
    workflow_tag: Mapped[str | None] = mapped_column(String(64))


class PapyrusWorkflowEvent(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Workflow state change audit trail for Papyrus documents."""

    __tablename__ = "papyrus_workflow_events"
    __table_args__ = (
        Index("idx_papyrus_workflow_events_document_created", "document_id", "created_at"),
        Index("idx_papyrus_workflow_events_entity_created", "entity_id", "created_at"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    document_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    from_state: Mapped[str | None] = mapped_column(String(64))
    to_state: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    comment: Mapped[str | None] = mapped_column(Text)
    version_tag: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class PapyrusForm(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Papyrus native forms used by documents and external collection."""

    __tablename__ = "papyrus_forms"
    __table_args__ = (
        Index("idx_papyrus_forms_entity_created", "entity_id", "created_at"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    document_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL")
    )
    doc_type_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doc_types.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    schema_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    settings_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class PapyrusExternalLink(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Revocable external access link metadata for Papyrus forms."""

    __tablename__ = "papyrus_external_links"
    __table_args__ = (
        UniqueConstraint("token_id", name="uq_papyrus_external_link_token_id"),
        Index("idx_papyrus_external_links_form_created", "form_id", "created_at"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    form_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("papyrus_forms.id", ondelete="CASCADE"), nullable=False
    )
    token_id: Mapped[str] = mapped_column(String(128), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    max_submissions: Mapped[int | None] = mapped_column(Integer)
    submission_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    prefill: Mapped[dict | None] = mapped_column(JSONB)
    allowed_ips: Mapped[list[str] | None] = mapped_column(JSONB)
    require_identity: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_revoked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class PapyrusExternalSubmission(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Tampon for external form submissions before integration into OpsFlux."""

    __tablename__ = "papyrus_external_submissions"
    __table_args__ = (
        Index("idx_papyrus_external_submissions_form_created", "form_id", "submitted_at"),
        Index("idx_papyrus_external_submissions_status", "status"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    form_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("papyrus_forms.id", ondelete="CASCADE"), nullable=False
    )
    token_id: Mapped[str] = mapped_column(String(128), nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    respondent: Mapped[dict | None] = mapped_column(JSONB)
    answers: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    ip_address: Mapped[str | None] = mapped_column(INET)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    processed_by: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PapyrusDispatchRun(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Execution log and idempotency guard for scheduled Papyrus dispatches."""

    __tablename__ = "papyrus_dispatch_runs"
    __table_args__ = (
        UniqueConstraint("document_id", "trigger_key", name="uq_papyrus_dispatch_document_trigger"),
        Index("idx_papyrus_dispatch_runs_document_created", "document_id", "created_at"),
        Index("idx_papyrus_dispatch_runs_entity_created", "entity_id", "created_at"),
        Index("idx_papyrus_dispatch_runs_status", "status"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    document_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    revision_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("revisions.id", ondelete="SET NULL")
    )
    trigger_key: Mapped[str] = mapped_column(String(128), nullable=False)
    trigger_type: Mapped[str] = mapped_column(String(24), nullable=False, default="scheduled")
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    channel_type: Mapped[str] = mapped_column(String(24), nullable=False, default="email")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending")
    recipients: Mapped[list | None] = mapped_column(JSONB)
    result_summary: Mapped[dict | None] = mapped_column(JSONB)
    error_message: Mapped[str | None] = mapped_column(Text)
    triggered_by: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
