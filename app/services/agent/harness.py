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

    Sprint 5 scope:
      1. Extract PR metadata from REPORT.json (the worker already stored
         the raw report on the run row).
      2. Run the post-exec gate suite (forbidden paths, line budget,
         secret scan, CI status).
      3. If all gates pass, either:
           - `observation` mode → post a comment on the ticket, leave
             the PR as-is, flip status to `completed`.
           - `recommendation` mode → post a summary on the ticket + PR,
             status stays `completed`, human merges manually.
           - `autonomous_with_approval` → flip to `awaiting_human`.
      4. If any gate fails, mark the run `failed`, close the PR, write
         `failed_gates` so the UI can render what went wrong.
      5. Update circuit-breaker counters + budget.
    """
    from app.services.agent.gates import run_all_gates

    run = (
        await db.execute(
            select(SupportAgentRun).where(SupportAgentRun.id == run_id)
        )
    ).scalar_one_or_none()
    if not run:
        return

    run.current_phase = "report"
    run.updated_at = datetime.now(UTC)

    # Lift PR metadata from the report the agent produced
    if run.report_json:
        pr = (run.report_json or {}).get("pr") or {}
        if pr.get("number") and not run.github_pr_number:
            run.github_pr_number = int(pr["number"])
            run.github_pr_url = pr.get("url")
        if pr.get("commit_sha") and not run.github_commit_sha:
            run.github_commit_sha = pr["commit_sha"]
        if pr.get("branch") and not run.github_branch:
            run.github_branch = pr["branch"]
        metrics = (run.report_json or {}).get("metrics") or {}
        if metrics.get("total_tokens_used"):
            run.llm_tokens_used = int(metrics["total_tokens_used"])

    # Run gates — unless the report itself says 'failed', in which case
    # skip gates (no PR to inspect) and go straight to failed.
    report_status = (run.report_json or {}).get("status") if run.report_json else None

    if report_status in ("success", "partial"):
        gate_results = await run_all_gates(db, run.id)
        all_ok = all(r["ok"] for r in gate_results.values())
        # Distinguish "hard" gate failures (forbidden paths, secrets,
        # bad PR) from "soft" ones (CI failed, line budget exceeded).
        # For recommendation mode, soft failures should keep the PR
        # open so the admin can review and fix — closing the PR is
        # too aggressive for a human-in-the-loop workflow.
        SOFT_GATES = {"ci_status", "line_budget"}
        hard_failures = {
            name: info
            for name, info in gate_results.items()
            if not info["ok"] and name not in SOFT_GATES
        }
        soft_failures = {
            name: info
            for name, info in gate_results.items()
            if not info["ok"] and name in SOFT_GATES
        }

        if all_ok:
            if run.autonomy_mode == "autonomous_with_approval":
                run.status = "awaiting_human"
            else:
                run.status = "completed"
        elif hard_failures:
            # Forbidden paths or secret leak — always close the PR.
            run.status = "failed"
            try:
                await _close_pr_on_failure(db, run)
            except Exception:  # noqa: BLE001
                logger.exception("Could not auto-close PR after gate failure")
        else:
            # Only soft failures (CI red, lines over budget). Keep
            # the PR open — flag the run as needing human attention
            # rather than failed-and-closed.
            if run.autonomy_mode == "autonomous_with_approval":
                run.status = "awaiting_human"
            else:
                # In recommendation mode the human is already going to
                # review the PR. Mark `completed` with the soft failure
                # surfaced via the report comment, not closed.
                run.status = "completed"
            logger.info(
                "Run %s: soft gates failed (%s) — PR kept open for human review",
                run.id, list(soft_failures.keys()),
            )
    else:
        run.status = "failed"

    run.ended_at = datetime.now(UTC)

    # Post report comment on the ticket + PR (best effort)
    try:
        await _post_run_report(db, run)
    except Exception:  # noqa: BLE001
        logger.exception("Run report posting failed")

    # Circuit breaker / budget
    config = await get_or_create_config(db, run.entity_id)
    if run.status in ("failed", "failed_and_reverted"):
        config.current_consecutive_failures += 1
        if config.current_consecutive_failures >= config.circuit_breaker_threshold:
            config.circuit_breaker_tripped_at = datetime.now(UTC)
            logger.warning(
                "Circuit breaker tripped for entity %s (failures=%d)",
                config.entity_id, config.current_consecutive_failures,
            )
    elif run.status in ("completed", "awaiting_human"):
        config.current_consecutive_failures = 0

    if run.llm_cost_usd:
        config.current_month_spent_usd += run.llm_cost_usd


async def _close_pr_on_failure(
    db: AsyncSession, run: SupportAgentRun
) -> None:
    if not (run.github_pr_number and run.github_connection_id):
        return
    conn = (
        await db.execute(
            select(IntegrationConnection).where(
                IntegrationConnection.id == run.github_connection_id
            )
        )
    ).scalar_one_or_none()
    if not conn:
        return
    from app.services.core.integration_connection_service import load_credentials
    from app.services.integrations import github_service

    credentials = await load_credentials(db, conn.id)
    await github_service.close_pr(
        conn.config, credentials,
        pr_number=run.github_pr_number,
        rejection_reason="Post-exec gates failed — see OPSFLUX ticket for details",
    )


async def _post_run_report(
    db: AsyncSession, run: SupportAgentRun
) -> None:
    """Post a concise run summary on the ticket and on the linked PR."""
    from app.models.support import SupportTicket, TicketComment
    from app.services.core.integration_connection_service import load_credentials
    from app.services.integrations import github_service

    ticket = (
        await db.execute(
            select(SupportTicket).where(SupportTicket.id == run.ticket_id)
        )
    ).scalar_one_or_none()
    if not ticket:
        return

    summary_lines = [
        f"**Agent run {str(run.id)[:8]} terminé — statut : `{run.status}`**",
        "",
        f"- Mode : `{run.autonomy_mode}` / Déploiement : `{run.deployment_mode}`",
        f"- Tokens utilisés : `{run.llm_tokens_used:,}` · Coût : `${float(run.llm_cost_usd):.4f}`",
    ]
    if run.github_pr_url:
        summary_lines.append(f"- PR : {run.github_pr_url}")
    if run.report_json:
        rc = run.report_json.get("root_cause")
        if rc:
            summary_lines.append(f"- Cause racine identifiée : {rc[:200]}")
    if run.failed_gates:
        summary_lines.append("")
        summary_lines.append("**Échecs de gates :**")
        for name, info in run.failed_gates.items():
            summary_lines.append(f"  - `{name}` : {info.get('message')}")

    if run.status == "awaiting_human":
        summary_lines.append("")
        summary_lines.append("→ **Approbation admin requise** dans OPSFLUX avant merge.")
    elif run.status == "completed":
        summary_lines.append("")
        summary_lines.append("→ Tous les gates sont verts. PR prête à review.")
    elif run.status == "failed":
        summary_lines.append("")
        summary_lines.append("→ Le run a échoué. La PR a été fermée automatiquement.")

    body = "\n".join(summary_lines)

    # Ticket-side comment (reuses existing infra)
    db.add(TicketComment(
        ticket_id=ticket.id,
        author_id=ticket.reporter_id,  # fallback — the agent runs as the ticket reporter
        body=body,
        is_internal=False,
        external_source="agent",
    ))

    # PR-side comment (best effort)
    if run.github_pr_number and run.github_connection_id:
        conn = (
            await db.execute(
                select(IntegrationConnection).where(
                    IntegrationConnection.id == run.github_connection_id
                )
            )
        ).scalar_one_or_none()
        if conn:
            credentials = await load_credentials(db, conn.id)
            try:
                await github_service.add_issue_comment(
                    conn.config, credentials,
                    issue_number=run.github_pr_number,
                    body=body,
                )
            except Exception:  # noqa: BLE001
                logger.exception("Could not post PR summary comment")


# ─── Approval workflow (Sprint 5) ────────────────────────────────────

async def approve_and_merge(
    db: AsyncSession, run: SupportAgentRun, approver_id: UUID
) -> None:
    """Merge the PR attached to a run that's `awaiting_human`.

    Raises HarnessError if the run isn't in the right state or the PR
    can't be merged.
    """
    if run.status != "awaiting_human":
        raise HarnessError(f"Run not awaiting approval (status={run.status})")
    if not (run.github_pr_number and run.github_connection_id):
        raise HarnessError("No PR attached to this run")

    conn = (
        await db.execute(
            select(IntegrationConnection).where(
                IntegrationConnection.id == run.github_connection_id
            )
        )
    ).scalar_one_or_none()
    if not conn:
        raise HarnessError("GitHub connection has disappeared")

    from app.services.core.integration_connection_service import load_credentials
    from app.services.integrations import github_service

    credentials = await load_credentials(db, conn.id)
    try:
        result = await github_service.merge_pr(
            conn.config, credentials,
            pr_number=run.github_pr_number,
            merge_method="squash",
            commit_title=f"[agent-run {str(run.id)[:8]}] merge PR #{run.github_pr_number}",
        )
    except Exception as exc:  # noqa: BLE001
        raise HarnessError(f"GitHub merge failed: {exc}")

    run.status = "completed"
    run.approved_by = approver_id
    run.approved_at = datetime.now(UTC)
    run.current_phase = "post_merge"
    run.github_commit_sha = result.get("sha") or run.github_commit_sha

    # If a Dokploy prod connector is wired and the merge succeeded, the
    # pipeline CI/CD of the repo is expected to deploy automatically.
    # We do NOT trigger Dokploy prod from here — merging `main` is the
    # signal, the normal deploy flow kicks in. For Mode B runs where
    # `dokploy_prod_connection_id` is set, the existing project is
    # already wired to deploy on push, so no extra call needed.


async def reject_run(
    db: AsyncSession, run: SupportAgentRun, rejecter_id: UUID, reason: str | None
) -> None:
    if run.status not in ("awaiting_human", "completed"):
        raise HarnessError(f"Run not in a rejectable state (status={run.status})")
    run.status = "rejected"
    run.cancelled_by = rejecter_id
    run.ended_at = datetime.now(UTC)

    if run.github_pr_number and run.github_connection_id:
        conn = (
            await db.execute(
                select(IntegrationConnection).where(
                    IntegrationConnection.id == run.github_connection_id
                )
            )
        ).scalar_one_or_none()
        if conn:
            from app.services.core.integration_connection_service import load_credentials
            from app.services.integrations import github_service
            credentials = await load_credentials(db, conn.id)
            try:
                await github_service.close_pr(
                    conn.config, credentials,
                    pr_number=run.github_pr_number,
                    rejection_reason=reason or "Rejeté par l'administrateur",
                )
            except Exception:  # noqa: BLE001
                logger.exception("Could not close rejected PR")
