"""Service layer for heavy integration connectors.

Thin wrapper on top of `IntegrationConnection` that transparently handles:
  * JSON encryption via pgcrypto (`pgp_sym_encrypt` / `pgp_sym_decrypt`)
  * Per-type config validation through the Pydantic schemas
  * Credential previews for read responses (never leaks the full secret)

Callers (the router layer, the future agent harness) always go through
`load_credentials()` / `store_credentials()` — they never manipulate the
raw `credentials_encrypted` bytes themselves.
"""
from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import ENCRYPTION_KEY
from app.models.common import IntegrationConnection
from app.schemas.integrations import (
    AgentRunnerConfig,
    DokployConfig,
    GithubConfig,
    mask_secret,
)

logger = logging.getLogger(__name__)

_CONFIG_VALIDATORS = {
    "github": GithubConfig,
    "dokploy": DokployConfig,
    "agent_runner": AgentRunnerConfig,
}


def validate_config(connection_type: str, config: dict[str, Any]) -> dict[str, Any]:
    """Validate and normalise the `config` JSONB for a given connector type."""
    validator = _CONFIG_VALIDATORS.get(connection_type)
    if validator is None:
        raise ValueError(f"Unknown connection_type: {connection_type}")
    return validator(**config).model_dump(exclude_none=False)


async def store_credentials(
    db: AsyncSession,
    connection_id: UUID,
    credentials: dict[str, Any],
) -> None:
    """Encrypt a credentials dict and write it to `credentials_encrypted`.

    Uses pgcrypto at the database level so the raw ENCRYPTION_KEY never
    crosses the Python/DB boundary as bytes. If the dict is empty, the
    column is set to NULL (useful for `observation`-mode agent runner
    connectors that don't need a stored secret).
    """
    if not credentials:
        await db.execute(
            text(
                "UPDATE integration_connections "
                "SET credentials_encrypted = NULL, updated_at = NOW() "
                "WHERE id = :id"
            ),
            {"id": connection_id},
        )
        return

    payload = json.dumps(credentials, separators=(",", ":"))
    await db.execute(
        text(
            "UPDATE integration_connections "
            "SET credentials_encrypted = pgp_sym_encrypt(:payload, :key), "
            "    updated_at = NOW() "
            "WHERE id = :id"
        ),
        {"id": connection_id, "payload": payload, "key": ENCRYPTION_KEY},
    )


async def load_credentials(
    db: AsyncSession,
    connection_id: UUID,
) -> dict[str, Any]:
    """Decrypt `credentials_encrypted` and return the JSON dict.

    Returns `{}` when the column is NULL. Raises `ValueError` when the
    decryption fails — usually a signal that ENCRYPTION_KEY has been
    rotated and the old row is now unreadable.
    """
    row = (
        await db.execute(
            text(
                "SELECT pgp_sym_decrypt(credentials_encrypted::bytea, :key) AS plain "
                "FROM integration_connections "
                "WHERE id = :id AND credentials_encrypted IS NOT NULL"
            ),
            {"id": connection_id, "key": ENCRYPTION_KEY},
        )
    ).first()
    if row is None or row.plain is None:
        return {}
    try:
        return json.loads(row.plain)
    except json.JSONDecodeError as exc:  # pragma: no cover — corruption
        raise ValueError("Stored credentials are corrupted") from exc


def build_credentials_preview(
    connection_type: str, credentials: dict[str, Any]
) -> dict[str, str]:
    """Compute a short masked preview for each credential field.

    Example: `{"token": "••••abcd"}`. Used in read responses so the admin
    can tell instances apart without exposing the secret.
    """
    preview: dict[str, str] = {}
    if connection_type == "github":
        if credentials.get("token"):
            preview["token"] = mask_secret(credentials["token"])
        if credentials.get("private_key"):
            preview["private_key"] = "PEM (••••)"
        if credentials.get("webhook_secret"):
            preview["webhook_secret"] = mask_secret(credentials["webhook_secret"])
    elif connection_type == "dokploy":
        if credentials.get("api_token"):
            preview["api_token"] = mask_secret(credentials["api_token"])
    elif connection_type == "agent_runner":
        if credentials.get("api_key_value"):
            preview["api_key_value"] = mask_secret(credentials["api_key_value"])
    return preview


async def list_connections(
    db: AsyncSession,
    entity_id: UUID,
    connection_type: str | None = None,
) -> list[IntegrationConnection]:
    stmt = select(IntegrationConnection).where(IntegrationConnection.entity_id == entity_id)
    if connection_type:
        stmt = stmt.where(IntegrationConnection.connection_type == connection_type)
    stmt = stmt.order_by(IntegrationConnection.created_at.desc())
    return list((await db.execute(stmt)).scalars().all())


async def get_connection(
    db: AsyncSession,
    connection_id: UUID,
    entity_id: UUID,
) -> IntegrationConnection | None:
    return (
        await db.execute(
            select(IntegrationConnection).where(
                IntegrationConnection.id == connection_id,
                IntegrationConnection.entity_id == entity_id,
            )
        )
    ).scalar_one_or_none()


async def record_test_result(
    db: AsyncSession,
    connection: IntegrationConnection,
    ok: bool,
    message: str,
    details: dict[str, Any] | None = None,
) -> None:
    """Update `last_tested_at` / `last_test_result` and set status based on ok."""
    connection.last_tested_at = datetime.now(UTC)
    connection.last_test_result = {
        "ok": ok,
        "message": message,
        "details": details or {},
        "tested_at": connection.last_tested_at.isoformat(),
    }
    # Auto-suspend only on test failure if currently active.
    # Don't auto-resurrect 'disabled' — admin must re-enable explicitly.
    if not ok and connection.status == "active":
        connection.status = "error"
    elif ok and connection.status == "error":
        connection.status = "active"
