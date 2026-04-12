"""Scheduled SMS reminders for imminent pickup stops."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.core.sms_service import send_sms, send_to_user
from app.models.asset_registry import Installation
from app.models.travelwiz import ManifestPassenger, PickupRound, PickupStop, PickupStopAssignment
from app.services.modules.travelwiz_service import get_pickup_sms_lead_minutes

logger = logging.getLogger(__name__)


async def _resolve_tier_contact_phone(db: AsyncSession, contact_id: UUID) -> str | None:
    phone_result = await db.execute(
        text(
            "SELECT country_code, number "
            "FROM phones "
            "WHERE owner_type = 'tier_contact' AND owner_id = :cid "
            "ORDER BY (verified AND is_default) DESC, verified DESC, is_default DESC, created_at ASC "
            "LIMIT 1"
        ),
        {"cid": str(contact_id)},
    )
    phone_row = phone_result.first()
    if phone_row:
        return f"{phone_row[0] or ''}{phone_row[1] or ''}".strip() or None

    contact_result = await db.execute(
        text("SELECT phone FROM tier_contacts WHERE id = :cid"),
        {"cid": str(contact_id)},
    )
    return contact_result.scalar_one_or_none()


def _build_pickup_sms_body(*, route_name: str, asset_name: str, scheduled_time: datetime) -> str:
    scheduled_label = scheduled_time.astimezone(UTC).strftime("%H:%M UTC")
    return f"OpsFlux: votre navette {route_name} arrive bientot au point {asset_name}. Heure prevue: {scheduled_label}."


async def process_travelwiz_pickup_reminders() -> dict[str, int]:
    """Send pickup reminders once per assigned passenger when a stop is imminent."""
    sent_count = 0
    now = datetime.now(UTC)

    async with async_session_factory() as db:
        entity_result = await db.execute(
            select(PickupRound.entity_id)
            .where(
                PickupRound.active == True,  # noqa: E712
                PickupRound.status.in_(["planned", "in_progress"]),
            )
            .distinct()
        )
        entity_ids = [row[0] for row in entity_result.all() if row[0]]

        for entity_id in entity_ids:
            lead_minutes = await get_pickup_sms_lead_minutes(db, entity_id=entity_id)
            deadline = now + timedelta(minutes=lead_minutes)

            assignment_result = await db.execute(
                select(
                    PickupStopAssignment,
                    PickupStop,
                    PickupRound,
                    ManifestPassenger,
                    Installation.name,
                )
                .join(PickupStop, PickupStop.id == PickupStopAssignment.pickup_stop_id)
                .join(PickupRound, PickupRound.id == PickupStop.pickup_round_id)
                .join(ManifestPassenger, ManifestPassenger.id == PickupStopAssignment.manifest_passenger_id)
                .outerjoin(Installation, Installation.id == PickupStop.asset_id)
                .where(
                    PickupRound.entity_id == entity_id,
                    PickupRound.active == True,  # noqa: E712
                    PickupRound.status.in_(["planned", "in_progress"]),
                    PickupStop.active == True,  # noqa: E712
                    PickupStop.status == "pending",
                    PickupStop.scheduled_time.is_not(None),
                    PickupStop.scheduled_time > now,
                    PickupStop.scheduled_time <= deadline,
                    PickupStopAssignment.active == True,  # noqa: E712
                    PickupStopAssignment.reminder_sent_at.is_(None),
                    ManifestPassenger.active == True,  # noqa: E712
                )
            )

            for assignment, stop, pickup_round, passenger, asset_name in assignment_result.all():
                body = _build_pickup_sms_body(
                    route_name=pickup_round.route_name,
                    asset_name=asset_name or str(stop.asset_id),
                    scheduled_time=stop.scheduled_time,
                )
                sent = False
                if passenger.user_id:
                    sent, _channel = await send_to_user(
                        db,
                        user_id=str(passenger.user_id),
                        subject="Rappel navette OpsFlux",
                        body=body,
                        message_type="notification",
                        event_type="travelwiz.pickup_reminder",
                    )
                elif passenger.contact_id:
                    phone = await _resolve_tier_contact_phone(db, passenger.contact_id)
                    if phone:
                        sent, _channel = await send_sms(
                            db,
                            to=phone,
                            body=body,
                            message_type="notification",
                            preferred_channel="sms",
                            event_type="travelwiz.pickup_reminder",
                        )

                if not sent:
                    continue

                assignment.reminder_sent_at = now
                sent_count += 1

        await db.commit()

    logger.info("travelwiz_pickup_reminders: %d reminders sent", sent_count)
    return {"sent_count": sent_count}
