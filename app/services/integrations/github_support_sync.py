"""Support ↔ GitHub bidirectional sync helpers.

Sprint 2 — bridges OPSFLUX `SupportTicket` / `TicketComment` with GitHub
Issues. Two directions:

Outbound (OPSFLUX → GitHub):
  * `enable_sync` — creates the linked Issue if it does not exist yet
  * `mirror_comment` — pushes a ticket comment as an Issue comment
  * `mirror_status_change` — closes/reopens the Issue when the ticket
    transitions between statuses

Inbound (GitHub → OPSFLUX), triggered by the webhook route:
  * `apply_webhook_issue_event` — updates the ticket from an
    `issue` event (state changed on GitHub)
  * `apply_webhook_issue_comment_event` — mirrors a GitHub Issue
    comment back to the ticket, dedup'd by `github_comment_id`
  * `apply_webhook_pull_request_event` — links a PR opened for the
    linked Issue and propagates merge/close into the ticket

Every outbound call deliberately skips the mirror when the comment it
would push has `external_source = 'github'` — that prevents webhook →
outbound → webhook loops.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.common import IntegrationConnection
from app.models.support import SupportTicket, TicketComment
from app.services.core.integration_connection_service import load_credentials
from app.services.integrations import github_service

logger = logging.getLogger(__name__)


async def _load_connection(
    db: AsyncSession, connection_id: UUID
) -> tuple[IntegrationConnection, dict[str, Any]]:
    conn = (
        await db.execute(
            select(IntegrationConnection).where(
                IntegrationConnection.id == connection_id,
                IntegrationConnection.connection_type == "github",
            )
        )
    ).scalar_one_or_none()
    if not conn:
        raise ValueError(f"GitHub connection {connection_id} not found")
    if conn.status != "active":
        raise ValueError(f"GitHub connection is not active (status={conn.status})")
    creds = await load_credentials(db, conn.id)
    return conn, creds


def _build_issue_body(ticket: SupportTicket) -> str:
    """Format the Issue body. Kept simple; admin can rewrite after."""
    lines = [
        ticket.description or "_(no description)_",
        "",
        "---",
        f"- Reference: `{ticket.reference}`",
        f"- Type: `{ticket.ticket_type}`",
        f"- Priority: `{ticket.priority}`",
    ]
    if ticket.source_url:
        lines.append(f"- Source URL: {ticket.source_url}")
    lines.append("")
    lines.append("_Mirrored from OPSFLUX Support._")
    return "\n".join(lines)


async def enable_sync(
    db: AsyncSession,
    ticket: SupportTicket,
    connection_id: UUID,
) -> SupportTicket:
    """Bind a ticket to a GitHub connection and create the remote Issue.

    Idempotent: if the ticket already carries a `github_issue_number` we
    just flip the enabled flag without re-creating anything. The caller
    must `commit` afterwards.
    """
    conn, creds = await _load_connection(db, connection_id)
    ticket.github_connection_id = conn.id
    ticket.github_sync_enabled = True

    if ticket.github_issue_number:
        ticket.github_last_synced_at = datetime.now(UTC)
        return ticket

    issue = await github_service.create_issue(
        conn.config,
        creds,
        title=f"[{ticket.reference}] {ticket.title}",
        body=_build_issue_body(ticket),
        labels=["opsflux", f"priority:{ticket.priority}", f"type:{ticket.ticket_type}"],
    )
    ticket.github_issue_number = issue["number"]
    ticket.github_issue_url = issue["html_url"]
    ticket.github_last_synced_at = datetime.now(UTC)
    return ticket


async def mirror_comment(
    db: AsyncSession,
    ticket: SupportTicket,
    comment: TicketComment,
) -> None:
    """Push an OPSFLUX comment to the linked GitHub Issue.

    Skips:
      * tickets without an active binding,
      * `is_internal` comments (OPSFLUX-only note),
      * comments originating from the webhook (`external_source=github`),
        preventing ping-pong loops.
    """
    if not (ticket.github_sync_enabled and ticket.github_issue_number):
        return
    if comment.is_internal:
        return
    if comment.external_source == "github":
        return

    conn, creds = await _load_connection(db, ticket.github_connection_id)
    body = (
        f"{comment.body}\n\n"
        f"_— OPSFLUX comment by `{comment.author_id}`_"
    )
    try:
        await github_service.add_issue_comment(
            conn.config,
            creds,
            issue_number=ticket.github_issue_number,
            body=body,
        )
        ticket.github_last_synced_at = datetime.now(UTC)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to mirror comment to GitHub")


async def mirror_status_change(
    db: AsyncSession,
    ticket: SupportTicket,
    *,
    new_status: str,
) -> None:
    """Close/reopen the linked Issue based on the ticket's new status."""
    if not (ticket.github_sync_enabled and ticket.github_issue_number):
        return
    if new_status in ("resolved", "closed"):
        target_state = "closed"
        reason = "completed" if new_status == "resolved" else "not_planned"
    elif new_status in ("open", "in_progress", "waiting_info"):
        target_state = "open"
        reason = None
    else:
        return  # rejected → keep Issue untouched, admin decides

    conn, creds = await _load_connection(db, ticket.github_connection_id)
    try:
        await github_service.update_issue_state(
            conn.config,
            creds,
            issue_number=ticket.github_issue_number,
            state=target_state,
            state_reason=reason,
        )
        ticket.github_last_synced_at = datetime.now(UTC)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to mirror status change to GitHub")


# ─── Inbound (webhook → OPSFLUX) ────────────────────────────────────

async def _find_ticket_by_issue(
    db: AsyncSession, connection_id: UUID, issue_number: int
) -> SupportTicket | None:
    return (
        await db.execute(
            select(SupportTicket).where(
                SupportTicket.github_connection_id == connection_id,
                SupportTicket.github_issue_number == issue_number,
            )
        )
    ).scalar_one_or_none()


async def apply_webhook_issue_event(
    db: AsyncSession,
    connection_id: UUID,
    payload: dict[str, Any],
) -> SupportTicket | None:
    """Handle an `issue` webhook event.

    Currently mirrors `closed` / `reopened` actions back into the ticket
    status. The `edited` action is ignored to avoid fighting the admin
    who rewrote the Issue body on GitHub.
    """
    action = payload.get("action")
    issue = payload.get("issue", {})
    issue_number = issue.get("number")
    if not issue_number:
        return None

    ticket = await _find_ticket_by_issue(db, connection_id, issue_number)
    if not ticket:
        return None

    if action == "closed":
        ticket.status = "resolved"
        ticket.resolved_at = datetime.now(UTC)
    elif action == "reopened" and ticket.status in ("resolved", "closed"):
        ticket.status = "open"
        ticket.resolved_at = None
        ticket.closed_at = None
    ticket.github_last_synced_at = datetime.now(UTC)
    return ticket


async def apply_webhook_issue_comment_event(
    db: AsyncSession,
    connection_id: UUID,
    payload: dict[str, Any],
) -> TicketComment | None:
    """Handle an `issue_comment` webhook event.

    On `created`, mirror the GitHub comment as a new `TicketComment`
    tagged with `external_source='github'` so the outbound sync won't
    echo it back. On `edited` / `deleted` we currently do nothing —
    GitHub history is the source of truth for those operations.
    """
    if payload.get("action") != "created":
        return None
    issue = payload.get("issue", {})
    comment = payload.get("comment", {})
    issue_number = issue.get("number")
    gh_comment_id = comment.get("id")
    body = comment.get("body")
    if not (issue_number and gh_comment_id and body):
        return None

    ticket = await _find_ticket_by_issue(db, connection_id, issue_number)
    if not ticket:
        return None

    # Dedup — if the comment carries a matching github_comment_id we've
    # already mirrored it (happens when the webhook replays).
    already = (
        await db.execute(
            select(TicketComment.id).where(
                TicketComment.ticket_id == ticket.id,
                TicketComment.github_comment_id == gh_comment_id,
            )
        )
    ).scalar_one_or_none()
    if already:
        return None

    # Use the ticket reporter as the author; the real GitHub user is
    # preserved in the body prefix so the UI can still display it. A
    # later sprint will map GitHub users to OPSFLUX users properly.
    gh_user = (comment.get("user") or {}).get("login", "unknown")
    new_comment = TicketComment(
        ticket_id=ticket.id,
        author_id=ticket.reporter_id,
        body=f"**GitHub @{gh_user}:**\n\n{body}",
        is_internal=False,
        github_comment_id=gh_comment_id,
        external_source="github",
    )
    db.add(new_comment)
    ticket.github_last_synced_at = datetime.now(UTC)
    return new_comment


async def apply_webhook_pull_request_event(
    db: AsyncSession,
    connection_id: UUID,
    payload: dict[str, Any],
) -> SupportTicket | None:
    """Handle a `pull_request` webhook event.

    Strategy: a PR whose body contains `Closes #{issue_number}` is
    treated as linked to the ticket that mirrors that Issue. On `opened`
    we store the PR number/url; on `closed` with `merged=True` we mark
    the ticket resolved; closed without merge clears the link.
    """
    import re

    action = payload.get("action")
    pr = payload.get("pull_request", {})
    pr_number = pr.get("number")
    pr_url = pr.get("html_url")
    pr_body = pr.get("body") or ""
    merged = pr.get("merged", False)
    if not pr_number:
        return None

    # Parse "Closes #NNN" / "Fixes #NNN" / "Resolves #NNN"
    match = re.search(r"(?:closes|fixes|resolves)\s+#(\d+)", pr_body, re.IGNORECASE)
    if not match:
        return None
    linked_issue_number = int(match.group(1))

    ticket = await _find_ticket_by_issue(db, connection_id, linked_issue_number)
    if not ticket:
        return None

    if action == "opened" or action == "reopened":
        ticket.github_pr_number = pr_number
        ticket.github_pr_url = pr_url
    elif action == "closed":
        if merged:
            ticket.status = "resolved"
            ticket.resolved_at = datetime.now(UTC)
        else:
            # PR closed without merge — leave ticket state untouched
            # but clear the link so a new PR can take its place.
            ticket.github_pr_number = None
            ticket.github_pr_url = None
    ticket.github_last_synced_at = datetime.now(UTC)
    return ticket
