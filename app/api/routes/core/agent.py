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
    launch_ci_retry_run,
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
    # Sprint 7 — scheduler knobs
    auto_window_start_hour: int | None = None
    auto_window_end_hour: int | None = None
    auto_max_runs_per_window: int = 3
    auto_report_email: str | None = None
    auto_report_hour_utc: int = 7
    last_digest_sent_at: datetime | None = None
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
    # Sprint 7 — scheduler
    auto_window_start_hour: int | None = None
    auto_window_end_hour: int | None = None
    auto_max_runs_per_window: int | None = None
    auto_report_email: str | None = None
    auto_report_hour_utc: int | None = None


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
    # Surface the agent's full structured report and gate failures so the
    # UI can render diagnosis / files modified / reasoning directly,
    # without a second round-trip.
    report_json: dict | None = None
    failed_gates: dict | None = None


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


# ─── CI-failure retry ────────────────────────────────────────────────

@router.post(
    "/runs/{run_id}/retry-ci",
    response_model=RunRead,
    dependencies=[require_permission("support.ticket.manage")],
)
async def retry_agent_run_ci(
    run_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Launch a new run that continues the parent branch to fix failing CI.

    Only works when the parent run has a PR on record AND its
    `failed_gates.ci_status.ok == False`. The new run reuses the same
    branch — it will add commits rather than create a new PR.
    """
    parent = (
        await db.execute(
            select(SupportAgentRun).where(
                SupportAgentRun.id == run_id,
                SupportAgentRun.entity_id == entity_id,
            )
        )
    ).scalar_one_or_none()
    if not parent:
        raise HTTPException(404, "Parent run not found")

    try:
        new_run = await launch_ci_retry_run(
            db, parent_run=parent, triggered_by=current_user
        )
    except HarnessError as exc:
        raise HTTPException(400, str(exc))

    await record_audit(
        db,
        action="agent_run.retry_ci",
        resource_type="agent_run",
        resource_id=str(new_run.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"parent_run_id": str(parent.id)},
    )
    await db.commit()
    await db.refresh(new_run)
    return new_run


# ─── Digest on-demand (Sprint 7) ──────────────────────────────────────


@router.post(
    "/config/send-digest-now",
    dependencies=[require_permission("core.settings.manage")],
)
async def send_digest_now(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger the daily digest email immediately, for preview/testing."""
    from app.services.agent.scheduler import send_digest_now as _send_digest_now

    try:
        result = await _send_digest_now(db, entity_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:  # noqa: BLE001
        logger.exception("send-digest-now failed")
        raise HTTPException(500, str(exc))
    await record_audit(
        db,
        action="agent_digest.manual_send",
        resource_type="agent_config",
        resource_id=str(entity_id),
        user_id=current_user.id,
        entity_id=entity_id,
    )
    await db.commit()
    return result


# ─── Log excerpt for the UI ─────────────────────────────────────────


class LogEntry(BaseModel):
    timestamp: str | None
    type: str
    summary: str
    is_error: bool = False


@router.get(
    "/runs/{run_id}/log-excerpt",
    response_model=list[LogEntry],
    dependencies=[require_permission("support.ticket.read")],
)
async def get_run_log_excerpt(
    run_id: UUID,
    limit: int = Query(default=200, ge=1, le=1000),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Return a parsed, UI-friendly stream of the agent's actions.

    Reads the worker-side `stream.jsonl` from the shared `agent_logs`
    volume mounted at `/var/log/opsflux-agent/<run_id>/stream.jsonl`,
    extracts the most useful events (tool calls, agent messages,
    errors) and returns them in chronological order. Avoids dumping
    raw 50KB JSON blobs to the client.
    """
    import json as _json
    import os
    from pathlib import Path

    # Entity isolation
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

    log_root = Path(os.getenv("AGENT_LOG_ROOT", "/var/log/opsflux-agent"))
    stream_path = log_root / str(run_id) / "stream.jsonl"
    if not stream_path.exists():
        return []

    entries: list[LogEntry] = []
    try:
        with stream_path.open(encoding="utf-8", errors="replace") as f:
            for line in f:
                if len(entries) >= limit:
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = _json.loads(line)
                except _json.JSONDecodeError:
                    continue
                ts = obj.get("timestamp")
                etype = obj.get("type", "?")
                msg = obj.get("message") or {}

                if etype == "system" and obj.get("subtype") == "init":
                    entries.append(LogEntry(
                        timestamp=ts, type="init",
                        summary=f"Agent initialised (model={obj.get('model')})",
                    ))
                elif etype == "assistant" and isinstance(msg.get("content"), list):
                    for block in msg["content"]:
                        if block.get("type") == "text":
                            t = (block.get("text") or "")[:280]
                            if t.strip():
                                entries.append(LogEntry(
                                    timestamp=ts, type="agent_text", summary=t,
                                ))
                        elif block.get("type") == "tool_use":
                            tool_name = block.get("name", "?")
                            inp = block.get("input", {})
                            if tool_name == "Bash":
                                cmd = (inp.get("command") or "")[:160]
                                entries.append(LogEntry(
                                    timestamp=ts, type="bash",
                                    summary=f"$ {cmd}",
                                ))
                            elif tool_name in ("Edit", "Write"):
                                p = inp.get("file_path", "?")
                                entries.append(LogEntry(
                                    timestamp=ts, type="edit",
                                    summary=f"{tool_name} → {p}",
                                ))
                            elif tool_name == "Read":
                                p = inp.get("file_path", "?")
                                entries.append(LogEntry(
                                    timestamp=ts, type="read",
                                    summary=f"Read {p}",
                                ))
                            elif tool_name == "Grep":
                                pat = (inp.get("pattern") or "")[:80]
                                entries.append(LogEntry(
                                    timestamp=ts, type="grep",
                                    summary=f"Grep {pat!r}",
                                ))
                            elif tool_name == "TodoWrite":
                                entries.append(LogEntry(
                                    timestamp=ts, type="todo",
                                    summary="Updated todo list",
                                ))
                            else:
                                entries.append(LogEntry(
                                    timestamp=ts, type="tool",
                                    summary=f"Tool {tool_name}",
                                ))
                elif etype == "user" and isinstance(msg.get("content"), list):
                    for block in msg["content"]:
                        if block.get("type") == "tool_result" and block.get("is_error"):
                            content = block.get("content", "")
                            if isinstance(content, list):
                                content = " ".join(
                                    str(c.get("text", c)) for c in content
                                )
                            entries.append(LogEntry(
                                timestamp=ts, type="error", is_error=True,
                                summary=str(content)[:280],
                            ))
                elif etype == "result":
                    entries.append(LogEntry(
                        timestamp=ts, type="end",
                        summary=f"Agent finished — {obj.get('subtype', '?')} "
                                f"(turns={obj.get('num_turns')}, "
                                f"cost=${obj.get('total_cost_usd', 0)})",
                    ))
    except Exception as exc:  # noqa: BLE001
        logger.exception("Log read failed")
        raise HTTPException(500, f"Could not read logs: {exc}")

    return entries


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


# ─── Deploy + Verify (Sprint 6) ────────────────────────────────────────


class VerificationResultRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    scenario_id: UUID | None
    scenario_name: str
    criticality: str
    status: str
    duration_seconds: int | None
    error_excerpt: str | None
    screenshots_paths: list
    video_path: str | None
    console_errors: list
    target_url: str | None
    started_at: datetime | None
    ended_at: datetime | None


@router.post(
    "/runs/{run_id}/deploy-and-verify",
    dependencies=[require_permission("support.ticket.manage")],
)
async def trigger_deploy_and_verify(
    run_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-triggered Mode A pipeline: deploy to staging + run Playwright.

    Idempotent-ish: if the run has a `dokploy_deploy_url` already, we
    skip the deploy step and run verification only.
    """
    from app.services.agent.deploy_and_verify import deploy_and_verify

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
    if run.status not in ("completed", "awaiting_human"):
        raise HTTPException(400, f"Run status must be completed or awaiting_human (is: {run.status})")

    result = await deploy_and_verify(db, run)
    await record_audit(
        db,
        action="agent_run.deploy_and_verify",
        resource_type="agent_run",
        resource_id=str(run_id),
        user_id=current_user.id,
        entity_id=entity_id,
        details=result,
    )
    await db.commit()
    await db.refresh(run)
    return result


@router.get(
    "/runs/{run_id}/verification-results",
    response_model=list[VerificationResultRead],
    dependencies=[require_permission("support.ticket.read")],
)
async def list_verification_results(
    run_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    from app.models.agent import SupportAgentVerificationResult

    # Entity check via the parent run
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
    rows = (
        await db.execute(
            select(SupportAgentVerificationResult)
            .where(SupportAgentVerificationResult.agent_run_id == run_id)
            .order_by(SupportAgentVerificationResult.created_at)
        )
    ).scalars().all()
    return list(rows)


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


# ─── Supervision dashboard ────────────────────────────────────────────
#
# Cross-ticket overview for admins: volume, success rate, cost, recent
# failures, circuit-breaker state. Powers the /admin/support/agent page.

class AgentSupervisionSummary(BaseModel):
    window_days: int
    total_runs: int
    runs_by_status: dict[str, int]
    success_rate: float            # completed / total, 0..1
    active_runs: int               # pending + preparing + running + awaiting_human
    total_cost_usd: float
    total_tokens: int
    avg_wall_time_seconds: float | None
    avg_cost_usd: float | None
    monthly_budget_usd: float
    monthly_spent_usd: float
    budget_used_ratio: float       # spent / budget, 0..1 (can exceed 1)
    circuit_breaker_tripped_at: datetime | None
    consecutive_failures: int
    daily_timeseries: list[dict]   # [{"date": "YYYY-MM-DD", "total": N, "success": N, "failed": N}]
    recent_failures: list[dict]    # last 10 failed/rejected runs


@router.get(
    "/supervision",
    response_model=AgentSupervisionSummary,
    dependencies=[require_permission("support.ticket.manage")],
)
async def get_supervision_summary(
    window_days: int = Query(default=7, ge=1, le=90),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Aggregated metrics for the admin supervision page."""
    from collections import defaultdict
    from datetime import timedelta

    from sqlalchemy import func as sa_func

    now = datetime.now(UTC)
    window_start = now - timedelta(days=window_days)

    # ── runs in window ─────────────────────────────────────────────
    runs_in_window = (
        await db.execute(
            select(SupportAgentRun).where(
                SupportAgentRun.entity_id == entity_id,
                SupportAgentRun.created_at >= window_start,
            )
        )
    ).scalars().all()

    runs_by_status: dict[str, int] = defaultdict(int)
    total_cost = 0.0
    total_tokens = 0
    wall_times: list[int] = []
    costs_completed: list[float] = []
    for r in runs_in_window:
        runs_by_status[r.status] += 1
        total_cost += float(r.llm_cost_usd or 0)
        total_tokens += int(r.llm_tokens_used or 0)
        if r.wall_time_seconds is not None:
            wall_times.append(r.wall_time_seconds)
        if r.status == "completed" and r.llm_cost_usd is not None:
            costs_completed.append(float(r.llm_cost_usd))

    total = len(runs_in_window)
    completed = runs_by_status.get("completed", 0)
    success_rate = (completed / total) if total else 0.0

    active_states = ("pending", "preparing", "running", "awaiting_human")
    active_runs = sum(runs_by_status.get(s, 0) for s in active_states)

    # ── config / budget ────────────────────────────────────────────
    config = (
        await db.execute(
            select(SupportAgentConfig).where(SupportAgentConfig.entity_id == entity_id)
        )
    ).scalar_one_or_none()
    monthly_budget = float(config.monthly_budget_usd) if config else 0.0
    monthly_spent = float(config.current_month_spent_usd) if config else 0.0
    budget_used_ratio = (monthly_spent / monthly_budget) if monthly_budget > 0 else 0.0
    cb_tripped = config.circuit_breaker_tripped_at if config else None
    consecutive_failures = int(config.current_consecutive_failures) if config else 0

    # ── daily timeseries ───────────────────────────────────────────
    daily: dict[str, dict[str, int]] = {}
    for i in range(window_days):
        d = (now - timedelta(days=i)).date().isoformat()
        daily[d] = {"total": 0, "success": 0, "failed": 0}
    for r in runs_in_window:
        d = r.created_at.date().isoformat()
        if d not in daily:
            continue
        daily[d]["total"] += 1
        if r.status == "completed":
            daily[d]["success"] += 1
        elif r.status in ("failed", "failed_and_reverted", "rejected"):
            daily[d]["failed"] += 1
    timeseries = [
        {"date": d, **stats}
        for d, stats in sorted(daily.items())
    ]

    # ── recent failures ────────────────────────────────────────────
    failed_rows = (
        await db.execute(
            select(SupportAgentRun).where(
                SupportAgentRun.entity_id == entity_id,
                SupportAgentRun.status.in_(["failed", "failed_and_reverted", "rejected"]),
            ).order_by(SupportAgentRun.created_at.desc()).limit(10)
        )
    ).scalars().all()
    recent_failures = [
        {
            "id": str(r.id),
            "ticket_id": str(r.ticket_id),
            "status": r.status,
            "current_phase": r.current_phase,
            "error_message": (r.error_message or "")[:280],
            "created_at": r.created_at.isoformat(),
            "ended_at": r.ended_at.isoformat() if r.ended_at else None,
            "cost_usd": float(r.llm_cost_usd or 0),
        }
        for r in failed_rows
    ]

    return AgentSupervisionSummary(
        window_days=window_days,
        total_runs=total,
        runs_by_status=dict(runs_by_status),
        success_rate=round(success_rate, 3),
        active_runs=active_runs,
        total_cost_usd=round(total_cost, 4),
        total_tokens=total_tokens,
        avg_wall_time_seconds=(sum(wall_times) / len(wall_times)) if wall_times else None,
        avg_cost_usd=(sum(costs_completed) / len(costs_completed)) if costs_completed else None,
        monthly_budget_usd=monthly_budget,
        monthly_spent_usd=monthly_spent,
        budget_used_ratio=round(budget_used_ratio, 3),
        circuit_breaker_tripped_at=cb_tripped,
        consecutive_failures=consecutive_failures,
        daily_timeseries=timeseries,
        recent_failures=recent_failures,
    )
