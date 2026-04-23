"""Autonomous maintenance agent ORM models.

Sprint 3+ — stores the four components of a run's lifecycle:

  * `AgentWorkerPool` — one row per worker host, heartbeat + capability
  * `SupportAgentRun` — canonical run record, 7 phases, metrics, audit
  * `SupportAgentPhaseCheckpoint` — per-phase durations + gate results
  * `SupportAgentConfig` — per-entity behaviour (one row per entity)

Kept in a dedicated module to avoid ballooning `common.py` further.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID as PyUUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class AgentWorkerPool(UUIDPrimaryKeyMixin, Base):
    """A worker daemon capable of running maintenance agent jobs."""
    __tablename__ = "agent_worker_pool"
    __table_args__ = (
        CheckConstraint(
            "status IN ('idle','busy','offline','draining')",
            name="ck_worker_status",
        ),
        Index("idx_worker_status", "status"),
    )

    worker_name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hostname: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="idle")
    current_run_id: Mapped[PyUUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    capabilities: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="'[]'")
    max_parallel_runs: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    active_runs_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    total_runs_completed: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    total_runs_failed: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class SupportAgentRun(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A single maintenance agent run on a ticket."""
    __tablename__ = "support_agent_runs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','preparing','running','awaiting_human',"
            "'completed','failed','cancelled','rejected','failed_and_reverted')",
            name="ck_agent_run_status",
        ),
        CheckConstraint(
            "current_phase IN ('triage','reproduction','diagnosis','fix','deploy',"
            "'verification','report','post_merge')",
            name="ck_agent_run_phase",
        ),
        CheckConstraint(
            "autonomy_mode IN ('observation','recommendation','autonomous_with_approval')",
            name="ck_agent_autonomy",
        ),
        CheckConstraint(
            "deployment_mode IN ('A','B','C')",
            name="ck_agent_deployment_mode",
        ),
        Index("idx_agent_runs_ticket", "ticket_id"),
        Index("idx_agent_runs_status", "status"),
        Index("idx_agent_runs_entity", "entity_id"),
    )

    ticket_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("support_tickets.id", ondelete="CASCADE"),
        nullable=False,
    )
    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(String(32), nullable=False, server_default="pending")
    current_phase: Mapped[str] = mapped_column(String(32), nullable=False, server_default="triage")
    autonomy_mode: Mapped[str] = mapped_column(String(32), nullable=False)
    deployment_mode: Mapped[str] = mapped_column(String(4), nullable=False, server_default="A")

    github_connection_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("integration_connections.id", ondelete="SET NULL"),
        nullable=True,
    )
    agent_runner_connection_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("integration_connections.id", ondelete="SET NULL"),
        nullable=True,
    )
    dokploy_staging_connection_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("integration_connections.id", ondelete="SET NULL"),
        nullable=True,
    )
    dokploy_prod_connection_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("integration_connections.id", ondelete="SET NULL"),
        nullable=True,
    )
    worker_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agent_worker_pool.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Outputs
    github_branch: Mapped[str | None] = mapped_column(String(255), nullable=True)
    github_pr_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    github_pr_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    github_commit_sha: Mapped[str | None] = mapped_column(String(40), nullable=True)
    dokploy_deployment_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    dokploy_deploy_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Metrics
    llm_tokens_used: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    llm_cost_usd: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False, server_default="0")
    wall_time_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Artefacts
    worktree_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    container_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    artifacts_directory: Mapped[str | None] = mapped_column(Text, nullable=True)
    mission_md_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    report_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    failed_gates: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    triggered_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    triggered_automatically: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    cancelled_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    approved_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SupportAgentPhaseCheckpoint(UUIDPrimaryKeyMixin, Base):
    """A phase transition for an agent run."""
    __tablename__ = "support_agent_phase_checkpoints"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','running','success','failed','skipped')",
            name="ck_checkpoint_status",
        ),
        Index("idx_checkpoints_run", "agent_run_id"),
        Index("idx_checkpoints_phase", "phase"),
    )

    agent_run_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("support_agent_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    phase: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="pending")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    artifacts: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    agent_log_excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)
    tokens_used: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    cost_usd: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False, server_default="0")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    gate_results: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class SupportAgentConfig(Base):
    """Per-entity agent configuration + circuit breaker state."""
    __tablename__ = "support_agent_config"

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        primary_key=True,
    )
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    default_github_connection_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("integration_connections.id", ondelete="SET NULL"),
        nullable=True,
    )
    default_runner_connection_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("integration_connections.id", ondelete="SET NULL"),
        nullable=True,
    )
    default_dokploy_staging_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("integration_connections.id", ondelete="SET NULL"),
        nullable=True,
    )
    default_dokploy_prod_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("integration_connections.id", ondelete="SET NULL"),
        nullable=True,
    )

    default_autonomy_mode: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default="recommendation"
    )
    automatic_trigger_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    allow_direct_deployment: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    auto_trigger_filters: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="'{}'")
    deployment_mode_rules: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="'[]'")

    max_concurrent_runs: Mapped[int] = mapped_column(Integer, nullable=False, server_default="2")
    monthly_budget_usd: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, server_default="500"
    )
    circuit_breaker_threshold: Mapped[int] = mapped_column(Integer, nullable=False, server_default="5")
    circuit_breaker_cooldown_hours: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="24"
    )
    max_lines_modified_per_run: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="500"
    )
    forbidden_path_patterns: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="'[]'")

    current_consecutive_failures: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    circuit_breaker_tripped_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    current_month_spent_usd: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, server_default="0"
    )
    current_month_start: Mapped[date] = mapped_column(
        Date, nullable=False, server_default=func.current_date()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class SupportVerificationScenario(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Reusable Playwright scenario run after a staging/prod deploy."""
    __tablename__ = "support_verification_scenarios"
    __table_args__ = (
        CheckConstraint(
            "script_language IN ('typescript', 'python')",
            name="ck_scenario_language",
        ),
        CheckConstraint(
            "criticality IN ('critical', 'important', 'nice_to_have')",
            name="ck_scenario_criticality",
        ),
        Index("idx_scenarios_entity", "entity_id"),
    )

    entity_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="'[]'")
    script_language: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="typescript"
    )
    script_content: Mapped[str] = mapped_column(Text, nullable=False)
    expected_assertions: Mapped[list] = mapped_column(
        JSONB, nullable=False, server_default="'[]'"
    )
    timeout_seconds: Mapped[int] = mapped_column(Integer, nullable=False, server_default="60")
    is_smoke_test: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    criticality: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="important"
    )
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_by: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )


class SupportAgentVerificationResult(UUIDPrimaryKeyMixin, Base):
    """Result of running a scenario inside an agent run."""
    __tablename__ = "support_agent_verification_results"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'running', 'passed', 'failed', 'skipped', 'error')",
            name="ck_verification_result_status",
        ),
        Index("idx_verification_results_run", "agent_run_id"),
    )

    agent_run_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("support_agent_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    scenario_id: Mapped[PyUUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("support_verification_scenarios.id", ondelete="SET NULL"),
        nullable=True,
    )
    scenario_name: Mapped[str] = mapped_column(String(255), nullable=False)
    criticality: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="pending")
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)
    screenshots_paths: Mapped[list] = mapped_column(
        JSONB, nullable=False, server_default="'[]'"
    )
    video_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    console_errors: Mapped[list] = mapped_column(
        JSONB, nullable=False, server_default="'[]'"
    )
    target_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
