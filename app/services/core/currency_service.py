"""Currency conversion service — historical rates by date.

Lookup strategy: pick the most recent CurrencyRate where
`effective_date <= on_date` for the (entity, from, to) tuple. If the
inverse pair exists but the requested direction does not, the inverse
rate is used (1/rate). Same-currency conversions return the input.

Design rationale: financial figures (cost rebill, accruals,
intercompany invoices) MUST be reproducible at the original operation
date — never at "today's rate". So every rate ever applied is kept and
addressed by date.
"""

from __future__ import annotations

from datetime import date as date_type
from uuid import UUID

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.common import CurrencyRate, Entity


class RateNotFoundError(Exception):
    """No currency rate available for (entity, from, to) at on_date."""


async def get_entity_currency(db: AsyncSession, entity_id: UUID) -> str:
    """Return the entity's default currency (used as fallback for new records)."""
    result = await db.execute(select(Entity.currency).where(Entity.id == entity_id))
    currency = result.scalar_one_or_none()
    return currency or "EUR"


async def get_rate(
    db: AsyncSession,
    entity_id: UUID,
    from_currency: str,
    to_currency: str,
    on_date: date_type,
) -> float:
    """Lookup the most recent rate ≤ on_date. Falls back to inverse if needed."""
    if from_currency == to_currency:
        return 1.0

    # Direct lookup
    direct = await db.execute(
        select(CurrencyRate.rate)
        .where(
            CurrencyRate.entity_id == entity_id,
            CurrencyRate.from_currency == from_currency,
            CurrencyRate.to_currency == to_currency,
            CurrencyRate.effective_date <= on_date,
        )
        .order_by(desc(CurrencyRate.effective_date))
        .limit(1)
    )
    rate = direct.scalar_one_or_none()
    if rate is not None:
        return float(rate)

    # Inverse fallback
    inverse = await db.execute(
        select(CurrencyRate.rate)
        .where(
            CurrencyRate.entity_id == entity_id,
            CurrencyRate.from_currency == to_currency,
            CurrencyRate.to_currency == from_currency,
            CurrencyRate.effective_date <= on_date,
        )
        .order_by(desc(CurrencyRate.effective_date))
        .limit(1)
    )
    inv = inverse.scalar_one_or_none()
    if inv is not None and inv != 0:
        return 1.0 / float(inv)

    raise RateNotFoundError(
        f"No rate {from_currency}->{to_currency} for entity {entity_id} at {on_date}"
    )


async def convert(
    db: AsyncSession,
    entity_id: UUID,
    amount: float,
    from_currency: str,
    to_currency: str,
    on_date: date_type,
) -> float:
    """Convert amount using the historical rate at on_date."""
    rate = await get_rate(db, entity_id, from_currency, to_currency, on_date)
    return amount * rate
