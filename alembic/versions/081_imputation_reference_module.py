"""Add imputation reference module tables.

Revision ID: 081_imputation_reference_module
Revises: 080_drop_mcp_token_created_by_fk
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID


revision = "081_imputation_reference_module"
down_revision = "080_drop_mcp_token_created_by_fk"


def upgrade() -> None:
    op.create_table(
        "imputation_otp_templates",
        sa.Column("id", PG_UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", PG_UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("rubrics", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
    )
    op.create_index(
        "uq_imputation_otp_template_entity_code",
        "imputation_otp_templates",
        ["entity_id", "code"],
        unique=True,
    )

    op.create_table(
        "imputation_references",
        sa.Column("id", PG_UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", PG_UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("imputation_type", sa.String(length=20), nullable=False, server_default="OPEX"),
        sa.Column("otp_policy", sa.String(length=20), nullable=False, server_default="forbidden"),
        sa.Column("otp_template_id", PG_UUID(as_uuid=True), sa.ForeignKey("imputation_otp_templates.id", ondelete="SET NULL"), nullable=True),
        sa.Column("default_project_id", PG_UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("default_cost_center_id", PG_UUID(as_uuid=True), sa.ForeignKey("cost_centers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("valid_from", sa.Date(), nullable=True),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
    )
    op.create_index(
        "uq_imputation_reference_entity_code",
        "imputation_references",
        ["entity_id", "code"],
        unique=True,
    )
    op.create_index(
        "idx_imputation_reference_type",
        "imputation_references",
        ["entity_id", "imputation_type"],
        unique=False,
    )

    op.create_table(
        "imputation_assignments",
        sa.Column("id", PG_UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", PG_UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("imputation_reference_id", PG_UUID(as_uuid=True), sa.ForeignKey("imputation_references.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_type", sa.String(length=30), nullable=False),
        sa.Column("target_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("valid_from", sa.Date(), nullable=True),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
    )
    op.create_index(
        "idx_imputation_assignment_entity_target",
        "imputation_assignments",
        ["entity_id", "target_type", "target_id"],
        unique=False,
    )
    op.create_index(
        "idx_imputation_assignment_reference",
        "imputation_assignments",
        ["imputation_reference_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_imputation_assignment_reference", table_name="imputation_assignments")
    op.drop_index("idx_imputation_assignment_entity_target", table_name="imputation_assignments")
    op.drop_table("imputation_assignments")

    op.drop_index("idx_imputation_reference_type", table_name="imputation_references")
    op.drop_index("uq_imputation_reference_entity_code", table_name="imputation_references")
    op.drop_table("imputation_references")

    op.drop_index("uq_imputation_otp_template_entity_code", table_name="imputation_otp_templates")
    op.drop_table("imputation_otp_templates")
