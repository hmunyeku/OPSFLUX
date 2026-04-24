"""Scheduler + daily digest fields on support_agent_config.

Adds the knobs the admin can tune from the UI to run the agent
autonomously inside a time window and receive a daily summary:

  * `auto_window_start_hour` / `auto_window_end_hour` — UTC hours
    [0-23]. The scheduler only auto-triggers runs when the current
    hour falls inside this range. A value of `NULL` disables the
    window check. Wrap-around is supported (start=23, end=6 means
    23:00 → 06:00 next day).
  * `auto_max_runs_per_window` — hard cap so a broken agent can't
    burn the whole budget overnight.
  * `auto_report_email` — single email address that receives the
    daily digest and alerts. The simplest useful default.
  * `auto_report_hour_utc` — when to send the digest (default 7 UTC
    = morning French time).
  * `last_digest_sent_at` — idempotency marker so the scheduler
    doesn't re-send if multiple workers wake at the same minute.

Revision ID: 154_agent_scheduler_config
Revises: 153_verification_scenarios
Create Date: 2026-04-24
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "154_agent_scheduler_config"
down_revision = "153_verification_scenarios"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "support_agent_config",
        sa.Column("auto_window_start_hour", sa.Integer(), nullable=True),
    )
    op.add_column(
        "support_agent_config",
        sa.Column("auto_window_end_hour", sa.Integer(), nullable=True),
    )
    op.add_column(
        "support_agent_config",
        sa.Column(
            "auto_max_runs_per_window",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("3"),
        ),
    )
    op.add_column(
        "support_agent_config",
        sa.Column("auto_report_email", sa.String(255), nullable=True),
    )
    op.add_column(
        "support_agent_config",
        sa.Column(
            "auto_report_hour_utc",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("7"),
        ),
    )
    op.add_column(
        "support_agent_config",
        sa.Column(
            "last_digest_sent_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("support_agent_config", "last_digest_sent_at")
    op.drop_column("support_agent_config", "auto_report_hour_utc")
    op.drop_column("support_agent_config", "auto_report_email")
    op.drop_column("support_agent_config", "auto_max_runs_per_window")
    op.drop_column("support_agent_config", "auto_window_end_hour")
    op.drop_column("support_agent_config", "auto_window_start_hour")
