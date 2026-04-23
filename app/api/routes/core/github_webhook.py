"""GitHub webhook intake.

Mounted at `/api/v1/integrations/github/webhook/{connection_id}` (no
auth, intentionally — the webhook secret *is* the auth). Every call:

  1. Loads the connector referenced by `connection_id`,
  2. Looks up the stored webhook secret in its encrypted credentials,
  3. Verifies the `X-Hub-Signature-256` HMAC over the raw body,
  4. Dispatches on the `X-GitHub-Event` header to the sync service.

Unknown event types are ack'd with 204 (GitHub stops delivering on 4xx
responses).
"""
from __future__ import annotations

import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.common import IntegrationConnection
from app.services.core.integration_connection_service import load_credentials
from app.services.integrations import github_service, github_support_sync

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/integrations/github",
    tags=["integrations", "webhooks"],
)


@router.post("/webhook/{connection_id}", status_code=204)
async def receive_github_webhook(
    connection_id: UUID,
    request: Request,
    x_github_event: str | None = Header(default=None),
    x_hub_signature_256: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Entry point for every GitHub webhook delivery.

    Returns 401 when the signature fails — that's the one failure mode
    where we *want* GitHub to surface the error in its delivery log.
    Everything else (unknown event, dangling ticket, parse error) is
    absorbed as 204 so a noisy webhook never breaks the tenant.
    """
    body = await request.body()

    # Locate the connector — no entity filter here, the UUID is the
    # sole authority. The webhook URL contains it in plain text.
    conn = (
        await db.execute(
            select(IntegrationConnection).where(
                IntegrationConnection.id == connection_id,
                IntegrationConnection.connection_type == "github",
            )
        )
    ).scalar_one_or_none()
    if not conn:
        raise HTTPException(404, "Unknown GitHub connection")

    credentials = await load_credentials(db, conn.id)
    secret = credentials.get("webhook_secret")
    if not github_service.verify_webhook_signature(
        payload_body=body,
        signature_header=x_hub_signature_256,
        secret=secret,
    ):
        raise HTTPException(401, "Invalid signature")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        logger.warning("Invalid JSON in GitHub webhook body")
        return

    try:
        if x_github_event == "issues":
            ticket = await github_support_sync.apply_webhook_issue_event(
                db, conn.id, payload
            )
            if ticket:
                await db.commit()
        elif x_github_event == "issue_comment":
            created = await github_support_sync.apply_webhook_issue_comment_event(
                db, conn.id, payload
            )
            if created:
                await db.commit()
        elif x_github_event == "pull_request":
            ticket = await github_support_sync.apply_webhook_pull_request_event(
                db, conn.id, payload
            )
            if ticket:
                await db.commit()
        # Ping — emitted on webhook setup, just acknowledge
        elif x_github_event == "ping":
            logger.info(
                "GitHub webhook ping for connection %s (zen=%s)",
                conn.id, payload.get("zen"),
            )
        else:
            logger.debug(
                "Unhandled GitHub event type: %s",
                x_github_event,
            )
    except Exception:  # noqa: BLE001 — never break tenant on webhook error
        logger.exception("GitHub webhook handler crashed")
        await db.rollback()
