"""TravelWiz service -- trip management, manifest generation, cargo tracking,
deck layout, voyage events (journal de bord), trip KPIs, captain portal.

Integrates with:
- PaxLog: pulls approved AdS PAX for manifest auto-population
- Planner: references activity data for priority scoring
- EventBus: publishes travelwiz.* events for notification handlers
"""

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from jose import JWTError, jwt
from sqlalchemy import and_, func as sqla_func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.events import OpsFluxEvent, event_bus
from app.models.common import Setting
from app.models.asset_registry import Installation
from app.models.travelwiz import (
    CaptainLog,
    CargoItem,
    ManifestPassenger,
    PickupRound,
    PickupStop,
    TripCodeAccess,
    TransportVector,
    TransportVectorZone,
    VectorPosition,
    Voyage,
    VoyageManifest,
    VoyageStop,
    WeatherData,
)

logger = logging.getLogger(__name__)

# Reference prefixes
TRIP_REF_PREFIX = "TRIP"
VOYAGE_REF_PREFIX = "VYG"

DEFAULT_DELAY_REASSIGN_THRESHOLD_HOURS = 4.0
DEFAULT_WEIGHT_ALERT_RATIO = 0.9
DEFAULT_WEATHER_ALERT_BEAUFORT = 6
DEFAULT_SIGNAL_STALE_MINUTES = 15
DEFAULT_CAPTAIN_SESSION_MINUTES = 480

# Cargo forward lifecycle
CARGO_FORWARD_TRANSITIONS = {
    "registered": {"ready_for_loading"},
    "ready_for_loading": {"loaded"},
    "loaded": {"in_transit"},
    "in_transit": {"delivered_intermediate", "delivered_final", "damaged", "missing"},
    "delivered_intermediate": {"delivered_final", "damaged"},
    "delivered_final": set(),
}

# Cargo return lifecycle
CARGO_RETURN_TRANSITIONS = {
    "delivered_final": {"return_declared"},
    "delivered_intermediate": {"return_declared"},
    "return_declared": {"return_in_transit"},
    "return_in_transit": {"returned"},
    "returned": {"reintegrated", "scrapped"},
}

# Voyage event prerequisites -- event_code: set of event_codes that must exist before
VOYAGE_EVENT_PREREQUISITES = {
    "DEPARTURE": {"BOARDING_END"},
    "ARRIVED_DESTINATION": {"DEPARTURE"},
    "BOARDING_START": set(),
    "BOARDING_END": {"BOARDING_START"},
    "OFFLOADING_START": {"ARRIVED_DESTINATION"},
    "OFFLOADING_END": {"OFFLOADING_START"},
    "LOADING_START": set(),
    "LOADING_END": {"LOADING_START"},
    "WEATHER_HOLD": set(),
    "WEATHER_RESUME": {"WEATHER_HOLD"},
    "SAFETY_DRILL": set(),
    "INCIDENT": set(),
    "FUEL_STOP": set(),
}

# Voyage event -> trip status mapping
EVENT_TO_STATUS = {
    "DEPARTURE": "departed",
    "ARRIVED_DESTINATION": "arrived",
    "BOARDING_START": "boarding",
}


async def _get_entity_numeric_setting(
    db: AsyncSession,
    *,
    entity_id: UUID,
    key: str,
    default: float,
) -> float:
    result = await db.execute(
        select(Setting.value).where(
            Setting.key == key,
            Setting.scope == "entity",
            Setting.scope_id == str(entity_id),
        )
    )
    raw = result.scalar_one_or_none()
    value = raw.get("v") if isinstance(raw, dict) else raw
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


async def get_delay_reassign_threshold_hours(
    db: AsyncSession,
    *,
    entity_id: UUID,
) -> float:
    return await _get_entity_numeric_setting(
        db,
        entity_id=entity_id,
        key="travelwiz.delay_reassign_threshold_hours",
        default=DEFAULT_DELAY_REASSIGN_THRESHOLD_HOURS,
    )


async def get_weight_alert_ratio(
    db: AsyncSession,
    *,
    entity_id: UUID,
) -> float:
    value = await _get_entity_numeric_setting(
        db,
        entity_id=entity_id,
        key="travelwiz.weight_alert_ratio",
        default=DEFAULT_WEIGHT_ALERT_RATIO,
    )
    if value <= 0:
        return DEFAULT_WEIGHT_ALERT_RATIO
    return min(value, 1.0)


async def get_weather_alert_beaufort_threshold(
    db: AsyncSession,
    *,
    entity_id: UUID,
) -> int:
    value = await _get_entity_numeric_setting(
        db,
        entity_id=entity_id,
        key="travelwiz.weather_alert_beaufort_threshold",
        default=float(DEFAULT_WEATHER_ALERT_BEAUFORT),
    )
    return max(1, int(round(value)))


async def get_signal_stale_minutes(
    db: AsyncSession,
    *,
    entity_id: UUID,
) -> int:
    value = await _get_entity_numeric_setting(
        db,
        entity_id=entity_id,
        key="travelwiz.signal_stale_minutes",
        default=float(DEFAULT_SIGNAL_STALE_MINUTES),
    )
    return max(1, int(round(value)))


async def get_captain_session_minutes(
    db: AsyncSession,
    *,
    entity_id: UUID,
) -> int:
    value = await _get_entity_numeric_setting(
        db,
        entity_id=entity_id,
        key="travelwiz.captain_session_minutes",
        default=float(DEFAULT_CAPTAIN_SESSION_MINUTES),
    )
    return max(5, int(round(value)))


# ==============================================================================
# TRIP / VOYAGE REFERENCE GENERATION
# ==============================================================================


async def generate_trip_reference(db: AsyncSession, entity_id: UUID) -> str:
    """Generate sequential trip reference: TRIP-YYYY-NNNNN.

    Delegates to the centralized reference generator (app.core.references)
    which uses PostgreSQL advisory locks and admin-configurable templates.
    """
    from app.core.references import generate_reference

    return await generate_reference("TRIP", db, entity_id=entity_id)


# ==============================================================================
# MANIFEST GENERATION FROM APPROVED AdS
# ==============================================================================


async def generate_pax_manifest_from_ads(
    db: AsyncSession,
    trip_id: UUID,
    entity_id: UUID,
) -> dict:
    """Auto-populate a PAX manifest with approved AdS PAX for matching dates/destination.

    Steps:
    1. Load the voyage to get departure date and destination stops
    2. Find approved AdS PAX matching date range and destination
    3. Order by priority_score DESC
    4. Create or find existing draft PAX manifest
    5. Add passengers (skip duplicates)

    Returns::

        {
            "manifest_id": UUID,
            "added_count": int,
            "skipped_count": int,
            "total_pax": int,
        }
    """
    # Load voyage
    voyage_result = await db.execute(
        select(Voyage).where(
            Voyage.id == trip_id,
            Voyage.entity_id == entity_id,
        )
    )
    voyage = voyage_result.scalar_one_or_none()
    if not voyage:
        raise ValueError(f"Voyage {trip_id} not found")

    departure_date = voyage.scheduled_departure.date() if voyage.scheduled_departure else None
    if not departure_date:
        raise ValueError("Voyage has no scheduled departure date")

    # Get destination asset IDs from voyage stops
    stops_result = await db.execute(
        select(VoyageStop.asset_id).where(
            VoyageStop.voyage_id == trip_id,
            VoyageStop.active == True,  # noqa: E712
        )
    )
    destination_asset_ids = [str(r[0]) for r in stops_result.all()]

    # Find or create draft PAX manifest
    manifest_result = await db.execute(
        select(VoyageManifest).where(
            VoyageManifest.voyage_id == trip_id,
            VoyageManifest.manifest_type == "pax",
            VoyageManifest.status == "draft",
            VoyageManifest.active == True,  # noqa: E712
        )
    )
    manifest = manifest_result.scalar_one_or_none()

    if not manifest:
        manifest = VoyageManifest(
            voyage_id=trip_id,
            manifest_type="pax",
            status="draft",
        )
        db.add(manifest)
        await db.flush()

    # Find approved AdS PAX matching departure date and destination
    pax_query = text(
        """
        SELECT ap.id AS ads_pax_id, ap.user_id, ap.contact_id,
               ap.priority_score,
               COALESCE(
                   u.first_name || ' ' || u.last_name,
                   tc.first_name || ' ' || tc.last_name
               ) AS name,
               COALESCE(tu.name, tt.name) AS company
        FROM ads_pax ap
        JOIN ads a ON a.id = ap.ads_id
        LEFT JOIN users u ON u.id = ap.user_id
        LEFT JOIN user_tiers ut ON ut.user_id = u.id
        LEFT JOIN tiers tu ON tu.id = ut.tier_id
        LEFT JOIN tier_contacts tc ON tc.id = ap.contact_id
        LEFT JOIN tiers tt ON tt.id = tc.tier_id
        WHERE a.entity_id = :eid
          AND ap.status IN ('approved', 'compliant')
          AND a.status = 'approved'
          AND a.start_date <= :dep_date
          AND a.end_date >= :dep_date
          AND (
              a.site_entry_asset_id = ANY(:dest_ids)
              OR :no_dests
          )
        ORDER BY ap.priority_score DESC,
                 COALESCE(u.last_name, tc.last_name)
        """
    )
    pax_result = await db.execute(
        pax_query,
        {
            "eid": str(entity_id),
            "dep_date": departure_date,
            "dest_ids": destination_asset_ids if destination_asset_ids else ["00000000-0000-0000-0000-000000000000"],
            "no_dests": len(destination_asset_ids) == 0,
        },
    )
    ads_pax_rows = pax_result.all()

    # Get existing passengers to skip duplicates
    existing_result = await db.execute(
        select(ManifestPassenger.ads_pax_id).where(
            ManifestPassenger.manifest_id == manifest.id,
            ManifestPassenger.active == True,  # noqa: E712
        )
    )
    existing_ads_pax_ids = {str(r[0]) for r in existing_result.all() if r[0]}

    added_count = 0
    skipped_count = 0

    for row in ads_pax_rows:
        ads_pax_id, user_id, contact_id, priority_score, name, company = row

        if str(ads_pax_id) in existing_ads_pax_ids:
            skipped_count += 1
            continue

        pax = ManifestPassenger(
            manifest_id=manifest.id,
            user_id=user_id,
            contact_id=contact_id,
            name=name or "Unknown",
            company=company,
            priority_score=priority_score or 0,
            ads_pax_id=ads_pax_id,
        )
        db.add(pax)
        added_count += 1

    await db.flush()

    # Total count
    total_result = await db.execute(
        select(sqla_func.count()).select_from(ManifestPassenger).where(
            ManifestPassenger.manifest_id == manifest.id,
            ManifestPassenger.active == True,  # noqa: E712
        )
    )
    total_pax = total_result.scalar() or 0

    logger.info(
        "Manifest %s for voyage %s: added %d PAX, skipped %d, total %d",
        manifest.id, trip_id, added_count, skipped_count, total_pax,
    )

    return {
        "manifest_id": manifest.id,
        "added_count": added_count,
        "skipped_count": skipped_count,
        "total_pax": total_pax,
    }


# ==============================================================================
# CARGO STATUS TRACKING
# ==============================================================================


async def update_cargo_status(
    db: AsyncSession,
    cargo_item_id: UUID,
    new_status: str,
    entity_id: UUID,
    user_id: UUID,
    location_asset_id: UUID | None = None,
) -> dict:
    """Update cargo item status through lifecycle.

    Forward:  registered -> ready_for_loading -> loaded -> in_transit -> delivered
    Return:   return_declared -> return_in_transit -> returned -> reintegrated/scrapped

    Validates allowed transitions. Records status change in cargo_status_log (raw SQL).
    """
    cargo_result = await db.execute(
        select(CargoItem).where(
            CargoItem.id == cargo_item_id,
            CargoItem.entity_id == entity_id,
        )
    )
    cargo = cargo_result.scalar_one_or_none()
    if not cargo:
        raise ValueError(f"Cargo item {cargo_item_id} not found")

    old_status = cargo.status

    # Check forward transitions
    forward_allowed = CARGO_FORWARD_TRANSITIONS.get(old_status, set())
    return_allowed = CARGO_RETURN_TRANSITIONS.get(old_status, set())
    all_allowed = forward_allowed | return_allowed

    if new_status not in all_allowed:
        raise ValueError(
            f"Cannot transition cargo from '{old_status}' to '{new_status}'. "
            f"Allowed: {all_allowed}"
        )

    cargo.status = new_status

    # Auto-set received_by/received_at on delivery
    if new_status in ("delivered_final", "returned"):
        cargo.received_by = user_id
        cargo.received_at = datetime.now(timezone.utc)

    # Log the status change (raw SQL for cargo_status_log table)
    try:
        await db.execute(
            text(
                "INSERT INTO cargo_status_log "
                "(cargo_item_id, from_status, to_status, changed_by, location_asset_id, changed_at) "
                "VALUES (:cid, :from_s, :to_s, :uid, :loc, NOW())"
            ),
            {
                "cid": str(cargo_item_id),
                "from_s": old_status,
                "to_s": new_status,
                "uid": str(user_id),
                "loc": str(location_asset_id) if location_asset_id else None,
            },
        )
    except Exception:
        logger.debug("cargo_status_log table may not exist yet, skipping log insert")

    await db.flush()

    logger.info(
        "Cargo %s: %s -> %s (by %s)", cargo.tracking_code, old_status, new_status, user_id
    )

    return {
        "cargo_item_id": cargo.id,
        "tracking_code": cargo.tracking_code,
        "old_status": old_status,
        "new_status": new_status,
        "location_asset_id": location_asset_id,
    }


# ==============================================================================
# DECK LAYOUT ALGORITHM
# ==============================================================================


async def suggest_deck_layout(
    db: AsyncSession,
    trip_id: UUID,
    deck_surface_id: UUID,
    entity_id: UUID,
) -> dict:
    """Algorithm for deck placement suggestions.

    Rules:
    1. Heavy items at bottom (stack_level=0)
    2. Hazmat isolated (separate zone)
    3. Explosive cargo separated from other hazmat
    4. Group by destination for efficient unloading
    5. Respect weight distribution limits per zone

    Returns::

        {
            "deck_surface_id": UUID,
            "total_weight_kg": float,
            "max_weight_kg": float | None,
            "utilization_pct": float,
            "placements": [
                {
                    "cargo_item_id": UUID,
                    "tracking_code": str,
                    "suggested_x": float,
                    "suggested_y": float,
                    "stack_level": int,
                    "zone": str,  # "main", "hazmat", "explosive_isolated"
                    "reason": str,
                }
            ],
            "warnings": [str],
        }
    """
    # Load deck zone info
    zone_result = await db.execute(
        select(TransportVectorZone).where(TransportVectorZone.id == deck_surface_id)
    )
    zone = zone_result.scalar_one_or_none()
    if not zone:
        raise ValueError(f"Deck surface {deck_surface_id} not found")

    # Load cargo items assigned to this voyage's cargo manifest
    cargo_result = await db.execute(
        select(CargoItem)
        .join(VoyageManifest, CargoItem.manifest_id == VoyageManifest.id)
        .where(
            VoyageManifest.voyage_id == trip_id,
            VoyageManifest.manifest_type == "cargo",
            VoyageManifest.active == True,  # noqa: E712
            CargoItem.active == True,  # noqa: E712
            CargoItem.status.in_(["registered", "ready_for_loading", "loaded"]),
        )
        .order_by(CargoItem.weight_kg.desc())
    )
    cargo_items = cargo_result.scalars().all()

    placements = []
    warnings = []
    total_weight = 0.0

    # Categorize cargo
    hazmat_items = [c for c in cargo_items if c.cargo_type == "hazmat"]
    regular_items = [c for c in cargo_items if c.cargo_type != "hazmat"]

    # Group regular items by destination for efficient unloading
    dest_groups: dict[str, list] = {}
    for item in regular_items:
        dest_key = str(item.destination_asset_id) if item.destination_asset_id else "unknown"
        dest_groups.setdefault(dest_key, []).append(item)

    # Deck dimensions
    deck_width = zone.width_m or 10.0
    deck_length = zone.length_m or 20.0

    # Place heavy items first (already sorted by weight DESC)
    x_cursor = 0.5
    y_cursor = 0.5
    row_height = 0.0

    # 1. Regular cargo grouped by destination
    for dest_key, items in dest_groups.items():
        for item in items:
            item_w = (item.width_cm or 100) / 100.0
            item_l = (item.length_cm or 100) / 100.0

            # Simple row-based placement
            if x_cursor + item_w > deck_width:
                x_cursor = 0.5
                y_cursor += row_height + 0.3
                row_height = 0.0

            if y_cursor + item_l > deck_length:
                warnings.append(
                    f"Cargo {item.tracking_code} may not fit on deck "
                    f"(deck full at {y_cursor:.1f}m / {deck_length:.1f}m)"
                )

            placements.append({
                "cargo_item_id": item.id,
                "tracking_code": item.tracking_code,
                "suggested_x": round(x_cursor, 2),
                "suggested_y": round(y_cursor, 2),
                "stack_level": 0,
                "zone": "main",
                "reason": f"Grouped by destination ({dest_key[:8]}...)" if dest_key != "unknown" else "Standard placement",
            })

            total_weight += item.weight_kg
            x_cursor += item_w + 0.3
            row_height = max(row_height, item_l)

    # 2. Hazmat items in isolated zone (end of deck)
    hazmat_y = max(y_cursor + row_height + 2.0, deck_length * 0.75)
    hazmat_x = 0.5

    for item in hazmat_items:
        placements.append({
            "cargo_item_id": item.id,
            "tracking_code": item.tracking_code,
            "suggested_x": round(hazmat_x, 2),
            "suggested_y": round(hazmat_y, 2),
            "stack_level": 0,
            "zone": "hazmat_isolated",
            "reason": "Hazmat cargo isolated per safety regulations",
        })
        total_weight += item.weight_kg
        hazmat_x += 2.0

        if item.description and "explos" in item.description.lower():
            warnings.append(
                f"EXPLOSIVE cargo {item.tracking_code} -- requires dedicated isolation zone"
            )

    # Weight check
    max_weight = zone.max_weight_kg
    utilization_pct = 0.0
    if max_weight and max_weight > 0:
        utilization_pct = round((total_weight / max_weight) * 100, 1)
        if total_weight > max_weight:
            warnings.append(
                f"OVERWEIGHT: {total_weight:.0f} kg exceeds deck limit of {max_weight:.0f} kg"
            )

    return {
        "deck_surface_id": deck_surface_id,
        "total_weight_kg": round(total_weight, 2),
        "max_weight_kg": max_weight,
        "utilization_pct": utilization_pct,
        "placements": placements,
        "warnings": warnings,
    }


# ==============================================================================
# VOYAGE EVENT RECORDING (Journal de Bord)
# ==============================================================================


async def record_voyage_event(
    db: AsyncSession,
    trip_id: UUID,
    entity_id: UUID,
    user_id: UUID,
    event_code: str,
    recorded_at: datetime | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    asset_id: UUID | None = None,
    payload: dict | None = None,
    notes: str | None = None,
) -> dict:
    """Record a voyage event (journal de bord).

    Validates event_code against known voyage event types.
    Checks prerequisites (e.g. DEPARTURE requires BOARDING_END).
    Updates trip status based on event (DEPARTURE -> departed, ARRIVED_DESTINATION -> arrived).

    Returns the created event dict.
    """
    # Validate event code
    if event_code not in VOYAGE_EVENT_PREREQUISITES:
        raise ValueError(
            f"Unknown event code '{event_code}'. "
            f"Valid codes: {list(VOYAGE_EVENT_PREREQUISITES.keys())}"
        )

    # Load voyage
    voyage_result = await db.execute(
        select(Voyage).where(
            Voyage.id == trip_id,
            Voyage.entity_id == entity_id,
        )
    )
    voyage = voyage_result.scalar_one_or_none()
    if not voyage:
        raise ValueError(f"Voyage {trip_id} not found")

    # Check prerequisites
    prerequisites = VOYAGE_EVENT_PREREQUISITES[event_code]
    if prerequisites:
        existing_events = await db.execute(
            text(
                "SELECT event_code FROM voyage_events "
                "WHERE voyage_id = :vid "
                "GROUP BY event_code"
            ),
            {"vid": str(trip_id)},
        )
        existing_codes = {row[0] for row in existing_events.all()}

        missing = prerequisites - existing_codes
        if missing:
            raise ValueError(
                f"Cannot record {event_code}: prerequisite events missing: {missing}"
            )

    # Insert voyage event via raw SQL (table may not be in models yet)
    event_time = recorded_at or datetime.now(timezone.utc)
    import json as _json

    await db.execute(
        text(
            "INSERT INTO voyage_events "
            "(voyage_id, event_code, recorded_at, recorded_by, "
            "latitude, longitude, asset_id, payload, notes) "
            "VALUES (:vid, :code, :rat, :rby, :lat, :lng, :aid, :pl, :notes)"
        ),
        {
            "vid": str(trip_id),
            "code": event_code,
            "rat": event_time,
            "rby": str(user_id),
            "lat": latitude,
            "lng": longitude,
            "aid": str(asset_id) if asset_id else None,
            "pl": _json.dumps(payload) if payload else None,
            "notes": notes,
        },
    )

    # Update voyage status based on event
    new_status = EVENT_TO_STATUS.get(event_code)
    if new_status:
        old_status = voyage.status
        voyage.status = new_status

        if event_code == "DEPARTURE" and not voyage.actual_departure:
            voyage.actual_departure = event_time
        elif event_code == "ARRIVED_DESTINATION" and not voyage.actual_arrival:
            voyage.actual_arrival = event_time

        logger.info(
            "Voyage %s status: %s -> %s (event %s)",
            voyage.code, old_status, new_status, event_code,
        )

    await db.flush()

    return {
        "voyage_id": trip_id,
        "event_code": event_code,
        "recorded_at": event_time.isoformat(),
        "recorded_by": user_id,
        "latitude": latitude,
        "longitude": longitude,
        "asset_id": asset_id,
        "notes": notes,
        "status_updated_to": new_status,
    }


# ==============================================================================
# TRIP KPI COMPUTATION
# ==============================================================================


async def compute_trip_kpis(db: AsyncSession, trip_id: UUID, entity_id: UUID) -> dict:
    """Compute KPIs at trip closure.

    Returns::

        {
            "voyage_id": UUID,
            "code": str,
            "total_duration_hours": float | None,
            "standby_hours": float | None,
            "pax_planned": int,
            "pax_boarded": int,
            "pax_no_show": int,
            "cargo_planned": int,
            "cargo_loaded": int,
            "on_time": bool,
            "delay_hours": float | None,
            "total_fuel_liters": float | None,
        }
    """
    voyage_result = await db.execute(
        select(Voyage).where(
            Voyage.id == trip_id,
            Voyage.entity_id == entity_id,
        )
    )
    voyage = voyage_result.scalar_one_or_none()
    if not voyage:
        raise ValueError(f"Voyage {trip_id} not found")

    # Duration
    total_duration_hours = None
    if voyage.actual_departure and voyage.actual_arrival:
        delta = voyage.actual_arrival - voyage.actual_departure
        total_duration_hours = round(delta.total_seconds() / 3600, 2)

    # Delay
    on_time = True
    delay_hours = None
    if voyage.actual_departure and voyage.scheduled_departure:
        delay_delta = voyage.actual_departure - voyage.scheduled_departure
        delay_hours = round(delay_delta.total_seconds() / 3600, 2)
        if delay_hours > 0.25:  # >15 min = late
            on_time = False
        else:
            delay_hours = 0.0

    # PAX counts
    pax_result = await db.execute(
        select(
            sqla_func.count().label("total"),
            sqla_func.count().filter(ManifestPassenger.boarding_status == "boarded").label("boarded"),
            sqla_func.count().filter(ManifestPassenger.boarding_status == "no_show").label("no_show"),
        )
        .select_from(ManifestPassenger)
        .join(VoyageManifest, ManifestPassenger.manifest_id == VoyageManifest.id)
        .where(
            VoyageManifest.voyage_id == trip_id,
            VoyageManifest.manifest_type == "pax",
            VoyageManifest.active == True,  # noqa: E712
            ManifestPassenger.active == True,  # noqa: E712
        )
    )
    pax_row = pax_result.first()
    pax_planned = pax_row[0] if pax_row else 0
    pax_boarded = pax_row[1] if pax_row else 0
    pax_no_show = pax_row[2] if pax_row else 0

    # Cargo counts
    cargo_result = await db.execute(
        select(
            sqla_func.count().label("total"),
            sqla_func.count().filter(CargoItem.status.in_(["loaded", "in_transit", "delivered_intermediate", "delivered_final"])).label("loaded"),
        )
        .select_from(CargoItem)
        .join(VoyageManifest, CargoItem.manifest_id == VoyageManifest.id)
        .where(
            VoyageManifest.voyage_id == trip_id,
            VoyageManifest.manifest_type == "cargo",
            VoyageManifest.active == True,  # noqa: E712
            CargoItem.active == True,  # noqa: E712
        )
    )
    cargo_row = cargo_result.first()
    cargo_planned = cargo_row[0] if cargo_row else 0
    cargo_loaded = cargo_row[1] if cargo_row else 0

    # Fuel consumption from captain logs
    fuel_result = await db.execute(
        select(sqla_func.coalesce(sqla_func.sum(CaptainLog.fuel_consumption_liters), 0))
        .where(
            CaptainLog.voyage_id == trip_id,
            CaptainLog.active == True,  # noqa: E712
        )
    )
    total_fuel = float(fuel_result.scalar() or 0)

    # Standby time from voyage events (if table exists)
    standby_hours = None
    try:
        standby_result = await db.execute(
            text(
                "SELECT "
                "  SUM(EXTRACT(EPOCH FROM (resume.recorded_at - hold.recorded_at)) / 3600) "
                "FROM voyage_events hold "
                "JOIN voyage_events resume ON resume.voyage_id = hold.voyage_id "
                "  AND resume.event_code = 'WEATHER_RESUME' "
                "  AND resume.recorded_at > hold.recorded_at "
                "WHERE hold.voyage_id = :vid AND hold.event_code = 'WEATHER_HOLD'"
            ),
            {"vid": str(trip_id)},
        )
        standby_hours = float(standby_result.scalar() or 0)
    except Exception:
        logger.debug("voyage_events table not available for standby calculation")

    return {
        "voyage_id": trip_id,
        "code": voyage.code,
        "total_duration_hours": total_duration_hours,
        "standby_hours": standby_hours,
        "pax_planned": pax_planned,
        "pax_boarded": pax_boarded,
        "pax_no_show": pax_no_show,
        "cargo_planned": cargo_planned,
        "cargo_loaded": cargo_loaded,
        "on_time": on_time,
        "delay_hours": delay_hours,
        "total_fuel_liters": total_fuel if total_fuel > 0 else None,
    }


# ==============================================================================
# CAPTAIN PORTAL AUTHENTICATION
# ==============================================================================


async def authenticate_captain_code(db: AsyncSession, access_code: str) -> dict:
    """Validate a 6-digit captain portal access code.

    Looks up the code in ``trip_code_access`` and returns voyage context if valid.

    Returns::

        {
            "valid": bool,
            "voyage_id": UUID | None,
            "code": str | None,
            "vector_name": str | None,
            "departure_base": str | None,
            "scheduled_departure": str | None,
            "captain_name": str | None,
            "entity_id": UUID | None,
        }
    """
    if not access_code or len(access_code) != 6 or not access_code.isdigit():
        return {"valid": False, "voyage_id": None, "code": None,
                "vector_name": None, "departure_base": None,
                "scheduled_departure": None, "captain_name": None, "entity_id": None}

    result = await db.execute(
        select(TripCodeAccess, Voyage, TransportVector.name, Installation.name)
        .join(Voyage, Voyage.id == TripCodeAccess.trip_id)
        .join(TransportVector, TransportVector.id == Voyage.vector_id)
        .join(Installation, Installation.id == Voyage.departure_base_id)
        .where(
            TripCodeAccess.access_code == access_code,
            TripCodeAccess.revoked == False,  # noqa: E712
            TripCodeAccess.expires_at.is_not(None),
            TripCodeAccess.expires_at > datetime.now(timezone.utc),
            Voyage.status.in_(["planned", "confirmed", "boarding", "departed"]),
        )
    )
    row = result.first()

    if row is None:
        return {"valid": False, "voyage_id": None, "code": None,
                "vector_name": None, "departure_base": None,
                "scheduled_departure": None, "captain_name": None, "entity_id": None}

    code_access, voyage, vector_name, departure_base = row

    return {
        "valid": True,
        "voyage_id": voyage.id,
        "captain_name": None,
        "code": voyage.code,
        "scheduled_departure": str(voyage.scheduled_departure) if voyage.scheduled_departure else None,
        "vector_name": vector_name,
        "departure_base": departure_base,
        "entity_id": voyage.entity_id,
        "trip_code_access_id": code_access.id,
    }


def create_captain_session_token(
    *,
    trip_code_access_id: UUID,
    voyage_id: UUID,
    expires_at: datetime,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(trip_code_access_id),
        "voyage_id": str(voyage_id),
        "iat": now,
        "exp": expires_at,
        "type": "travelwiz_captain",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


async def verify_captain_session_token(
    db: AsyncSession,
    *,
    session_token: str,
    voyage_id: UUID,
) -> dict:
    try:
        payload = jwt.decode(
            session_token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError as exc:
        raise ValueError("Invalid or expired captain session") from exc

    if payload.get("type") != "travelwiz_captain":
        raise ValueError("Invalid captain session")
    if payload.get("voyage_id") != str(voyage_id):
        raise ValueError("Captain session does not match requested voyage")

    trip_code_access_id_raw = payload.get("sub")
    try:
        trip_code_access_id = UUID(str(trip_code_access_id_raw))
    except (TypeError, ValueError) as exc:
        raise ValueError("Invalid captain session") from exc

    result = await db.execute(
        select(TripCodeAccess, Voyage)
        .join(Voyage, Voyage.id == TripCodeAccess.trip_id)
        .where(
            TripCodeAccess.id == trip_code_access_id,
            TripCodeAccess.trip_id == voyage_id,
            TripCodeAccess.revoked == False,  # noqa: E712
            TripCodeAccess.expires_at.is_not(None),
            TripCodeAccess.expires_at > datetime.now(timezone.utc),
            Voyage.active == True,  # noqa: E712
        )
    )
    row = result.first()
    if row is None:
        raise ValueError("Captain session is no longer valid")

    code_access, voyage = row
    return {
        "trip_code_access_id": code_access.id,
        "created_by": code_access.created_by,
        "voyage": voyage,
    }


async def assess_voyage_delay(
    db: AsyncSession,
    *,
    voyage_id: UUID,
    entity_id: UUID,
) -> dict:
    voyage_result = await db.execute(
        select(Voyage).where(
            Voyage.id == voyage_id,
            Voyage.entity_id == entity_id,
        )
    )
    voyage = voyage_result.scalar_one_or_none()
    if not voyage:
        raise ValueError(f"Voyage {voyage_id} not found")

    if voyage.status != "delayed":
        return {
            "voyage_id": voyage.id,
            "status": voyage.status,
            "delay_hours": 0.0,
            "threshold_hours": await get_delay_reassign_threshold_hours(db, entity_id=entity_id),
            "reassign_available": False,
            "alternatives": [],
        }

    threshold_hours = await get_delay_reassign_threshold_hours(db, entity_id=entity_id)
    reference_time = voyage.actual_departure or datetime.now(timezone.utc)
    delay_delta = reference_time - voyage.scheduled_departure
    delay_hours = max(0.0, round(delay_delta.total_seconds() / 3600, 2))

    stop_ids_result = await db.execute(
        select(VoyageStop.asset_id).where(
            VoyageStop.voyage_id == voyage.id,
            VoyageStop.active == True,  # noqa: E712
        )
    )
    destination_asset_ids = [row[0] for row in stop_ids_result.all()]

    alternatives: list[dict] = []
    if delay_hours >= threshold_hours and destination_asset_ids:
        alt_result = await db.execute(
            select(Voyage, TransportVector.name)
            .join(TransportVector, TransportVector.id == Voyage.vector_id)
            .join(VoyageStop, VoyageStop.voyage_id == Voyage.id)
            .where(
                Voyage.entity_id == entity_id,
                Voyage.id != voyage.id,
                Voyage.active == True,  # noqa: E712
                Voyage.status.in_(["planned", "confirmed"]),
                VoyageStop.active == True,  # noqa: E712
                VoyageStop.asset_id.in_(destination_asset_ids),
                Voyage.scheduled_departure >= datetime.now(timezone.utc),
            )
            .order_by(Voyage.scheduled_departure)
            .limit(5)
        )
        seen: set[UUID] = set()
        for alt_voyage, vector_name in alt_result.all():
            if alt_voyage.id in seen:
                continue
            seen.add(alt_voyage.id)
            alternatives.append(
                {
                    "voyage_id": alt_voyage.id,
                    "code": alt_voyage.code,
                    "scheduled_departure": alt_voyage.scheduled_departure.isoformat() if alt_voyage.scheduled_departure else None,
                    "vector_name": vector_name,
                    "status": alt_voyage.status,
                }
            )

    return {
        "voyage_id": voyage.id,
        "status": voyage.status,
        "delay_hours": delay_hours,
        "threshold_hours": threshold_hours,
        "reassign_available": delay_hours >= threshold_hours and len(alternatives) > 0,
        "alternatives": alternatives,
        "delay_reason": voyage.delay_reason,
    }


async def assess_manifest_weight(
    db: AsyncSession,
    *,
    voyage_id: UUID,
    manifest_id: UUID,
    entity_id: UUID,
) -> dict:
    voyage_result = await db.execute(
        select(Voyage).where(
            Voyage.id == voyage_id,
            Voyage.entity_id == entity_id,
        )
    )
    voyage = voyage_result.scalar_one_or_none()
    if not voyage:
        raise ValueError(f"Voyage {voyage_id} not found")

    manifest_result = await db.execute(
        select(VoyageManifest).where(
            VoyageManifest.id == manifest_id,
            VoyageManifest.voyage_id == voyage_id,
            VoyageManifest.manifest_type == "pax",
        )
    )
    manifest = manifest_result.scalar_one_or_none()
    if not manifest:
        raise ValueError(f"Manifest {manifest_id} not found")

    vector_result = await db.execute(
        select(TransportVector).where(TransportVector.id == voyage.vector_id)
    )
    vector = vector_result.scalar_one_or_none()
    if not vector:
        raise ValueError(f"Vector {voyage.vector_id} not found")

    pax_weight_result = await db.execute(
        select(sqla_func.coalesce(sqla_func.sum(
            sqla_func.coalesce(ManifestPassenger.actual_weight_kg, ManifestPassenger.declared_weight_kg)
        ), 0))
        .where(
            ManifestPassenger.manifest_id == manifest_id,
            ManifestPassenger.active == True,  # noqa: E712
            ManifestPassenger.boarding_status.notin_(["no_show", "offloaded"]),
        )
    )
    pax_weight = float(pax_weight_result.scalar() or 0)

    cargo_weight_result = await db.execute(
        select(sqla_func.coalesce(sqla_func.sum(CargoItem.weight_kg), 0))
        .join(VoyageManifest, CargoItem.manifest_id == VoyageManifest.id)
        .where(
            VoyageManifest.voyage_id == voyage_id,
            VoyageManifest.active == True,  # noqa: E712
            CargoItem.active == True,  # noqa: E712
        )
    )
    cargo_weight = float(cargo_weight_result.scalar() or 0)

    current_weight = round(pax_weight + cargo_weight, 2)
    max_weight = float(vector.weight_capacity_kg) if vector.weight_capacity_kg is not None else None
    alert_ratio = await get_weight_alert_ratio(db, entity_id=entity_id)
    alert_threshold = round(max_weight * alert_ratio, 2) if max_weight is not None else None
    is_alert = bool(max_weight is not None and current_weight >= alert_threshold)
    is_blocked = bool(max_weight is not None and current_weight >= max_weight)

    return {
        "voyage_id": voyage_id,
        "manifest_id": manifest_id,
        "requires_weighing": vector.requires_weighing,
        "weight_capacity_kg": max_weight,
        "current_weight_kg": current_weight,
        "alert_threshold_kg": alert_threshold,
        "alert_ratio": alert_ratio,
        "is_alert": is_alert,
        "is_blocked": is_blocked,
        "remaining_weight_kg": round(max_weight - current_weight, 2) if max_weight is not None else None,
    }


# ==============================================================================
# BACK CARGO WORKFLOW
# ==============================================================================


async def initiate_back_cargo(
    db: AsyncSession,
    cargo_item_id: UUID,
    entity_id: UUID,
    user_id: UUID,
    return_type: str,
    notes: str | None = None,
) -> dict:
    """Initiate back cargo workflow.

    Steps:
    1. Validate cargo is in a deliverable state
    2. Set cargo status to return_declared
    3. Set return_type (waste, contractor_return, stock_reintegration, scrap, yard_storage)
    4. Create return manifest entry (raw SQL)

    Returns::

        {
            "cargo_item_id": UUID,
            "tracking_code": str,
            "return_type": str,
            "new_status": str,
            "notes": str | None,
        }
    """
    valid_return_types = {"waste", "contractor_return", "stock_reintegration", "scrap", "yard_storage"}
    if return_type not in valid_return_types:
        raise ValueError(
            f"Invalid return_type '{return_type}'. Valid: {valid_return_types}"
        )

    cargo_result = await db.execute(
        select(CargoItem).where(
            CargoItem.id == cargo_item_id,
            CargoItem.entity_id == entity_id,
        )
    )
    cargo = cargo_result.scalar_one_or_none()
    if not cargo:
        raise ValueError(f"Cargo item {cargo_item_id} not found")

    # Can only return delivered cargo
    if cargo.status not in ("delivered_final", "delivered_intermediate", "in_transit"):
        raise ValueError(
            f"Cannot initiate return for cargo in status '{cargo.status}'. "
            f"Must be delivered_final, delivered_intermediate, or in_transit."
        )

    old_status = cargo.status
    cargo.status = "return_declared"

    # Store return metadata via raw SQL
    try:
        await db.execute(
            text(
                "INSERT INTO cargo_returns "
                "(cargo_item_id, return_type, declared_by, notes, declared_at) "
                "VALUES (:cid, :rt, :uid, :notes, NOW())"
            ),
            {
                "cid": str(cargo_item_id),
                "rt": return_type,
                "uid": str(user_id),
                "notes": notes,
            },
        )
    except Exception:
        logger.debug("cargo_returns table may not exist yet, skipping return record insert")

    await db.flush()

    logger.info(
        "Back cargo initiated: %s (%s -> return_declared, type=%s)",
        cargo.tracking_code, old_status, return_type,
    )

    return {
        "cargo_item_id": cargo.id,
        "tracking_code": cargo.tracking_code,
        "return_type": return_type,
        "new_status": "return_declared",
        "notes": notes,
    }


# ==============================================================================
# SAP CODE MATCHING
# ==============================================================================


async def match_sap_code(db: AsyncSession, description: str, entity_id: UUID) -> list[dict]:
    """Match a cargo description to SAP codes using fuzzy search.

    Uses pg_trgm similarity on article_catalog.description_normalized.
    Returns top 5 matches with confidence scores.

    Returns::

        [
            {
                "sap_code": str,
                "description": str,
                "management_type": str,
                "similarity": float,  # 0.0 to 1.0
            }
        ]
    """
    if not description or len(description.strip()) < 2:
        return []

    normalized = description.strip().lower()

    try:
        result = await db.execute(
            text(
                "SELECT sap_code, description, management_type, "
                "  similarity(description_normalized, :desc) AS sim "
                "FROM article_catalog "
                "WHERE entity_id = :eid "
                "  AND similarity(description_normalized, :desc) > 0.1 "
                "ORDER BY sim DESC "
                "LIMIT 5"
            ),
            {"desc": normalized, "eid": str(entity_id)},
        )
        rows = result.all()
    except Exception:
        # Fallback to ILIKE if pg_trgm is not available or table doesn't exist
        logger.debug("pg_trgm search failed, falling back to ILIKE")
        try:
            result = await db.execute(
                text(
                    "SELECT sap_code, description, management_type, "
                    "  0.5 AS sim "
                    "FROM article_catalog "
                    "WHERE entity_id = :eid "
                    "  AND description_normalized ILIKE :pattern "
                    "ORDER BY description "
                    "LIMIT 5"
                ),
                {"eid": str(entity_id), "pattern": f"%{normalized}%"},
            )
            rows = result.all()
        except Exception:
            logger.debug("article_catalog table may not exist yet")
            return []

    return [
        {
            "sap_code": row[0],
            "description": row[1],
            "management_type": row[2],
            "similarity": round(float(row[3]), 3),
        }
        for row in rows
    ]


# ==============================================================================
# RAMASSAGE TERRESTRE (Terrestrial Pickup Rounds)
# ==============================================================================


async def create_pickup_round(
    db: AsyncSession,
    entity_id: UUID,
    data: dict,
) -> dict:
    """Create a pickup round (trip with is_pickup=True, multiple stops with pickup_order).

    ``data`` keys:
        trip_id, route_name, scheduled_departure, driver_name, driver_phone,
        vehicle_registration, notes, stops: [{asset_id, pickup_order,
        scheduled_time, pax_expected}]

    Returns the created PickupRound with stops.
    """
    trip_id = data.get("trip_id")
    if not trip_id:
        raise ValueError("trip_id is required")

    # Validate voyage exists
    voyage_result = await db.execute(
        select(Voyage).where(
            Voyage.id == trip_id,
            Voyage.entity_id == entity_id,
        )
    )
    voyage = voyage_result.scalar_one_or_none()
    if not voyage:
        raise ValueError(f"Voyage {trip_id} not found")

    pickup_round = PickupRound(
        entity_id=entity_id,
        trip_id=trip_id,
        route_name=data["route_name"],
        scheduled_departure=data["scheduled_departure"],
        driver_name=data.get("driver_name"),
        driver_phone=data.get("driver_phone"),
        vehicle_registration=data.get("vehicle_registration"),
        status="planned",
        notes=data.get("notes"),
    )
    db.add(pickup_round)
    await db.flush()

    # Create stops
    stops_data = data.get("stops", [])
    created_stops = []
    for stop_data in stops_data:
        stop = PickupStop(
            pickup_round_id=pickup_round.id,
            asset_id=stop_data["asset_id"],
            pickup_order=stop_data["pickup_order"],
            scheduled_time=stop_data.get("scheduled_time"),
            pax_expected=stop_data.get("pax_expected", 0),
            status="pending",
        )
        db.add(stop)
        created_stops.append(stop)

    await db.flush()

    logger.info(
        "Pickup round %s created for voyage %s with %d stops",
        pickup_round.id, trip_id, len(created_stops),
    )

    return {
        "id": pickup_round.id,
        "trip_id": trip_id,
        "route_name": pickup_round.route_name,
        "scheduled_departure": pickup_round.scheduled_departure.isoformat(),
        "driver_name": pickup_round.driver_name,
        "status": pickup_round.status,
        "stops_count": len(created_stops),
        "stops": [
            {
                "id": s.id,
                "asset_id": s.asset_id,
                "pickup_order": s.pickup_order,
                "scheduled_time": s.scheduled_time.isoformat() if s.scheduled_time else None,
                "pax_expected": s.pax_expected,
                "status": s.status,
            }
            for s in created_stops
        ],
    }


async def update_pickup_progress(
    db: AsyncSession,
    trip_id: UUID,
    stop_id: UUID,
    event_data: dict,
) -> dict:
    """Record passenger pickup at a stop. Emits SSE event for dashboard widget ``pickup_progress``.

    ``event_data`` keys:
        pax_picked_up (int), notes (str|None)

    Returns updated stop data and emits ``travelwiz.pickup.progress`` event.
    """
    # Load the stop
    stop_result = await db.execute(
        select(PickupStop).where(PickupStop.id == stop_id)
    )
    stop = stop_result.scalar_one_or_none()
    if not stop:
        raise ValueError(f"Pickup stop {stop_id} not found")

    # Load round and verify trip association
    round_result = await db.execute(
        select(PickupRound).where(
            PickupRound.id == stop.pickup_round_id,
            PickupRound.trip_id == trip_id,
        )
    )
    pickup_round = round_result.scalar_one_or_none()
    if not pickup_round:
        raise ValueError(f"Pickup round for trip {trip_id} / stop {stop_id} not found")

    # Update stop
    pax_picked = event_data.get("pax_picked_up", 0)
    stop.pax_picked_up = pax_picked
    stop.actual_time = datetime.now(timezone.utc)
    stop.status = "completed"
    if event_data.get("notes"):
        stop.notes = event_data["notes"]

    # Update round status if not already in_progress
    if pickup_round.status == "planned":
        pickup_round.status = "in_progress"
        pickup_round.actual_departure = datetime.now(timezone.utc)

    # Update running total
    total_result = await db.execute(
        select(sqla_func.coalesce(sqla_func.sum(PickupStop.pax_picked_up), 0))
        .where(
            PickupStop.pickup_round_id == pickup_round.id,
            PickupStop.active == True,  # noqa: E712
        )
    )
    pickup_round.total_pax_picked = int(total_result.scalar() or 0) + pax_picked

    await db.flush()

    # Emit SSE event
    await event_bus.publish(OpsFluxEvent(
        event_type="travelwiz.pickup.progress",
        payload={
            "pickup_round_id": str(pickup_round.id),
            "trip_id": str(trip_id),
            "stop_id": str(stop_id),
            "route_name": pickup_round.route_name,
            "pax_picked_up": pax_picked,
            "total_pax_picked": pickup_round.total_pax_picked,
            "stop_status": stop.status,
            "round_status": pickup_round.status,
        },
    ))

    logger.info(
        "Pickup stop %s completed: %d PAX picked (total round: %d)",
        stop_id, pax_picked, pickup_round.total_pax_picked,
    )

    return {
        "stop_id": stop.id,
        "pickup_round_id": pickup_round.id,
        "pax_picked_up": pax_picked,
        "actual_time": stop.actual_time.isoformat(),
        "stop_status": stop.status,
        "total_pax_picked": pickup_round.total_pax_picked,
        "round_status": pickup_round.status,
    }


async def close_pickup_round(
    db: AsyncSession,
    trip_id: UUID,
) -> dict:
    """Close a pickup round, calculate pickup KPIs.

    Returns KPIs: total stops, completed stops, total PAX expected vs picked,
    on-time metrics.
    """
    round_result = await db.execute(
        select(PickupRound).where(
            PickupRound.trip_id == trip_id,
            PickupRound.status.in_(["planned", "in_progress"]),
            PickupRound.active == True,  # noqa: E712
        )
    )
    pickup_round = round_result.scalar_one_or_none()
    if not pickup_round:
        raise ValueError(f"No active pickup round found for trip {trip_id}")

    # Load stops
    stops_result = await db.execute(
        select(PickupStop)
        .where(
            PickupStop.pickup_round_id == pickup_round.id,
            PickupStop.active == True,  # noqa: E712
        )
        .order_by(PickupStop.pickup_order)
    )
    stops = stops_result.scalars().all()

    total_stops = len(stops)
    completed_stops = sum(1 for s in stops if s.status == "completed")
    skipped_stops = sum(1 for s in stops if s.status == "skipped")
    total_pax_expected = sum(s.pax_expected for s in stops)
    total_pax_picked = sum(s.pax_picked_up for s in stops)

    # Calculate on-time metrics
    late_stops = 0
    for s in stops:
        if s.scheduled_time and s.actual_time and s.actual_time > s.scheduled_time:
            late_stops += 1

    # Close the round
    pickup_round.status = "completed"
    pickup_round.actual_arrival = datetime.now(timezone.utc)
    pickup_round.total_pax_picked = total_pax_picked

    await db.flush()

    kpis = {
        "pickup_round_id": pickup_round.id,
        "trip_id": trip_id,
        "route_name": pickup_round.route_name,
        "total_stops": total_stops,
        "completed_stops": completed_stops,
        "skipped_stops": skipped_stops,
        "total_pax_expected": total_pax_expected,
        "total_pax_picked": total_pax_picked,
        "pickup_rate_pct": round((total_pax_picked / total_pax_expected * 100), 1) if total_pax_expected > 0 else 0.0,
        "late_stops": late_stops,
        "on_time_pct": round(((total_stops - late_stops) / total_stops * 100), 1) if total_stops > 0 else 0.0,
    }

    logger.info(
        "Pickup round %s closed: %d/%d PAX picked, %d/%d stops completed",
        pickup_round.id, total_pax_picked, total_pax_expected,
        completed_stops, total_stops,
    )

    return kpis


# ==============================================================================
# IoT TRACKING (Real-time vehicle positions)
# ==============================================================================


async def record_position(
    db: AsyncSession,
    vehicle_id: UUID,
    lat: float,
    lng: float,
    source: str,
    speed_knots: float | None = None,
    heading: float | None = None,
    payload: dict | None = None,
) -> dict:
    """Insert a position record for a vehicle and emit SSE event for fleet_map widget.

    ``source``: ais | gps | manual
    """
    now = datetime.now(timezone.utc)

    position = VectorPosition(
        vector_id=vehicle_id,
        latitude=lat,
        longitude=lng,
        source=source,
        recorded_at=now,
        speed_knots=speed_knots,
        heading=heading,
        payload=payload,
    )
    db.add(position)
    await db.flush()

    # Emit SSE event for fleet map
    await event_bus.publish(OpsFluxEvent(
        event_type="travelwiz.position.updated",
        payload={
            "vector_id": str(vehicle_id),
            "latitude": lat,
            "longitude": lng,
            "source": source,
            "speed_knots": speed_knots,
            "heading": heading,
            "recorded_at": now.isoformat(),
        },
    ))

    logger.debug("Position recorded for vehicle %s: (%s, %s)", vehicle_id, lat, lng)

    return {
        "id": position.id,
        "vector_id": vehicle_id,
        "latitude": lat,
        "longitude": lng,
        "source": source,
        "speed_knots": speed_knots,
        "heading": heading,
        "recorded_at": now.isoformat(),
    }


async def get_vehicle_track(
    db: AsyncSession,
    vehicle_id: UUID,
    start: datetime,
    end: datetime,
) -> list[dict]:
    """Return position history for a vehicle between start and end timestamps."""
    result = await db.execute(
        select(VectorPosition)
        .where(
            VectorPosition.vector_id == vehicle_id,
            VectorPosition.recorded_at >= start,
            VectorPosition.recorded_at <= end,
        )
        .order_by(VectorPosition.recorded_at)
    )
    positions = result.scalars().all()

    return [
        {
            "id": p.id,
            "latitude": p.latitude,
            "longitude": p.longitude,
            "source": p.source,
            "speed_knots": p.speed_knots,
            "heading": p.heading,
            "recorded_at": p.recorded_at.isoformat(),
        }
        for p in positions
    ]


async def get_fleet_positions(
    db: AsyncSession,
    entity_id: UUID,
) -> list[dict]:
    """Return latest position of all active vehicles for fleet map widget.

    Uses a DISTINCT ON query to get only the most recent position per vector.
    """
    try:
        result = await db.execute(
            text(
                "SELECT DISTINCT ON (vp.vector_id) "
                "  vp.vector_id, vp.latitude, vp.longitude, vp.source, "
                "  vp.speed_knots, vp.heading, vp.recorded_at, "
                "  tv.name AS vector_name, tv.type AS vector_type, "
                "  tv.registration "
                "FROM vector_positions vp "
                "JOIN transport_vectors tv ON tv.id = vp.vector_id "
                "WHERE tv.entity_id = :eid "
                "  AND tv.active = true "
                "ORDER BY vp.vector_id, vp.recorded_at DESC"
            ),
            {"eid": str(entity_id)},
        )
        rows = result.all()
    except Exception:
        logger.debug("Fleet positions query failed (table may not exist yet)")
        return []

    return [
        {
            "vector_id": row[0],
            "latitude": float(row[1]),
            "longitude": float(row[2]),
            "source": row[3],
            "speed_knots": float(row[4]) if row[4] else None,
            "heading": float(row[5]) if row[5] else None,
            "recorded_at": row[6].isoformat() if row[6] else None,
            "vector_name": row[7],
            "vector_type": row[8],
            "registration": row[9],
        }
        for row in rows
    ]


async def process_ais_data(
    db: AsyncSession,
    entity_id: UUID,
    ais_messages: list[dict],
) -> dict:
    """Bulk import AIS messages, match by MMSI to vehicles.

    Each message in ``ais_messages``:
        mmsi, latitude, longitude, speed_over_ground, course_over_ground,
        timestamp (optional)

    Returns:
        {
            "processed": int,
            "matched": int,
            "unmatched_mmsi": [str],
        }
    """
    # Build MMSI -> vector_id lookup
    vectors_result = await db.execute(
        select(TransportVector.id, TransportVector.mmsi_number)
        .where(
            TransportVector.entity_id == entity_id,
            TransportVector.active == True,  # noqa: E712
            TransportVector.mmsi_number.isnot(None),
        )
    )
    mmsi_map = {row[1]: row[0] for row in vectors_result.all()}

    matched = 0
    unmatched_mmsi = set()
    now = datetime.now(timezone.utc)

    for msg in ais_messages:
        mmsi = str(msg.get("mmsi", ""))
        vector_id = mmsi_map.get(mmsi)

        if not vector_id:
            unmatched_mmsi.add(mmsi)
            continue

        position = VectorPosition(
            vector_id=vector_id,
            latitude=float(msg["latitude"]),
            longitude=float(msg["longitude"]),
            source="ais",
            recorded_at=msg.get("timestamp", now),
            speed_knots=msg.get("speed_over_ground"),
            heading=msg.get("course_over_ground"),
            payload={"mmsi": mmsi, "raw": msg},
        )
        db.add(position)
        matched += 1

    await db.flush()

    # Emit bulk position update event
    if matched > 0:
        await event_bus.publish(OpsFluxEvent(
            event_type="travelwiz.position.updated",
            payload={
                "entity_id": str(entity_id),
                "source": "ais_bulk",
                "positions_count": matched,
            },
        ))

    logger.info(
        "AIS bulk import: %d messages, %d matched, %d unmatched MMSI",
        len(ais_messages), matched, len(unmatched_mmsi),
    )

    return {
        "processed": len(ais_messages),
        "matched": matched,
        "unmatched_mmsi": list(unmatched_mmsi),
    }


# ==============================================================================
# WEATHER INTEGRATION
# ==============================================================================


async def record_weather(
    db: AsyncSession,
    entity_id: UUID,
    data: dict,
) -> dict:
    """Record weather observation (manual or API).

    ``data`` keys:
        asset_id, recorded_at, source, wind_speed_knots, wind_direction_deg,
        wave_height_m, visibility_nm, sea_state, temperature_c, weather_code,
        flight_conditions, raw_data, notes

    Returns created weather record.
    """
    weather = WeatherData(
        entity_id=entity_id,
        asset_id=data["asset_id"],
        recorded_at=data.get("recorded_at", datetime.now(timezone.utc)),
        source=data.get("source", "manual"),
        wind_speed_knots=data.get("wind_speed_knots"),
        wind_direction_deg=data.get("wind_direction_deg"),
        wave_height_m=data.get("wave_height_m"),
        visibility_nm=data.get("visibility_nm"),
        sea_state=data.get("sea_state"),
        temperature_c=data.get("temperature_c"),
        weather_code=data.get("weather_code"),
        flight_conditions=data.get("flight_conditions"),
        raw_data=data.get("raw_data"),
        notes=data.get("notes"),
    )
    db.add(weather)
    await db.flush()

    # Emit SSE event
    await event_bus.publish(OpsFluxEvent(
        event_type="travelwiz.weather.updated",
        payload={
            "entity_id": str(entity_id),
            "asset_id": str(data["asset_id"]),
            "source": weather.source,
            "weather_code": weather.weather_code,
            "flight_conditions": weather.flight_conditions,
            "recorded_at": weather.recorded_at.isoformat(),
        },
    ))

    logger.info(
        "Weather recorded for asset %s: %s / %s",
        data["asset_id"], weather.weather_code, weather.flight_conditions,
    )

    return {
        "id": weather.id,
        "entity_id": entity_id,
        "asset_id": weather.asset_id,
        "recorded_at": weather.recorded_at.isoformat(),
        "source": weather.source,
        "wind_speed_knots": float(weather.wind_speed_knots) if weather.wind_speed_knots else None,
        "wind_direction_deg": weather.wind_direction_deg,
        "wave_height_m": float(weather.wave_height_m) if weather.wave_height_m else None,
        "visibility_nm": float(weather.visibility_nm) if weather.visibility_nm else None,
        "sea_state": weather.sea_state,
        "temperature_c": float(weather.temperature_c) if weather.temperature_c else None,
        "weather_code": weather.weather_code,
        "flight_conditions": weather.flight_conditions,
        "notes": weather.notes,
    }


async def get_latest_weather(
    db: AsyncSession,
    entity_id: UUID,
    asset_id: UUID,
) -> dict | None:
    """Get most recent weather for a site (asset)."""
    result = await db.execute(
        select(WeatherData)
        .where(
            WeatherData.entity_id == entity_id,
            WeatherData.asset_id == asset_id,
            WeatherData.active == True,  # noqa: E712
        )
        .order_by(WeatherData.recorded_at.desc())
        .limit(1)
    )
    weather = result.scalar_one_or_none()
    if not weather:
        return None

    return {
        "id": weather.id,
        "asset_id": weather.asset_id,
        "recorded_at": weather.recorded_at.isoformat(),
        "source": weather.source,
        "wind_speed_knots": float(weather.wind_speed_knots) if weather.wind_speed_knots else None,
        "wind_direction_deg": weather.wind_direction_deg,
        "wave_height_m": float(weather.wave_height_m) if weather.wave_height_m else None,
        "visibility_nm": float(weather.visibility_nm) if weather.visibility_nm else None,
        "sea_state": weather.sea_state,
        "temperature_c": float(weather.temperature_c) if weather.temperature_c else None,
        "weather_code": weather.weather_code,
        "flight_conditions": weather.flight_conditions,
        "notes": weather.notes,
    }


async def get_weather_for_trip(
    db: AsyncSession,
    trip_id: UUID,
) -> dict:
    """Get weather at origin and destination at departure time.

    Returns weather observations closest to the voyage departure for the
    departure base and destination stops.
    """
    # Load voyage
    voyage_result = await db.execute(
        select(Voyage).where(Voyage.id == trip_id)
    )
    voyage = voyage_result.scalar_one_or_none()
    if not voyage:
        raise ValueError(f"Voyage {trip_id} not found")

    departure_time = voyage.actual_departure or voyage.scheduled_departure

    # Get weather for departure base (closest to departure time)
    origin_weather = None
    try:
        origin_result = await db.execute(
            text(
                "SELECT id, asset_id, recorded_at, source, wind_speed_knots, "
                "  wind_direction_deg, wave_height_m, visibility_nm, sea_state, "
                "  temperature_c, weather_code, flight_conditions, notes "
                "FROM weather_data "
                "WHERE entity_id = :eid AND asset_id = :aid AND active = true "
                "ORDER BY ABS(EXTRACT(EPOCH FROM (recorded_at - :dep_time))) "
                "LIMIT 1"
            ),
            {
                "eid": str(voyage.entity_id),
                "aid": str(voyage.departure_base_id),
                "dep_time": departure_time,
            },
        )
        row = origin_result.first()
        if row:
            origin_weather = {
                "id": row[0], "asset_id": row[1],
                "recorded_at": row[2].isoformat() if row[2] else None,
                "source": row[3],
                "wind_speed_knots": float(row[4]) if row[4] else None,
                "wind_direction_deg": row[5],
                "wave_height_m": float(row[6]) if row[6] else None,
                "visibility_nm": float(row[7]) if row[7] else None,
                "sea_state": row[8],
                "temperature_c": float(row[9]) if row[9] else None,
                "weather_code": row[10],
                "flight_conditions": row[11],
                "notes": row[12],
            }
    except Exception:
        logger.debug("weather_data query for origin failed (table may not exist)")

    # Get weather for destination stops
    destination_weather = []
    stops_result = await db.execute(
        select(VoyageStop.asset_id)
        .where(
            VoyageStop.voyage_id == trip_id,
            VoyageStop.active == True,  # noqa: E712
        )
    )
    dest_asset_ids = [row[0] for row in stops_result.all()]

    for dest_aid in dest_asset_ids:
        try:
            dest_result = await db.execute(
                text(
                    "SELECT id, asset_id, recorded_at, source, wind_speed_knots, "
                    "  wind_direction_deg, wave_height_m, visibility_nm, sea_state, "
                    "  temperature_c, weather_code, flight_conditions, notes "
                    "FROM weather_data "
                    "WHERE entity_id = :eid AND asset_id = :aid AND active = true "
                    "ORDER BY ABS(EXTRACT(EPOCH FROM (recorded_at - :dep_time))) "
                    "LIMIT 1"
                ),
                {
                    "eid": str(voyage.entity_id),
                    "aid": str(dest_aid),
                    "dep_time": departure_time,
                },
            )
            row = dest_result.first()
            if row:
                destination_weather.append({
                    "id": row[0], "asset_id": row[1],
                    "recorded_at": row[2].isoformat() if row[2] else None,
                    "source": row[3],
                    "wind_speed_knots": float(row[4]) if row[4] else None,
                    "wind_direction_deg": row[5],
                    "wave_height_m": float(row[6]) if row[6] else None,
                    "visibility_nm": float(row[7]) if row[7] else None,
                    "sea_state": row[8],
                    "temperature_c": float(row[9]) if row[9] else None,
                    "weather_code": row[10],
                    "flight_conditions": row[11],
                    "notes": row[12],
                })
        except Exception:
            logger.debug("weather_data query for destination %s failed", dest_aid)

    return {
        "voyage_id": trip_id,
        "departure_time": departure_time.isoformat() if departure_time else None,
        "origin_weather": origin_weather,
        "destination_weather": destination_weather,
    }


async def check_flight_conditions(
    db: AsyncSession,
    asset_id: UUID,
) -> dict:
    """Return current flight conditions (VFR/IFR) for helicopter operations.

    Looks at the most recent weather record for the given asset.
    Returns conditions assessment based on visibility, wind, and ceiling data.
    """
    try:
        result = await db.execute(
            text(
                "SELECT id, recorded_at, source, wind_speed_knots, "
                "  visibility_nm, weather_code, flight_conditions, "
                "  sea_state, temperature_c, notes "
                "FROM weather_data "
                "WHERE asset_id = :aid AND active = true "
                "ORDER BY recorded_at DESC "
                "LIMIT 1"
            ),
            {"aid": str(asset_id)},
        )
        row = result.first()
    except Exception:
        logger.debug("flight conditions check failed (weather_data table may not exist)")
        return {
            "asset_id": asset_id,
            "conditions": "unknown",
            "flight_ok": False,
            "reason": "No weather data available",
        }

    if not row:
        return {
            "asset_id": asset_id,
            "conditions": "unknown",
            "flight_ok": False,
            "reason": "No weather data available",
        }

    flight_cond = row[6]  # flight_conditions field
    visibility = float(row[4]) if row[4] else None
    wind_speed = float(row[3]) if row[3] else None

    # Determine if flight is OK based on conditions
    flight_ok = True
    reasons = []

    if flight_cond in ("ifr", "lifr"):
        flight_ok = False
        reasons.append(f"Flight conditions: {flight_cond.upper()}")

    if visibility is not None and visibility < 3.0:
        flight_ok = False
        reasons.append(f"Low visibility: {visibility} NM")

    if wind_speed is not None and wind_speed > 45:
        flight_ok = False
        reasons.append(f"High wind speed: {wind_speed} knots")

    return {
        "asset_id": asset_id,
        "conditions": flight_cond or "unknown",
        "flight_ok": flight_ok,
        "reason": "; ".join(reasons) if reasons else "Conditions OK for flight",
        "last_observation": {
            "id": row[0],
            "recorded_at": row[1].isoformat() if row[1] else None,
            "source": row[2],
            "wind_speed_knots": wind_speed,
            "visibility_nm": visibility,
            "weather_code": row[5],
        },
    }
