"""Traccar OsmAnd protocol — compatible tracking endpoint.

The OsmAnd protocol is the de-facto standard for mobile GPS clients
talking to a Traccar Server. By accepting the same query-param shape,
we get out-of-the-box compatibility with Traccar Web/Server clients
that an admin can deploy alongside OpsFlux.

Reference: https://www.traccar.org/osmand/

Expected query parameters:
  id          stable device identifier (string)
  timestamp   epoch seconds (int)
  lat, lon    decimal degrees (float, required)
  altitude    meters (optional)
  speed       knots (optional, Traccar convention)
  bearing     degrees 0-360 (optional)
  accuracy    meters (optional)
  batt        battery 0-100 (optional)
  charge      "true" / "false" (optional)
  vehicle_id  OPSFLUX-specific: maps device to a transport vector

OPSFLUX extension: when `vehicle_id` is provided, the position is also
recorded against the OpsFlux vector_positions table so it appears on
the fleet map / voyage detail. When absent, the position is just stored
with the device_id for replay later.

Response: 200 OK with empty body (Traccar convention).

If the entity has `tracking.traccar_forward_url` configured, we also
forward the same payload to that external Traccar Server in fire-and-
forget mode — this lets you have OpsFlux + a parallel Traccar deployment
without dual-push from the mobile.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.core.database import get_db
from app.core.redis_client import get_redis
from app.models.common import Setting, User
from app.models.travelwiz import TransportVector, VectorPosition
from app.services.tracking_pubsub import publish_position

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/tracking", tags=["tracking"])

# Redis TTL for cached forward-URL lookup (Setting table read once per minute).
_FORWARD_URL_CACHE_KEY = "tracking:traccar_forward_url"
_FORWARD_URL_CACHE_TTL = 60

# In-process cache for known vector IDs (short TTL to avoid re-querying
# the DB for every position update — a fleet device pings every 30s).
_VECTOR_CACHE_TTL_SECONDS = 60
_known_vector_ids: dict[str, float] = {}  # vector_id → epoch_seconds expires_at


async def _get_forward_url(db: AsyncSession) -> str | None:
    """Redis-cached lookup of the Traccar forward URL.

    Avoids slamming the DB with a Setting.SELECT on every position
    update. Returns None when unset or when Redis is unavailable AND
    the DB lookup fails — we never let this raise to the caller.
    """
    try:
        redis = get_redis()
        cached = await redis.get(_FORWARD_URL_CACHE_KEY)
        if cached is not None:
            # An empty string is valid "intentionally unset" — we store
            # that too so we don't re-query every minute.
            return cached or None
    except Exception:
        redis = None
    try:
        row = await db.execute(
            select(Setting.value).where(
                Setting.key == "tracking.traccar_forward_url",
                Setting.scope.in_(["tenant", "entity"]),
            )
        )
        value = row.scalar_one_or_none()
        url = (str(value).strip() if value else "") or ""
    except Exception:
        return None
    try:
        if redis is not None:
            await redis.set(_FORWARD_URL_CACHE_KEY, url, ex=_FORWARD_URL_CACHE_TTL)
    except Exception:
        pass
    return url or None


async def _vector_exists(db: AsyncSession, vector_id: UUID) -> bool:
    """Check the transport_vectors table, with a short in-process cache.

    Prevents FK IntegrityError (which would bubble up as 500) when
    devices send an unknown vehicle_id. Rejecting at validation time
    costs one cheap SELECT instead of a full INSERT + rollback.
    """
    import time
    now = time.monotonic()
    key = str(vector_id)
    expires = _known_vector_ids.get(key)
    if expires is not None and expires > now:
        return True
    try:
        r = await db.execute(
            select(TransportVector.id).where(TransportVector.id == vector_id).limit(1)
        )
        exists = r.scalar_one_or_none() is not None
    except Exception:
        return False
    if exists:
        _known_vector_ids[key] = now + _VECTOR_CACHE_TTL_SECONDS
    return exists


@router.post("/osmand", status_code=200)
async def osmand_position(
    response: Response,
    id: str = Query(..., description="Stable device identifier"),
    timestamp: int = Query(..., description="Epoch seconds"),
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    altitude: float | None = Query(None),
    speed: float | None = Query(None, ge=0, description="Speed in knots"),
    bearing: float | None = Query(None, ge=0, le=360),
    accuracy: float | None = Query(None, ge=0),
    batt: int | None = Query(None, ge=0, le=100),
    charge: str | None = Query(None, regex=r"^(true|false)$"),
    vehicle_id: UUID | None = Query(None, description="OpsFlux vector ID"),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("travelwiz.tracking.update"),
    db: AsyncSession = Depends(get_db),
):
    """Record a single GPS position in OsmAnd protocol format."""
    recorded_at = datetime.fromtimestamp(timestamp, tz=UTC)

    payload: dict = {
        "device_id": id,
        "altitude": altitude,
        "accuracy_m": accuracy,
        "battery_pct": batt,
        "charging": charge == "true" if charge is not None else None,
        "raw_user_id": str(current_user.id),
    }

    # Persist to vector_positions if vehicle_id is provided AND it
    # refers to a real transport_vectors row. An unknown vehicle_id is
    # a common case (device sent before it's provisioned, typo, etc.)
    # and MUST NOT return 500 — the OsmAnd client has no retry logic
    # on server errors and would drop positions silently.
    persisted = False
    if vehicle_id:
        if await _vector_exists(db, vehicle_id):
            try:
                pos = VectorPosition(
                    vector_id=vehicle_id,
                    latitude=lat,
                    longitude=lon,
                    source="gps",
                    recorded_at=recorded_at,
                    speed_knots=speed,
                    heading=bearing,
                    payload={k: v for k, v in payload.items() if v is not None},
                )
                db.add(pos)
                await db.commit()
                persisted = True
            except IntegrityError:
                # Race: vector was deleted between our existence check
                # and the INSERT. Swallow silently.
                await db.rollback()
            except SQLAlchemyError:
                # Pool saturation, connection drop, etc. — log and
                # respond 200 so the client doesn't retry aggressively.
                logger.warning("OsmAnd persist failed vehicle_id=%s", vehicle_id, exc_info=True)
                await db.rollback()
            except Exception:
                logger.exception("Unexpected OsmAnd error vehicle_id=%s", vehicle_id)
                try:
                    await db.rollback()
                except Exception:
                    pass

        if persisted:
            # Live fan-out to any WebSocket subscribers via Redis pub/sub.
            # Fire-and-forget: if Redis is down we still persisted the
            # position and the next polling fallback will pick it up.
            try:
                await publish_position(
                    vehicle_id,
                    lat,
                    lon,
                    recorded_at=recorded_at,
                    heading=bearing,
                    speed_knots=speed,
                    accuracy_m=accuracy,
                    device_id=id,
                )
            except Exception:
                logger.debug("publish_position raised", exc_info=True)

    # Optional forwarding to an external Traccar Server (fire-and-forget).
    # Setting lookup is Redis-cached so this doesn't dominate the request.
    try:
        forward_url = await _get_forward_url(db)
    except Exception:
        forward_url = None

    if forward_url:
        forward_params: dict[str, str | int | float] = {
            "id": id,
            "timestamp": timestamp,
            "lat": lat,
            "lon": lon,
        }
        if altitude is not None:
            forward_params["altitude"] = altitude
        if speed is not None:
            forward_params["speed"] = speed
        if bearing is not None:
            forward_params["bearing"] = bearing
        if accuracy is not None:
            forward_params["accuracy"] = accuracy
        if batt is not None:
            forward_params["batt"] = batt
        if charge is not None:
            forward_params["charge"] = charge
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(forward_url, params=forward_params)
        except Exception:
            # Best-effort — don't fail the OpsFlux request
            pass

    response.status_code = 200
    return {"ok": True, "persisted": persisted}


@router.get("/osmand/health")
async def osmand_health():
    """Health check for Traccar Server compatibility — returns OK."""
    return {"status": "ok", "protocol": "osmand"}
