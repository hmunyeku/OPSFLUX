"""Global search route — powers the Command-K search bar."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user
from app.core.database import get_db
from app.models.asset_registry import Installation
from app.models.common import Tier, User
from app.schemas.common import SearchResult, SearchResponse

router = APIRouter(prefix="/api/v1", tags=["search"])

PER_TYPE_LIMIT = 5
DEFAULT_TOTAL_LIMIT = 20
MIN_QUERY_LENGTH = 2


@router.get("/search", response_model=SearchResponse)
async def global_search(
    q: str = Query(..., min_length=MIN_QUERY_LENGTH, description="Search query"),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Search across assets, tiers, and users.

    Returns results grouped by type: assets first, then tiers, then users.
    Maximum 5 results per type, 20 total.
    """
    pattern = f"%{q}%"
    results: list[SearchResult] = []

    # ── Assets ───────────────────────────────────────────────────────────
    asset_stmt = (
        select(Installation)
        .where(
            Installation.entity_id == entity_id,
            Installation.deleted_at.is_(None),
            or_(
                Installation.name.ilike(pattern),
                Installation.code.ilike(pattern),
            ),
        )
        .order_by(Installation.name)
        .limit(PER_TYPE_LIMIT)
    )
    asset_rows = await db.execute(asset_stmt)
    for asset in asset_rows.scalars().all():
        results.append(
            SearchResult(
                type="asset",
                id=asset.id,
                title=asset.name,
                subtitle=asset.code,
                url=f"/assets/{asset.id}",
            )
        )

    # ── Tiers ────────────────────────────────────────────────────────────
    tier_stmt = (
        select(Tier)
        .where(
            Tier.entity_id == entity_id,
            Tier.archived == False,
            or_(
                Tier.name.ilike(pattern),
                Tier.code.ilike(pattern),
            ),
        )
        .order_by(Tier.name)
        .limit(PER_TYPE_LIMIT)
    )
    tier_rows = await db.execute(tier_stmt)
    for tier in tier_rows.scalars().all():
        results.append(
            SearchResult(
                type="tier",
                id=tier.id,
                title=tier.name,
                subtitle=tier.code,
                url=f"/tiers/{tier.id}",
            )
        )

    # ── Users ────────────────────────────────────────────────────────────
    user_stmt = (
        select(User)
        .where(
            User.active == True,
            or_(
                User.first_name.ilike(pattern),
                User.last_name.ilike(pattern),
                User.email.ilike(pattern),
            ),
        )
        .order_by(User.last_name, User.first_name)
        .limit(PER_TYPE_LIMIT)
    )
    user_rows = await db.execute(user_stmt)
    for user in user_rows.scalars().all():
        results.append(
            SearchResult(
                type="user",
                id=user.id,
                title=f"{user.first_name} {user.last_name}",
                subtitle=user.email,
                url=f"/users/{user.id}",
            )
        )

    # Enforce total limit (assets -> tiers -> users ordering is preserved)
    return SearchResponse(results=results[:DEFAULT_TOTAL_LIMIT])
