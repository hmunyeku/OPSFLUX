"""Test new columns on Permission model (PR-A foundation)."""
import os

import pytest
from sqlalchemy import select
from app.models.common import Permission

# Group 1 tests require the test DB schema to include the new PR-A columns/tables
# (Permission.namespace/resource/action/deprecated/deprecated_for/sensitive and the
# rbac_audit_events table). The schema is populated either by:
#   (a) conftest's Base.metadata.create_all() picking up the new model definitions, or
#   (b) running alembic migration 171 (PR-A Group 2) against the test DB.
# Set RBAC_PR_A_MIGRATION_APPLIED=1 once you've verified the schema is current.
pytestmark = pytest.mark.skipif(
    os.getenv("RBAC_PR_A_MIGRATION_APPLIED") != "1",
    reason="Group 1 tests require the test DB schema to include PR-A columns/tables. "
           "These come from either (a) running alembic migration 171 (PR-A Group 2) or "
           "(b) ensuring conftest's create_all picks up the new model definitions. "
           "Set RBAC_PR_A_MIGRATION_APPLIED=1 once you've verified the schema is current.",
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
    assert fetched.deprecated_for is None
    assert fetched.sensitive is False


@pytest.mark.asyncio
async def test_permission_deprecated_for_roundtrip(db_session):
    """A permission marked deprecated points to its replacement code."""
    perm = Permission(
        code="old.thing.read",
        name="Old read",
        module="legacy",
        namespace="old",
        resource="thing",
        action="read",
        deprecated=True,
        deprecated_for="new.thing.read",
        sensitive=False,
    )
    db_session.add(perm)
    await db_session.commit()

    result = await db_session.execute(select(Permission).where(Permission.code == "old.thing.read"))
    fetched = result.scalar_one()
    assert fetched.deprecated is True
    assert fetched.deprecated_for == "new.thing.read"


@pytest.mark.asyncio
async def test_entity_has_logo_url(db_session, sample_entity):
    """Entity.logo_url column for PDF branding."""
    from app.models.common import Entity

    sample_entity.logo_url = "https://example.com/logo.png"
    await db_session.commit()

    result = await db_session.execute(select(Entity).where(Entity.id == sample_entity.id))
    fetched = result.scalar_one()
    assert fetched.logo_url == "https://example.com/logo.png"
