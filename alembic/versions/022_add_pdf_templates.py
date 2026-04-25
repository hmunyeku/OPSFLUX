"""Add PDF template tables (pdf_templates, pdf_template_versions).

PDF templates follow the same pattern as email templates but produce
PDF documents instead of emails. Used for ADS tickets, manifests,
document exports, and voyage manifests.

Revision ID: 022_add_pdf_templates
Revises: 021_add_pax_duplicate_constraints
Create Date: 2026-03-18
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "022_add_pdf_templates"
down_revision: Union[str, None] = "021_add_pax_duplicate_constraints"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── pdf_templates ─────────────────────────────────────────────────
    op.create_table(
        "pdf_templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=True),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("object_type", sa.String(50), nullable=False, server_default="system"),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("variables_schema", JSONB, nullable=True),
        # Page layout
        sa.Column("page_size", sa.String(10), nullable=False, server_default="A4"),
        sa.Column("orientation", sa.String(10), nullable=False, server_default="portrait"),
        sa.Column("margin_top", sa.Integer, nullable=False, server_default="15"),
        sa.Column("margin_right", sa.Integer, nullable=False, server_default="12"),
        sa.Column("margin_bottom", sa.Integer, nullable=False, server_default="15"),
        sa.Column("margin_left", sa.Integer, nullable=False, server_default="12"),
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index(
        "uq_pdf_template_entity_slug",
        "pdf_templates",
        ["entity_id", "slug"],
        unique=True,
    )

    # ── pdf_template_versions ─────────────────────────────────────────
    op.create_table(
        "pdf_template_versions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "template_id",
            UUID(as_uuid=True),
            sa.ForeignKey("pdf_templates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version_number", sa.Integer, nullable=False, server_default="1"),
        sa.Column("language", sa.String(5), nullable=False, server_default="fr"),
        sa.Column("body_html", sa.Text, nullable=False),
        sa.Column("header_html", sa.Text, nullable=True),
        sa.Column("footer_html", sa.Text, nullable=True),
        sa.Column("is_published", sa.Boolean, nullable=False, server_default="false"),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index(
        "idx_ptv_template_lang",
        "pdf_template_versions",
        ["template_id", "language"],
    )


def downgrade() -> None:
    op.drop_index("idx_ptv_template_lang", table_name="pdf_template_versions")
    op.drop_table("pdf_template_versions")
    op.drop_index("uq_pdf_template_entity_slug", table_name="pdf_templates")
    op.drop_table("pdf_templates")
