"""Add compliance authorization centers.

Revision ID: 188_compliance_authorization_centers
Revises: 187_project_scope_change_attachment_type
Create Date: 2026-05-21
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "188_compliance_authorization_centers"
down_revision = "187_project_scope_change_attachment_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tiers",
        sa.Column(
            "is_authorization_center",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column("tiers", sa.Column("authorization_center_code", sa.String(length=80), nullable=True))
    op.add_column("tiers", sa.Column("certificate_verification_url", sa.String(length=500), nullable=True))

    op.add_column(
        "compliance_records",
        sa.Column("issuer_tier_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_compliance_records_issuer_tier_id_tiers",
        "compliance_records",
        "tiers",
        ["issuer_tier_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("idx_compliance_records_issuer_tier", "compliance_records", ["issuer_tier_id"])

    op.create_table(
        "compliance_type_authorized_centers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("compliance_type_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tier_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["entity_id"], ["entities.id"]),
        sa.ForeignKeyConstraint(["compliance_type_id"], ["compliance_types.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tier_id"], ["tiers.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("entity_id", "compliance_type_id", "tier_id", name="uq_compliance_type_authorized_centers"),
    )
    op.create_index(
        "idx_compliance_authorized_centers_entity",
        "compliance_type_authorized_centers",
        ["entity_id"],
    )
    op.create_index(
        "idx_compliance_authorized_centers_type",
        "compliance_type_authorized_centers",
        ["compliance_type_id"],
    )
    op.create_index(
        "idx_compliance_authorized_centers_tier",
        "compliance_type_authorized_centers",
        ["tier_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_compliance_authorized_centers_tier", table_name="compliance_type_authorized_centers")
    op.drop_index("idx_compliance_authorized_centers_type", table_name="compliance_type_authorized_centers")
    op.drop_index("idx_compliance_authorized_centers_entity", table_name="compliance_type_authorized_centers")
    op.drop_table("compliance_type_authorized_centers")

    op.drop_index("idx_compliance_records_issuer_tier", table_name="compliance_records")
    op.drop_constraint("fk_compliance_records_issuer_tier_id_tiers", "compliance_records", type_="foreignkey")
    op.drop_column("compliance_records", "issuer_tier_id")

    op.drop_column("tiers", "certificate_verification_url")
    op.drop_column("tiers", "authorization_center_code")
    op.drop_column("tiers", "is_authorization_center")
