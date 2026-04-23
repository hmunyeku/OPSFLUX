"""Agent harness tables — worker pool, runs, checkpoints, per-entity config.

Sprint 3 of the autonomous maintenance agent feature. Creates the four
tables that store every moving part of an agent run:

  * `agent_worker_pool` — one row per worker host, with heartbeat,
    capabilities and active-run counter. Claims happen via UPDATE
    with `FOR UPDATE SKIP LOCKED` against `support_agent_runs`.

  * `support_agent_runs` — canonical run record. All 7 phases of the
    agent, metrics (tokens, USD, wall time), snapshots of the
    MISSION.md and REPORT.json, and the audit trail (triggered_by,
    cancelled_by, approved_by).

  * `support_agent_phase_checkpoints` — one row per phase transition
    so the UI can render a stepper even if the run crashes halfway.

  * `support_agent_config` — a single per-entity row with the
    agent's behaviour: autonomy mode, trigger filters, deployment
    rules, budgets, forbidden path globs and circuit breaker state.

Nothing in this migration is enabled by default — the feature toggle
`enabled` on `support_agent_config` is false until an admin flips it.

Revision ID: 152_agent_harness_tables
Revises: 151_support_ticket_github_sync
Create Date: 2026-04-23
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "152_agent_harness_tables"
down_revision = "151_support_ticket_github_sync"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── agent_worker_pool ─────────────────────────────────────────
    op.create_table(
        "agent_worker_pool",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("worker_name", sa.String(255), nullable=False, unique=True),
        sa.Column("hostname", sa.String(255), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default=sa.text("'idle'")),
        sa.Column("current_run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "capabilities",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("max_parallel_runs", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("active_runs_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "last_heartbeat_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=True,
        ),
        sa.Column("total_runs_completed", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("total_runs_failed", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.CheckConstraint(
            "status IN ('idle', 'busy', 'offline', 'draining')",
            name="ck_worker_status",
        ),
    )
    op.create_index("idx_worker_status", "agent_worker_pool", ["status"])

    # ── support_agent_runs ────────────────────────────────────────
    op.create_table(
        "support_agent_runs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "ticket_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("support_tickets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "entity_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("entities.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(32), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("current_phase", sa.String(32), nullable=False, server_default=sa.text("'triage'")),
        sa.Column("autonomy_mode", sa.String(32), nullable=False),
        sa.Column("deployment_mode", sa.String(4), nullable=False, server_default=sa.text("'A'")),
        # Connectors used (snapshot at run start)
        sa.Column(
            "github_connection_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("integration_connections.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "agent_runner_connection_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("integration_connections.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "dokploy_staging_connection_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("integration_connections.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "dokploy_prod_connection_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("integration_connections.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # Worker claim
        sa.Column(
            "worker_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("agent_worker_pool.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # Outputs
        sa.Column("github_branch", sa.String(255), nullable=True),
        sa.Column("github_pr_number", sa.Integer(), nullable=True),
        sa.Column("github_pr_url", sa.Text(), nullable=True),
        sa.Column("github_commit_sha", sa.String(40), nullable=True),
        sa.Column("dokploy_deployment_id", sa.String(255), nullable=True),
        sa.Column("dokploy_deploy_url", sa.Text(), nullable=True),
        # Metrics
        sa.Column("llm_tokens_used", sa.BigInteger(), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "llm_cost_usd",
            sa.Numeric(10, 4),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("wall_time_seconds", sa.Integer(), nullable=True),
        # Artefacts
        sa.Column("worktree_path", sa.Text(), nullable=True),
        sa.Column("container_id", sa.String(255), nullable=True),
        sa.Column("artifacts_directory", sa.Text(), nullable=True),
        sa.Column("mission_md_content", sa.Text(), nullable=True),
        sa.Column(
            "report_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "failed_gates",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        # Timing
        sa.Column("started_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("ended_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
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
        # Audit
        sa.Column(
            "triggered_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "triggered_automatically",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "cancelled_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "approved_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("approved_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending','preparing','running','awaiting_human',"
            "'completed','failed','cancelled','rejected','failed_and_reverted')",
            name="ck_agent_run_status",
        ),
        sa.CheckConstraint(
            "current_phase IN ('triage','reproduction','diagnosis','fix','deploy',"
            "'verification','report','post_merge')",
            name="ck_agent_run_phase",
        ),
        sa.CheckConstraint(
            "autonomy_mode IN ('observation','recommendation','autonomous_with_approval')",
            name="ck_agent_autonomy",
        ),
        sa.CheckConstraint(
            "deployment_mode IN ('A','B','C')",
            name="ck_agent_deployment_mode",
        ),
    )
    op.create_index("idx_agent_runs_ticket", "support_agent_runs", ["ticket_id"])
    op.create_index("idx_agent_runs_status", "support_agent_runs", ["status"])
    op.create_index("idx_agent_runs_entity", "support_agent_runs", ["entity_id"])
    op.create_index(
        "idx_agent_runs_created",
        "support_agent_runs",
        [sa.text("created_at DESC")],
    )
    op.create_index(
        "idx_agent_runs_pending_fifo",
        "support_agent_runs",
        ["created_at"],
        postgresql_where=sa.text("status = 'pending'"),
    )

    # ── support_agent_phase_checkpoints ───────────────────────────
    op.create_table(
        "support_agent_phase_checkpoints",
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
        sa.Column("phase", sa.String(32), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("started_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("ended_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column(
            "artifacts",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("agent_log_excerpt", sa.Text(), nullable=True),
        sa.Column("tokens_used", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "cost_usd",
            sa.Numeric(10, 4),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "gate_results",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.CheckConstraint(
            "status IN ('pending','running','success','failed','skipped')",
            name="ck_checkpoint_status",
        ),
    )
    op.create_index("idx_checkpoints_run", "support_agent_phase_checkpoints", ["agent_run_id"])
    op.create_index("idx_checkpoints_phase", "support_agent_phase_checkpoints", ["phase"])

    # ── support_agent_config ──────────────────────────────────────
    op.create_table(
        "support_agent_config",
        sa.Column(
            "entity_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("entities.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        # Default connector selection
        sa.Column(
            "default_github_connection_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("integration_connections.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "default_runner_connection_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("integration_connections.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "default_dokploy_staging_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("integration_connections.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "default_dokploy_prod_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("integration_connections.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # Behaviour
        sa.Column(
            "default_autonomy_mode",
            sa.String(32),
            nullable=False,
            server_default=sa.text("'recommendation'"),
        ),
        sa.Column(
            "automatic_trigger_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "allow_direct_deployment",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "auto_trigger_filters",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "deployment_mode_rules",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        # Limits
        sa.Column("max_concurrent_runs", sa.Integer(), nullable=False, server_default=sa.text("2")),
        sa.Column(
            "monthly_budget_usd",
            sa.Numeric(10, 2),
            nullable=False,
            server_default=sa.text("500"),
        ),
        sa.Column("circuit_breaker_threshold", sa.Integer(), nullable=False, server_default=sa.text("5")),
        sa.Column("circuit_breaker_cooldown_hours", sa.Integer(), nullable=False, server_default=sa.text("24")),
        sa.Column("max_lines_modified_per_run", sa.Integer(), nullable=False, server_default=sa.text("500")),
        # Forbidden paths (list of glob patterns, JSON)
        sa.Column(
            "forbidden_path_patterns",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text(
                """'["**/migrations/**","**/auth/**","**/rbac/**",'
                   '"**/permissions/**","**/cost_centers/**","**/imputations/**",'
                   '"**/secrets/**",".env*","**/deploy-prod.yml","**/production/**"]'::jsonb"""
            ),
        ),
        # Circuit breaker state
        sa.Column(
            "current_consecutive_failures",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "circuit_breaker_tripped_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "current_month_spent_usd",
            sa.Numeric(10, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "current_month_start",
            sa.Date(),
            nullable=False,
            server_default=sa.text("CURRENT_DATE"),
        ),
        sa.Column(
            "updated_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )


def downgrade() -> None:
    op.drop_table("support_agent_config")
    op.drop_index("idx_checkpoints_phase", table_name="support_agent_phase_checkpoints")
    op.drop_index("idx_checkpoints_run", table_name="support_agent_phase_checkpoints")
    op.drop_table("support_agent_phase_checkpoints")
    op.drop_index("idx_agent_runs_pending_fifo", table_name="support_agent_runs")
    op.drop_index("idx_agent_runs_created", table_name="support_agent_runs")
    op.drop_index("idx_agent_runs_entity", table_name="support_agent_runs")
    op.drop_index("idx_agent_runs_status", table_name="support_agent_runs")
    op.drop_index("idx_agent_runs_ticket", table_name="support_agent_runs")
    op.drop_table("support_agent_runs")
    op.drop_index("idx_worker_status", table_name="agent_worker_pool")
    op.drop_table("agent_worker_pool")
