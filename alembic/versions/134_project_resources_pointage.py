"""Project resources & time tracking.

Revision ID: 134_project_resources_pointage
Revises: 133_currency_rates
Create Date: 2026-04-25

Extends ProjectMember with allocation, period, rate, specialty.
Adds ProjectTimeEntry for daily time tracking with workflow
(draft → submitted → validated | rejected) and rate snapshot for
historical cost integrity.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "134_project_resources_pointage"
down_revision = "133_currency_rates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Extend ProjectMember ──
    op.add_column("project_members", sa.Column("allocation_pct", sa.Integer, nullable=False, server_default="100"))
    op.add_column("project_members", sa.Column("start_date", sa.Date))
    op.add_column("project_members", sa.Column("end_date", sa.Date))
    op.add_column("project_members", sa.Column("hourly_rate", sa.Float))
    op.add_column("project_members", sa.Column("daily_rate", sa.Float))
    op.add_column("project_members", sa.Column("currency", sa.String(10)))
    op.add_column("project_members", sa.Column("specialty", sa.String(150)))
    op.add_column("project_members", sa.Column("notes", sa.Text))
    op.create_index("idx_project_members_user", "project_members", ["user_id"])
    op.create_index("idx_project_members_contact", "project_members", ["contact_id"])

    # ── ProjectTimeEntry ──
    op.create_table(
        "project_time_entries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("member_id", UUID(as_uuid=True), sa.ForeignKey("project_members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", UUID(as_uuid=True), sa.ForeignKey("project_tasks.id", ondelete="SET NULL")),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("hours", sa.Float, nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("rate_snapshot", sa.Float),
        sa.Column("currency_snapshot", sa.String(10)),
        sa.Column("submitted_at", sa.DateTime(timezone=True)),
        sa.Column("approved_by", UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("approved_at", sa.DateTime(timezone=True)),
        sa.Column("rejected_reason", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_pte_project_date", "project_time_entries", ["project_id", "date"])
    op.create_index("idx_pte_member_date", "project_time_entries", ["member_id", "date"])
    op.create_index("idx_pte_status", "project_time_entries", ["status"])


def downgrade() -> None:
    op.drop_index("idx_pte_status", table_name="project_time_entries")
    op.drop_index("idx_pte_member_date", table_name="project_time_entries")
    op.drop_index("idx_pte_project_date", table_name="project_time_entries")
    op.drop_table("project_time_entries")

    op.drop_index("idx_project_members_contact", table_name="project_members")
    op.drop_index("idx_project_members_user", table_name="project_members")
    op.drop_column("project_members", "notes")
    op.drop_column("project_members", "specialty")
    op.drop_column("project_members", "currency")
    op.drop_column("project_members", "daily_rate")
    op.drop_column("project_members", "hourly_rate")
    op.drop_column("project_members", "end_date")
    op.drop_column("project_members", "start_date")
    op.drop_column("project_members", "allocation_pct")
