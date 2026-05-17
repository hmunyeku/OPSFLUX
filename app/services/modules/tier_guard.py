"""Shared guards for using third-party companies across business modules."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import StructuredHTTPException
from app.models.common import Tier, TierBlock, TierContact


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
