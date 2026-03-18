"""Add missing columns to workflow tables.

The workflow engine API routes expect entity_id, description, status,
and created_by columns on workflow_definitions and workflow_instances.
These columns were added to the SQLAlchemy models but not to the DB.

Revision ID: 009_add_workflow_columns
Revises: 008_add_dashboard_tables
Create Date: 2026-03-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "009_add_workflow_columns"
down_revision: Union[str, None] = "008_add_dashboard_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── workflow_definitions: add entity_id, description, status, created_by ──

    # 1. Add entity_id as nullable first (will backfill, then set NOT NULL)
    op.add_column(
        "workflow_definitions",
        sa.Column("entity_id", UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "workflow_definitions",
        sa.Column("description", sa.Text(), nullable=True),
    )
    op.add_column(
        "workflow_definitions",
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
    )
    op.add_column(
        "workflow_definitions",
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
    )

    # Backfill entity_id from first entity (dev environment)
    op.execute(
        "UPDATE workflow_definitions SET entity_id = ("
        "  SELECT id FROM entities ORDER BY created_at LIMIT 1"
        ") WHERE entity_id IS NULL"
    )

    # Now set NOT NULL and add FK
    op.alter_column("workflow_definitions", "entity_id", nullable=False)
    op.create_foreign_key(
        "fk_wf_def_entity",
        "workflow_definitions", "entities",
        ["entity_id"], ["id"],
    )
    op.create_foreign_key(
        "fk_wf_def_created_by",
        "workflow_definitions", "users",
        ["created_by"], ["id"],
    )

    # Drop the global unique constraint on slug (now per-entity)
    op.drop_constraint("workflow_definitions_slug_key", "workflow_definitions", type_="unique")

    # Add composite indexes
    op.create_index("idx_wf_def_entity", "workflow_definitions", ["entity_id"])
    op.create_index("idx_wf_def_entity_slug", "workflow_definitions", ["entity_id", "slug"])

    # ── workflow_instances: add entity_id, created_by ──

    op.add_column(
        "workflow_instances",
        sa.Column("entity_id", UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "workflow_instances",
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
    )

    # Backfill entity_id from first entity
    op.execute(
        "UPDATE workflow_instances SET entity_id = ("
        "  SELECT id FROM entities ORDER BY created_at LIMIT 1"
        ") WHERE entity_id IS NULL"
    )

    # Set NOT NULL and add FKs
    op.alter_column("workflow_instances", "entity_id", nullable=False)
    op.create_foreign_key(
        "fk_wf_inst_entity",
        "workflow_instances", "entities",
        ["entity_id"], ["id"],
    )
    op.create_foreign_key(
        "fk_wf_inst_created_by",
        "workflow_instances", "users",
        ["created_by"], ["id"],
    )

    # Add indexes
    op.create_index("idx_wf_inst_entity", "workflow_instances", ["entity_id"])
    op.create_index("idx_wf_inst_definition", "workflow_instances", ["workflow_definition_id"])


def downgrade() -> None:
    # workflow_instances
    op.drop_index("idx_wf_inst_definition", "workflow_instances")
    op.drop_index("idx_wf_inst_entity", "workflow_instances")
    op.drop_constraint("fk_wf_inst_created_by", "workflow_instances", type_="foreignkey")
    op.drop_constraint("fk_wf_inst_entity", "workflow_instances", type_="foreignkey")
    op.drop_column("workflow_instances", "created_by")
    op.drop_column("workflow_instances", "entity_id")

    # workflow_definitions
    op.drop_index("idx_wf_def_entity_slug", "workflow_definitions")
    op.drop_index("idx_wf_def_entity", "workflow_definitions")
    op.create_unique_constraint("workflow_definitions_slug_key", "workflow_definitions", ["slug"])
    op.drop_constraint("fk_wf_def_created_by", "workflow_definitions", type_="foreignkey")
    op.drop_constraint("fk_wf_def_entity", "workflow_definitions", type_="foreignkey")
    op.drop_column("workflow_definitions", "created_by")
    op.drop_column("workflow_definitions", "status")
    op.drop_column("workflow_definitions", "description")
    op.drop_column("workflow_definitions", "entity_id")
