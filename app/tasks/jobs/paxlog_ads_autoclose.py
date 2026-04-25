"""Scheduled job — alert and auto-close overdue in-progress AdS."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select

from app.core.database import async_session_factory
from app.core.notifications import send_in_app
from app.models.common import Setting
from app.models.paxlog import Ads, AdsEvent
from app.services.modules.paxlog_service import complete_ads_operationally

logger = logging.getLogger(__name__)

DEFAULT_GRACE_DAYS = 2
SETTING_KEY = "paxlog.ads_auto_close_grace_days"


async def process_overdue_ads_closure() -> dict[str, int]:
    """Alert overdue in-progress AdS, then auto-close them after a configurable grace delay."""
    today = datetime.now(timezone.utc).date()
    alerts_sent = 0
    auto_closed = 0

    async with async_session_factory() as db:
        settings_result = await db.execute(
            select(Setting).where(
                Setting.key == SETTING_KEY,
                Setting.scope == "entity",
            )
        )
        grace_by_entity: dict[str, int] = {}
        for setting in settings_result.scalars().all():
            raw_value = setting.value.get("v")
            try:
                grace_by_entity[str(setting.scope_id)] = max(0, int(raw_value))
            except (TypeError, ValueError):
                grace_by_entity[str(setting.scope_id)] = DEFAULT_GRACE_DAYS

        ads_result = await db.execute(
            select(Ads).where(
                Ads.status == "in_progress",
                Ads.end_date < today,
            )
        )
        overdue_ads = ads_result.scalars().all()

        for ads in overdue_ads:
            grace_days = grace_by_entity.get(str(ads.entity_id), DEFAULT_GRACE_DAYS)
            cutoff = ads.end_date + timedelta(days=grace_days)

            if today > cutoff:
                await complete_ads_operationally(
                    db,
                    ads,
                    source="paxlog.nightly_autoclose",
                    actor_id=None,
                    reason="Auto-close after overdue return grace period",
                    extra_metadata={"grace_days": grace_days},
                )
                try:
                    await send_in_app(
                        db,
                        user_id=ads.requester_id,
                        entity_id=ads.entity_id,
                        title="AdS clôturée automatiquement",
                        body=(
                            f"L'AdS {ads.reference} a été clôturée automatiquement "
                            f"après dépassement du délai de grâce de retour."
                        ),
                        category="paxlog",
                        link=f"/paxlog/ads/{ads.id}",
                    )
                    await db.commit()
                except Exception:
                    logger.exception("Failed to notify requester about auto-close for %s", ads.id)
                auto_closed += 1
                continue

            alert_result = await db.execute(
                select(AdsEvent.id).where(
                    AdsEvent.ads_id == ads.id,
                    AdsEvent.event_type == "overdue_return_alert",
                )
            )
            if alert_result.scalar_one_or_none() is not None:
                continue

            db.add(AdsEvent(
                entity_id=ads.entity_id,
                ads_id=ads.id,
                event_type="overdue_return_alert",
                old_status=ads.status,
                new_status=ads.status,
                actor_id=None,
                metadata_json={
                    "source": "paxlog.nightly_autoclose",
                    "grace_days": grace_days,
                    "scheduled_auto_close_date": cutoff.isoformat(),
                },
            ))
            try:
                await send_in_app(
                    db,
                    user_id=ads.requester_id,
                    entity_id=ads.entity_id,
                    title="AdS en attente de clôture",
                    body=(
                        f"L'AdS {ads.reference} a dépassé sa date de fin et sera "
                        f"clôturée automatiquement après le délai de grâce configuré."
                    ),
                    category="paxlog",
                    link=f"/paxlog/ads/{ads.id}",
                )
            except Exception:
                logger.exception("Failed to notify requester about overdue AdS %s", ads.id)
            await db.commit()
            alerts_sent += 1

    logger.info(
        "paxlog overdue closure job done — %d alerts sent, %d AdS auto-closed",
        alerts_sent,
        auto_closed,
    )
    return {"alerts_sent": alerts_sent, "auto_closed": auto_closed}
