"""Scheduled job — check compliance record expiry and send renewal reminders.

Runs daily at 06:00. Three passes:
1. Auto-expire: records where expires_at < now() and status='valid' → set status='expired'
2. Renewal reminders: records expiring within X days (per rule's renewal_reminder_days)
3. Grace period warnings: records expired within grace_period_days

Emits events for each transition, triggering notifications.
"""

import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select, update, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.core.events import emit_event

logger = logging.getLogger(__name__)


async def check_compliance_expiry() -> None:
    """Main scheduled job — expire records, send reminders."""
    logger.info("compliance_expiry: starting run")

    try:
        async with async_session_factory() as db:
            now = datetime.now(timezone.utc)

            # ── Pass 1: Auto-expire overdue records ──
            expired_count = await _expire_overdue_records(db, now)

            # ── Pass 2: Renewal reminders (expiring soon) ──
            reminder_count = await _send_renewal_reminders(db, now)
            audit_expired_count = await _expire_overdue_audits(db, now.date())
            audit_reminder_count = await _send_audit_renewal_reminders(db, now.date())

            # ── Pass 3: Grace period warnings ──
            grace_count = await _check_grace_periods(db, now)

            await db.commit()

            logger.info(
                "compliance_expiry: done - %d records expired, %d record reminders, %d audits expired, %d audit reminders, %d grace warnings",
                expired_count, reminder_count, audit_expired_count, audit_reminder_count, grace_count,
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
        await emit_event("conformite.record.expired", {
            "record_id": str(rec.id),
            "compliance_type_id": str(rec.compliance_type_id),
            "owner_type": rec.owner_type,
            "owner_id": str(rec.owner_id) if rec.owner_id else None,
            "entity_id": str(rec.entity_id),
            "expired_at": str(rec.expires_at),
        })

    await db.flush()
    return len(records)


async def _send_renewal_reminders(db: AsyncSession, now: datetime) -> int:
    """Send reminders for records expiring within renewal_reminder_days."""
    from app.models.common import ComplianceRecord, ComplianceRule, ComplianceType

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
            await emit_event("conformite.record.expiring_soon", {
                "record_id": str(rec.id),
                "compliance_type_id": str(rec.compliance_type_id),
                "owner_type": rec.owner_type,
                "owner_id": str(rec.owner_id) if rec.owner_id else None,
                "entity_id": str(rec.entity_id),
                "expires_at": str(rec.expires_at),
                "days_remaining": days_until,
                "rule_id": str(rule.id),
            })
            reminder_count += 1

    return reminder_count


def _split_rule_values(value: str | None) -> set[str]:
    return {item.strip() for item in str(value or "").split(",") if item.strip()}


async def _audit_rule_applies(db: AsyncSession, rule, audit) -> bool:
    """Return whether an audit reminder rule applies to an audit target."""
    condition = rule.condition_json or {}
    if str(condition.get("audit_template_id") or "") != str(audit.template_id):
        return False
    if rule.subject_scope not in {"company", "all"}:
        return False
    if rule.target_type == "all":
        return True

    values = _split_rule_values(rule.target_value)
    wildcard = not values or bool(values & {"*", "all"})

    if audit.target_type != "tier":
        return rule.target_type == audit.target_type and (wildcard or str(audit.target_id) in values)

    if rule.target_type == "tier":
        return str(audit.target_id) in values

    if rule.target_type not in {"tier_type", "tier_country", "tier_industry", "tier_tag"}:
        return False

    from app.models.common import Tag, Tier

    tier = await db.get(Tier, audit.target_id)
    if not tier:
        return False

    if rule.target_type == "tier_type":
        return wildcard or (bool(tier.type) and tier.type in values)
    if rule.target_type == "tier_country":
        return wildcard or (bool(tier.country) and tier.country in values)
    if rule.target_type == "tier_industry":
        return wildcard or (bool(tier.industry) and tier.industry in values)

    tag_rows = await db.execute(
        select(Tag.name).where(
            Tag.owner_type == "tier",
            Tag.owner_id == audit.target_id,
        )
    )
    tag_names = {name.lower() for name in tag_rows.scalars().all() if name}
    return wildcard or bool({value.lower() for value in values} & tag_names)


async def _expire_overdue_audits(db: AsyncSession, today: date) -> int:
    """Set status='expired' for validated supplier audits past valid_until."""
    from app.models.common import ComplianceAudit

    result = await db.execute(
        select(ComplianceAudit).where(
            ComplianceAudit.active == True,
            ComplianceAudit.status == "validated",
            ComplianceAudit.valid_until != None,
            ComplianceAudit.valid_until < today,
        )
    )
    audits = result.scalars().all()

    for audit in audits:
        audit.status = "expired"
        await emit_event("conformite.audit.expired", {
            "audit_id": str(audit.id),
            "template_id": str(audit.template_id),
            "target_type": audit.target_type,
            "target_id": str(audit.target_id),
            "entity_id": str(audit.entity_id),
            "expired_at": audit.valid_until.isoformat() if audit.valid_until else None,
        })

    await db.flush()
    return len(audits)


async def _send_audit_renewal_reminders(db: AsyncSession, today: date) -> int:
    """Send reminders for validated supplier audits governed by audit rules."""
    from app.models.common import ComplianceAudit, ComplianceRule

    rules_result = await db.execute(
        select(ComplianceRule).where(
            ComplianceRule.active == True,
            ComplianceRule.renewal_reminder_days != None,
            ComplianceRule.renewal_reminder_days > 0,
            ComplianceRule.condition_json != None,
        )
    )
    rules = [
        rule for rule in rules_result.scalars().all()
        if isinstance(rule.condition_json, dict) and rule.condition_json.get("audit_template_id")
    ]
    if not rules:
        return 0

    max_window = max(int(rule.renewal_reminder_days or 0) for rule in rules)
    audits_result = await db.execute(
        select(ComplianceAudit).where(
            ComplianceAudit.active == True,
            ComplianceAudit.status == "validated",
            ComplianceAudit.valid_until != None,
            ComplianceAudit.valid_until >= today,
            ComplianceAudit.valid_until <= today + timedelta(days=max_window),
        )
    )
    audits = audits_result.scalars().all()

    reminder_count = 0
    for audit in audits:
        days_until = (audit.valid_until - today).days if audit.valid_until else 0
        for rule in rules:
            if days_until > int(rule.renewal_reminder_days or 0):
                continue
            if not await _audit_rule_applies(db, rule, audit):
                continue
            await emit_event("conformite.audit.expiring_soon", {
                "audit_id": str(audit.id),
                "template_id": str(audit.template_id),
                "target_type": audit.target_type,
                "target_id": str(audit.target_id),
                "entity_id": str(audit.entity_id),
                "valid_until": audit.valid_until.isoformat() if audit.valid_until else None,
                "days_remaining": days_until,
                "rule_id": str(rule.id),
            })
            reminder_count += 1
            break

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
            await emit_event("conformite.record.past_grace", {
                "record_id": str(rec.id),
                "compliance_type_id": str(rec.compliance_type_id),
                "owner_type": rec.owner_type,
                "owner_id": str(rec.owner_id) if rec.owner_id else None,
                "entity_id": str(rec.entity_id),
                "expired_at": str(rec.expires_at),
                "grace_days": rule.grace_period_days,
            })
            grace_count += 1

    return grace_count
