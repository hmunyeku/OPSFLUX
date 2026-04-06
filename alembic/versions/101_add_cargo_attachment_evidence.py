"""add cargo attachment evidence

Revision ID: 101_add_cargo_attachment_evidence
Revises: 100_add_travelwiz_cargo_dossier_fields
Create Date: 2026-04-06
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "101_add_cargo_attachment_evidence"
down_revision = "100_add_travelwiz_cargo_dossier_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cargo_attachment_evidences",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("cargo_item_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("attachment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("evidence_type", sa.String(length=40), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(["attachment_id"], ["attachments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["cargo_item_id"], ["cargo_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["entity_id"], ["entities.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("attachment_id", name="uq_cargo_attachment_evidence_attachment"),
    )
    op.create_index("idx_cargo_attachment_evidence_cargo", "cargo_attachment_evidences", ["cargo_item_id"])
    op.create_index("idx_cargo_attachment_evidence_type", "cargo_attachment_evidences", ["evidence_type"])


def downgrade() -> None:
    op.drop_index("idx_cargo_attachment_evidence_type", table_name="cargo_attachment_evidences")
    op.drop_index("idx_cargo_attachment_evidence_cargo", table_name="cargo_attachment_evidences")
    op.drop_table("cargo_attachment_evidences")
