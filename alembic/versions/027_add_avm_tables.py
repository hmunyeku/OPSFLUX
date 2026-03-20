"""Add Avis de Mission (AVM) tables.

New tables:
  mission_notices         — main AVM dossier
  mission_programs        — program lines (activities per site)
  mission_program_pax     — PAX per program line
  mission_preparation_tasks — preparation tasks (visa, badge, etc.)
  mission_stakeholders    — stakeholders for notifications

Revision ID: 027
Revises: 026
Create Date: 2026-03-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "027"
down_revision: Union[str, None] = "026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ══════════════════════════════════════════════════════════════
    # mission_notices (AVM)
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "mission_notices",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("reference", sa.String(50), unique=True, nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="draft"),
        sa.Column("planned_start_date", sa.Date, nullable=True),
        sa.Column("planned_end_date", sa.Date, nullable=True),
        sa.Column("requires_badge", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("requires_epi", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("requires_visa", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("eligible_displacement_allowance", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("epi_measurements", JSONB, nullable=True, server_default=sa.text("'{}'")),
        sa.Column("global_attachments_config", JSONB, nullable=True, server_default=sa.text("'[]'")),
        sa.Column("per_pax_attachments_config", JSONB, nullable=True, server_default=sa.text("'[]'")),
        sa.Column("mission_type", sa.String(50), nullable=False, server_default="standard"),
        sa.Column("archived", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("cancellation_reason", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "status IN ('draft','in_preparation','active','ready','completed','cancelled')",
            name="ck_avm_status",
        ),
        sa.CheckConstraint(
            "mission_type IN ('standard','vip','regulatory','emergency')",
            name="ck_avm_mission_type",
        ),
    )
    op.create_index("idx_avm_entity", "mission_notices", ["entity_id", "status"])
    op.create_index("idx_avm_creator", "mission_notices", ["created_by"])

    # ══════════════════════════════════════════════════════════════
    # mission_programs
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "mission_programs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("mission_notice_id", UUID(as_uuid=True), sa.ForeignKey("mission_notices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_index", sa.SmallInteger, nullable=False, server_default="0"),
        sa.Column("activity_description", sa.Text, nullable=False),
        sa.Column("activity_type", sa.String(50), nullable=False, server_default="visit"),
        sa.Column("site_asset_id", UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=True),
        sa.Column("planned_start_date", sa.Date, nullable=True),
        sa.Column("planned_end_date", sa.Date, nullable=True),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("generated_ads_id", UUID(as_uuid=True), sa.ForeignKey("ads.id"), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.UniqueConstraint("mission_notice_id", "order_index", name="uq_mission_program_order"),
        sa.CheckConstraint(
            "activity_type IN ('visit','meeting','inspection','training','handover','other')",
            name="ck_mission_program_activity",
        ),
    )
    op.create_index("idx_mission_program", "mission_programs", ["mission_notice_id"])

    # ══════════════════════════════════════════════════════════════
    # mission_program_pax
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "mission_program_pax",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("mission_program_id", UUID(as_uuid=True), sa.ForeignKey("mission_programs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pax_id", UUID(as_uuid=True), sa.ForeignKey("pax_profiles.id"), nullable=False),
        sa.Column("role_in_mission", sa.String(100), nullable=True),
        sa.UniqueConstraint("mission_program_id", "pax_id", name="uq_mission_program_pax"),
    )

    # ══════════════════════════════════════════════════════════════
    # mission_preparation_tasks
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "mission_preparation_tasks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("mission_notice_id", UUID(as_uuid=True), sa.ForeignKey("mission_notices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("task_type", sa.String(50), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending"),
        sa.Column("assigned_to_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("linked_ads_id", UUID(as_uuid=True), sa.ForeignKey("ads.id"), nullable=True),
        sa.Column("due_date", sa.Date, nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("auto_generated", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending','in_progress','completed','cancelled','blocked','na')",
            name="ck_mission_prep_status",
        ),
        sa.CheckConstraint(
            "task_type IN ('visa','badge','epi_order','allowance','ads_creation',"
            "'document_collection','meeting_booking','briefing','other')",
            name="ck_mission_prep_type",
        ),
    )
    op.create_index("idx_mission_prep", "mission_preparation_tasks", ["mission_notice_id", "status"])

    # ══════════════════════════════════════════════════════════════
    # mission_stakeholders
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "mission_stakeholders",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("mission_notice_id", UUID(as_uuid=True), sa.ForeignKey("mission_notices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("external_name", sa.String(200), nullable=True),
        sa.Column("external_email", sa.String(200), nullable=True),
        sa.Column("notification_level", sa.String(20), nullable=False, server_default="summary"),
        sa.UniqueConstraint("mission_notice_id", "user_id", name="uq_mission_stakeholder"),
        sa.CheckConstraint(
            "notification_level IN ('full','summary','milestone')",
            name="ck_stakeholder_notif_level",
        ),
    )


def downgrade() -> None:
    op.drop_table("mission_stakeholders")
    op.drop_table("mission_preparation_tasks")
    op.drop_table("mission_program_pax")
    op.drop_table("mission_programs")
    op.drop_table("mission_notices")
