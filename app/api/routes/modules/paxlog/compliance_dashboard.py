"""PaxLog — Compliance dashboard data endpoints.

Extracted from the monolithic paxlog module. Routes register onto the shared
`router` instance defined in `paxlog/__init__.py`.

Two read endpoints feeding the compliance widgets on the home dashboard:
the expiring-credentials bucket list and the per-site stats summary.
"""

from __future__ import annotations

from datetime import date, timedelta
from uuid import UUID

from fastapi import Depends
from sqlalchemy import func, select, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_entity,
    get_current_user,
    require_permission,
)
from app.core.database import get_db
from app.models.common import Tier, TierContact, User
from app.models.paxlog import CredentialType, PaxCredential, PaxIncident

from . import router


def _expiring_alert_bucket(days_remaining: int) -> str:
    if days_remaining <= 0:
        return "j0"
    if days_remaining <= 7:
        return "j7"
    if days_remaining <= 30:
        return "j30"
    return "future"


@router.get("/compliance/expiring")
async def get_expiring_credentials(
    days_ahead: int = 30,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.compliance.read"),
    db: AsyncSession = Depends(get_db),
):
    """Get PAX credentials expiring within N days. Used by dashboard widget."""
    today = date.today()
    cutoff = today + timedelta(days=days_ahead)

    user_creds = await db.execute(
        select(
            PaxCredential.id,
            PaxCredential.user_id,
            PaxCredential.credential_type_id,
            PaxCredential.expiry_date,
            PaxCredential.status,
            User.first_name,
            User.last_name,
            User.badge_number,
            CredentialType.code.label("cred_code"),
            CredentialType.name.label("cred_name"),
        )
        .join(User, User.id == PaxCredential.user_id)
        .join(CredentialType, CredentialType.id == PaxCredential.credential_type_id)
        .where(
            User.default_entity_id == entity_id,
            PaxCredential.user_id.isnot(None),
            PaxCredential.expiry_date.isnot(None),
            PaxCredential.expiry_date <= cutoff,
            PaxCredential.expiry_date >= today,
            PaxCredential.status == "valid",
        )
        .order_by(PaxCredential.expiry_date)
    )
    contact_creds = await db.execute(
        select(
            PaxCredential.id,
            PaxCredential.contact_id,
            PaxCredential.credential_type_id,
            PaxCredential.expiry_date,
            PaxCredential.status,
            TierContact.first_name,
            TierContact.last_name,
            TierContact.badge_number,
            CredentialType.code.label("cred_code"),
            CredentialType.name.label("cred_name"),
        )
        .join(TierContact, TierContact.id == PaxCredential.contact_id)
        .join(Tier, Tier.id == TierContact.tier_id)
        .join(CredentialType, CredentialType.id == PaxCredential.credential_type_id)
        .where(
            Tier.entity_id == entity_id,
            PaxCredential.contact_id.isnot(None),
            PaxCredential.expiry_date.isnot(None),
            PaxCredential.expiry_date <= cutoff,
            PaxCredential.expiry_date >= today,
            PaxCredential.status == "valid",
        )
        .order_by(PaxCredential.expiry_date)
    )

    items = []
    for r in user_creds.all():
        days_remaining = (r[3] - today).days
        items.append({
            "credential_id": str(r[0]),
            "user_id": str(r[1]),
            "contact_id": None,
            "pax_source": "user",
            "credential_type_id": str(r[2]),
            "expiry_date": str(r[3]),
            "status": r[4],
            "pax_first_name": r[5],
            "pax_last_name": r[6],
            "pax_badge": r[7],
            "credential_code": r[8],
            "credential_name": r[9],
            "days_remaining": days_remaining,
            "alert_bucket": _expiring_alert_bucket(days_remaining),
        })
    for r in contact_creds.all():
        days_remaining = (r[3] - today).days
        items.append({
            "credential_id": str(r[0]),
            "user_id": None,
            "contact_id": str(r[1]),
            "pax_source": "contact",
            "credential_type_id": str(r[2]),
            "expiry_date": str(r[3]),
            "status": r[4],
            "pax_first_name": r[5],
            "pax_last_name": r[6],
            "pax_badge": r[7],
            "credential_code": r[8],
            "credential_name": r[9],
            "days_remaining": days_remaining,
            "alert_bucket": _expiring_alert_bucket(days_remaining),
        })

    items.sort(key=lambda x: x["expiry_date"])
    return items


@router.get("/compliance/stats")
async def get_compliance_stats(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.compliance.read"),
    db: AsyncSession = Depends(get_db),
):
    """Get compliance statistics per site. Used by dashboard widget."""
    today = date.today()

    user_count = await db.execute(
        select(func.count(User.id))
        .where(User.default_entity_id == entity_id, User.active == True)  # noqa: E712
    )
    contact_count = await db.execute(
        select(func.count(TierContact.id))
        .join(Tier, Tier.id == TierContact.tier_id)
        .where(Tier.entity_id == entity_id, TierContact.active == True)  # noqa: E712
    )
    total_pax_value = (user_count.scalar() or 0) + (contact_count.scalar() or 0)

    expired_count = await db.execute(
        select(func.count(PaxCredential.id))
        .where(
            PaxCredential.expiry_date < today,
            PaxCredential.status == "valid",
        )
    )

    pending_count = await db.execute(
        select(func.count(PaxCredential.id))
        .where(PaxCredential.status == "pending_validation")
    )

    active_incidents = await db.execute(
        select(func.count(PaxIncident.id)).where(
            PaxIncident.entity_id == entity_id,
            PaxIncident.resolved_at == None,  # noqa: E711
        )
    )

    site_stats = await db.execute(
        sa_text(
            """
            SELECT a.site_entry_asset_id, ast.name AS site_name,
                   COUNT(DISTINCT a.id) AS ads_count,
                   COUNT(DISTINCT ap.id) AS pax_count,
                   COUNT(DISTINCT CASE WHEN ap.status = 'blocked' THEN ap.id END) AS blocked_count
            FROM ads a
            JOIN ads_pax ap ON ap.ads_id = a.id
            LEFT JOIN ar_installations ast ON ast.id = a.site_entry_asset_id
            WHERE a.entity_id = :eid
              AND a.status IN ('submitted', 'pending_validation', 'approved', 'in_progress')
              AND a.archived = false
            GROUP BY a.site_entry_asset_id, ast.name
            ORDER BY ads_count DESC
            LIMIT 10
            """
        ),
        {"eid": str(entity_id)},
    )
    sites = site_stats.all()

    return {
        "total_active_pax": total_pax_value,
        "expired_credentials": expired_count.scalar() or 0,
        "pending_validations": pending_count.scalar() or 0,
        "active_incidents": active_incidents.scalar() or 0,
        "site_stats": [
            {
                "site_asset_id": str(s[0]),
                "site_name": s[1] or "N/A",
                "ads_count": s[2],
                "pax_count": s[3],
                "blocked_count": s[4],
            }
            for s in sites
        ],
    }
