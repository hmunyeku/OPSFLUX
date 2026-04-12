"""Scheduled job — remind stale AdS in requires_review status."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.database import async_session_factory
from app.core.notifications import send_in_app
from app.models.paxlog import Ads, AdsEvent

logger = logging.getLogger(__name__)

REMINDER_DAYS = 14
REMINDER_EVENT_TYPE = "requires_review_reminder"


async def process_requires_review_followup() -> dict[str, int]:
    """Send a single reminder for AdS left in requires_review for 14 days."""
    today = datetime.now(UTC)
    threshold = today - timedelta(days=REMINDER_DAYS)
    reminders_sent = 0

    async with async_session_factory() as db:
        ads_result = await db.execute(
            select(Ads).where(
                Ads.status == "requires_review",
                Ads.updated_at <= threshold,
            )
        )
        stale_ads = ads_result.scalars().all()

        for ads in stale_ads:
            already_sent = await db.execute(
                select(AdsEvent.id).where(
                    AdsEvent.ads_id == ads.id,
                    AdsEvent.event_type == REMINDER_EVENT_TYPE,
                )
            )
            if already_sent.scalar_one_or_none() is not None:
                continue

            db.add(
                AdsEvent(
                    entity_id=ads.entity_id,
                    ads_id=ads.id,
                    event_type=REMINDER_EVENT_TYPE,
                    old_status=ads.status,
                    new_status=ads.status,
                    actor_id=None,
                    metadata_json={
                        "source": "paxlog.requires_review_followup",
                        "days_in_requires_review": REMINDER_DAYS,
                        "force_cancel_available_after_days": 28,
                    },
                )
            )
            try:
                await send_in_app(
                    db,
                    user_id=ads.requester_id,
                    entity_id=ads.entity_id,
                    title="AdS toujours en attente de révision",
                    body=(
                        f"L'AdS {ads.reference} est en statut « nécessite révision » "
                        f"depuis {REMINDER_DAYS} jours. Merci de la mettre à jour ou de la resoumettre."
                    ),
                    category="paxlog",
                    link=f"/paxlog/ads/{ads.id}",
                )
            except Exception:
                logger.exception("Failed to notify requester about stale requires_review AdS %s", ads.id)
            await db.commit()
            reminders_sent += 1

    logger.info("paxlog requires_review follow-up done — %d reminders sent", reminders_sent)
    return {"reminders_sent": reminders_sent}
