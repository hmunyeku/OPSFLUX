"""Scheduled TravelWiz operational monitoring.

Checks:
- stale vector tracking signals for active voyages
- severe weather at operational assets used by active voyages
"""

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func as sqla_func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.core.notifications import send_in_app
from app.event_handlers.core_handlers import _get_admin_user_ids
from app.models.asset_registry import Installation
from app.models.travelwiz import VectorPosition, Voyage, VoyageStop, WeatherData
from app.services.modules.travelwiz_service import (
    get_signal_stale_minutes,
    get_weather_alert_beaufort_threshold,
)

logger = logging.getLogger(__name__)

_ALERT_DEDUP_MINUTES = 55
_BEAUFORT_MIN_KNOTS = {
    1: 1,
    2: 4,
    3: 7,
    4: 11,
    5: 17,
    6: 22,
    7: 28,
    8: 34,
    9: 41,
    10: 48,
    11: 56,
    12: 64,
}


async def _notification_sent_recently(
    db: AsyncSession,
    *,
    user_id: UUID,
    title: str,
    link: str,
    within_minutes: int = _ALERT_DEDUP_MINUTES,
) -> bool:
    since = datetime.now(timezone.utc) - timedelta(minutes=within_minutes)
    result = await db.execute(
        text(
            "SELECT COUNT(*) "
            "FROM notifications "
            "WHERE user_id = :uid AND title = :title AND link = :link AND created_at >= :since"
        ),
        {
            "uid": str(user_id),
            "title": title,
            "link": link,
            "since": since,
        },
    )
    return bool(result.scalar() or 0)


async def _process_stale_vector_signals(db: AsyncSession) -> int:
    latest_position_sq = (
        select(
            VectorPosition.vector_id.label("vector_id"),
            sqla_func.max(VectorPosition.recorded_at).label("latest_recorded_at"),
        )
        .group_by(VectorPosition.vector_id)
        .subquery()
    )
    result = await db.execute(
        select(
            Voyage.id,
            Voyage.entity_id,
            Voyage.code,
            latest_position_sq.c.latest_recorded_at,
        )
        .outerjoin(latest_position_sq, latest_position_sq.c.vector_id == Voyage.vector_id)
        .where(
            Voyage.active == True,  # noqa: E712
            Voyage.status.in_(["planned", "confirmed", "boarding", "departed"]),
        )
    )
    rows = result.all()
    now = datetime.now(timezone.utc)
    alerts = 0

    for voyage_id, entity_id, code, latest_recorded_at in rows:
        stale_after_minutes = await get_signal_stale_minutes(db, entity_id=entity_id)
        is_stale = (
            latest_recorded_at is None
            or latest_recorded_at <= now - timedelta(minutes=stale_after_minutes)
        )
        if not is_stale:
            continue

        link = f"/travelwiz/voyages/{voyage_id}"
        title = "Signal de suivi indisponible"
        admin_ids = await _get_admin_user_ids(str(entity_id))
        for admin_id in admin_ids:
            if await _notification_sent_recently(db, user_id=admin_id, title=title, link=link):
                continue
            body = (
                f"Le voyage {code or voyage_id} n'a plus de position exploitable "
                f"depuis au moins {stale_after_minutes} minutes."
            )
            await send_in_app(
                db,
                user_id=admin_id,
                entity_id=entity_id,
                title=title,
                body=body,
                category="travelwiz",
                link=link,
            )
            alerts += 1
    return alerts


async def _process_weather_alerts(db: AsyncSession) -> int:
    active_assets_sq = (
        select(
            Voyage.entity_id.label("entity_id"),
            Voyage.departure_base_id.label("asset_id"),
        )
        .where(
            Voyage.active == True,  # noqa: E712
            Voyage.status.in_(["planned", "confirmed", "boarding"]),
        )
        .union(
            select(
                Voyage.entity_id.label("entity_id"),
                VoyageStop.asset_id.label("asset_id"),
            )
            .join(VoyageStop, VoyageStop.voyage_id == Voyage.id)
            .where(
                Voyage.active == True,  # noqa: E712
                Voyage.status.in_(["planned", "confirmed", "boarding"]),
                VoyageStop.active == True,  # noqa: E712
            )
        )
        .subquery()
    )
    latest_weather_sq = (
        select(
            WeatherData.entity_id.label("entity_id"),
            WeatherData.asset_id.label("asset_id"),
            sqla_func.max(WeatherData.recorded_at).label("latest_recorded_at"),
        )
        .where(WeatherData.active == True)  # noqa: E712
        .group_by(WeatherData.entity_id, WeatherData.asset_id)
        .subquery()
    )
    result = await db.execute(
        select(
            active_assets_sq.c.entity_id,
            active_assets_sq.c.asset_id,
            Installation.name,
            WeatherData.wind_speed_knots,
            WeatherData.flight_conditions,
            WeatherData.weather_code,
            WeatherData.recorded_at,
        )
        .join(
            latest_weather_sq,
            (latest_weather_sq.c.entity_id == active_assets_sq.c.entity_id)
            & (latest_weather_sq.c.asset_id == active_assets_sq.c.asset_id),
        )
        .join(
            WeatherData,
            (WeatherData.entity_id == latest_weather_sq.c.entity_id)
            & (WeatherData.asset_id == latest_weather_sq.c.asset_id)
            & (WeatherData.recorded_at == latest_weather_sq.c.latest_recorded_at),
        )
        .outerjoin(Installation, Installation.id == active_assets_sq.c.asset_id)
    )
    rows = result.all()
    alerts = 0

    for entity_id, asset_id, asset_name, wind_speed_knots, flight_conditions, weather_code, recorded_at in rows:
        threshold_beaufort = await get_weather_alert_beaufort_threshold(db, entity_id=entity_id)
        threshold_knots = _BEAUFORT_MIN_KNOTS.get(threshold_beaufort, 22)
        wind_knots = float(wind_speed_knots or 0)
        is_alert = (
            wind_knots >= threshold_knots
            or (flight_conditions or "").lower() in {"ifr", "lifr"}
            or (weather_code or "").lower() in {"storm", "thunderstorm"}
        )
        if not is_alert:
            continue

        link = "/travelwiz"
        title = "Alerte météo opérationnelle"
        admin_ids = await _get_admin_user_ids(str(entity_id))
        for admin_id in admin_ids:
            if await _notification_sent_recently(db, user_id=admin_id, title=title, link=link):
                continue
            body = (
                f"Conditions critiques sur {asset_name or asset_id}: "
                f"{wind_knots} kt, vol {flight_conditions or 'n/a'}, "
                f"code météo {weather_code or 'n/a'}."
            )
            if recorded_at:
                body += f" Dernière mesure: {recorded_at.isoformat()}."
            await send_in_app(
                db,
                user_id=admin_id,
                entity_id=entity_id,
                title=title,
                body=body,
                category="travelwiz",
                link=link,
            )
            alerts += 1
    return alerts


async def process_travelwiz_operational_watch() -> None:
    """Run TravelWiz monitoring checks and notify operators when needed."""
    async with async_session_factory() as db:
        stale_count = await _process_stale_vector_signals(db)
        weather_count = await _process_weather_alerts(db)
        await db.commit()
        logger.info(
            "travelwiz_operational_watch: %d stale-signal alerts, %d weather alerts",
            stale_count,
            weather_count,
        )
