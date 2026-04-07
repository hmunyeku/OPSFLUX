"""Pagination utilities for API responses."""

import inspect
from typing import Any, Generic, TypeVar

from fastapi import Query
from pydantic import BaseModel
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")


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
        page_size: int = Query(25, ge=1, le=1000, description="Items per page (max controlled by admin setting datatable.max_page_size)"),
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
    """
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
