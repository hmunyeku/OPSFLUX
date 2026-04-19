"""Scheduled job — remind stakeholders about upcoming temporary MOC expiries.

Runs daily at 07:30 UTC.

For every MOC with `modification_type='temporary'` and `temporary_end_date`
in the future, evaluates the per-entity `moc.reminders.days_before` setting
(list of thresholds in days, default [30, 14, 7, 1]) and fires an in-app +
email reminder for each threshold that has just been crossed — provided we
haven't already sent that particular reminder (idempotency via
`moc_reminder_log`).

Recipients (same logic as transition notifications):
  * If `moc_site_assignments` has a chef-de-site / director mapping for
    the MOC's site → use that subset.
  * Otherwise broadcast to every user holding `moc.site_chief.approve`.
  * The MOC initiator is always appended so they stay in the loop.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select

from app.core.database import async_session_factory

logger = logging.getLogger(__name__)


DEFAULT_DAYS_BEFORE = [30, 14, 7, 1]


async def check_moc_temporary_expiry() -> None:
    """Entry point registered in app/tasks/scheduler.py."""
    logger.info("moc_temporary_expiry: starting run")

    from app.models.common import Entity, Setting, User
    from app.models.moc import MOC, MOCReminderLog, MOCSiteAssignment

    try:
        async with async_session_factory() as db:
            now = datetime.now(UTC)
            today = now.date()

            entities = (
                await db.execute(select(Entity))
            ).scalars().all()

            total_sent = 0
            for entity in entities:
                days_before = await _load_entity_reminders(db, entity.id)
                if not days_before:
                    continue

                # Fetch candidate MOCs: temporary, end_date in future, not closed
                candidates = (
                    await db.execute(
                        select(MOC).where(
                            MOC.entity_id == entity.id,
                            MOC.modification_type == "temporary",
                            MOC.temporary_end_date.isnot(None),
                            MOC.temporary_end_date >= today,
                            MOC.status.notin_(("cancelled", "closed")),
                            MOC.archived == False,  # noqa: E712
                        )
                    )
                ).scalars().all()

                for moc in candidates:
                    if moc.temporary_end_date is None:
                        continue
                    remaining = (moc.temporary_end_date - today).days
                    # Find the smallest threshold we've crossed
                    crossed = [d for d in days_before if remaining <= d]
                    if not crossed:
                        continue
                    # Use the smallest crossed threshold that we haven't
                    # logged yet.
                    for threshold in sorted(crossed):
                        already = (
                            await db.execute(
                                select(MOCReminderLog.id).where(
                                    MOCReminderLog.moc_id == moc.id,
                                    MOCReminderLog.reminder_kind == "temporary_expiry",
                                    MOCReminderLog.days_before == threshold,
                                )
                            )
                        ).scalar_one_or_none()
                        if already:
                            continue
                        sent = await _dispatch_reminder(
                            db,
                            moc=moc,
                            days_remaining=remaining,
                            threshold=threshold,
                        )
                        db.add(MOCReminderLog(
                            moc_id=moc.id,
                            reminder_kind="temporary_expiry",
                            days_before=threshold,
                            target_date=moc.temporary_end_date,
                            sent_to_count=sent,
                        ))
                        total_sent += sent
                        break  # only one reminder per run per MOC

            await db.commit()
        logger.info("moc_temporary_expiry: sent %d notifications", total_sent)
    except Exception:
        logger.exception("moc_temporary_expiry: job failed")


async def _load_entity_reminders(db, entity_id: UUID) -> list[int]:
    """Load `moc.reminders.days_before` from the Setting table.

    Stored as a list of ints, sorted descending. Defaults to
    DEFAULT_DAYS_BEFORE if unset.
    """
    from app.models.common import Setting

    row = (
        await db.execute(
            select(Setting).where(
                Setting.key == "moc.reminders.days_before",
                Setting.scope == "entity",
                Setting.scope_id == str(entity_id),
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return list(DEFAULT_DAYS_BEFORE)
    v = row.value
    if isinstance(v, dict):
        v = v.get("v", v)
    if not isinstance(v, list):
        return list(DEFAULT_DAYS_BEFORE)
    out: list[int] = []
    for item in v:
        try:
            n = int(item)
            if 0 < n <= 365:
                out.append(n)
        except (TypeError, ValueError):
            continue
    return out or list(DEFAULT_DAYS_BEFORE)


async def _dispatch_reminder(
    db, *, moc, days_remaining: int, threshold: int,
) -> int:
    """Send in-app + email reminder. Returns the number of recipients reached."""
    from app.api.deps import has_user_permission
    from app.core.email_templates import render_and_send_email
    from app.core.notifications import send_in_app_bulk
    from app.models.common import User
    from app.models.moc import MOCSiteAssignment

    # Build recipient list: site assignments first, permission scan otherwise
    users = (
        await db.execute(
            select(User).where(User.active == True)  # noqa: E712
        )
    ).scalars().all()

    site_user_ids: set[UUID] = set()
    rows = (
        await db.execute(
            select(MOCSiteAssignment.user_id).where(
                MOCSiteAssignment.entity_id == moc.entity_id,
                MOCSiteAssignment.site_label == moc.site_label,
                MOCSiteAssignment.role.in_(("site_chief", "director", "lead_process")),
                MOCSiteAssignment.active == True,  # noqa: E712
            )
        )
    ).all()
    site_user_ids = {r[0] for r in rows}

    recipients: list[User] = []
    if site_user_ids:
        recipients = [u for u in users if u.id in site_user_ids]
    else:
        for user in users:
            try:
                if await has_user_permission(
                    user, moc.entity_id, "moc.site_chief.approve", db,
                ):
                    recipients.append(user)
            except Exception:
                continue

    # Always include the initiator so they remember their own MOC is expiring
    initiator = await db.get(User, moc.initiator_id)
    if initiator and initiator not in recipients:
        recipients.append(initiator)

    if not recipients:
        return 0

    title = (
        f"MOC {moc.reference} — expiration dans {days_remaining} j"
        if days_remaining > 0
        else f"MOC {moc.reference} — expire aujourd'hui"
    )
    body = (
        f"Le MOC temporaire « {(moc.objectives or moc.description or moc.reference)[:120]} » "
        f"arrive à échéance le {moc.temporary_end_date.isoformat()}. "
        f"Seuil de rappel : J-{threshold}. Vérifiez que les modifications temporaires "
        f"ont bien été levées ou qu'une prolongation est en cours."
    )

    # In-app
    try:
        await send_in_app_bulk(
            db,
            user_ids=[u.id for u in recipients],
            entity_id=moc.entity_id,
            title=title,
            body=body,
            category="warning",
            link=f"/moc?id={moc.id}",
            event_type="moc.temporary_expiry_reminder",
        )
    except Exception:
        logger.exception("send_in_app_bulk failed for MOC %s", moc.reference)

    # Email
    origin = "https://app.opsflux.io"
    variables = {
        "reference": moc.reference,
        "objectives": (moc.objectives or moc.description or "")[:300],
        "site_label": moc.site_label,
        "platform_code": moc.platform_code,
        "end_date": moc.temporary_end_date.isoformat() if moc.temporary_end_date else "",
        "days_remaining": str(days_remaining),
        "threshold": str(threshold),
        "link": f"{origin}/moc?id={moc.id}",
    }
    for user in recipients:
        if not user.email:
            continue
        try:
            await render_and_send_email(
                db,
                slug="moc.temporary_expiry_reminder",
                entity_id=moc.entity_id,
                language=user.language or "fr",
                to=user.email,
                variables=variables,
                category="moc",
            )
        except Exception:
            logger.debug(
                "MOC expiry reminder email failed for %s (user=%s)",
                moc.reference, user.email, exc_info=True,
            )

    return len(recipients)
