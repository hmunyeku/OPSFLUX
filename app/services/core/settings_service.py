"""Helpers for scoped settings reads/writes with legacy-constraint compatibility."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.common import Setting


async def get_scoped_setting_row(
    db: AsyncSession,
    *,
    key: str,
    scope: str,
    scope_id: str | None,
    include_legacy_fallback: bool = False,
) -> Setting | None:
    """Return the best matching setting row for the given scope."""

    query = select(Setting).where(Setting.key == key, Setting.scope == scope)
    if scope_id is None:
        result = await db.execute(query.where(Setting.scope_id.is_(None)))
    else:
        result = await db.execute(query.where(Setting.scope_id == scope_id))
    exact_match = result.scalar_one_or_none()
    if exact_match is not None or not include_legacy_fallback:
        return exact_match

    result = await db.execute(query)
    candidates = result.scalars().all()
    if not candidates:
        return None

    blank_match = next((row for row in candidates if row.scope_id in (None, "")), None)
    return blank_match or candidates[0]


async def upsert_scoped_setting(
    db: AsyncSession,
    *,
    key: str,
    value: dict[str, Any],
    scope: str,
    scope_id: str | None,
) -> Setting:
    """Upsert a setting while tolerating legacy UNIQUE(key, scope) databases."""

    existing = await get_scoped_setting_row(
        db,
        key=key,
        scope=scope,
        scope_id=scope_id,
        include_legacy_fallback=True,
    )
    if existing is None:
        existing = Setting(key=key, value=value, scope=scope, scope_id=scope_id)
        db.add(existing)
    else:
        existing.value = value
        existing.scope_id = scope_id

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if "uq_settings_key_scope" not in str(exc):
            raise
        existing = await get_scoped_setting_row(
            db,
            key=key,
            scope=scope,
            scope_id=scope_id,
            include_legacy_fallback=True,
        )
        if existing is None:
            raise
        existing.value = value
        existing.scope_id = scope_id
        await db.commit()

    return existing
