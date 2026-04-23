"""Agent run lifecycle orchestrator.

Phase 0 (Triage) happens here, synchronously, before any worker picks
up the job. Phases 1-4 run inside the agent container, orchestrated by
the worker daemon. Phases 5-7 come back to the backend via the
post-exec callback.

Responsibilities:
  * Gate the launch of a new run (feature enabled? circuit breaker?
    budget? concurrent limit?).
  * Select the agent_runner, github and dokploy connectors.
  * Render MISSION.md.
  * Persist the `SupportAgentRun` with status `pending` so a worker can
    claim it.
  * Later — handle the post-exec callback (gates, status bump, ticket
    comment).
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import SupportAgentConfig, SupportAgentRun
from app.models.common import IntegrationConnection, User
from app.models.support import SupportTicket, TicketComment
from app.services.agent.mission_builder import build_mission_md

logger = logging.getLogger(__name__)


class HarnessError(Exception):
    """Raised when a run cannot be launched — carries a human message."""


async def get_or_create_config(
    db: AsyncSession, entity_id: UUID
) -> SupportAgentConfig:
    """Lazy-create the per-entity agent config row."""
    row = (
        await db.execute(
            select(SupportAgentConfig).where(SupportAgentConfig.entity_id == entity_id)
        )
    ).scalar_one_or_none()
    if row:
        return row
    row = SupportAgentConfig(entity_id=entity_id)
    db.add(row)
    await db.flush()
    return row


async def _check_feature_gates(
    db: AsyncSession,
    config: SupportAgentConfig,
) -> None:
    """Raise HarnessError if any blocking gate is tripped."""
    if not config.enabled:
        raise HarnessError("L'agent de maintenance n'est pas activé pour cette entité.")

    if config.circuit_breaker_tripped_at:
        delta = datetime.now(UTC) - config.circuit_breaker_tripped_at
        if delta.total_seconds() < config.circuit_breaker_cooldown_hours * 3600:
            raise HarnessError(
                f"Circuit breaker déclenché. Cooldown jusqu'à "
                f"{config.circuit_breaker_tripped_at} + "
                f"{config.circuit_breaker_cooldown_hours}h."
            )
        # Past cooldown — reset automatically
        config.circuit_breaker_tripped_at = None
        config.current_consecutive_failures = 0

    if config.current_month_spent_usd >= config.monthly_budget_usd:
        raise HarnessError(
            f"Budget mensuel atteint "
            f"({config.current_month_spent_usd} / {config.monthly_budget_usd} USD)."
        )

    # Concurrent runs
    active_count = (
        await db.execute(
            select(func.count(SupportAgentRun.id)).where(
                SupportAgentRun.entity_id == config.entity_id,
                SupportAgentRun.status.in_(["pending", "preparing", "running"]),
            )
        )
    ).scalar_one()
    if active_count >= config.max_concurrent_runs:
        raise HarnessError(
            f"Limite de runs simultanés atteinte ({active_count} / "
            f"{config.max_concurrent_runs})."
        )


async def _resolve_connectors(
    db: AsyncSession,
    config: SupportAgentConfig,
    ticket: SupportTicket,
) -> dict[str, UUID | None]:
    """Pick the connectors the run will use.

    Precedence for each type:
      1. Connector already bound to the ticket (github_connection_id on
         the ticket takes priority — stays consistent with ticket sync).
      2. Entity-wide default on SupportAgentConfig.
      3. First active connector of that type, as a last-resort fallback.
    """
    async def _pick_default(conn_type: str, prefer: UUID | None) -> UUID | None:
        if prefer:
            return prefer
        row = (
            await db.execute(
                select(IntegrationConnection.id)
                .where(
                    IntegrationConnection.entity_id == config.entity_id,
                    IntegrationConnection.connection_type == conn_type,
                    IntegrationConnection.status == "active",
                )
                .order_by(IntegrationConnection.created_at)
                .limit(1)
            )
        ).scalar_one_or_none()
        return row

    github_id = ticket.github_connection_id or config.default_github_connection_id
    if not github_id:
        github_id = await _pick_default("github", None)

    runner_id = config.default_runner_connection_id
    if not runner_id:
        runner_id = await _pick_default("agent_runner", None)

    return {
        "github_connection_id": github_id,
        "agent_runner_connection_id": runner_id,
        "dokploy_staging_connection_id": config.default_dokploy_staging_id,
        "dokploy_prod_connection_id": config.default_dokploy_prod_id,
    }


def _select_deployment_mode(
    config: SupportAgentConfig, ticket: SupportTicket
) -> str:
    """Evaluate deployment_mode_rules against a ticket.

    v1 engine is deliberately simple: each rule is a dict with
    `condition` describing a simple expression and `mode` the target.
    Without direct-deploy enabled, everything falls to A.
    """
    if not config.allow_direct_deployment:
        return "A"

    rules = config.deployment_mode_rules or []
    # Sort by priority ascending (lowest first)
    for rule in sorted(rules, key=lambda r: r.get("priority", 999)):
        cond = rule.get("condition", {})
        mode = rule.get("mode", "A")
        if cond.get("type") == "always":
            return mode
        # v1 supported expression shapes — kept tiny on purpose
        if cond.get("type") == "priority_eq":
            if ticket.priority == cond.get("value"):
                return mode
        if cond.get("type") == "type_eq":
            if ticket.ticket_type == cond.get("value"):
                return mode
    return "A"


async def launch_run(
    db: AsyncSession,
    *,
    ticket: SupportTicket,
    triggered_by: User,
    autonomy_mode_override: str | None = None,
) -> SupportAgentRun:
    """Create a pending agent run for this ticket.

    Returns the persisted `SupportAgentRun` row. The caller must `commit`
    afterwards — the harness only flushes so the id is available.
    """
    config = await get_or_create_config(db, ticket.entity_id)
    await _check_feature_gates(db, config)

    connectors = await _resolve_connectors(db, config, ticket)
    if not connectors["agent_runner_connection_id"]:
        raise HarnessError(
            "Aucun connecteur Agent Runner actif pour cette entité."
        )
    if not connectors["github_connection_id"]:
        raise HarnessError("Aucun connecteur GitHub actif pour cette entité.")

    autonomy = autonomy_mode_override or config.default_autonomy_mode
    deployment_mode = _select_deployment_mode(config, ticket)

    # Resolve GitHub repo for the mission briefing
    github_conn = (
        await db.execute(
            select(IntegrationConnection).where(
                IntegrationConnection.id == connectors["github_connection_id"]
            )
        )
    ).scalar_one()
    github_repo = {
        "owner": github_conn.config.get("repo_owner"),
        "name": github_conn.config.get("repo_name"),
        "default_branch": github_conn.config.get("default_branch", "main"),
    }

    # Seed the run with phase=triage so the UI stepper is coherent from
    # the start.
    run = SupportAgentRun(
        ticket_id=ticket.id,
        entity_id=ticket.entity_id,
        status="pending",
        current_phase="triage",
        autonomy_mode=autonomy,
        deployment_mode=deployment_mode,
        github_connection_id=connectors["github_connection_id"],
        agent_runner_connection_id=connectors["agent_runner_connection_id"],
        dokploy_staging_connection_id=connectors["dokploy_staging_connection_id"],
        dokploy_prod_connection_id=connectors["dokploy_prod_connection_id"],
        triggered_by=triggered_by.id,
        triggered_automatically=False,
    )
    db.add(run)
    await db.flush()

    # Fetch last 5 comments for context
    recent = (
        await db.execute(
            select(TicketComment)
            .where(TicketComment.ticket_id == ticket.id)
            .order_by(TicketComment.created_at.desc())
            .limit(5)
        )
    ).scalars().all()
    recent_dicts = [
        {"author_id": str(c.author_id), "body": c.body} for c in recent
    ]

    run.mission_md_content = build_mission_md(
        ticket=ticket,
        run=run,
        config=config,
        github_repo=github_repo,
        recent_comments=recent_dicts,
    )

    await db.flush()
    return run


async def apply_post_exec_callback(
    db: AsyncSession, run_id: UUID
) -> None:
    """Called by the worker after a container exits.

    v1 scope (Sprint 3): only bumps the `current_phase` stepper, records
    a `report` checkpoint, and wires circuit-breaker increments on
    failure. Deployment + Playwright verification (phases 5-6) arrive
    in Sprint 5-6.
    """
    run = (
        await db.execute(
            select(SupportAgentRun).where(SupportAgentRun.id == run_id)
        )
    ).scalar_one_or_none()
    if not run:
        return

    run.current_phase = "report"
    run.updated_at = datetime.now(UTC)

    # Update config budget + circuit breaker state
    config = await get_or_create_config(db, run.entity_id)
    if run.status == "failed" or run.status == "failed_and_reverted":
        config.current_consecutive_failures += 1
        if config.current_consecutive_failures >= config.circuit_breaker_threshold:
            config.circuit_breaker_tripped_at = datetime.now(UTC)
            logger.warning(
                "Circuit breaker tripped for entity %s (failures=%d)",
                config.entity_id, config.current_consecutive_failures,
            )
    elif run.status == "completed":
        config.current_consecutive_failures = 0

    if run.llm_cost_usd:
        config.current_month_spent_usd += run.llm_cost_usd
