"""Add Papyrus forms, external links, and submissions tables.

Revision ID: 109_add_papyrus_forms_and_external_submissions
Revises: 108_add_papyrus_versioning_tables
Create Date: 2026-04-08
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID


revision = "109_add_papyrus_forms_and_external_submissions"
down_revision = "108_add_papyrus_versioning_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "papyrus_forms",
        sa.Column("entity_id", UUID(as_uuid=True), nullable=False),
        sa.Column("document_id", UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("schema_json", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("settings_json", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_papyrus_forms_entity_created", "papyrus_forms", ["entity_id", "created_at"], unique=False)

    op.create_table(
        "papyrus_external_links",
        sa.Column("entity_id", UUID(as_uuid=True), nullable=False),
        sa.Column("form_id", UUID(as_uuid=True), nullable=False),
        sa.Column("token_id", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("max_submissions", sa.Integer(), nullable=True),
        sa.Column("submission_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("prefill", JSONB(), nullable=True),
        sa.Column("allowed_ips", JSONB(), nullable=True),
        sa.Column("require_identity", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_revoked", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["form_id"], ["papyrus_forms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_id", name="uq_papyrus_external_link_token_id"),
    )
    op.create_index("idx_papyrus_external_links_form_created", "papyrus_external_links", ["form_id", "created_at"], unique=False)

    op.create_table(
        "papyrus_external_submissions",
        sa.Column("entity_id", UUID(as_uuid=True), nullable=False),
        sa.Column("form_id", UUID(as_uuid=True), nullable=False),
        sa.Column("token_id", sa.String(length=128), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("respondent", JSONB(), nullable=True),
        sa.Column("answers", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("ip_address", INET(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="'pending'"),
        sa.Column("processed_by", UUID(as_uuid=True), nullable=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["form_id"], ["papyrus_forms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["processed_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_papyrus_external_submissions_form_created",
        "papyrus_external_submissions",
        ["form_id", "submitted_at"],
        unique=False,
    )
    op.create_index("idx_papyrus_external_submissions_status", "papyrus_external_submissions", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_papyrus_external_submissions_status", table_name="papyrus_external_submissions")
    op.drop_index("idx_papyrus_external_submissions_form_created", table_name="papyrus_external_submissions")
    op.drop_table("papyrus_external_submissions")
    op.drop_index("idx_papyrus_external_links_form_created", table_name="papyrus_external_links")
    op.drop_table("papyrus_external_links")
    op.drop_index("idx_papyrus_forms_entity_created", table_name="papyrus_forms")
    op.drop_table("papyrus_forms")
