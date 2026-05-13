"""Cron job: notify users of delegations expiring at J-3 and J0.

Runs daily at 08:00 UTC via APScheduler. For each `UserDelegation` whose
`end_date` falls inside the J-3 (~ 2.5..3.5 days ahead) or J0 (~ next 24h)
window, render the delegation certificate PDF and email both delegator and
delegate with `rbac.delegation.expired`, then write a `RbacAuditEvent`
(`delegation.expired` for J0, `delegation.expiring_soon` for J-3).
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email_templates import render_and_send_email
from app.core.pdf_templates import render_pdf
from app.models.common import RbacAuditEvent, User, UserDelegation
from app.services.core.rbac_delegation_service import _build_certificate_variables

logger = logging.getLogger(__name__)


async def notify_expiring_delegations(db: AsyncSession) -> int:
    """Find active delegations expiring in ~3 days or ~today.

    Sends `rbac.delegation.expired` email + certificate PDF attachment to
    both delegator and delegate. Creates an audit event per notification
    (`event_type=delegation.expired` for J0, `delegation.expiring_soon`
    for J-3). Returns the number of delegations notified.
    """
    now = datetime.now(timezone.utc)

    # J-3 window: end_date between now+2.5 days and now+3.5 days
    j3_low = now + timedelta(days=2, hours=12)
    j3_high = now + timedelta(days=3, hours=12)
    # J0 window: end_date between now and now+24h
    j0_low = now
    j0_high = now + timedelta(hours=24)

    stmt = select(UserDelegation).where(
        UserDelegation.active == True,  # noqa: E712
        or_(
            and_(UserDelegation.end_date >= j3_low, UserDelegation.end_date < j3_high),
            and_(UserDelegation.end_date >= j0_low, UserDelegation.end_date < j0_high),
        ),
    )
    result = await db.execute(stmt)
    delegations = result.scalars().all()

    notified = 0
    for delegation in delegations:
        try:
            delegator = await db.get(User, delegation.delegator_id)
            delegate = await db.get(User, delegation.delegate_id)
            if not delegator or not delegate:
                logger.warning(
                    "Delegation %s missing delegator or delegate, skipping",
                    delegation.id,
                )
                continue

            cert_vars = await _build_certificate_variables(
                db, delegation, delegator, delegate, delegation.entity_id
            )

            is_j0 = delegation.end_date <= j0_high
            cert_vars["expiry_phase"] = "j0" if is_j0 else "j3"

            cert_pdf = await render_pdf(
                db,
                slug="core.rbac.delegation_certificate",
                entity_id=delegation.entity_id,
                language=delegate.language or "fr",
                variables=cert_vars,
            )
            attachments = (
                [
                    {
                        "filename": "certificate.pdf",
                        "content": cert_pdf,
                        "mime_type": "application/pdf",
                    }
                ]
                if cert_pdf
                else []
            )

            for to_email, lang in [
                (delegator.email, delegator.language or "fr"),
                (delegate.email, delegate.language or "fr"),
            ]:
                sent = await render_and_send_email(
                    db,
                    slug="rbac.delegation.expired",
                    entity_id=delegation.entity_id,
                    language=lang,
                    to=to_email,
                    variables=cert_vars,
                    attachments=attachments,
                )
                if not sent:
                    logger.warning(
                        "Failed to send 'rbac.delegation.expired' for delegation %s to %s",
                        delegation.id,
                        to_email,
                    )

            audit = RbacAuditEvent(
                tenant_id=delegation.entity_id,
                event_type="delegation.expired" if is_j0 else "delegation.expiring_soon",
                target=str(delegation.id),
                params={"phase": "j0" if is_j0 else "j3"},
                actor_user_id=delegator.id,  # system action attributed to delegator
                status="success",
            )
            db.add(audit)
            notified += 1
        except Exception as e:
            logger.exception(
                "Failed to notify expiry for delegation %s: %s", delegation.id, e
            )

    await db.commit()
    return notified
