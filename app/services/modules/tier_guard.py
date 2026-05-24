"""Shared guards for using third-party companies across business modules."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import StructuredHTTPException
from app.models.common import Tier, TierBlock, TierContact
from app.services.modules.compliance_service import check_owner_compliance


async def get_current_tier_block(
    db: AsyncSession,
    *,
    tier_id: UUID,
    entity_id: UUID,
    today: date | None = None,
) -> TierBlock | None:
    """Return the current active block for a tier, ignoring future/expired rows."""
    current_day = today or date.today()
    result = await db.execute(
        select(TierBlock)
        .where(
            TierBlock.tier_id == tier_id,
            TierBlock.entity_id == entity_id,
            TierBlock.action == "block",
            TierBlock.active == True,  # noqa: E712
            or_(TierBlock.start_date.is_(None), TierBlock.start_date <= current_day),
            or_(TierBlock.end_date.is_(None), TierBlock.end_date >= current_day),
        )
        .order_by(TierBlock.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def ensure_tier_usable(
    db: AsyncSession,
    tier: Tier | None,
    *,
    entity_id: UUID,
    operation: str,
    today: date | None = None,
    require_compliance: bool = False,
) -> None:
    if not tier or getattr(tier, "entity_id", entity_id) != entity_id:
        raise StructuredHTTPException(
            404,
            code="TIER_NOT_FOUND",
            message="Tier not found",
        )
    if getattr(tier, "archived", False) or not getattr(tier, "active", True):
        raise StructuredHTTPException(
            400,
            code="TIER_INACTIVE",
            message="Tier is archived or inactive",
        )

    block = await get_current_tier_block(db, tier_id=tier.id, entity_id=entity_id, today=today)
    if block is not None:
        raise StructuredHTTPException(
            409,
            code="TIER_BLOCKED",
            message=f"Tier is blocked for {operation}",
            params={
                "tier_id": str(tier.id),
                "operation": operation,
                "block_type": block.block_type,
                "reason": block.reason,
                "block_id": str(block.id),
            },
        )

    if require_compliance:
        verdict = await check_owner_compliance(
            db,
            owner_type="tier",
            owner_id=tier.id,
            entity_id=entity_id,
            include_contextual=True,
            commit_status_updates=False,
        )
        if not verdict.get("is_compliant", False):
            blocking_items = [
                item
                for item in verdict.get("details", [])
                if item.get("status") in {"missing", "expired", "unverified"}
            ]
            raise StructuredHTTPException(
                409,
                code="TIER_COMPLIANCE_BLOCKED",
                message=f"Tier is not compliant for {operation}",
                params={
                    "tier_id": str(tier.id),
                    "operation": operation,
                    "total_required": verdict.get("total_required", 0),
                    "total_valid": verdict.get("total_valid", 0),
                    "total_missing": verdict.get("total_missing", 0),
                    "total_expired": verdict.get("total_expired", 0),
                    "total_unverified": verdict.get("total_unverified", 0),
                    "blocking_items": [
                        {
                            "type_id": item.get("type_id") or item.get("compliance_type_id"),
                            "type_name": item.get("type_name"),
                            "category": item.get("category") or item.get("type_category"),
                            "status": item.get("status"),
                        }
                        for item in blocking_items[:10]
                    ],
                },
            )


async def ensure_tier_contact_usable(
    db: AsyncSession,
    contact: TierContact | None,
    *,
    entity_id: UUID,
    operation: str,
) -> Tier:
    if not contact or not getattr(contact, "active", True):
        raise StructuredHTTPException(
            400,
            code="CONTACT_INACTIVE",
            message="Tier contact is inactive",
        )

    tier = await db.get(Tier, contact.tier_id)
    await ensure_tier_usable(db, tier, entity_id=entity_id, operation=operation)
    return tier
