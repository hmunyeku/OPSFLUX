"""Test new columns on Permission model (PR-A foundation)."""
import os

import pytest
from sqlalchemy import select
from app.models.common import Permission

# These tests require the columns added by migration 170 (PR-A phase 1).
# Until migration 170 is applied to the test DB, they will fail with UndefinedColumn.
pytestmark = pytest.mark.skipif(
    os.getenv("RBAC_PR_A_MIGRATION_APPLIED") != "1",
    reason="Awaits alembic migration 170 (PR-A Group 2). Set RBAC_PR_A_MIGRATION_APPLIED=1 once applied.",
)


@pytest.mark.asyncio
async def test_permission_has_new_columns(db_session):
    """New columns: namespace, resource, action, deprecated, deprecated_for, sensitive."""
    perm = Permission(
        code="test.thing.read",
        name="Test read",
        module="test",
        namespace="test",
        resource="thing",
        action="read",
        deprecated=False,
        deprecated_for=None,
        sensitive=False,
    )
    db_session.add(perm)
    await db_session.commit()

    result = await db_session.execute(select(Permission).where(Permission.code == "test.thing.read"))
    fetched = result.scalar_one()
    assert fetched.namespace == "test"
    assert fetched.resource == "thing"
    assert fetched.action == "read"
    assert fetched.deprecated is False
    assert fetched.sensitive is False


@pytest.mark.asyncio
async def test_entity_has_logo_url(db_session):
    """Entity.logo_url column for PDF branding."""
    from app.models.common import Entity
    entity = Entity(name="Test Tenant", logo_url="https://example.com/logo.png")
    db_session.add(entity)
    await db_session.commit()

    result = await db_session.execute(select(Entity).where(Entity.name == "Test Tenant"))
    fetched = result.scalar_one()
    assert fetched.logo_url == "https://example.com/logo.png"
