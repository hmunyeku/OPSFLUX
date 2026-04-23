"""CRUD + test endpoints for heavy integration connectors.

Exposed under `/api/v1/integration-connections` (the dash distinguishes
it from the legacy Settings-key-based `/api/v1/integrations` route which
handles light integrations).

All endpoints require `core.settings.manage` — same gate as the rest of
the Integrations admin surface.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.audit import record_audit
from app.core.database import get_db
from app.models.common import IntegrationConnection, User
from app.schemas.integrations import (
    IntegrationConnectionCreate,
    IntegrationConnectionRead,
    IntegrationConnectionUpdate,
    TestResult,
)
from app.services.core.integration_connection_service import (
    build_credentials_preview,
    get_connection,
    list_connections,
    load_credentials,
    record_test_result,
    store_credentials,
    validate_config,
)
from app.services.integrations import dokploy_service, github_service

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/integration-connections",
    tags=["integration-connections"],
    dependencies=[require_permission("core.settings.manage")],
)


async def _serialize(
    db: AsyncSession, conn: IntegrationConnection
) -> IntegrationConnectionRead:
    """Attach masked credential preview to a connector."""
    credentials = await load_credentials(db, conn.id)
    return IntegrationConnectionRead(
        id=conn.id,
        entity_id=conn.entity_id,
        connection_type=conn.connection_type,
        name=conn.name,
        config=conn.config,
        status=conn.status,
        last_tested_at=conn.last_tested_at,
        last_test_result=conn.last_test_result,
        created_at=conn.created_at,
        updated_at=conn.updated_at,
        credentials_preview=build_credentials_preview(
            conn.connection_type, credentials
        ),
    )


async def _dispatch_test(
    conn_type: str, config: dict[str, Any], credentials: dict[str, Any]
) -> tuple[bool, str, dict[str, Any]]:
    """Route a test call to the right service based on connector type."""
    if conn_type == "github":
        return await github_service.test_connection(config, credentials)
    if conn_type == "dokploy":
        return await dokploy_service.test_connection(config, credentials)
    if conn_type == "agent_runner":
        # Agent runner tests arrive in Sprint 5. For now we mark the row
        # as tested with a placeholder — its creation is still valid so
        # the UI can save it and revisit later.
        return (
            True,
            "Agent runner configured — live test will ship with Sprint 5",
            {"placeholder": True},
        )
    return False, f"Unknown connection_type: {conn_type}", {}


# ─── List ──────────────────────────────────────────────────────────────

@router.get("", response_model=list[IntegrationConnectionRead])
async def list_integration_connections(
    connection_type: str | None = Query(default=None, pattern="^(github|dokploy|agent_runner)$"),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    rows = await list_connections(db, entity_id, connection_type)
    return [await _serialize(db, r) for r in rows]


# ─── Get one ───────────────────────────────────────────────────────────

@router.get("/{connection_id}", response_model=IntegrationConnectionRead)
async def get_integration_connection(
    connection_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    conn = await get_connection(db, connection_id, entity_id)
    if not conn:
        raise HTTPException(404, "Integration connection not found")
    return await _serialize(db, conn)


# ─── Create ────────────────────────────────────────────────────────────

@router.post("", response_model=IntegrationConnectionRead, status_code=201)
async def create_integration_connection(
    body: IntegrationConnectionCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        validated_config = validate_config(body.connection_type, body.config)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except Exception as exc:  # noqa: BLE001 — pydantic validation wraps
        raise HTTPException(422, f"Invalid config for {body.connection_type}: {exc}")

    conn = IntegrationConnection(
        entity_id=entity_id,
        connection_type=body.connection_type,
        name=body.name,
        config=validated_config,
        status="active",
        created_by=current_user.id,
    )
    db.add(conn)
    await db.flush()  # get id for store_credentials

    await store_credentials(db, conn.id, body.credentials)

    await record_audit(
        db,
        action="integration_connection.create",
        resource_type="integration_connection",
        resource_id=str(conn.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "connection_type": body.connection_type,
            "name": body.name,
        },
    )
    await db.commit()
    await db.refresh(conn)
    return await _serialize(db, conn)


# ─── Update ────────────────────────────────────────────────────────────

@router.patch("/{connection_id}", response_model=IntegrationConnectionRead)
async def update_integration_connection(
    connection_id: UUID,
    body: IntegrationConnectionUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conn = await get_connection(db, connection_id, entity_id)
    if not conn:
        raise HTTPException(404, "Integration connection not found")

    changes: dict[str, Any] = {}
    if body.name is not None:
        conn.name = body.name
        changes["name"] = body.name
    if body.config is not None:
        try:
            conn.config = validate_config(conn.connection_type, body.config)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(422, f"Invalid config: {exc}")
        changes["config"] = True
    if body.status is not None:
        conn.status = body.status
        changes["status"] = body.status

    # Credentials come with the patch body but travel through the
    # encrypted column, not the regular attribute update path.
    if body.credentials is not None:
        await store_credentials(db, conn.id, body.credentials)
        changes["credentials"] = True

    conn.updated_at = datetime.now(UTC)
    await record_audit(
        db,
        action="integration_connection.update",
        resource_type="integration_connection",
        resource_id=str(conn.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details=changes,
    )
    await db.commit()
    await db.refresh(conn)
    return await _serialize(db, conn)


# ─── Delete ────────────────────────────────────────────────────────────

@router.delete("/{connection_id}", status_code=204)
async def delete_integration_connection(
    connection_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conn = await get_connection(db, connection_id, entity_id)
    if not conn:
        raise HTTPException(404, "Integration connection not found")
    await record_audit(
        db,
        action="integration_connection.delete",
        resource_type="integration_connection",
        resource_id=str(conn.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"connection_type": conn.connection_type, "name": conn.name},
    )
    await db.delete(conn)
    await db.commit()


# ─── Test connection ───────────────────────────────────────────────────

@router.post("/{connection_id}/test", response_model=TestResult)
async def test_integration_connection(
    connection_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conn = await get_connection(db, connection_id, entity_id)
    if not conn:
        raise HTTPException(404, "Integration connection not found")

    credentials = await load_credentials(db, conn.id)
    ok, message, details = await _dispatch_test(
        conn.connection_type, conn.config, credentials
    )
    await record_test_result(db, conn, ok, message, details)

    await record_audit(
        db,
        action="integration_connection.test",
        resource_type="integration_connection",
        resource_id=str(conn.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"ok": ok, "message": message},
    )
    await db.commit()
    await db.refresh(conn)

    return TestResult(
        ok=ok,
        message=message,
        details=details,
        tested_at=conn.last_tested_at or datetime.now(UTC),
    )
