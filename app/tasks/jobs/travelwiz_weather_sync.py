"""Scheduled TravelWiz weather sync from configured provider."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.database import async_session_factory
from app.models.travelwiz import Voyage, VoyageStop, WeatherData
from app.services.modules.travelwiz_service import (
    fetch_and_record_weather_for_asset,
    get_weather_sync_interval_minutes,
)

logger = logging.getLogger(__name__)


async def process_travelwiz_weather_sync() -> dict[str, int]:
    """Fetch latest weather for assets used by active voyages."""
    async with async_session_factory() as db:
        active_assets_sq = (
            select(
                Voyage.entity_id.label("entity_id"),
                Voyage.departure_base_id.label("asset_id"),
            )
            .where(
                Voyage.active == True,  # noqa: E712
                Voyage.status.in_(["planned", "confirmed", "boarding", "delayed"]),
            )
            .union(
                select(
                    Voyage.entity_id.label("entity_id"),
                    VoyageStop.asset_id.label("asset_id"),
                )
                .join(VoyageStop, VoyageStop.voyage_id == Voyage.id)
                .where(
                    Voyage.active == True,  # noqa: E712
                    Voyage.status.in_(["planned", "confirmed", "boarding", "delayed"]),
                    VoyageStop.active == True,  # noqa: E712
                )
            )
            .subquery()
        )
        result = await db.execute(select(active_assets_sq.c.entity_id, active_assets_sq.c.asset_id))
        pairs = result.all()

        fetched = 0
        skipped_recent = 0
        failed = 0
        now = datetime.now(UTC)

        for entity_id, asset_id in pairs:
            interval_minutes = await get_weather_sync_interval_minutes(db, entity_id=entity_id)
            latest_result = await db.execute(
                select(WeatherData.recorded_at)
                .where(
                    WeatherData.entity_id == entity_id,
                    WeatherData.asset_id == asset_id,
                    WeatherData.active == True,  # noqa: E712
                    WeatherData.source.in_(["api_open_meteo", "api_openweather"]),
                )
                .order_by(WeatherData.recorded_at.desc())
                .limit(1)
            )
            latest_recorded_at = latest_result.scalar_one_or_none()
            if latest_recorded_at and latest_recorded_at >= now - timedelta(minutes=interval_minutes):
                skipped_recent += 1
                continue

            try:
                await fetch_and_record_weather_for_asset(
                    db,
                    entity_id=entity_id,
                    asset_id=asset_id,
                )
                fetched += 1
            except Exception:
                failed += 1
                logger.exception(
                    "TravelWiz weather sync failed for entity=%s asset=%s",
                    entity_id,
                    asset_id,
                )

        await db.commit()
        logger.info(
            "travelwiz_weather_sync: %d fetched, %d skipped_recent, %d failed",
            fetched,
            skipped_recent,
            failed,
        )
        return {
            "fetched": fetched,
            "skipped_recent": skipped_recent,
            "failed": failed,
        }
