"""Add GitHub sync columns to support_tickets + ticket_comments.

Sprint 2 of the autonomous maintenance agent feature. Binds each ticket
to an optional GitHub Issue so comments, status and labels can flow both
ways:

  * `github_connection_id` → which `integration_connections` row owns
    the sync for this ticket (an org may run several GitHub connectors
    for different repos, so we store the binding per-ticket rather than
    globally).
  * `github_issue_number` / `github_pr_number` — canonical references
    on the remote side.
  * `github_sync_enabled` — admin toggle per ticket. Lets a user disable
    mirroring on individual tickets without disabling the connector.
  * `github_issue_url` / `github_pr_url` — cached for UI without another
    API roundtrip.

On `ticket_comments` we add `github_comment_id` and `external_source`
so we can dedupe round-trips: when a webhook-triggered mirror creates a
new comment, we store the GitHub comment id; the next push back up
looks this up and skips it to avoid loops.

Revision ID: 151_support_ticket_github_sync
Revises: 150_integration_connections
Create Date: 2026-04-23
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "151_support_ticket_github_sync"
down_revision = "150_integration_connections"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # support_tickets
    op.add_column(
        "support_tickets",
        sa.Column(
            "github_connection_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("integration_connections.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "support_tickets",
        sa.Column("github_issue_number", sa.Integer(), nullable=True),
    )
    op.add_column(
        "support_tickets",
        sa.Column("github_issue_url", sa.String(500), nullable=True),
    )
    op.add_column(
        "support_tickets",
        sa.Column("github_pr_number", sa.Integer(), nullable=True),
    )
    op.add_column(
        "support_tickets",
        sa.Column("github_pr_url", sa.String(500), nullable=True),
    )
    op.add_column(
        "support_tickets",
        sa.Column(
            "github_sync_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "support_tickets",
        sa.Column(
            "github_last_synced_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=True,
        ),
    )
    op.create_index(
        "idx_support_tickets_github_issue",
        "support_tickets",
        ["github_connection_id", "github_issue_number"],
        unique=True,
        postgresql_where=sa.text("github_issue_number IS NOT NULL"),
    )

    # ticket_comments
    op.add_column(
        "ticket_comments",
        sa.Column("github_comment_id", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "ticket_comments",
        sa.Column("external_source", sa.String(32), nullable=True),
    )
    op.create_index(
        "idx_ticket_comments_github_id",
        "ticket_comments",
        ["github_comment_id"],
        unique=False,
        postgresql_where=sa.text("github_comment_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("idx_ticket_comments_github_id", table_name="ticket_comments")
    op.drop_column("ticket_comments", "external_source")
    op.drop_column("ticket_comments", "github_comment_id")
    op.drop_index("idx_support_tickets_github_issue", table_name="support_tickets")
    op.drop_column("support_tickets", "github_last_synced_at")
    op.drop_column("support_tickets", "github_sync_enabled")
    op.drop_column("support_tickets", "github_pr_url")
    op.drop_column("support_tickets", "github_pr_number")
    op.drop_column("support_tickets", "github_issue_url")
    op.drop_column("support_tickets", "github_issue_number")
    op.drop_column("support_tickets", "github_connection_id")
