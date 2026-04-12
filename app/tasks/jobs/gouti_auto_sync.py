"""Auto-sync job for Gouti-imported projects.

Runs on a fixed interval (controlled by APScheduler) and iterates over every
entity that has the Gouti integration enabled, calling the same upsert path
as the manual POST /api/v1/gouti/sync route.

Each entity can opt in/out via ``integration.gouti.auto_sync_enabled`` and
tune the effective interval via ``integration.gouti.auto_sync_interval_minutes``.
The APScheduler trigger itself is fixed at the shortest supported interval
(e.g. 15 min) and the job skips any entity whose last run is more recent
than its configured interval — this gives per-entity intervals without
needing dynamic jobs.
"""

import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.core.database import async_session_factory
from app.models.common import Entity, Setting
from app.services.connectors.gouti_connector import create_gouti_connector

logger = logging.getLogger(__name__)


async def _load_gouti_settings_for_entity(db, entity_id) -> dict[str, str]:
    rows = await db.execute(
        select(Setting).where(
            Setting.key.startswith("integration.gouti."),
            Setting.scope == "entity",
            Setting.scope_id == str(entity_id),
        )
    )
    out: dict[str, str] = {}
    for s in rows.scalars().all():
        field = s.key.replace("integration.gouti.", "")
        val = s.value.get("v", "") if isinstance(s.value, dict) else s.value
        out[field] = str(val) if val else ""
    return out


async def _persist_last_run(db, entity_id, iso_ts: str, count: int) -> None:
    for key, value in [
        ("integration.gouti.last_auto_sync_at", iso_ts),
        ("integration.gouti.last_auto_sync_count", str(count)),
    ]:
        existing = (
            await db.execute(
                select(Setting).where(
                    Setting.key == key,
                    Setting.scope == "entity",
                    Setting.scope_id == str(entity_id),
                )
            )
        ).scalar_one_or_none()
        if existing:
            existing.value = {"v": value}
        else:
            db.add(Setting(key=key, value={"v": value}, scope="entity", scope_id=str(entity_id)))
    await db.commit()


async def run_gouti_auto_sync() -> None:
    """APScheduler entry point: sync every opted-in entity's Gouti projects.

    Safe to call on a short cadence (every 15 min) — per-entity throttling
    ensures we never exceed each entity's configured interval.
    """
    # Lazy import to break circular dependency: gouti_sync imports models which
    # are heavy and we want this module to stay cheap to import at startup.
    from app.api.routes.core.gouti_sync import _upsert_project_from_gouti

    async with async_session_factory() as db:
        try:
            entities = (
                (
                    await db.execute(
                        select(Entity).where(Entity.active == True)  # noqa: E712
                    )
                )
                .scalars()
                .all()
            )
        except SQLAlchemyError:
            logger.exception("Gouti auto-sync: failed to list entities")
            return

        now = datetime.now(UTC)

        for entity in entities:
            try:
                settings = await _load_gouti_settings_for_entity(db, entity.id)
                if (settings.get("auto_sync_enabled") or "").lower() not in ("1", "true", "on", "yes"):
                    continue
                if not settings.get("client_id"):
                    continue
                if not (settings.get("client_secret") or settings.get("token")):
                    continue

                # Per-entity interval throttling
                try:
                    interval_min = int(settings.get("auto_sync_interval_minutes") or 60)
                except (TypeError, ValueError):
                    interval_min = 60
                last_run_iso = settings.get("last_auto_sync_at")
                if last_run_iso:
                    try:
                        last_run_dt = datetime.fromisoformat(last_run_iso)
                        if last_run_dt.tzinfo is None:
                            last_run_dt = last_run_dt.replace(tzinfo=UTC)
                        minutes_since = (now - last_run_dt).total_seconds() / 60
                        if minutes_since < interval_min:
                            continue
                    except ValueError:
                        pass  # Malformed → run anyway

                logger.info("Gouti auto-sync: starting for entity %s (%s)", entity.id, entity.code)

                connector = create_gouti_connector(settings)
                try:
                    gouti_projects = await connector.get_projects()
                except Exception as exc:
                    logger.warning(
                        "Gouti auto-sync: fetch failed for entity %s: %s",
                        entity.id,
                        exc,
                    )
                    continue

                synced_count = 0
                for gp in gouti_projects:
                    try:
                        await _upsert_project_from_gouti(db, entity.id, gp)
                        synced_count += 1
                    except Exception as exc:
                        logger.warning(
                            "Gouti auto-sync: upsert failed for entity %s, project %s: %s",
                            entity.id,
                            gp.get("_id") or gp.get("id") or "?",
                            exc,
                        )

                try:
                    await db.commit()
                except SQLAlchemyError:
                    await db.rollback()
                    logger.exception("Gouti auto-sync: commit failed for entity %s", entity.id)
                    continue

                await _persist_last_run(db, entity.id, now.isoformat(), synced_count)

                logger.info(
                    "Gouti auto-sync: entity %s → %d projects synced",
                    entity.id,
                    synced_count,
                )
            except Exception:
                logger.exception("Gouti auto-sync: unexpected error for entity %s", entity.id)
                await db.rollback()
