"""Add support tables — tickets, comments, status history.

Revision ID: 070_support
Revises: 069
Create Date: 2026-03-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision = "070_support"
down_revision = "069"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "support_tickets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("reference", sa.String(30), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("ticket_type", sa.String(20), nullable=False, server_default="bug"),
        sa.Column("priority", sa.String(20), nullable=False, server_default="medium"),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("source_url", sa.String(500), nullable=True),
        sa.Column("browser_info", JSONB, nullable=True),
        sa.Column("reporter_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("assignee_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolution_notes", sa.Text, nullable=True),
        sa.Column("tags", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), onupdate=sa.text("now()"), nullable=False),
        sa.Column("archived", sa.Boolean, server_default="false", nullable=False),
        sa.CheckConstraint("ticket_type IN ('bug', 'improvement', 'question', 'other')", name="ck_ticket_type"),
        sa.CheckConstraint("priority IN ('low', 'medium', 'high', 'critical')", name="ck_ticket_priority"),
        sa.CheckConstraint("status IN ('open', 'in_progress', 'waiting_info', 'resolved', 'closed', 'rejected')", name="ck_ticket_status"),
    )
    op.create_index("idx_support_tickets_entity", "support_tickets", ["entity_id"])
    op.create_index("idx_support_tickets_status", "support_tickets", ["status"])
    op.create_index("idx_support_tickets_reporter", "support_tickets", ["reporter_id"])
    op.create_index("idx_support_tickets_assignee", "support_tickets", ["assignee_id"])
    op.create_index("idx_support_tickets_reference", "support_tickets", ["reference"])

    op.create_table(
        "ticket_comments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("ticket_id", UUID(as_uuid=True), sa.ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("is_internal", sa.Boolean, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), onupdate=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_ticket_comments_ticket", "ticket_comments", ["ticket_id"])

    op.create_table(
        "ticket_status_history",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("ticket_id", UUID(as_uuid=True), sa.ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("old_status", sa.String(20), nullable=True),
        sa.Column("new_status", sa.String(20), nullable=False),
        sa.Column("changed_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_status_history_ticket", "ticket_status_history", ["ticket_id"])


def downgrade() -> None:
    op.drop_table("ticket_status_history")
    op.drop_table("ticket_comments")
    op.drop_table("support_tickets")
