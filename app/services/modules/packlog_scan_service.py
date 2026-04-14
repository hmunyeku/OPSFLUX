"""Cargo scan service — GPS-stamped scan events + location auto-detect.

Called from the mobile scanner every time an operator reads a cargo
label (or from the web for manual scan fallback). Core responsibilities:

1. Persist the scan to ``cargo_scan_events`` with the scanner's GPS.
2. Find the nearest ``ar_installation`` within a configurable radius
   and, when found, attach it to the event as ``matched_asset_id`` so
   the mobile can ask "You're at X, right?".
3. Suggest a status transition based on the matched location and the
   cargo's known origin / destination.

Distance math is Haversine in Python because the ``ar_installations``
rows store lat/lon as Numeric(12,8) — no PostGIS geometry. Since we
filter by ``entity_id`` first the candidate set is small (hundreds,
not millions), so the Python pass is cheap enough.
"""

from __future__ import annotations

import logging
import math
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset_registry import Installation
from app.models.common import Setting, User
from app.models.packlog import CargoItem, CargoScanEvent

logger = logging.getLogger(__name__)

DEFAULT_RADIUS_M = 500.0
# Status transitions the scan flow is allowed to suggest automatically.
_ALLOWED_STATUS_SUGGESTIONS = {
    # (from_status, at_destination) -> suggested_status
    ("in_transit", True): "delivered_final",
    ("delivered_intermediate", True): "delivered_final",
    ("loaded", True): "delivered_final",
    ("registered", False): "in_transit",
    ("ready", False): "in_transit",
}


# ── Distance ──────────────────────────────────────────────────────────


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two (lat, lon) in meters."""
    R = 6_371_000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


# ── Config ────────────────────────────────────────────────────────────


async def get_scan_radius_m(db: AsyncSession, entity_id: UUID | None) -> float:
    """Look up the configured scan radius. Entity override first, then
    tenant default, then fallback to 500m.
    """
    # Entity scope
    if entity_id is not None:
        row = await db.execute(
            select(Setting.value).where(
                Setting.key == "packlog.scan_radius_m",
                Setting.scope == "entity",
                Setting.scope_id == str(entity_id),
            )
        )
        v = row.scalar_one_or_none()
        if v is not None:
            try:
                return float(v)
            except (TypeError, ValueError):
                pass
    # Tenant scope
    row = await db.execute(
        select(Setting.value).where(
            Setting.key == "packlog.scan_radius_m",
            Setting.scope == "tenant",
        )
    )
    v = row.scalar_one_or_none()
    if v is not None:
        try:
            return float(v)
        except (TypeError, ValueError):
            pass
    return DEFAULT_RADIUS_M


# ── Nearest-installation lookup ───────────────────────────────────────


async def find_nearby_installations(
    db: AsyncSession,
    *,
    entity_id: UUID,
    lat: float,
    lon: float,
    radius_m: float,
    limit: int = 5,
) -> list[tuple[Installation, float]]:
    """Return installations within ``radius_m`` of (lat, lon), sorted by
    distance ascending. Each result is (Installation, distance_in_m)."""
    candidates = (
        await db.execute(
            select(Installation).where(
                Installation.entity_id == entity_id,
                Installation.archived == False,  # noqa: E712
                Installation.latitude.is_not(None),
                Installation.longitude.is_not(None),
            )
        )
    ).scalars().all()

    out: list[tuple[Installation, float]] = []
    for inst in candidates:
        try:
            d = haversine_m(lat, lon, float(inst.latitude), float(inst.longitude))
        except (TypeError, ValueError):
            continue
        if d <= radius_m:
            out.append((inst, d))
    out.sort(key=lambda p: p[1])
    return out[:limit]


# ── Status suggestion ─────────────────────────────────────────────────


def suggest_status(
    *,
    cargo: CargoItem,
    matched_asset_id: UUID | None,
) -> tuple[str | None, str | None]:
    """Return (suggested_status, human_reason) or (None, None)."""
    if matched_asset_id is None:
        return None, None
    at_destination = (
        cargo.destination_asset_id is not None
        and matched_asset_id == cargo.destination_asset_id
    )
    key = (cargo.status, at_destination)
    suggestion = _ALLOWED_STATUS_SUGGESTIONS.get(key)
    if suggestion is None:
        return None, None
    if suggestion == "delivered_final":
        return suggestion, "Position correspond à la destination du colis."
    if suggestion == "in_transit":
        return suggestion, "Colis scanné en dehors de la destination — probablement en route."
    return suggestion, None


# ── Main scan entry point ─────────────────────────────────────────────


async def record_scan(
    db: AsyncSession,
    *,
    cargo: CargoItem,
    user: User | None,
    lat: float,
    lon: float,
    accuracy_m: float | None,
    scanned_at: datetime | None,
    device_id: str | None,
    note: str | None,
) -> dict:
    """Persist a scan event and compute the match + status suggestion.

    Returns a dict shaped to match ``CargoScanResult``.
    """
    radius_m = await get_scan_radius_m(db, cargo.entity_id)
    nearby = await find_nearby_installations(
        db,
        entity_id=cargo.entity_id,
        lat=lat,
        lon=lon,
        radius_m=radius_m,
        limit=5,
    )

    matched = nearby[0] if nearby else None
    matched_asset_id = matched[0].id if matched else None
    matched_distance = matched[1] if matched else None

    effective_scanned_at = scanned_at or datetime.now(UTC)

    # Build and persist the event.
    event = CargoScanEvent(
        entity_id=cargo.entity_id,
        cargo_item_id=cargo.id,
        user_id=user.id if user else None,
        scanned_at=effective_scanned_at,
        latitude=lat,
        longitude=lon,
        accuracy_m=accuracy_m,
        matched_asset_id=matched_asset_id,
        matched_distance_m=matched_distance,
        status_before=cargo.status,
        status_after=None,  # filled later if status is confirmed
        action="scan",
        note=note,
        device_id=device_id,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)

    suggestion, reason = suggest_status(cargo=cargo, matched_asset_id=matched_asset_id)

    def _loc_dict(inst: Installation, distance_m: float) -> dict:
        return {
            "id": inst.id,
            "name": inst.name,
            "code": inst.code,
            "distance_m": round(distance_m, 1),
            "is_origin": False,
            "is_destination": (
                cargo.destination_asset_id is not None
                and inst.id == cargo.destination_asset_id
            ),
        }

    return {
        "scan_event_id": event.id,
        "cargo_id": cargo.id,
        "matched_installation": _loc_dict(*matched) if matched else None,
        "nearby_installations": [_loc_dict(inst, d) for (inst, d) in nearby[1:]],
        "radius_m": radius_m,
        "status_current": cargo.status,
        "status_suggestion": suggestion,
        "status_suggestion_reason": reason,
        "scan": {
            "lat": lat,
            "lon": lon,
            "accuracy_m": accuracy_m,
            "scanned_at": effective_scanned_at.isoformat(),
        },
    }


# ── Confirm / correct follow-up ───────────────────────────────────────


async def confirm_scan(
    db: AsyncSession,
    *,
    cargo: CargoItem,
    user: User,
    scan_event_id: UUID,
    confirmed_asset_id: UUID | None,
    new_status: str | None,
    note: str | None,
) -> CargoScanEvent:
    """Apply the operator's confirmation to a previously-logged scan.

    - Updates the scan event's ``confirmed_asset_id`` and ``status_after``
    - If ``new_status`` is supplied, updates the cargo's ``status``

    The permission check for status update must be done by the caller.
    """
    row = await db.execute(
        select(CargoScanEvent).where(
            CargoScanEvent.id == scan_event_id,
            CargoScanEvent.cargo_item_id == cargo.id,
            CargoScanEvent.entity_id == cargo.entity_id,
        )
    )
    event = row.scalar_one_or_none()
    if event is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Scan event not found")

    if confirmed_asset_id is not None:
        event.confirmed_asset_id = confirmed_asset_id
        event.action = (
            "location_confirmed"
            if confirmed_asset_id == event.matched_asset_id
            else "location_corrected"
        )
    if note is not None:
        event.note = note
    if new_status is not None and new_status != cargo.status:
        event.status_before = cargo.status
        event.status_after = new_status
        event.action = "status_updated"
        cargo.status = new_status

    await db.commit()
    await db.refresh(event)
    return event
