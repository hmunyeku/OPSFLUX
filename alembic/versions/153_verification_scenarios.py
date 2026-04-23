"""Support verification scenarios + per-run result rows.

Sprint 6. After a successful staging deploy the harness runs a suite
of Playwright scripts against the resulting URL. This migration adds:

  * `support_verification_scenarios` — reusable scripts (TypeScript or
    Python) with tags, criticality and smoke-test flag.
  * `support_agent_verification_results` — one row per scenario
    execution inside a run, with screenshots/video paths + pass/fail
    + error excerpt.

Revision ID: 153_verification_scenarios
Revises: 152_agent_harness_tables
Create Date: 2026-04-23
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "153_verification_scenarios"
down_revision = "152_agent_harness_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "support_verification_scenarios",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "entity_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("entities.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "tags",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "script_language",
            sa.String(16),
            nullable=False,
            server_default=sa.text("'typescript'"),
        ),
        sa.Column("script_content", sa.Text(), nullable=False),
        sa.Column(
            "expected_assertions",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("timeout_seconds", sa.Integer(), nullable=False, server_default=sa.text("60")),
        sa.Column("is_smoke_test", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "criticality",
            sa.String(16),
            nullable=False,
            server_default=sa.text("'important'"),
        ),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.CheckConstraint(
            "script_language IN ('typescript', 'python')",
            name="ck_scenario_language",
        ),
        sa.CheckConstraint(
            "criticality IN ('critical', 'important', 'nice_to_have')",
            name="ck_scenario_criticality",
        ),
    )
    op.create_index(
        "idx_scenarios_entity",
        "support_verification_scenarios",
        ["entity_id"],
    )
    op.create_index(
        "idx_scenarios_smoke",
        "support_verification_scenarios",
        ["is_smoke_test"],
        postgresql_where=sa.text("is_smoke_test = true"),
    )

    op.create_table(
        "support_agent_verification_results",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "agent_run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("support_agent_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "scenario_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("support_verification_scenarios.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("scenario_name", sa.String(255), nullable=False),
        sa.Column("criticality", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("error_excerpt", sa.Text(), nullable=True),
        sa.Column(
            "screenshots_paths",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("video_path", sa.Text(), nullable=True),
        sa.Column(
            "console_errors",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("target_url", sa.String(500), nullable=True),
        sa.Column(
            "started_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "ended_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'running', 'passed', 'failed', 'skipped', 'error')",
            name="ck_verification_result_status",
        ),
    )
    op.create_index(
        "idx_verification_results_run",
        "support_agent_verification_results",
        ["agent_run_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "idx_verification_results_run",
        table_name="support_agent_verification_results",
    )
    op.drop_table("support_agent_verification_results")
    op.drop_index("idx_scenarios_smoke", table_name="support_verification_scenarios")
    op.drop_index("idx_scenarios_entity", table_name="support_verification_scenarios")
    op.drop_table("support_verification_scenarios")
