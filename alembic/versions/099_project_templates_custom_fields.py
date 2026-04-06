"""Project templates + custom fields (EAV)

Revision ID: 099_project_templates_custom_fields
Revises: 098_planner_source_task_id
Create Date: 2026-04-06
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "099_project_templates_custom_fields"
down_revision = "098_planner_source_task_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Project Templates
    op.create_table(
        "project_templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("name", sa.String(300), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("thumbnail_url", sa.String(500), nullable=True),
        sa.Column("snapshot", JSONB, nullable=False),
        sa.Column("source_project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("usage_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("idx_project_templates_entity", "project_templates", ["entity_id"])

    # Custom Field Definitions
    op.create_table(
        "custom_field_defs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("target_type", sa.String(50), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("field_type", sa.String(30), nullable=False, server_default="text"),
        sa.Column("options", JSONB, nullable=True),
        sa.Column("required", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("default_value", sa.Text(), nullable=True),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("entity_id", "target_type", "slug", name="uq_custom_field_def_slug"),
    )
    op.create_index("idx_custom_field_defs_entity_target", "custom_field_defs", ["entity_id", "target_type"])

    # Custom Field Values
    op.create_table(
        "custom_field_values",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("field_def_id", UUID(as_uuid=True), sa.ForeignKey("custom_field_defs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_type", sa.String(50), nullable=False),
        sa.Column("owner_id", UUID(as_uuid=True), nullable=False),
        sa.Column("value_text", sa.Text(), nullable=True),
        sa.Column("value_json", JSONB, nullable=True),
    )
    op.create_index("idx_custom_field_values_owner", "custom_field_values", ["owner_type", "owner_id"])
    op.create_index("idx_custom_field_values_field", "custom_field_values", ["field_def_id"])


def downgrade() -> None:
    op.drop_table("custom_field_values")
    op.drop_table("custom_field_defs")
    op.drop_table("project_templates")
