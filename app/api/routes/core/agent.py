"""Autonomous maintenance agent API.

Sprint 3+ surface:
  * GET/PATCH /api/v1/support/agent/config — per-entity agent config
  * POST      /api/v1/support/agent/runs — launch a run against a ticket
  * GET       /api/v1/support/agent/runs?ticket_id=... — list runs
  * GET       /api/v1/support/agent/runs/{id} — run detail
  * POST      /api/v1/support/agent/runs/{id}/cancel — admin kill switch
  * POST      /api/v1/support/agent/runs/{id}/post-exec — internal
    callback from the worker daemon (auth via X-Internal-Token)

The `post-exec` endpoint is the only one not gated by the admin
permission — the worker pool calls it from inside the Dokploy network
using a shared secret stored in both sides' env.
"""
from __future__ import annotations

import logging
import os
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.audit import record_audit
from app.core.database import get_db
from app.models.agent import SupportAgentConfig, SupportAgentRun
from app.models.common import User
from app.models.support import SupportTicket
from app.services.agent.harness import (
    HarnessError,
    apply_post_exec_callback,
    approve_and_merge,
    get_or_create_config,
    launch_run,
    reject_run,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/support/agent",
    tags=["support-agent"],
)


# ─── Config schemas ────────────────────────────────────────────────────

class AgentConfigRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    entity_id: UUID
    enabled: bool
    default_github_connection_id: UUID | None
    default_runner_connection_id: UUID | None
    default_dokploy_staging_id: UUID | None
    default_dokploy_prod_id: UUID | None
    default_autonomy_mode: str
    automatic_trigger_enabled: bool
    allow_direct_deployment: bool
    auto_trigger_filters: dict
    deployment_mode_rules: list
    max_concurrent_runs: int
    monthly_budget_usd: float
    circuit_breaker_threshold: int
    circuit_breaker_cooldown_hours: int
    max_lines_modified_per_run: int
    forbidden_path_patterns: list
    current_consecutive_failures: int
    circuit_breaker_tripped_at: datetime | None
    current_month_spent_usd: float
    updated_at: datetime


class AgentConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool | None = None
    default_github_connection_id: UUID | None = None
    default_runner_connection_id: UUID | None = None
    default_dokploy_staging_id: UUID | None = None
    default_dokploy_prod_id: UUID | None = None
    default_autonomy_mode: Literal["observation", "recommendation", "autonomous_with_approval"] | None = None
    automatic_trigger_enabled: bool | None = None
    allow_direct_deployment: bool | None = None
    auto_trigger_filters: dict | None = None
    deployment_mode_rules: list | None = None
    max_concurrent_runs: int | None = None
    monthly_budget_usd: float | None = None
    circuit_breaker_threshold: int | None = None
    circuit_breaker_cooldown_hours: int | None = None
    max_lines_modified_per_run: int | None = None
    forbidden_path_patterns: list | None = None


# ─── Run schemas ───────────────────────────────────────────────────────

class RunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    ticket_id: UUID
    entity_id: UUID
    status: str
    current_phase: str
    autonomy_mode: str
    deployment_mode: str
    github_branch: str | None = None
    github_pr_number: int | None = None
    github_pr_url: str | None = None
    github_commit_sha: str | None = None
    dokploy_deploy_url: str | None = None
    llm_tokens_used: int
    llm_cost_usd: float
    wall_time_seconds: int | None = None
    error_message: str | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class LaunchRunBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ticket_id: UUID
    autonomy_mode: Literal["observation", "recommendation", "autonomous_with_approval"] | None = None


# ─── Config endpoints ──────────────────────────────────────────────────

@router.get(
    "/config",
    response_model=AgentConfigRead,
    dependencies=[require_permission("core.settings.manage")],
)
async def get_agent_config(
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    config = await get_or_create_config(db, entity_id)
    await db.commit()
    await db.refresh(config)
    return config


@router.patch(
    "/config",
    response_model=AgentConfigRead,
    dependencies=[require_permission("core.settings.manage")],
)
async def update_agent_config(
    body: AgentConfigUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    config = await get_or_create_config(db, entity_id)
    changes = {}
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(config, field, value)
        changes[field] = str(value)[:80]
    config.updated_at = datetime.now(UTC)

    await record_audit(
        db,
        action="agent_config.update",
        resource_type="agent_config",
        resource_id=str(entity_id),
        user_id=current_user.id,
        entity_id=entity_id,
        details=changes,
    )
    await db.commit()
    await db.refresh(config)
    return config


# ─── Run endpoints ─────────────────────────────────────────────────────

@router.post(
    "/runs",
    response_model=RunRead,
    status_code=201,
    dependencies=[require_permission("support.ticket.manage")],
)
async def launch_agent_run(
    body: LaunchRunBody,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ticket = (
        await db.execute(
            select(SupportTicket).where(
                SupportTicket.id == body.ticket_id,
                SupportTicket.entity_id == entity_id,
            )
        )
    ).scalar_one_or_none()
    if not ticket:
        raise HTTPException(404, "Ticket not found")

    try:
        run = await launch_run(
            db,
            ticket=ticket,
            triggered_by=current_user,
            autonomy_mode_override=body.autonomy_mode,
        )
    except HarnessError as exc:
        raise HTTPException(400, str(exc))

    await record_audit(
        db,
        action="agent_run.launch",
        resource_type="agent_run",
        resource_id=str(run.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"ticket_id": str(ticket.id), "autonomy": run.autonomy_mode},
    )
    await db.commit()
    await db.refresh(run)
    return run


@router.get(
    "/runs",
    response_model=list[RunRead],
    dependencies=[require_permission("support.ticket.read")],
)
async def list_agent_runs(
    ticket_id: UUID | None = Query(default=None),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(SupportAgentRun).where(SupportAgentRun.entity_id == entity_id)
    if ticket_id:
        stmt = stmt.where(SupportAgentRun.ticket_id == ticket_id)
    stmt = stmt.order_by(SupportAgentRun.created_at.desc()).limit(50)
    return list((await db.execute(stmt)).scalars().all())


@router.get(
    "/runs/{run_id}",
    response_model=RunRead,
    dependencies=[require_permission("support.ticket.read")],
)
async def get_agent_run(
    run_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            select(SupportAgentRun).where(
                SupportAgentRun.id == run_id,
                SupportAgentRun.entity_id == entity_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Run not found")
    return row


@router.post(
    "/runs/{run_id}/cancel",
    response_model=RunRead,
    dependencies=[require_permission("support.ticket.manage")],
)
async def cancel_agent_run(
    run_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            select(SupportAgentRun).where(
                SupportAgentRun.id == run_id,
                SupportAgentRun.entity_id == entity_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Run not found")
    if row.status in ("completed", "failed", "cancelled", "rejected", "failed_and_reverted"):
        raise HTTPException(400, f"Run already in terminal status: {row.status}")

    row.status = "cancelled"
    row.cancelled_by = current_user.id
    row.ended_at = datetime.now(UTC)
    await record_audit(
        db,
        action="agent_run.cancel",
        resource_type="agent_run",
        resource_id=str(run_id),
        user_id=current_user.id,
        entity_id=entity_id,
    )
    await db.commit()
    await db.refresh(row)
    return row


# ─── Approval workflow (Sprint 5) ──────────────────────────────────────


class RejectBody(BaseModel):
    reason: str | None = None


@router.post(
    "/runs/{run_id}/approve",
    response_model=RunRead,
    dependencies=[require_permission("support.ticket.manage")],
)
async def approve_agent_run(
    run_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    run = (
        await db.execute(
            select(SupportAgentRun).where(
                SupportAgentRun.id == run_id,
                SupportAgentRun.entity_id == entity_id,
            )
        )
    ).scalar_one_or_none()
    if not run:
        raise HTTPException(404, "Run not found")
    try:
        await approve_and_merge(db, run, current_user.id)
    except HarnessError as exc:
        raise HTTPException(400, str(exc))
    await record_audit(
        db,
        action="agent_run.approve",
        resource_type="agent_run",
        resource_id=str(run_id),
        user_id=current_user.id,
        entity_id=entity_id,
    )
    await db.commit()
    await db.refresh(run)
    return run


@router.post(
    "/runs/{run_id}/reject",
    response_model=RunRead,
    dependencies=[require_permission("support.ticket.manage")],
)
async def reject_agent_run(
    run_id: UUID,
    body: RejectBody,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    run = (
        await db.execute(
            select(SupportAgentRun).where(
                SupportAgentRun.id == run_id,
                SupportAgentRun.entity_id == entity_id,
            )
        )
    ).scalar_one_or_none()
    if not run:
        raise HTTPException(404, "Run not found")
    try:
        await reject_run(db, run, current_user.id, body.reason)
    except HarnessError as exc:
        raise HTTPException(400, str(exc))
    await record_audit(
        db,
        action="agent_run.reject",
        resource_type="agent_run",
        resource_id=str(run_id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"reason": body.reason} if body.reason else None,
    )
    await db.commit()
    await db.refresh(run)
    return run


# ─── Worker → Backend callback (internal) ──────────────────────────────

@router.post("/runs/{run_id}/post-exec", status_code=204)
async def worker_post_exec_callback(
    run_id: UUID,
    x_internal_token: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Worker daemon calls this after a container exits.

    Authentication: shared secret in `OPSFLUX_INTERNAL_TOKEN` env var
    (same on backend and worker side, set via Dokploy per-project env).
    """
    expected = os.getenv("OPSFLUX_INTERNAL_TOKEN")
    if not expected or x_internal_token != expected:
        raise HTTPException(401, "Invalid internal token")

    await apply_post_exec_callback(db, run_id)
    await db.commit()
