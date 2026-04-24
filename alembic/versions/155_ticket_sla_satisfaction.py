"""SLA tracking + satisfaction survey fields on support_tickets.

Adds the minimal columns required to (a) measure response/resolution
SLA compliance and (b) collect a post-resolution satisfaction rating:

  * `first_response_at` — timestamp of the first comment posted by
    anyone OTHER than the reporter. Computed server-side on comment
    creation; NULL until the first response. Used by the supervision
    dashboard to flag breached first-response SLA.

  * `satisfaction_rating` — integer 1..5 submitted by the reporter
    after the ticket is closed. NULL means no answer (yet or never).
  * `satisfaction_feedback` — optional free-text comment paired with
    the rating.
  * `satisfaction_submitted_at` — timestamp marking when the reporter
    submitted the survey. Also used for idempotency — the survey
    endpoint is a no-op if this is already set.

Revision ID: 155_ticket_sla_satisfaction
Revises: 154_agent_scheduler_config
Create Date: 2026-04-24
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "155_ticket_sla_satisfaction"
down_revision = "154_agent_scheduler_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "support_tickets",
        sa.Column(
            "first_response_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "support_tickets",
        sa.Column("satisfaction_rating", sa.Integer(), nullable=True),
    )
    op.add_column(
        "support_tickets",
        sa.Column("satisfaction_feedback", sa.Text(), nullable=True),
    )
    op.add_column(
        "support_tickets",
        sa.Column(
            "satisfaction_submitted_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=True,
        ),
    )
    # Constrain rating to 1..5 when set.
    op.create_check_constraint(
        "ck_ticket_satisfaction_rating",
        "support_tickets",
        "satisfaction_rating IS NULL OR (satisfaction_rating BETWEEN 1 AND 5)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_ticket_satisfaction_rating", "support_tickets", type_="check",
    )
    op.drop_column("support_tickets", "satisfaction_submitted_at")
    op.drop_column("support_tickets", "satisfaction_feedback")
    op.drop_column("support_tickets", "satisfaction_rating")
    op.drop_column("support_tickets", "first_response_at")
