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
# Debounce window for the same (user, cargo) scan — prevents
# malicious/runaway clients from filling cargo_scan_events (SEC-H3).
_SCAN_DEBOUNCE_SECONDS = 8

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


async def _is_scan_debounced(cargo_id: UUID, user_id: UUID | None) -> bool:
    """Return True if the same (user, cargo) scanned within the debounce
    window. Fails open (returns False) if Redis is unavailable so the
    feature keeps working during Redis outages."""
    if user_id is None:
        return False
    try:
        from app.core.redis_client import get_redis
        redis = get_redis()
    except (RuntimeError, Exception):
        return False
    key = f"cargo_scan_debounce:{cargo_id}:{user_id}"
    try:
        # SETNX semantics: only the first setter wins within the window.
        was_set = await redis.set(key, "1", ex=_SCAN_DEBOUNCE_SECONDS, nx=True)
    except Exception:
        return False
    return not bool(was_set)  # debounced when we could NOT claim the lock


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

    Security notes:
      - ``scanned_at`` is clock-skew bounded to ``[now − 24h, now + 5min]``
        so a malicious client can't backdate or forward-date events to
        pollute the scan-history ordering (SEC-H2).
      - Per-(user, cargo) debounce of ``_SCAN_DEBOUNCE_SECONDS`` so a
        runaway client can't fill cargo_scan_events (SEC-H3). Raises
        HTTP 429 when the debounce is hit.
    """
    # Short-circuit if this same (user, cargo) scanned seconds ago.
    if await _is_scan_debounced(cargo.id, user.id if user else None):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=429,
            detail={
                "code": "SCAN_DEBOUNCED",
                "message": f"Scan ignoré : patientez {_SCAN_DEBOUNCE_SECONDS}s entre deux scans du même colis.",
            },
            headers={"Retry-After": str(_SCAN_DEBOUNCE_SECONDS)},
        )

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

    # Clamp client-supplied timestamp to [now-24h, now+5min] to prevent
    # audit-trail pollution via clock-skew / forward-dated scans.
    now = datetime.now(UTC)
    if scanned_at is None:
        effective_scanned_at = now
    else:
        # scanned_at may be naive if the client omitted timezone; treat as UTC.
        ts = scanned_at if scanned_at.tzinfo else scanned_at.replace(tzinfo=UTC)
        from datetime import timedelta as _td
        lower = now - _td(hours=24)
        upper = now + _td(minutes=5)
        if ts < lower or ts > upper:
            effective_scanned_at = now
        else:
            effective_scanned_at = ts

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

    Security / integrity:
      - ``confirmed_asset_id`` is validated against ``ar_installations``
        with ``entity_id = cargo.entity_id`` (closes IDOR leak via
        scan-history returning foreign installation names — SEC-C2).
      - ``new_status`` is routed through ``update_packlog_cargo_status``
        which validates the transition against
        ``CARGO_FORWARD_TRANSITIONS`` / ``CARGO_RETURN_TRANSITIONS`` and
        writes to ``cargo_status_log`` — no more arbitrary string
        injections or workflow skips (SEC-C1).
      - Uses ``SELECT … FOR UPDATE`` on the scan event + refuses
        re-confirmation once the action has already been committed
        (SEC-H1 TOCTOU / idempotency).
    """
    from fastapi import HTTPException
    from app.services.modules.packlog_service import (
        update_packlog_cargo_status,
        normalize_packlog_status,
    )

    # Lock the event row so two parallel confirms serialize.
    row = await db.execute(
        select(CargoScanEvent).where(
            CargoScanEvent.id == scan_event_id,
            CargoScanEvent.cargo_item_id == cargo.id,
            CargoScanEvent.entity_id == cargo.entity_id,
        ).with_for_update()
    )
    event = row.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Scan event not found")

    # Idempotency — once status_updated fired, refuse re-apply.
    if event.action == "status_updated" and event.status_after is not None:
        raise HTTPException(
            status_code=409,
            detail="Scan event already confirmed with a status change",
        )

    # Validate confirmed_asset_id is reachable in this entity.
    if confirmed_asset_id is not None:
        from app.models.asset_registry import Installation
        inst_row = await db.execute(
            select(Installation.id).where(
                Installation.id == confirmed_asset_id,
                Installation.entity_id == cargo.entity_id,
                Installation.archived == False,  # noqa: E712
            ).limit(1)
        )
        if inst_row.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=404,
                detail="Installation not found in this entity",
            )
        event.confirmed_asset_id = confirmed_asset_id
        event.action = (
            "location_confirmed"
            if confirmed_asset_id == event.matched_asset_id
            else "location_corrected"
        )

    if note is not None:
        event.note = note

    # Route status change through the vetted lifecycle function.
    if new_status is not None:
        try:
            normalized = normalize_packlog_status(new_status)
        except Exception:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid cargo status: '{new_status}'",
            )
        if normalized != cargo.status:
            try:
                await update_packlog_cargo_status(
                    db,
                    cargo_item_id=cargo.id,
                    new_status=normalized,
                    entity_id=cargo.entity_id,
                    user_id=user.id,
                    location_asset_id=confirmed_asset_id or event.matched_asset_id,
                )
            except ValueError as exc:
                # Transition not allowed OR workflow pre-conditions not met.
                raise HTTPException(status_code=422, detail=str(exc))
            event.status_before = cargo.status  # updated in-session above
            event.status_after = normalized
            event.action = "status_updated"

    await db.commit()
    await db.refresh(event)
    return event
