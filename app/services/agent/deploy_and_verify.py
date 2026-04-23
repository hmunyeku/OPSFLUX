"""Mode A deploy + verification orchestration (Sprint 6).

Called from the approval handler (or automatically for recommendation
mode when `allow_direct_deployment=True` kicks in). Flow:

  1. Trigger Dokploy deploy of the PR branch on the staging connector
     attached to the run.
  2. Poll Dokploy status until `done` or `error` (max 10 min).
  3. Call the connector's `health_check_url` until it returns 2xx
     (timeout from the connector config).
  4. Select scenarios tagged with ticket tags + smoke tests + every
     `critical` scenario, write them to a JSON file.
  5. Launch the `opsflux-playwright-runner` image with TARGET_URL
     pointing at the deploy URL, wait for exit, parse `results.json`
     into `support_agent_verification_results` rows.
  6. Return an aggregate (passed / failed / critical_failures).

The container launch itself is delegated to the worker pool via a
DB-side "verification_run" row — which Sprint 6 partial doesn't have
yet, so v1 runs Playwright in-process via docker-py when the backend
has access to a docker socket. For production we'll want to move this
into the existing worker daemon; see TODO_SPRINT_7 in the body.
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import (
    SupportAgentRun,
    SupportAgentVerificationResult,
    SupportVerificationScenario,
)
from app.models.common import IntegrationConnection
from app.models.support import SupportTicket
from app.services.core.integration_connection_service import load_credentials
from app.services.integrations import dokploy_service

logger = logging.getLogger(__name__)

PLAYWRIGHT_IMAGE = os.getenv(
    "PLAYWRIGHT_IMAGE",
    "ghcr.io/hmunyeku/opsflux-playwright-runner:latest",
)


async def _load_staging_connector(
    db: AsyncSession, run: SupportAgentRun
) -> tuple[IntegrationConnection, dict[str, Any]] | None:
    if not run.dokploy_staging_connection_id:
        return None
    conn = (
        await db.execute(
            select(IntegrationConnection).where(
                IntegrationConnection.id == run.dokploy_staging_connection_id,
                IntegrationConnection.connection_type == "dokploy",
            )
        )
    ).scalar_one_or_none()
    if not conn:
        return None
    credentials = await load_credentials(db, conn.id)
    return conn, credentials


async def deploy_branch_to_staging(
    db: AsyncSession, run: SupportAgentRun
) -> tuple[bool, str, str | None]:
    """Deploy the agent branch to the staging Dokploy resource.

    Returns `(ok, message, deploy_url)`. `deploy_url` is the health-
    check URL resolved from the connector config (what Playwright will
    target).
    """
    conn_info = await _load_staging_connector(db, run)
    if not conn_info:
        return False, "No Dokploy staging connector attached to run", None
    conn, credentials = conn_info

    if not run.github_branch:
        return False, "No branch on run — cannot trigger deploy", None

    try:
        deploy_resp = await dokploy_service.trigger_deploy(
            conn.config, credentials, branch=run.github_branch
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Dokploy deploy trigger failed")
        return False, f"Dokploy API error: {exc}", None

    run.dokploy_deployment_id = (
        deploy_resp.get("composeId") or deploy_resp.get("applicationId")
        or deploy_resp.get("id")
    )

    # Poll until done/error (max 10 min)
    import asyncio
    deadline = asyncio.get_running_loop().time() + 600
    final_status = "running"
    while asyncio.get_running_loop().time() < deadline:
        try:
            final_status = await dokploy_service.get_deploy_status(
                conn.config, credentials
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("deploy status poll failed: %s", exc)
        if final_status in ("done", "error"):
            break
        await asyncio.sleep(5)

    if final_status != "done":
        return False, f"Deploy ended with status={final_status}", None

    # Health check
    ok, hc_msg = await dokploy_service.check_health(conn.config)
    if not ok:
        return False, f"Deploy succeeded but health check failed: {hc_msg}", None

    run.dokploy_deploy_url = conn.config.get("health_check_url")
    return True, "Deploy ok + health check passed", run.dokploy_deploy_url


async def _select_scenarios(
    db: AsyncSession, run: SupportAgentRun
) -> list[SupportVerificationScenario]:
    """Pick scenarios for this run: smoke tests + critical + tag match."""
    ticket = (
        await db.execute(
            select(SupportTicket).where(SupportTicket.id == run.ticket_id)
        )
    ).scalar_one_or_none()
    ticket_tags = set(ticket.tags or []) if ticket else set()

    rows = (
        await db.execute(
            select(SupportVerificationScenario).where(
                SupportVerificationScenario.entity_id == run.entity_id,
                SupportVerificationScenario.enabled == True,  # noqa: E712
            )
        )
    ).scalars().all()

    selected: list[SupportVerificationScenario] = []
    for s in rows:
        if s.is_smoke_test or s.criticality == "critical":
            selected.append(s)
            continue
        if ticket_tags and set(s.tags or []) & ticket_tags:
            selected.append(s)
    return selected


async def run_playwright_verification(
    db: AsyncSession, run: SupportAgentRun
) -> dict[str, Any]:
    """Run the selected scenarios against `run.dokploy_deploy_url`.

    Writes one `SupportAgentVerificationResult` per scenario and
    returns an aggregate summary.
    """
    import docker

    scenarios = await _select_scenarios(db, run)
    if not scenarios:
        return {"total": 0, "passed": 0, "failed": 0, "critical_failures": 0, "skipped_no_scenarios": True}

    target_url = run.dokploy_deploy_url
    if not target_url:
        return {"total": 0, "error": "no deploy url to target"}

    # Prepare input + output dirs on host
    workdir = Path(tempfile.mkdtemp(prefix=f"pw-{run.id}-"))
    input_dir = workdir / "input"
    output_dir = workdir / "output"
    input_dir.mkdir()
    output_dir.mkdir()

    scenarios_payload = [
        {
            "id": str(s.id),
            "name": s.name,
            "criticality": s.criticality,
            "script_language": s.script_language,
            "script_content": s.script_content,
            "timeout_seconds": s.timeout_seconds,
        }
        for s in scenarios
    ]
    (input_dir / "scenarios.json").write_text(json.dumps(scenarios_payload))

    client = docker.from_env()
    try:
        client.images.pull(PLAYWRIGHT_IMAGE)
    except Exception:  # noqa: BLE001
        logger.warning("Playwright image pull failed; using local cache")

    try:
        container = client.containers.run(
            PLAYWRIGHT_IMAGE,
            detach=False,
            remove=True,
            environment={"TARGET_URL": target_url},
            volumes={
                str(input_dir): {"bind": "/input", "mode": "ro"},
                str(output_dir): {"bind": "/output", "mode": "rw"},
            },
            mem_limit="2g",
        )
        logger.info("Playwright runner output: %s", container[:500] if container else "")
    except Exception as exc:  # noqa: BLE001
        logger.exception("Playwright runner crashed")
        return {"total": len(scenarios), "error": f"Runner crashed: {exc}"}

    # Read results.json
    results_path = output_dir / "results.json"
    if not results_path.exists():
        return {"total": len(scenarios), "error": "no results.json produced"}

    raw_results = json.loads(results_path.read_text())

    passed = failed = critical_fail = 0
    for r in raw_results:
        status = r.get("status") or "error"
        if status == "passed":
            passed += 1
        elif status in ("failed", "error"):
            failed += 1
            if r.get("criticality") == "critical":
                critical_fail += 1
        db.add(SupportAgentVerificationResult(
            agent_run_id=run.id,
            scenario_id=UUID(r["scenario_id"]) if r.get("scenario_id") else None,
            scenario_name=r.get("name", "?"),
            criticality=r.get("criticality", "important"),
            status=status,
            duration_seconds=r.get("duration_seconds"),
            error_excerpt=r.get("error_excerpt"),
            screenshots_paths=r.get("screenshots") or [],
            video_path=r.get("video"),
            console_errors=r.get("console_errors") or [],
            target_url=target_url,
            started_at=datetime.now(UTC),
            ended_at=datetime.now(UTC),
        ))

    run.current_phase = "verification"
    return {
        "total": len(raw_results),
        "passed": passed,
        "failed": failed,
        "critical_failures": critical_fail,
    }


async def deploy_and_verify(
    db: AsyncSession, run: SupportAgentRun
) -> dict[str, Any]:
    """One-shot: deploy branch to staging then run Playwright verification."""
    run.current_phase = "deploy"
    ok, message, deploy_url = await deploy_branch_to_staging(db, run)
    if not ok:
        return {"deploy_ok": False, "message": message}

    verif = await run_playwright_verification(db, run)
    return {
        "deploy_ok": True,
        "deploy_message": message,
        "deploy_url": deploy_url,
        **verif,
    }
