"""Scheduled job — check compliance record expiry and send renewal reminders.

Runs daily at 06:00. Three passes:
1. Auto-expire: records where expires_at < now() and status='valid' → set status='expired'
2. Renewal reminders: records expiring within X days (per rule's renewal_reminder_days)
3. Grace period warnings: records expired within grace_period_days

Emits events for each transition, triggering notifications.
"""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.core.events import emit_event

logger = logging.getLogger(__name__)


async def check_compliance_expiry() -> None:
    """Main scheduled job — expire records, send reminders."""
    logger.info("compliance_expiry: starting run")

    try:
        async with async_session_factory() as db:
            now = datetime.now(UTC)

            # ── Pass 1: Auto-expire overdue records ──
            expired_count = await _expire_overdue_records(db, now)

            # ── Pass 2: Renewal reminders (expiring soon) ──
            reminder_count = await _send_renewal_reminders(db, now)

            # ── Pass 3: Grace period warnings ──
            grace_count = await _check_grace_periods(db, now)

            await db.commit()

            logger.info(
                "compliance_expiry: done — %d expired, %d reminders, %d grace warnings",
                expired_count,
                reminder_count,
                grace_count,
            )

    except Exception:
        logger.exception("compliance_expiry: failed")


async def _expire_overdue_records(db: AsyncSession, now: datetime) -> int:
    """Set status='expired' for all valid records past their expires_at."""
    from app.models.common import ComplianceRecord

    result = await db.execute(
        select(ComplianceRecord).where(
            ComplianceRecord.active == True,
            ComplianceRecord.status == "valid",
            ComplianceRecord.expires_at != None,
            ComplianceRecord.expires_at < now,
        )
    )
    records = result.scalars().all()

    for rec in records:
        rec.status = "expired"
        await emit_event(
            "conformite.record.expired",
            {
                "record_id": str(rec.id),
                "compliance_type_id": str(rec.compliance_type_id),
                "owner_type": rec.owner_type,
                "owner_id": str(rec.owner_id) if rec.owner_id else None,
                "entity_id": str(rec.entity_id),
                "expired_at": str(rec.expires_at),
            },
        )

    await db.flush()
    return len(records)


async def _send_renewal_reminders(db: AsyncSession, now: datetime) -> int:
    """Send reminders for records expiring within renewal_reminder_days."""
    from app.models.common import ComplianceRecord, ComplianceRule

    # Get rules with renewal_reminder_days set
    rules_result = await db.execute(
        select(ComplianceRule).where(
            ComplianceRule.active == True,
            ComplianceRule.renewal_reminder_days != None,
            ComplianceRule.renewal_reminder_days > 0,
        )
    )
    rules_with_reminders = rules_result.scalars().all()

    if not rules_with_reminders:
        return 0

    reminder_count = 0

    for rule in rules_with_reminders:
        reminder_window = now + timedelta(days=rule.renewal_reminder_days)

        # Find valid records for this type that expire within the reminder window
        records_result = await db.execute(
            select(ComplianceRecord).where(
                ComplianceRecord.active == True,
                ComplianceRecord.status == "valid",
                ComplianceRecord.compliance_type_id == rule.compliance_type_id,
                ComplianceRecord.expires_at != None,
                ComplianceRecord.expires_at > now,
                ComplianceRecord.expires_at <= reminder_window,
            )
        )
        expiring_records = records_result.scalars().all()

        for rec in expiring_records:
            days_until = (rec.expires_at - now).days
            await emit_event(
                "conformite.record.expiring_soon",
                {
                    "record_id": str(rec.id),
                    "compliance_type_id": str(rec.compliance_type_id),
                    "owner_type": rec.owner_type,
                    "owner_id": str(rec.owner_id) if rec.owner_id else None,
                    "entity_id": str(rec.entity_id),
                    "expires_at": str(rec.expires_at),
                    "days_remaining": days_until,
                    "rule_id": str(rule.id),
                },
            )
            reminder_count += 1

    return reminder_count


async def _check_grace_periods(db: AsyncSession, now: datetime) -> int:
    """Warn about records that have passed their grace period."""
    from app.models.common import ComplianceRecord, ComplianceRule

    # Get rules with grace_period_days set
    rules_result = await db.execute(
        select(ComplianceRule).where(
            ComplianceRule.active == True,
            ComplianceRule.grace_period_days != None,
            ComplianceRule.grace_period_days > 0,
        )
    )
    rules_with_grace = rules_result.scalars().all()

    if not rules_with_grace:
        return 0

    grace_count = 0

    for rule in rules_with_grace:
        grace_cutoff = now - timedelta(days=rule.grace_period_days)

        # Find expired records for this type that are past the grace period
        records_result = await db.execute(
            select(ComplianceRecord).where(
                ComplianceRecord.active == True,
                ComplianceRecord.status == "expired",
                ComplianceRecord.compliance_type_id == rule.compliance_type_id,
                ComplianceRecord.expires_at != None,
                ComplianceRecord.expires_at < grace_cutoff,
            )
        )
        past_grace_records = records_result.scalars().all()

        for rec in past_grace_records:
            await emit_event(
                "conformite.record.past_grace",
                {
                    "record_id": str(rec.id),
                    "compliance_type_id": str(rec.compliance_type_id),
                    "owner_type": rec.owner_type,
                    "owner_id": str(rec.owner_id) if rec.owner_id else None,
                    "entity_id": str(rec.entity_id),
                    "expired_at": str(rec.expires_at),
                    "grace_days": rule.grace_period_days,
                },
            )
            grace_count += 1

    return grace_count
