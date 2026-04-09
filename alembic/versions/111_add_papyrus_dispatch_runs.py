"""Add Papyrus dispatch run table.

Revision ID: 111_add_papyrus_dispatch_runs
Revises: 110_rename_report_editor_module_slug_to_papyrus
Create Date: 2026-04-09
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "111_add_papyrus_dispatch_runs"
down_revision: str | None = "110_rename_report_editor_module_slug_to_papyrus"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "papyrus_dispatch_runs",
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("revision_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("trigger_key", sa.String(length=128), nullable=False),
        sa.Column("trigger_type", sa.String(length=24), nullable=False, server_default="scheduled"),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=True),
        sa.Column("channel_type", sa.String(length=24), nullable=False, server_default="email"),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="pending"),
        sa.Column("recipients", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("result_summary", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("triggered_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["revision_id"], ["revisions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["triggered_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("document_id", "trigger_key", name="uq_papyrus_dispatch_document_trigger"),
    )
    op.create_index(
        "idx_papyrus_dispatch_runs_document_created",
        "papyrus_dispatch_runs",
        ["document_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "idx_papyrus_dispatch_runs_entity_created",
        "papyrus_dispatch_runs",
        ["entity_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "idx_papyrus_dispatch_runs_status",
        "papyrus_dispatch_runs",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_papyrus_dispatch_runs_status", table_name="papyrus_dispatch_runs")
    op.drop_index("idx_papyrus_dispatch_runs_entity_created", table_name="papyrus_dispatch_runs")
    op.drop_index("idx_papyrus_dispatch_runs_document_created", table_name="papyrus_dispatch_runs")
    op.drop_table("papyrus_dispatch_runs")
