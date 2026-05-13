"""Test new columns on Permission model (PR-A foundation)."""
import pytest
from sqlalchemy import select
from app.models.common import Permission


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
