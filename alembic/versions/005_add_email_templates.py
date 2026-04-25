"""Add email templates, versions, and links tables.

Revision ID: 005_add_email_templates
Revises: 004_add_tags_notes_attachments
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "005_add_email_templates"
down_revision = "004_add_tags_notes_attachments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── email_templates ──
    op.create_table(
        "email_templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("object_type", sa.String(50), nullable=False, server_default="system"),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("variables_schema", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "uq_email_template_entity_slug",
        "email_templates",
        ["entity_id", "slug"],
        unique=True,
    )

    # ── email_template_versions ──
    op.create_table(
        "email_template_versions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "template_id",
            UUID(as_uuid=True),
            sa.ForeignKey("email_templates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("language", sa.String(5), nullable=False, server_default="fr"),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("body_html", sa.Text, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "idx_etv_template_lang",
        "email_template_versions",
        ["template_id", "language"],
    )

    # ── email_template_links ──
    op.create_table(
        "email_template_links",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "template_id",
            UUID(as_uuid=True),
            sa.ForeignKey("email_templates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("link_type", sa.String(50), nullable=False),
        sa.Column("link_id", UUID(as_uuid=True), nullable=False),
    )
    op.create_index("idx_etl_template", "email_template_links", ["template_id"])
    op.create_index("idx_etl_target", "email_template_links", ["link_type", "link_id"])


def downgrade() -> None:
    op.drop_table("email_template_links")
    op.drop_table("email_template_versions")
    op.drop_table("email_templates")
