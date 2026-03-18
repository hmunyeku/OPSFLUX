"""WebSocket endpoint for real-time notifications.

Clients connect with:
    ws://host/ws/notifications?token=<JWT>

Protocol messages (server -> client):
    {"type": "notification", "data": {...notification fields}}
    {"type": "pong"}
    {"type": "read_confirmed", "data": {"id": "<uuid>"}}
    {"type": "queued", "data": [<unread notifications>]}
    {"type": "error", "data": {"detail": "..."}}

Protocol messages (client -> server):
    {"type": "ping"}
    {"type": "mark_read", "data": {"id": "<uuid>"}}
"""

import asyncio
import logging
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select, update
from starlette.websockets import WebSocketState

from app.core.database import async_session_factory
from app.core.notification_manager import notification_manager
from app.core.security import JWTError, decode_token
from app.models.common import Notification

logger = logging.getLogger(__name__)

router = APIRouter()


async def _authenticate_ws(token: str) -> tuple[UUID, UUID | None]:
    """Validate the JWT and return (user_id, entity_id | None).

    Raises ValueError when the token is invalid.
    """
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


async def _send_queued_notifications(
    websocket: WebSocket, user_id: UUID, entity_id: UUID | None
) -> None:
    """Load unread notifications from DB and push them to the client."""
    async with async_session_factory() as db:
        query = (
            select(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.read == False,
            )
            .order_by(Notification.created_at.desc())
            .limit(50)
        )
        if entity_id:
            query = query.where(Notification.entity_id == entity_id)

        result = await db.execute(query)
        notifications = result.scalars().all()

    if not notifications:
        return

    items = [
        {
            "id": str(n.id),
            "user_id": str(n.user_id),
            "entity_id": str(n.entity_id),
            "title": n.title,
            "body": n.body,
            "category": n.category,
            "link": n.link,
            "read": n.read,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in notifications
    ]

    try:
        await websocket.send_json({"type": "queued", "data": items})
    except Exception:
        logger.debug("Failed to send queued notifications", exc_info=True)


async def _handle_mark_read(
    websocket: WebSocket, user_id: UUID, notification_id_str: str
) -> None:
    """Mark a single notification as read (via WebSocket command)."""
    try:
        notification_id = UUID(notification_id_str)
    except (ValueError, TypeError):
        await websocket.send_json(
            {"type": "error", "data": {"detail": "Invalid notification id"}}
        )
        return

    async with async_session_factory() as db:
        result = await db.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
        )
        notif = result.scalar_one_or_none()

        if not notif:
            await websocket.send_json(
                {"type": "error", "data": {"detail": "Notification not found"}}
            )
            return

        if not notif.read:
            await db.execute(
                update(Notification)
                .where(Notification.id == notification_id)
                .values(read=True, read_at=datetime.now(UTC))
            )
            await db.commit()

    await websocket.send_json(
        {"type": "read_confirmed", "data": {"id": str(notification_id)}}
    )


async def _keepalive_loop(websocket: WebSocket) -> None:
    """Send a server-side ping every 30 seconds to detect stale connections."""
    try:
        while True:
            await asyncio.sleep(30)
            if websocket.client_state != WebSocketState.CONNECTED:
                break
            await websocket.send_json({"type": "ping"})
    except asyncio.CancelledError:
        pass
    except Exception:
        pass


@router.websocket("/ws/notifications")
async def ws_notifications(
    websocket: WebSocket,
    token: str = Query(...),
) -> None:
    """WebSocket endpoint for real-time notifications.

    Query params:
        token: JWT access token
    """
    # ── Authenticate ──────────────────────────────────────────────
    try:
        user_id, entity_id = await _authenticate_ws(token)
    except (ValueError, Exception) as exc:
        # Cannot use send_json before accept, so accept then close
        await websocket.accept()
        await websocket.send_json(
            {"type": "error", "data": {"detail": str(exc)}}
        )
        await websocket.close(code=4001, reason="Authentication failed")
        return

    # ── Register connection ───────────────────────────────────────
    await notification_manager.connect(user_id, websocket)
    keepalive_task: asyncio.Task | None = None

    try:
        # Send unread notifications
        await _send_queued_notifications(websocket, user_id, entity_id)

        # Start keepalive
        keepalive_task = asyncio.create_task(_keepalive_loop(websocket))

        # ── Message loop ──────────────────────────────────────────
        while True:
            raw = await websocket.receive_json()

            msg_type = raw.get("type")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "mark_read":
                data = raw.get("data", {})
                nid = data.get("id")
                if nid:
                    await _handle_mark_read(websocket, user_id, nid)
                else:
                    await websocket.send_json(
                        {"type": "error", "data": {"detail": "Missing notification id"}}
                    )

            else:
                await websocket.send_json(
                    {"type": "error", "data": {"detail": f"Unknown message type: {msg_type}"}}
                )

    except WebSocketDisconnect:
        logger.info("WS client disconnected: user=%s", user_id)
    except Exception:
        logger.exception("WS error: user=%s", user_id)
    finally:
        if keepalive_task and not keepalive_task.done():
            keepalive_task.cancel()
            try:
                await keepalive_task
            except asyncio.CancelledError:
                pass
        await notification_manager.disconnect(user_id, websocket)
