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

from datetime import UTC, datetime
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.core.database import get_db
from app.models.common import Setting, User
from app.models.travelwiz import VectorPosition
from app.services.tracking_pubsub import publish_position

router = APIRouter(prefix="/api/v1/tracking", tags=["tracking"])


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

    # Persist to vector_positions if vehicle_id is provided
    if vehicle_id:
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
        # Live fan-out to any WebSocket subscribers via Redis pub/sub.
        # Fire-and-forget: if Redis is down we still persisted the
        # position and the next polling fallback will pick it up.
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

    # Optional forwarding to an external Traccar Server (fire-and-forget)
    try:
        result = await db.execute(
            select(Setting.value).where(
                Setting.key == "tracking.traccar_forward_url",
                Setting.scope.in_(["tenant", "entity"]),
            )
        )
        forward_url_row = result.scalar_one_or_none()
        if forward_url_row:
            forward_url = str(forward_url_row).strip()
            if forward_url:
                forward_params = {
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
                async with httpx.AsyncClient(timeout=5.0) as client:
                    try:
                        await client.post(forward_url, params=forward_params)
                    except Exception:
                        # Best-effort — don't fail the OpsFlux request
                        pass
    except Exception:
        pass

    response.status_code = 200
    return {"ok": True}


@router.get("/osmand/health")
async def osmand_health():
    """Health check for Traccar Server compatibility — returns OK."""
    return {"status": "ok", "protocol": "osmand"}
