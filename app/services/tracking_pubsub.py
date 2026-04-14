"""Redis pub/sub fan-out for live vector (vehicle) GPS positions.

Problem: the backend runs with multiple uvicorn workers (see
docker-compose.yml `--workers 4`). A driver HTTP POST for a position
update lands on ONE worker, but waiting passengers are connected via
WebSocket on potentially OTHER workers. A naive in-memory subscriber
list would therefore only fan out to the minority of listeners sharing
the same process.

Solution: every worker publishes to Redis on a per-vector channel, and
every WS handler subscribes to its vector's channel. Redis becomes the
cross-process message bus.

Channel naming: ``vector_position:{vector_id}`` — one channel per
vehicle. Stateless; Redis drops the message if no subscriber is
connected, which is exactly what we want (no backlog, latest wins).

Payload shape (JSON):
    {
        "vector_id": "<uuid>",
        "lat": 4.0,
        "lon": 9.0,
        "heading": 123.4,            # degrees 0-360, optional
        "speed_knots": 12.3,         # optional
        "accuracy_m": 5.0,           # optional
        "recorded_at": "2026-04-14T12:34:56+00:00",
        "device_id": "opsflux-..."   # optional, for debugging
    }
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any
from uuid import UUID

from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)


def _channel(vector_id: UUID | str) -> str:
    return f"vector_position:{vector_id}"


async def publish_position(
    vector_id: UUID,
    lat: float,
    lon: float,
    *,
    recorded_at: datetime,
    heading: float | None = None,
    speed_knots: float | None = None,
    accuracy_m: float | None = None,
    device_id: str | None = None,
) -> None:
    """Broadcast a position update to all WS subscribers of this vector.

    Fire-and-forget — never raises. A Redis outage must not bring down
    the OsmAnd ingestion endpoint; the position is already persisted in
    Postgres by the caller, so missing the live fan-out just means the
    passenger sees the update 30s later on the next driver ping.
    """
    try:
        redis = get_redis()
    except RuntimeError:
        logger.debug("Redis not initialized; skipping position publish")
        return

    payload: dict[str, Any] = {
        "vector_id": str(vector_id),
        "lat": lat,
        "lon": lon,
        "recorded_at": recorded_at.isoformat(),
    }
    if heading is not None:
        payload["heading"] = heading
    if speed_knots is not None:
        payload["speed_knots"] = speed_knots
    if accuracy_m is not None:
        payload["accuracy_m"] = accuracy_m
    if device_id is not None:
        payload["device_id"] = device_id

    try:
        await redis.publish(_channel(vector_id), json.dumps(payload))
    except Exception:
        # Never propagate — ingestion must remain resilient.
        logger.warning("Failed to publish position for vector=%s", vector_id, exc_info=True)


async def subscribe_positions(vector_id: UUID) -> AsyncIterator[dict[str, Any]]:
    """Yield position updates for a single vector until cancelled.

    Usage::

        async for position in subscribe_positions(vector_id):
            await websocket.send_json(position)

    The generator terminates cleanly when the consumer stops awaiting
    (e.g. WebSocketDisconnect → task cancelled). Each subscriber gets
    its own pub/sub connection from the Redis pool — keep the number
    of active subscribers reasonable; a hard cap per vector should be
    enforced at the WS layer if abuse becomes a concern.
    """
    redis = get_redis()
    pubsub = redis.pubsub(ignore_subscribe_messages=True)
    channel = _channel(vector_id)
    try:
        await pubsub.subscribe(channel)
        async for message in pubsub.listen():
            # ignore_subscribe_messages=True already filters subscribe/
            # unsubscribe meta-events. Remaining `message` events carry
            # our JSON payload in `data`.
            if message is None:
                continue
            if message.get("type") != "message":
                continue
            raw = message.get("data")
            if not raw:
                continue
            try:
                yield json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("Ignored malformed pub/sub payload on %s", channel)
                continue
    finally:
        try:
            await pubsub.unsubscribe(channel)
        except Exception:
            pass
        try:
            await pubsub.aclose()
        except Exception:
            pass
