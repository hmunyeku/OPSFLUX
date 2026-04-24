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

    # ── FSM transition: ticket open → in_progress + notify reporter ──
    # When the agent starts working on an `open` ticket, flip it to
    # `in_progress` so the reporter sees the status change in the UI
    # and receives an email. No-op if the ticket is already being
    # worked on.
    if ticket.status == "open":
        from app.models.support import TicketStatusHistory
        old_status = ticket.status
        ticket.status = "in_progress"
        db.add(TicketStatusHistory(
            ticket_id=ticket.id,
            old_status=old_status,
            new_status="in_progress",
            changed_by=triggered_by.id,
            note="Agent IA a pris le ticket en charge",
        ))
        # Email to reporter (best effort — don't fail the launch)
        try:
            from app.core.email_templates import render_and_send_email
            from app.models.common import User
            reporter = await db.get(User, ticket.reporter_id)
            if reporter and reporter.email:
                await render_and_send_email(
                    db, slug="ticket_agent_started",
                    entity_id=ticket.entity_id,
                    to=reporter.email,
                    language=reporter.language or "fr",
                    user_id=reporter.id,
                    variables={
                        "reference": ticket.reference,
                        "title": ticket.title,
                        "link": f"https://app.opsflux.io/support?ticket={ticket.id}",
                        "run_id": str(run.id)[:8],
                    },
                )
        except Exception:  # noqa: BLE001
            logger.exception("Failed to notify reporter on agent launch")

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

    # Build the attachments manifest (ticket PJ + inline <img> in the
    # description/comments). The worker will download the bytes to
    # /workspace/.attachments/<filename> before launching the agent.
    attachments_manifest = await _collect_attachments_manifest(
        db, ticket=ticket, comments=recent,
    )
    run.attachments_manifest = attachments_manifest or None

    run.mission_md_content = build_mission_md(
        ticket=ticket,
        run=run,
        config=config,
        github_repo=github_repo,
        recent_comments=recent_dicts,
        attachments_manifest=attachments_manifest,
    )

    await db.flush()
    return run


async def _collect_attachments_manifest(
    db: AsyncSession,
    *,
    ticket: SupportTicket,
    comments: list[TicketComment],
) -> list[dict[str, Any]]:
    """Gather ticket attachments + inline <img> references.

    Sources:
      - `attachments` rows where owner_type='support_ticket' and
        owner_id=<ticket.id> (files directly attached to the ticket).
      - Each comment's `attachment_ids` JSONB list.
      - `<img src="/api/v1/attachments/{id}/...">` tags embedded in
        the ticket description or comment bodies, pointing back to
        our own storage — these are reified as real manifest entries
        so the agent can see the image locally.

    Dedupes on attachment_id. Safe when empty: returns [].
    """
    from app.models.common import Attachment
    import re as _re

    manifest: dict[str, dict[str, Any]] = {}

    def _add(att: Attachment, source: str) -> None:
        aid = str(att.id)
        if aid in manifest:
            return
        manifest[aid] = {
            "attachment_id": aid,
            "filename": att.filename,
            "original_name": att.original_name,
            "content_type": att.content_type,
            "size_bytes": int(att.size_bytes or 0),
            "storage_path": att.storage_path,
            "source": source,
            "description": att.description,
        }

    # 1) Direct ticket attachments
    direct = (
        await db.execute(
            select(Attachment).where(
                Attachment.owner_type == "support_ticket",
                Attachment.owner_id == ticket.id,
                Attachment.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    for a in direct:
        _add(a, source="ticket")

    # 2) Attachments referenced by comments via attachment_ids JSONB
    comment_att_ids: list[str] = []
    for c in comments:
        for aid in (c.attachment_ids or []):
            if aid:
                comment_att_ids.append(str(aid))
    if comment_att_ids:
        rows = (
            await db.execute(
                select(Attachment).where(
                    Attachment.id.in_(comment_att_ids),
                    Attachment.deleted_at.is_(None),
                )
            )
        ).scalars().all()
        for a in rows:
            _add(a, source="comment")

    # 3) Inline <img> refs in description + comment bodies — match
    # our own /api/v1/attachments/<uuid> pattern.
    IMG_RE = _re.compile(
        r"/api/v1/attachments/([0-9a-fA-F-]{36})",
    )
    bodies: list[str] = []
    if ticket.description:
        bodies.append(ticket.description)
    for c in comments:
        if c.body:
            bodies.append(c.body)
    inline_ids: list[str] = []
    for b in bodies:
        inline_ids.extend(IMG_RE.findall(b))
    inline_ids = [i for i in inline_ids if i not in manifest]
    if inline_ids:
        rows = (
            await db.execute(
                select(Attachment).where(
                    Attachment.id.in_(inline_ids),
                    Attachment.deleted_at.is_(None),
                )
            )
        ).scalars().all()
        for a in rows:
            _add(a, source="description_img")

    return list(manifest.values())


async def launch_ci_retry_run(
    db: AsyncSession,
    *,
    parent_run: SupportAgentRun,
    triggered_by: User,
) -> SupportAgentRun:
    """Create a new run that continues the parent run's branch to fix CI.

    Preconditions:
      - parent_run has a github_pr_number and a github_branch
      - parent_run.failed_gates contains a non-OK `ci_status` entry
        (otherwise there is nothing to retry)

    The new run:
      - Targets the same ticket
      - Inherits autonomy + deployment mode from the parent
      - Gets a mission_md that says "continue on the existing branch,
        fix only the failing CI checks" — with the failing checks +
        a logs excerpt injected as context.
      - Stores `{"parent_run_id": ...}` in its report_json for lineage
        (the worker will overwrite report_json with its own content,
        so we only use this for bootstrap-time tracking in the UI).
    """
    if not parent_run.github_pr_number or not parent_run.github_branch:
        raise HarnessError("Le run parent n'a pas de PR — rien à retry.")
    if not parent_run.github_connection_id:
        raise HarnessError("Le run parent n'a pas de connecteur GitHub.")

    failed_gates = parent_run.failed_gates or {}
    ci_gate = failed_gates.get("ci_status")
    if not ci_gate or ci_gate.get("ok"):
        raise HarnessError("Le run parent n'a pas d'échec CI à corriger.")

    ticket = (
        await db.execute(
            select(SupportTicket).where(SupportTicket.id == parent_run.ticket_id)
        )
    ).scalar_one_or_none()
    if not ticket:
        raise HarnessError("Ticket parent introuvable.")

    config = await get_or_create_config(db, ticket.entity_id)
    await _check_feature_gates(db, config)

    # ── Fetch CI check details + logs from GitHub ──
    failed_checks: list[dict[str, Any]] = []
    logs_excerpt = ""
    try:
        from app.services.core.integration_connection_service import load_credentials
        from app.services.integrations import github_service

        gh_conn = (
            await db.execute(
                select(IntegrationConnection).where(
                    IntegrationConnection.id == parent_run.github_connection_id
                )
            )
        ).scalar_one()
        credentials = await load_credentials(db, gh_conn.id)
        if parent_run.github_commit_sha:
            checks = await github_service.get_pr_checks(
                gh_conn.config, credentials, commit_sha=parent_run.github_commit_sha
            )
            # Worker-side payload shape: {succeeded, pending, failed, runs}
            for r in (checks.get("runs") or []):
                if r.get("conclusion") in ("failure", "cancelled", "timed_out"):
                    failed_checks.append({
                        "name": r.get("name"),
                        "conclusion": r.get("conclusion"),
                        "details_url": r.get("details_url") or r.get("html_url"),
                        "check_run_id": r.get("id"),
                    })
            # Best-effort: fetch the log excerpt of the FIRST failing run
            if failed_checks and hasattr(github_service, "get_check_run_logs"):
                try:
                    logs_excerpt = await github_service.get_check_run_logs(
                        gh_conn.config, credentials,
                        check_run_id=failed_checks[0]["check_run_id"],
                        max_chars=4000,
                    ) or ""
                except Exception:  # noqa: BLE001
                    logger.exception("Could not fetch CI logs for retry context")
    except Exception:  # noqa: BLE001
        logger.exception("CI context fetch failed — retry will proceed with stub context")

    # Fallback: if we could not fetch checks, use what the gate recorded.
    if not failed_checks:
        details = ci_gate.get("details") or {}
        for r in (details.get("runs") or []):
            if r.get("conclusion") in ("failure", "cancelled", "timed_out"):
                failed_checks.append({
                    "name": r.get("name"),
                    "conclusion": r.get("conclusion"),
                    "details_url": r.get("details_url") or r.get("html_url"),
                })

    github_repo = {
        "owner": None, "name": None, "default_branch": "main",
    }
    gh_conn = (
        await db.execute(
            select(IntegrationConnection).where(
                IntegrationConnection.id == parent_run.github_connection_id
            )
        )
    ).scalar_one_or_none()
    if gh_conn:
        github_repo = {
            "owner": gh_conn.config.get("repo_owner"),
            "name": gh_conn.config.get("repo_name"),
            "default_branch": gh_conn.config.get("default_branch", "main"),
        }

    # Create the new run — reuses the parent's connectors and branch.
    run = SupportAgentRun(
        ticket_id=ticket.id,
        entity_id=ticket.entity_id,
        status="pending",
        current_phase="fix",
        autonomy_mode=parent_run.autonomy_mode,
        deployment_mode=parent_run.deployment_mode,
        github_connection_id=parent_run.github_connection_id,
        agent_runner_connection_id=parent_run.agent_runner_connection_id,
        dokploy_staging_connection_id=parent_run.dokploy_staging_connection_id,
        dokploy_prod_connection_id=parent_run.dokploy_prod_connection_id,
        github_branch=parent_run.github_branch,
        github_pr_number=parent_run.github_pr_number,
        github_pr_url=parent_run.github_pr_url,
        triggered_by=triggered_by.id,
        triggered_automatically=False,
        report_json={"parent_run_id": str(parent_run.id), "retry_kind": "ci_fix"},
    )
    db.add(run)
    await db.flush()

    retry_ctx = {
        "parent_run_id": str(parent_run.id),
        "parent_branch": parent_run.github_branch,
        "parent_pr_number": parent_run.github_pr_number,
        "failed_checks": failed_checks,
        "logs_excerpt": logs_excerpt,
    }

    run.mission_md_content = build_mission_md(
        ticket=ticket,
        run=run,
        config=config,
        github_repo=github_repo,
        recent_comments=[],
        retry_ci_context=retry_ctx,
    )
    await db.flush()
    logger.info(
        "Launched CI-retry run %s (parent=%s, pr=%s, branch=%s, %d failed checks)",
        run.id, parent_run.id, parent_run.github_pr_number,
        parent_run.github_branch, len(failed_checks),
    )
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
    """Merge the PR attached to a run.

    Works for two states:
      * `awaiting_human` — autonomous_with_approval mode is asking for a
        decision before merging on its own.
      * `completed` (recommendation mode) — the run finished and produced
        a PR; admin reviews + merges from the OPSFLUX UI without leaving.

    Raises HarnessError otherwise (failed runs, no PR attached, etc.).
    """
    if run.status not in ("awaiting_human", "completed"):
        raise HarnessError(
            f"Run not in a mergeable state (status={run.status})"
        )
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

    # The agent creates PRs as `--draft` (mission_builder.py) so the
    # human reviewer sees them flagged as work-in-progress. GitHub
    # refuses to merge a draft via REST (`405 Method Not Allowed`);
    # we need to flip it to ready-for-review first. We discover
    # `draft` + `node_id` from the REST PR metadata and use the
    # GraphQL markPullRequestReadyForReview mutation if needed.
    try:
        pr_meta = await github_service.get_pr(
            conn.config, credentials, pr_number=run.github_pr_number,
        )
        if pr_meta.get("draft") and pr_meta.get("node_id"):
            await github_service.mark_pr_ready_for_review(
                conn.config, credentials, pr_node_id=pr_meta["node_id"],
            )
    except Exception as exc:  # noqa: BLE001 — log and push on; merge will fail loudly if still draft
        logger.warning(
            "approve_and_merge: could not flip PR #%s to ready-for-review: %s",
            run.github_pr_number, exc,
        )

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
