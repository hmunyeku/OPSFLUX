"""WebSocket connection manager for real-time notifications.

Manages per-user WebSocket connections with Redis pub/sub for
cross-process delivery (multi-worker deployments).
"""

import asyncio
import json
import logging
from uuid import UUID

from fastapi import WebSocket
from starlette.websockets import WebSocketState

from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

# Redis pub/sub channel prefix
_CHANNEL_PREFIX = "notifications"


def _channel_for_user(user_id: UUID) -> str:
    return f"{_CHANNEL_PREFIX}:{user_id}"


def _channel_for_entity(entity_id: UUID) -> str:
    return f"{_CHANNEL_PREFIX}:entity:{entity_id}"


class NotificationConnectionManager:
    """Singleton that tracks active WebSocket connections per user.

    Each user may have multiple connections (multi-tab). When a notification
    is published via Redis pub/sub, every local connection for that user
    receives the message.
    """

    def __init__(self) -> None:
        # user_id -> set of WebSocket connections
        self._connections: dict[UUID, set[WebSocket]] = {}
        # asyncio tasks for Redis subscription listeners (per-user)
        self._listener_tasks: dict[UUID, asyncio.Task] = {}
        # entity_id -> set of WebSocket connections (for entity-level broadcasts)
        self._entity_connections: dict[UUID, set[WebSocket]] = {}
        # asyncio tasks for Redis entity subscription listeners
        self._entity_listener_tasks: dict[UUID, asyncio.Task] = {}
        # websocket -> entity_id mapping (for cleanup on disconnect)
        self._ws_entity_map: dict[WebSocket, UUID] = {}

    # ── Connection lifecycle ────────────────────────────────────────────

    async def connect(self, user_id: UUID, websocket: WebSocket, *, entity_id: UUID | None = None) -> None:
        """Accept and register a WebSocket connection for *user_id*.

        If *entity_id* is provided, also subscribe to entity-level broadcasts
        (e.g. cache invalidation events).
        """
        await websocket.accept()

        if user_id not in self._connections:
            self._connections[user_id] = set()

        self._connections[user_id].add(websocket)
        logger.info(
            "WS connected: user=%s connections=%d",
            user_id,
            len(self._connections[user_id]),
        )

        # Start a Redis listener if this is the first connection for the user
        if user_id not in self._listener_tasks or self._listener_tasks[user_id].done():
            self._listener_tasks[user_id] = asyncio.create_task(
                self._redis_listener(user_id)
            )

        # Subscribe to entity-level broadcasts if entity_id provided
        if entity_id:
            self._ws_entity_map[websocket] = entity_id
            if entity_id not in self._entity_connections:
                self._entity_connections[entity_id] = set()
            self._entity_connections[entity_id].add(websocket)

            if entity_id not in self._entity_listener_tasks or self._entity_listener_tasks[entity_id].done():
                self._entity_listener_tasks[entity_id] = asyncio.create_task(
                    self._redis_entity_listener(entity_id)
                )

    async def disconnect(self, user_id: UUID, websocket: WebSocket) -> None:
        """Remove a WebSocket connection. Cleans up Redis listener when last
        connection for a user is removed."""
        conns = self._connections.get(user_id)
        if conns:
            conns.discard(websocket)
            if not conns:
                del self._connections[user_id]
                # Cancel Redis listener — no local connections left
                task = self._listener_tasks.pop(user_id, None)
                if task and not task.done():
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass

        # Clean up entity-level subscription
        entity_id = self._ws_entity_map.pop(websocket, None)
        if entity_id:
            entity_conns = self._entity_connections.get(entity_id)
            if entity_conns:
                entity_conns.discard(websocket)
                if not entity_conns:
                    del self._entity_connections[entity_id]
                    task = self._entity_listener_tasks.pop(entity_id, None)
                    if task and not task.done():
                        task.cancel()
                        try:
                            await task
                        except asyncio.CancelledError:
                            pass

        logger.info(
            "WS disconnected: user=%s remaining=%d",
            user_id,
            len(self._connections.get(user_id, [])),
        )

    # ── Sending helpers ─────────────────────────────────────────────────

    async def _send_json_safe(self, websocket: WebSocket, data: dict) -> bool:
        """Send JSON to a single websocket, returning False on failure."""
        try:
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.send_json(data)
                return True
        except Exception:
            logger.debug("Failed to send to websocket", exc_info=True)
        return False

    async def send_to_user_local(self, user_id: UUID, data: dict) -> int:
        """Send *data* to all **local** connections for *user_id*.

        Returns the number of connections that received the message.
        """
        conns = self._connections.get(user_id, set()).copy()
        sent = 0
        dead: list[WebSocket] = []
        for ws in conns:
            if await self._send_json_safe(ws, data):
                sent += 1
            else:
                dead.append(ws)

        # Prune dead connections
        for ws in dead:
            await self.disconnect(user_id, ws)

        return sent

    async def send_to_user(self, user_id: UUID, data: dict) -> None:
        """Publish a notification for *user_id* via Redis pub/sub.

        Every process with local connections for this user will receive
        the message and forward it to the relevant WebSockets.
        """
        redis = get_redis()
        channel = _channel_for_user(user_id)
        payload = json.dumps(data, default=str)
        await redis.publish(channel, payload)

    async def broadcast_to_entity(self, entity_id: UUID, data: dict) -> None:
        """Publish a notification to **all** users of an entity via Redis."""
        redis = get_redis()
        channel = _channel_for_entity(entity_id)
        payload = json.dumps(data, default=str)
        await redis.publish(channel, payload)

    # ── Redis pub/sub listener (one per user, per process) ──────────────

    async def _redis_listener(self, user_id: UUID) -> None:
        """Subscribe to the user's notification channel and forward messages
        to all local WebSocket connections."""
        redis = get_redis()
        pubsub = redis.pubsub()
        user_channel = _channel_for_user(user_id)

        try:
            await pubsub.subscribe(user_channel)
            logger.debug("Redis subscribed: %s", user_channel)

            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    data = json.loads(message["data"])
                except (json.JSONDecodeError, TypeError):
                    continue

                await self.send_to_user_local(user_id, data)
        except asyncio.CancelledError:
            logger.debug("Redis listener cancelled: %s", user_channel)
        except Exception:
            logger.exception("Redis listener error: %s", user_channel)
        finally:
            try:
                await pubsub.unsubscribe(user_channel)
                await pubsub.aclose()
            except Exception:
                pass

    async def _redis_entity_listener(self, entity_id: UUID) -> None:
        """Subscribe to the entity broadcast channel and forward messages
        to all local WebSocket connections for that entity."""
        redis = get_redis()
        pubsub = redis.pubsub()
        entity_channel = _channel_for_entity(entity_id)

        try:
            await pubsub.subscribe(entity_channel)
            logger.debug("Redis entity subscribed: %s", entity_channel)

            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    data = json.loads(message["data"])
                except (json.JSONDecodeError, TypeError):
                    continue

                # Forward to all local WebSocket connections for this entity
                conns = self._entity_connections.get(entity_id, set()).copy()
                dead: list[WebSocket] = []
                for ws in conns:
                    if not await self._send_json_safe(ws, data):
                        dead.append(ws)

                # Prune dead connections
                for ws in dead:
                    entity_conns = self._entity_connections.get(entity_id)
                    if entity_conns:
                        entity_conns.discard(ws)
        except asyncio.CancelledError:
            logger.debug("Redis entity listener cancelled: %s", entity_channel)
        except Exception:
            logger.exception("Redis entity listener error: %s", entity_channel)
        finally:
            try:
                await pubsub.unsubscribe(entity_channel)
                await pubsub.aclose()
            except Exception:
                pass

    # ── Diagnostics ─────────────────────────────────────────────────────

    @property
    def active_user_count(self) -> int:
        return len(self._connections)

    @property
    def total_connection_count(self) -> int:
        return sum(len(c) for c in self._connections.values())

    def is_user_connected(self, user_id: UUID) -> bool:
        return bool(self._connections.get(user_id))


# Module-level singleton
notification_manager = NotificationConnectionManager()
