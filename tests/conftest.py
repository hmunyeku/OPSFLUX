"""Test configuration and fixtures."""

import asyncio
import os
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import get_db
from app.main import app
from app.models.base import Base


def _get_test_database_url() -> str:
    url = os.getenv("TEST_DATABASE_URL", "").strip()
    if not url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    lowered = url.lower()
    if "test" not in lowered:
        raise RuntimeError("Unsafe TEST_DATABASE_URL: database name must clearly target a test database")
    return url


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(_get_test_database_url(), echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def sample_entity(db_session: AsyncSession):
    """An Entity row suitable for tests that need a tenant scope.

    Uses a UUID-suffixed code to avoid collisions across tests sharing the schema.
    """
    from uuid import uuid4

    from app.models.common import Entity

    suffix = uuid4().hex[:8]
    entity = Entity(
        code=f"TEST_TENANT_{suffix}",
        name="Test Tenant",
    )
    db_session.add(entity)
    await db_session.flush()
    return entity


@pytest_asyncio.fixture
async def sample_user(db_session: AsyncSession, sample_entity):
    """A User row linked to sample_entity."""
    from uuid import uuid4

    from app.models.common import User

    suffix = uuid4().hex[:8]
    user = User(
        email=f"testuser_{suffix}@opsflux.test",
        first_name="Test",
        last_name="User",
        default_entity_id=sample_entity.id,
    )
    db_session.add(user)
    await db_session.flush()
    return user
