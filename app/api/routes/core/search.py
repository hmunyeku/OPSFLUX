"""Global search route — powers the Command-K search bar."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, has_user_permission
from app.core.database import get_db
from app.models.asset_registry import Installation
from app.models.common import Tier, User, UserGroup, UserGroupMember
from app.schemas.common import SearchResult, SearchResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["search"])

PER_TYPE_LIMIT = 5
DEFAULT_TOTAL_LIMIT = 20
MIN_QUERY_LENGTH = 2


def _user_access_predicate(entity_id: UUID):
    membership_exists = (
        select(UserGroupMember.user_id)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .where(
            UserGroupMember.user_id == User.id,
            UserGroup.entity_id == entity_id,
            UserGroup.active == True,  # noqa: E712
        )
        .exists()
    )
    return (User.default_entity_id == entity_id) | membership_exists


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
    try:
        can_read_assets = await has_user_permission(current_user, entity_id, "asset.read", db)
        can_read_tiers = await has_user_permission(current_user, entity_id, "tier.read", db)
        can_read_users = (
            await has_user_permission(current_user, entity_id, "user.read", db)
            or await has_user_permission(current_user, entity_id, "core.users.read", db)
        )
    except Exception:
        logger.exception("search: permission check failed")
        # Fail closed — no permission = no results rather than 500.
        return SearchResponse(results=[])

    # ── Assets ───────────────────────────────────────────────────────────
    # Each section is isolated in its own try/except so one broken
    # table doesn't cause the whole search to 500. An empty result
    # section is preferable to a hard failure.
    if can_read_assets:
        try:
            asset_stmt = (
                select(Installation)
                .where(
                    Installation.entity_id == entity_id,
                    Installation.archived == False,
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
                        id=str(asset.id),
                        title=asset.name,
                        subtitle=asset.code,
                        url=f"/assets/{asset.id}",
                    )
                )
        except Exception:
            logger.exception("search: assets section failed")

    # ── Tiers ────────────────────────────────────────────────────────────
    if can_read_tiers:
        try:
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
                        id=str(tier.id),
                        title=tier.name,
                        subtitle=tier.code,
                        url=f"/tiers/{tier.id}",
                    )
                )
        except Exception:
            logger.exception("search: tiers section failed")

    # ── Users ────────────────────────────────────────────────────────────
    if can_read_users:
        try:
            user_stmt = (
                select(User)
                .where(
                    User.active == True,
                    _user_access_predicate(entity_id),
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
                        id=str(user.id),
                        title=f"{user.first_name} {user.last_name}".strip() or user.email,
                        subtitle=user.email,
                        url=f"/users/{user.id}",
                    )
                )
        except Exception:
            logger.exception("search: users section failed")

    # Enforce total limit (assets -> tiers -> users ordering is preserved)
    return SearchResponse(results=results[:DEFAULT_TOTAL_LIMIT])
