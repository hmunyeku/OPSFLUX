"""Add ticket_todos table and attachment_ids to ticket_comments.

Revision ID: 071_todos
Revises: 070_support
Create Date: 2026-03-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision = "071_todos"
down_revision = "070_support"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add attachment_ids JSONB column to ticket_comments
    op.add_column("ticket_comments", sa.Column("attachment_ids", JSONB, nullable=True))

    # Create ticket_todos table
    op.create_table(
        "ticket_todos",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("ticket_id", UUID(as_uuid=True), sa.ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("completed", sa.Boolean, server_default="false", nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("order", sa.Integer, server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index("idx_ticket_todos_ticket", "ticket_todos", ["ticket_id"])


def downgrade() -> None:
    op.drop_table("ticket_todos")
    op.drop_column("ticket_comments", "attachment_ids")
