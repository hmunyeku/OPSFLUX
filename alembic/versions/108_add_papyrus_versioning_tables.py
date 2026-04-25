"""Add Papyrus versioning and workflow audit tables.

Revision ID: 108_add_papyrus_versioning_tables
Revises: 107_mcp_personal_token_context
Create Date: 2026-04-08
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision = "108_add_papyrus_versioning_tables"
down_revision = "107_mcp_personal_token_context"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "papyrus_versions",
        sa.Column("entity_id", UUID(as_uuid=True), nullable=False),
        sa.Column("document_id", UUID(as_uuid=True), nullable=False),
        sa.Column("revision_id", UUID(as_uuid=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("patch_type", sa.String(length=16), nullable=False),
        sa.Column("payload", JSONB(), nullable=False),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("workflow_tag", sa.String(length=64), nullable=True),
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("patch_type IN ('snapshot', 'diff')", name="ck_papyrus_version_patch_type"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["revision_id"], ["revisions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("document_id", "version", name="uq_papyrus_version_document_version"),
    )
    op.create_index(
        "idx_papyrus_versions_document_version",
        "papyrus_versions",
        ["document_id", "version"],
        unique=False,
    )
    op.create_index(
        "idx_papyrus_versions_entity_created",
        "papyrus_versions",
        ["entity_id", "created_at"],
        unique=False,
    )

    op.create_table(
        "papyrus_workflow_events",
        sa.Column("entity_id", UUID(as_uuid=True), nullable=False),
        sa.Column("document_id", UUID(as_uuid=True), nullable=False),
        sa.Column("from_state", sa.String(length=64), nullable=True),
        sa.Column("to_state", sa.String(length=64), nullable=False),
        sa.Column("actor_id", UUID(as_uuid=True), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("version_tag", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_papyrus_workflow_events_document_created",
        "papyrus_workflow_events",
        ["document_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "idx_papyrus_workflow_events_entity_created",
        "papyrus_workflow_events",
        ["entity_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_papyrus_workflow_events_entity_created", table_name="papyrus_workflow_events")
    op.drop_index("idx_papyrus_workflow_events_document_created", table_name="papyrus_workflow_events")
    op.drop_table("papyrus_workflow_events")
    op.drop_index("idx_papyrus_versions_entity_created", table_name="papyrus_versions")
    op.drop_index("idx_papyrus_versions_document_version", table_name="papyrus_versions")
    op.drop_table("papyrus_versions")
