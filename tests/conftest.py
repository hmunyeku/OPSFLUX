"""Test configuration and fixtures."""

import asyncio
import os
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, patch

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


@pytest_asyncio.fixture
async def another_user(db_session, sample_entity):
    """A second User in the same tenant as sample_user, for delegation tests."""
    from uuid import uuid4

    from app.models.common import User

    user = User(
        email=f"anotheruser_{uuid4().hex[:8]}@opsflux.test",
        first_name="Another",
        last_name="User",
        default_entity_id=sample_entity.id,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def sample_group(db_session, sample_entity):
    """A UserGroup in sample_entity tenant for fixture wiring."""
    from app.models.common import UserGroup
    group = UserGroup(entity_id=sample_entity.id, name="Test Group", active=True)
    db_session.add(group)
    await db_session.flush()
    return group


@pytest_asyncio.fixture
async def third_user(db_session, sample_entity):
    """A third User in the same tenant for sub-delegation tests."""
    from uuid import uuid4

    from app.models.common import User
    user = User(
        email=f"thirduser_{uuid4().hex[:8]}@opsflux.test",
        first_name="Third",
        last_name="User",
        default_entity_id=sample_entity.id,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def user_with_asset_read(db_session, sample_user, sample_entity, sample_group):
    """sample_user wired with a role granting 'asset.asset.read'."""
    from sqlalchemy import select

    from app.models.common import (
        Permission,
        Role,
        RolePermission,
        UserGroupMember,
        UserGroupRole,
    )

    # Ensure ASSET_READER role exists
    role_result = await db_session.execute(select(Role).where(Role.code == "ASSET_READER"))
    role = role_result.scalar_one_or_none()
    if role is None:
        role = Role(code="ASSET_READER", name="Asset Reader", module="asset")
        db_session.add(role)

    # Ensure permission exists (may already exist from migration 171 seed)
    perm_result = await db_session.execute(select(Permission).where(Permission.code == "asset.asset.read"))
    perm = perm_result.scalar_one_or_none()
    if perm is None:
        perm = Permission(
            code="asset.asset.read", name="Read assets",
            namespace="asset", resource="asset", action="read",
            module="asset_registry",
        )
        db_session.add(perm)
    await db_session.flush()

    # Wire role → permission
    rp_result = await db_session.execute(
        select(RolePermission).where(
            RolePermission.role_code == "ASSET_READER",
            RolePermission.permission_code == "asset.asset.read",
        )
    )
    if rp_result.scalar_one_or_none() is None:
        db_session.add(RolePermission(role_code="ASSET_READER", permission_code="asset.asset.read"))

    # Wire group → role
    ugr_result = await db_session.execute(
        select(UserGroupRole).where(
            UserGroupRole.group_id == sample_group.id,
            UserGroupRole.role_code == "ASSET_READER",
        )
    )
    if ugr_result.scalar_one_or_none() is None:
        db_session.add(UserGroupRole(group_id=sample_group.id, role_code="ASSET_READER"))

    # Wire user → group
    ugm_result = await db_session.execute(
        select(UserGroupMember).where(
            UserGroupMember.user_id == sample_user.id,
            UserGroupMember.group_id == sample_group.id,
        )
    )
    if ugm_result.scalar_one_or_none() is None:
        db_session.add(UserGroupMember(user_id=sample_user.id, group_id=sample_group.id))

    await db_session.flush()
    return sample_user


@pytest.fixture
def mock_render_pdf():
    """Mock render_pdf at the rbac_delegation_service module level."""
    with patch("app.services.core.rbac_delegation_service.render_pdf", new_callable=AsyncMock) as m:
        m.return_value = b"%PDF-1.4 fake bytes for testing"
        yield m


@pytest.fixture
def mock_send_email():
    """Mock render_and_send_email at the rbac_delegation_service module level."""
    with patch("app.services.core.rbac_delegation_service.render_and_send_email", new_callable=AsyncMock) as m:
        m.return_value = {"sent": True}
        yield m


@pytest_asyncio.fixture
async def async_client(client):
    """Alias for the existing `client` fixture, named for new tests."""
    return client


# TODO: Replace with real auth fixture when auth flow is wired into tests.
# Current placeholder is sufficient since the test module is gated by pytestmark
# skipif RBAC_PR_A_MIGRATION_APPLIED != "1".
@pytest_asyncio.fixture
async def auth_headers_user_with_perms(user_with_asset_read, sample_entity):
    """Headers that authenticate as a user with asset.asset.read permission."""
    return {
        "X-Entity-ID": str(sample_entity.id),
        "X-Test-User-Id": str(user_with_asset_read.id),
    }


# TODO: Replace with real auth fixture when auth flow is wired into tests.
@pytest_asyncio.fixture
async def auth_headers_pax(another_user, sample_entity):
    """Headers for a user with no special perms (like a PAX role)."""
    return {
        "X-Entity-ID": str(sample_entity.id),
        "X-Test-User-Id": str(another_user.id),
    }


@pytest_asyncio.fixture
async def set_tenant_setting(db_session):
    """Factory fixture to set or update a tenant-scoped setting."""
    from sqlalchemy import select

    from app.models.common import Setting

    async def _set(entity_id, key, value):
        result = await db_session.execute(
            select(Setting).where(
                Setting.key == key,
                Setting.scope == "tenant",
                Setting.scope_id == str(entity_id),
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.value = value
        else:
            db_session.add(Setting(key=key, value=value, scope="tenant", scope_id=str(entity_id)))
        await db_session.flush()
    return _set
