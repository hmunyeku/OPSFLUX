"""WebSocket endpoint for live vehicle GPS tracking.

Passengers waiting for a pickup (or boarded on a TravelWiz voyage),
and authorized fleet supervisors, can subscribe to the live position
stream of a specific transport vector (vehicle).

Protocol
--------

URL: ``wss://api.opsflux.io/ws/tracking/{vector_id}?token=<JWT>``

Server → client messages::

    { "type": "position", "data": { vector_id, lat, lon, heading?, speed_knots?, recorded_at, ... } }
    { "type": "snapshot", "data": { ...last known position (on connect, if any) } }
    { "type": "ping" }                                  # server heartbeat (every 30s)
    { "type": "error",    "data": { "detail": "..." } }

Client → server messages::

    { "type": "pong" }          # reply to server ping; or spontaneous keepalive
    { "type": "ping" }          # client-initiated keepalive — server replies "pong"

Close codes
-----------
* 4001 — authentication failed (token invalid/expired)
* 4003 — authorization denied (user not allowed to subscribe to this vector)
* 4004 — vector not found
* 1000 — normal closure (voyage ended, etc.)
* 1008 — policy violation (e.g. malformed message)

Authorization rules (any one of these grants access)
----------------------------------------------------
1. User has a ``travelwiz.fleet.view`` permission (or ``*``) in the
   current entity → global fleet supervisor view.
2. User is an active ``ManifestPassenger`` on an active Voyage
   (status ∈ {planned, confirmed, boarding, departed, delayed}) of
   this vector → passenger tracking their own ride (covers both ADS
   pickup and TravelWiz boarded voyages because both eventually
   produce manifest_passengers rows).
3. User was the creator (``Voyage.created_by``) of the current
   active voyage → captain/operator covering their own vector.
"""

from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.websockets import WebSocketState

from app.core.database import async_session_factory
from app.core.rbac import get_user_permissions
from app.core.security import JWTError, decode_token
from app.models.travelwiz import (
    ManifestPassenger,
    TransportVector,
    VectorPosition,
    Voyage,
    VoyageManifest,
)
from app.services.tracking_pubsub import subscribe_positions

logger = logging.getLogger(__name__)

router = APIRouter()

ACTIVE_VOYAGE_STATUSES = ("planned", "confirmed", "boarding", "departed", "delayed")


async def _authenticate_ws(token: str) -> tuple[UUID, UUID | None]:
    """Validate JWT; return (user_id, entity_id|None). Raises ValueError."""
    try:
        payload = decode_token(token)
    except JWTError:
        raise ValueError("Invalid or expired token")

    if payload.get("type") != "access":
        raise ValueError("Invalid token type")

    sub = payload.get("sub")
    if not sub:
        raise ValueError("Invalid token payload")

    user_id = UUID(sub)
    entity_id: UUID | None = None
    if payload.get("entity_id"):
        entity_id = UUID(payload["entity_id"])

    return user_id, entity_id


async def _authorize_vector_subscription(
    user_id: UUID,
    vector_id: UUID,
    entity_id: UUID | None,
    db: AsyncSession,
) -> tuple[bool, str | None]:
    """Return (allowed, reason_if_denied).

    See module docstring for the decision matrix.
    """
    # Rule 0: vector must exist (and not be soft-deleted via SoftDeleteMixin)
    vec = await db.execute(
        select(TransportVector.id).where(TransportVector.id == vector_id)
    )
    if vec.scalar_one_or_none() is None:
        return False, "vector_not_found"

    # Rule 1: fleet.view permission grants global access
    if entity_id is not None:
        try:
            perms = await get_user_permissions(user_id, entity_id, db)
            if "*" in perms or "travelwiz.fleet.view" in perms:
                return True, None
        except Exception:
            logger.debug("permission lookup failed", exc_info=True)

    # Rule 2: passenger on an active voyage of this vector
    pax_q = (
        select(ManifestPassenger.id)
        .join(VoyageManifest, VoyageManifest.id == ManifestPassenger.manifest_id)
        .join(Voyage, Voyage.id == VoyageManifest.voyage_id)
        .where(
            ManifestPassenger.user_id == user_id,
            ManifestPassenger.active.is_(True),
            ManifestPassenger.boarding_status != "offloaded",
            Voyage.vector_id == vector_id,
            Voyage.status.in_(ACTIVE_VOYAGE_STATUSES),
            Voyage.active.is_(True),
        )
        .limit(1)
    )
    if (await db.execute(pax_q)).scalar_one_or_none() is not None:
        return True, None

    # Rule 3: creator of the active voyage (captain/operator)
    creator_q = (
        select(Voyage.id)
        .where(
            Voyage.vector_id == vector_id,
            Voyage.created_by == user_id,
            Voyage.status.in_(ACTIVE_VOYAGE_STATUSES),
            Voyage.active.is_(True),
        )
        .limit(1)
    )
    if (await db.execute(creator_q)).scalar_one_or_none() is not None:
        return True, None

    return False, "not_authorized"


async def _send_last_known_position(websocket: WebSocket, vector_id: UUID) -> None:
    """Push the most recent stored position so the map doesn't start empty."""
    async with async_session_factory() as db:
        row = await db.execute(
            select(VectorPosition)
            .where(VectorPosition.vector_id == vector_id)
            .order_by(VectorPosition.recorded_at.desc())
            .limit(1)
        )
        pos = row.scalar_one_or_none()
    if pos is None:
        return

    payload: dict = {
        "vector_id": str(pos.vector_id),
        "lat": pos.latitude,
        "lon": pos.longitude,
        "recorded_at": pos.recorded_at.isoformat() if pos.recorded_at else None,
    }
    if pos.heading is not None:
        payload["heading"] = pos.heading
    if pos.speed_knots is not None:
        payload["speed_knots"] = pos.speed_knots
    if pos.payload and isinstance(pos.payload, dict):
        if "accuracy_m" in pos.payload:
            payload["accuracy_m"] = pos.payload["accuracy_m"]

    try:
        await websocket.send_json({"type": "snapshot", "data": payload})
    except Exception:
        logger.debug("Failed to send snapshot", exc_info=True)


async def _server_heartbeat(websocket: WebSocket) -> None:
    """Periodic server ping so mobile clients and proxies keep the TCP
    connection warm. Closes quietly when the socket is gone."""
    try:
        while True:
            await asyncio.sleep(30)
            if websocket.client_state != WebSocketState.CONNECTED:
                break
            try:
                await websocket.send_json({"type": "ping"})
            except Exception:
                break
    except asyncio.CancelledError:
        pass


async def _fanout_positions(websocket: WebSocket, vector_id: UUID) -> None:
    """Forward every Redis pub/sub position to this WebSocket."""
    async for position in subscribe_positions(vector_id):
        if websocket.client_state != WebSocketState.CONNECTED:
            break
        try:
            await websocket.send_json({"type": "position", "data": position})
        except Exception:
            logger.debug("send_json failed, stopping fanout", exc_info=True)
            break


async def _receive_loop(websocket: WebSocket) -> None:
    """Read client messages (ping/pong mostly) until disconnect."""
    while True:
        raw = await websocket.receive_json()
        msg_type = raw.get("type")
        if msg_type == "ping":
            await websocket.send_json({"type": "pong"})
        elif msg_type == "pong":
            # client reply to our heartbeat — no-op
            continue
        else:
            await websocket.send_json(
                {"type": "error", "data": {"detail": f"Unknown message type: {msg_type}"}}
            )


@router.websocket("/ws/tracking/{vector_id}")
async def ws_tracking_vector(
    websocket: WebSocket,
    vector_id: UUID,
    token: str = Query(..., description="JWT access token"),
) -> None:
    """Live GPS position stream for a single transport vector."""
    # ── Authenticate ──────────────────────────────────────────────
    try:
        user_id, entity_id = await _authenticate_ws(token)
    except ValueError as exc:
        await websocket.accept()
        await websocket.send_json(
            {"type": "error", "data": {"detail": str(exc)}}
        )
        await websocket.close(code=4001, reason="authentication_failed")
        return

    # ── Authorize ─────────────────────────────────────────────────
    async with async_session_factory() as db:
        allowed, reason = await _authorize_vector_subscription(
            user_id=user_id,
            vector_id=vector_id,
            entity_id=entity_id,
            db=db,
        )

    if not allowed:
        await websocket.accept()
        await websocket.send_json(
            {"type": "error", "data": {"detail": reason or "forbidden"}}
        )
        code = 4004 if reason == "vector_not_found" else 4003
        await websocket.close(code=code, reason=reason or "forbidden")
        return

    # ── Accept + bootstrap ────────────────────────────────────────
    await websocket.accept()
    logger.info(
        "WS tracking connected: user=%s vector=%s entity=%s",
        user_id, vector_id, entity_id,
    )

    heartbeat_task: asyncio.Task | None = None
    fanout_task: asyncio.Task | None = None

    try:
        # Send the latest known position immediately so the map can
        # render the icon without waiting for the next driver ping.
        await _send_last_known_position(websocket, vector_id)

        # Background producers.
        heartbeat_task = asyncio.create_task(_server_heartbeat(websocket))
        fanout_task = asyncio.create_task(_fanout_positions(websocket, vector_id))

        # Main thread = receive loop (client ping/pong handling).
        await _receive_loop(websocket)
    except WebSocketDisconnect:
        logger.info("WS tracking disconnected: user=%s vector=%s", user_id, vector_id)
    except Exception:
        logger.exception("WS tracking error: user=%s vector=%s", user_id, vector_id)
    finally:
        for task in (heartbeat_task, fanout_task):
            if task and not task.done():
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass
        if websocket.client_state == WebSocketState.CONNECTED:
            try:
                await websocket.close()
            except Exception:
                pass
