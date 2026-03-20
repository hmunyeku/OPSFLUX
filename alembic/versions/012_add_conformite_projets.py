"""Add Conformite (compliance) and Projets (project management) tables.

Tables: compliance_types, compliance_rules, compliance_records,
        projects, project_members, project_tasks, project_milestones.

Revision ID: 012_add_conformite_projets
Revises: 011_enrich_tiers_contacts
Create Date: 2026-03-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "012_add_conformite_projets"
down_revision: Union[str, None] = "011_enrich_tiers_contacts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── compliance_types ──────────────────────────────────────────
    op.create_table(
        "compliance_types",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("validity_days", sa.Integer, nullable=True),
        sa.Column("is_mandatory", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_compliance_types_entity", "compliance_types", ["entity_id"])
    op.create_index("idx_compliance_types_category", "compliance_types", ["category"])

    # ── compliance_rules ──────────────────────────────────────────
    op.create_table(
        "compliance_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("compliance_type_id", UUID(as_uuid=True), sa.ForeignKey("compliance_types.id"), nullable=False),
        sa.Column("target_type", sa.String(30), nullable=False),
        sa.Column("target_value", sa.String(200), nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_compliance_rules_type", "compliance_rules", ["compliance_type_id"])

    # ── compliance_records ────────────────────────────────────────
    op.create_table(
        "compliance_records",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("compliance_type_id", UUID(as_uuid=True), sa.ForeignKey("compliance_types.id"), nullable=False),
        sa.Column("owner_type", sa.String(50), nullable=False),
        sa.Column("owner_id", UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'valid'")),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("issuer", sa.String(200), nullable=True),
        sa.Column("reference_number", sa.String(100), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("verified_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_compliance_records_owner", "compliance_records", ["owner_type", "owner_id"])
    op.create_index("idx_compliance_records_type", "compliance_records", ["compliance_type_id"])
    op.create_index("idx_compliance_records_status", "compliance_records", ["status"])

    # ── projects ──────────────────────────────────────────────────
    op.create_table(
        "projects",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("name", sa.String(300), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'draft'")),
        sa.Column("priority", sa.String(10), nullable=False, server_default=sa.text("'medium'")),
        sa.Column("weather", sa.String(10), nullable=False, server_default=sa.text("'sunny'")),
        sa.Column("progress", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_end_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("budget", sa.Float, nullable=True),
        sa.Column("manager_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("parent_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tier_id", UUID(as_uuid=True), sa.ForeignKey("tiers.id"), nullable=True),
        sa.Column("asset_id", UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("archived", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_projects_entity", "projects", ["entity_id"])
    op.create_index("idx_projects_status", "projects", ["status"])
    op.create_index("idx_projects_manager", "projects", ["manager_id"])

    # ── project_members ───────────────────────────────────────────
    op.create_table(
        "project_members",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("contact_id", UUID(as_uuid=True), sa.ForeignKey("tier_contacts.id"), nullable=True),
        sa.Column("role", sa.String(20), nullable=False, server_default=sa.text("'member'")),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_project_members_project", "project_members", ["project_id"])

    # ── project_tasks ─────────────────────────────────────────────
    op.create_table(
        "project_tasks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("parent_id", UUID(as_uuid=True), sa.ForeignKey("project_tasks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("code", sa.String(50), nullable=True),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'todo'")),
        sa.Column("priority", sa.String(10), nullable=False, server_default=sa.text("'medium'")),
        sa.Column("assignee_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("progress", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("estimated_hours", sa.Float, nullable=True),
        sa.Column("actual_hours", sa.Float, nullable=True),
        sa.Column("order", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_project_tasks_project", "project_tasks", ["project_id"])
    op.create_index("idx_project_tasks_assignee", "project_tasks", ["assignee_id"])
    op.create_index("idx_project_tasks_status", "project_tasks", ["status"])

    # ── project_milestones ────────────────────────────────────────
    op.create_table(
        "project_milestones",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_project_milestones_project", "project_milestones", ["project_id"])


def downgrade() -> None:
    op.drop_index("idx_project_milestones_project", table_name="project_milestones")
    op.drop_table("project_milestones")

    op.drop_index("idx_project_tasks_status", table_name="project_tasks")
    op.drop_index("idx_project_tasks_assignee", table_name="project_tasks")
    op.drop_index("idx_project_tasks_project", table_name="project_tasks")
    op.drop_table("project_tasks")

    op.drop_index("idx_project_members_project", table_name="project_members")
    op.drop_table("project_members")

    op.drop_index("idx_projects_manager", table_name="projects")
    op.drop_index("idx_projects_status", table_name="projects")
    op.drop_index("idx_projects_entity", table_name="projects")
    op.drop_table("projects")

    op.drop_index("idx_compliance_records_status", table_name="compliance_records")
    op.drop_index("idx_compliance_records_type", table_name="compliance_records")
    op.drop_index("idx_compliance_records_owner", table_name="compliance_records")
    op.drop_table("compliance_records")

    op.drop_index("idx_compliance_rules_type", table_name="compliance_rules")
    op.drop_table("compliance_rules")

    op.drop_index("idx_compliance_types_category", table_name="compliance_types")
    op.drop_index("idx_compliance_types_entity", table_name="compliance_types")
    op.drop_table("compliance_types")
