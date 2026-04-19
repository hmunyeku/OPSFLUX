"""Import run model — tracks a single KMZ import for report display and rollback."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID as PyUUID

from sqlalchemy import DateTime, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPrimaryKeyMixin


class ImportRun(UUIDPrimaryKeyMixin, Base):
    """
    A single KMZ import operation. Records the file metadata, the chosen
    Field anchor, the full JSON report, and the lists of created entity IDs
    so a rollback endpoint can soft-delete them later.
    """

    __tablename__ = "ar_import_runs"

    entity_id: Mapped[PyUUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)
    field_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ar_fields.id", ondelete="SET NULL")
    )
    created_by: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    source_filename: Mapped[str | None] = mapped_column(String(255))
    document_name: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(30), default="completed", server_default="completed", nullable=False)
    report: Mapped[dict | None] = mapped_column(JSONB)
    created_site_ids: Mapped[list] = mapped_column(JSONB, server_default="[]", nullable=False)
    created_installation_ids: Mapped[list] = mapped_column(JSONB, server_default="[]", nullable=False)
    created_equipment_ids: Mapped[list] = mapped_column(JSONB, server_default="[]", nullable=False)
    created_pipeline_ids: Mapped[list] = mapped_column(JSONB, server_default="[]", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    rolled_back_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
