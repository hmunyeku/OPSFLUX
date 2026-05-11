"""Pagination utilities for API responses.

The maximum allowed ``page_size`` is admin-configurable via the
``datatable.max_page_size`` setting (tenant scope). Default is 10 000.
Set to a higher value if your tenant needs to load >10k entries in a
single dropdown (rare — prefer server-side typeahead instead).

History: a previous version had ``le=1000`` hardcoded on the Query
constraint. Bastien (SUP-0038 followup, 2026-05-11) hit the silent
truncation when >500 tiers were defined and the frontend hardcoded
``page_size=500`` everywhere. The hardcoded ceiling has been removed
from the request validator and moved into ``paginate()`` so it can be
overridden at runtime by the admin setting without restarting.
"""

import inspect
from typing import Any, Generic, TypeVar

from fastapi import HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")

# Default ceiling when the ``datatable.max_page_size`` setting is absent.
# Generous (10 000) so that day-to-day work isn't silently truncated, but
# bounded to prevent DoS (a single query loading 1M rows would be costly).
DEFAULT_MAX_PAGE_SIZE = 10_000

# In-memory cache for the resolved max page size — settings rarely change
# and reading them on every paginated request would be costly. Invalidated
# by the settings update endpoint (see invalidate_max_page_size_cache()).
_MAX_PAGE_SIZE_CACHE: dict[str, int] = {}


async def _resolve_max_page_size(db: AsyncSession) -> int:
    """Read the admin-configured max page size (cached)."""
    cached = _MAX_PAGE_SIZE_CACHE.get("value")
    if cached is not None:
        return cached
    # Lazy import to avoid circular dep (Setting -> Base -> pagination).
    from app.models.common import Setting
    result = await db.execute(
        select(Setting).where(
            Setting.key == "datatable.max_page_size",
            Setting.scope == "tenant",
        )
    )
    setting = result.scalar_one_or_none()
    if setting and isinstance(setting.value, dict):
        raw = setting.value.get("value", DEFAULT_MAX_PAGE_SIZE)
    elif setting and isinstance(setting.value, int):
        raw = setting.value
    else:
        raw = DEFAULT_MAX_PAGE_SIZE
    try:
        value = max(1, int(raw))
    except (TypeError, ValueError):
        value = DEFAULT_MAX_PAGE_SIZE
    _MAX_PAGE_SIZE_CACHE["value"] = value
    return value


def invalidate_max_page_size_cache() -> None:
    """Drop the cached value — call after a tenant updates the setting."""
    _MAX_PAGE_SIZE_CACHE.clear()


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


class PaginationParams:
    def __init__(
        self,
        page: int = Query(1, ge=1, description="Page number"),
        page_size: int = Query(
            25,
            ge=1,
            description=(
                "Items per page. Upper bound is admin-configurable via the "
                "'datatable.max_page_size' setting (default 10000); requests "
                "above the ceiling are rejected with HTTP 400."
            ),
        ),
    ):
        self.page = page
        self.page_size = page_size
        self.offset = (page - 1) * page_size


async def paginate(
    db: AsyncSession,
    query: Select,
    params: PaginationParams,
    response_model: type | None = None,
    transform: Any | None = None,
) -> dict[str, Any]:
    """Execute a paginated query and return structured response.

    Args:
        transform: Optional callable ``(row) -> dict`` for queries that select
            multiple columns (e.g. ``select(Model, count_col)``). When provided
            rows are fetched with ``.all()`` instead of ``.scalars().all()`` and
            each row is passed through the transform.

    Raises:
        HTTPException(400): if ``params.page_size`` exceeds the admin-configured
            ceiling (``datatable.max_page_size`` setting, default 10 000). The
            validator is here rather than on the Query() constraint so it can be
            overridden at runtime by the tenant admin without restart.
    """
    # Enforce the admin-configurable upper bound for page_size.
    max_size = await _resolve_max_page_size(db)
    if params.page_size > max_size:
        raise HTTPException(
            status_code=400,
            detail=(
                f"page_size={params.page_size} exceeds the admin-configured "
                f"maximum of {max_size}. Adjust the 'datatable.max_page_size' "
                "setting in admin → Paramètres if you need a higher limit."
            ),
        )

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Fetch page
    paginated_query = query.offset(params.offset).limit(params.page_size)
    result = await db.execute(paginated_query)

    if transform is not None:
        rows = result.all()
        items = []
        for row in rows:
            item = transform(row)
            if inspect.isawaitable(item):
                item = await item
            items.append(item)
    else:
        items = result.scalars().all()

    pages = (total + params.page_size - 1) // params.page_size if total > 0 else 0

    return {
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
        "pages": pages,
    }
