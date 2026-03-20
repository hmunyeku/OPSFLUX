"""AsyncSession factory and get_db dependency for FastAPI."""

import logging
from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.tenant_context import get_tenant_schema

logger = logging.getLogger(__name__)

engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=settings.DATABASE_POOL_SIZE,
    max_overflow=settings.DATABASE_MAX_OVERFLOW,
    echo=settings.is_dev,
    pool_pre_ping=True,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a tenant-scoped async DB session.

    Reads the tenant schema from the ContextVar set by TenantSchemaMiddleware
    and executes SET search_path before yielding the session.
    """
    async with async_session_factory() as session:
        try:
            schema = get_tenant_schema()
            # schema was validated by isidentifier() in the middleware
            await session.execute(text(f"SET search_path TO {schema}, public"))
            yield session
        finally:
            await session.close()


async def init_db() -> None:
    """Initialize DB connection pool (called at startup)."""
    # Pool is created lazily by SQLAlchemy; this ensures connectivity
    async with engine.begin() as conn:
        await conn.execute(
            __import__("sqlalchemy").text("SELECT 1")
        )


async def close_db() -> None:
    """Dispose engine connection pool (called at shutdown)."""
    await engine.dispose()
