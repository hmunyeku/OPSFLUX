"""Asset inspection reminder job.

Checks for assets with upcoming next_inspection dates and sends
notifications to entity admins.
"""
import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)


async def check_asset_inspections() -> None:
    """Check for assets with inspections due within 30 days and send reminders."""
    from app.core.database import async_session_factory
    from app.models.common import Asset
    from app.core.notifications import send_in_app
    from app.event_handlers.core_handlers import _get_admin_user_ids
    from sqlalchemy import select

    now = datetime.now(timezone.utc)
    threshold = now + timedelta(days=30)

    try:
        async with async_session_factory() as db:
            # Find assets with next_inspection in the next 30 days
            result = await db.execute(
                select(Asset).where(
                    Asset.next_inspection.isnot(None),
                    Asset.next_inspection <= threshold.date(),
                    Asset.next_inspection >= now.date(),
                    Asset.active == True,
                    Asset.archived == False,
                ).order_by(Asset.next_inspection)
            )
            assets = result.scalars().all()

            if not assets:
                logger.info("asset_inspection: no inspections due within 30 days")
                return

            # Group by entity
            by_entity: dict[str, list] = {}
            for asset in assets:
                eid = str(asset.entity_id)
                if eid not in by_entity:
                    by_entity[eid] = []
                by_entity[eid].append(asset)

            # Send notifications per entity
            from uuid import UUID
            for entity_id_str, entity_assets in by_entity.items():
                admin_ids = await _get_admin_user_ids(entity_id_str)
                count = len(entity_assets)
                first_due = min(a.next_inspection for a in entity_assets)
                days_until = (first_due - now.date()).days

                for admin_id in admin_ids:
                    await send_in_app(
                        db,
                        user_id=admin_id,
                        entity_id=UUID(entity_id_str),
                        title=f"{count} inspection(s) à planifier",
                        body=f"La prochaine inspection est dans {days_until} jours ({first_due.strftime('%d/%m/%Y')}).",
                        category="assets",
                        link="/assets",
                    )

            await db.commit()
            logger.info("asset_inspection: %d assets with upcoming inspections across %d entities", len(assets), len(by_entity))

    except Exception:
        logger.exception("Error in check_asset_inspections")
